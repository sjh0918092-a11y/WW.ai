"use strict";
/* 검색, 알림, 이벤트 연결 */
/* ---------- search ---------- */
function renderSugg() {
  const box = $("#sugg"), q = norm($("#q").value), w = S.world;
  if (!w || !q) { box.hidden = true; box.innerHTML = ""; return; }
  const ql = q.toLowerCase();
  const hits = Object.entries(w.entities).filter(([, o]) => o.title.toLowerCase().includes(ql)).sort((a, b) => (b[1].page - a[1].page) || a[1].title.length - b[1].title.length).slice(0, 7);
  const alias = w.aliases?.[keyOf(q)] || identityOwner(w, q, keyOf(q));
  if (alias && w.entities[alias] && !hits.some(([k]) => k === alias)) hits.unshift([alias, w.entities[alias]]);
  const exact = hits.some(([, o]) => o.title.toLowerCase() === ql) || !!(alias && w.entities[alias]);
  box.innerHTML = hits.map(([k, o]) => `<button type="button" data-sk="${k}"><span>${esc(o.title)}</span><small>${k === alias ? esc(q) + "에서 넘겨옴" : o.page ? "문서" : "미작성"}</small></button>`).join("")
    + (exact ? "" : `<button type="button" data-snew="${esc(q)}"><span>「${esc(q)}」 문서 찾기</span><small>없으면 새로 작성</small></button><button type="button" data-scompose="${esc(q)}"><span>「${esc(q)}」 방향을 정해 새로 만들기</span><small>작성 페이지</small></button>`);
  box.hidden = false;
}
function composeFromSearch(title) {
  const w = S.world; const t = canonTitle(w, title); if (!w || !t) return;
  const k = keyOf(t);
  if (!w.entities[k]) { w.entities[k] = newEntity(t, "", ""); w.entities[k].src = "guided"; w.entities[k].searched = true; }
  S.nf.delete(k);
  $("#q").value = ""; renderSugg(); $("#q").blur(); openCompose(k);
}
function goSearch(title) {
  const w = S.world; const t = canonTitle(w, title); if (!w || !t) return;   // 합쳐진 이름이나 성만 쓴 이름은 원래 문서로
  const k = keyOf(t);
  if (!w.entities[k] && S.nf.has(k)) { $("#q").value = ""; renderSugg(); $("#q").blur(); S.view = { name: "notfound", title: t }; renderAll(); window.scrollTo({ top: 0 }); return; }
  if (!w.entities[k]) { w.entities[k] = newEntity(t, "", ""); w.entities[k].src = "search"; w.entities[k].searched = true; }
  $("#q").value = ""; renderSugg(); $("#q").blur(); openEntity(k);
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, action) {
  const t = $("#toast"); t.innerHTML = esc(msg) + (action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : "");
  t.hidden = false; if (action) $("#toastAct").onclick = () => { t.hidden = true; action.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3600);
}

/* ---------- events ---------- */
document.addEventListener("click", ev => {
  if (!ev.target.closest(".portrait-menu")) document.querySelectorAll(".portrait-menu[open]").forEach(m => { m.open = false; });
  if (!ev.target.closest(".search")) $("#sugg").hidden = true;
  const el = ev.target.closest("button, a"); if (!el) return;
  const d = el.dataset;
  if (d.tlEdit !== undefined && S.world) { const td = el.closest("td"); if (td) { td.innerHTML = timelineRowHtml(S.world, +d.tlEdit, true); td.querySelector("[data-tl-ev]")?.focus(); } return; }   // 그 줄만 입력칸으로 바꾼다(다른 줄에 고치던 값은 그대로)
  if(d.costMore){DocumentCost.expanded.add(d.costMore);DocumentCost.render();return;}
  if(d.costReset){
    if(d.costReset!==S.world?.id)return;
    if(window.confirm("이 세계관의 비용과 호출 로그를 이 브라우저에서 초기화하시겠습니까? 문서와 세계관 내용은 유지됩니다. 초기화 이전에 시작한 요청은 이후 완료되어도 집계하지 않습니다.")){
      DocumentCost.reset(d.costReset);toast("세계관 비용과 호출 로그를 초기화했습니다.");
    }
    return;
  }
  if (d.jobPreview) { AIRecovery.preview(d.jobPreview, true); return; }
  if (d.jobApply) { AIRecovery.apply(d.jobApply); return; }
  if (d.jobCancel) { AIRecovery.cancel(d.jobCancel); return; }
  if (d.jobDownload) { AIRecovery.download(d.jobDownload); return; }
  if (d.jobDismiss) { AIRecovery.handled(d.jobDismiss, true).then(() => { AIRecovery.detail = null; AIRecovery.selected = null; S.view = { name: "jobs" }; renderAll(); }); return; }
  if (d.imageView !== undefined) { const img = el.querySelector("img"); if (img) openImageViewer(img.getAttribute("src"), img.alt, el); return; }
  if (el.matches("a.wl.new")) {
    ev.preventDefault();
    if (lp.fired) { lp.fired = false; return; }               // 길게 누르기로 이미 작성 페이지를 열었음
    const w = S.world; if (!w) return;
    const k = d.k; if (!w.entities[k] && d.t) w.entities[k] = newEntity(d.t, "", "");
    if (lp.touch) { openEntity(k); return; }                   // 터치는 짧게 누르면 바로 작성
    if (ev.detail >= 2) { clearTimeout(lp.clickT); lp.clickT = null; openCompose(k); return; }
    clearTimeout(lp.clickT); lp.clickT = setTimeout(() => { lp.clickT = null; openEntity(k); }, 260);
    return;
  }
  if (d.unq) { unqueueGen(d.unq); return; }
  if (el.matches("a.wl") || (el.tagName === "BUTTON" && d.k)) { ev.preventDefault(); const w = S.world; if (!w) return; let k = d.k; if (!w.entities[k] && d.t) w.entities[k] = newEntity(d.t, "", ""); openEntity(k); return; }
  if (d.fn) { ev.preventDefault(); const li = document.getElementById("fn-" + d.fn); if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); } return; }
  if (d.sec) { document.getElementById("s-" + d.sec)?.scrollIntoView({ behavior: "smooth" }); return; }
  if (d.sk) { $("#q").value = ""; $("#sugg").hidden = true; openEntity(d.sk); return; }
  if (d.snew) { goSearch(d.snew); return; }
  if (d.scompose) { composeFromSearch(d.scompose); return; }
  if (d.compose) { openCompose(d.compose); return; }
  if (d.composeGo) { startCompose(d.composeGo); return; }
  if (d.force) { const w = S.world; if (!w) return; const t = norm(d.force), k = keyOf(t); S.nf.delete(k); if (!w.entities[k]) w.entities[k] = newEntity(t, "", ""); w.entities[k].src = "force"; S.genErr = null; openEntity(k); return; }
  if (d.stab) {
    S.seedTab = d.stab;
    if (!/^\d+$/.test(d.stab) && EXAMPLES.some(x => x.guide && x.guide === S.guideIn)) S.guideIn = "";   // 예시가 채운 작가 지침은 다른 탭으로 옮기면 비운다(직접 고친 지침은 둔다)
    if (d.stab === "own") S.seed = S.ownSeed;
    else if (d.stab === "dice") { if (!S.dice) rollDice(); S.seed = diceSeed(S.dice); }
    else if (d.stab === "whatif") { if (!S.whatIfs) S.whatIfs = shuffle(WHATIFS).slice(0, 8); }
    else { const ex = EXAMPLES[+d.stab]; S.seed = ex.text; if (ex.guide && (!S.guideIn.trim() || EXAMPLES.some(x => x.guide === S.guideIn))) S.guideIn = ex.guide; }   // 작가 지침은 비어 있거나 다른 예시의 것일 때만 채운다
    renderMain(); return;
  }
  if (d.lock) { S.dice.locks[d.lock] = !S.dice.locks[d.lock]; renderMain(); return; }
  if (d.prefAx && !S.creating) { const p = normPrefs(S.prefs), v = +d.prefLv; if (v >= 1 && v <= 5 && p.axes[d.prefAx] !== v) p.axes[d.prefAx] = v; else delete p.axes[d.prefAx]; S.prefs = { ...p, avoidText: S.prefs?.avoidText || "" }; S.prefsOpen = true; renderMain(); return; }   // 같은 단계를 다시 누르거나 자동을 누르면 원안에 맡긴다
  if (d.prefAvoid && !S.creating) { const p = normPrefs(S.prefs); p.avoid = p.avoid.includes(d.prefAvoid) ? p.avoid.filter(x => x !== d.prefAvoid) : [...p.avoid, d.prefAvoid]; S.prefs = { ...p, avoidText: S.prefs?.avoidText || "" }; S.prefsOpen = true; renderMain(); return; }
  if (d.whatif) { S.seed = whatIfSeed(d.whatif); createWorld(); return; }
  if (d.world) { openWorld(d.world); return; }
  if (d.del) { S.confirmDel = d.del; renderMain(); return; }
  if (d.delYes) { deleteWorld(d.delYes); return; }
  if (d.gen) { const g = S.genErr?.key === d.gen ? S.genErr.guide || "" : ""; S.genErr = null; generatePage(d.gen, false, g); return; }
  if (d.rw) { S.confirmRewrite = S.confirmRewrite === d.rw ? null : d.rw; renderMain(); if (S.confirmRewrite) $("#rwDir")?.focus(); return; }
  if (d.rwYes) { const dir = norm($("#rwDir")?.value || "").slice(0, 300); generatePage(d.rwYes, true, dir); return; }
  if (d.check) { checkPage(d.check); return; }
  if (d.memoDel !== undefined) { deleteMemo(d.memoK, Number(d.memoDel)); return; }
  if (d.fixk) { openFixView(d.fixk, [Number(d.fix)], true); return; }
  if (d.cfix) { openConflictFix(d.cfix, d.cfield || "conflicts"); return; }
  if (d.fixopen) { if (S.fixJobs.has(d.fixopen)) { S.view = { name: "fix", key: d.fixopen }; renderAll(); window.scrollTo({ top: 0 }); } return; }
  if (d.fixdrop) { dropFix(d.fixdrop); if (S.view.name === "fix" && S.view.key === d.fixdrop) S.view = { name: "article", key: d.fixdrop }; renderAll(); return; }
  if (d.sectionEdit !== undefined) { openSectionEditor(d.sectionKey, Number(d.sectionEdit)); return; }
  if (d.edit) { openEditor(d.edit); return; }
  if (d.imageOpen) { openImageGen(d.imageOpen); return; }
  if (d.proseIllustrate) { openProseImage(d.proseIllustrate); return; }
  if (d.proseImageDelete) { const v = S.proseGen; if (v && !v.busy) { if (v.confirmImageDelete === d.proseImageDelete) saveProseImage(true, d.proseImageDelete); else { v.confirmImageDelete = d.proseImageDelete; el.textContent = "삽화 삭제 확인"; } } return; }
  if (d.proseOpen) { openProse(d.proseOpen); return; }
  if (d.proseDelete) { const v = S.proseGen; if (v && !v.busy) { if (v.confirmDelete === d.proseDelete) saveProse(d.proseDelete); else { v.confirmDelete = d.proseDelete; el.textContent = "삭제 확인"; } } return; }
  if (d.portrait) { document.querySelector('[data-portrait-file="' + d.portrait + '"]')?.click(); return; }
  if (d.portraitRemove) { setPortrait(d.portraitRemove, null); return; }
  if (d.delpage) { S.confirmDelPage = S.confirmDelPage === d.delpage ? null : d.delpage; S.confirmRewrite = null; renderMain(); return; }
  if (d.delpageYes) { deletePage(d.delpageYes); return; }
  if (d.mg) { S.confirmMerge = S.confirmMerge === d.mg ? null : d.mg; S.confirmDelPage = null; S.confirmRewrite = null; renderMain(); if (S.confirmMerge) $("#mgTo")?.focus(); return; }
  if (d.mgYes) { const w = S.world, v = norm($("#mgTo")?.value || ""); if (!w || !v) { toast("합칠 문서 제목을 골라 주세요."); return; } const t = keyOf(v), bk = w.entities[t] ? t : kOf(w, v); if (!w.entities[bk] || bk === d.mgYes) { toast(`「${v}」 항목을 찾을 수 없습니다. 목록에서 골라 주세요.`); return; } mergeAction(d.mgYes, bk); return; }
  if (d.mgdo) { mergeAction(d.mgdo, d.mgto); return; }
  if (d.notsame) { notSame(d.notsame, d.other); return; }
  if (d.refresh) { openEditor(d.refresh); saveEdit(); return; }
  if (d.dismiss) { dismissNotes(d.dismiss, d.field); return; }
  if (d.realname) { renameToRealName(d.realname); return; }
  if (d.navDel) { categoryAction("del", d.navDel); return; }
  if (d.catUnmerge) { categoryAction("unmerge", d.catUnmerge); return; }
  if (d.cat !== undefined) { if (!S.world) return; S.view = { name: "category", cat: d.cat }; renderAll(); window.scrollTo({ top: 0 }); return; }
  if (d.focus) { S.focusEnt = d.focus; S.view = { name: "canon" }; renderAll(); return; }
  if (d.angleSave) { editAngle(d.angleSave, "label", document.querySelector(`[data-angle-label="${CSS.escape(d.angleSave)}"]`)?.value); return; }
  if (d.angleToggle) { editAngle(d.angleToggle, "toggle"); return; }
  if (d.angleRevive) { editAngle(d.angleRevive, "revive"); return; }
  if (d.angleDel) { if (el.dataset.confirm === "1") editAngle(d.angleDel, "delete"); else { el.dataset.confirm = "1"; el.textContent = "삭제 확인"; } return; }
  if (d.filter) { S.canonFilter = d.filter; renderMain(); return; }
  if (d.wcLink) { worldCheckAction(d.wcLink, "link"); return; }
  if (d.wcAlts) { S.wcFocus = d.wcAlts; S.wcAlts = S.wcAlts === d.wcAlts ? null : d.wcAlts; renderMain(); document.getElementById("wc-" + d.wcAlts)?.scrollIntoView({ block: "nearest" }); return; }
  if (d.wcAlt) { worldCheckAction(d.wcAlt, "alt", Number(d.wcI)); return; }
  if (d.wcEdit) { S.wcFocus = d.wcEdit; S.wcEdit = S.wcEdit === d.wcEdit ? null : d.wcEdit; renderMain(); document.getElementById("wcEd-" + d.wcEdit)?.focus(); return; }
  if (d.wcEditGo) { worldCheckAction(d.wcEditGo, "edit", document.getElementById("wcEd-" + d.wcEditGo)?.value || ""); return; }
  if (d.wcRetry) { worldCheckAction(d.wcRetry, "retry"); return; }
  if (d.wcKeep) { worldCheckAction(d.wcKeep, "keep"); return; }
  if (d.wcClose) { worldCheckAction(d.wcClose, "close"); return; }
  if (d.wcClaim) { worldCheckAction(d.wcClaim, "claim"); return; }
  if (d.wcStop) { wcStopBatch(d.wcStop); return; }
  if (d.wcResume) { worldCheckAction(d.wcResume, "resume"); return; }
  if (d.wcFix) { worldCheckAction(d.wcFix, "fix", d.wcDoc); return; }
  if (d.wcReopen) { worldCheckAction(d.wcReopen, "reopen"); return; }
  if (d.termPick !== undefined) { chooseTerm(Number(d.termPick), Number(d.alt)); return; }
  if (d.mode) { S.mode = d.mode === "story" ? "story" : "basic"; if (S.seedTab === "dice" && S.dice) S.seed = diceSeed(S.dice); renderMain(); return; }   // 주사위 원안은 모드에 맞게 다시 쓴다
  if (d.chn) { S.storyN = Math.min(STORY_MAX, Math.max(STORY_MIN, +d.chn)); renderMain(); return; }
  if (d.talkKey) { openStoryTalk(d.talkKey); return; }
  if (d.castDel !== undefined) { S.cast.splice(Number(d.castDel), 1); renderMain(); return; }
  if (d.epsec) { const w = S.world; if (!w) return; const pk = w.story.protagonistKey, i = d.epsec; S.view = { name: "article", key: pk }; renderAll(); const el = document.getElementById("s-" + i); if (el) el.scrollIntoView({ block: "start" }); return; }
  switch (d.act) {
    case "home": if (S.view.name === "home") return; S.view = { name: "home" }; if (!S.gen && !S.storyGen && !S.syncing) S.world = null; renderAll(); window.scrollTo({ top: 0 }); break;
    case "story-talk": openStoryTalk(); break;
    case "talk-prepare": prepareStoryTalk(S.view.key); break;
    case "talk-send": sendStoryTalk(); break;
    case "talk-stop": S.storyTalkJob?.ctl.abort(); break;
    case "talk-save": saveStoryTalk(); break;
    case "story-next": openAdvance(); break;
    case "story-go": { const ta = $("#advCustom"); if (ta && S.adv) S.adv.custom = ta.value; advanceChapter(false); break; }
    case "story-skip": advanceChapter(true); break;
    case "choices-regen": regenChoices(); break;
    case "story-stop": S.storyGen?.ctl.abort(); break;
    case "story-back": { const w = S.world; if (!w) break; S.view = { name: "article", key: S.recent.find(x => w.entities[x]) || w.mainKey }; renderAll(); break; }
    case "epilogue": S.view = { name: "epilogue" }; renderAll(); window.scrollTo({ top: 0 }); break;
    case "story-card-close": S.storyCard = null; renderMain(); break;
    case "sync-new": { const k = S.view.key; if (S.pages[k]?.stale === "new" && S.bgSync !== k) bgSync(k, { cats: true, ledger: false }); break; }
    case "sync-retry": { const k = S.view.key; S.syncErr = null; maybeSync(k); renderMain(); break; }
    case "fixv-open": { const k = S.view.key, m = S.memo; if (m && m.k === k) openFixView(k, m.items.map((x, i) => i).filter(i => m.items[i].severity === "high"), false); break; }
    case "fixv-run": runFixBatch(); break;
    case "fixv-apply": applyFix(); break;
    case "fixv-redo": { const v = curFix(); if (v) { v.phase = "pick"; v.edits = []; v.err = ""; renderMain(); renderSide(); } break; }
    case "fixv-drop": case "fixv-back": { const k = S.view.key, v = curFix();   // 진행 중이거나 검토를 기다리는 교정은 '나중에 보기'로 남겨 두고 사이드바에서 다시 연다
      if (v && (d.act === "fixv-drop" || !fixActive(k))) dropFix(k);
      S.view = S.world && S.world.entities[k] ? { name: "article", key: k } : { name: "home" }; renderAll(); break; }
    case "log": S.view = { name: "log" }; renderAll(); window.scrollTo({ top: 0 }); break;
    case "jobs": AIRecovery.open(); break;
    case "jobs-refresh": AIRecovery.detail = null; AIRecovery.refresh(); break;
    case "jobs-filter": AIRecovery.all = !AIRecovery.all; renderMain(); break;
    case "gset": S.view = { name: "gset" }; S.gres = ""; renderAll(); window.scrollTo({ top: 0 }); break;
    case "gkey-show": { const i = $("#" + (d.for || "gPass")); if (i) i.type = i.type === "password" ? "text" : "password"; break; }
    case "gset-save": (async()=>{readGsetForm();setGres("");renderSide();renderMain();const logged=!!Sync.acct,ok=await AISettingsSync.flush();toast(ok?"AI 설정을 계정에 저장했습니다.":logged?"이 기기에 저장했습니다. 서버 저장은 다시 시도합니다.":"AI 설정을 이 기기에 저장했습니다.");AISettingsSync.render()})();break;
    case "relay-invite": {
      readGsetForm();
      const link = location.origin + location.pathname + (GS.relay !== DEFAULT_RELAY ? "#relay=" + encodeURIComponent(GS.relay) : "");
      (navigator.clipboard?.writeText(link) || Promise.reject()).then(() => toast("사이트 링크를 복사했습니다. 접속 암호는 따로 알려 주세요."), () => setGres("사이트 링크: " + link));
      break;
    }
    case "gset-export": {
      readGsetForm();const blob=new Blob([JSON.stringify(aiSettingsFile(),null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="worldwiki-ai-settings-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setGres("AI 설정을 내보냈습니다.");break;
    }
    case "gset-import": $("#aiSettingsFile")?.click();break;
    case "gset-reset-all": if(window.confirm("AI 설정을 모두 기본값으로 초기화하시겠습니까? 접속 암호·중계 서버 주소·불러온 모델 목록은 유지합니다."))(async()=>{GS={...GS,...Object.fromEntries(AI_EXPORT_FIELDS.map(k=>[k,GDEF[k]])),taskModels:{},prompt:normalizePromptOptions()};AISettingsSync.formDirty=false;saveGS();S.sample=gReady()?gemini:null;S.gres="모든 AI 설정을 기본값으로 초기화했습니다.";renderSide();renderMain();await AISettingsSync.flush();AISettingsSync.render()})();break;
    case "gset-input-defaults": readGsetForm();GS.prompt=normalizePromptOptions();saveGS();renderMain();setGres("문서 작성 입력 자료를 기본값으로 복원했습니다.");break;
    case "gset-test": (async () => {
      readGsetForm(); renderSide(); if (!gReady()) { setGres("서버 접속 암호를 먼저 저장해 주세요."); return; }
      const out = [];
      for (const tier of ["main", "quick"]) {
        setGres([...out, `${GS[tier]} 시험 중…`].join(" / "));
        const t0 = performance.now();
        try { const r = await gemini.json('JSON 객체 하나만 출력: {"ok":true}', { modelTier: tier === "main" ? "default" : "quick" }); out.push(`${GS[tier]}: ${r && r.ok === true ? "성공" : "응답은 왔지만 형식이 다름"} (${((performance.now() - t0) / 1000).toFixed(1)}초)`); }
        catch (e) { out.push(`${GS[tier]}: 실패 · ${errMsg(e)}${e?.message ? " (" + e.message + ")" : ""}`); }
      }
      setGres(out.join(" / "));
    })(); break;
    case "gset-openai-models": (async()=>{
      readGsetForm();setGres("서버 키로 OpenAI 모델 목록을 확인하는 중…");
      try{const models=await listOpenAIModels();ModelCatalog.remember("openai",models);S.gres=`OpenAI 텍스트 모델 ${models.length}개를 불러와 저장했습니다.`;renderMain()}
      catch(e){setGres("불러오지 못했습니다. "+errMsg(e))}
    })();break;
    case "gset-models": (async () => {
      readGsetForm(); if (!gReady()) { setGres("서버 접속 암호를 먼저 저장해 주세요."); return; }
      setGres("모델 목록을 불러오는 중…");
      try { S.gmodels = await listGeminiModels(); ModelCatalog.remember("gemini",S.gmodels); const ids=new Set(S.gmodels.map(m=>m.id));
        const missing=[['기본',GS.main],['빠른',GS.quick],['검사',GS.check]].filter(([,id])=>/^gemini-/.test(id||"")&&!ids.has(id)).map(([role,id])=>`${role}: ${id}`);
        S.gres = `서버 모델 ${S.gmodels.length}개를 불러왔습니다.`+(missing.length?` 서버 목록에 없는 선택값: ${missing.join(" / ")}. 드롭다운에서 다시 선택해 주세요.`:" 드롭다운에서 선택할 수 있습니다."); renderMain(); }
      catch (e) { setGres("불러오지 못했습니다. " + errMsg(e)); }
    })(); break;
    case "gset-claude-models": (async()=>{
      readGsetForm();setGres("서버 키로 Claude 모델과 선택한 별칭을 확인하는 중…");
      try{
        const result=await listClaudeModels();S.cmodels=result.models;ModelCatalog.remember("claude",S.cmodels);
        const resolved=[];
        for(const role of ["main","quick","check"]){const id=result.aliases?.[GS[role]];if(id&&S.cmodels.some(m=>m.id===id)){resolved.push(GS[role]+" → "+id);GS[role]=id}}
        for(const task of Object.values(GS.taskModels||{})){const id=result.aliases?.[task.model];if(id&&S.cmodels.some(m=>m.id===id)){resolved.push(task.model+" → "+id);task.model=id}}
        if(resolved.length)saveGS();
        S.gres=`Claude ${result.total}개 중 앱 지원 모델 ${S.cmodels.length}개를 불러왔습니다 (4.5/4.6).`+(resolved.length?` 별칭을 실제 ID로 확인했습니다: ${resolved.join(' / ')}.`:"")+(result.unavailable?.length?` 서버 키로 확인할 수 없는 선택값: ${result.unavailable.join(', ')}. 목록에서 다시 선택해 주세요.`:"");
        renderMain();
      }catch(e){setGres(errMsg(e))}
    })(); break;
    case "export-world": try { exportWorld(); } catch (e) { toast("내보내지 못했습니다. " + errMsg(e)); } break;
    case "export-world-ro": case "export-world-ro-json": try { exportWorldReadOnly(d.act === "export-world-ro-json" ? "json" : "html"); } catch (e) { toast("내보내지 못했습니다. " + errMsg(e)); } break;
    case "export": exportAll().catch(e => toast("내보내지 못했습니다. " + errMsg(e))); break;
    case "import": $("#importFile")?.click(); break;
    case "log-back": S.view = S.world ? { name: "article", key: (S.recent.find(x => S.world.entities[x]) || S.world.mainKey) } : { name: "home" }; renderAll(); break;
    case "log-clear": LOG.length = 0; try { localStorage.removeItem(LOGK); } catch {} renderAll(); break;
    case "prompt-copy": {
      if (!LASTP) break;
      const pick = () => { const d = $("#promptPre")?.closest("details"); if (d) d.open = true; const pre = $("#promptPre"); if (!pre) return; const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
      try { navigator.clipboard.writeText(LASTP.text).then(() => toast("프롬프트를 복사했습니다."), () => { pick(); toast("자동 복사가 막혀 있어 프롬프트를 선택해 두었습니다. 직접 복사해 주세요."); }); }
      catch { pick(); toast("자동 복사가 막혀 있어 프롬프트를 선택해 두었습니다. 직접 복사해 주세요."); }
      break;
    }
    case "log-copy": {
      const txt = logText();
      const pick = () => { const pre = $("#logPre"); if (!pre) return; const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
      try { navigator.clipboard.writeText(txt).then(() => toast("로그를 복사했습니다."), () => { pick(); toast("자동 복사가 막혀 있어 로그를 선택해 두었습니다. 직접 복사해 주세요."); }); }
      catch { pick(); toast("자동 복사가 막혀 있어 로그를 선택해 두었습니다. 직접 복사해 주세요."); }
      break;
    }
    case "canon": S.view = { name: "canon" }; renderAll(); window.scrollTo({ top: 0 }); break;
    case "cats": if (S.world) { S.view = { name: "categories" }; renderAll(); window.scrollTo({ top: 0 }); } break;
    case "cat-merge": categoryAction("merge", $("#cmFrom")?.value || "", $("#cmTo")?.value || ""); break;
    case "nav-add": categoryAction("add", $("#ndTitle")?.value || "", $("#ndCats")?.value || ""); break;
    case "nav-restore": categoryAction("restore"); break;
    case "discovery-create": discoverWorld($("#discoveryDirection")?.value || ""); break;
    case "discovery-stop": S.discovery?.ctl?.abort(); if (S.gen && S.gen.key === S.discovery?.target) S.gen.ctl.abort(); break;
    case "angles-regen": regenAngles(); break;
    case "angles-open": if (S.world) { S.view = { name: "canon" }; renderAll(); document.getElementById("angles")?.scrollIntoView({ block: "start" }); } break;
    case "discovery-back": if (S.world) openEntity(S.world.mainKey); break;
    case "create":
    case "create-retry": { const ta = $("#seedTa"); if (ta) S.seed = ta.value; createWorld(); break; }
    case "stop": S.gen?.ctl.abort(); break;
    case "del-no": S.confirmDel = null; renderMain(); break;
    case "rw-no": S.confirmRewrite = null; renderMain(); break;
    case "delpage-no": S.confirmDelPage = null; renderMain(); break;
    case "mg-no": S.confirmMerge = null; renderMain(); break;
    case "acct-login": acctAction("login"); break;
    case "acct-signup": acctAction("signup"); break;
    case "acct-logout": acctAction("logout"); break;
    case "acct-sync": acctAction("sync"); break;
    case "regen-open": openRegen(); break;
    case "regen-cancel": cancelRegen(); break;
    case "cast-add": if (S.cast.length < 8) { S.cast.push({ name: "", desc: "", rel: "" }); renderMain(); document.querySelector(`[data-cast="${S.cast.length - 1}"][data-cf="name"]`)?.focus(); } break;
    case "section-rewrite": rewriteSection(); break;
    case "section-stop": S.edit?.ctl?.abort(); break;
    case "section-undo": if (S.edit?.section && !S.edit.aiBusy && !S.edit.saving && S.edit.aiBefore !== undefined) { S.edit.f.body = S.edit.aiBefore; delete S.edit.aiBefore; S.edit.aiError = "AI 수정 전 초안으로 되돌렸습니다."; renderMain(true); } break;
    case "ed-save": saveEdit(); break;
    case "ed-save-raw": saveEdit(true); break;
    case "cf-apply": applyConflictChoices(); break;
    case "cf-back": if (S.edit) S.edit.pending = null; $("#edConflicts").innerHTML = ""; $("#edBody")?.focus(); break;
    case "ed-cancel": if (S.edit?.saving) break; S.edit?.ctl?.abort(); S.edit = null; renderMain(); window.scrollTo({ top: 0 }); break;
    case "save-canon": saveCanon(); break;
    case "timeline-check": runTimelineCheck(); break;
    case "world-check": runWorldCheck(); break;
    case "prose-image-generate": generateProseImage(); break;
    case "prose-image-apply": saveProseImage(); break;
    case "prose-image-discard": if (S.proseGen?.illustration && !S.proseGen.busy) { AIRecovery.handled(S.proseGen.illustration.jobId, true); S.proseGen.illustration.preview = ""; renderMain(); } break;
    case "prose-image-close": if (S.proseGen && !S.proseGen.saving) { if (S.proseGen.imageTask) S.proseGen.ctl?.abort(); else { S.proseGen.illustration = null; renderMain(); } } break;
    case "prose-generate": generateProse(); break;
    case "prose-save": saveProse(); break;
    case "prose-discard": if (S.proseGen && !S.proseGen.busy) { AIRecovery.handled(S.proseGen.jobId, true); S.proseGen.preview = null; S.proseGen.error = ""; renderMain(); } break;
    case "prose-close": if (S.proseGen?.saving) break; S.proseGen?.ctl?.abort(); S.proseGen = null; renderMain(); break;
    case "image-generate": generateDocImage(); break;
    case "image-apply": applyDocImage(); break;
    case "image-discard": if (S.imageGen && !S.imageGen.busy) { AIRecovery.handled(S.imageGen.jobId, true); S.imageGen.preview = ""; S.imageGen.error = ""; renderMain(); } break;
    case "image-close": S.imageGen?.ctl?.abort(); S.imageGen = null; renderMain(); break;
    case "looks-save": saveLooks(); break;
    case "looks-reset": if (S.imageGen && !S.imageGen.busy) { S.imageGen.looksDraft = null; renderMain(); } break;
    case "image-guide": S.view = { name: "canon" }; renderAll(); $("#wImageGuide")?.focus(); break;
    case "roll": rollDice(true); S.seed = diceSeed(S.dice); renderMain(); break;
    case "whatif-more": { const shown = new Set(S.whatIfs || []); const rest = shuffle(WHATIFS.filter(q => !shown.has(q))); S.whatIfs = (rest.length >= 8 ? rest : shuffle(WHATIFS)).slice(0, 8); renderMain(); break; }
    case "compose-cancel": { const k = S.view.key; S.compose = null; if (k && S.world?.entities[k] && (S.world.entities[k].facts.length || S.world.entities[k].mentions.length)) { S.genErr = null; S.view = { name: "article", key: k }; } else { S.view = { name: "article", key: S.world.mainKey }; } renderAll(); break; }
    case "tone-detect": (async () => {
      const btn = $("#toneBtn"); if (!S.sample || !S.world) return;
      const w = S.world, label = norm($("#toneLabel")?.value || "");
      if (btn) { btn.disabled = true; btn.textContent = "만드는 중…"; }
      try {
        const t = await detectTone(w, label);
        if (!t) throw { code: "invalid_json" };
        if (S.world === w && $("#toneLabel")) { $("#toneLabel").value = t.label; $("#toneGuide").value = t.guide.join("\n"); $("#toneGuide").rows = Math.min(10, t.guide.length + 1); }
        toast("분위기 지침을 채웠습니다. '설정 저장'을 눌러야 반영됩니다.");
      } catch (err) { toast("분위기 지침을 만들지 못했습니다. " + errMsg(err)); }
      if (btn) { btn.disabled = false; btn.textContent = "지침 다시 만들기"; }
    })(); break;
  }
});
document.addEventListener("toggle", ev => { if (ev.target.matches?.("[data-looks-box]") && S.imageGen) S.imageGen.looksOpen = ev.target.open; }, true);
document.addEventListener("input", ev => {
  if (ev.target.dataset?.proseImage && S.proseGen?.illustration && !S.proseGen.busy) { const f = ev.target.dataset.proseImage; if (["model", "style", "ratio", "direction"].includes(f)) S.proseGen.illustration.opts[f] = ev.target.value; }
  if (ev.target.dataset?.proseField && S.proseGen && !S.proseGen.busy) { const f = ev.target.dataset.proseField; if (["direction", "length"].includes(f)) S.proseGen.opts[f] = ev.target.value; }
  if (ev.target.dataset?.igf && S.imageGen && !S.imageGen.busy) { const f = ev.target.dataset.igf; S.imageGen.opts[f] = f === "useRef" ? ev.target.checked : ev.target.value; }
  if (ev.target.dataset?.looks && S.imageGen && !S.imageGen.busy) { const v = S.imageGen, p = S.pages[v.key], first = !v.looksDraft; v.looksDraft = { ...(v.looksDraft || looksOf(p) || {}), [ev.target.dataset.looks]: ev.target.value }; v.looksOpen = true; if (first) { const b = document.querySelector('[data-act="looks-save"]'); if (b) b.disabled = false; } }
  if (ev.target.id === "seedTa") {
    S.seed = S.ownSeed = ev.target.value;
    if (S.seedTab !== "own") {   // 예시나 주사위 결과를 고쳐 쓰면 내 원안이 된다
      S.seedTab = "own";
      const pos = ev.target.selectionStart; renderMain();
      const ta = $("#seedTa"); if (ta) { ta.focus(); try { ta.setSelectionRange(pos, pos); } catch {} }
    }
  }
  if (ev.target.dataset?.die && S.dice) {   // 주사위 칸을 직접 고쳐 쓰면 그 칸을 고정하고 원안을 다시 쓴다(입력 중이라 화면은 다시 그리지 않는다)
    if (/\n/.test(ev.target.value)) ev.target.value = ev.target.value.replace(/\s*\n\s*/g, " ");   // 한 줄로
    fitDie(ev.target);
    const k = ev.target.dataset.die; S.dice[k] = ev.target.value; S.dice.locks[k] = true; S.seed = diceSeed(S.dice);
    const ta = $("#seedTa"); if (ta) ta.value = S.seed;
    const lb = document.querySelector(`[data-lock="${k}"]`); if (lb) { lb.setAttribute("aria-pressed", "true"); lb.textContent = "고정됨"; }
  }
  if (ev.target.id === "storyTalkInput") { const s = storyTalkSession(S.world, S.view.key, true); s.draft = ev.target.value; ev.target.style.height = "auto"; ev.target.style.height = Math.min(ev.target.scrollHeight, 120) + "px"; const b = document.querySelector('[data-act="talk-send"]'); if (b) b.disabled = !s.draft.trim() || !!s.unsaved || storyTalkBusy(); }
  if (ev.target.id === "firstIn") S.first = ev.target.value;
  if (ev.target.id === "protoDesc") S.protoDesc = ev.target.value;
  if (ev.target.id === "regenKeep" && S.regen) { S.regen.keep = ev.target.checked; renderMain(); }
  if (ev.target.dataset?.cast !== undefined && ev.target.dataset.cf) { const c = S.cast[Number(ev.target.dataset.cast)]; if (c) c[ev.target.dataset.cf] = ev.target.value; }
  if (ev.target.id === "cpDir" && S.compose) S.compose.dir = ev.target.value;
  if (ev.target.id === "guideIn") S.guideIn = ev.target.value;
  if (ev.target.id === "avoidIn") S.prefs = { ...normPrefs(S.prefs), avoidText: ev.target.value };   // 입력 중에는 자르지 않고, 만들 때 정리한다
  if (ev.target.name === "advPick" && S.adv) { S.adv.pick = Number(ev.target.value); renderMain(); if (S.adv.pick === -2) $("#advCustom")?.focus(); }
  if (ev.target.id === "advCustom" && S.adv) { S.adv.custom = ev.target.value; const b = $('[data-act="story-go"]'); if (b) b.disabled = !S.sample || !norm(ev.target.value); }
  const fv = curFix();
  if (fv && ev.target.dataset?.fsel !== undefined) { const x = Number(ev.target.dataset.fsel); ev.target.checked ? fv.sel.add(x) : fv.sel.delete(x); renderMain(); }
  if (fv && ev.target.dataset?.fon !== undefined) { const e = fv.edits[Number(ev.target.dataset.fon)]; if (e) { e.on = ev.target.checked; renderMain(); } }
  if (fv && ev.target.dataset?.fnew !== undefined) { const e = fv.edits[Number(ev.target.dataset.fnew)]; if (e) e.new = ev.target.value; }
  if (ev.target.id === "sectionDirection" && S.edit?.section && !S.edit.aiBusy) S.edit.aiDirection = ev.target.value;
  if (ev.target.dataset?.ef && S.edit) S.edit.f[ev.target.dataset.ef] = ev.target.value;
  if (ev.target.id === "discoveryDirection" && S.discovery && !S.discovery.busy) { S.discovery.direction = ev.target.value; const button = $('[data-act="discovery-create"]'); if (button) button.textContent = ev.target.value.trim() ? "이 내용으로 새 문서 만들기" : "랜덤으로 새 문서 만들기"; }
  if (ev.target.id === "q") renderSugg();
});
$("#q").addEventListener("focus", renderSugg);
$("#searchForm").addEventListener("submit", ev => {
  ev.preventDefault(); const q = norm($("#q").value); if (!q || !S.world) return;
  const hit = Object.entries(S.world.entities).find(([, o]) => o.title.toLowerCase() === q.toLowerCase());
  if (hit) { $("#q").value = ""; $("#sugg").hidden = true; openEntity(hit[0]); } else goSearch(q);
});
document.addEventListener("change", ev => {
  if (["gMain", "gQuick", "gCheck", "gImage"].includes(ev.target.id)) { updateThinkingOptions(); updateTaskThinkingOptions(); updateModelIds(); }
  if(ev.target.dataset?.taskModel)updateTaskThinkingOptions();
  if(ev.target.dataset?.promptFlag){const row=ev.target.closest(".ai-input"),count=row?.querySelector("[data-prompt-count]");if(count)count.disabled=!ev.target.checked;}
  if(ev.target.closest?.(".gset")&&ev.target.id?.startsWith("g"))AISettingsSync.formDirty=true;
  if(ev.target.id==="aiSettingsFile"&&ev.target.files?.[0]){const file=ev.target.files[0];ev.target.value="";(async()=>{try{if(file.size>1024*1024)throw new Error("설정 파일이 너무 큽니다.");const settings=parseAISettingsFile(JSON.parse(await file.text()));GS={...GS,...settings};AISettingsSync.formDirty=false;saveGS();S.sample=gReady()?gemini:null;S.gres="AI 설정을 가져와 저장했습니다.";renderMain();await AISettingsSync.flush();AISettingsSync.render();}catch(e){setGres("가져오지 못했습니다. "+e.message)}})();}
  if (ev.target.dataset?.wcExtra) { wcToggleExtra(ev.target.dataset.wcExtra, ev.target.dataset.wcDoc, ev.target.checked); return; }
  if (ev.target.dataset?.worldExport && S.world) { const field = ev.target.dataset.worldExport; if (["images", "stories"].includes(field)) (S.worldExports[S.world.id] ||= { images: true, stories: true })[field] = ev.target.checked; return; }
  if (ev.target.dataset?.proseImage === "model" && S.proseGen?.illustration && !S.proseGen.busy) { S.proseGen.illustration.opts.model = ev.target.value; renderMain(); return; }
  if (ev.target.dataset?.proseImage && S.proseGen?.illustration && !S.proseGen.busy) { const f = ev.target.dataset.proseImage; if (["model", "style", "ratio", "direction"].includes(f)) S.proseGen.illustration.opts[f] = ev.target.value; }
  if (ev.target.dataset?.proseField && S.proseGen && !S.proseGen.busy) { const f = ev.target.dataset.proseField; if (["direction", "length"].includes(f)) S.proseGen.opts[f] = ev.target.value; }
  if (ev.target.dataset?.igf && S.imageGen && !S.imageGen.busy) { const f = ev.target.dataset.igf; S.imageGen.opts[f] = f === "useRef" ? ev.target.checked : ev.target.value; if (f === "model") renderMain(); }
  if (ev.target.dataset?.portraitFile && ev.target.files?.[0]) { const f = ev.target.files[0]; ev.target.value = ""; setPortrait(ev.target.dataset.portraitFile, f); }
  if (ev.target.id === "cpType" && S.compose) S.compose.type = ev.target.value;
  if (ev.target.dataset?.angleOff !== undefined && S.world && !S.discovery?.busy) { const w = S.world; w.angleOff = ev.target.checked; Store.saveWorld(w).catch(err => toast("저장하지 못했습니다. " + errMsg(err))); document.querySelectorAll("[data-angle-off]").forEach(x => { x.checked = w.angleOff; }); return; }
  if (ev.target.id === "importFile" && ev.target.files?.[0]) { const f = ev.target.files[0]; ev.target.value = ""; importAll(f); }
});
/* 랜덤 서핑 제스처: 단일 누름과 입력창 열기를 구분한다. */
const discoveryGesture = { click: null, hold: null, suppressUntil: 0, x: 0, y: 0 };
const discoveryButton = $("#discoveryBtn");
const clearDiscoveryHold = () => { clearTimeout(discoveryGesture.hold); discoveryGesture.hold = null; };
discoveryButton.addEventListener("click", ev => {
  if (Date.now() < discoveryGesture.suppressUntil) { discoveryGesture.suppressUntil = 0; ev.preventDefault(); return; }
  if (discoveryGesture.click || ev.detail >= 2) { clearTimeout(discoveryGesture.click); discoveryGesture.click = null; openDiscoveryPrompt(); return; }
  const wid = S.world?.id;
  discoveryGesture.click = setTimeout(() => { discoveryGesture.click = null; if (S.world?.id === wid) discoverWorld(); }, 350);
});
discoveryButton.addEventListener("dblclick", ev => { ev.preventDefault(); clearTimeout(discoveryGesture.click); discoveryGesture.click = null; if (Date.now() >= discoveryGesture.suppressUntil) openDiscoveryPrompt(); });
discoveryButton.addEventListener("pointerdown", ev => {
  if (ev.button !== 0 || discoveryButton.disabled) return;
  clearDiscoveryHold(); discoveryGesture.x = ev.clientX; discoveryGesture.y = ev.clientY;
  discoveryGesture.hold = setTimeout(() => { clearTimeout(discoveryGesture.click); discoveryGesture.click = null; discoveryGesture.suppressUntil = Date.now() + 1000; openDiscoveryPrompt(); }, 500);
});
discoveryButton.addEventListener("pointermove", ev => { if (Math.hypot(ev.clientX - discoveryGesture.x, ev.clientY - discoveryGesture.y) > 10) clearDiscoveryHold(); });
for (const event of ["pointerup", "pointercancel", "pointerleave"]) discoveryButton.addEventListener(event, clearDiscoveryHold);
discoveryButton.addEventListener("contextmenu", ev => { ev.preventDefault(); clearDiscoveryHold(); clearTimeout(discoveryGesture.click); discoveryGesture.click = null; openDiscoveryPrompt(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) clearDiscoveryHold(); });
/* 길게 누르기 감지: 터치로 빨간 링크를 0.5초 누르면 작성 페이지 */
const lp = { timer: null, fired: false, touch: false, x: 0, y: 0, clickT: null };
document.addEventListener("pointerdown", ev => {
  lp.touch = ev.pointerType === "touch" || ev.pointerType === "pen"; lp.fired = false;
  const a = ev.target.closest?.("a.wl.new"); clearTimeout(lp.timer);
  if (!a || !lp.touch) return;
  a.classList.add("pressing");
  lp.x = ev.clientX; lp.y = ev.clientY;
  lp.timer = setTimeout(() => {
    const w = S.world; if (!w) return;
    const k = a.dataset.k; if (!w.entities[k] && a.dataset.t) w.entities[k] = newEntity(a.dataset.t, "", "");
    lp.fired = true; lp.firedAt = Date.now(); try { navigator.vibrate?.(15); } catch {}
    openCompose(k);
  }, 500);
});
document.addEventListener("pointermove", ev => { if (lp.timer && Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) > 10) { clearTimeout(lp.timer); lp.timer = null; } });
["pointerup", "pointercancel"].forEach(t => document.addEventListener(t, () => { clearTimeout(lp.timer); lp.timer = null; document.querySelectorAll("a.wl.pressing").forEach(x => x.classList.remove("pressing")); }));
document.addEventListener("click", ev => {   // 길게 누른 뒤 손을 뗄 때 생기는 클릭이 작성 페이지의 버튼을 누르지 않게 한다
  if (lp.fired && Date.now() - (lp.firedAt || 0) < 900) { ev.stopPropagation(); ev.preventDefault(); lp.fired = false; }
}, true);
document.addEventListener("contextmenu", ev => { if (ev.target.closest?.("a.wl.new")) ev.preventDefault(); });
document.addEventListener("visibilitychange", () => {   // 다른 기기에서 작업하고 돌아오면 바뀐 것을 받아 온다
  if (document.visibilityState === "visible" && S.ready) {AIRecovery.refresh();AISettingsSync.load();}
  if (document.visibilityState === "visible" && (S.discovery?.busy || S.creating || S.gen || S.storyGen || S.checking || S.syncing || S.fixing || S.bgSync || S.edit?.aiBusy || S.proseGen?.busy || S.imageGen?.busy)) toast("진행 중인 응답을 이어받습니다.");
  if (document.visibilityState === "visible" && Sync.acct && S.ready && Date.now() - Sync.lastAt > 30000) Sync.pull();
  if (document.visibilityState === "hidden" && Sync.acct) {if(Sync.pending())Sync.push();AISettingsSync.load();}
});
window.addEventListener("storage", ev => { if ([AKEY, GKEY].includes(ev.key)) { Sync.acct = LS.get(AKEY); AIRecovery.authChanged(); AISettingsSync.external(); } else if (ev.key?.startsWith(AIJobs.prefix) && S.ready) AIRecovery.refresh(); });
window.addEventListener("online", () => { if (S.ready) {AIRecovery.refresh();AISettingsSync.load();} });
document.addEventListener("keydown", ev => {
  if (ev.target.id === "storyTalkInput" && ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && !window.matchMedia("(max-width: 700px)").matches) { ev.preventDefault(); if (!ev.target.disabled) sendStoryTalk(); return; }
  if (ev.key === "Escape") document.querySelectorAll(".portrait-menu[open]").forEach(m => { m.open = false; m.querySelector("summary").focus(); });
  if (ev.key === "Escape") $("#sugg").hidden = true;
  if (ev.key === "Enter" && ev.target.matches?.("textarea.die-v")) { ev.preventDefault(); ev.target.blur(); }   // 주사위 칸은 한 줄. Enter는 입력을 마친다
});

// 편집 중인 설정 폼은 자동 수신 때문에 다시 그리지 않는다.
document.addEventListener("input",ev=>{if(ev.target.closest?.(".gset")&&ev.target.id?.startsWith("g"))AISettingsSync.formDirty=true});

window.addEventListener("focus",()=>{if(S.ready)AISettingsSync.load()});
document.addEventListener("toggle", ev => { if (ev.target.id === "prefsBox") S.prefsOpen = ev.target.open; }, true);   // 분위기 조절을 펼친 상태는 다시 그려도 유지한다
