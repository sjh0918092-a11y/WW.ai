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
      let failBlock = false, named = '', lastBible = '', lastScene = '', lastChat = '', lastReview = '', lastCast = '';
      callJson = async (kind, text) => {
        calls.push(kind);
        if (kind === 'storyBible') { lastBible = text; } if (kind === 'storyBible') return { protagonist: { ...(named ? { name: named } : {}), summary: '바뀌면 안 되는 새 정의', want: '배를 되찾는다', wound: '' }, storyPromise: { focus: '항구의 일상', central: { kind: 'goal', subject: '배' } }, spine: [{ n: 1, intent: '시작' }], clocks: [{ name: '밀수 조직', aim: '항구를 손에 넣는다', stages: ['부두 창고를 산다', '경비를 매수한다', '배를 빼돌린다', '항구를 장악한다'] }], secrets: [{ truth: '등대지기는 밀수꾼이다', cover: '성실한 등대지기', reveal: 3, clues: ['등대 창고의 젖은 밧줄', '선원이 본 밤배', '장부의 빈 날짜'] }], chapter1: { title: '사라진 배', era: '1201년', summary: '한서윤의 배가 사라졌다.', incident: '배가 사라졌다', nextChoices: ['부두로 간다', '박도현을 찾는다', '기다린다'] }, place: '북쪽 부두', nearby: [{ title: '박도현', why: '같은 부두에서 일한다' }, { title: '이노인', why: '' }, { title: '없는사람', why: '' }] };
        if (kind === 'chapterBlock') { if (failBlock) throw { code: 'invalid_json' }; return { blocks: [{ ch: 1, heading: '사라진 배', sections: [{ heading: '부두의 아침', level: 1, body: '그날 아침 배가 보이지 않았다.' }] }], infoboxPatch: [], summaryPatch: '', facts: [], relations: [], timeline: [], newEntities: [] }; }
        if (kind === 'storyCast' && globalThis.failKnow && text.includes('아는 것 정리만')) { await new Promise(r => setTimeout(r, 20)); throw { code: 'network' }; }
        if (kind === 'storyCast' && globalThis.castDelta) { lastCast = text; (globalThis.castPrompts ||= []).push(text); return { profile: {}, character: { key: globalThis.castDelta, state: 'available', evidence: '부두에 있다' }, player: { key: seo, state: 'available', evidence: '부두에 있다' }, relationship: '동료', bond: '편함', scene: '부두', opening: '', knowledgeAdded: [{ fact: '새로 안 것', via: 'experience', source: 'ch1', evidence: '봤다' }], knowledgeDropped: ['틀린 옛 항목'], chapterNews: [{ what: '부두에서 사람이 다친 채 발견됐다', reach: '항구 사람들' }] }; }
        if (kind === 'storyCast') return { profile: { personality: '무뚝뚝하다', lens: ['잘될 거라는 말에 토를 단다'], voice: '짧게 반말', examples: ['뭐야.', '비켜.'] }, character: { key: park, state: 'available', evidence: '부두에 있다' }, player: { key: seo, state: 'available', evidence: '부두에 있다' }, relationship: '동료', bond: '편함', scene: '부두', opening: '어, 서윤이네. 무슨 일이야?', knowledge: { known: [] } };
        if (kind === 'storyChat' && text.includes('이야기 서술자')) { lastScene = text; return { reply: '격납고 구석에 낡은 공구함이 있다—뚜껑이 열려 있다.', memory: '공구함을 찾았다', publicChange: '격납고 구석의 공구함이 열려 있다', reach: ['박도현', '없는사람'] }; }
        if (kind === 'storyChat') lastChat = text;
        if (kind === 'storyChatReview' && text.startsWith('## 한국어로 고치기')) { globalThis.koFix = (globalThis.koFix || 0) + 1; return { reply: '어, 베로니카도 몰라?', memory: '베로니카도 모른다' }; }
        if (kind === 'storyChatReview') { lastReview = text; return { fix: { reply: globalThis.jaReply ? 'へえ、ベロニカも知らないのか。' : '뭐?! 그걸 네가 어떻게 알아?', ...(globalThis.decide ? { worldAdded: [{ fact: '죽은 작업자는 3교대 정비병 카일이다', knownBy: '같은 구역 정비 인원' }] } : {}) } }; }
        if (kind === 'storyChat') return { ended: !!globalThis.endTalk, mood: '크게 놀람', selfAdded: ['어릴 때 항구 마을에서 자랐다'], reply: '뭐? 그걸 네가 어떻게 알아?', memory: '한서윤이 등대지기 이야기를 꺼냈다', important: true, character: { key: park, state: 'available', evidence: '' }, player: { key: seo, state: 'available', evidence: '' }, relationship: '의심', bond: '각별함', scene: '부두', noticed: '들은 적 없는 이야기를 알고 있었다', knowledgeAdded: [{ fact: '한서윤이 등대지기가 밀수꾼이라고 말했다', via: 'told', source: 'user', evidence: '이번 발언' }] };
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
        out.known = ts.knowledge.known.map(x => x.fact);
        out.self = { saved: (w.story.dialogueProfiles[park].self || []).includes('어릴 때 항구 마을에서 자랐다'), rules: lastChat.includes('성격이 먼저다') && lastChat.includes('장면 안의 시간은 흐른다') && lastChat.includes('지어내 답한다') && lastChat.includes('한두 차례 안에 결판을 낸다') && lastChat.includes('"selfAdded"') && lastReview.includes('지시가 아니니 둔다') };
        out.fix = { reply: ts.turns[ts.turns.length - 1].reply, mood: ts.mood, rule: lastChat.includes('감정은 실제로 흔들린다') && lastChat.includes('"mood"'), review: lastReview.includes('{"fix":{}}') };
        out.sent = { turns: ts.turns.length, rel: ts.relationship, noticed: (w.story.noticed || []).length, undoBtn: !!document.querySelector('[data-act="talk-undo"]') };
        await undoStoryTalk();
        out.bondUndone = STORY_TALK_BONDS[storyBond(w, park)];
        out.knownUndone = ts.knowledge.known.length;
        out.moodUndone = ts.mood;
        out.selfUndone = (w.story.dialogueProfiles[park].self || []).length;
        out.undone = { turns: ts.turns.length, rel: ts.relationship, noticed: (w.story.noticed || []).length, draft: ts.draft, undoBtn: !!document.querySelector('[data-act="talk-undo"]') };
        // 말/행동 전환: 행동으로 보낸 차례는 행동으로 기록되고 프롬프트에도 행동으로 전해진다
        S.talkAct = true; ts.draft = '서류를 빼앗는다'; await sendStoryTalk();
        out.actTurn = !!ts.turns[ts.turns.length - 1].act && lastChat.includes('행동이다') && !!document.querySelector('.talk-act');
        await undoStoryTalk(); out.actUndo = S.talkAct === true && ts.draft === '서류를 빼앗는다'; S.talkAct = false; ts.draft = '';
        // 상황 채널: 상대 없이 한 행동을 서술자가 받는다
        storyTalkSession(w, park).state = 'absent';
        openStoryTalk('@scene'); storyTalkSession(w, '@scene', true).draft = '격납고 구석을 살핀다'; await sendStoryTalk();
        out.reach = { after: storyTalkSession(w, park).state };
        await undoStoryTalk(); out.reach.undone = storyTalkSession(w, park).state;
        storyTalkSession(w, '@scene').draft = '격납고 구석을 살핀다'; await sendStoryTalk();
        out.reach.again = storyTalkSession(w, park).state;
        out.reach.context = !!storyTalkContext(w, park).elsewhereThisChapter?.visibleChanges?.some(x => x.where === '주인공 혼자' && x.change.includes('공구함'));   // 혼자 한 행동도 바깥으로 드러난 것만
        const sc = storyTalkSession(w, '@scene');
        out.sceneCh = { turns: sc.turns.length, act: sc.turns[0]?.act, reply: sc.turns[0]?.reply, secrets: lastScene.includes('등대지기는 밀수꾼이다') && lastScene.includes('쓰지 않는다'), chip: !!document.querySelector('[data-talk-key="@scene"][aria-pressed="true"]') };
        out.deeds = storyChapterDeeds(w);
        S.adv = { pick: -1, custom: '', err: '' }; S.view = { name: 'advance' }; renderMain();
        out.advance = { did: document.querySelector('#main').textContent.includes('이번 장에 한 일'), radios: document.querySelectorAll('input[name="advPick"]').length };
        const plan2 = chapterPlanPrompt(w, 2, null);
        out.planAgency = plan2.includes('플레이어가 하지 않은 주인공의 결정') && plan2.includes('상황(서술자)') && plan2.includes('주인공의 행동');
        S.view = { name: 'storyTalk', key: park }; renderMain();
        out.openingHtml = { self: document.querySelectorAll('.talk-chapter .talk-self').length, other: document.querySelector('.talk-chapter .talk-other .talk-bubble')?.textContent };
        // 준비도 바꿀 것만: 프로필이 있으면 비워 두고, 지식은 이어받은 목록에 새로 안 것만 더하고 틀린 것만 뺀다
        { const ts2 = storyTalkSession(w, park), keepProfile = JSON.stringify(w.story.dialogueProfiles[park]);
          ts2.knowledge = { known: [...ts2.knowledge.known, { fact: '틀린 옛 항목', via: 'told', source: 'user', evidence: '들었다' }] };
          const kept = ts2.knowledge.known.length; ts2.stamp = 'old'; globalThis.castDelta = park;
          await prepareStoryTalk(park); globalThis.castDelta = '';
          const facts = storyTalkSession(w, park).knowledge.known.map(x => x.fact);
          { const j1 = {}, j2 = {}, head = '{"character":{"key":"x","state":"available","evidence":"e"},"player":{"key":"y","state":"available","evidence":"e"},"relationship":"r","bond":"편함","opening":"어, 왔어? 잠깐';
            storyTalkCastPartial(w, park, j1, head); storyTalkCastPartial(w, park, j2, head.replace('"state":"available","evidence":"e"},"player"', '"state":"dead","evidence":"e"},"player"'));
            out.early = { shown: j1.opening, dead: j2.opening || '', order: (t => t.lastIndexOf('"opening":') < t.lastIndexOf('"profile":'))(castPrompts.find(t => t.includes('"opening":'))) }; }
          { const c = curCh(w), saved = JSON.stringify(c.where || null), pk = w.story.protagonistKey;
            storyArcScene(w, c, { place: { place: '북쪽 부두', detail: '3번 선착장' }, nearby: [{ title: w.entities[park].title, why: '같은 항구', place: { place: '등대', detail: '꼭대기', summary: '항구 끝 등대' } }, { title: '등대', why: '', place: { place: w.entities[park].title } }] });
            const lk = keyOf('등대');
            out.where = { stub: w.entities[lk]?.type === '지명' && w.entities[lk]?.page === false, pk: storyWhereText(storyWhere(w, pk)), park: storyWhereText(storyWhere(w, park)), line: storyTalkPlaceLine(w, park).includes('「등대」 · 꼭대기'), rule: storyTalkWhereRule().includes('"place":"장소 문서 제목"'), visit: storyTalkVisitLine(w, park).includes('찾아가서 시작한다'), noPersonPlace: !storySetWhere(w, park, { place: w.entities[pk].title }) };
            storyTalkApplyWhere(w, park, { where: { player: { place: '등대', detail: '계단' }, character: null } }); out.where.moved = storyWhereText(storyWhere(w, pk));
            c.where = JSON.parse(saved) || undefined; if (!c.where) delete c.where; }
          { const ts4 = storyTalkSession(w, park), turns = ts4.turns.length, prof = JSON.stringify(w.story.dialogueProfiles[park]); ts4.stamp = 'old'; globalThis.failKnow = true; globalThis.castDelta = park;
            await prepareStoryTalk(park); globalThis.failKnow = false;
            out.halfFail = { ready: storyTalkReady(w, park), err: /준비하지 못했습니다/.test(ts4.err || ''), turns: ts4.turns.length === turns, profile: JSON.stringify(w.story.dialogueProfiles[park]) === prof };
            await prepareStoryTalk(park); globalThis.castDelta = ''; }
          { const c = curCh(w), turnIdx = storyTalkSession(w, park).turns.length - 1;
            storyApplyHearsay(w, c, [{ source: `dialogue:1:${park}:${turnIdx}`, from: w.entities[park].title, to: w.entities[old].title, what: '주인공이 박도현에게 등대지기를 의심한다고 털어놨다더라' },
              { source: 'dialogue:1:없는키:0', to: w.entities[old].title, what: '근거 없는 말' }, { source: `dialogue:1:${park}:${turnIdx}`, to: w.entities[seo].title, what: '주인공에게 옮김' }]);
            const ctx = storyTalkContext(w, old, { slim: true });
            out.hearsay = { kept: (c.hearsay || []).length, ctx: ctx.hearsay?.[0]?.what, from: ctx.hearsay?.[0]?.from === w.entities[park].title, castRule: storyTalkCastPrompt(w, old, 'B').includes('hearsay는 장이 넘어가는 동안'), plan: chapterPlanPrompt(w, 2, null).includes('## 말 옮기기') && chapterPlanPrompt(w, 2, null).includes('"hearsay":[') };
            { const os = Object.assign(storyTalkSession(w, old, true), {}), keepK = os.knowledge; os.knowledge = { known: [{ fact: '주인공이 등대지기를 의심한다', via: 'told', source: 'hearsay:1:0', evidence: '박도현에게 들음' }] };
              const op3 = storyTalkPrompt(w, old, '그거 어떻게 알아?'); out.hearsay.heardFrom = op3.includes('"heardFrom":"' + w.entities[park].title + '"') && op3.includes('들은 적 없는 척 사실과 다르게 지어내지는 않는다');
              out.hearsay.privateRule = storyTalkCastPrompt(w, old, 'B').includes('작가 시점의 기록이다'); os.knowledge = keepK; }
            delete c.hearsay; }
          { const os = storyTalkSession(w, old, true), keepK = os.knowledge; os.knowledge = os.knowledge || { known: [] };
            const a1 = storyTalkPrompt(w, park, '안녕').split(PROMPT_CACHE_BREAK), b1 = storyTalkPrompt(w, old, '다른 말').split(PROMPT_CACHE_BREAK), r1 = lastReview.split(PROMPT_CACHE_BREAK);
            out.cache = { draftSame: a1.length === 2 && a1[0] === b1[0] && !a1[0].includes(w.entities[park].title), draftLong: a1[0].length > 3000, reviewHead: r1.length >= 2 && r1[0].startsWith('## 스토리 대화 지식·설정 검토') && r1[0].includes('출력은 JSON 하나: {"fix"') && r1[0].includes('## 스토리 자유 대화'), identity: a1[1].startsWith('이번 대화: 너는 ' + w.entities[park].title) };
            if (keepK) os.knowledge = keepK; }
          out.stranger = { far: storyTalkVisitLine(w, old).includes('플레이어가 이름으로 찾아 불렀다'), near: !storyTalkVisitLine(w, park).includes('이름으로 찾아'), opening: storyTalkCastPrompt(w, old, 'A').includes('빈 문자열 금지'), talk: storyTalkPrompt(w, park, '누구세요').includes('서비스 직원처럼 응대하지 않는다') };
          out.castDelta = { profile: JSON.stringify(w.story.dialogueProfiles[park]) === keepProfile, count: facts.length === kept, added: facts.includes('새로 안 것'), dropped: !facts.includes('틀린 옛 항목'), ready: storyTalkReady(w, park), prompt: castPrompts.some(t => t.includes('{} 또는 고친 전체 프로필') && !t.includes('"knowledgeDropped"')) && castPrompts.some(t => t.includes('"knowledgeDropped"') && t.includes('아는 것 정리만')) };
        }
        // 장의 변화를 인물 문서에 반영(동기화)해도 대화를 다시 준비하지 않는다
        { const ts3 = storyTalkSession(w, park), pg = S.pages[park];
          pg.sections = (pg.sections || []).filter(x => !x.ch); pg.syncedTo = 0; delete pg.baseAsOf; const cc = curCh(w); cc.affected = [...(cc.affected || []).filter(a => a.key !== park), { key: park, change: '배가 사라진 것을 알았다' }]; await Store.savePage(w.id, pg);
          ts3.stamp = storyTalkStamp(w, park);
          const casts = calls.filter(c => c === 'storyCast').length;
          await runSync(park);
          out.syncKeep = { synced: (S.pages[park].sections || []).some(x => x.ch === w.story.chapter), stamp: ts3.stamp === storyTalkStamp(w, park), ready: storyTalkReady(w, park) };
          await prepareStoryTalk(park); out.syncKeep.noCast = calls.filter(c => c === 'storyCast').length === casts;
        }
        // 대화 준비 다시: 이미 말을 나눴으면 상태·장면·대화는 두고 아는 것만 다시 정리한다
        { const ts = storyTalkSession(w, park), keepTurns = ts.turns.slice();
          { const casts = calls.filter(c => c === 'storyCast').length; ts.turns = ts.turns.filter(t => t.opening); ts.scene = '옛 장면';   // 첫마디뿐이면 첫마디까지 처음부터
            globalThis.castDelta = park; await redoStoryTalk(park); globalThis.castDelta = '';
            out.redoFull = { two: calls.filter(c => c === 'storyCast').length === casts + 2, scene: ts.scene === '부두', ready: storyTalkReady(w, park) }; }
          ts.turns = keepTurns.some(t => !t.opening) ? keepTurns : [...keepTurns, { user: '안녕', reply: '응', memory: '인사', state: 'available', knowledgeVersion: STORY_TALK_KNOWLEDGE, at: Date.now() }];
          const turns = ts.turns.length, scene = ts.scene, casts = calls.filter(c => c === 'storyCast').length;
          S.view = { name: 'storyTalk', key: park }; renderMain(); const btn = !!document.querySelector('[data-act="talk-redo"]');
          ts.knowledge = { known: ts.knowledge.known.filter(x => x.fact !== '새로 안 것') }; ts.scene = '그대로인 장면';
          globalThis.castDelta = park; await redoStoryTalk(park); globalThis.castDelta = '';
          out.redo = { btn, one: calls.filter(c => c === 'storyCast').length === casts + 1, turns: ts.turns.length === turns, scene: ts.scene === '그대로인 장면', added: ts.knowledge.known.some(x => x.fact === '새로 안 것'), ready: storyTalkReady(w, park) };
          ts.scene = scene; ts.turns = keepTurns;
          { const dp = storyTalkPrompt(w, park, '무슨 일 있었어?');
            out.redo.news = JSON.stringify(curCh(w).news) === JSON.stringify([{ what: '부두에서 사람이 다친 채 발견됐다', reach: '항구 사람들' }]) && dp.split(PROMPT_CACHE_BREAK)[1].includes('부두에서 사람이 다친 채 발견됐다') && dp.split(PROMPT_CACHE_BREAK)[0].includes('reach에 들면') && !storyTalkCastPrompt(w, park, 'B').includes('"chapterNews"'); }
          out.redo.publicRule = storyTalkCastPrompt(w, park, 'B').includes('성격상 숨길 수 없는 사건') && storyTalkPrompt(w, park, '무슨 일 있었어?').includes('당연히 보고받거나 전해 들었을 공개된 사건'); }
        // 한 번에 한 사람: 대화 중에는 다른 인물·상황으로 옮기지 않고, 끝내면 상대가 작별 인사를 한다
        { w.story.talkExtra = [old];
          out.lock = { active: storyTalkActive(w) === park, listed: storyTalkers(w).includes(old) };
          openStoryTalk(old); out.lock.view = S.view.key === old; renderMain();   // 대화 중에도 다른 탭의 지난 대화는 볼 수 있다
          out.lock.chips = { old: document.querySelector(`[data-talk-key="${old}"]`)?.disabled, scene: document.querySelector('[data-talk-key="@scene"]')?.disabled, input: document.querySelector('#storyTalkInput')?.disabled, back: !!document.querySelector('[data-act="talk-back"]'), start: !!document.querySelector('[data-act="talk-start"]'), noCast: !S.storyTalkJob };
          openStoryTalk(park); renderMain(); out.lock.chips.end = !!document.querySelector('[data-act="talk-end"]');
          const before = storyTalkSession(w, park).turns.length;
          await endStoryTalk();
          const tt = storyTalkSession(w, park).turns;
          out.lock.farewell = { added: tt.length - before, ev: tt[tt.length - 1].ev, user: tt[tt.length - 1].user, prompt: lastChat.includes('자리를 뜨려 한다'), active: storyTalkActive(w), ended: !!document.querySelector('.talk-end'), input: document.querySelector('#storyTalkInput')?.disabled, again: document.querySelector('[data-act="talk-start"]')?.textContent === '다시 말 걸기', oldChip: document.querySelector(`[data-talk-key="${old}"]`)?.disabled, undo: storyTalkCanUndo(w, park) };
          { const casts = calls.filter(c => c === 'storyCast').length; openStoryTalk(old); renderMain();
            out.lock.lazy = { noCast: calls.filter(c => c === 'storyCast').length === casts && !S.storyTalkJob, start: document.querySelector('[data-act="talk-start"]')?.textContent, input: document.querySelector('#storyTalkInput')?.disabled };
            openStoryTalk(park); }
          Object.assign(storyTalkSession(w, old, true), { knowledge: { known: [] } }); const op = storyTalkPrompt(w, old, '무슨 일 있었어?');
          // 다른 대화의 내용은 넘기지 않고, 누구를 만났는지와 바깥으로 드러난 변화만 넘긴다(검토에는 누설 확인용으로 내용까지)
          { const pt = storyTalkSession(w, park).turns, last = pt[pt.length - 1], keepPC = last.publicChange; last.publicChange = '기관실 쪽에서 쇳소리가 크게 났다'; last.secretLine = 1;
            const op2 = storyTalkPrompt(w, old, '무슨 일 있었어?'), full = JSON.stringify(storyTalkElsewhere(w, old, { full: true }));
            out.lock.elsewhere = op.includes('이번 장에 주인공이 이 인물과 떨어져 겪은 일') && op.includes(w.entities[park].title) && op.includes('주인공이 다른 인물과 나눈 말, 둘 사이에 있었던 일') && !op.includes('"result":') && op2.includes('기관실 쪽에서 쇳소리가 크게 났다') && !op2.includes(last.reply) && full.includes('"result":') && full.includes(String(last.memory || last.reply).slice(0, 10));
            if (keepPC) last.publicChange = keepPC; else delete last.publicChange; delete last.secretLine; }
          { const c = curCh(w); c.where = { [w.story.protagonistKey]: { place: '북쪽 부두', detail: '' }, [park]: { place: '등대', detail: '꼭대기' } }; renderMain();
            out.lock.goLabel = document.querySelector('[data-act="talk-start"]')?.textContent; out.lock.chipPlace = document.querySelector(`[data-talk-key="${park}"] small`)?.textContent; }
          await storyTalkBegin(w, park);
          out.lock.went = storyWhereText(storyWhere(w, w.story.protagonistKey)); delete curCh(w).where;
          const t2 = storyTalkSession(w, park).turns;
          out.lock.back = { ev: t2[t2.length - 1].ev, prompt: lastChat.includes('다시 찾아왔다'), active: storyTalkActive(w) === park, plan: chapterPlanPrompt(w, 2, null).includes('(주인공이 대화를 끝내고 자리를 떴다)') };
          globalThis.endTalk = true; storyTalkSession(w, park).draft = '저 가볼게요'; await sendStoryTalk(); globalThis.endTalk = false;
          { const t3 = storyTalkSession(w, park).turns; renderMain();
            out.lock.spoken = { ended: t3[t3.length - 1].ended, active: storyTalkActive(w), last: storyTalkLastEvent(w, park), shown: !!document.querySelector('.talk-end'), rule: lastChat.includes('대화의 끝:') && lastChat.includes('"ended":false') && !lastChat.includes('되묻는 말까지') };
            await undoStoryTalk(); out.lock.spoken.undo = storyTalkActive(w) === park; }
          w.story.status = 'ended'; out.lock.afterEnding = storyTalkActive(w) === park; w.story.status = 'active';   // 결말 이후의 대화도 한 번에 한 사람
          w.story.chapter = 2; out.lock.chapterEnds = storyTalkActive(w) === ''; w.story.chapter = 1;
          delete w.story.talking; w.story.talkExtra = [];
        }
        { const bk = keyOf('브룬힐데 에이르'); w.entities[bk] = newEntity('브룬힐데 에이르', '인물', '함장'); w.entities[bk].type = '인물';
          const mp = storyTalkPrompt(w, park, '저 브룬힐데 님 좋아해요'), none = storyTalkPrompt(w, park, '오늘 날씨 좋네');
          out.mention = mp.includes('이번 말에 나온 이 세계의 대상') && mp.includes('브룬힐데 에이르') && !none.includes('이번 말에 나온 이 세계의 대상'); delete w.entities[bk]; }
        // 조사로 정한 사실은 기록해 다른 인물·다음 장과 맞추고, 일본어가 섞이면 한국어로 고친다
        { const c = curCh(w); w.story.talking = { key: park, ch: w.story.chapter };
          globalThis.decide = true; globalThis.jaReply = true; storyTalkSession(w, park).draft = '그 작업자가 누군지 아세요?'; await sendStoryTalk(); globalThis.decide = false; globalThis.jaReply = false;
          const tt = storyTalkSession(w, park).turns, last = tt[tt.length - 1];
          out.decide = { stored: (c.decided || []).some(x => x.fact === '죽은 작업자는 3교대 정비병 카일이다' && x.by === park), other: storyTalkPrompt(w, old, '작업자 알아요?').split(PROMPT_CACHE_BREAK)[1].includes('3교대 정비병 카일'), rule: storyTalkPrompt(w, old, 'x').split(PROMPT_CACHE_BREAK)[0].includes('누구나 모른다고 하면 이야기가 멈춘다'), plan: chapterPlanPrompt(w, 2, null).includes('3교대 정비병 카일'), scene: storyScenePrompt(w, '시신을 살핀다').includes('3교대 정비병 카일'), ko: last.reply === '어, 베로니카도 몰라?' && globalThis.koFix === 1 };
          await undoStoryTalk(); out.decide.undo = !(curCh(w).decided || []).length; delete w.story.talking; }
        { const keep = w.story.wish; w.story.wish = '용의선상 인물을 여럿 만들어 줘';
          const plan = chapterPlanPrompt(w, 2, null), blk = chapterBlockPrompt(w, w.story.protagonistKey, [1]), other = chapterBlockPrompt(w, park, [1]);
          out.wish = plan.includes('용의선상 인물을 여럿 만들어 줘') && plan.includes('새 인물을 최대 4명까지') && blk.includes('1장 첫 장면에 등장시키거나 언급하며') && !other.includes('최대 4명');
          if (keep) w.story.wish = keep; else delete w.story.wish; out.wish = out.wish && !chapterPlanPrompt(w, 2, null).includes('최대 4명까지'); }
        { const t = w.entities[old].title; S.pages[old] = { ...(S.pages[old] || { key: old, title: t, sections: [] }), infobox: [{ label: '성별', value: '여성' }] };
          const dp = storyTalkPrompt(w, park, `${t} 알아?`), parts = dp.split(PROMPT_CACHE_BREAK), plain = storyTalkPrompt(w, park, '안녕');
          out.mention = parts[0].includes('어긋나는 사실(성별, 나이, 소속') && /mentioned\(.*성별: 여성/.test(parts[1]) && !plain.split(PROMPT_CACHE_BREAK)[1].includes('mentioned(') && storyScenePrompt(w, `${t}을 찾는다`).includes('성별: 여성'); }
        out.talkNoticedRule = storyTalkPrompt(w, park, '등대지기는 밀수꾼이지?').includes('noticed');

        // 봉인: 장 표시와 장 출처를 이야기 번호가 붙은 일반 기록으로 바꾸고 이야기를 보관한다
        addFact(w.entities[park], '박도현은 배를 찾는 데 나섰다', 'ch1');
        w.timeline.push({ year: '1201년', event: '배가 사라졌다', src: 'ch1', ch: 1 });
        st.status = 'ended'; st.endedAt = Date.now();
        // 마무리 전 밀린 반영: 열어 보지 않은 문서도 정리 전에 반영한다. 실패하면 마무리를 멈춘다
        { const pg = S.pages[park]; pg.sections = (pg.sections || []).filter(x => !x.ch); pg.syncedTo = 0; delete pg.baseAsOf;
          const c1 = st.chapters[0]; c1.affected = [...(c1.affected || []).filter(a => a.key !== park), { key: park, change: '배가 사라진 것을 알았다' }];
          failBlock = true; await sealStory(); failBlock = false;
          out.sealStop = isStory(w) && missingChs(w, park).length === 1; }
        await sealStory();
        out.sealSync = S.pages[park].sections.some(s => s.arc === 1 && s.arcCh === 1);
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
        out.clock = { rule: lastBible.includes('세계의 시계(clocks)') && lastBible.includes('"clocks":[') && lastBible.includes('"clues":['), at: S.world.story.clocks?.[0]?.at, stages: S.world.story.clocks?.[0]?.stages?.length, clues: S.world.story.secrets?.[0]?.clues?.length };
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
    assert.strictEqual(r.mention, true, '말에 나온 인물은 이름 일부로도 찾아 자료로 준다');
    assert.strictEqual(r.opening?.user, '', '상대가 먼저 건넨 말은 사용자 발언이 없는 차례'); assert.strictEqual(r.opening?.reply, '어, 서윤이네. 무슨 일이야?');
    assert.strictEqual(r.bondSent, '신뢰', '마음의 거리는 한 차례에 한 단계만 움직인다'); assert.strictEqual(r.bondHidden, true, '화면에 보이지 않는다'); assert.strictEqual(r.bondUndone, '편함');
    assert.deepStrictEqual(r.self, { saved: true, rules: true }, '지어 말한 신상은 프로필에 남는다'); assert.strictEqual(r.selfUndone, 0, '되돌리면 신상도 빠진다');
    assert.deepStrictEqual(r.clock, { rule: true, at: 0, stages: 4, clues: 3 }, '이야기를 시작할 때 세계의 시계와 단서를 정한다');
    assert.deepStrictEqual(r.early, { shown: '어, 왔어? 잠깐', dead: '', order: true }, '준비 중 첫마디는 둘 다 대화할 수 있을 때만 먼저 보인다');
    assert.deepStrictEqual(r.where, { stub: true, pk: '「북쪽 부두」 · 3번 선착장', park: '「등대」 · 꼭대기', line: true, rule: true, visit: true, noPersonPlace: true, moved: '「등대」 · 계단' }, '위치는 장소 항목에 묶이고 새 장소는 문서 없이 항목만 생긴다');
    assert.strictEqual(r.sealStop, true, '밀린 반영이 실패하면 마무리하지 않는다'); assert.strictEqual(r.sealSync, true, '마무리 전에 밀린 문서를 반영한다');
    assert.deepStrictEqual(r.halfFail, { ready: false, err: true, turns: true, profile: true }, '두 갈래 중 하나라도 실패하면 준비 전체가 실패하고 아무것도 바뀌지 않는다');
    assert.deepStrictEqual(r.hearsay, { kept: 1, ctx: '주인공이 박도현에게 등대지기를 의심한다고 털어놨다더라', from: true, castRule: true, plan: true, heardFrom: true, privateRule: true }, '실제 대화에서 나온 말만 가까운 인물에게 옮겨지고, 그 인물의 준비가 들은 말로 받는다');
    assert.deepStrictEqual(r.stranger, { far: true, near: true, opening: true, talk: true }, '근처에 없는 인물은 닿을 수 있는지 판정하고, 처음 보는 사이도 첫마디와 반응이 있다');
    assert.deepStrictEqual(r.cache, { draftSame: true, draftLong: true, reviewHead: true, identity: true }, '대화·검토 프롬프트의 앞부분(지침)은 인물·차례와 상관없이 같아 캐시가 재사용한다');
    assert.deepStrictEqual(r.castDelta, { profile: true, count: true, added: true, dropped: true, ready: true, prompt: true }, '준비는 프로필을 다시 쓰지 않고 지식은 바뀐 것만 받는다');
    assert.strictEqual(r.wish, true, '바라는 이야기는 장마다 따르고, 새 인물을 바라면 수 제한보다 우선한다');
    assert.strictEqual(r.mention, true, '대화에 나온 인물의 문서 요지를 주어 성별·소속 같은 사실을 어긋나게 지어내지 않게 한다');
    assert.deepStrictEqual(r.decide, { stored: true, other: true, rule: true, plan: true, scene: true, ko: true, undo: true }, '조사로 정한 사실은 기록해 공유하고 되돌릴 수 있으며, 일본어 응답은 한국어로 고친다');
    assert.deepStrictEqual(r.redoFull, { two: true, scene: true, ready: true }, '말을 나누기 전이면 대화 준비 다시는 처음부터 다시 준비한다');
    assert.deepStrictEqual(r.redo, { btn: true, one: true, turns: true, scene: true, added: true, ready: true, news: true, publicRule: true }, '대화 준비 다시는 말을 나눈 뒤면 아는 것만 다시 정리하고 공개 사건 규칙을 따른다');
    assert.deepStrictEqual(r.syncKeep, { synced: true, stamp: true, ready: true, noCast: true }, '장 반영(동기화) 뒤에도 대화 준비를 다시 하지 않는다');
    assert.deepStrictEqual(r.lock, { active: true, listed: true, view: true, chips: { old: false, scene: false, input: true, back: true, start: false, noCast: true, end: true },
      farewell: { added: 1, ev: 'farewell', user: '', prompt: true, active: '', ended: true, input: true, again: true, oldChip: false, undo: false }, elsewhere: true,
      back: { ev: 'return', prompt: true, active: true, plan: true }, lazy: { noCast: true, start: '대화 시작', input: true }, afterEnding: true, spoken: { ended: true, active: '', last: 'farewell', shown: true, rule: true, undo: true }, goLabel: '「등대」로 가서 대화', chipPlace: '등대', went: '「등대」 · 꼭대기', chapterEnds: true }, '대화 중에는 다른 상대로 못 옮기고, 끝내면 작별 인사, 다시 찾아가면 새 첫마디');
    assert.deepStrictEqual(r.fix, { reply: '뭐?! 그걸 네가 어떻게 알아?', mood: '크게 놀람', rule: true, review: true }, '검토는 고친 필드만 돌려주고 나머지는 초안을 쓴다. 기분은 저장된다'); assert.strictEqual(r.moodUndone, '', '되돌리면 기분도 되돌아간다');
    assert.deepStrictEqual(r.known, ['한서윤이 등대지기가 밀수꾼이라고 말했다'], '이번에 새로 안 것만 받아 기존 지식에 합친다'); assert.strictEqual(r.knownUndone, 0);
    assert.deepStrictEqual(r.sent, { turns: 2, rel: '의심', noticed: 2, undoBtn: true });
    assert.deepStrictEqual(r.undone, { turns: 1, rel: '동료', noticed: 1, draft: '등대지기는 밀수꾼이지?', undoBtn: false }, '첫마디는 되돌리지 않는다');
    assert.strictEqual(r.actTurn, true, '행동으로 보낸 차례'); assert.strictEqual(r.actUndo, true, '되돌리면 행동 모드와 입력이 돌아온다');
    assert.deepStrictEqual(r.sceneCh, { turns: 1, act: true, reply: '격납고 구석에 낡은 공구함이 있다, 뚜껑이 열려 있다.', secrets: true, chip: true });
    assert.deepStrictEqual({ talks: r.deeds.talks, acts: r.deeds.acts, scene: r.deeds.scene }, { talks: 0, acts: 0, scene: 1 });
    assert.deepStrictEqual(r.reach, { after: 'available', undone: 'absent', again: 'available', context: true }, '상황에서 찾아낸 인물은 연락 불가가 풀린다');
    assert.deepStrictEqual(r.advance, { did: true, radios: 0 }, '이번 장에 말이나 행동을 했으면 선택지를 보이지 않는다');
    assert.strictEqual(r.planAgency, true);
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
