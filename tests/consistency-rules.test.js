const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const { appSource } = require("./helpers/app");
const html=appSource();
const cut=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);assert(i>=0&&j>i,'구간을 찾지 못함: '+a);return html.slice(i,j);};
const stripMarks=s=>String(s||'').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,a,b)=>b||a).replace(/\*\*|~~/g,'').trim();
const c={S:{pages:{}},stripMarks,norm:s=>String(s||'').replace(/\s+/g,' ').trim(),yearNum:s=>parseInt(s,10),console:{warn(){}}};
c.namesOf=t=>{const m=String(t).match(/^(.+?)\((.+)\)$/);return [t,...(m?[m[1].trim(),m[2].trim()]:[])].filter(x=>x.length>=2);};
/* 성이나 이름 한 토막이 한 인물에게만 있으면 그 인물의 이름으로 본다 */
c.nameOwner=(w,t)=>{const ks=Object.keys(w.entities).filter(k=>w.entities[k].title.split(/[\s·]+/).includes(t));return ks.length===1?ks[0]:null;};
c.live=x=>!x.sup;c.factLine=f=>f.t;c.chOf=()=>0;
vm.createContext(c);
vm.runInContext(cut('/* ---------- 인용 대조','/* 두 검사(설정 대조')+'\n'+cut('const refOK =','/* ---------- 스토리 모드: 상태')+`
Object.assign(globalThis,{spanOf,mergeIssues,yearHits,cleanCalendars,numericIssues,numFacts,spanFacts,ageRules,parseAgeRules,ageRulePrompt,ageRuleIssues,autoFixList,routeAutoConflicts,refreshNumeric,entityBrief,NUMERIC_VERSION,numStamp});`,c);
let n=0;const test=(name,fn)=>{fn();console.log(`  ✓ ${++n}. ${name}`);};
const R4='전략체의 발현과 군사적 최전성기는 14세부터 19세 사이의 사춘기에 국한되며, 성인이 되는 20세를 기점으로 능력과 체격이 서서히 통상 인간으로 축소·퇴역한다.';
const page=(title,type,o={})=>({title,type,summary:o.summary||'',categories:o.categories||[],infobox:o.infobox||[],sections:o.body?[{heading:'개요',body:o.body}]:[],links:[],createdAt:o.createdAt||1,...(o.editedAt?{editedAt:o.editedAt}:{})});
/* AI가 핵심 규칙을 해석해 돌려줄 구조 (규칙이 바뀔 때만 한 번 부른다) */
const AI_R4={rules:[{rule:'R1',subjects:['전략체'],startMin:14,startMax:19,endAge:20,spanWords:['현역','복무','활동']}]};
/* pages: {키: 문서}. 세계관 항목은 문서에서 만든다. w.ageRules는 그 규칙 텍스트로 저장된 해석이다 */
const world=(pages,rules=[R4],ai=AI_R4)=>{c.S.pages=pages;const entities={};for(const [k,p] of Object.entries(pages))entities[k]={title:p.title,type:p.type,facts:[],mentions:[]};const w={era:'2016년',rules,entities};w.ageRules={text:rules.join('\n'),rules:c.parseAgeRules(ai,w)};return w;};
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
const REAL_1965='1965년 3월, 미 해병대 제1전략체전대 소속 [[컬럼비아 3호]](본명 레베카 밀러, 당시 만 14세)가 다낭 해안을 통해 상륙했다.';
test('실제 문장처럼 다른 이름이 함께 나와도 연도를 정한 기준 문서로 인정해 그 문서로 넘긴다',()=>{
  const mk=()=>({usmc:page('미 해병대','조직',{createdAt:1}),
    viet:page('베트남 전쟁','사건',{createdAt:1,body:REAL_1965+' 정글 백병전에서 척추 손상을 입은 [[컬럼비아 3호]]는 1973년 신체 축소를 마치고 통상 체구로 복귀했다.'}),
    col:page('컬럼비아 3호','인물',{createdAt:2,summary:'미국의 3세대 전략체',infobox:box({'출생년도':'1953년','현역 기간':'1965년 ~ 1973년','성별':'여성'})})});
  const w=world(mk());
  const is=c.ageRuleIssues(w,'col');
  assert.equal(is.length,1);assert.equal(is[0].severity,'low');assert.equal(is[0].target,'viet');assert(is[0].targetOld.includes('다낭 해안'));
  assert.equal(c.autoFixList(is,'col').length,0,'자동 수정이 현역 시작을 1967~1972년으로 고치지 않는다');
});
test('기준 문서가 이 항목에 대해 확정한 사실(facts)의 연도도 근거로 인정한다',()=>{
  const pages=()=>({usmc:page('미 해병대','조직',{createdAt:1}),viet:page('베트남 전쟁','사건',{createdAt:1,body:REAL_1965}),
    col:page('컬럼비아 3호','인물',{createdAt:2,summary:'미국의 3세대 전략체',infobox:box({'출생년도':'1953년','현역 기간':'1965년 ~ 1973년','성별':'여성'})})});
  let w=world(pages());
  assert.equal(c.ageRuleIssues(w,'col')[0].severity,'high','1973년 근거가 없으면 이 문서의 연도를 고치라고 한다');
  w=world(pages());w.entities.col.facts=[{t:'컬럼비아 3호는 1973년 신체 축소를 마치고 퇴역했다.',src:'viet'},{t:'컬럼비아 3호는 1973년 표창을 받았다.',src:'col'}];
  let is=c.ageRuleIssues(w,'col');assert.equal(is.length,1);assert.equal(is[0].severity,'low');assert.equal(is[0].target,'viet');
  w=world(pages());w.entities.col.facts=[{t:'컬럼비아 3호는 1973년 신체 축소를 마치고 퇴역했다.',src:'viet',sup:true}];
  assert.equal(c.ageRuleIssues(w,'col')[0].severity,'high','대체된 사실은 근거가 아니다');
});
test('규칙 해석 전에 찍은 결과는 해석이 생기거나 규칙이 바뀌면 다시 계산한다',()=>{
  const p=page('컬럼비아 3호','인물',{summary:'미국의 전략체',infobox:box({'출생':'1950년','현역 기간':'1968년 ~ 1973년','성별':'여성'})});
  p.check={at:1,auto:true,issues:[]};
  const w=world({p});const saved=w.ageRules;delete w.ageRules;
  c.refreshNumeric(w,'p');assert(p.check.numV.endsWith(':?'));assert.equal(p.check.issues.length,0);
  assert.equal(c.refreshNumeric(w,'p'),null);
  w.ageRules=saved;assert.notEqual(c.refreshNumeric(w,'p'),null,'해석이 생기면 표시가 달라져 다시 계산한다');
  assert.equal(p.check.issues.length,1);assert(p.check.issues[0].conflict.includes('· 나이 규칙:'));
  const before=p.check.numV;w.rules=[R4+' 추가'];assert.notEqual(c.numStamp(w),before,'규칙을 고치면 표시가 달라진다');
  assert.equal(c.numStamp({rules:[]}).endsWith(':-'),true);
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
test('규칙에서 나이 규칙을 찾지 못했거나 규칙이 바뀐 뒤 아직 해석하지 않았으면 건너뛴다',()=>{
  const p=()=>page('컬럼비아 3호','인물',{summary:'미국의 전략체',infobox:box({'출생':'1950년','현역 기간':'1968년 ~ 1973년'})});
  let w=world({p:p()},['전략체의 발현은 사춘기에 국한되며 성인이 되면 서서히 퇴역한다.'],{rules:[]});
  assert.equal(c.ageRules(w).length,0);assert.equal(c.ageRuleIssues(w,'p').length,0);
  w=world({p:p()});assert.equal(c.ageRuleIssues(w,'p').length,1);
  w.rules=[R4+' (수정)'];assert.equal(c.ageRuleIssues(w,'p').length,0,'옛 규칙의 해석은 쓰지 않는다');
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
  assert.deepEqual(JSON.parse(JSON.stringify(c.spanFacts({infobox:box({'현역 기간':'1965년 ~ 현재'})},['현역']))),{start:1965,end:null,cal:'',now:true,label:'현역 기간',line:'현역 기간: 1965년 ~ 현재'});
  assert.equal(c.spanFacts({infobox:box({'재위 기간':'1965년 ~ 1973년'})},['현역']),null);
});
test('AI 해석 결과에서 앞뒤가 맞지 않는 규칙은 버린다',()=>{
  const w={rules:[R4]};
  const r=c.parseAgeRules({rules:[AI_R4.rules[0],{rule:'R1',subjects:[],startMin:1,startMax:2,endAge:null,spanWords:['활동']},{rule:'R1',subjects:['갑'],startMin:19,startMax:14,endAge:null,spanWords:['활동']},{rule:'R1',subjects:['갑'],startMin:'열넷',startMax:null,endAge:null,spanWords:['활동']},{rule:'R1',subjects:['갑'],startMin:null,startMax:null,endAge:null,spanWords:['활동']},{rule:'R1',subjects:['갑'],startMin:14,startMax:19,endAge:18,spanWords:['활동']},{rule:'R1',subjects:['갑'],startMin:14,startMax:19,endAge:null,spanWords:[]}]},w);
  assert.equal(r.length,1);assert.deepEqual([r[0].subjects,r[0].min,r[0].max,r[0].end],[['전략체'],14,19,20]);assert.equal(r[0].text,R4);
  assert.equal(c.parseAgeRules(null,w).length,0);assert.equal(c.parseAgeRules({rules:'없음'},w).length,0);
  const pr=c.ageRulePrompt({rules:[R4,'둘째 규칙']});assert(pr.includes('R1. '+R4));assert(pr.includes('R2. 둘째 규칙'));
});
test('장르와 표현이 달라도 해석된 구조로 같은 판정을 한다 (마법소녀, 엘프, 하한만 있는 규칙)',()=>{
  const girl={rules:[{rule:'R1',subjects:['마법소녀'],startMin:10,startMax:15,endAge:16,spanWords:['활동']}]};
  const rg=['마법소녀는 열 살에서 열다섯 살 사이에 각성하며, 열여섯이 되면 힘을 서서히 잃는다.'];
  let w=world({p:page('갑 소녀','인물',{categories:['마법소녀'],infobox:box({'출생':'2000년','활동 기간':'2012년 ~ 2018년'})})},rg,girl);
  let is=c.ageRuleIssues(w,'p');assert.equal(is.length,1);assert(is[0].conflict.includes('출생을 2001~2002년 사이로'),is[0].conflict);
  w=world({p:page('갑 소녀','인물',{categories:['마법소녀'],infobox:box({'출생':'2001년','활동 기간':'2012년 ~ 2017년'})})},rg,girl);assert.equal(c.ageRuleIssues(w,'p').length,0);
  const elf={rules:[{rule:'R1',subjects:['엘프'],startMin:100,startMax:300,endAge:null,spanWords:['수호']}]};
  w=world({p:page('을 엘프','인물',{summary:'숲의 엘프',infobox:box({'출생':'1900년','수호 기간':'1950년 ~ 현재'})})},['엘프는 100세부터 300세 사이에 숲의 수호자가 된다.'],elf);
  is=c.ageRuleIssues(w,'p');assert.equal(is.length,1);assert(is[0].conflict.includes('1650~1850년'),is[0].conflict);
  const knight={rules:[{rule:'R1',subjects:['기사'],startMin:18,startMax:null,endAge:null,spanWords:['서약']}]};
  w=world({p:page('병 기사','인물',{summary:'왕국의 기사',infobox:box({'출생':'1960년','서약 기간':'1970년 ~ 1990년'})})},['18세 이상의 기사만 서약할 수 있다.'],knight);
  is=c.ageRuleIssues(w,'p');assert.equal(is.length,1);assert(is[0].conflict.includes('1952년 이전'),is[0].conflict);
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
  assert.equal(p.check.numV,c.numStamp(w));assert(p.check.issues.find(i=>i.claim==='갑 제품은 1960년 도입되었다.').by==='num');
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
/* ---------- 연도 읽기: 서기 네 자리 밖의 세계관 ---------- */
const Y=t=>c.yearHits(t).filter(h=>!h.approx).map(h=>(h.cal?h.cal+' ':'')+h.y);
test('주사위의 여섯 시대 연도를 읽는다 (기원전, 세 자리, 23세기, 31세기, 가상 기년법)',()=>{
  assert.deepEqual(Y('스키피오는 기원전 202년 자마에서 승리했다.'),['-202']);
  assert.deepEqual(Y('조조는 208년 적벽에서 패했다.'),['208']);
  assert.deepEqual(Y('장보고는 828년에 청해진을 설치했다.'),['828']);
  assert.deepEqual(Y('화성 정착지는 2250년 독립을 선언했다.'),['2250']);
  assert.deepEqual(Y('3050년 겨울, 적도 도시가 얼어붙었다.'),['3050']);
  assert.deepEqual(Y('대멸종력 312년에 첫 정착지가 세워졌다.'),['대멸종력 312']);
  assert.deepEqual(Y('제국 기원 45년 황제가 즉위했다.'),['제국기원 45']);
  assert.deepEqual(Y('기원전 12년 원정이 끝났다.'),['-12']);
});
test('기간과 경과 표현은 연도로 보지 않는다',()=>{
  for(const t of ['그는 300년 동안 잠들어 있었다.','300년간 이어진 전쟁','갑은 300년을 살았다.','제국은 건국 후 312년에 무너졌다.','그로부터 120년 뒤 탑이 무너졌다.','12년 만에 귀환했다.','재위 12년에 숨졌다.','징역 15년형을 받았다.','150년의 세월이 흘렀다.','경력 15년의 기사','500년이 지나도록','3,000년 전의 유적'])assert.deepEqual(Y(t),[],t);
  for(const t of ['1950년을 기점으로 바뀌었다.','6·25 전쟁 후 1953년 정전되었다.'])assert.equal(Y(t).length,1,'서기 네 자리는 예전처럼 읽는다: '+t);
  assert(c.yearHits('800년대 초').every(h=>h.approx));assert(c.yearHits('기원전 230년 ~ 180년').every(h=>h.approx));
});
test('세 자리 연도와 가상 기년법도 숫자 대조와 사망 나이 계산을 한다',()=>{
  const ref=page('갑 왕','인물',{createdAt:1,infobox:box({'출생':'제국력 250년','사망':'제국력 312년','성별':'남성'})});
  let w=world({ref,late:page('을 전쟁','사건',{createdAt:2,body:'갑 왕은 제국력 310년 사망했다.'})});
  let is=c.numericIssues(w,'late');assert.equal(is.length,1);assert(is[0].conflict.includes('제국력 312년'),is[0].conflict);
  w=world({ref,late:page('을 전쟁','사건',{createdAt:2,body:'갑 왕은 310년 사망했다.'})});
  assert.equal(c.numericIssues(w,'late').length,0,'기년법이 다른(표시 없는) 연도와는 비교하지 않는다');
  w=world({ref:page('병 장군','인물',{createdAt:1,infobox:box({'출생':'기원전 230년','사망':'기원전 183년','성별':'남성'})}),late:page('정 전쟁','사건',{createdAt:2,body:'병 장군은 기원전 185년 사망했다.'})});
  is=c.numericIssues(w,'late');assert.equal(is.length,1);assert(is[0].conflict.includes('기원전 183년'),is[0].conflict);
  w=world({ref:page('무 황제','인물',{infobox:box({'출생':'155년','사망':'220년','성별':'남성'}),body:'무 황제는 향년 40세로 사망했다.'})});
  is=c.numericIssues(w,'ref');assert.equal(is.length,1);assert(is[0].conflict.includes('64~65세'),is[0].conflict);
  w=world({ref:page('기 장군','인물',{infobox:box({'출생':'기원전 10년','사망':'20년','성별':'남성'}),body:'기 장군은 향년 29세로 사망했다.'})});
  assert.equal(c.numericIssues(w,'ref').length,0,'기원전에서 서기로 넘어갈 때 0년은 없다');
});
test('가상 기년법의 기간으로 나이 규칙을 판정하고 수정 연도도 같은 기년법으로 쓴다',()=>{
  const girl={rules:[{rule:'R1',subjects:['마법소녀'],startMin:10,startMax:15,endAge:16,spanWords:['활동']}]};
  const w=world({p:page('갑 소녀','인물',{categories:['마법소녀'],infobox:box({'출생':'성력 300년','활동 기간':'성력 312년 ~ 318년'})})},['마법소녀 규칙'],girl);
  assert.deepEqual(JSON.parse(JSON.stringify(c.spanFacts(c.S.pages.p,['활동']))).cal,'성력');
  const is=c.ageRuleIssues(w,'p');assert.equal(is.length,1);assert(is[0].conflict.includes('성력 301년~성력 302년'),is[0].conflict);
  const w2=world({p:page('갑 소녀','인물',{categories:['마법소녀'],infobox:box({'출생':'300년','활동 기간':'성력 312년 ~ 318년'})})},['마법소녀 규칙'],girl);
  assert.equal(c.ageRuleIssues(w2,'p').length,0,'출생과 기간의 기년법이 다르면 계산하지 않는다');
});
test('세계관에 적힌 연호와 연표의 연호를 기년법으로 읽는다',()=>{
  try{
    c.S.world={calendars:['건안'],timeline:[{year:'메이지 45',event:'천황 붕어'},{year:'1947',event:'정부 수립'},{year:'기원전 202',event:'자마 전투'},{year:'봄 1950',event:'개전'}]};
    assert.deepEqual(Y('조조는 건안 13년 적벽에서 패했다.'),['건안 13']);
    assert.deepEqual(Y('건안 원년 헌제가 허창으로 옮겼다.'),['건안 1']);
    assert.deepEqual(Y('메이지 45년 여름'),['메이지 45'],'연표 연도 칸의 연호도 모은다');
    assert.deepEqual(Y('다이쇼 3년'),[],'모르는 연호의 두 자리 숫자는 여전히 연도로 보지 않는다');
    assert.deepEqual(Y('건안 13년 동안'),[],'연호가 붙어도 기간 표현은 연도가 아니다');
    const ref=page('갑 장수','인물',{createdAt:1,infobox:box({'출생':'건안 5년','성별':'남성'})});
    let w=world({ref,late:page('을 전투','사건',{createdAt:2,body:'갑 장수는 건안 7년 태어났다.'})});c.S.world.entities=w.entities;
    assert.equal(c.numericIssues(w,'late').length,1);
    w=world({ref,late:page('을 전투','사건',{createdAt:2,body:'갑 장수는 207년 태어났다.'})});
    assert.equal(c.numericIssues(w,'late').length,0,'연호와 서기는 서로 비교하지 않는다');
  }finally{c.S.world=undefined;}
  assert.deepEqual(c.cleanCalendars(['건안',' 메이지 ','서기','기원전','','12년','[[제국력]]','건안']),['건안','메이지','제국력']);
  assert.equal((html.match(/"calendars":\["서기 말고/g)||[]).length,2,'세계관 생성 프롬프트 두 곳에 calendars를 요청한다');
});
/* ---------- 나중에 손볼 것으로 남겼던 항목 ---------- */
const SP=v=>{const x=c.spanOf(v);return x&&[x.start,x.end,x.cal,x.now];};
test('괄호 안이나 "년"이 없는 기간도 읽고, 수량·여러 기간은 읽지 않는다',()=>{
  assert.deepEqual(SP('서독 연방군 특별생체전단 (1987~1991)'),[1987,1991,'',false]);
  assert.deepEqual(SP('1987–91'),[1987,1991,'',false]);
  assert.deepEqual(SP('1998-02 제2전대'),[1998,2002,'',false]);
  assert.deepEqual(SP('1965년 ~ 1973년'),[1965,1973,'',false]);
  assert.deepEqual(SP('2004 ~ 현재'),[2004,null,'',true]);
  assert.deepEqual(SP('제국력 12년 ~ 15년'),[12,15,'제국력',false]);
  assert.deepEqual(SP('기원전 230년 ~ 180년'),[-230,-180,'',false]);
  for(const v of ['병력 100-200명','제1-2대대','1965~1968, 1970~1973','1960년대 ~ 1970년대','1-3년'])assert.equal(c.spanOf(v),null,v);
  const w=world({h:page('한나 폰 베르크','인물',{summary:'서독의 전략체',infobox:box({'출생':'1972년 8월 22일','현역':'서독 연방군 특별생체전단 (1984~1991)','성별':'여성'})})});
  const is=c.ageRuleIssues(w,'h');assert.equal(is.length,1);assert(is[0].conflict.includes('출생을 1970년으로'),is[0].conflict);
});
test('"~ 현재"면 작중 기준 시점까지 이어진 것으로 보고 나이 상한을 검사한다',()=>{
  let w=world({p:page('갑 전략체','인물',{summary:'현역 전략체',infobox:box({'출생':'1990년','현역 기간':'2004년 ~ 현재','성별':'여성'})})});
  let is=c.ageRuleIssues(w,'p');assert.equal(is.length,1);assert.equal(is[0].severity,'high');
  assert(is[0].conflict.includes('작중 기준 2016년에는 26세'),is[0].conflict);assert(is[0].conflict.includes('"현재"를 2011년 이전의 종료 연도로'),is[0].conflict);
  w=world({p:page('갑 전략체','인물',{summary:'현역 전략체',infobox:box({'출생':'1998년','현역 기간':'2012년 ~ 현재','성별':'여성'})})});
  assert.equal(c.ageRuleIssues(w,'p').length,0);
  w=world({p:page('갑 전략체','인물',{summary:'현역 전략체',infobox:box({'출생':'1990년','현역 기간':'2004년 ~ 현재','성별':'여성'})})});w.era='2010년대';
  assert.equal(c.ageRuleIssues(w,'p').length,0,'기준 시점이 근사하면 계산하지 않는다');
});
test('부류는 한 줄 정의·분류·분류 성격의 인포박스 줄로만 판정한다',()=>{
  let w=world({p:page('갑 장군','인물',{summary:'미국 육군의 장군',infobox:box({'출생':'1914년','복무 기간':'1936년 ~ 1972년','지휘 전력':'제1전략체전대 전략체 12기'})})});
  assert.equal(c.ageRuleIssues(w,'p').length,0,'지휘한 대상을 적은 줄로 장군을 전략체로 보지 않는다');
  w=world({p:page('을 병사','인물',{summary:'미국의 군인',infobox:box({'출생':'1950년','신분':'3세대 전략체','현역 기간':'1968년 ~ 1973년'})})});
  assert.equal(c.ageRuleIssues(w,'p').length,1,'신분 줄에 적힌 부류는 인정한다');
});
test('결정론 지적에 합쳐진 AI 지적은 다시 계산해도 남는다',()=>{
  const p=page('갑 제품','물건',{infobox:box({'최초 도입':'1954년'}),body:'갑 제품은 1960년 도입되었다.'});
  const w=world({p});
  const num=c.numericIssues(w,'p');
  p.check={at:1,auto:false,issues:c.mergeIssues([...num,{claim:'갑 제품은 1960년 도입되었다.',conflict:'근거: 개요 · 개요와 연혁의 도입 시점이 다르다',severity:'high'}])};
  assert.equal(p.check.issues.length,1);assert.equal(p.check.issues[0].ai.length,1);
  p.check.numV='옛 표시';p.infobox=box({'최초 도입':'1960년'});   // 숫자 대조는 사라지는 상황
  c.refreshNumeric(w,'p');
  assert.equal(p.check.issues.length,1);assert(p.check.issues[0].conflict.includes('개요와 연혁의'));assert.equal(p.check.issues[0].by,undefined);
});
test('사용자가 지운 자동 대조 표시는 다시 검사해도 다시 달지 않고, 지적이 사라지면 지운 기록도 정리한다',()=>{
  const viet=page('베트남 전쟁','사건',{createdAt:1});const w=world({viet,col:page('컬럼비아 3호','인물',{createdAt:2})});
  const is=[{claim:'현역 기간',conflict:'x',severity:'low',target:'viet',targetOld:'1965년 상륙'}];
  viet.autoDismissed=[{by:'col',old:'1965년 상륙'}];
  c.routeAutoConflicts(w,'col',is);assert.equal((viet.autoConflicts||[]).length,0);
  c.routeAutoConflicts(w,'col',[]);assert.equal(viet.autoDismissed.length,0);
  c.routeAutoConflicts(w,'col',is);assert.equal(viet.autoConflicts.length,1,'나중에 다시 생긴 지적은 다시 보여 준다');
  assert(html.includes('p.autoDismissed = [...(p.autoDismissed || [])'),'표시 지우기가 지운 기록을 남긴다');
});
console.log(`\n모두 통과 (${n}개). AI 호출 0회.`);
