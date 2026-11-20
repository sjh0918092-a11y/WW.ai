/* 실제 UI·저장·장 전환을 가짜 AI 응답으로 검증. 유료 API 호출 없음. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
const server = appServer();
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try { browser = await chromium.launch(); } catch (e) { await new Promise(r=>server.close(r)); throw e; }
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => S.ready && Nav.active && !Nav.restoring);
    const transport = await page.evaluate(async () => {
      const originalFetch=window.fetch, enabled=AIJobs.enabled, run=AIJobs.run;
      let queued=false, chunks=[], requests=0;
      GS.pass='test-pass';
      AIJobs.enabled=()=>true;
      AIJobs.run=async()=>{queued=true;throw new Error('일반 대화가 대기열에 들어감');};
      window.fetch=async()=>{ requests++; const enc=new TextEncoder(); return new Response(new ReadableStream({start(c){
        const event=text=>'data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n';
        c.enqueue(enc.encode(event('{"reply":"안녕')));
        c.enqueue(enc.encode(event('하세요","memory":"인사","important":false,"state":"available"}')));
        c.close();
      }}),{headers:{'Content-Type':'text/event-stream'}});};
      try { const out=await gemini.json('가짜 스트리밍 테스트',{modelTier:'default',taskKind:'storyChat',liveStream:true,onText:u=>chunks.push(storyTalkPartial(u.text))}); return {queued,chunks,requests,reply:out.reply}; }
      finally {window.fetch=originalFetch;AIJobs.enabled=enabled;AIJobs.run=run;}
    });
    assert.equal(transport.queued,false); assert.equal(transport.requests,1);
    assert.deepEqual(transport.chunks,['안녕','안녕하세요']); assert.equal(transport.reply,'안녕하세요');
    await page.evaluate(async () => {
      const entity = title => ({ title, type: '인물', summary: title + '의 설정', facts: [], mentions: [], page: true });
      const w = { id: 'talk-test', kind: 'world', title: '대화 세계', mode: 'story', mainKey: 'hero', seed: '서로 협력하는 인물들', era: '2026년', rules: [], relations: [], timeline: [], navboxes: {}, entities: { hero: entity('주인공'), friend: entity('동료'), dead: entity('죽은 인물'), asleep: entity('기절한 인물'), away: entity('멀리 떠난 인물') }, story: { protagonistKey: 'hero', protagonist: {}, chapter: 1, total: 5, status: 'active', cast: [], secrets: [{ id: 's1', truth: '누설하면 안 되는 진실', cover: '아직 알려지지 않았다', revealed: false }], spine: ['발단','전개','위기','절정','결말'].map((beat,i) => ({ n:i+1, beat, intent: '관계가 이어진다' })), chapters: [{ n: 1, title: '만남', era: '2026년', summary: '동료는 기다리고 있으며, 다른 인물은 각각 사망하거나 기절하거나 멀리 떠났다.', explore: { opened: {}, created: [], edited: [], searched: [] }, affected: [], nextChoices: ['동료를 돕는다'] }] } };
      S.world = w; S.worlds = [w]; S.pages = Object.fromEntries(Object.entries(w.entities).map(([key,e]) => [key, { key, title:e.title, type:'인물', summary:e.summary, infobox:[], sections:[{ heading:'개요', level:1, body:e.summary }], categories:[], links:[], createdAt:1 }]));
      await Store.saveWorld(w); for (const p of Object.values(S.pages)) await Store.savePage(w.id,p);
      globalThis.talkCalls = []; globalThis.talkMode = 'normal';
      S.sample = { json: async (prompt,opts) => {
        talkCalls.push({ prompt, kind: opts.taskKind, tier: opts.modelTier, live:opts.liveStream });
        if (opts.taskKind === 'storyCast') {
          const key = S.view.key;
          return { profile:{ personality:'신중하며 약속을 지킨다', voice:'짧은 존댓말. 상대를 이름으로 부른다', examples:['기다렸습니다.','그 부탁은 어렵습니다.'] }, state:({ dead:'dead', asleep:'unconscious', away:'absent' })[key] || 'available', playerState:'available', reason:'현재 사건에 따른 상태', relationship:'협력 관계', knowledge:'현재 만남만 알고 있다' };
        }
        if (opts.taskKind === 'storyChat') {
          const out = { reply:'내일 길목에서 기다리겠습니다.', memory:'동료는 주인공과 내일 길목에서 만나기로 약속했다.', important:talkMode==='important', state:'available', playerState:talkMode==='faint'?'unconscious':'available', reason:'약속을 정했다', relationship:'약속한 사이', knowledge:'내일 만날 장소를 안다' };
          opts.onText?.({text:'{"reply":"내일 길목'});
          if (talkMode==='hold') await new Promise((resolve,reject) => { globalThis.releaseTalk=resolve; opts.signal.addEventListener('abort',()=>reject({code:'cancelled'}),{once:true}); });
          if (talkMode==='failure') throw {code:'network'};
          if (opts.signal.aborted) throw {code:'cancelled'};
          return out;
        }
        if (opts.taskKind === 'storyChatReview') return { reply:talkMode==='faint'?'주인공이 쓰러져 대화가 멈췄다.':'만나는 것은 아직 약속할 수 없습니다.', memory:talkMode==='faint'?'주인공이 기절하여 대화를 멈췄다.':'동료는 만남의 약속을 거절했다.', state:'available', playerState:talkMode==='faint'?'unconscious':'available', relationship:'협력 관계', knowledge:'현재 만남만 안다', correction:'확정 설정에 맞춰 응답을 수정했습니다.' };
        if (opts.taskKind === 'chapterPlan') return { title:'약속의 길목', era:'2026년', summary:'동료가 길목에서 기다렸다.', protagonistBlock:{heading:'약속의 길목',sections:[{heading:'만남',body:'동료는 주인공과 한 약속에 따라 길목에서 기다렸다.'}],infoboxPatch:[]}, dialogueConsequences:[{character:'동료',detail:'대화에서 약속한 길목에서 기다렸다.'}], affected:[], newEntities:[], facts:[], relations:[], timeline:[], wove:[], nextChoices:['함께 걷는다'], continuity:{updates:[],introduced:[],choiceConsequences:[]} };
        throw new Error('뜻밖의 호출: '+opts.taskKind);
      } };
      openStoryTalk('friend');
    });
    await page.waitForFunction(() => !S.storyTalkJob && storyTalkSession(S.world,'friend').ready);
    assert((await page.locator('.story-talk').textContent()).includes('짧은 존댓말'));
    await page.locator('#storyTalkInput').fill('내일 길목에서 만나자.');
    await page.evaluate(() => talkMode='hold');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !!globalThis.releaseTalk);
    assert.equal(await page.locator('#storyTalkLive').innerText(),'내일 길목');
    await page.evaluate(() => advanceChapter(true));
    assert.equal(await page.evaluate(() => S.world.story.chapter),1,'대화 도중 장 전환 금지');
    await page.evaluate(() => releaseTalk());
    await page.waitForFunction(() => !S.storyTalkJob);
    assert.equal(await page.evaluate(() => storyTalkSession(S.world,'friend').turns.length),1);
    assert.equal(await page.evaluate(() => talkCalls.find(c=>c.kind==='storyChat').tier),'default','등장인물 대화는 기본 모델 사용');
    assert.equal(await page.evaluate(() => talkCalls.filter(c=>c.kind==='storyChatReview').length),0,'일반 대화는 별도 검사 호출 없음');
    for (const [key,state] of [['dead','dead'],['asleep','unconscious'],['away','absent']]) {
      await page.locator(`[data-talk-key="${key}"]`).click();
      await page.waitForFunction(key => !S.storyTalkJob && storyTalkSession(S.world,key)?.ready,key);
      assert.equal(await page.evaluate(key=>storyTalkSession(S.world,key).state,key),state);
      assert(await page.locator('#storyTalkInput').isDisabled());
    }
    await page.locator('[data-talk-key="friend"]').click();
    await page.locator('#storyTalkInput').fill('別の約束 <script>alert(1)</script>');
    await page.evaluate(() => talkMode='important');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !S.storyTalkJob && storyTalkSession(S.world,'friend').turns.length===2);
    assert((await page.locator('.story-talk').innerText()).includes('約束 <script>'));
    assert.equal(await page.locator('.story-talk script').count(),0);
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns[1].reply),'만나는 것은 아직 약속할 수 없습니다.');
    assert((await page.locator('.story-talk').innerText()).includes('수정 반영'));
    await page.locator('#storyTalkInput').fill('실패 뒤에도 남길 입력');
    await page.evaluate(() => talkMode='failure');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !S.storyTalkJob);
    assert.equal(await page.locator('#storyTalkInput').inputValue(),'실패 뒤에도 남길 입력');
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns.length),2);
    assert((await page.locator('[role="alert"]').innerText()).includes('완료하지 못했습니다'));
    await page.evaluate(() => talkMode='hold');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !!S.storyTalkJob);
    await page.locator('[data-act="talk-stop"]').click();
    await page.waitForFunction(() => !S.storyTalkJob);
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns.length),2);
    await page.evaluate(() => { talkMode='faint'; });
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !S.storyTalkJob && curCh(S.world).dialoguePlayerState==='unconscious');
    assert(await page.locator('#storyTalkInput').isDisabled());
    await page.evaluate(() => openStoryTalk('dead'));
    assert(await page.locator('#storyTalkInput').isDisabled(),'주인공 기절은 다른 대화에도 적용');
    await page.evaluate(async()=>{ const d=storyTalkSession(S.world,'friend'); d.draft=''; await Store.saveWorld(S.world); openAdvance(); await advanceChapter(true); });
    await page.waitForFunction(()=>S.world.story.chapter===2 && !S.storyGen);
    assert(await page.evaluate(()=>talkCalls.find(c=>c.kind==='chapterPlan').prompt.includes('내일 길목에서 만나자.')));
    assert(await page.evaluate(()=>talkCalls.find(c=>c.kind==='chapterPlan').prompt.includes('동료는 만남의 약속을 거절했다.')));
    assert((await page.locator('.stcard').innerText()).includes('대화가 남긴 변화'));
    await page.evaluate(()=>openStoryTalk('friend'));
    await page.waitForFunction(()=>!S.storyTalkJob && storyTalkSession(S.world,'friend').ready);
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns.length),0);
    assert.equal(await page.locator('.talk-turn').count(),3,'이전 장 대화는 보존');
    await page.evaluate(async()=>{
      const s=storyTalkSession(S.world,'friend'), original=Store.saveWorld;
      Store.saveWorld=async()=>{throw new Error('가짜 저장 실패');};
      await saveStoryTalk(); if(!s.unsaved)throw new Error('저장 실패가 표시되지 않음');
      Store.saveWorld=original; await saveStoryTalk();
      if(s.unsaved || s.err)throw new Error('저장 재시도 실패');
    });
    await page.reload(); await page.waitForFunction(()=>S.ready && Nav.active && !Nav.restoring);
    await page.evaluate(async()=>{await openWorld('talk-test'); openStoryTalk('friend');});
    await page.waitForFunction(()=>S.view.name==='storyTalk');
    assert.equal(await page.locator('.talk-turn').count(),3,'새로고침 후 대화 복원');
    assert.equal(await page.evaluate(()=>!!storyTalkSession(S.world,'friend').unsaved),false,'저장 재시도 후 실패 표시가 복원되지 않음');
    await page.evaluate(()=>{ S.world.story.status='ended'; renderMain(); });
    assert(!(await page.locator('#storyTalkInput').isDisabled()),'결말 시점에도 가능한 인물과 대화 가능');
    assert.equal(await page.locator('.story-talk [data-act="story-next"]').count(),0);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'모바일에서 가로 넘침 없음');
    await page.screenshot({path:'/tmp/ww-story-talk-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('✓ 스트리밍·일반/중요 대화 경로·상태 차단·중단/실패·장 전환·기록 복원·HTML 이스케이프 통과 (유료 API 0회)');
  } finally { await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
