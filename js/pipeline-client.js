"use strict";
/* 서버 문서 작업: 브라우저는 접수·진행 표시·동기화만 맡는다. */
const DocumentPipeline = {
  enabled() { return GS.documentPipeline !== false && AIJobs.enabled("gemini"); },
  sourcePage(p) { if (!p) return null; const v = { ...p }; delete v.portrait; delete v.shortStories; delete v.savedAt; return v; },
  pending(wid) { const d = Sync.dirty; return d && (d.w.has(wid) || d.dw.has(wid) || [...d.p,...d.dp].some(k => k.startsWith(wid + "\u0001"))); },
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
      for (const key of Object.keys(original)) delete original[key]; Object.assign(original,w);
      S.pages = pages; S.worlds = S.worlds.map(v => v.id === w.id ? original : v);
    }
    return { world: w, pages, report };
  },
  async request(action, k, { rewrite = false, direction = "", novel = false, angle = null, ctl } = {}) {
    const w = S.world, ctx = AIRecovery.context();
    if (!ctx) throw new Error("로그인이 필요합니다.");
    await Sync.flush();
    if (ctl?.signal.aborted) throw { code: "cancelled" };
    const stored = await Store.getWorld(w.id), page = await Store.getPage(w.id,k);
    if (!stored || S.world !== w || !AIJobs.current(ctx)) throw new Error("세계관이나 계정이 바뀌었습니다.");
    const pending = w.entities[k] && !stored.entities[k] ? w.entities[k] : null;
    if (!stored.entities[k] && !pending) throw new Error("대상 항목이 없습니다.");
    // 모든 미저장 설정 변경을 먼저 올린다. 탐색 중인 새 후보만 아직 원본에 없을 수 있다.
    const compare = JSON.parse(JSON.stringify(w));
    if (pending) delete compare.entities[k];
    if (await AIRecovery.hash(compare) !== await AIRecovery.hash(stored)) throw new Error("화면의 설정과 저장된 원본이 다릅니다. 세계관을 다시 열고 시작해 주세요.");
    const settings = Object.fromEntries(["main","mainThink","quick","quickThink","check","checkThink","preCheck"].map(key => [key,GS[key]]));
    const input = { action,wid:w.id,key:k,rewrite:!!rewrite,direction:direction || "",novel:!!novel,settings,
      ...(angle?.id ? { angleId: angle.id } : {}),
      ...(pending ? { entity: { title: pending.title,type:pending.type || "",summary:pending.summary || "", ...(pending.src ? {src:pending.src}:{}), ...(pending.searched ? {searched:true}:{}) } } : {}),
      worldHash:await AIRecovery.hash(stored),pageHash:await AIRecovery.hash(this.sourcePage(page)) };
    const meta = await AIRecovery.capture(action === "check" ? "check" : "page",w,k,{rewrite:!!rewrite,direction:(direction || "").slice(0,300)});
    let id;
    const result = await AIJobs.run("document.pipeline",GS.main,input,{signal:ctl?.signal,jobMeta:meta,
      onJob: j => { id = j.id; if (S.gen?.wid === w.id) S.gen.jobId = j.id; },
      onStatus: j => { if (S.gen?.wid === w.id) { S.gen.phase = j.phase || "generate"; S.gen.serverPhase = j.phase; updateGenLive(); } },
    });
    await this.receive(result,w,ctx); await AIRecovery.handled(id);
    return result.pipeline;
  },
  async generate(k,rewrite,direction,novel,angle) {
    const w = S.world, e = w.entities[k], ctl = new AbortController();
    S.gen = {key:k,wid:w.id,title:e.title,raw:"",t0:performance.now(),ctl,rewrite:!!rewrite,direction:direction || "",phase:"generate",serverPipeline:true};
    S.genErr = null; S.confirmRewrite = null; S.view = {name:"article",key:k}; renderAll();
    try {
      const r = await this.request("generate",k,{rewrite,direction,novel,angle,ctl});
      S.gen = null;
      if (S.world === w && S.view.name === "article" && S.view.key === k) {
        if (r.notFound) S.view = {name:"notfound",title:e.title}; else S.view.key = r.targetKey;
      }
      if (S.world === w) { maybeAutoAngles(w); if (!novel) maybeRefillAngles(w); }
      renderAll(); toast(r.fixed ? `서버에서 ${r.fixed}곳을 고쳐 문서를 저장했습니다.` : "서버에서 문서를 완성해 저장했습니다.");
      return {sceneUsed:r.sceneUsed,angleRecorded:r.angleRecorded};
    } catch (err) {
      S.gen = null;
      if (novel) throw err;
      S.genErr = {key:k,msg:errMsg(err),guide:direction || "",cancelled:err?.code === "cancelled"};
      renderAll(); toast(err?.message || errMsg(err));
    }
  },
  async check(k) {
    S.checking = k; S.checkT0 = performance.now(); renderMain();
    try { await this.request("check",k); toast("서버에서 검사 결과를 저장했습니다."); }
    catch (err) { toast(err?.message || errMsg(err)); }
    finally { S.checking = null; renderMain(); }
  },
  async openSaved(r,result,ctx) {
    const {world,report} = await this.receive(result,S.world?.id === r.meta.wid ? S.world : null,ctx);
    await this.handledOpen(r,world,report);
  },
  async handledOpen(r,world,report) {
    await AIRecovery.handled(r.id);
    S.world = await Store.getWorld(world.id); S.pages = await Store.listPages(world.id);
    S.view = report.notFound ? {name:"notfound",title:r.meta.title} : {name:"article",key:report.targetKey}; renderAll();
  },
};
