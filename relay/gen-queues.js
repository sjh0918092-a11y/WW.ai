import {boundedText} from './providers.js';
/* 계정별 문서 작성 대기열. 세계관마다 한 줄이며, 기기의 수정 시각(updated)이 더 최근인 것만 저장한다. */
const MAX=1048576, str=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validGenQueue(b){
 if(!plain(b)||Object.keys(b).some(k=>!['wid','items','run','updated'].includes(k)))return false;
 if(!str(b.wid,200)||!Number.isSafeInteger(b.updated)||b.updated<=0||!Array.isArray(b.items)||b.items.length>500)return false;
 if(!b.items.every(q=>plain(q)&&Object.keys(q).every(k=>['key','title','ent'].includes(k))&&str(q.key,300)&&str(q.title,300)&&(q.ent===undefined||plain(q.ent))))return false;
 return b.run===null||plain(b.run)&&Object.keys(b.run).every(k=>['dev','key','at'].includes(k))&&str(b.run.dev,100)&&typeof b.run.key==='string'&&b.run.key.length<=300&&Number.isSafeInteger(b.run.at);
}
export async function genQueues(request,env,uid,url){
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 const row=r=>{const d=JSON.parse(r.data);return {wid:r.wid,items:d.items,run:d.run,updated:r.updated}};
 if(request.method==='GET'){
  const wid=url.searchParams.get('wid');
  const q=wid?env.DB.prepare('SELECT wid,data,updated FROM gen_queues WHERE uid=? AND wid=?').bind(uid,wid):env.DB.prepare('SELECT wid,data,updated FROM gen_queues WHERE uid=?').bind(uid);
  return json({queues:((await q.all()).results||[]).map(row)});
 }
 if(request.method!=='POST')return json({error:{message:'허용되지 않은 요청입니다.'}},405);
 let body;
 try{if(Number(request.headers.get('Content-Length')||0)>MAX)return json({error:{message:'대기열이 너무 큽니다.'}},413);body=JSON.parse(await boundedText(request.body,MAX));}
 catch(e){return json({error:{message:e?.code==='too_large'?'대기열이 너무 큽니다.':'대기열 JSON을 확인해 주세요.'}},e?.code==='too_large'?413:400)}
 if(!validGenQueue(body))return json({error:{message:'대기열 형식을 확인해 주세요.'}},400);
 const rows=await env.DB.batch([
  env.DB.prepare('INSERT INTO gen_queues (uid,wid,data,updated) VALUES (?,?,?,?) ON CONFLICT(uid,wid) DO UPDATE SET data=excluded.data, updated=excluded.updated WHERE excluded.updated>=gen_queues.updated').bind(uid,body.wid,JSON.stringify({items:body.items,run:body.run}),body.updated),
  env.DB.prepare('SELECT wid,data,updated FROM gen_queues WHERE uid=? AND wid=?').bind(uid,body.wid),
 ]);
 return json({queue:row(rows[1].results[0])});
}
