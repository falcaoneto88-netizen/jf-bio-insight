import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(resolve('node_modules/.consultation-test-'));
await build({stdin:{contents:"export * from './src/lib/consultations/api'; export * from './src/lib/consultations/mapping'; export * from './src/lib/consultations/workspace'; export { useReportStore, emptyClinicalData } from './src/store/report-store'; export { emptyAnamnesis } from './src/lib/anamnesis/form';",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(dir,'test.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fake-client',setup(b){b.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'client',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const supabase = new Proxy({}, {get: (_,key)=>globalThis.consultationClient[key]});'}));}}]});
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

const consultationId='00000000-0000-4000-8000-000000000021';
const submissionId='00000000-0000-4000-8000-000000000031';
function savedConsultation() {
 return {
  consultation:{id:consultationId,patient_id:'00000000-0000-4000-8000-000000000011',patient_name:'Paciente Teste'},
  draft:{consultation_id:consultationId,version:3,anamnesis_id:null,body_composition:{patientName:'Paciente Teste',age:'45',sex:'masculino',height:'180',weight:'80'},clinical_data:{...api.emptyClinicalData,patientName:'Paciente Teste',age:'45',mainGoal:'alta_performance'}},
  submissions:[{id:submissionId,consultation_id:consultationId,answers:{...answers(),takesMedication:'Sim',medications:'Medicação fictícia'},confirmed_at:'2026-09-15T12:00:00Z'}],reports:[],
 };
}
function installConsultationClient(state) {
 let writes=0;
 globalThis.consultationClient={
  auth:{getSession:async()=>({data:{session:{}},error:null}),getUser:async()=>({data:{user:{id:'admin'}},error:null})},
  rpc:async()=>({data:true,error:null}),
  from:(table)=>{
   const filters={};let update;
   const result=()=>({data:structuredClone(table==='consultations'?state.consultation:table==='consultation_drafts'?state.draft:table==='anamnesis_submissions'?state.submissions:state.reports),error:null});
   const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},order:()=>q,limit:()=>q,single:async()=>result(),then:(resolve)=>resolve(result()),update:(patch)=>{update=patch;return q;},maybeSingle:async()=>{
    assert.equal(table,'consultation_drafts');
    assert.equal(filters.consultation_id,consultationId);
    if(filters.version!==state.draft.version)return {data:null,error:null};
    Object.assign(state.draft,structuredClone(update));writes++;
    return {data:{version:state.draft.version},error:null};
   }};return q;
  },
 };
 return ()=>writes;
}
test('opening a consultation uses received answers once, retains clinical review, and links their origin',async()=>{
 const state=savedConsultation();const count=installConsultationClient(state);
 const originals=structuredClone(state.submissions);
 const [first,concurrent]=await Promise.all([api.prepareConsultation(consultationId),api.prepareConsultation(consultationId)]);
 assert.equal(count(),1);assert.equal(first.draft.version,4);assert.equal(concurrent.draft.version,4);
 assert.equal(first.draft.anamnesis_id,submissionId);
 assert.equal(first.draft.clinical_data.medications,'Medicação fictícia');
 assert.equal(first.draft.clinical_data.currentlyTraining,'sim');
 assert.equal(first.draft.clinical_data.wakeTime,'07:00');
 assert.equal(first.draft.clinical_data.mainGoal,'alta_performance');
 assert.equal(first.draft.clinical_data.age,'45');
 assert.match(first.draft.clinical_data.additionalNotes,/Idade: 35/);
 assert.deepEqual(state.submissions,originals);
 await api.prepareConsultation(consultationId);assert.equal(count(),1);
});
test('automatic import preserves clinician entries and keeps patient answers available for review',()=>{
 const state=savedConsultation();state.draft.clinical_data.medications='Revisado pelo profissional';state.draft.clinical_data.additionalNotes='Nota clínica existente';
 const patch=api.receivedAnamnesisPatch(state);
 assert.equal(patch.clinicalData.medications,'Revisado pelo profissional');
 assert.match(patch.clinicalData.additionalNotes,/Nota clínica existente/);
 assert.match(patch.clinicalData.additionalNotes,/Medicação fictícia/);
 const twice=api.mergeReceivedAnamnesis(state.submissions[0].answers,state.draft.body_composition,patch.clinicalData);
 assert.equal(twice.additionalNotes,patch.clinicalData.additionalNotes);
});
test('automatic import rejects a submission from another consultation or corrupt answers',()=>{
 const state=savedConsultation();state.submissions[0].consultation_id='00000000-0000-4000-8000-000000000099';
 assert.throws(()=>api.receivedAnamnesisPatch(state),/não pertence/);
 state.submissions[0].consultation_id=consultationId;state.submissions[0].answers={};
 assert.throws(()=>api.receivedAnamnesisPatch(state),/inválidas/);
});
test('no submission or an already reviewed version does not cause an automatic write',async()=>{
 const state=savedConsultation();state.submissions=[];const count=installConsultationClient(state);
 await api.prepareConsultation(consultationId);assert.equal(count(),0);
 const linked=savedConsultation();linked.draft.anamnesis_id='00000000-0000-4000-8000-000000000032';
 assert.equal(api.receivedAnamnesisPatch(linked),null);
});
test('advancing from the exam receives an anamnesis submitted after the workspace opened',async()=>{
 const state=savedConsultation();installConsultationClient(state);
 api.useReportStore.setState({consultation:{id:consultationId,patientId:state.consultation.patient_id,patientName:'Paciente Teste',version:3,anamnesisId:null},clinicalData:state.draft.clinical_data});
 await api.saveActiveConsultation({bodyComposition:{...state.draft.body_composition,weight:'82'}});
 assert.equal(state.draft.body_composition.weight,'82');
 assert.equal(api.useReportStore.getState().clinicalData.medications,'Medicação fictícia');
 assert.equal(api.useReportStore.getState().consultation.anamnesisId,submissionId);
 assert.equal(api.useReportStore.getState().consultation.version,4);
});
test('report generation cannot skip a received anamnesis or use a stale draft',async()=>{
 const state=savedConsultation();installConsultationClient(state);
 await assert.rejects(()=>api.assertConsultationReadyForReport(consultationId,3,null),/anamnese recebida/);
 await api.prepareConsultation(consultationId);
 await assert.rejects(()=>api.assertConsultationReadyForReport(consultationId,3,submissionId),/atualizada/);
 await api.assertConsultationReadyForReport(consultationId,4,submissionId);
});
test('a stale workspace cannot overwrite newer clinical changes while importing answers',async()=>{
 const state=savedConsultation();state.draft.version=4;const count=installConsultationClient(state);
 api.useReportStore.setState({consultation:{id:consultationId,patientId:state.consultation.patient_id,patientName:'Paciente Teste',version:3,anamnesisId:null}});
 await assert.rejects(()=>api.saveActiveConsultation({clinicalData:api.emptyClinicalData}),/outra janela/);
 assert.equal(count(),0);
});
test('single-digit hours remain visible in clinical time inputs without changing the original answer',()=>{
 const original={...answers(),trainingTime:'8:00'};
 const result=api.mapAnamnesis(original,null);
 assert.equal(result.trainingTime,'08:00');
 assert.equal(original.trainingTime,'8:00');
 assert.match(result.additionalNotes,/8:00/);
 for(const [input,expected] of [['8:00','08:00'],['08:00','08:00'],['0:05','00:05'],['23:59','23:59'],['',''],['25:00','25:00'],['8:70','8:70'],['de manhã','de manhã']])
  assert.equal(api.normalizeClinicalTime(input),expected);
});
