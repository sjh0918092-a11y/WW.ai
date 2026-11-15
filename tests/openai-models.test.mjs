import assert from 'node:assert/strict';
import worker from '../relay/worker.js';
import {D1} from './helpers/d1.mjs';
const origin='https://sjh0918092-a11y.github.io',env={DB:new D1(),PASSWORDS:'pass',OPENAI_API_KEY:'secret-openai-key'};
const call=(token='session',pass='pass')=>worker.fetch(new Request('https://relay.test/api/models/openai',{headers:{Origin:origin,Authorization:'Bearer '+token,'X-WW-Pass':pass}}),env);
assert.equal((await call('')).status,401);await env.DB.prepare('INSERT INTO users VALUES (?,?,?,?)').bind('tester','salt','hash',0).run();await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind('session','tester',0).run();
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');assert.equal(opts.method||'GET','GET');assert.equal(opts.headers.Authorization,'Bearer '+env.OPENAI_API_KEY);return Response.json({data:['gpt-6-luna','gpt-6.1-terra','gpt-5.4-mini','gpt-image-2','text-embedding-3-small','gpt-4o-audio-preview','whisper-1','o3','gpt-6-luna'].map(id=>({id}))})};
 assert.equal((await call('','pass')).status,401);assert.equal((await call('session','wrong')).status,403);assert.equal(calls,0);
 let r=await call();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');const data=await r.json();assert.deepEqual(data.models.map(m=>m.id),['gpt-6-luna','gpt-6.1-terra','gpt-5.4-mini','o3']);assert(!JSON.stringify(data).includes(env.OPENAI_API_KEY));assert.equal(calls,1);
 for(const status of [401,403,500]){globalThis.fetch=async()=>new Response(env.OPENAI_API_KEY,{status});r=await call();assert.equal(r.status,status===500?502:status);assert(!(await r.text()).includes(env.OPENAI_API_KEY))}
 env.OPENAI_API_KEY='';assert.equal((await call()).status,503);
 console.log('✓ OpenAI model catalog: session/password protection, text-only filtering, server-secret isolation and sanitized errors; no generation');
}finally{globalThis.fetch=original}
