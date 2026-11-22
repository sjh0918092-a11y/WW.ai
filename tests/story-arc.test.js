/* 기존 세계에서 이야기 이어 가기: 진입(빙의), 장면 기록과 대화 목록, 주변이 알아챈 것, 봉인·보관, 되돌리기, 실패 시 복구.
   유료 API 호출 없음(가짜 응답). */
const assert = require('assert');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
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

    const r = await page.evaluate(async () => {
      const out = {};
      const mkPage = (key, title, type, body) => ({ key, title, type, summary: `${title}의 정의`, categories: [], infobox: [], notices: [], sections: [{ heading: '개요', level: 1, body }], savedAt: 1 });
      const w = { kind: 'world', id: 'warc' + Date.now().toString(36), title: '항구 세계', tagline: '', seed: '항구 도시', style: 'encyc', era: '1201년', historical: false, guide: '', tone: normTone({ label: '잔잔함', guide: ['담담하게 쓴다'] }, ''), rules: ['바다는 잔잔하다'], calendars: [], timeline: [], userCanon: '', entities: {}, mainKey: null, createdAt: Date.now(), relMigrated: true, relations: [] };
      const add = (title, type) => { const k = keyOf(title); w.entities[k] = newEntity(title, type, `${title}의 정의`); w.entities[k].page = true; return k; };
      const city = add('항구 도시', '지명'), seo = add('한서윤', '인물'), park = add('박도현', '인물'), old = add('이노인', '인물');
      w.entities[old].span = { src: old, what: '출생', start: '1100년', end: '1180년', endWhat: '사망' };
      w.mainKey = city;
      await Store.saveWorld(w);
      for (const [k, t, ty] of [[city, '항구 도시', '지명'], [seo, '한서윤', '인물'], [park, '박도현', '인물'], [old, '이노인', '인물']]) await Store.savePage(w.id, mkPage(k, t, ty, `${t}에 관한 원래 본문이다.`));
      S.worlds.unshift(w); S.sample = {};
      const original = { callJson, generatePage };
      const calls = [];
      let failBlock = false, named = '', lastBible = '';
      callJson = async (kind, text) => {
        calls.push(kind);
        if (kind === 'storyBible') { lastBible = text; } if (kind === 'storyBible') return { protagonist: { ...(named ? { name: named } : {}), summary: '바뀌면 안 되는 새 정의', want: '배를 되찾는다', wound: '' }, storyPromise: { focus: '항구의 일상', central: { kind: 'goal', subject: '배' } }, spine: [{ n: 1, intent: '시작' }], secrets: [{ truth: '등대지기는 밀수꾼이다', cover: '성실한 등대지기', reveal: 3 }], chapter1: { title: '사라진 배', era: '1201년', summary: '한서윤의 배가 사라졌다.', incident: '배가 사라졌다', nextChoices: ['부두로 간다', '박도현을 찾는다', '기다린다'] }, place: '북쪽 부두', nearby: [{ title: '박도현', why: '같은 부두에서 일한다' }, { title: '이노인', why: '' }, { title: '없는사람', why: '' }] };
        if (kind === 'chapterBlock') { if (failBlock) throw { code: 'invalid_json' }; return { blocks: [{ ch: 1, heading: '사라진 배', sections: [{ heading: '부두의 아침', level: 1, body: '그날 아침 배가 보이지 않았다.' }] }], infoboxPatch: [], summaryPatch: '', facts: [], relations: [], timeline: [], newEntities: [] }; }
        if (kind === 'storyCast') return { profile: { personality: '무뚝뚝하다', voice: '짧게 반말', examples: ['뭐야.', '비켜.'] }, character: { key: park, state: 'available', evidence: '부두에 있다' }, player: { key: seo, state: 'available', evidence: '부두에 있다' }, relationship: '동료', bond: '편함', scene: '부두', opening: '어, 서윤이네. 무슨 일이야?', knowledge: { known: [] } };
        if (kind === 'storyChat' || kind === 'storyChatReview') return { reply: '뭐? 그걸 네가 어떻게 알아?', memory: '한서윤이 등대지기 이야기를 꺼냈다', important: true, character: { key: park, state: 'available', evidence: '' }, player: { key: seo, state: 'available', evidence: '' }, relationship: '의심', bond: '각별함', scene: '부두', noticed: '들은 적 없는 이야기를 알고 있었다', knowledge: { known: [] } };
        if (kind === 'chapterPlan') return { protagonist: { tendency: '사람을 먼저 지켰다.', change: '혼자 버티던 사람이 도움을 청하게 됐다.', voice: '짧게 반말한다.' }, people: [{ title: '박도현', with: '함께 배를 찾았다.' }], open: ['등대의 불빛'] };
        throw { code: 'invalid_json' };
      };
      generatePage = async () => {};
      try {
        await openWorld(w.id);
        S.view = { name: 'canon' }; renderMain();
        out.panelStart = !!document.querySelector('[data-act="story-entry-open"]');
        openStoryEntry();
        out.deadDisabled = document.querySelector(`[data-entry-pick="${old}"]`)?.disabled === true;
        out.alivePick = document.querySelector(`[data-entry-pick="${seo}"]`)?.disabled === false;

        // 실패하면 세계를 그대로 두고 시작 전 기록도 남기지 않는다
        failBlock = true; S.storyEntry.pick = seo;
        await startStoryEntry();
        out.failKept = !isStory(w) && !w.storySnap && !StorySnap.open.has(w.id) && S.pages[seo].sections.length === 1 && !!S.storyEntry?.err;
        failBlock = false;

        S.storyEntry.pick = seo; S.storyEntry.total = 5;
        await startStoryEntry();
        const st = w.story, ch1 = st?.chapters[0];
        out.entered = isStory(w) && st.entry === 'possess' && st.protagonistKey === seo && st.arc === 1;
        out.summaryKept = w.entities[seo].summary === '한서윤의 정의' && st.original.summary === '한서윤의 정의';
        out.scene = { place: ch1.place, nearby: ch1.nearby.map(x => x.key) };
        out.ch1Section = S.pages[seo].sections.map(s => s.ch || 0);
        out.snapOpen = StorySnap.open.has(w.id) && !!w.storySnap;
        out.snapPage = (await IDB.get('snap:' + w.id + ':p:' + seo))?.v?.sections?.length;
        out.talkers = storyTalkers(w);
        const plan = chapterPlanPrompt(w, 2, null);
        out.planReader = plan.includes('원작 위키와 주인공의 지식') && plan.includes('"noticed"') && plan.includes('"nearby"');
        storyArcNoticed(w, 1, [{ who: '박도현', what: '처음 듣는 이름을 알고 있었다' }]);
        out.planNoticed = chapterPlanPrompt(w, 2, null).includes('처음 듣는 이름을 알고 있었다');
        await prepareStoryTalk(park);
        const ts = storyTalkSession(w, park);
        out.opening = ts?.turns?.[0];
        S.view = { name: 'storyTalk', key: park }; renderMain();
        // 대화 되돌리기: 보낸 차례를 지우고 관계·주변이 알아챈 것을 되돌리며 보낸 말을 입력란에 돌려놓는다
        ts.draft = '등대지기는 밀수꾼이지?'; await sendStoryTalk();
        out.bondSent = STORY_TALK_BONDS[storyBond(w, park)]; out.bondHidden = !document.querySelector('.story-talk')?.textContent.includes('신뢰');
        out.sent = { turns: ts.turns.length, rel: ts.relationship, noticed: (w.story.noticed || []).length, undoBtn: !!document.querySelector('[data-act="talk-undo"]') };
        await undoStoryTalk();
        out.bondUndone = STORY_TALK_BONDS[storyBond(w, park)];
        out.undone = { turns: ts.turns.length, rel: ts.relationship, noticed: (w.story.noticed || []).length, draft: ts.draft, undoBtn: !!document.querySelector('[data-act="talk-undo"]') };
        out.openingHtml = { self: document.querySelectorAll('.talk-chapter .talk-self').length, other: document.querySelector('.talk-chapter .talk-other .talk-bubble')?.textContent };
        out.talkNoticedRule = storyTalkPrompt(w, park, '등대지기는 밀수꾼이지?').includes('noticed');

        // 봉인: 장 표시와 장 출처를 이야기 번호가 붙은 일반 기록으로 바꾸고 이야기를 보관한다
        addFact(w.entities[park], '박도현은 배를 찾는 데 나섰다', 'ch1');
        w.timeline.push({ year: '1201년', event: '배가 사라졌다', src: 'ch1', ch: 1 });
        st.status = 'ended'; st.endedAt = Date.now();
        await sealStory();
        out.sealed = !isStory(w) && !w.mode && w.storyLog?.length === 1 && w.storyLog[0].record.protagonist.tendency === '사람을 먼저 지켰다.';
        out.arcSection = S.pages[seo].sections.filter(s => s.arc === 1 && s.arcCh === 1 && !s.ch).length;
        out.factSrc = w.entities[park].facts.find(f => f.t.includes('배를 찾는'))?.src;
        out.tl = w.timeline.find(t => t.event === '배가 사라졌다');
        out.logBlock = storyLogBlock(w).includes('1부') && storyEntryPrompt(w, { possess: true, pk: park, total: 5 }).includes('사람을 먼저 지켰다');
        out.afterSealView = S.view.name;

        // 다음 이야기에서는 앞 주인공의 기록이 대화 프로필로 넘어간다
        S.storyEntry.pick = park; await startStoryEntry();
        out.carried = w.story?.arc === 2 && w.story.dialogueProfiles?.[seo]?.fromPlayer === true && !w.story.dialogueProfiles?.[park];

        // 되돌리기: 두 번째 이야기를 시작하기 전 상태(1부 봉인 뒤)로 돌아간다
        await revertStory();
        out.reverted = !isStory(w) && w.storyLog?.length === 1 && !w.storySnap && !StorySnap.open.has(w.id);

        // 새 인물의 이름을 비우면 이야기 뼈대가 정한 이름으로 시작한다
        named = '윤가람'; S.storyEntry = null; openStoryEntry(); Object.assign(S.storyEntry, { mode: 'new', name: '', desc: '등대를 지키는 소녀' });
        await startStoryEntry();
        const npk = keyOf('윤가람');
        out.autoNamed = isStory(w) && w.story.protagonistKey === npk && w.story.entry === 'new' && w.entities[npk]?.type === '인물' && w.story.protagonist.desc === '등대를 지키는 소녀';
        out.namePrompt = lastBible.includes('protagonist.name') && lastBible.includes('"name":"주인공 이름"');
      } finally {
        callJson = original.callJson; generatePage = original.generatePage;
      }
      out.calls = calls;
      return out;
    });
    assert.strictEqual(r.panelStart, true, '설정 노트에 이야기 시작 버튼');
    assert.strictEqual(r.deadDisabled, true, '현재 시점에 죽은 인물은 고를 수 없다');
    assert.strictEqual(r.alivePick, true);
    assert.strictEqual(r.failKept, true, '실패하면 세계와 문서가 그대로다');
    assert.strictEqual(r.entered, true);
    assert.strictEqual(r.summaryKept, true, '빙의한 인물의 정의는 그대로 둔다');
    assert.deepStrictEqual(r.scene.nearby.length, 1, '닿을 수 있는 살아 있는 실제 인물만 남긴다');
    assert.strictEqual(r.scene.place, '북쪽 부두');
    assert.deepStrictEqual(r.ch1Section, [0, 1], '원래 본문 뒤에 1장 섹션이 붙는다');
    assert.strictEqual(r.snapOpen, true);
    assert.strictEqual(r.snapPage, 1, '처음 바뀐 문서의 원래 상태를 보관한다');
    assert.strictEqual(r.talkers.length, 1, '대화 목록은 만날 수 있는 인물만');
    assert.strictEqual(r.planReader, true);
    assert.strictEqual(r.planNoticed, true);
    assert.strictEqual(r.talkNoticedRule, true);
    assert.strictEqual(r.opening?.user, '', '상대가 먼저 건넨 말은 사용자 발언이 없는 차례'); assert.strictEqual(r.opening?.reply, '어, 서윤이네. 무슨 일이야?');
    assert.strictEqual(r.bondSent, '신뢰', '마음의 거리는 한 차례에 한 단계만 움직인다'); assert.strictEqual(r.bondHidden, true, '화면에 보이지 않는다'); assert.strictEqual(r.bondUndone, '편함');
    assert.deepStrictEqual(r.sent, { turns: 2, rel: '의심', noticed: 2, undoBtn: true });
    assert.deepStrictEqual(r.undone, { turns: 1, rel: '동료', noticed: 1, draft: '등대지기는 밀수꾼이지?', undoBtn: false }, '첫마디는 되돌리지 않는다');
    assert.deepStrictEqual(r.openingHtml, { self: 0, other: '어, 서윤이네. 무슨 일이야?' });
    assert.strictEqual(r.sealed, true);
    assert.strictEqual(r.arcSection, 1);
    assert.strictEqual(r.factSrc, 'a1ch1');
    assert.strictEqual(r.tl.src, 'a1ch1'); assert.strictEqual(r.tl.arc, 1); assert.strictEqual(r.tl.ch, undefined);
    assert.strictEqual(r.logBlock, true);
    assert.strictEqual(r.afterSealView, 'storyEntry');
    assert.strictEqual(r.carried, true, '앞 주인공의 기록이 다음 이야기의 대화 프로필로');
    assert.strictEqual(r.reverted, true, '되돌리기는 이야기 시작 직전 상태로');
    assert.strictEqual(r.autoNamed, true, '이름을 비우면 뼈대가 정한 이름으로 새 주인공을 만든다');
    assert.strictEqual(r.namePrompt, true);
    assert.deepStrictEqual(errors, []);
    console.log('story-arc ok');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
