import { PLANS, REGION_TYPES } from './greening-plan.js';

/**
 * Structured greening proposals for workstream C.
 *
 * Pure and deterministic: no DOM, no network, no I/O. This module decides *what to propose* and
 * *why*. It never computes cost or carbon — `calculate.js` owns arithmetic — and it never claims
 * structural suitability; every proposal carries its unresolved checks.
 */
export const PROPOSAL_VERSION = 'proposal-1';

/** Per-type caps for the suggested starting set, mirroring the previous inline viewer limits. */
export const DEFAULT_LIMITS = { roof: 3, facade: 2, terrace: 2 };

const round = (value) => Math.round(value * 1e4) / 1e4;
const clampCoverage = (value, base) => Math.min(base, Math.max(0.05, round(value)));

/** Keys that must never be read off untrusted JSON, however it was parsed. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ownKeys = (value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value).filter((key) => !UNSAFE_KEYS.has(key))
  : []);

/**
 * The greening systems a region type may use, derived from the plans rather than a hardcoded list so
 * a new plan cannot drift away from what this function offers. Profiles are returned by reference:
 * they are shared module state and must never be copied or mutated.
 */
export function systemOptions(type) {
  if (!REGION_TYPES[type]) return [];
  const seen = new Set();
  const options = [];
  for (const plan of PLANS) {
    const profile = plan.profiles?.[type];
    if (!profile?.id || seen.has(profile.id)) continue;
    seen.add(profile.id);
    options.push({ systemId: profile.id, systemName: profile.name, profile });
  }
  return options;
}

/** Resolves an AI system choice to real catalogue profiles. Anything invalid is dropped silently. */
function acceptedSwaps(plan, systemChoices) {
  const swaps = new Map();
  for (const type of ownKeys(systemChoices)) {
    if (!plan.profiles[type]) continue;
    const wanted = systemChoices[type];
    if (typeof wanted !== 'string') continue;
    const option = systemOptions(type).find((entry) => entry.systemId === wanted);
    if (option) swaps.set(type, option.profile);
  }
  return swaps;
}

/** Reads a screening conclusion back out of its human-readable reason text. */
const readSlope = (screening) => {
  const match = [...(screening?.reasons ?? []), ...(screening?.missing ?? [])]
    .join(' ').match(/average slope ([\d.]+)°/i);
  return match ? Number(match[1]) : null;
};
const readHorizontalShare = (screening) => {
  const match = [...(screening?.reasons ?? [])]
    .join(' ').match(/(\d+)% of the display surface is near-horizontal/i);
  return match ? Number(match[1]) / 100 : null;
};

/**
 * Conservative constraint rules. Each applicable rule scales the plan's declared coverage fraction
 * down; nothing here can raise it. Every decision is recorded so the interface can explain
 * "45% instead of 65%".
 */
const CONSTRAINT_RULES = {
  roof: [
    { id: 'roof-slope', factor: .85, applies: ({ slope }) => slope !== null && slope > 10, note: 'Average display slope above 10° reduces the conservative planted fraction.' },
    { id: 'roof-conditional', factor: .95, applies: ({ screening }) => screening?.status === 'conditional', note: 'Unverified exposure, waterproofing and loading reduce the assumed planted fraction.' }
  ],
  facade: [
    { id: 'facade-exterior-unverified', factor: .90, applies: () => true, note: 'Exterior face, window/door clearances, fixings, fire access and irrigation are unconfirmed, so the planted fraction is reduced.' }
  ],
  terrace: [
    { id: 'terrace-exposure-unverified', factor: .90, applies: () => true, note: 'Outdoor exposure, loading, usable boundaries and escape routes are unverified, so the planted fraction is reduced.' }
  ],
  ground: [
    { id: 'ground-land-unverified', factor: .95, applies: () => true, note: 'Available land, ground level, utilities and access are unverified, so the planted fraction is reduced.' }
  ]
};

/**
 * Derives the planted coverage fraction for one region type from its screening evidence.
 * The result never exceeds the plan's declared base fraction.
 */
export function applyConstraints({ type, screening, baseCoverage }) {
  if (!Number.isFinite(baseCoverage) || baseCoverage < 0 || baseCoverage > 1) {
    throw new RangeError('A plan coverage fraction between zero and one is required');
  }
  const context = { screening, slope: readSlope(screening), horizontalShare: readHorizontalShare(screening) };
  const appliedConstraints = [{
    id: 'base-coverage',
    rule: `Plan system declares ${(baseCoverage * 100).toFixed(0)}% of the confirmed usable area as planted.`,
    effect: 'base'
  }];
  let coverageFraction = baseCoverage;
  for (const rule of CONSTRAINT_RULES[type] ?? []) {
    if (!rule.applies(context)) continue;
    coverageFraction *= rule.factor;
    appliedConstraints.push({ id: rule.id, rule: rule.note, effect: `x${rule.factor}` });
  }
  coverageFraction = clampCoverage(coverageFraction, baseCoverage);
  if (appliedConstraints.length === 1) {
    appliedConstraints.push({ id: 'no-further-reduction', rule: 'No geometry-derived constraint reduced this fraction further.', effect: 'none' });
  }
  return { coverageFraction, appliedConstraints };
}

/**
 * True when every plan would end up using the same systems, which collapses the plan comparison into
 * a single scenario. Used to discard a model selection that makes the two plans indistinguishable.
 */
export function selectionsConverge({ plans = PLANS, types = [], choicesByPlan = {} } = {}) {
  const list = Array.isArray(plans) ? plans : [];
  const usable = (Array.isArray(types) ? types : []).filter((type) => list.every((plan) => plan.profiles?.[type]));
  if (usable.length < 1 || list.length < 2) return false;
  return usable.every((type) => {
    const resolved = list.map((plan) => choicesByPlan[plan.id]?.[type] ?? plan.profiles[type].id);
    return resolved.every((id) => id === resolved[0]);
  });
}

/** Builds one structured, exportable proposal for a confirmed region under a given system. */
export function buildProposal({ region, system, plan, language = 'en' }) {
  if (!region?.id || !region?.modelVersion) throw new TypeError('A confirmed region with identity is required');
  if (!system?.id) throw new TypeError('A greening system is required');
  const type = region.type;
  if (!REGION_TYPES[type]) throw new TypeError('Unsupported region type');
  const screening = region.screening ?? { status: 'unknown', reasons: [], missing: [] };
  const { coverageFraction, appliedConstraints } = applyConstraints({ type, screening, baseCoverage: system.coverageFraction });
  const unresolvedChecks = [...new Set([...(screening.missing ?? []), ...(system.checks ?? [])])];
  const proposal = {
    proposalId: `${region.modelVersion}:proposal:${plan?.id ?? 'system'}:${region.id}`,
    proposalVersion: PROPOSAL_VERSION,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    regionId: region.id,
    projectId: region.projectId ?? null,
    modelVersion: region.modelVersion,
    globalId: region.globalId ?? null,
    localId: region.localId ?? null,
    type,
    typeLabel: REGION_TYPES[type],
    systemId: system.id,
    systemName: system.name,
    coverageFraction,
    baseCoverageFraction: system.coverageFraction,
    appliedConstraints,
    reasons: [...(screening.reasons ?? [])],
    unresolvedChecks,
    status: screening.status ?? 'unknown',
    geometrySource: region.geometrySource ?? null,
    usableArea: region.usableArea ?? null
  };
  proposal.explanation = explainProposal({ proposal, language });
  return proposal;
}

const TYPE_LABELS_ZH = { roof: '屋頂', facade: '立面', terrace: '露台', ground: '庭院' };

/**
 * Deterministic rule-based explanation. Always discloses its source; an AI narration may replace
 * `text` later but is re-labelled `model-generated` by `ai-narrator.js`.
 */
export function explainProposal({ proposal, language = 'en' }) {
  const zh = language === 'zh';
  const label = zh ? TYPE_LABELS_ZH[proposal.type] ?? proposal.typeLabel : proposal.typeLabel;
  const percent = (proposal.coverageFraction * 100).toFixed(0);
  const basePercent = (proposal.baseCoverageFraction * 100).toFixed(0);
  const reduced = proposal.coverageFraction < proposal.baseCoverageFraction;
  const constraint = (proposal.appliedConstraints ?? []).find((entry) => entry.effect !== 'base' && entry.effect !== 'none');
  const checks = proposal.unresolvedChecks?.length ?? 0;
  const firstReason = proposal.reasons?.[0] ?? '';
  const text = zh
    ? `${label}：建議採用「${proposal.systemName}」，在已確認可用面積上種植 ${percent}%（系統基準 ${basePercent}%）。${constraint ? `已應用限制：${constraint.rule} ` : ''}${firstReason} 尚有 ${checks} 項未決專業檢查。成本與碳排數字請以 Compare 的計算結果為準；本說明不包含任何審批結論。`
    : `${label}: proposes ${proposal.systemName} across ${percent}% of the confirmed usable area (system base ${basePercent}%${reduced ? ', reduced by screening constraints' : ''}). ${constraint ? `Applied constraint: ${constraint.rule} ` : ''}${firstReason} ${checks} unresolved professional check(s) remain. Costs and carbon come from the calculation in Compare; this explanation contains no approval or certification.`;
  return {
    text: text.trim(),
    source: 'rule-based',
    generator: null,
    note: 'Deterministic screening and constraint rules; no AI model produced this text.'
  };
}

/**
 * Ranks candidate locations into a suggested starting set.
 * Preserves the previous viewer behaviour: a component already recommended as a terrace is not also
 * recommended as a roof, already-assigned components are skipped, and per-type caps apply.
 */
export function rankProposals(candidates, { limits = DEFAULT_LIMITS, assignedGlobalIds = [], requested = null } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const assigned = new Set((Array.isArray(assignedGlobalIds) ? assignedGlobalIds : []).filter(Boolean));
  const countsByType = {};
  const chosen = [];
  const seen = new Set();
  const terraceIds = new Set(list.filter((item) => item.type === 'terrace').map((item) => item.globalId));
  for (const candidate of list) {
    if (!candidate?.globalId || !candidate?.type) continue;
    if (seen.has(candidate.globalId)) continue;
    // A component screened as an explicit terrace must not also be offered as a roof.
    if (candidate.type === 'roof' && terraceIds.has(candidate.globalId)) continue;
    if (requested && !requested.includes(candidate.type)) continue;
    if (assigned.has(candidate.globalId)) continue;
    if ((countsByType[candidate.type] ?? 0) >= (limits[candidate.type] ?? 0)) continue;
    seen.add(candidate.globalId);
    countsByType[candidate.type] = (countsByType[candidate.type] ?? 0) + 1;
    chosen.push({ globalId: candidate.globalId, type: candidate.type });
  }
  return chosen;
}

/**
 * Returns a copy of `plan` whose per-type coverage fractions reflect the confirmed regions.
 * Shaping is per region type (taking the most constrained region of each type), because the viewer
 * overlay and the calculation both read `plan.profiles[type]` — keeping them fed from one object
 * guarantees the displayed coverage equals the calculated coverage. Never mutates the input.
 *
 * `systemChoices` is an optional `{ [type]: systemId }` map from an AI service. A choice is honoured
 * only when the id matches a real catalogue entry for that type, so a bad reply can never introduce
 * an unknown system. Coverage, cost and carbon remain rule-derived either way.
 */
export function adjustPlan(plan, regions = [], systemChoices = null) {
  if (!plan?.profiles) return plan;
  const list = Array.isArray(regions) ? regions : [];
  const swaps = acceptedSwaps(plan, systemChoices);
  const base = swaps.size ? { ...plan.profiles } : plan.profiles;
  for (const [type, profile] of swaps) base[type] = profile;
  const byType = new Map();
  for (const region of list) {
    if (!region?.type || !base[region.type]) continue;
    const { coverageFraction, appliedConstraints } = applyConstraints({
      type: region.type,
      screening: region.screening,
      baseCoverage: base[region.type].coverageFraction
    });
    const current = byType.get(region.type);
    if (!current || coverageFraction < current.coverageFraction) byType.set(region.type, { coverageFraction, appliedConstraints });
  }
  if (!byType.size && !swaps.size) return plan;
  const profiles = { ...base };
  const appliedConstraints = {};
  for (const [type, value] of byType) {
    profiles[type] = { ...base[type], coverageFraction: value.coverageFraction };
    appliedConstraints[type] = value.appliedConstraints;
  }
  const systemSelection = {};
  for (const [type, profile] of swaps) {
    systemSelection[type] = {
      systemId: profile.id,
      systemName: profile.name,
      defaultSystemId: plan.profiles[type].id,
      changed: profile !== plan.profiles[type]
    };
  }
  return { ...plan, profiles, appliedConstraints, systemSelection };
}

/** Builds proposals for every confirmed region under every plan. */
export function buildPlanProposals({ regions, plans, language = 'en' }) {
  const proposals = [];
  for (const plan of plans ?? []) {
    for (const region of regions ?? []) {
      const system = plan.profiles?.[region.type];
      if (!system) continue;
      proposals.push(buildProposal({ region, system, plan, language }));
    }
  }
  return proposals;
}

/** Deduplicated unresolved checks across proposals, for export and display. */
export function collectUnresolvedChecks(proposals) {
  return [...new Set((proposals ?? []).flatMap((proposal) => proposal.unresolvedChecks ?? []))];
}
