const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const cut=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);assert(i>=0&&j>i,'구간을 찾지 못함: '+a);return html.slice(i,j);};
const stripMarks=s=>String(s||'').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,a,b)=>b||a).replace(/\*\*|~~/g,'').trim();
const c={S:{pages:{}},stripMarks,norm:s=>String(s||'').replace(/\s+/g,' ').trim(),yearNum:s=>parseInt(s,10),console:{warn(){}}};
c.namesOf=t=>{const m=String(t).match(/^(.+?)\((.+)\)$/);return [t,...(m?[m[1].trim(),m[2].trim()]:[])].filter(x=>x.length>=2);};
/* 성이나 이름 한 토막이 한 인물에게만 있으면 그 인물의 이름으로 본다 */
c.nameOwner=(w,t)=>{const ks=Object.keys(w.entities).filter(k=>w.entities[k].title.split(/[\s·]+/).includes(t));return ks.length===1?ks[0]:null;};
c.live=x=>!x.sup;c.factLine=f=>f.t;c.chOf=()=>0;
vm.createContext(c);
vm.runInContext(cut('/* ---------- 인용 대조','/* 두 검사(설정 대조')+'\n'+cut('const refOK =','/* ---------- 스토리 모드: 상태')+`
Object.assign(globalThis,{numericIssues,numFacts,spanFacts,ageRules,ageRuleIssues,autoFixList,routeAutoConflicts,refreshNumeric,entityBrief,NUMERIC_VERSION});`,c);
let n=0;const test=(name,fn)=>{fn();console.log(`  ✓ ${++n}. ${name}`);};
const R4='전략체의 발현과 군사적 최전성기는 14세부터 19세 사이의 사춘기에 국한되며, 성인이 되는 20세를 기점으로 능력과 체격이 서서히 통상 인간으로 축소·퇴역한다.';
const page=(title,type,o={})=>({title,type,summary:o.summary||'',categories:o.categories||[],infobox:o.infobox||[],sections:o.body?[{heading:'개요',body:o.body}]:[],links:[],createdAt:o.createdAt||1,...(o.editedAt?{editedAt:o.editedAt}:{})});
/* pages: {키: 문서}. 세계관 항목은 문서에서 만든다 */
const world=(pages,rules=[R4],extra={})=>{c.S.pages=pages;const entities={};for(const [k,p] of Object.entries(pages))entities[k]={title:p.title,type:p.type,facts:[],mentions:[]};Object.assign(entities,extra);return {era:'2016년',rules,entities};};
const box=o=>Object.entries(o).map(([label,value])=>({label,value}));

test('해결할 수 없는 나이 규칙 충돌은 먼저 쓴 문서로 넘기고 자동 수정에서 뺀다',()=>{
  const viet=page('베트남 전쟁','사건',{createdAt:1,body:'[[컬럼비아 3호]]는 1965년 다낭에 상륙했다. 정글 백병전에서 관절 파쇄와 심각한 척추 손상을 입은 [[컬럼비아 3호]]는 1973년 신체 축소를 마치고 통상 체구로 복귀했다.'});
  const col=page('컬럼비아 3호','인물',{createdAt:2,summary:'미국의 3세대 전략체',infobox:box({'출생년도':'1953년','현역 기간':'1965년 ~ 1973년','성별':'여성'})});
  const w=world({viet,col});
  const is=c.ageRuleIssues(w,'col');
  assert.equal(is.length,1);assert.equal(is[0].target,'viet');assert.equal(is[0].severity,'low');assert.equal(is[0].by,'num');
  assert(is[0].conflict.includes('· 나이 규칙:'));assert(is[0].targetOld.includes('1965년'));
  assert.equal(c.autoFixList(is,'col').length,0);
  assert.equal(c.autoFixList([{...is[0],severity:'high'}],'col').length,0,'고칠 대상이 다른 문서인 다듬을 곳도 자동 수정에 보내지 않는다');
  assert.deepEqual(c.routeAutoConflicts(w,'col',is),['viet']);
  assert.equal(viet.autoConflicts.length,1);assert.equal(viet.autoConflicts[0].by,'col');assert.equal(viet.autoConflicts[0].byTitle,'컬럼비아 3호');
  c.routeAutoConflicts(w,'col',is);assert.equal(viet.autoConflicts.length,1,'같은 (by, old)는 한 번만 단다');
  assert.deepEqual(c.routeAutoConflicts(w,'col',[]),['viet']);assert.equal(viet.autoConflicts.length,0,'다시 검사해 나오지 않으면 지운다');
});
test('현재 문서의 출생 연도만 고치면 되면 구체적인 범위로 다듬을 곳을 낸다',()=>{
  const w=world({p:page('컬럼비아 3호','인물',{summary:'미국의 전략체',infobox:box({'출생':'1950년','현역 기간':'1968년 ~ 1973년'})})});
  const is=c.ageRuleIssues(w,'p');
  assert.equal(is.length,1);assert.equal(is[0].severity,'high');assert(is[0].conflict.includes('1952~1954'));assert(!is[0].target);assert(is[0].claim.startsWith('출생'));
});
test('출생과 현역 기간이 나이 규칙에 맞으면 지적하지 않는다',()=>{
  const w=world({p:page('컬럼비아 3호','인물',{summary:'미국의 전략체',infobox:box({'출생':'1953년','현역 기간':'1968년 ~ 1973년'})})});
  assert.equal(c.ageRuleIssues(w,'p').length,0);
});
test('규칙의 주체가 아닌 인물(일반 군인의 복무 기간)에는 적용하지 않는다',()=>{
  const w=world({p:page('갑 장군','인물',{summary:'미국 육군의 장군',infobox:box({'출생':'1914년','복무 기간':'1936년 ~ 1972년'})})});
  assert.equal(c.ageRuleIssues(w,'p').length,0);
});
test('규칙에서 나이 숫자를 읽지 못하면 검사 전체를 건너뛴다',()=>{
  const w=world({p:page('컬럼비아 3호','인물',{summary:'미국의 전략체',infobox:box({'출생':'1950년','현역 기간':'1968년 ~ 1973년'})})},['전략체의 발현은 사춘기에 국한되며 성인이 되면 서서히 퇴역한다.']);
  assert.equal(c.ageRules(w).length,0);assert.equal(c.ageRuleIssues(w,'p').length,0);
});
test('"현재"와 "이래"가 든 문장의 연도를 창설 연도로 보지 않는다',()=>{
  const w=world({o:page('국제생체무기사찰단','조직',{infobox:box({'설립일':'1975년 1월 1일'}),body:'2016년 겨울 현재 국제생체무기사찰단은 창설 이래 가장 심각한 외교적 교착에 빠져 있다.'})});
  assert.equal(c.numFacts(c.S.pages.o).founding.y,1975);
  assert.equal(c.numericIssues(w,'o').length,0);
});
test('다른 낱말 속 이름 토막(뉘른베르크의 베르크)을 다른 인물로 보지 않는다',()=>{
  const w=world({lea:page('레아 바그너','인물',{createdAt:1,infobox:box({'출생':'2000년 5월 14일, 바이에른주 [[뉘른베르크]]'}),body:'레아 바그너는 2000년 5월 바이에른주 뉘른베르크의 철도 기관사 가정에서 태어났다.'}),
    han:page('한나 폰 베르크','인물',{createdAt:2,infobox:box({'출생':'1972년 8월 22일'})})});
  assert.equal(c.numericIssues(w,'han').length,0);assert.equal(c.ageRuleIssues(w,'han').length,0);
});
test('"출생년도" 라벨을 출생 연도로 읽고, 범위 값은 기존 숫자 대조에 넣지 않는다',()=>{
  const f=c.numFacts({infobox:box({'출생년도':'1953년','현역 기간':'1965년 ~ 1973년'})});
  assert.equal(f.birth.y,1953);assert.equal(Object.keys(f).length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(c.spanFacts({infobox:box({'현역 기간':'1965년 ~ 현재'})}))),{start:1965,end:null,line:'현역 기간: 1965년 ~ 현재'});
  const r=c.ageRules({rules:[R4]});assert.equal(r.length,1);assert.deepEqual([r[0].subject,r[0].min,r[0].max,r[0].retire],['전략체',14,19,20]);
});
test('검사 맥락은 검사할 문서와 연도가 겹치는 오래된 사실을 남기고, focus가 없으면 예전처럼 최신 6개다',()=>{
  const facts=[{t:'갑은 1931년 전사했다.',src:'a'},...Array.from({length:9},(_,i)=>({t:`갑의 일화 ${i+1}`,src:'a'}))];
  const w={entities:{g:{title:'갑',type:'인물',summary:'',box:'',facts,mentions:[]},h:{title:'을',type:'인물',facts:[],mentions:[]}}};c.S.pages={};
  const lines=s=>s.split('\n').filter(x=>x.startsWith('- '));
  const withFocus=c.entityBrief(w,'g',null,null,'을은 1931년 갑과 함께 싸웠다.');
  assert(withFocus.includes('1931년 전사'));assert.equal(lines(withFocus).length,6);
  const plain=c.entityBrief(w,'g',null,null);
  assert.deepEqual(lines(plain),facts.slice(-6).map(f=>'- '+f.t));assert(!plain.includes('1931년'));
});
test('옛 숫자 대조 결과는 다시 계산해 바꾸고 AI 지적은 남긴다',()=>{
  const p=page('갑 제품','물건',{infobox:box({'최초 도입':'1954년'}),body:'갑 제품은 1960년 도입되었다.'});
  p.check={at:1,auto:false,issues:[{claim:'옛 오탐 문장',conflict:'근거: 옛 근거 · 숫자 대조: 옛 결과',severity:'high'},{claim:'AI가 찾은 서술',conflict:'근거: 다른 서술 · 앞뒤가 맞지 않는다',severity:'low'}]};
  const w=world({p});
  assert.deepEqual(c.refreshNumeric(w,'p'),[]);
  const cl=p.check.issues.map(i=>i.claim);
  assert(!cl.includes('옛 오탐 문장'));assert(cl.includes('AI가 찾은 서술'));assert(cl.includes('갑 제품은 1960년 도입되었다.'));
  assert.equal(p.check.numV,c.NUMERIC_VERSION);assert(p.check.issues.find(i=>i.claim==='갑 제품은 1960년 도입되었다.').by==='num');
  assert.equal(c.refreshNumeric(w,'p'),null,'이미 갱신한 결과는 다시 계산하지 않는다');
});
test('다른 문서가 고칠 쪽인 숫자 대조 지적에 target을 채운다',()=>{
  const ref=page('갑 인물','인물',{createdAt:1,infobox:box({'출생':'1890년','사망':'1934년','성별':'남성'})});
  const late=page('을 사건','사건',{createdAt:2,body:'갑 인물은 1931년 사망했다.'});
  const w=world({ref,late});
  const is=c.numericIssues(w,'ref');
  assert.equal(is.length,1);assert.equal(is[0].severity,'low');assert.equal(is[0].target,'late');assert.equal(is[0].targetOld,'갑 인물은 1931년 사망했다.');
  assert(!c.numericIssues(w,'late')[0].target);
});
console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
