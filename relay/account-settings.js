import {isOpenAITextModel} from './openai.js';
import {validTaskModels,validPromptOptions} from './ai-settings.js';
import {boundedText} from './providers.js';
const FIELDS=['main','quick','check','mainThink','quickThink','checkThink','preCheck','imageModel','serverJobs','documentPipeline','taskModels','prompt','pass','modelCatalog'];
export function validAccountSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.includes(k)))return false;
 return FIELDS.every(k=>{
  const v=value[k];
  if(k==='taskModels')return v!==undefined&&validTaskModels(v);
  if(k==='prompt')return v!==undefined&&validPromptOptions(v);
  if(k==='modelCatalog')return v===undefined||v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([provider,rows])=>['gemini','claude','openai'].includes(provider)&&Array.isArray(rows)&&rows.length<=500&&rows.every(m=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.keys(m).every(k=>['id','label'].includes(k))&&typeof m.label==='string'&&m.label.length<=150&&typeof m.id==='string'&&(provider==='openai'?isOpenAITextModel(m.id):(provider==='gemini'?/^gemini-[A-Za-z0-9._-]{1,100}$/:/^claude-[A-Za-z0-9._-]{1,100}$/).test(m.id))));
  if(k==='pass')return typeof v==='string'&&v.length<=1024;
  if(['preCheck','serverJobs','documentPipeline'].includes(k))return typeof v==='boolean';
  if(k.endsWith('Think'))return ['','none','minimal','low','medium','high','xhigh','max'].includes(v);
  return typeof v==='string'&&(k==='check'&&v===''||/^[A-Za-z0-9._-]{1,100}$/.test(v))&&!(k==='imageModel'?/tts|live|audio|embedding|transcribe|robotics/i:/image|tts|live|audio|embedding|transcribe|robotics/i).test(v);
 });
}
export async function accountSettings(request,env,uid){
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 const select=()=>env.DB.prepare('SELECT data, revision, updated FROM account_settings WHERE uid = ?').bind(uid);
 const result=row=>({settings:row?JSON.parse(row.data):null,revision:row?.revision||0,updated:row?.updated||0});
 if(request.method==='GET')return json(result(await select().first()));
 if(request.method!=='POST')return json({error:{message:'허용되지 않은 요청입니다.'}},405);
 let body;
 try{if(Number(request.headers.get('Content-Length')||0)>1048576)return json({error:{message:'설정이 너무 큽니다.'}},413);body=JSON.parse(await boundedText(request.body,1048576));}
 catch(e){return json({error:{message:e?.code==='too_large'?'설정이 너무 큽니다.':'설정 JSON을 확인해 주세요.'}},e?.code==='too_large'?413:400)}
 if(!body||Object.keys(body).some(k=>!['settings','initialize'].includes(k))||body.initialize!==undefined&&typeof body.initialize!=='boolean'||!validAccountSettings(body.settings))return json({error:{message:'AI 설정값을 확인해 주세요.'}},400);
 const conflict=body.initialize?'DO NOTHING':'DO UPDATE SET data=excluded.data, revision=account_settings.revision+1, updated=excluded.updated';
 const rows=await env.DB.batch([env.DB.prepare('INSERT INTO account_settings (uid,data,revision,updated) VALUES (?,?,1,?) ON CONFLICT(uid) '+conflict).bind(uid,JSON.stringify(body.settings),Date.now()),select()]);
 return json(result(rows[1].results[0]));
}
