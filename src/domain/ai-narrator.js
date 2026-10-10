import { explainProposal } from './proposals.js';

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
  for (const text of [summary, ...list]) {
    if (UNIT_CLAIM.test(text)) throw new Error('AI narration contained a numeric measurement, cost or carbon claim');
    if (LARGE_NUMBER.test(text)) throw new Error('AI narration contained a large number that could be read as a calculated value');
    if (APPROVAL_CLAIM.test(text)) throw new Error('AI narration implied approval, certification or structural clearance');
  }
  return { summary: summary.trim(), cautions: list.map((entry) => entry.trim()).filter(Boolean) };
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
    async narrate(payload) {
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
              { role: 'system', content: SYSTEM_PROMPT },
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
