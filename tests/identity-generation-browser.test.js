const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());await page.route('**/v1beta/**',()=>{throw Error('No paid AI expected')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
 const result=await page.evaluate(async()=>{
  const person='마리옹 카르티에',code='잔 다르크 4세',pk=keyOf(person),ck=keyOf(code),root=keyOf('기지');
  const w={id:'identity-prevention',kind:'world',title:'전략소녀',seed:'전략소녀는 사람이다.',era:'2018년',rules:['전략소녀는 사람이다.'],userCanon:'',timeline:[],relations:[],navboxes:{},events:[],aliases:{},mainKey:root,entities:{[pk]:newEntity(person,'인물','전략소녀'),[ck]:newEntity(code,'물건','전략소녀의 호출부호'),[root]:newEntity('기지','지명','기지')}};
  S.world=w;S.worlds=[w];S.pages={[pk]:{key:pk,title:person,type:'인물',summary:'프랑스의 전략소녀',infobox:[{label:'호출부호',value:code+" (Jeanne d’Arc IV)"}],sections:[{heading:'개요',body:'프랑스의 전략소녀이다.'}],links:[]}};
  S.view={name:'article',key:ck};const before=JSON.stringify({w,p:S.pages});
  const prompt=pagePrompt(w,ck), redirect=redirectBlock(w,ck);let calls=0;
  const rejects=[];
  for(const [kind,output]of [
   ['page',{type:'물건',title:code,infobox:[{label:'복무자',value:person}],sections:[{heading:'개요',body:'별도 기체이다.'}]}],
   ['page',{type:'지명',title:'기지',newEntities:[{title:'Jeanne d’Arc IV',type:'물건',summary:'장비'}]}],
   ['discovery',{title:code,type:'물건',summary:'기체'}],
   ['page',{title:'기지',type:'지명',newEntities:[{title:'새 인물',type:'인물',aliases:['새 호출부호']},{title:'새 호출부호',type:'물건'}]}],
   ['chapterPlan',{newEntities:[{title:code,type:'물건'}]}],
   ['analyze',{facts:[],newEntities:[{title:code,type:'물건'}]}],
   ['factSync',{facts:[],newEntities:[{title:code,type:'물건'}]}],
   ['page',{title:'새 호출명',type:'물건',infobox:[{label:'본명',value:'새 인물'},{label:'호출부호',value:'새 호출명'}]}]
  ]){
   S.sample={json:async()=>{calls++;return output;}};
   try{await callJson(kind,'mock',{recoveryTarget:{wid:w.id,key:ck}});rejects.push('missed');}catch(e){rejects.push(e.code);}
  }
  // 실제 별도 장비·운용자 관계와 명시적으로 구분한 동명이인은 허용한다.
  validateAIIdentity(w,root,{title:'별도 전차',type:'물건',infobox:[{label:'조종사',value:person},{label:'호출부호',value:'새 전차'}]});
  w.entities[ck].notSame=[pk];validateAIIdentity(w,ck,{title:code,type:'물건'});delete w.entities[ck].notSame;
  validateAIIdentity(w,pk,{title:person,type:'인물',infobox:[{label:'호출부호',value:code}]});
  return{rejects,calls,unchanged:JSON.stringify(JSON.parse(before).w.entities)===JSON.stringify(w.entities) && JSON.stringify(JSON.parse(before).p)===JSON.stringify(S.pages),prompt,redirect};
 });
 assert(result.rejects.every(x=>x==='identity_conflict'),JSON.stringify(result.rejects));assert.equal(result.calls,8);assert(result.unchanged,'검증은 기존 문서·항목을 합치거나 변경하지 않는다');
 assert(result.prompt.includes('이전 분류(확정된 신원과 다르면 바로잡을 것)'));assert(result.prompt.includes('별도 물건으로 잘못 분류한 경우 그 오분류를 유지하지 않는다'));
 assert(result.prompt.includes('거대한 신체'));assert(result.redirect.includes('잔 다르크 4세'));assert(result.redirect.includes('Jeanne d’Arc IV'));assert.deepEqual(errors,[]);
 console.log('✓ Reject AI person/callsign equipment splits before saving; real equipment allowed; existing world unchanged; no extra AI');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
