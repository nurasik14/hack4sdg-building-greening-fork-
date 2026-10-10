import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from '../src/domain/greening-plan.js';
import { buildProposal } from '../src/domain/proposals.js';
import { buildNarrationPayload, buildSelectionPayload, createNarrator, requestNarration, requestSelection, validateNarration, validateSelection, MAX_SUMMARY_LENGTH } from '../src/domain/ai-narrator.js';
const plan = PLANS[0];
const proposal = buildProposal({
  region: { id:'r-roof', projectId:'p', modelVersion:'sha256:m', type:'roof', globalId:'g-roof', localId:1, name:'Roof', usableArea:{ value:100, unit:'m2', provenance:'user-confirmed', source:'User confirmed' }, screening:{ status:'conditional', canPrepare:true, reasons:['Upward roof candidate; average slope 12.0°.'], missing:['Structural capacity is unverified.'] } },
  system: plan.profiles.roof, plan, language: 'en'
});

test('narration rejects numeric claims, costs, carbon figures and percentages',()=>{
 for (const bad of ['Plant about 120 m2 of sedum.', 'Costs roughly HKD 250000.', 'Saves 45 kgCO2e each year.', 'Covers 60% of the roof.', 'Adds 12000 kg of load.', 'A 20-year payback.']) {
  assert.throws(()=>validateNarration({ summary: bad, cautions: [] }), /numeric|large number|calculated/i, bad);
 }
 assert.throws(()=>validateNarration({ summary:'Fine.', cautions:['Adds 300 kg per square metre.'] }), /numeric|calculated/i);
});

test('narration rejects approval, certification and structural clearance language',()=>{
 for (const bad of ['This roof is approved for planting.', 'The structure is certified adequate.', 'Compliant with local fire code.', 'Structurally sound and safe to proceed.', 'We guarantee no risk.']) {
  assert.throws(()=>validateNarration({ summary: bad }), /approval|certification|clearance/i, bad);
 }
});

test('narration accepts safe prose and rejects malformed payloads',()=>{
 const clean = validateNarration({ summary:'A low-maintenance sedum blanket suits this shallow roof.', cautions:['Loading and waterproofing still need review.'] });
 assert.equal(clean.summary,'A low-maintenance sedum blanket suits this shallow roof.');
 assert.equal(clean.cautions.length,1);
 assert.throws(()=>validateNarration(null), TypeError);
 assert.throws(()=>validateNarration('text'), TypeError);
 assert.throws(()=>validateNarration({}), TypeError);
 assert.throws(()=>validateNarration({ summary:'   ' }), TypeError);
 assert.throws(()=>validateNarration({ summary:'x'.repeat(MAX_SUMMARY_LENGTH + 1) }), RangeError);
 assert.throws(()=>validateNarration({ summary:'Fine.', cautions:'not an array' }), TypeError);
 assert.throws(()=>validateNarration({ summary:'Fine.', cautions:[1] }), TypeError);
});

test('the payload sent to any AI service carries no quantities',()=>{
 const payload = buildNarrationPayload({ proposal, language:'en' });
 assert.deepEqual(Object.keys(payload).sort(), ['language','reasons','regionType','systemName','unresolvedChecks']);
 const serialised = JSON.stringify(payload);
 assert.ok(!/\d/.test(serialised.replace(/°/g,'')), 'payload must not contain numbers the model could echo');
 assert.ok(!serialised.includes('usableArea'));
 assert.ok(!serialised.includes('globalId'));
});

test('no AI service is configured by default and describe never exposes the key',()=>{
 assert.equal(createNarrator().isConfigured(), false);
 assert.equal(createNarrator({ endpoint:'https://api.example.com/v1/chat/completions', model:'m' }).isConfigured(), false);
 assert.equal(createNarrator({ endpoint:'https://api.example.com/v1/chat/completions', apiKey:'secret' }).isConfigured(), false);
 const narrator = createNarrator({ endpoint:'https://api.example.com/v1/chat/completions', model:'demo-model', apiKey:'secret-key' });
 assert.equal(narrator.isConfigured(), true);
 assert.deepEqual(narrator.describe(), { provider:'api.example.com', model:'demo-model' });
 assert.ok(!JSON.stringify(narrator.describe()).includes('secret-key'));
});

test('requestNarration falls back to rule-based text and never throws',async ()=>{
 assert.equal((await requestNarration({ narrator: null, proposal, language:'en' })).source,'rule-based');
 assert.equal((await requestNarration({ narrator: createNarrator(), proposal })).source,'rule-based');
 assert.equal((await requestNarration({ proposal, language:'zh' })).source,'rule-based');
 const broken = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>{ throw new Error('network down'); } };
 const failed = await requestNarration({ narrator: broken, proposal });
 assert.equal(failed.source,'rule-based');
 assert.equal(failed.generator,null);
 const invalid = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>({ summary:'Covers 80 m2 safely.', cautions:[] }) };
 assert.equal((await requestNarration({ narrator: invalid, proposal })).source,'rule-based');
 const empty = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>({ summary:'', cautions:[] }) };
 assert.equal((await requestNarration({ narrator: empty, proposal })).source,'rule-based');
});

test('the selection payload offers only catalogue system names and no quantities',()=>{
 const types = ['roof','facade','terrace','ground'];
 const payload = buildSelectionPayload({ plan: PLANS[0], types, language:'en', reasonsByType:{ roof:['Upward roof candidate; average slope 12.0°.'] }, checksByType:{ roof:['Structural capacity is unverified.'] } });
 assert.deepEqual(Object.keys(payload).sort(), ['language','planDescription','planId','planName','types']);
 assert.equal(payload.types.length, types.length);
 assert.ok(payload.types.every(entry=>entry.options.length === 2 && entry.options.every(option=>typeof option.systemId==='string' && typeof option.systemName==='string')));
 assert.deepEqual(Object.keys(payload.types[0].options[0]).sort(), ['systemId','systemName'], 'no coverage or description leaks');
 const serialised = JSON.stringify(payload);
 assert.ok(!/\d/.test(serialised), 'payload must not contain numbers the model could echo');
 for (const leak of ['usableArea','globalId','coverageFraction','installationCostHkdM2','kgCO2e','description']) {
  assert.ok(!serialised.includes(leak), `${leak} must never be sent`);
 }
});

test('selection validation only accepts system ids that exist for their type',()=>{
 const types = ['roof','facade'];
 const clean = validateSelection({ choices:{ roof:'intensive', facade:'living-wall' }, rationale:'A deeper roof suits this building.' }, { types });
 assert.deepEqual(clean.choices, { roof:'intensive', facade:'living-wall' });
 // A partial reply is fine; an out-of-catalogue id discards the whole thing.
 assert.deepEqual(validateSelection({ choices:{ roof:'intensive' } }, { types }).choices, { roof:'intensive' });
 assert.throws(()=>validateSelection({ choices:{ roof:'sedum-turf' } }, { types }), /unknown system/i);
 assert.throws(()=>validateSelection({ choices:{ roof:'living-wall' } }, { types }), /unknown system/i, 'a facade system is not a roof system');
 assert.throws(()=>validateSelection({ choices:{ basement:'extensive' } }, { types:['basement'] }), /unknown system/i);
 assert.throws(()=>validateSelection({ choices:{ roof:42 } }, { types }), TypeError);
 assert.throws(()=>validateSelection({ choices:[] }, { types }), TypeError);
 assert.throws(()=>validateSelection({ choices:'intensive' }, { types }), TypeError);
 assert.throws(()=>validateSelection(null, { types }), TypeError);
 assert.throws(()=>validateSelection({}, { types }), TypeError);
 // Rationale is prose and carries the same guards as narration.
 assert.throws(()=>validateSelection({ choices:{ roof:'intensive' }, rationale:'Covers 80% of the roof.' }, { types }), /numeric|calculated/i);
 assert.throws(()=>validateSelection({ choices:{ roof:'intensive' }, rationale:'This is approved and certified.' }, { types }), /approval|certification|clearance/i);
 assert.throws(()=>validateSelection({ choices:{ roof:'intensive' }, rationale: 7 }, { types }), TypeError);
 // Untrusted keys are never read.
 const hostile = JSON.parse('{"choices":{"roof":"intensive","__proto__":{"polluted":true}}}');
 assert.deepEqual(validateSelection(hostile, { types }).choices, { roof:'intensive' });
 assert.equal({}.polluted, undefined);
 assert.deepEqual(validateSelection({ choices:{ roof:'intensive', basement:'anything' } }, { types }).choices, { roof:'intensive' });
});

test('requestSelection leaves the plans on their defaults for every failure',async ()=>{
 const types = ['roof','facade'];
 assert.equal((await requestSelection({ narrator: null, plan: PLANS[0], types })).source,'rule-based');
 assert.equal((await requestSelection({ plan: PLANS[0], types })).choices, null);
 const unconfigured = await requestSelection({ narrator: createNarrator(), plan: PLANS[0], types });
 assert.equal(unconfigured.source,'rule-based');
 assert.equal(unconfigured.choices, null);
 assert.equal((await requestSelection({ narrator: createNarrator(), plan: PLANS[0], types: [] })).choices, null);
 assert.equal((await requestSelection({ narrator: createNarrator(), plan: null, types })).choices, null);
 const broken = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>{ throw new Error('network down'); } };
 assert.equal((await requestSelection({ narrator: broken, plan: PLANS[0], types })).source,'rule-based');
 const invented = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>({ choices:{ roof:'sedum-turf' } }) };
 assert.equal((await requestSelection({ narrator: invented, plan: PLANS[0], types })).choices, null);
 const numeric = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>({ choices:{ roof:'intensive' }, rationale:'Adds 300 kg per square metre.' }) };
 assert.equal((await requestSelection({ narrator: numeric, plan: PLANS[0], types })).choices, null);
 const empty = { isConfigured:()=>true, describe:()=>({provider:'x',model:'y'}), narrate:async()=>({ choices:{} }) };
 assert.equal((await requestSelection({ narrator: empty, plan: PLANS[0], types })).choices, null);
});

test('requestSelection labels a catalogue-only reply as model-generated',async ()=>{
 let seen = null;
 const narrator = {
  isConfigured:()=>true,
  describe:()=>({provider:'api.example.com',model:'demo-model'}),
  narrate:async (payload, options)=>{ seen = { payload, options }; return { choices:{ roof:'intensive', facade:'living-wall' }, rationale:'Deeper planting suits this scheme.' }; }
 };
 const result = await requestSelection({ narrator, plan: PLANS[0], types:['roof','facade'], language:'en' });
 assert.equal(result.source,'model-generated');
 assert.deepEqual(result.choices, { roof:'intensive', facade:'living-wall' });
 assert.equal(result.generator.provider,'api.example.com');
 assert.ok(result.generator.requestedAt);
 assert.match(result.note,/catalogue/);
 assert.ok(seen.options.systemPrompt, 'the selection prompt is passed, not the narration prompt');
 assert.match(seen.options.systemPrompt,/systemId/);
});

test('requestNarration labels a safe model reply as model-generated',async ()=>{
 const narrator = { isConfigured:()=>true, describe:()=>({provider:'api.example.com',model:'demo-model'}), narrate:async()=>({ summary:'A shallow sedum blanket suits this roof.', cautions:['Loading still needs review.'] }) };
 const result = await requestNarration({ narrator, proposal, language:'en' });
 assert.equal(result.source,'model-generated');
 assert.equal(result.generator.provider,'api.example.com');
 assert.equal(result.generator.model,'demo-model');
 assert.ok(result.generator.requestedAt);
 assert.match(result.text,/sedum blanket/);
 assert.match(result.note,/no calculated values/);
});
