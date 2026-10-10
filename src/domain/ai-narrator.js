import { explainProposal, systemOptions } from './proposals.js';
import { REGION_TYPES } from './greening-plan.js';

/**
 * Optional AI narration for workstream C.
 *
 * Rules this module enforces, because the presentation must never let a model invent numbers or
 * imply approval:
 *  1. Nothing is sent except non-numeric proposal context — no IFC data, no areas, no costs.
 *  2. Output is limited to `{ summary, cautions }` and is rejected if it contains a numeric claim
 *     or approval language.
 *  3. Every failure (not configured, timeout, network, HTTP, validation) falls back to the
 *     deterministic rule-based explanation. This function never throws and never blocks the demo.
 *
 * No AI service is configured by default, so the default presentation state has no AI connected.
 */
export const NARRATION_TIMEOUT_MS = 12000;
export const MAX_SUMMARY_LENGTH = 600;

const UNIT_CLAIM = /\d[\d,.]*[\s-]*(m2|m²|m3|kgco2e|kg|hkd|usd|tons?|tonnes?|sqm|square\s+metres?|years?|yr)\b|\d[\d,.]*\s*[$€£%°]/i;
const LARGE_NUMBER = /\d{4,}/;
const APPROVAL_CLAIM = /\b(approved|approval|certified|certification|certify|compliant|compliance|structurally\s+(adequate|sound|safe)|safe\s+to\s+proceed|guaranteed|guarantees|permitted|no\s+risk|fire[-\s]rated|fit\s+for\s+purpose)\b/i;

const SYSTEM_PROMPT = [
  'You explain building-greening concepts to architects. You receive a structured proposal as JSON.',
  'Reply with JSON only: {"summary": string, "cautions": string[]}.',
  'Rules: no numbers, no measurements, no costs, no carbon figures, no percentages.',
  'Never state or imply structural approval, certification, compliance or safety clearance.',
  'Keep the summary under 600 characters. Be explicit that unresolved checks remain.',
  'Write in the language given in the payload.'
].join(' ');

const SELECTION_SYSTEM_PROMPT = [
  'You choose building-greening systems. You receive a plan and, for each region type, the only system ids you are allowed to use.',
  'Reply with JSON only: {"choices": {"<regionType>": "<systemId>"}, "rationale": string}.',
  'Rules: pick one id per region type, and only from that type\'s options. Never invent or alter an id.',
  'No numbers, no measurements, no costs, no carbon figures, no percentages anywhere.',
  'Never state or imply structural approval, certification, compliance or safety clearance.',
  'Keep the rationale short and mention that unresolved checks still need review.',
  'Write in the language given in the payload.'
].join(' ');

const RULE_BASED_SELECTION_NOTE = 'Plan defaults: each region type uses the system declared by the built-in plan definitions. No AI model was used.';
const SELECTION_NOTE = 'Systems selected by an external AI model from the built-in catalogue only. Coverage, cost and carbon remain rule-based; this carries no approval, certification or engineering clearance.';

/** Keys that must never be read off untrusted JSON, however it was parsed. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const safeKeys = (value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value).filter((key) => !UNSAFE_KEYS.has(key))
  : []);

/** Shared prose guard: no numeric claim, no large number, no approval language. */
export function assertSafeProse(text, max = MAX_SUMMARY_LENGTH) {
  if (typeof text !== 'string') throw new TypeError('AI text must be a string');
  if (text.length > max) throw new RangeError(`AI text exceeds ${max} characters`);
  if (UNIT_CLAIM.test(text)) throw new Error('AI text contained a numeric measurement, cost or carbon claim');
  if (LARGE_NUMBER.test(text)) throw new Error('AI text contained a large number that could be read as a calculated value');
  if (APPROVAL_CLAIM.test(text)) throw new Error('AI text implied approval, certification or structural clearance');
  return text.trim();
}

/** Screening reasons quote measured geometry; drop the figures so no number can be echoed back. */
const stripNumbers = (text) => String(text ?? '')
  .replace(/\d+(?:[.,]\d+)?\s*(?:°|%|[a-zA-Z/²³]+)?/g, 'an unspecified measured value')
  .replace(/\s+/g, ' ')
  .trim();

/** The only context sent to an AI service: text, never quantities. */
export function buildNarrationPayload({ proposal, language = 'en' }) {
  return {
    language,
    regionType: proposal.typeLabel ?? proposal.type,
    systemName: proposal.systemName,
    reasons: (proposal.reasons ?? []).map(stripNumbers).filter(Boolean),
    unresolvedChecks: (proposal.unresolvedChecks ?? []).map(stripNumbers).filter(Boolean)
  };
}

/** Throws unless the model reply is a safe, non-numeric, non-approving narration. */
export function validateNarration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('AI narration must be a JSON object');
  const { summary, cautions } = value;
  if (typeof summary !== 'string' || !summary.trim()) throw new TypeError('AI narration needs a non-empty summary string');
  if (summary.length > MAX_SUMMARY_LENGTH) throw new RangeError(`AI narration summary exceeds ${MAX_SUMMARY_LENGTH} characters`);
  if (cautions !== undefined && !Array.isArray(cautions)) throw new TypeError('AI cautions must be an array');
  const list = (cautions ?? []).map((entry) => {
    if (typeof entry !== 'string') throw new TypeError('Each AI caution must be a string');
    return entry;
  });
  return {
    summary: assertSafeProse(summary, MAX_SUMMARY_LENGTH),
    cautions: list.map((entry) => assertSafeProse(entry, MAX_SUMMARY_LENGTH)).filter(Boolean)
  };
}

/** Reads the first balanced JSON object out of a model reply. */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI reply contained no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

const hostOf = (endpoint) => {
  try { return new URL(endpoint).host || endpoint; } catch { return endpoint; }
};

/**
 * Provider-agnostic adapter for any OpenAI-compatible chat-completions endpoint.
 * The key is held in memory only: it is never persisted to the repository, exported, or logged.
 */
export function createNarrator({ endpoint, model, apiKey, timeoutMs = NARRATION_TIMEOUT_MS } = {}) {
  const config = {
    endpoint: typeof endpoint === 'string' ? endpoint.trim() : '',
    model: typeof model === 'string' ? model.trim() : '',
    apiKey: typeof apiKey === 'string' ? apiKey : ''
  };
  const ready = Boolean(config.endpoint && config.model && config.apiKey);
  return {
    isConfigured: () => ready,
    describe: () => ({ provider: hostOf(config.endpoint), model: config.model }),
    async narrate(payload, { systemPrompt = SYSTEM_PROMPT } = {}) {
      if (!ready) throw new Error('No AI service is configured');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model: config.model,
            temperature: .2,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: JSON.stringify(payload) }
            ]
          }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`AI service returned HTTP ${response.status}`);
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('AI service returned no text content');
        return validateNarration(extractJson(content));
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

/**
 * Single safe entry point used by the interface. Always resolves to an explanation object with a
 * `source` of either 'rule-based' or 'model-generated'.
 */
export async function requestNarration({ narrator, proposal, language = 'en' } = {}) {
  const ruleBased = explainProposal({ proposal, language });
  if (!narrator?.isConfigured?.()) return ruleBased;
  try {
    // Validate here as well: a narrator is untrusted input, not a guarantee.
    const result = validateNarration(await narrator.narrate(buildNarrationPayload({ proposal, language })));
    const text = [result.summary, ...result.cautions].join(' ').trim();
    if (!text) return ruleBased;
    return {
      text,
      source: 'model-generated',
      generator: { ...narrator.describe(), requestedAt: new Date().toISOString() },
      note: 'Generated by an external AI model from the structured proposal text only. It contains no calculated values and carries no approval, certification or engineering clearance.'
    };
  } catch {
    return ruleBased;
  }
}

/**
 * The only context sent when asking a model to choose systems: plan identity, the allowed system ids
 * per region type, and figure-free screening text. No areas, no GlobalIds, no coverage, no factors,
 * and never a system description — the roof descriptions quote a percentage.
 */
export function buildSelectionPayload({ plan, types = [], language = 'en', reasonsByType = {}, checksByType = {} } = {}) {
  return {
    language,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    planDescription: plan?.description ?? null,
    types: (Array.isArray(types) ? types : []).map((type) => ({
      type,
      typeLabel: REGION_TYPES[type] ?? type,
      options: systemOptions(type).map(({ systemId, systemName }) => ({ systemId, systemName })),
      reasons: (reasonsByType[type] ?? []).map(stripNumbers).filter(Boolean),
      unresolvedChecks: (checksByType[type] ?? []).map(stripNumbers).filter(Boolean)
    }))
  };
}

/**
 * Throws unless the reply only names systems that exist in the built-in catalogue for their type.
 * A single invented id discards the whole reply rather than letting part of it through.
 */
export function validateSelection(value, { types = [] } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('AI selection must be a JSON object');
  const { choices, rationale } = value;
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw new TypeError('AI selection needs a choices object');
  const allowed = new Set(Array.isArray(types) ? types : []);
  const result = {};
  for (const type of safeKeys(choices)) {
    if (!allowed.has(type)) continue;
    const systemId = choices[type];
    if (systemId === undefined) continue;
    if (typeof systemId !== 'string') throw new TypeError(`AI selection for ${type} must be a system id string`);
    if (!systemOptions(type).some((option) => option.systemId === systemId)) {
      throw new Error(`AI selection named an unknown system for ${type}`);
    }
    result[type] = systemId;
  }
  if (rationale !== undefined && typeof rationale !== 'string') throw new TypeError('AI selection rationale must be a string');
  return {
    choices: result,
    rationale: typeof rationale === 'string' ? assertSafeProse(rationale, MAX_SUMMARY_LENGTH) : ''
  };
}

/**
 * Asks the connected model to choose systems for one plan. Returns `choices: null` and
 * `source: 'rule-based'` for every failure, so a bad or absent reply can never change a plan.
 */
export async function requestSelection({ narrator, plan, types = [], language = 'en', reasonsByType = {}, checksByType = {} } = {}) {
  const ruleBased = { choices: null, rationale: '', source: 'rule-based', generator: null, note: RULE_BASED_SELECTION_NOTE };
  if (!narrator?.isConfigured?.() || !plan?.profiles || !Array.isArray(types) || !types.length) return ruleBased;
  try {
    const result = validateSelection(
      await narrator.narrate(buildSelectionPayload({ plan, types, language, reasonsByType, checksByType }), { systemPrompt: SELECTION_SYSTEM_PROMPT }),
      { types }
    );
    if (!Object.keys(result.choices).length) return ruleBased;
    return {
      choices: result.choices,
      rationale: result.rationale,
      source: 'model-generated',
      generator: { ...narrator.describe(), requestedAt: new Date().toISOString() },
      note: SELECTION_NOTE
    };
  } catch {
    return ruleBased;
  }
}
