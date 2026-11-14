/* 무대 생성·편집, 장르 중립 공백 판정, 첫 문서 및 생애 흐름. 유료 API 호출 없음. */
const assert = require('assert');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
const fixtures = require('./fixtures/stage-worlds.json');
const server = appServer();
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.route('**/v1beta/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('#importFile', { state: 'attached' });
    const prompts = await page.evaluate(() => ({ normal: biblePrompt('작은 가게의 원안', '', '', false), story: biblePrompt('원안', '', '', true), chosen: biblePrompt('원안', '지정 항목', '', false) }));
    for (const text of ['무대(stage)', '없는 갈등이나 큰 규모를 만들지 않는다', '메타 항목은 고르지 않는다', '확장 요소:', '학교·동아리·반', '군락·서식지', 'stage.units', '척도', '피하거나 거부한', '서로 부딪히는 지침', '곁가지 한두 군데']) assert(prompts.normal.includes(text), text);
    assert(!prompts.story.includes('무대(stage)') && !prompts.story.includes('"stage"') && !prompts.story.includes('stage.units'));
    assert(prompts.chosen.includes('지정 항목'));

    const made = await page.evaluate(async fixtures => {
      const original = { callJson, openWorld, afterTimeline, sample: S.sample };
      const out = [];
      try {
        S.sample = {}; afterTimeline = () => {}; openWorld = async id => { S.world = S.worlds.find(w => w.id === id); S.pages = {}; };
        for (const b of [...fixtures, { ...fixtures[1], stage: { units: [null, [], 'bad', {}, {name: 1}, { name: '파도 빵집', kind: '국가' }, {name: '잘못된 유형', kind: '가게', desc: {}, rel: 2}, {name:'잘못된 유형',kind:'인물'}, ...Array.from({length:9}, (_, i) => ({name:'긴 이름'+i,kind:'지명',desc:'가'.repeat(400),rel:'나'.repeat(400)}))], now:'다'.repeat(900) } }, { ...fixtures[1], stage: undefined }, { ...fixtures[1], stage: 'broken' }]) {
          callJson = async () => structuredClone(b);
          S.seed = b.seed; S.first = ''; S.mode = 'normal'; S.regen = null;
          await createWorld();
          if (S.createErr) throw new Error(S.createErr);
          const w = S.world;
          out.push({ w: structuredClone(w), prompt: pagePrompt(w, w.mainKey), canon: canonBlock(w), gaps: worldGapSignals(w) });
        }
        S.seed = fixtures[1].seed; S.mode = 'story';
        callJson = async () => ({...fixtures[1], chapter1:{summary:'축제 준비가 시작된다',era:'2026년',nextChoices:[]}});
        await createWorld();
        if (S.createErr) throw new Error(S.createErr);
        out.push({w:structuredClone(S.world)});
        S.mode = 'normal';
      } finally { callJson = original.callJson; openWorld = original.openWorld; afterTimeline = original.afterTimeline; S.sample = original.sample; }
      return out;
    }, fixtures);
    assert(!('stage' in made[5].w)); assert.equal(Object.keys(made[5].w.entities).length,1);
    for (const [i, b] of fixtures.entries()) {
      assert.deepStrictEqual(made[i].w.stage, b.stage);
      for (const u of b.stage.units) {
        assert(made[i].prompt.includes(u.name));
        const e = Object.values(made[i].w.entities).find(e => e.title === u.name);
        assert(e); if (u.name !== b.mainTitle) { assert.equal(e.type, u.kind); assert.equal(e.summary, u.desc); }
      }
      assert(made[i].prompt.includes(b.stage.now));
      assert(made[i].prompt.indexOf('## 이 위키의 첫 문서') < made[i].prompt.indexOf('## 세계 넓히기'));
      assert(made[i].canon.includes('## 주요 단위') && made[i].canon.includes('## 지금 진행 중인 일'));
    }
    assert(!made[1].gaps.some(s => s.includes('국가가 비었다')));
    assert.equal(made[2].w.stage.units.length, 6);
    assert.equal(made[2].w.stage.units[1].kind, '');
    assert.equal(made[2].w.stage.units[1].desc, '');
    assert.equal(made[2].w.stage.units[2].desc.length, 200);
    assert.equal(made[2].w.stage.units[2].rel.length, 240);
    assert.equal(made[2].w.stage.now.length, 600);
    assert.equal(Object.values(made[2].w.entities).filter(e => e.title === fixtures[1].mainTitle).length, 1);
    for (const i of [3,4]) { assert.deepStrictEqual(made[i].w.stage, {units:[],now:''}); assert(!made[i].canon.includes('## 주요 단위')); assert(!made[i].prompt.includes('stage.units')); assert(!made[i].prompt.includes('stage.now')); }

    const checks = await page.evaluate(w => {
      S.pages = {}; const k = w.mainKey, other = keyOf('다른 항목'); w.entities[other] = newEntity('다른 항목', '', '');
      const out = { other: pagePrompt(w, other), rewrite: pagePrompt(w, k, ''), partial: pagePrompt({...w, stage:{now:'축제 준비', units:[]}}, k) };
      S.pages[k] = {key:k}; out.existing = pagePrompt(w, k); S.pages = {};
      const story = {...w, mode:'story', story:{ protagonistKey:k, chapter:1, total:5, chapters:[{n:1, era:w.era, summary:'줄거리', explore:{}}], spine:[], secrets:[] }};
      out.storyFirst = firstPageBlock(story,k,null); out.storyCanon = stageBlock(story); out.storyEditor = stageEditorHtml(story);
      delete w.stage; out.legacy = pagePrompt(w,k); out.empty = canonBlock({...w, stage:{units:[],now:''}}); out.nowOnly = canonBlock({...w,stage:{now:'축제'}}); out.unitsOnly=canonBlock({...w, stage:{units:[{name:'가게'}]}});
      const base = {entities:{},rules:[],timeline:[],era:'842년',stage:{units:[],now:'준비 중'}};
      out.gaps = {
        country:worldGapSignals({...base, stage:{units:[{name:'나라',kind:'국가'}]}}), rules:worldGapSignals({...base,rules:['강대국이 경쟁한다']}),
        filled:worldGapSignals({...base,rules:['강대국이 경쟁한다'],entities:{x:newEntity('나라','국가','')}}),
        school:worldGapSignals({...base,rules:['국가대표 출신 교사가 수업한다'],stage:{units:[{name:'학교',kind:'조직'},{name:'동아리',kind:'조직'}],now:'새 학기'}}),
        current:worldGapSignals({...base,timeline:[{year:'412'},{year:'520'}]}), near:worldGapSignals({...base,timeline:[{year:'838'},{year:'842'}]}),
        noEra:worldGapSignals({...base,era:'한여름'}), noNow:worldGapSignals({...base,stage:{now:''}}),
        old:worldGapSignals({entities:{},rules:[],timeline:[],era:'842'}),
        mentioned:worldGapSignals({...base,stage:{units:[{name:'가게'}]},entities:{[keyOf('가게')]:{...newEntity('가게','',''),mentions:[{from:'a'},{from:'b'},{from:'c',sup:{}}]}}}),
        done:worldGapSignals({...base,stage:{units:[{name:'가게'}]},entities:{[keyOf('가게')]:{...newEntity('가게','',''),page:true}}})
      };
      return out;
    }, made[1].w);
    for (const f of ['other','rewrite','existing']) assert(!checks[f].includes('## 이 위키의 첫 문서'), f);
    for (const f of ['storyFirst','storyCanon','storyEditor']) assert.equal(checks[f], '');
    assert(checks.partial.includes('stage.now') && !checks.partial.includes('stage.units'));
    assert(!checks.legacy.includes('## 주요 단위')); assert(!checks.empty.includes('## 지금 진행 중인 일'));
    assert(checks.nowOnly.includes('## 지금 진행 중인 일') && !checks.nowOnly.includes('## 주요 단위'));
    assert(checks.unitsOnly.includes('## 주요 단위') && !checks.unitsOnly.includes('## 지금 진행 중인 일'));
    for (const f of ['country','rules']) assert(checks.gaps[f].some(s => s.includes('국가가 비었다')));
    for (const f of ['filled','school','old']) assert(!checks.gaps[f].some(s => s.includes('국가가 비었다')));
    assert(checks.gaps.school.filter(s => s.includes('주요 단위')).length === 2);
    for (const f of ['mentioned','done']) assert(!checks.gaps[f].some(s => s.includes('주요 단위')));
    const gap = checks.gaps.current; assert(gap.findIndex(s => s.includes('지금이 거의')) < gap.findIndex(s => s.includes('연표에서')));
    for (const f of ['near','noEra','noNow','old']) assert(!checks.gaps[f].some(s => s.includes('지금이 거의')), f);

    const flows = await page.evaluate(w => {
      S.pages = {}; const k = w.mainKey; w.entities[k].type = '인물'; w.entities[k].cats = [{name:'이웃'}];
      for (let i=0;i<6;i++) { const x=keyOf('인물'+i); w.entities[x]=newEntity('인물'+i,'인물',''); S.pages[x]={key:x,title:'인물'+i,type:'인물',createdAt:i,categories:i===0?['이웃']:[],sections:[{heading:'생애',level:1},{heading:'전환점'+i,level:2},{heading:'평가',level:1},{heading:'평가제목'+i,level:2}]}; }
      const stub=keyOf('미작성'); w.entities[stub]=newEntity('미작성','인물','');
      const chosen=lifeFlowBlock(w,k,[keyOf('인물1')]); const prompt=pagePrompt(w,k); w.entities[k].type='지명'; const nonperson=pagePrompt(w,k);
      return {chosen,prompt,nonperson};
    }, made[1].w);
    for (const t of ['전환점1','전환점0','전환점5']) assert(flows.chosen.includes(t));
    for (const t of ['전환점2','평가제목','미작성']) assert(!flows.chosen.includes(t));
    assert(flows.prompt.includes('## 기존 인물들의 생애 흐름')); assert(!flows.nonperson.includes('## 기존 인물들의 생애 흐름'));

    await page.evaluate(w => { S.world=w; S.pages={}; S.view={name:'canon'}; renderAll(); }, made[1].w);
    assert.equal(await page.inputValue('#stageNow'), fixtures[1].stage.now);
    await page.fill('#stageDesc1','수리된 독서 공간'); await page.fill('#stageNow','내일 축제를 연다');
    await page.click('[data-act="save-canon"]');
    const saved = await page.evaluate(async () => { await Store.q; return (await Store.getWorld(S.world.id)).stage; });
    assert.equal(saved.now,'내일 축제를 연다'); assert.equal(saved.units[1].desc,'수리된 독서 공간');
    await page.reload(); await page.waitForFunction(() => S.ready);
    const persisted = await page.evaluate(async id => (await Store.getWorld(id)).stage, made[1].w.id);
    assert.deepStrictEqual(persisted,saved);
    assert.deepStrictEqual(errors,[]);
    console.log('무대 생성·정규화·편집·저장, 첫 문서 조건, 공백 판정, 생애 흐름, 기존 데이터 호환 통과');
  } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => {console.error(e); process.exitCode=1;});
