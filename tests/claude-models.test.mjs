import assert from 'node:assert/strict';
import worker from '../relay/worker.js';
import { D1 } from './helpers/d1.mjs';
const env={DB:new D1(),PASSWORDS:'invitation',ANTHROPIC_API_KEY:'secret-for-test'};
const origin='https://sjh0918092-a11y.github.io';
const call=(query='',token='session',pass='invitation')=>worker.fetch(new Request('https://relay.test/api/models/claude'+query,{headers:{Origin:origin,Authorization:'Bearer '+token,'X-WW-Pass':pass}}),env);
assert.equal((await call('', '')).status,401);
await env.DB.prepare('INSERT INTO users (id, hash, salt, created) VALUES (?, ?, ?, ?)').bind('tester','hash','salt',0).run();
await env.DB.prepare('INSERT INTO sessions (token, uid, created) VALUES (?, ?, ?)').bind('session','tester',0).run();
const original=globalThis.fetch, canonical='claude-sonnet-4-5-20250929';
let calls=[];
try {
 globalThis.fetch=async(url,opts)=>{
  calls.push(url);assert.equal(opts.method||'GET','GET');assert.equal(opts.headers['x-api-key'],env.ANTHROPIC_API_KEY);
  if(url.endsWith('/claude-sonnet-4-5'))return Response.json({id:canonical,display_name:'Sonnet 4.5'});
  if(url.endsWith('/claude-haiku-4-5'))return new Response('private upstream message',{status:404});
  if(url.includes('after_id='))return Response.json({data:[{id:'claude-opus-4-6'},{id:'claude-future-5'}],has_more:false});
  return Response.json({data:[{id:canonical,display_name:'Sonnet 4.5'}],has_more:true,last_id:canonical});
 };
 assert.equal((await call('','','invitation')).status,401);
 assert.equal((await call('','session','wrong')).status,403);
 assert.equal(calls.length,0);
 assert.equal((await call('?selected=claude-invalid%2Fpath')).status,400);
 const res=await call('?selected=claude-sonnet-4-5,claude-haiku-4-5'), body=await res.json();
 assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(body.models.map(m=>m.id),[canonical,'claude-opus-4-6']);
 assert.equal(body.aliases['claude-sonnet-4-5'],canonical);
 assert.deepEqual(body.unavailable,['claude-haiku-4-5']);assert.equal(calls.length,4);
 assert(!JSON.stringify(body).includes(env.ANTHROPIC_API_KEY));
 for(const status of [401,403,500]){
  globalThis.fetch=async()=>new Response('private upstream message '+env.ANTHROPIC_API_KEY,{status});
  const response=await call(),text=await response.text();
  assert.equal(response.status,status===500?502:status);assert(!text.includes('private upstream'));assert(!text.includes(env.ANTHROPIC_API_KEY));
 }
 env.ANTHROPIC_API_KEY='';assert.equal((await call()).status,503);
 console.log('✓ Claude model discovery: session/password protection, pagination, alias resolution, missing models, sanitized errors; GET only');
}finally{globalThis.fetch=original}
