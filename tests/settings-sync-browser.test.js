const assert=require('node:assert/strict'),{chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{
 const {default:worker}=await import('../relay/worker.js'),{D1}=await import('./helpers/d1.mjs');
 const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+server.address().port,env={DB:new D1(),ALLOWED_ORIGINS:root,PASSWORDS:'test-invite'};
 await worker.fetch(new Request('https://relay.test/api/settings',{headers:{Origin:root}}),env);
 for(const id of ['alice','bob']){const r=await worker.fetch(new Request('https://relay.test/api/signup',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({id,pw:'secret1',invite:'test-invite'})}),env);assert.equal(r.status,200)}
 for(const [token,uid]of [['a1','alice'],['a2','alice'],['b','bob']])await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(token,uid,0).run();
 const saved=uid=>{const r=env.DB.sqlite.prepare('SELECT data FROM account_settings WHERE uid=?').get(uid);return r?JSON.parse(r.data):null};
 const browser=await chromium.launch();let blockPost=false,holdToken='',holdPostToken='',release=null,held=null,seenHold;
 try{
  async function device(token,main){let modelRequests=0;const c=await browser.newContext();await c.addInitScript(({token,main})=>{if(!localStorage.getItem('wwiki:acct'))localStorage.setItem('wwiki:acct',JSON.stringify({id:'alice',token,since:0}));if(!localStorage.getItem('wwiki:gemini'))localStorage.setItem('wwiki:gemini',JSON.stringify({relay:'https://relay.test',pass:'relay-pass',main,mainThink:'high',check:'claude-sonnet-4-6'}))},{token,main});
   await c.route('https://fonts.googleapis.com/**',r=>r.abort());await c.route('https://fonts.gstatic.com/**',r=>r.abort());
   await c.route('**/v1beta/models?*',route=>{modelRequests++;return route.fulfill({json:{models:[]}})});
   await c.route('**/api/**',async route=>{if(route.request().url().includes('/models/claude'))modelRequests++;const req=route.request(),method=req.method(),headers={...req.headers(),origin:root};
    if(req.url().endsWith('/settings')&&method==='POST'&&blockPost&&headers.authorization==='Bearer a2')return route.fulfill({status:503,json:{error:{message:'offline for test'}}});
    const response=await worker.fetch(new Request(req.url(),{method,headers,...(!['GET','HEAD'].includes(method)?{body:req.postData()}: {})}),env),body=await response.text();
    if(req.url().endsWith('/settings')&&(method==='GET'&&headers.authorization==='Bearer '+holdToken||method==='POST'&&headers.authorization==='Bearer '+holdPostToken)){holdToken='';holdPostToken='';await new Promise(resolve=>{release=resolve;seenHold?.()})}
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
   });const p=await c.newPage();await p.goto(root);await p.waitForFunction(()=>S.ready&&AISettingsSync.context()&&AISettingsSync.record(AISettingsSync.context()).remote);p.modelRequests=()=>modelRequests;return p;
  }
  const a=await device('a1','gemini-3.8-flash');assert.equal(saved('alice').main,'gemini-3.8-flash');
  await a.evaluate(async()=>{ModelCatalog.remember('gemini',[{id:'gemini-3.8-flash',label:'Gemini 3.8 Flash'},{id:'gemini-2.5-pro',label:'Gemini 2.5 Pro'},{id:'gemini-3.5-flash-lite',label:'Gemini 3.5 Flash Lite'}]);ModelCatalog.remember('claude',[{id:'claude-sonnet-4-6',label:'Sonnet 4.6'}]);await AISettingsSync.flush()});
  const b=await device('a2','gemini-2.5-flash');assert.equal(await b.evaluate(()=>GS.main),'gemini-3.8-flash');assert.equal(await b.evaluate(()=>GS.pass),'relay-pass');assert.equal(b.modelRequests(),0);await b.click('#side [data-act="gset"]');assert.equal(await b.locator('#gTask-prose option[value="gemini-2.5-pro"]').count(),1);assert.equal(b.modelRequests(),0);
  await a.click('#side [data-act="gset"]');await a.evaluate(()=>{document.querySelector('#gTasks').open=true;document.querySelector('#gInputs').open=true});await a.selectOption('#gTask-factSync','gemini-3.5-flash-lite');await a.selectOption('#gTaskThink-factSync','minimal');await a.fill('#gInput-factsCount','7');await a.uncheck('#gInput-seed');await a.click('[data-act="gset-save"]');await a.waitForFunction(()=>!AISettingsSync.record(AISettingsSync.context()).dirty);
  await b.evaluate(()=>window.dispatchEvent(new Event('focus')));await b.waitForFunction(()=>GS.prompt.factsCount===7);assert.equal(await b.evaluate(()=>GS.taskModels.factSync.model),'gemini-3.5-flash-lite');assert.equal(await b.evaluate(()=>GS.prompt.seed),false);
  blockPost=true;await b.evaluate(()=>{GS.prompt.factsCount=9;saveGS()});await b.evaluate(()=>AISettingsSync.flush());await b.reload();await b.waitForFunction(()=>S.ready);assert.equal(await b.evaluate(()=>GS.prompt.factsCount),9);assert.equal(saved('alice').prompt.factsCount,7);
  blockPost=false;await b.evaluate(()=>window.dispatchEvent(new Event('online')));await b.waitForFunction(()=>!AISettingsSync.record(AISettingsSync.context()).dirty);assert.equal(saved('alice').prompt.factsCount,9);
  await b.evaluate(async()=>{Sync.acct={id:'bob',token:'b',since:0};LS.set(AKEY,Sync.acct);await AISettingsSync.load()});assert.equal(saved('bob').prompt.factsCount,40);assert.equal(await b.evaluate(()=>GS.pass),'');assert.equal(saved('alice').prompt.factsCount,9);
  holdToken='b';held=new Promise(resolve=>{seenHold=resolve});await b.evaluate(()=>{window.oldSettings=AISettingsSync.load()});await held;
  await b.evaluate(async()=>{Sync.acct={id:'alice',token:'a2',since:0};LS.set(AKEY,Sync.acct);await AISettingsSync.load()});release();await b.evaluate(()=>window.oldSettings);assert.equal(await b.evaluate(()=>GS.prompt.factsCount),9);assert.equal(await b.evaluate(()=>GS.pass),'relay-pass');
  holdPostToken='a1';held=new Promise(resolve=>{seenHold=resolve});await a.evaluate(()=>{GS.prompt.factsCount=11;saveGS();window.pendingSettings=AISettingsSync.flush()});await held;
  await a.evaluate(()=>{GS.prompt.factsCount=12;saveGS()});release();await a.evaluate(()=>window.pendingSettings);await a.waitForFunction(()=>!AISettingsSync.record(AISettingsSync.context()).dirty);assert.equal(saved('alice').prompt.factsCount,12);assert.equal(await a.evaluate(()=>GS.prompt.factsCount),12);
  await b.evaluate(async()=>{await Sync.logout();await Sync.login('alice','secret1',false)});assert.equal(await b.evaluate(()=>GS.prompt.factsCount),12);assert.equal(await b.evaluate(()=>GS.taskModels.factSync.think),'minimal');
  await b.click('#side [data-act="gset"]');await b.evaluate(()=>Sync.logout());await b.evaluate(()=>renderMain());await b.fill('#acId','alice');await b.fill('#acPw','secret1');assert.equal(await b.evaluate(()=>AISettingsSync.formDirty),false);
  await b.click('[data-act="acct-login"]');await b.waitForFunction(()=>Sync.acct?.id==='alice'&&GS.prompt.factsCount===12);await b.waitForSelector('#gInput-factsCount',{state:'attached'});assert.equal(await b.inputValue('#gInput-factsCount'),'12');
  assert(!JSON.stringify(saved('alice')).includes('a1'));assert(!JSON.stringify(saved('alice')).includes('a2'));assert(!('relay' in saved('alice')));
  console.log('✓ Real Worker + two browser devices: automatic migration/load/save, focus refresh, offline retry across reload, account isolation and stale-response protection; no AI calls');
 }finally{release?.();await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
