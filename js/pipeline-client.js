"use strict";
/* 서버 문서 작업: 브라우저는 접수·진행 표시·동기화만 맡는다. */
const DocumentPipeline = {
  enabled() { return GS.documentPipeline !== false && AIJobs.enabled("gemini"); },
  sourcePage(p) { if (!p) return null; const v = { ...p }; delete v.portrait; delete v.shortStories; delete v.savedAt; return v; },
  pending(wid) { const d = Sync.dirty; return d && (d.w.has(wid) || d.dw.has(wid) || [...d.p,...d.dp].some(k => k.startsWith(wid + "\u0001"))); },
  // 검색·실패 작업의 미저장 후보는 설정 수정이 아니다. 저장된 항목과 본문은 항상 비교한다.
  drafts(w, stored, key) {
    const keys = new Set([key, ...queuedUnsaved(w, stored)]);
    for (const [k, e] of Object.entries(w.entities)) if (e.searched) keys.add(k);
    for (const r of AIRecovery.local()) if (r.meta?.wid === w.id && r.meta.entity && !r.meta.hadPage) keys.add(r.meta.key);
    return Object.fromEntries([...keys].filter(k => w.entities[k] && !stored.entities[k] && !S.pages[k]).map(k => [k, JSON.parse(JSON.stringify(w.entities[k]))]));
  },
  restoreDrafts(w, drafts) {
    for (const [k, e] of Object.entries(drafts)) if (!w.entities[k] && !w.aliases?.[k] && !S.pages[k] && !S.nf.has(k)) w.entities[k] = e;
    restoreQueued(w);
  },
  async receive(result, original, ctx) {
    const report = result?.pipeline;
    if (!report?.saved) throw new Error(report?.error?.message || "저장되지 않은 결과입니다. AI 작업에서 초안을 확인해 주세요.");
    if (!AIJobs.current(ctx)) throw new Error("원래 계정에서 결과를 열어 주세요.");
    if (this.pending(report.wid)) throw new Error("이 기기에 아직 올리지 않은 수정이 있습니다. 동기화한 뒤 AI 작업에서 저장된 문서를 열어 주세요.");
    await Sync.pull(); if (Sync.err) throw new Error(Sync.err);
    if (!AIJobs.current(ctx)) throw new Error("로그인 계정이나 서버가 바뀌었습니다.");
    const w = await Store.getWorld(report.wid), pages = await Store.listPages(report.wid);
    if (!w) throw new Error("완료 후 세계관이 삭제되었습니다. 결과 내려받기를 이용해 주세요.");
    if (original && S.world === original) {
      const drafts = this.drafts(original, w);
      for (const key of Object.keys(original)) delete original[key]; Object.assign(original,w);
      S.pages = pages; S.worlds = S.worlds.map(v => v.id === w.id ? original : v);
      this.restoreDrafts(original, drafts);
    }
    return { world: w, pages, report };
  },
  /* 다른 서버 작업이나 기기가 먼저 저장해 이 기기 원본이 뒤처졌으면, 받아 와서 화면 원본을 맞춘 뒤 다시 접수한다 */
  async request(action, k, opts = {}) {
    const w = S.world;
    for (let attempt = 0; ; attempt++) {
      try { return await this.requestOnce(action, k, opts); }
      catch (err) {
        const stale = err?.code === "source_stale" || (err?.code === "source_changed" && /접수 전/.test(err?.message || ""));
        if (!stale || attempt >= 2 || opts.ctl?.signal.aborted) throw err;
        await this.catchUp(w, k);
      }
    }
  },
  async catchUp(w, k) {
    await Sync.pull(); if (Sync.err) throw new Error(Sync.err);
    const fresh = await Store.getWorld(w.id);
    if (!fresh || S.world !== w) throw new Error("세계관이나 계정이 바뀌었습니다.");
    const drafts = this.drafts(w, fresh, k);
    for (const key of Object.keys(w)) delete w[key]; Object.assign(w, fresh);
    S.pages = await Store.listPages(w.id); S.worlds = S.worlds.map(v => v.id === w.id ? w : v);
    this.restoreDrafts(w, drafts);
  },
  async requestOnce(action, k, { rewrite = false, direction = "", novel = false, angle = null, ctl } = {}) {
    const w = S.world, ctx = AIRecovery.context();
    if (!ctx) throw new Error("로그인이 필요합니다.");
    await Sync.flush();
    if (ctl?.signal.aborted) throw { code: "cancelled" };
    const stored = await Store.getWorld(w.id), page = await Store.getPage(w.id,k);
    if (!stored || S.world !== w || !AIJobs.current(ctx)) throw new Error("세계관이나 계정이 바뀌었습니다.");
    const pending = w.entities[k] && !stored.entities[k] ? w.entities[k] : null;
    if (!stored.entities[k] && !pending) throw new Error("대상 항목이 없습니다.");
    // 실패한 검색 후보도 화면에 남을 수 있다. 후보 이외의 설정 변경은 그대로 보호한다.
    const compare = JSON.parse(JSON.stringify(w));
    for (const x of Object.keys(this.drafts(w, stored, k))) delete compare.entities[x];
    const screenHash = await AIRecovery.hash(compare), storedHash = await AIRecovery.hash(stored);
    if (screenHash !== storedHash) {
      // 이전 접수 원본과 정확히 같은 화면만 자동 갱신한다. 사용자의 새 편집을 덮어쓰지 않는다.
      if (!this.pending(w.id) && AIRecovery.local().some(r => r.meta?.wid === w.id && r.meta.worldStamp === screenHash))
        throw { code:"source_stale", message:"저장된 최신 세계관을 받아 작업을 다시 준비합니다." };
      throw new Error("화면의 설정과 저장된 원본이 다릅니다. 세계관을 다시 열고 시작해 주세요.");
    }
    const settings = Object.fromEntries(["main","mainThink","quick","quickThink","check","checkThink","preCheck","taskModels","prompt"].map(key => [key,GS[key]]));
    // guided·force는 구형 서버가 거절하는 선택적 출처 값이다. 창작 의도는 방향에 실어 구형 접수 규격에서도 보존한다.
    const intent = pending?.src === "guided" ? "사용자가 방향을 정해 새로 만들기로 한 항목이다. 아래 작성 방향에 맞춰 정의한다. 현실에도 있는 말이면 방향이 달리 말하지 않는 한 현실의 의미를 바탕으로 이 세계에서의 모습을 쓴다."
      : pending?.src === "force" ? "사용자가 이 이름으로 항목을 새로 만들기로 했다. 의미 없는 문자열처럼 보여도 이 세계 안의 고유명사(암호명, 인물의 별칭, 지명, 조직명, 제품명 등)로 해석해 창작하고, 그 이름이 왜 그렇게 붙었는지도 설명한다." : "";
    const input = { action,wid:w.id,key:k,rewrite:!!rewrite,direction:[intent,direction || ""].filter(Boolean).join("\n\n"),novel:!!novel,settings,
      ...(angle?.id ? { angleId: angle.id } : {}),
      ...(pending ? { entity: { title: pending.title,type:pending.type || "",summary:pending.summary || "", ...(["search","discovery"].includes(pending.src) ? {src:pending.src}:{}), ...(pending.searched ? {searched:true}:{}) } } : {}),
      worldHash:storedHash,pageHash:await AIRecovery.hash(this.sourcePage(page)) };
    const meta = await AIRecovery.capture(action === "check" ? "check" : "page",w,k,{rewrite:!!rewrite,direction:(direction || "").slice(0,300)});
    const costSession = typeof DocumentCost!=="undefined" ? (action==="generate"?DocumentCost.get(w.id,k):DocumentCost.start(w.id,k)) : null;
    let id;
    let result;
    try { result = await AIJobs.run("document.pipeline",GS.main,input,{signal:ctl?.signal,jobMeta:meta,
      onJob: j => { id = j.id; if(costSession){DocumentCost.active.delete(costSession.id);costSession.id=j.id;costSession.title=meta.title||"";DocumentCost.active.add(j.id);} if (S.gen?.wid === w.id) S.gen.jobId = j.id; },
      onStatus: j => { if(typeof DocumentCost!=="undefined")DocumentCost.server(costSession,j); if (S.gen?.wid === w.id) { S.gen.phase = j.phase || "generate"; S.gen.serverPhase = j.phase; S.gen.serverStatus = j.status; S.gen.live = Array.isArray(j.liveSteps) && j.serverNow ? { steps: j.liveSteps, now: j.serverNow, at: performance.now() } : null; if (j.status === "running" && j.startedAt && S.gen.stepStartedAt !== j.startedAt) { S.gen.stepStartedAt = j.startedAt; S.gen.stepT0 = performance.now() - Math.max(0, Date.now() - j.startedAt); } updateGenLive(); } },
    }); } finally { if(costSession)DocumentCost.finish(costSession); }
    if(costSession){DocumentCost.server(costSession,result.pipeline||{});DocumentCost.finish(costSession);}
    await this.receive(result,w,ctx); await AIRecovery.handled(id);
    return result.pipeline;
  },
  async generate(k,rewrite,direction,novel,angle,opts = {}) {
    const w = S.world, e = w.entities[k], ctl = new AbortController();
    const costSession = typeof DocumentCost!=="undefined" ? DocumentCost.start(w.id,k) : null;
    S.gen = {key:k,wid:w.id,title:e.title,raw:"",t0:performance.now(),ctl,rewrite:!!rewrite,novel:!!novel,direction:direction || "",phase:"generate",serverPipeline:true};
    S.genErr = null; S.confirmRewrite = null; if (!opts.queued) S.view = {name:"article",key:k}; renderAll();
    try {
      const r = await this.request("generate",k,{rewrite,direction,novel,angle,ctl});
      S.gen = null;
      if (S.world === w && S.view.name === "article" && S.view.key === k) {
        if (r.notFound) S.view = {name:"notfound",title:e.title}; else S.view.key = r.targetKey;
      }
      if (S.world === w) { maybeAutoAngles(w); if (!novel) maybeRefillAngles(w); }
      renderAll(); toast(r.fixed ? `서버에서 「${e.title}」 문서의 ${r.fixed}곳을 고쳐 저장했습니다.` : `서버에서 「${e.title}」 문서를 완성해 저장했습니다.`);
      drainGenQ();
      return {sceneUsed:r.sceneUsed,angleRecorded:r.angleRecorded};
    } catch (err) {
      S.gen = null;
      if (novel) throw err;
      S.genErr = {key:k,msg:errMsg(err),guide:direction || "",cancelled:err?.code === "cancelled"};
      renderAll(); toast(opts.queued ? `「${e.title}」 문서를 만들지 못했습니다. ${err?.message || errMsg(err)}` : err?.message || errMsg(err));
      drainGenQ();
    } finally { if(typeof DocumentCost!=="undefined")DocumentCost.finish(costSession); }
  },
  async check(k) {
    S.checking = k; S.checkT0 = performance.now(); renderMain();
    try { await this.request("check",k); toast("서버에서 검사 결과를 저장했습니다."); }
    catch (err) { toast(err?.message || errMsg(err)); }
    finally { S.checking = null; renderMain(); }
  },
  async openSaved(r,result,ctx) {
    const {world,report} = await this.receive(result,S.world?.id === r.meta.wid ? S.world : null,ctx);
    if(typeof DocumentCost!=="undefined")DocumentCost.restore(world.id,report.targetKey||r.meta.key,r,report);
    await this.handledOpen(r,world,report);
  },
  async handledOpen(r,world,report) {
    await AIRecovery.handled(r.id);
    S.world = await Store.getWorld(world.id); S.pages = await Store.listPages(world.id); restoreQueued(S.world);
    S.view = report.notFound ? {name:"notfound",title:r.meta.title} : {name:"article",key:report.targetKey}; renderAll();
  },
};
