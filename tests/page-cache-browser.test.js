const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{appServer}=require('./helpers/app');
(async()=>{
 const server=appServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.route('https://fonts.**/**',r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>S.ready);
  const report=await page.evaluate(()=>{
   const outputs=[];
   for(const ty of ['인물','사건','지명',''])for(const historical of [false,true]){
    const a=keyOf('대상하나'),b=keyOf('대상둘');
    const w={kind:'world',id:'test',title:'시험세계',seed:'보존해야 할 원안',era:'1900년',rules:['보존해야 할 규칙'],userCanon:'보존해야 할 확정 설정',guide:'사용자 방향 원문',tone:{label:'시험 문체',guide:['통합된 사용자 방향']},historical,timeline:[],relations:[],events:[],navboxes:{},aliases:{},glossary:[],entities:{}};
    for(const [k,title]of [[a,'대상하나'],[b,'대상둘']])w.entities[k]={title,type:ty,summary:'항목 요약',facts:[{t:'항목의 확정 사실',src:'user'}],mentions:[],page:false,box:''};
    S.world=w;S.pages={};
    for(const rewrite of [null,'새로운 방향']){
     const current=pagePrompt(w,a,rewrite);
     const preserved=!current.includes(w.guide) && ['보존해야 할 원안','보존해야 할 규칙','보존해야 할 확정 설정','항목의 확정 사실','통합된 사용자 방향','## 출력','## 작성할 문서: 「대상하나」'].every(x=>current.includes(x));
     outputs.push({ty,historical,rewrite,preserved,prefix:pageWritingRules(w,ty).length,starts:current.startsWith(pageWritingRules(w,ty)),stable:pagePrompt(w,b,rewrite).startsWith(pageWritingRules(w,ty))});
    }
   }
   return outputs;
  });
  for(const r of report){assert(r.preserved,JSON.stringify(r));assert(r.starts&&r.stable);assert(r.prefix>4000)}
  console.log(`✓ ${report.length} prompt variants retain world/target facts and output contract; shared instructions precede changing targets, including rewrites; no AI requests`);
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
