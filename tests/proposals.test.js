import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from '../src/domain/greening-plan.js';
import { applyConstraints, buildProposal, buildPlanProposals, explainProposal, rankProposals, adjustPlan, collectUnresolvedChecks, DEFAULT_LIMITS } from '../src/domain/proposals.js';
const plan = PLANS[0];
const screening = (status = 'conditional', reasons = [], missing = ['Structural capacity requires review.']) => ({ status, canPrepare: status !== 'blocked', reasons, missing });
const region = (type, extra = {}) => ({ id: `r-${type}`, projectId: 'p', modelVersion: 'sha256:m', type, globalId: `g-${type}`, localId: 1, name: `${type} component`, geometrySource: 'IFC display triangles', screening: screening(), usableArea: { value: 100, unit: 'm2', provenance: 'user-confirmed', source: 'User confirmed' }, ...extra });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !~ ${expected}`);

test('constraints only ever reduce coverage, stay clamped and always record the base',()=>{
 const base = plan.profiles.roof.coverageFraction;
 const flat = applyConstraints({ type:'roof', screening: screening('conditional',['Upward roof candidate; average slope 2.0°.']), baseCoverage: base });
 assert.ok(flat.coverageFraction < base);
 assert.ok(flat.coverageFraction > 0 && flat.coverageFraction <= base);
 assert.equal(flat.appliedConstraints[0].id,'base-coverage');
 assert.ok(flat.appliedConstraints.some(entry=>entry.id==='roof-conditional'));
 assert.ok(!flat.appliedConstraints.some(entry=>entry.id==='roof-slope'));
 const steep = applyConstraints({ type:'roof', screening: screening('conditional',['Upward roof candidate; average slope 14.2°.']), baseCoverage: base });
 assert.ok(steep.coverageFraction < flat.coverageFraction);
 assert.ok(steep.appliedConstraints.some(entry=>entry.id==='roof-slope'));
 near(steep.coverageFraction, 0.6 * .85 * .95);
 assert.throws(()=>applyConstraints({ type:'roof', screening: screening(), baseCoverage: 2 }), RangeError);
 assert.throws(()=>applyConstraints({ type:'roof', screening: screening(), baseCoverage: NaN }), RangeError);
});

test('every region type carries a recorded constraint decision',()=>{
 for (const type of ['roof','facade','terrace','ground']) {
  const { coverageFraction, appliedConstraints } = applyConstraints({ type, screening: screening(), baseCoverage: plan.profiles[type].coverageFraction });
  assert.ok(coverageFraction > 0 && coverageFraction <= plan.profiles[type].coverageFraction);
  assert.ok(appliedConstraints.length >= 2, `${type} records its decision`);
  assert.ok(appliedConstraints.every(entry=>entry.id && entry.rule && entry.effect));
 }
 near(applyConstraints({ type:'facade', screening: screening(), baseCoverage: .45 }).coverageFraction, .45 * .90);
 near(applyConstraints({ type:'terrace', screening: screening(), baseCoverage: .35 }).coverageFraction, .35 * .90);
 near(applyConstraints({ type:'ground', screening: screening(), baseCoverage: .6 }).coverageFraction, .6 * .95);
});

test('a proposal is structured, traceable and never claims approval',()=>{
 const proposal = buildProposal({ region: region('roof'), system: plan.profiles.roof, plan });
 assert.equal(proposal.proposalVersion,'proposal-1');
 assert.equal(proposal.regionId,'r-roof');
 assert.equal(proposal.globalId,'g-roof');
 assert.equal(proposal.modelVersion,'sha256:m');
 assert.equal(proposal.systemId, plan.profiles.roof.id);
 assert.equal(proposal.typeLabel,'Roof');
 assert.ok(proposal.coverageFraction < proposal.baseCoverageFraction);
 assert.ok(proposal.unresolvedChecks.length > 0);
 assert.ok(proposal.appliedConstraints.length > 0);
 assert.equal(proposal.explanation.source,'rule-based');
 assert.equal(proposal.explanation.generator,null);
 assert.match(proposal.explanation.text, /no approval|不包含任何審批/);
 assert.throws(()=>buildProposal({ region: { id:'x' }, system: plan.profiles.roof, plan }), TypeError);
 assert.throws(()=>buildProposal({ region: region('roof'), system: null, plan }), TypeError);
});

test('explanations are bilingual and deterministic',()=>{
 const proposal = buildProposal({ region: region('terrace'), system: plan.profiles.terrace, plan });
 const en = explainProposal({ proposal, language: 'en' });
 const zh = explainProposal({ proposal, language: 'zh' });
 assert.match(en.text, /Balcony \/ terrace/);
 assert.match(zh.text, /露台/);
 assert.equal(en.source,'rule-based');
 assert.equal(explainProposal({ proposal, language: 'en' }).text, en.text);
});

test('ranking keeps caps, prefers terrace over roof and skips assigned components',()=>{
 const candidates = [
  { globalId:'a', type:'roof' }, { globalId:'b', type:'roof' }, { globalId:'c', type:'roof' }, { globalId:'d', type:'roof' },
  { globalId:'h', type:'roof' },
  { globalId:'e', type:'facade' }, { globalId:'f', type:'facade' }, { globalId:'g', type:'facade' },
  { globalId:'a', type:'terrace' }
 ];
 const ranked = rankProposals(candidates, {});
 const count = (type) => ranked.filter(item=>item.type===type).length;
 assert.equal(count('roof'), DEFAULT_LIMITS.roof);
 assert.equal(count('facade'), DEFAULT_LIMITS.facade);
 assert.equal(count('terrace'), 1);
 // 'a' is an explicit terrace, so it must not also be offered as a roof.
 assert.ok(!ranked.some(item=>item.globalId==='a' && item.type==='roof'));
 assert.ok(ranked.some(item=>item.globalId==='a' && item.type==='terrace'));
 // The roof cap is 3, and 'a' was spent on the terrace, so b/c/d fill it and 'h' is left out.
 assert.deepEqual(ranked.filter(item=>item.type==='roof').map(item=>item.globalId), ['b','c','d']);
 assert.ok(!ranked.some(item=>item.globalId==='h'));
 const skipped = rankProposals(candidates, { assignedGlobalIds:['a','b'] });
 assert.ok(!skipped.some(item=>item.globalId==='a'));
 assert.ok(!skipped.some(item=>item.globalId==='b'));
 const onlyFacade = rankProposals(candidates, { requested:['facade'] });
 assert.ok(onlyFacade.every(item=>item.type==='facade'));
 assert.equal(rankProposals([], {}).length, 0);
 assert.equal(rankProposals(null, {}).length, 0);
});

test('plan adjustment is per region type, conservative and never mutates the source plan',()=>{
 const before = plan.profiles.roof.coverageFraction;
 const adjusted = adjustPlan(plan, [region('roof'), region('facade')]);
 assert.notEqual(adjusted, plan);
 assert.notEqual(adjusted.profiles.roof, plan.profiles.roof);
 assert.ok(adjusted.profiles.roof.coverageFraction < before);
 near(adjusted.profiles.facade.coverageFraction, plan.profiles.facade.coverageFraction * .90);
 assert.ok(adjusted.appliedConstraints.roof.length > 0);
 // Untouched types keep the original profile object; the shared plan is never mutated.
 assert.equal(adjusted.profiles.ground, plan.profiles.ground);
 assert.equal(PLANS[0].profiles.roof.coverageFraction, before);
 assert.equal(adjustPlan(plan, []), plan);
 assert.equal(adjustPlan(plan, null), plan);
 const steep = region('roof', { screening: screening('conditional',['average slope 18.0°.']) });
 const mixed = adjustPlan(plan, [region('roof'), steep]);
 assert.ok(mixed.profiles.roof.coverageFraction <= adjustPlan(plan, [region('roof')]).profiles.roof.coverageFraction);
});

test('plan proposals cover both plans and aggregate unresolved checks',()=>{
 const regions = [region('roof'), region('facade'), region('terrace'), region('ground')];
 const proposals = buildPlanProposals({ regions, plans: PLANS, language: 'en' });
 assert.equal(proposals.length, regions.length * PLANS.length);
 assert.equal(new Set(proposals.map(item=>item.planId)).size, PLANS.length);
 const checks = collectUnresolvedChecks(proposals);
 assert.ok(checks.length > 0);
 assert.equal(checks.length, new Set(checks).size);
 assert.ok(proposals.every(item=>item.explanation.source==='rule-based'));
});
