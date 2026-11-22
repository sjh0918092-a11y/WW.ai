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
      const w = { id: 'talk-test', kind: 'world', title: '대화 세계', mode: 'story', mainKey: 'hero', seed: '서로 협력하는 인물들', era: '2026년', rules: [], relations: [], timeline: [], navboxes: {}, entities: { hero: entity('케빈 드와이트'), friend: entity('동료'), dead: entity('마이클 쇼'), asleep: entity('기절한 인물'), away: entity('멀리 떠난 인물') }, story: { protagonistKey: 'hero', protagonist: {}, chapter: 1, total: 5, status: 'active', cast: [], secrets: [{ id: 's1', truth: '누설하면 안 되는 진실', cover: '아직 알려지지 않았다', revealed: false }], spine: ['발단','전개','위기','절정','결말'].map((beat,i) => ({ n:i+1, beat, intent: '관계가 이어진다' })), chapters: [{ n: 1, title: '만남', era: '2026년', summary: '동료는 기다리고 있으며, 다른 인물은 각각 사망하거나 기절하거나 멀리 떠났다.', explore: { opened: {}, created: [], edited: [], searched: [] }, affected: [], nextChoices: ['동료를 돕는다'] }] } };
      S.world = w; S.worlds = [w]; S.pages = Object.fromEntries(Object.entries(w.entities).map(([key,e]) => [key, { key, title:e.title, type:'인물', summary:e.summary, infobox:[], sections:[{ heading:'개요', level:1, body:e.summary }], categories:[], links:[], createdAt:1 }]));
      w.entities.unwritten=entity('새 인물');
      w.entities.friend.facts = [{t:'동료는 마을에서 일한다.',src:'user',at:1},{t:'동료는 주인공을 알고 있다.',src:'hero',at:2}];
      S.pages.hero.sections.push({heading:'저격 사건',level:1,body:'마이클 쇼는 공연 도중 총상을 입고 사망했다. 케빈 드와이트는 생존하여 현장 수사를 지휘했다.'});
      curCh(w).dialogues = { dead: {ready:true,state:'available',stamp:storyTalkStamp(w,'dead'),turns:[],draft:'',reason:'케빈 드와이트가 살아 있으므로 대화할 수 있다.'} };
      await Store.saveWorld(w); for (const p of Object.values(S.pages)) await Store.savePage(w.id,p);
      globalThis.privateFact='비공개 문서의 보관 장소는 지하 서고다.';
      w.userCanon=privateFact;w.story.chapters[0].summary+=' '+privateFact;w.entities.friend.facts.push({t:privateFact,src:'hero'});w.story.secrets.push({id:'public-in-story',truth:privateFact,cover:'장소는 알려지지 않았다',revealed:true});
      globalThis.talkCalls = []; globalThis.talkMode = 'normal';
      S.sample = { json: async (prompt,opts) => {
        talkCalls.push({ prompt, kind: opts.taskKind, tier: opts.modelTier, live:opts.liveStream });
        if (opts.taskKind === 'storyCast') {
          const key = S.view.key;
          return { profile:{ personality:'신중하며 약속을 지킨다', voice:'짧은 존댓말. 상대를 이름으로 부른다', examples:['기다렸습니다.','그 부탁은 어렵습니다.'] }, character:{key:talkMode==='wrongIdentity'?'hero':key,state:({ dead:'dead', asleep:'unconscious', away:'absent' })[key] || 'available',evidence:'선택한 상대에 관한 사건 본문'}, player:{key:talkMode==='wrongIdentity'?'dead':'hero',state:'available',evidence:'케빈 드와이트는 생존하여 수사를 지휘했다.'}, relationship:'협력 관계', scene:'현재 두 인물이 마주 보고 있다.',knowledge:storyTalkKnowledgeValid(storyTalkSession(S.world,key)?.knowledge)?structuredClone(storyTalkSession(S.world,key).knowledge):{known:[]} };
        }
        if (opts.taskKind === 'storyChat') {
          const out = { reply:talkMode==='important'?'검토 전의 미확정 답변입니다.':'내일 길목에서 기다리겠습니다.', memory:'동료는 주인공과 내일 길목에서 만나기로 약속했다.', important:talkMode==='important', character:{key:S.view.key,state:'available',evidence:'상대는 대화를 이어간다.'}, player:{key:'hero',state:talkMode==='faint'?'unconscious':'available',evidence:'주인공의 현재 상태'}, relationship:'약속한 사이', scene:'현재 두 인물이 마주 보고 있다.',knowledge:{known:[]} };
          if(talkMode==='hold'){out.reply=privateFact;out.knowledge={known:[{fact:privateFact,via:'public',source:'chapter:1',evidence:'줄거리에 적혀 있다.'}]};}
          globalThis.lastTalkDraft=out;
          opts.onText?.({text:'{"reply":"스트리밍 중인 미확정 답변'});
          if (talkMode==='hold') await new Promise((resolve,reject) => { globalThis.releaseTalk=resolve; opts.signal.addEventListener('abort',()=>reject({code:'cancelled'}),{once:true}); });
          if (talkMode==='failure') throw {code:'network'};
          if (opts.signal.aborted) throw {code:'cancelled'};
          return out;
        }
        if (opts.taskKind === 'storyChatReview') {
          if(talkMode==='important')await new Promise((resolve,reject)=>{globalThis.releaseReview=resolve;opts.signal.addEventListener('abort',()=>reject({code:'cancelled'}),{once:true});});
          if(talkMode!=='important'&&talkMode!=='faint')return {...lastTalkDraft,reply:'내일 길목에서 기다리겠습니다.',knowledge:structuredClone(storyTalkSession(S.world,S.view.key).knowledge)};
          return { reply:talkMode==='faint'?'주인공이 쓰러져 대화가 멈췄다.':'만나는 것은 아직 약속할 수 없습니다.', memory:talkMode==='faint'?'주인공이 기절하여 대화를 멈췄다.':'동료는 만남의 약속을 거절했다.', character:{key:S.view.key,state:'available',evidence:'상대는 대화를 이어간다.'}, player:{key:'hero',state:talkMode==='faint'?'unconscious':'available',evidence:'주인공의 현재 상태'}, relationship:'협력 관계', scene:'현재 두 인물이 마주 보고 있다.',knowledge:talkMode==='important'?{known:[{fact:'사용자가 '+privateFact+'라고 말했다.',via:'told',source:'user',evidence:privateFact}]}:structuredClone(storyTalkSession(S.world,S.view.key).knowledge), correction:'확정 설정에 맞춰 응답을 수정했습니다.' };
        }
        if (opts.taskKind === 'chapterPlan') return { title:'약속의 길목', era:'2026년', summary:'동료가 길목에서 기다렸다.', protagonistBlock:{heading:'약속의 길목',sections:[{heading:'만남',body:'동료는 주인공과 한 약속에 따라 길목에서 기다렸다.'}],infoboxPatch:[]}, dialogueConsequences:[{character:'동료',detail:'대화에서 약속한 길목에서 기다렸다.'}], affected:[], newEntities:[], facts:[], relations:[], timeline:[], wove:[], nextChoices:['함께 걷는다'], continuity:{updates:[],introduced:[],choiceConsequences:[]} };
        throw new Error('뜻밖의 호출: '+opts.taskKind);
      } };
      const cached=curCh(w).dialogues.unwritten={turns:[],draft:'문서 없는 인물에게 보내려는 말',ready:true,assessmentVersion:STORY_TALK_ASSESSMENT,characterKey:'unwritten',playerKey:'hero',state:'available'};cached.stamp=storyTalkStamp(w,'unwritten');
      openStoryTalk('unwritten');
    });
    assert(await page.locator('#storyTalkInput').isDisabled());
    assert((await page.locator('.talk-document').innerText()).includes('인물 문서를 작성하면 대화할 수 있습니다.'));
    assert.equal(await page.locator('.talk-unavailable').count(),0,'문서 미작성을 연락 불가로 취급하지 않는다');
    await page.evaluate(async()=>{await prepareStoryTalk('unwritten');await sendStoryTalk();});
    assert.equal(await page.evaluate(()=>talkCalls.length),0,'문서가 없으면 저장된 준비 결과가 있어도 AI를 호출하지 않는다');
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'unwritten').state),'available','작중 상태를 임의로 변경하지 않는다');
    await page.evaluate(()=>{
      globalThis.originalGeneratePage=generatePage;
      generatePage=async key=>{
        if(key!=='unwritten')throw new Error('잘못된 문서 작성 대상');
        S.pages[key]={key,title:S.world.entities[key].title,type:'인물',summary:'문서에서 정한 신중한 기록관',infobox:[],sections:[{heading:'성격과 행적',level:1,body:'기록관은 상대의 말을 끝까지 듣고 사실을 확인한 뒤 짧은 존댓말로 답한다.'}],links:[],categories:[],createdAt:Date.now()};
        await Store.savePage(S.world.id,S.pages[key]);renderAll();
      };
    });
    await page.locator('.talk-document [data-k="unwritten"]').click();
    await page.waitForFunction(()=>S.view.name==='article' && !!S.pages.unwritten);
    await page.evaluate(()=>{generatePage=originalGeneratePage;openStoryTalk('unwritten');});
    await page.waitForFunction(()=>!S.storyTalkJob && storyTalkReady(S.world,'unwritten'));
    assert(!(await page.locator('#storyTalkInput').isDisabled()),'문서 작성 후 상태 판단을 마치면 대화 가능');
    assert(await page.evaluate(()=>talkCalls.find(c=>c.kind==='storyCast').prompt.includes('문서에서 정한 신중한 기록관')));
    assert(await page.evaluate(()=>talkCalls.find(c=>c.kind==='storyCast').prompt.includes('문서에 없는 핵심 성격·과거·관계를 임의로 확정하지 않는다')));
    const beforeHeroMissing=await page.evaluate(()=>talkCalls.length);
    await page.evaluate(async()=>{globalThis.savedHeroPage=S.pages.hero;delete S.pages.hero;renderMain();await prepareStoryTalk('unwritten');await sendStoryTalk();});
    assert.equal(await page.locator('.talk-document [data-k="hero"]').count(),1);
    assert.equal(await page.evaluate(()=>talkCalls.length),beforeHeroMissing,'주인공 문서가 없어도 준비·전송 차단');
    await page.evaluate(()=>{S.pages.hero=savedHeroPage;openStoryTalk('friend');});
    await page.waitForFunction(() => !S.storyTalkJob && storyTalkSession(S.world,'friend').ready);
    assert.equal(await page.locator('.talk-profile').count(),0);
    assert(!(await page.locator('.story-talk').textContent()).includes('짧은 존댓말'));
    assert.equal(await page.evaluate(()=>S.world.story.dialogueProfiles.friend.voice),'짧은 존댓말. 상대를 이름으로 부른다','캐릭터 지침은 유지한다');
    const boundary=await page.evaluate(()=>{
      const session=storyTalkSession(S.world,'friend');session.turns.push({user:'예전 질문',reply:'미승인 답변에만 있던 비밀',memory:'미승인 답변에만 있던 비밀'});
      const prompt=storyTalkPrompt(S.world,'friend','안녕');session.turns.pop();
      return {leak:prompt.includes('미승인 답변에만 있던 비밀'),rules:storyTalkCastPrompt(S.world,'friend')};
    });
    assert(!boundary.leak);
    assert(boundary.rules.includes('직접 경험, 실제 전달'));
    assert(boundary.rules.includes('공개되었다는 묘사 없이 비밀스러운 일을 공개 정보라고 가정하지 않는다'));assert(boundary.rules.includes('당연히 알 만한 것은 넣는다'));assert(boundary.rules.includes('비밀, 사적인 사정, 숨겨진 진실은 이 이유로 넣지 않는다'));
    const evidenceBoundary=await page.evaluate(()=>{
      const session=storyTalkSession(S.world,'friend'), old=session.knowledge;
      session.knowledge={known:[{fact:'행사가 열렸다.',via:'public',source:'chapter:1',evidence:privateFact}]};
      const prompt=storyTalkPrompt(S.world,'friend','안녕');session.knowledge=old;
      return {publicFact:prompt.includes('행사가 열렸다.'),privateDetail:prompt.includes(privateFact)};
    });
    assert(evidenceBoundary.publicFact);assert(!evidenceBoundary.privateDetail,'근거 인용문에 섞인 미공유 정보도 생성 모델에서 제외한다');
    const legacyKnowledge=await page.evaluate(async()=>{
      const session=storyTalkSession(S.world,'friend'), before=talkCalls.filter(c=>c.kind==='storyCast').length;
      session.knowledge=privateFact;delete session.knowledgeVersion;
      await prepareStoryTalk('friend');
      return {calls:talkCalls.filter(c=>c.kind==='storyCast').length-before,version:session.knowledgeVersion,known:session.knowledge.known};
    });
    assert.equal(legacyKnowledge.calls,1);assert.equal(legacyKnowledge.version,1);assert.deepEqual(legacyKnowledge.known,[],'기존 자유 형식 지식을 그대로 재사용하지 않는다');

    const reuse=await page.evaluate(async()=>{
      const before=talkCalls.filter(c=>c.kind==='storyCast').length, w=S.world;
      w.entities.friend.facts.reverse(); w.entities.friend.facts.forEach(f=>{f.at=999;f.checkedAt=1000;});
      S.pages.friend.sections[0].level=2; S.pages.friend.sections[0].checkedAt=2000;
      openStoryTalk();
      if(S.storyTalkJob)throw new Error('메타데이터 변경으로 대화 준비가 시작됨');
      const session=storyTalkSession(w,'friend');
      delete session.cacheVersion;session.stamp=storyTalkLegacyStamp(w,'friend');
      await prepareStoryTalk('friend');
      return {before,after:talkCalls.filter(c=>c.kind==='storyCast').length,key:S.view.key,cacheVersion:session.cacheVersion};
    });
    assert.equal(reuse.before,reuse.after,'기록 순서·메타데이터·기존 캐시 이전에는 AI 재호출 없음');
    assert.equal(reuse.key,'friend');assert.equal(reuse.cacheVersion,1);

    const deletedGate=await page.evaluate(async()=>{const old=S.pages.friend,before=talkCalls.length;delete S.pages.friend;await sendStoryTalk();await prepareStoryTalk('friend');const after=talkCalls.length;S.pages.friend=old;openStoryTalk('friend');return{before,after};});
    assert.equal(deletedGate.before,deletedGate.after,'문서 삭제 후에는 기존 준비 캐시로 대화할 수 없다');
    await page.locator('#storyTalkInput').fill('내일 길목에서 만나자.');
    await page.evaluate(() => talkMode='hold');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(() => !!globalThis.releaseTalk);
    assert.equal(await page.locator('#storyTalkLive').innerText(),'…');
    assert(!(await page.locator('.story-talk').textContent()).includes('스트리밍 중인 미확정 답변'));
    assert(!(await page.locator('.story-talk').textContent()).includes('초안'));
    await page.evaluate(()=>{S.storyTalkJob.phase='review';S.storyTalkJob.raw='다시 그려도 노출되면 안 되는 초안';refreshStoryTalk(S.world,'friend');});
    assert.equal(await page.locator('#storyTalkLive').innerText(),'…');
    assert(!(await page.locator('.story-talk').textContent()).includes('다시 그려도 노출되면 안 되는 초안'));
    assert(!(await page.locator('.story-talk').textContent()).includes('검토'));
    assert(!(await page.locator('.story-talk').textContent()).includes('초안'));
    await page.evaluate(()=>S.storyTalkJob.phase='reply');
    const busySync=await page.evaluate(async()=>{const original=S.world,job=S.storyTalkJob;await Sync.refresh();return{worldSame:S.world===original,jobSame:S.storyTalkJob===job,view:S.view.name,key:S.view.key,aborted:job.ctl.signal.aborted};});
    assert.deepEqual(busySync,{worldSame:true,jobSame:true,view:'storyTalk',key:'friend',aborted:false},'수신·검토 중 동기화가 진행 중인 대화를 교체하지 않는다');
    await page.evaluate(() => advanceChapter(true));
    assert.equal(await page.evaluate(() => S.world.story.chapter),1,'대화 도중 장 전환 금지');
    await page.evaluate(() => releaseTalk());
    await page.waitForFunction(() => !S.storyTalkJob);
    assert.equal(await page.evaluate(() => storyTalkSession(S.world,'friend').turns.length),1);
    assert.equal(await page.evaluate(() => talkCalls.find(c=>c.kind==='storyChat').tier),'default','등장인물 대화는 기본 모델 사용');
    assert.equal(await page.evaluate(() => talkCalls.filter(c=>c.kind==='storyChatReview').length),1,'일반 응답도 지식 누설 검사를 거친다');
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').knowledge.known.length),0,'초안의 근거 없는 지식을 승인하지 않는다');
    assert(!(await page.locator('.story-talk').textContent()).includes('비공개 문서의 보관 장소는 지하 서고다.'));
    const initialPrompts=await page.evaluate(()=>({actor:talkCalls.find(c=>c.kind==='storyChat').prompt,review:talkCalls.find(c=>c.kind==='storyChatReview').prompt}));
    assert(!initialPrompts.actor.includes('비공개 문서의 보관 장소는 지하 서고다.'),'위키·줄거리·공개 표시의 사실을 대화 모델에 직접 전달하지 않는다');
    assert(initialPrompts.review.includes('비공개 문서의 보관 장소는 지하 서고다.'),'검사 모델은 전체 자료와 습득 경로를 대조한다');
    const beforeReentry=await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length);
    await page.locator('[data-act="story-back"]').click();
    await page.locator('#side [data-act="story-talk"]').click();
    assert.equal(await page.evaluate(()=>S.view.key),'friend','마지막 대화 상대를 기억한다');
    assert.equal(await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length),beforeReentry,'화면 재입장으로 준비를 반복하지 않는다');
    assert.equal(await page.locator('.talk-result').count(),0);
    assert(!(await page.locator('.story-talk').textContent()).includes('남은 변화'));
    await page.locator('#storyTalkInput').fill('동기화 중에도 남아야 할 입력');
    await page.locator('#storyTalkInput').focus();
    const syncView=await page.evaluate(async()=>{
      const original=S.world, remote=JSON.parse(JSON.stringify(original)), before=talkCalls.length;
      remote.tagline='다른 기기에서 바뀐 세계관 소개';
      await Store.putWorldRaw(remote);
      document.getElementById('storyTalkInput').setSelectionRange(3,7);
      await Sync.refresh();
      const input=document.getElementById('storyTalkInput');
      return {view:S.view.name,key:S.view.key,changed:S.world!==original,tagline:S.world.tagline,draft:input?.value,focus:document.activeElement===input,start:input?.selectionStart,end:input?.selectionEnd,calls:talkCalls.length-before,route:Nav.read()};
    });
    assert.equal(syncView.view,'storyTalk');assert.equal(syncView.key,'friend');assert(syncView.changed);assert.equal(syncView.tagline,'다른 기기에서 바뀐 세계관 소개');
    assert.equal(syncView.draft,'동기화 중에도 남아야 할 입력');assert(syncView.focus);assert.equal(syncView.start,3);assert.equal(syncView.end,7);assert.equal(syncView.calls,0);
    assert.equal(syncView.route.view,'storyTalk');assert.equal(syncView.route.key,'friend');
    const order=await page.evaluate(()=>{
      const w=JSON.parse(JSON.stringify(S.world));for(const c of w.story.chapters)c.dialogues={};
      w.story.chapters[0].dialogues={friend:{turns:[{at:100},{at:200}]},dead:{turns:[{}]}};
      w.story.chapters.push({n:2,dialogues:{unwritten:{turns:[{at:400}]},asleep:{turns:[{at:300}]}}});
      w.story.lastDialogueKey='away';return storyTalkers(w);
    });
    assert.deepEqual(order,['unwritten','asleep','friend','dead','away'],'모든 장의 마지막 대화 시각 순으로 정렬하며 열람만으로 순서를 바꾸지 않는다');
    await page.locator('#storyTalkInput').fill('');
    await page.evaluate(async()=>{const remote=JSON.parse(JSON.stringify(S.world));storyTalkSession(remote,'friend',true).draft='다른 기기의 이전 입력';await Store.putWorldRaw(remote);await Sync.refresh();});
    assert.equal(await page.locator('#storyTalkInput').inputValue(),'','지운 입력이 동기화로 다시 나타나지 않는다');


    assert(!(await page.locator('.story-talk').innerText()).includes('케빈 드와이트가 살아 있으므로'),'기존 내부 사유는 표시하지 않는다');
    await page.evaluate(()=>{talkMode='wrongIdentity';openStoryTalk('dead');});
    await page.waitForFunction(()=>!S.storyTalkJob && !!storyTalkSession(S.world,'dead').err);
    assert(await page.locator('#storyTalkInput').isDisabled(),'주인공을 상대라고 반환한 응답은 대화를 열지 않는다');
    assert.equal(await page.evaluate(()=>storyTalkReady(S.world,'dead')),false,'구형 대화 가능 캐시를 신뢰하지 않는다');
    await page.evaluate(()=>talkMode='normal');
    await page.locator('[data-act="talk-prepare"]').click();
    await page.waitForFunction(()=>!S.storyTalkJob && storyTalkReady(S.world,'dead'));
    assert.equal(await page.locator('.talk-unavailable').innerText(),'사망');
    const deadPrompt=await page.evaluate(()=>talkCalls.find(c=>c.kind==='storyCast'&&c.prompt.includes('선택한 대화 상대: 마이클 쇼')).prompt);
    assert(deadPrompt.includes('사용자가 맡은 주인공: 케빈 드와이트'));
    assert(deadPrompt.includes('마이클 쇼는 공연 도중 총상을 입고 사망했다.'));
    assert(deadPrompt.includes('주인공이 살아 있다는 사실은 대화 상대가 살아 있다는 근거가 아니다'));
    assert.equal(await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyChat').length),1,'사망한 상대에게 대화 요청을 보내지 않는다');
    for (const [key,state] of [['dead','dead'],['asleep','unconscious'],['away','absent']]) {
      await page.locator(`[data-talk-key="${key}"]`).click();
      await page.waitForFunction(key => !S.storyTalkJob && storyTalkSession(S.world,key)?.ready,key);
      assert.equal(await page.evaluate(key=>storyTalkSession(S.world,key).state,key),state);
      assert(await page.locator('#storyTalkInput').isDisabled());
    }
    await page.locator('[data-talk-key="friend"]').click();
    await page.locator('#storyTalkInput').fill('別の約束 <script>alert(1)</script> 비공개 문서의 보관 장소는 지하 서고다.');
    await page.evaluate(() => talkMode='important');
    await page.locator('[data-act="talk-send"]').click();
    await page.waitForFunction(()=>!!globalThis.releaseReview);
    assert.equal(await page.locator('#storyTalkLive').innerText(),'…');
    assert(!(await page.locator('.story-talk').textContent()).includes('검토 전의 미확정 답변입니다.'));
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns.length),1,'검토 중에는 응답을 확정하지 않는다');
    await page.evaluate(()=>releaseReview());
    await page.waitForFunction(() => !S.storyTalkJob && storyTalkSession(S.world,'friend').turns.length===2);
    assert((await page.locator('.story-talk').innerText()).includes('約束 <script>'));
    assert.equal(await page.locator('.story-talk script').count(),0);
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').turns[1].reply),'만나는 것은 아직 약속할 수 없습니다.');
    assert((await page.locator('.story-talk').textContent()).includes('만나는 것은 아직 약속할 수 없습니다.'));
    assert(!(await page.locator('.story-talk').textContent()).includes('검토 전의 미확정 답변입니다.'));
    assert.equal(await page.locator('#storyTalkLive').count(),0);
    assert.equal(await page.evaluate(()=>storyTalkSession(S.world,'friend').knowledge.known[0].via),'told','직접 전달된 내용은 전언으로만 기록한다');
    assert(await page.evaluate(()=>storyTalkPrompt(S.world,'friend','알고 있습니까?').includes(privateFact)),'전달 이후에만 대화 모델이 해당 내용을 사용할 수 있다');
    assert(!(await page.locator('.story-talk').textContent()).includes('확정 설정에 맞춰 응답을 수정했습니다.'));
    await page.evaluate(()=>{storyTalkSession(S.world,'friend').turns[1].correction='기존 내부 교정 설명';renderMain();});
    assert(!(await page.locator('.story-talk').textContent()).includes('기존 내부 교정 설명'),'기존 기록의 교정 설명도 표시하지 않는다');
    assert.equal(await page.locator('.talk-correction').count(),0);
    const beforeEdit=await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length);
    await page.evaluate(async()=>{S.pages.friend.sections[0].body+=' 동료가 새 장소로 이동했다.';await Store.savePage(S.world.id,S.pages.friend);openStoryTalk('friend');});
    await page.waitForFunction(()=>!S.storyTalkJob && storyTalkReady(S.world,'friend'));
    assert.equal(await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length),beforeEdit+1,'실제 설정 본문 변경은 상태를 재판단한다');
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
    assert(!(await page.locator('.stcard').textContent()).includes('대화가 남긴 변화'));
    assert.equal(await page.evaluate(()=>curCh(S.world).dialogueConsequences.length),1,'스토리 결과 기록은 유지');
    const beforeNewChapter=await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length);
    await page.evaluate(()=>openStoryTalk('friend'));
    await page.waitForFunction(()=>!S.storyTalkJob && storyTalkSession(S.world,'friend').ready);
    assert.equal(await page.evaluate(()=>talkCalls.filter(c=>c.kind==='storyCast').length),beforeNewChapter+1,'새 장에서는 새 상태를 판단한다');
    assert(await page.evaluate(()=>{const prompt=talkCalls.filter(c=>c.kind==='storyCast').at(-1).prompt;return prompt.includes('priorKnowledge')&&prompt.includes('사용자가 '+privateFact+'라고 말했다.');}),'다음 장 준비에도 검토된 습득 경로를 전달한다');
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
    assert.equal(await page.evaluate(()=>S.view.name),'storyTalk','새로고침 후에도 대화창을 복원한다');
    assert.equal(await page.evaluate(()=>S.view.key),'friend');
    await page.evaluate(()=>{globalThis.reloadPrepCalls=0;S.sample={json:async(prompt,opts)=>{if(opts.taskKind==='storyCast'){reloadPrepCalls++;throw new Error('재입장 준비가 실행됨');}return {};}};});
    await page.waitForFunction(()=>S.view.name==='storyTalk');
    assert.equal(await page.locator('.talk-turn').count(),3,'새로고침 후 대화 복원');
    assert.equal(await page.evaluate(()=>reloadPrepCalls),0,'새로고침 후에도 저장된 준비 결과 재사용');
    assert.equal(await page.evaluate(()=>S.view.key),'friend');
    assert.equal(await page.locator('.talk-result').count(),0);
    assert(!(await page.locator('.story-talk').textContent()).includes('남은 변화'));
    assert(!(await page.locator('.story-talk').textContent()).includes('기존 내부 교정 설명'),'새로고침 후에도 교정 설명을 노출하지 않는다');
    assert.equal(await page.evaluate(()=>!!storyTalkSession(S.world,'friend').unsaved),false,'저장 재시도 후 실패 표시가 복원되지 않음');
    await page.evaluate(()=>{ S.world.story.status='ended'; renderMain(); });
    assert(!(await page.locator('#storyTalkInput').isDisabled()),'결말 시점에도 가능한 인물과 대화 가능');
    assert.equal(await page.locator('.story-talk [data-act="story-next"]').count(),0);
    assert.equal(await page.locator('.talk-result').count(),0,'대화 결과 표시를 제거한다');
    assert(!(await page.locator('.story-talk').innerText()).includes('대화 가능'),'대화 가능 설명은 표시하지 않는다');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      const session=storyTalkSession(S.world,'friend');
      for(let i=0;i<24;i++)session.turns.push({user:'화면을 넘겨도 입력창은 제자리에 남아야 합니다. '+i,reply:'대화 기록만 스크롤됩니다.',memory:'화면 검증',at:Date.now()});
      renderMain();
    });
    const readingPosition=await page.evaluate(async()=>{
      const log=document.getElementById('storyTalkMessages');log.scrollTop=120;
      await Store.putWorldRaw(JSON.parse(JSON.stringify(S.world)));await Sync.refresh();
      return document.getElementById('storyTalkMessages').scrollTop;
    });
    assert.equal(readingPosition,120,'동기화 중 읽던 대화 위치를 유지한다');
    const layout=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect();
      return {composerBottom:box('.talk-composer').bottom,viewport:window.innerHeight,headerTop:box('.talk-header').top,scrolling:document.querySelector('.talk-messages').scrollHeight>document.querySelector('.talk-messages').clientHeight,selfLeft:box('.talk-self .talk-bubble').left,otherLeft:box('.talk-other .talk-bubble').left};
    });
    assert(layout.scrolling); assert(layout.composerBottom<=layout.viewport+1); assert(layout.headerTop<5); assert(layout.selfLeft>layout.otherLeft,'내 말은 오른쪽, 상대 말은 왼쪽');
    await page.evaluate(()=>document.getElementById('toast').hidden=true);
    await page.screenshot({path:'/tmp/ww-story-talk-mobile.png',fullPage:true});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:'/tmp/ww-story-talk-dark.png',fullPage:true});
    await page.setViewportSize({width:390,height:460});
    await page.waitForFunction(()=>document.querySelector('.talk-composer').getBoundingClientRect().bottom<=window.innerHeight+1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'모바일에서 가로 넘침 없음');
    await page.locator('[data-act="story-back"]').click();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('story-chat-open')),false,'대화를 나가면 일반 화면 복원');
    assert.deepEqual(errors,[]);
    console.log('✓ 스트리밍·일반/중요 대화 경로·상태 차단·중단/실패·장 전환·기록 복원·HTML 이스케이프 통과 (유료 API 0회)');
  } finally { await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
