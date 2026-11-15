/* 서버 키의 Claude 모델 목록만 조회한다. 생성·키 노출·제공자 원문 반환은 하지 않는다. */
import { boundedText } from './providers.js';
const ID=/^claude-[A-Za-z0-9._-]{1,92}$/;
const supported=id=>/^claude-(?:(?:sonnet|opus)-4-[56]|haiku-4-5)(?:-\d{8})?$/.test(id);
const entry=m=>m&&typeof m.id==='string'&&ID.test(m.id)?{id:m.id,label:typeof m.display_name==='string'?m.display_name.slice(0,100):m.id}:null;
export async function claudeModels(request,env,url,passOk){
 const json=(value,status=200)=>Response.json(value,{status});
 if(!env.PASSWORDS||!await passOk(request.headers.get('X-WW-Pass')||'',env.PASSWORDS))return json({error:{message:'서버 접속 암호를 확인해 주세요.'}},403);
 if(!env.ANTHROPIC_API_KEY)return json({error:{message:'서버에 ANTHROPIC_API_KEY가 등록되지 않았습니다.'}},503);
 const selected=[...new Set((url.searchParams.get('selected')||'').split(',').filter(Boolean))];
 if(selected.length>3||selected.some(id=>!ID.test(id)))return json({error:{message:'Claude 모델 ID를 확인해 주세요.'}},400);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
 const headers={'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'};
 const get=async path=>{const r=await fetch('https://api.anthropic.com/v1/models'+path,{headers,signal:ctl.signal});if(!r.ok){await r.body?.cancel();throw {status:r.status}};try{return JSON.parse(await boundedText(r.body,1024*1024))}catch{throw{status:502}}};
 try{
  const models=new Map();let after='',complete=false;
  for(let i=0;i<10;i++){
   const page=await get('?limit=100'+(after?'&after_id='+encodeURIComponent(after):''));
   if(!Array.isArray(page.data))throw{status:502};
   for(const m of page.data){const value=entry(m);if(value)models.set(value.id,value)}
   if(!page.has_more){complete=true;break}
   if(typeof page.last_id!=='string'||!ID.test(page.last_id)||page.last_id===after)throw{status:502};after=page.last_id;
  }
  if(!complete)throw{status:502};
  const aliases={},unavailable=[];
  for(const id of selected){
   if(models.has(id))continue;
   try{const value=entry(await get('/'+encodeURIComponent(id)));if(!value)throw{status:502};models.set(value.id,value);aliases[id]=value.id}
   catch(e){if(e.status===404)unavailable.push(id);else throw e}
  }
  return json({models:[...models.values()].filter(m=>supported(m.id)),aliases,unavailable,total:models.size});
 }catch(e){
  const status=e.status===401||e.status===403?e.status:502;
  return json({error:{message:status===401||status===403?'Anthropic이 서버 키를 거절했습니다. ANTHROPIC_API_KEY와 계정 권한을 확인해 주세요.':`Claude 모델 목록을 조회하지 못했습니다${e.status?' (HTTP '+e.status+')':''}. 서버의 Anthropic 연결 상태를 확인해 주세요.`}},status);
 }finally{clearTimeout(timer)}
}
