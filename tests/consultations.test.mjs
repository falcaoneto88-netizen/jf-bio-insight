import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(resolve('node_modules/.consultation-test-'));
await build({stdin:{contents:"export * from './src/lib/consultations/api'; export * from './src/lib/consultations/mapping'; export { emptyAnamnesis } from './src/lib/anamnesis/form';",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(dir,'test.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fake-client',setup(b){b.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'client',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const supabase = new Proxy({}, {get: (_,key)=>globalThis.consultationClient[key]});'}));}}]});
const api=await import(pathToFileURL(resolve(dir,'test.mjs')));
after(async()=>{delete globalThis.consultationClient;await rm(dir,{recursive:true,force:true});});
const answers=()=>({...api.emptyAnamnesis(),patientName:'Paciente Teste',age:'35',consultationDate:'2026-09-12',wakeTime:'07:00',sleepTime:'23:00',hasChildren:'Não',hasConditions:'Não',takesMedication:'Não',hasDrugAllergies:'Não sei',hasFoodAllergies:'Não',trains:'Sim',trainingFrequency:'3',trainingType:'Natação',waterLiters:'2,5',drinksAlcohol:'Não',smokes:'Não',sleepQuality:'Bom',takesSupplements:'Não',mainComplaint:'Exemplo fictício',treatmentGoal:'Objetivo fictício'});
test('mapping preserves self-reported answers and measured values without inferring diagnosis or goal',()=>{
 const result=api.mapAnamnesis(answers(),{sex:'feminino',height:'165',weight:'64'});
 assert.equal(result.height,'165');assert.equal(result.currentlyTraining,'sim');assert.equal(result.trainingType,'outro');assert.equal(result.trainingTypeOther,'Natação');assert.equal(result.mainGoal,'');assert.equal(result.diabetes,'');assert.match(result.allergiesIntolerances,/Não sei/);assert.match(result.additionalNotes,/Objetivo fictício/);assert.match(result.additionalNotes,/2,5 litros/);
});
test('corrupt saved answers do not populate clinical fields',()=>{assert.throws(()=>api.mapAnamnesis({patientName:'Only'},null),/inválidas/);});
test('identity differences require review and do not mutate source data',()=>{const bc={patientName:'Outro Paciente',age:'40'};assert.equal(api.identityWarnings(answers(),bc).length,2);assert.equal(bc.patientName,'Outro Paciente');});
test('non-admin cannot list consultations or save drafts',async()=>{
 let queried=false;globalThis.consultationClient={auth:{getSession:async()=>({data:{session:null},error:null})},from:()=>{queried=true;throw Error('unexpected');}};
 await assert.rejects(()=>api.listConsultations());await assert.rejects(()=>api.saveConsultationDraft('00000000-0000-4000-8000-000000000001',0,{}));assert.equal(queried,false);
});
test('missing migration produces actionable error without exposing database internals',()=>{assert.match(api.databaseError({code:'42P01'}).message,/migração/);});
test('invalid consultation identifiers are rejected before query',async()=>{await assert.rejects(()=>api.loadPatientInvitation('not-an-id'));});
test('new patient is asked to sign in without a false expired-session message or a database query',async()=>{
 let queried=false;globalThis.consultationClient={auth:{getSession:async()=>({data:{session:null},error:null})},from:()=>{queried=true;throw Error('unexpected');}};
 await assert.rejects(()=>api.loadPatientInvitation('00000000-0000-4000-8000-000000000021'),/Entre para preencher/);assert.equal(queried,false);
});
test('submission retry returns the existing receipt and rejects conflicting content',async()=>{
 const id='00000000-0000-4000-8000-000000000031', consultationId='00000000-0000-4000-8000-000000000021';
 let savedName='Paciente Teste';let insertCount=0;
 globalThis.consultationClient={auth:{getSession:async()=>({data:{session:{}},error:null}),getUser:async()=>({data:{user:{id:'patient'}},error:null})},from:(table)=>{
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:consultationId},error:null}),single:async()=>({data:{id,confirmed_at:'2026-09-12T12:00:00Z',answers:api.parseSavedAnswers(answers()),confirmed_name:savedName},error:null}),insert:async()=>{insertCount++;return {error:{code:'23505'}};}};return query;
 }};
 const input={id,consultationId,answers:answers(),name:'Paciente Teste',accepted:true};
 const saved=await api.submitAnamnesis(input);assert.equal(saved.id,id);assert.equal(insertCount,1);
 savedName='Outro Nome';await assert.rejects(()=>api.submitAnamnesis(input),/confirmar esta versão/);
});
test('optimistic update reports a conflict instead of silently succeeding',async()=>{
 globalThis.consultationClient={auth:{getSession:async()=>({data:{session:{}},error:null}),getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async()=>({data:true,error:null}),from:()=>{const q={update:()=>q,eq:()=>q,select:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;}};
 await assert.rejects(()=>api.saveConsultationDraft('00000000-0000-4000-8000-000000000021',0,{}),/outra janela/);
});
