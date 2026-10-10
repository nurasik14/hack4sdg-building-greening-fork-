import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from '../src/domain/greening-plan.js';
import { buildProposal } from '../src/domain/proposals.js';
import { buildNarrationPayload, createNarrator, requestNarration, validateNarration, MAX_SUMMARY_LENGTH } from '../src/domain/ai-narrator.js';
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
