import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {isOpenAITextModel,openAILevels,openAIThinking,normalizeOpenAI,openAIRequest} from '../relay/openai.js';
import {runProvider,validateJob,serverKeyName,usageCounts} from '../relay/providers.js';
import {AiJobs} from '../relay/jobs.js';
import {JobStorage,jobRequest,fireAlarm} from './helpers/jobs.mjs';
const env={OPENAI_API_KEY:'server-openai-secret',GEMINI_KEY:'separate-gemini-secret',PASSWORDS:'pass'};
const input={contents:[{role:'user',parts:[{text:'Return JSON'}]},{role:'model',parts:[{text:'{"previous":true}'}]},{role:'user',parts:[{text:'Continue'}]}],generationConfig:{responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'high'}},systemInstruction:{parts:[{text:'System rules'}]}};
const body={id:'openai-text-job-0001',type:'openai.generate',model:'gpt-6.1-terra',input};
const response=()=>({model:body.model,status:'completed',output:[{type:'reasoning',summary:[{text:'private reasoning'}]},{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],usage:{input_tokens:1000,output_tokens:120,input_tokens_details:{cached_tokens:200,cache_write_tokens:300,cache_write_tokens_details:{ttl_30m_tokens:200,ttl_12h_tokens:100}},output_tokens_details:{reasoning_tokens:100}}});
assert.equal(validateJob(body),null);assert(validateJob({...body,type:'gemini.generate'}));assert(validateJob({...body,model:'gpt-image-1'}));assert(validateJob({...body,credential:{type:'personal',key:'personal-secret'}}));assert.equal(serverKeyName('gemini.generate',body.model),'OPENAI_API_KEY');
for(const m of ['gpt-6-luna','gpt-6.1-sol','gpt-6-astra','gpt-5.5','gpt-5.4-mini','gpt-4.1','gpt-4o','o3'])assert(isOpenAITextModel(m));
for(const m of ['gpt-image-2','text-embedding-3-small','gpt-4o-audio-preview','gpt-realtime-2','whisper-1','gpt-3.5-turbo','gpt-4-turbo'])assert(!isOpenAITextModel(m));
const ctx={};vm.createContext(ctx);vm.runInContext(readFileSync('js/ai-settings.js','utf8')+';globalThis.subject={openAIThinkingLevels,isOpenAITextModel};',ctx);
for(const m of ['gpt-6-astra','gpt-6.1-sol','gpt-6.1-terra','gpt-6-luna','gpt-5','gpt-5-pro','gpt-5.4-mini','gpt-5.4-pro','gpt-4.1','o3'])assert.deepEqual([...ctx.subject.openAIThinkingLevels(m)],openAILevels(m));
assert.deepEqual(openAIThinking('gpt-6-astra','minimal'),{reasoning:{effort:'low'}});assert.deepEqual(openAIThinking('gpt-6.1-terra','none'),{reasoning:{effort:'none'}});assert.throws(()=>openAIThinking('gpt-6-astra','none'));assert.throws(()=>openAIThinking('gpt-4.1','high'));assert.deepEqual(openAIThinking('gpt-4.1',''),{});
const original=globalThis.fetch;let calls=[];
try{
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return Response.json(response())};
 const storage=new JobStorage(),obj=new AiJobs({storage},env);assert.equal((await jobRequest(obj,'',body)).status,202);await fireAlarm(obj);const done=(await jobRequest(obj,body.id)).json;
 assert.equal(done.job.status,'succeeded');const out=done.result;assert.equal(out.candidates[0].content.parts[0].text,'{"ok":true}');assert.equal(out.usageMetadata.promptTokenCount,1000);assert.equal(out.usageMetadata.candidatesTokenCount,20);assert.equal(out.usageMetadata.thoughtsTokenCount,100);assert.equal(out.usageMetadata.cacheCreation12hInputTokenCount,100);assert(!JSON.stringify(done).includes('private reasoning'));assert(!JSON.stringify([...storage.data]).includes(env.OPENAI_API_KEY));
 const req=JSON.parse(calls[0].opts.body);assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(calls[0].opts.headers.Authorization,'Bearer '+env.OPENAI_API_KEY);assert.equal(req.store,false);assert.deepEqual(req.reasoning,{effort:'high'});assert.equal(req.input[1].role,'assistant');assert.equal(req.text.format.type,'json_object');assert(req.instructions.includes('System rules'));assert(!req.tools);
 await runProvider({keyMode:'relay',input:{...body,type:'gemini.generate'}},env);assert.equal(calls.at(-1).url,'https://api.openai.com/v1/responses');
 await assert.rejects(runProvider({keyMode:'personal',input:body},env,'personal-secret'));assert.equal(calls.length,2);
 const partial=normalizeOpenAI({...response(),status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});assert.equal(partial.candidates[0].finishReason,'MAX_TOKENS');
 const refusal=normalizeOpenAI({...response(),output:[{type:'message',content:[{type:'refusal',refusal:'private detail'}]}]});assert.equal(refusal.promptFeedback.blockReason,'REFUSED');assert(!JSON.stringify(refusal).includes('private detail'));
 assert.equal(usageCounts(normalizeOpenAI({...response(),usage:{input_tokens:4,output_tokens:2}}).usageMetadata).complete,false);
 globalThis.fetch=async()=>Response.json({error:{message:env.OPENAI_API_KEY}},{status:404});await assert.rejects(runProvider({keyMode:'relay',input:body},env),e=>e.code==='model_not_found'&&e.model===body.model&&!JSON.stringify(e).includes(env.OPENAI_API_KEY));
 { const split=(first,rest)=>openAIRequest('gpt-5.2',{contents:[{role:'user',parts:[{text:first},{text:rest}]}]});
   const a=split('공통 지침','문서 A'),b=split('공통 지침','문서 B'),c=split('다른 지침','문서 A');
   assert.equal(a.input[0].content,'공통 지침문서 A');assert(a.prompt_cache_key&&a.prompt_cache_key===b.prompt_cache_key&&a.prompt_cache_key!==c.prompt_cache_key);
   assert(!JSON.stringify(a.prompt_cache_key).includes('공통'));assert.equal(openAIRequest('gpt-5.2',{contents:[{role:'user',parts:[{text:'하나'}]}]}).prompt_cache_key,undefined); }
 console.log('✓ OpenAI Responses queue/pipeline routing, thinking compatibility, JSON, refusal/limits, cache and reasoning accounting, server-key isolation; mocked API only');
}finally{globalThis.fetch=original}
