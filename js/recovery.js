"use strict";
/* 복구에서는 기존 작업만 조회한다. 새 AI 요청과 결과의 문서 반영은 분리한다. */
const AIRecovery = {
  items: [], scope: "", selected: null, detail: null, error: "", networkError: "", busy: false, all: false, fetching: false,
  pending: r => ["submitting", "queued", "running"].includes(r.status),
  closed: r => !!(r.handledAt || r.dismissedAt || r.resolvedAt),
  context() { return Sync.acct?.token ? { base: Sync.base(), owner: Sync.acct.id, token: Sync.acct.token, pass: GS.pass } : null; },
  scopeOf(ctx) { return ctx ? ctx.base + "\n" + ctx.owner + "\n" + ctx.token : ""; },
  mine(r, ctx = this.context()) { return !!ctx && r.owner === ctx.owner && r.base === ctx.base; },
  local() { return AIJobs.receipts().filter(r => this.mine(r)); },
  interested(r) { return r.meta?.recoveryV === 1 && ["page", "check", "read", "prose", "image", "illustration"].includes(r.meta.kind) && !this.closed(r) && !["cancelled", "rejected", "expired", "not_received"].includes(r.status); },
  count() { return this.local().filter(r => this.interested(r)).length; },
  focus() { return this.local().filter(r => this.interested(r) && !AIJobs.active.has(r.id)).sort((a, b) => b.createdAt - a.createdAt)[0]?.id; },
  pendingFor(wid, key) { return this.local().find(r => r.meta?.kind === "page" && r.meta.wid === wid && r.meta.key === key && (r.meta.recoveryV === 1 || this.pending(r) || (S.world?.id === wid && !S.pages[key])) && !this.closed(r) && !AIJobs.active.has(r.id) && ["submitting", "queued", "running", "succeeded"].includes(r.status)); },
  async hash(value) {
    const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, stable(v[k])])) : v;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(stable(value ?? null)))))].map(x => x.toString(16).padStart(2, "0")).join("");
  },
  pageBase(p) { return p ? [p.createdAt, p.title, p.type, p.summary, p.infobox, p.sections, p.categories, p.notices] : null; },
  async worldStamp(w, kind) {
    if (!["check", "read"].includes(kind)) return this.hash(w);
    const { updatedAt, ageRules, ...world } = w, pages = await Store.listPages(w.id);
    return this.hash([world, Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, this.pageBase(p)]))]);
  },
  async capture(kind, w, key, extra = {}) {
    if (!w?.id || !key) return { kind, ...extra };
    const stored = await Store.getWorld(w.id), p = S.world === w ? S.pages[key] : await Store.getPage(w.id, key);
    if (!stored) return { kind, wid: w.id, key, ...extra };
    const e = w.entities[key], story = extra.storyId && shortStoriesOf(p).find(s => s.id === extra.storyId);
    return { kind, title: e?.title || p?.title || "", wid: w.id, key, group: extra.group || crypto.randomUUID(), recoveryV: 1,
      worldStamp: await this.worldStamp(stored, kind), pageStamp: await this.hash([stored.id, stored.createdAt, stored.seed, this.pageBase(p)]), hadPage: !!p,
      ...(e && !stored.entities[key] ? { entity: { title: String(e.title || "").slice(0,300), type: String(e.type || "").slice(0,300), summary: String(e.summary || "").slice(0,300) } } : {}),
      assetStamp: await this.hash(story ? portraitSrc({ portrait: story.illustration }) : portraitSrc(p)),
      refStamp: await this.hash(portraitSrc(p)), ...(story ? { storyStamp: await this.hash([story.id, story.title, story.body]) } : {}), ...extra };
  },
  async cached(r) {
    let record;
    try { record = Store.mode === "idb" ? await IDB.get("job:" + r.id) : LS.get("job:" + r.id); } catch {}
    return record && this.mine(record.receipt) && record.receipt.id === r.id ? record.result : undefined;
  },
  render() {
    if (!S.ready) return;
    renderSide();
    if (S.view.name === "jobs") renderMain();
  },
  open(id) {
    if (S.edit || S.gen || S.storyGen || S.imageGen?.busy || S.proseGen?.busy || S.checking || S.syncing) { toast("진행 중인 작업이나 편집을 마친 뒤 AI 작업 목록을 열어 주세요."); return; }
    this.selected = id || this.selected; this.detail = null; S.view = { name: "jobs", ...(this.selected ? { job: this.selected } : {}) };
    renderAll(); this.refresh().then(() => { if (this.selected) this.preview(this.selected); }); window.scrollTo({ top: 0 });
  },
  start() {
    if (!this.timer) this.timer = setInterval(() => { if (!document.hidden && (S.view.name === "jobs" || this.local().some(r => this.pending(r)))) this.refresh(); }, 5000);
    this.refresh().then(() => { if (S.view.name === "jobs" && S.view.job) this.preview(S.view.job); });
  },
  authChanged() {
    const scope = this.scopeOf(this.context());
    if (scope === this.scope) return;
    this.scope = ""; this.items = []; this.detail = null; this.selected = null; this.busy = false; this.fetching = false; this.error = ""; this.networkError = "";
    if (S.view.name === "jobs") S.view = { name: "jobs" };
    if (S.ready) { this.render(); this.refresh(); }
  },
  async refresh() {
    const ctx = this.context(), scope = this.scopeOf(ctx);
    if (scope !== this.scope) { this.scope = scope; this.items = []; this.detail = null; this.error = ""; this.networkError = ""; this.fetching = false; this.busy = false; }
    if (!ctx) { this.render(); return; }
    if (this.fetching) return;
    this.fetching = true;
    let changed = false;
    try {
      const list = await AIJobs.req(ctx, ""); if (!AIJobs.current(ctx)) return;
      const local = new Map(this.local().map(r => [r.id, r]));
      const sync = () => { for (const j of list.jobs || []) {
        const old = local.get(j.id), r = { ...old, ...j, meta: old?.meta || j.meta || {}, owner: ctx.owner, base: ctx.base };
        if (!old && !j.meta) continue; // 이전 버전에서 대상 정보 없이 만든 기록은 자동으로 가져오지 않는다.
        AIJobs.save(r); local.set(r.id, r);
        if(typeof DocumentCost!=="undefined")DocumentCost.recovered(r);
      } };
      if (typeof DocumentCost !== "undefined") DocumentCost.batch(sync); else sync();   // 비용 기록 저장·화면 갱신은 작업마다가 아니라 끝에 한 번만
      const next = [...local.values()].sort((a, b) => b.createdAt - a.createdAt);
      changed = JSON.stringify(next) !== JSON.stringify(this.items) || !!this.networkError;
      this.items = next; this.networkError = "";
      for (const r of next.filter(r => (r.handledAt || r.dismissedAt) && !r.resolvedAt && !this.pending(r)).slice(0, 10)) {
        try { const j = await AIJobs.req(ctx, "/" + r.id + "/resolve", {}); if (!AIJobs.current(ctx)) return; Object.assign(r, j.job); AIJobs.save(r); } catch {}
      }
      for (const r of next.filter(r => r.cancelRequested && this.pending(r) && !AIJobs.active.has(r.id))) {
        try { const j = await AIJobs.req(ctx, "/" + r.id + "/cancel", {}); if (!AIJobs.current(ctx)) return; Object.assign(r, j.job); AIJobs.save(r); changed = true; } catch {}
      }
      if (this.selected && this.detail?.receipt?.id === this.selected) {
        const current = local.get(this.selected);
        if (current && current.status !== this.detail.receipt.status) { this.detail = null; changed = true; }
        else if (current) this.detail.receipt = current;
      }
    } catch (e) {
      if (AIJobs.current(ctx)) { this.networkError = e.status === 401 ? "같은 계정으로 다시 로그인하면 서버 작업을 확인할 수 있습니다." : "서버 상태를 확인하지 못했습니다. 저장된 결과는 계속 열 수 있습니다."; this.items = this.local().sort((a, b) => b.createdAt - a.createdAt); changed = true; }
    } finally {
      if (this.scope === scope) { this.fetching = false; if (changed) this.render(); }
    }
    if (S.view.name === "jobs" && S.view.job && !this.detail) this.preview(S.view.job);
  },
  async result(r, ctx) {
    const local = await this.cached(r); if (local !== undefined) { if(typeof DocumentCost!=="undefined")DocumentCost.recovered(r,local);return local; }
    const response = await AIJobs.req(ctx, "/" + r.id);
    if (!AIJobs.current(ctx)) throw new Error("로그인 계정이나 서버가 바뀌었습니다.");
    Object.assign(r, response.job); AIJobs.save(r);
    if(typeof DocumentCost!=="undefined")DocumentCost.recovered(r,response.result);
    if (response.result !== undefined) {
      if (await AIJobs.cache(r, response.result)) AIJobs.ack(ctx, r);
      return response.result;
    }
    return undefined;
  },
  async preview(id, reveal = false) {
    const ctx = this.context(); if (!ctx) return;
    if (this.busy && this.selected === id) return;
    if (this.selected !== id) this.error = "";
    const request = {};
    const current = () => this.busy === request && this.selected === id && AIJobs.current(ctx);
    this.selected = id; S.view = { name: "jobs", job: id }; this.busy = request; this.detail = null; this.render();
    if (reveal) document.getElementById("job-result-" + id)?.scrollIntoView({ block: "nearest" });
    let r = this.local().find(r => r.id === id);
    try {
      if (!r) throw new Error("이 계정의 작업을 찾을 수 없습니다.");
      // 접수 거절은 서버에 작업 번호가 없으므로 다시 조회하면 원래 거절 사유가 404 안내에 가려진다.
      if (r.error?.message && (r.status === "rejected" || r.status === "not_received" && ["job_api","job_auth"].includes(r.error.code))) {
        r.status = "rejected"; AIJobs.save(r); this.detail = { receipt:r, error:r.error.message }; return;
      }
      const result = await this.result(r, ctx); if (!current()) return;
      const image = r.type.endsWith(".image");
      const text = image || result === undefined ? "" : (result.candidates?.[0]?.content?.parts || []).filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
      const parsed = text ? parseJsonLoose(text) : null;
      const src = image && result !== undefined ? await imageResultSrc(result, r.type.startsWith("openai.")) : "";
      if (!current()) return;
      this.detail = { receipt: r, result, text, parsed, src, error: result === undefined && r.status === "succeeded" ? "서버 보관 기간이나 받은 결과 수를 넘겨 원문이 없습니다. 로컬 캐시가 남아 있는 브라우저에서 확인해 주세요." : "" };
    } catch (e) {
      if (current()) {
        if (e.status === 404 && r) { r.status = "not_received"; AIJobs.save(r); }
        this.detail = { receipt: r || { id, status: "unknown", meta: {} }, error: e.status === 404 ? "서버에서 이 번호를 찾지 못했습니다. 접수되지 않았거나 보관 기간이 지났을 수 있습니다. 새 AI 요청은 시작하지 않았습니다." : e.message || errMsg(e) };
      }
    } finally { if (this.busy === request && AIJobs.current(ctx)) { this.busy = false; this.items = this.local().sort((a, b) => b.createdAt - a.createdAt); this.render(); } }
  },
  async handled(groupOrId, dismissed = false) {
    if (!groupOrId) return;
    const ctx = this.context(); if (!ctx) return;
    for (const r of this.local().filter(r => r.id === groupOrId || r.meta?.group === groupOrId)) {
      if (dismissed) r.dismissedAt = Date.now(); else r.handledAt = Date.now();
      AIJobs.save(r);
      AIJobs.req(ctx, "/" + r.id + "/resolve", {}).catch(() => {});
    }
    this.items = this.local().sort((a, b) => b.createdAt - a.createdAt);
  },
  async cancel(id) {
    const ctx = this.context(), r = this.local().find(r => r.id === id); if (!ctx || !r) return;
    r.cancelRequested = true; AIJobs.save(r);
    try { const j = await AIJobs.req(ctx, "/" + id + "/cancel", {}); if (!AIJobs.current(ctx)) return; Object.assign(r, j.job); AIJobs.save(r); await this.refresh(); await this.preview(id); }
    catch (e) { if (AIJobs.current(ctx)) { this.error = "중단 요청을 저장했습니다. 연결이 돌아오면 다시 확인합니다."; this.render(); } }
  },
  async guard(r) {
    const m = r.meta || {}, w = await Store.getWorld(m.wid), p = w && await Store.getPage(m.wid, m.key);
    if (!w) throw new Error("원래 세계관이 삭제되었습니다. 결과 내려받기를 이용해 주세요.");
    if (p?.recoveryJobs?.includes(r.id)) throw new Error("이미 이 결과를 반영했습니다.");
    if (m.recoveryV !== 1 || !m.worldStamp || !m.pageStamp) throw new Error("이전 버전 작업이라 원본을 대조할 정보가 없습니다. 미리보기와 내려받기를 이용해 주세요.");
    if (await this.hash([w.id, w.createdAt, w.seed, this.pageBase(p)]) !== m.pageStamp) throw new Error("원래 문서가 수정·삭제되었거나 다른 문서가 저장되었습니다. 결과는 그대로 보관했습니다.");
    if (!r.type.endsWith(".image") && await this.worldStamp(w, m.kind) !== m.worldStamp) throw new Error("요청 뒤 세계관 설정이나 참고 문서가 바뀌었습니다. 결과를 자동으로 덮어쓰지 않습니다.");
    if (r.type.endsWith(".image")) {
      const story = m.storyId && shortStoriesOf(p).find(s => s.id === m.storyId);
      if (m.storyId && (!story || await this.hash([story.id, story.title, story.body]) !== m.storyStamp)) throw new Error("원래 단편이 바뀌거나 삭제되었습니다.");
      if (await this.hash(story ? portraitSrc({ portrait: story.illustration }) : portraitSrc(p)) !== m.assetStamp || await this.hash(portraitSrc(p)) !== m.refStamp) throw new Error("요청 뒤 기존 이미지가 바뀌었습니다. 복구 결과는 보관했습니다.");
    }
    return { w: JSON.parse(JSON.stringify(w)), p: p ? JSON.parse(JSON.stringify(p)) : null };
  },
  applying: false,
  async apply(id) {
    const ctx = this.context(), r = this.local().find(r => r.id === id);
    if (!ctx || !r || this.applying || AIJobs.active.size || S.gen || S.storyGen || S.checking || S.edit || S.imageGen?.busy || S.proseGen?.busy || S.syncing) { toast("진행 중인 작업이나 편집을 먼저 마쳐 주세요."); return; }
    this.applying = true; this.error = "";
    try {
      const result = await this.result(r, ctx);
      if (r.type === "document.pipeline") {
        if (!result?.pipeline?.saved) throw new Error(result?.pipeline?.error?.message || "자동 저장되지 않은 초안입니다. 내려받아 확인해 주세요.");
        await DocumentPipeline.openSaved(r,result,ctx); return;
      }
      const { w, p } = await this.guard(r), m = r.meta;
      if (result === undefined) throw new Error("완료 결과를 찾을 수 없습니다.");
      let nextWorld = null, nextPage, appliedIds = [id];
      const text = (result.candidates?.[0]?.content?.parts || []).filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join(""), out = parseJsonLoose(text);
      if (r.type.endsWith(".image")) {
        if (!p) throw new Error("이미지를 적용할 원래 문서가 없습니다.");
        const src = await imageResultSrc(result, r.type.startsWith("openai."));
        nextPage = m.storyId ? { ...p, shortStories: shortStoriesOf(p).map(s => s.id === m.storyId ? { ...s, illustration: src } : s) } : { ...p, portrait: src };
      } else if (m.kind === "page") {
        if (!Array.isArray(out?.sections) || !out.sections.some(s => typeof s?.body === "string" && s.body.trim()) || out.redirect || out.notFound) throw new Error("저장할 문서 본문이 없습니다. 결과 미리보기를 확인해 주세요.");
        const copy = JSON.parse(JSON.stringify(w));
        if (!copy.entities[m.key]) { if (!m.entity || m.hadPage) throw new Error("원래 문서 항목이 삭제되었습니다."); copy.entities[m.key] = newEntity(m.entity.title, m.entity.type, m.entity.summary); }
        if (p) prepareRewrite(copy, m.key);
        delete out.navboxes; for (const s of out.sections) delete s.ch;
        autoLink(copy, m.key, out); widenAffil(copy, out.categories);
        nextPage = integrate(copy, m.key, out, { noAI: true }); nextWorld = copy;
        if (out.categories === undefined) nextPage.stale = "new";   // 분류·사실은 정리 호출이 붙인다. 복구한 초안은 문서 위 '다시 정리'로 붙인다
        if (p) {
          for (const k of ["createdAt", "portrait", "shortStories"]) if (p[k] !== undefined) nextPage[k] = p[k];
          if (!nextPage.motifs && p.motifs) nextPage.motifs = p.motifs;
          nextPage.rewrittenAt = Date.now();
        }
        if (m.direction) nextPage.direction = m.direction;
        if (isStory(copy)) nextPage.baseAsOf = nextPage.syncedTo = copy.story.chapter;
      } else if (["check", "read"].includes(m.kind)) {
        if (!p) throw new Error("검사를 반영할 원래 문서가 없습니다.");
        if (p.check?.at > r.createdAt && p.check.recoveryGroup !== m.group) throw new Error("이미 더 최근 검사 결과가 있습니다.");
        const siblings = this.local().filter(x => x.meta?.group === m.group && x.meta.wid === m.wid && x.meta.key === m.key && x.meta.pageStamp === m.pageStamp && ["check", "read"].includes(x.meta.kind));
        if (siblings.some(x => this.pending(x))) throw new Error("같이 실행한 검사가 아직 진행 중입니다. 완료된 뒤 다시 반영해 주세요.");
        appliedIds = siblings.filter(x => x.status === "succeeded").map(x => x.id);
        const issues = [];
        for (const s of siblings.filter(x => x.status === "succeeded")) {
          const value = await this.result(s, ctx); const raw = (value?.candidates?.[0]?.content?.parts || []).filter(x => typeof x.text === "string" && !x.thought).map(x => x.text).join("");
          const parsed = parseJsonLoose(raw);
          if (!Array.isArray(parsed?.issues)) throw new Error("검사 응답 형식을 확인할 수 없습니다. 결과 내려받기를 이용해 주세요.");
          issues.push(...parseIssues(parsed));
        }
        const pages = await Store.listPages(w.id), liveWorld = S.world, livePages = S.pages;
        try { S.world = w; S.pages = pages; issues.push(...detIssues(w, m.key)); }
        finally { S.world = liveWorld; S.pages = livePages; }
        nextPage = { ...p, check: { at: Date.now(), issues: mergeIssues(issues), auto: false, recovered: true, recoveryGroup: m.group, numV: numStamp(w) } };
      } else if (m.kind === "prose") {
        if (!p || typeof out?.title !== "string" || !out.title.trim() || typeof out?.body !== "string" || !out.body.trim() || out.body.length > 60000) throw new Error("보관할 단편 형식을 확인할 수 없습니다.");
        if (shortStoriesOf(p).length >= 20) throw new Error("문서당 단편 20편까지 보관할 수 있습니다.");
        nextPage = { ...p, shortStories: [...shortStoriesOf(p), { id: r.id, title: out.title.slice(0, 100), body: out.body, direction: m.direction || "", length: m.length || "medium", createdAt: r.createdAt, sourceTitle: p.title, sourceStamp: imageDocStamp(p) }] };
      } else throw new Error("이 작업은 미리보기와 결과 내려받기를 지원합니다.");
      if (!AIJobs.current(ctx)) throw new Error("로그인 계정이나 서버가 바뀌었습니다.");
      nextPage.recoveryJobs = [...new Set([...(p?.recoveryJobs || []), ...appliedIds])].slice(-40);
      const saved = await Store.commitRecovery(w, p, nextWorld, nextPage, () => AIJobs.current(ctx));
      for (const applied of appliedIds) await this.handled(applied);
      S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (!AIJobs.current(ctx)) return;
      S.world = saved.world; S.pages = await Store.listPages(saved.world.id); S.view = { name: "article", key: saved.page.key };
      this.detail = null; renderAll(); toast(m.kind === "page" ? "복구한 문서를 저장했습니다. 자동 검사는 실행하지 않았습니다." : "복구한 결과를 반영했습니다.");
    } catch (e) { if (AIJobs.current(ctx)) { this.error = e.message || errMsg(e); this.render(); } }
    finally { this.applying = false; if (AIJobs.current(ctx) && S.view.name === "jobs") this.render(); }
  },
  async download(id) {
    const ctx = this.context(), r = this.local().find(r => r.id === id); if (!ctx || !r) return;
    try {
      const shown = this.detail?.receipt?.id === id ? this.detail : null;
      const result = shown ? shown.result : await this.result(r, ctx);
      if (!AIJobs.current(ctx) || (result === undefined && !r.error)) return;
      const blob = new Blob([JSON.stringify({ job: { id: r.id, type: r.type, model: r.model, meta: r.meta, status: r.status, error: r.error }, result }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "worldwiki-result-" + r.id + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { this.error = e.message || errMsg(e); this.render(); }
  },
};

const STEP_STATUS = { done: "완료", failed: "실패", unknown: "결과 확인 불가", running: "실행 중" };
const stepLabel = kind => ({ page: "초안 생성", check: "설정 대조", read: "문서 내부 검사", fix: "자동 수정", analyze: "직접 편집 설정 대조", factSync: "확정 사실·분류 정리", ageRule: "나이 규칙 해석" }[kind] || KIND[kind] || kind || "AI 호출");
/* 서버가 남긴 단계별 시각(호출 시작 기준 ms)으로 어디서 늘어졌는지 판정한다. AI를 다시 부르지 않는다. */
const SLOW_FIRST_MS = 120000;
function diagnoseTiming(t, status, code, detail) {
  if (!t || !Number.isFinite(t.at)) return { level: "", text: "시간 기록 없음(이전 버전 작업)" };
  code = t.code || code || "";
  const s = ms => (ms / 1000).toFixed(1) + "초";
  if (code === "no_first_response") return { level: "bad", text: `첫 응답 없이 ${s(t.end)} 대기 후 차단 — 모델이 생각 단계에서 멈췄거나 생각이 지나치게 깁니다` };
  if (code === "stream_stalled") return { level: "bad", text: `응답 ${s(t.last)}부터 멈춤 — 제공자 스트림이 도중에 끊기지 않고 멎었습니다` };
  if (code === "deadline_exceeded") return { level: "bad", text: t.first === null ? "서버 10분 제한 도달 — 끝까지 첫 응답이 없었습니다" : "서버 10분 제한 도달 — 응답은 오고 있었지만 너무 길었습니다" };
  if (t.end === null) return { level: "warn", text: "아직 실행 중이거나 서버가 도중에 종료됐습니다" };
  if (t.headers === null) return { level: "bad", text: "AI 서버 연결 단계에서 실패했습니다" };
  if (status === "failed" || status === "unknown") return { level: "bad", text: "응답을 받았지만 처리에 실패했습니다" + (code ? ` (${code})` : "") + (detail ? ` — 공급자 응답: ${detail}` : code === "upstream_error" ? " — 공급자 사유가 기록되지 않았습니다(사유를 남기는 서버 코드는 v8.43부터)" : "") };
  if (t.first !== null && t.first >= SLOW_FIRST_MS) return { level: "warn", text: `첫 응답까지 ${s(t.first)} — 생각 시간이 깁니다. 생각 수준을 낮추면 빨라집니다` };
  return { level: "ok", text: "정상" };
}
/* 프롬프트 캐시 진단: 캐시 대상 앞부분의 크기와 해시. 해시가 문서마다 같아야 재사용될 수 있다. */
const cacheMinTokens = model => /^gemini-2\.5/.test(model || "") ? 2048 : /^gemini-/.test(model || "") ? 4096 : /^gpt-/.test(model || "") ? 1024 : 0;
function cacheDiagHtml(x) {
  const c = x.cache; if (!c) return "";
  const read = x.usage?.cachedContentTokenCount || 0, min = cacheMinTokens(x.model);
  const verdict = read ? `캐시 재사용 ${read.toLocaleString()}토큰` : Number.isFinite(c.tokens) && min && c.tokens < min ? `앞부분이 최소 ${min.toLocaleString()}토큰보다 짧아 캐시되지 않습니다` : "캐시 재사용 없음 — 직전 문서와 해시가 같은지, 몇 분 안에 이어 썼는지 확인";
  return `<br><small>캐시 대상 앞부분 ${c.chars.toLocaleString()}자${Number.isFinite(c.tokens) ? ` · ${c.tokens.toLocaleString()}토큰` : ""}${min ? ` (최소 ${min.toLocaleString()})` : ""} · 해시 <code>${esc((c.hashes || [c.hash]).join("-"))}</code> · ${esc(verdict)}</small>`;
}
/* 미완료 초안과 서버 작업 결과가 같은 진단 형식을 사용한다. 원문 전체 대신 메모·응답·적용 실패를 크기 제한해 보존한다. */
function reviewDiagnosisHtml(d) {
  return d ? `<details class="memo review-diag"><summary>자동 수정 진단${d.stopReason ? " · " + esc(d.stopReason) : ""}</summary><pre class="logpre">${esc(JSON.stringify(d, null, 2))}</pre></details>` : "";
}
function jobDiagnosisHtml(r, report, open) {
  const rows = (Array.isArray(report?.steps) ? report.steps : Array.isArray(r?.steps) ? r.steps : r?.timing ? [{ kind: r.meta?.kind, model: r.model, status: r.status === "succeeded" ? "done" : r.status, timing: r.timing, code: r.error?.code }] : [])
    .map(x => ({ ...x, d: diagnoseTiming(x.timing, x.status, x.code || x.error?.code, x.error?.detail) }));
  if (!rows.length) return "";
  const s = ms => ms === null || ms === undefined ? "-" : (ms / 1000).toFixed(1) + "초";
  const kb = n => n >= 1024 ? (n / 1024).toFixed(1) + "KB" : (n || 0) + "B";
  const timed = rows.filter(x => Number.isFinite(x.timing?.end)), slow = timed.sort((a, b) => b.timing.end - a.timing.end)[0];
  const bad = rows.find(x => x.d.level === "bad") || rows.find(x => x.d.level === "warn");
  const total = Array.isArray(report?.steps) || Array.isArray(r?.steps) ? rows.reduce((n, x) => n + (x.timing?.end || 0), 0) : 0;
  return `<details class="job-diag memo"${open || bad ? " open" : ""}><summary>실행 진단${bad ? ` · ${esc(stepLabel(bad.kind))}: ${esc(bad.d.text.split(" — ")[0])}` : " · 이상 없음"}</summary><div class="cost-body">
    <p class="note">${slow ? `가장 오래 걸린 호출: ${esc(stepLabel(slow.kind))} ${s(slow.timing.end)}` : "시간 기록이 없습니다."}${total ? ` · AI 호출 합계 ${s(total)}(검사는 동시에 실행)` : ""}. 서버 감시 기준: 첫 응답 240초, 도중 멈춤 90초, 전체 10분. 이 작업을 실행한 서버 코드: ${report ? esc(report.relay || "v8.45 이전(버전 기록 없음)") : "-"}.</p>
    ${reviewDiagnosisHtml(report?.reviewDiagnostics)}
    <ul>${rows.map(x => `<li class="diag-${x.d.level}"><span><b>${esc(stepLabel(x.kind))}</b> · ${esc(x.model || "")} · ${esc(STEP_STATUS[x.status] || x.status || "")}<br><small>${esc(x.d.text)}</small>${cacheDiagHtml(x)}${x.text ? `<details class="step-text"><summary>응답 보기</summary><pre class="logpre">${esc(x.text)}</pre></details>` : ""}</span><span>${x.timing ? `첫 응답 ${s(x.timing.first)} · 총 ${s(x.timing.end)}${x.timing.last !== null && x.timing.end !== null ? ` · 마지막 수신 후 ${s(x.timing.end - x.timing.last)}` : ""} · ${kb(x.timing.bytes)}` : "-"}</span></li>`).join("")}</ul>
  </div></details>`;
}

function jobsHtml() {
  if (!Sync.acct) return `<div class="sheet"><h1 class="t">AI 작업</h1><p>작업을 접수한 계정으로 로그인하면 결과를 이어받을 수 있습니다.</p><button class="btn pri" data-act="gset">로그인하기</button></div>`;
  const R = AIRecovery, all = R.items.length ? R.items : R.local(), list = R.all ? all : all.filter(r => !R.closed(r));
  const labels = { submitting: "접수 확인 중", queued: "대기 중", running: "실행 중", succeeded: "완료", failed: "실패", interrupted: "결과 확인 필요", cancelled: "중단됨", rejected: "접수 거절", not_received: "서버 기록 없음", expired: "보관 기간 만료" };
  const d = R.detail, r = d?.receipt, m = r?.meta || {}, parsed = d?.parsed;
  const selected = S.view.job, visible = list.slice(0, 60);
  const report = d?.result?.pipeline, failure = r?.error || report?.error;
  const supported = r?.type === "document.pipeline" ? !!d.result?.pipeline?.saved : r && (r.type?.endsWith(".image") || ["page", "check", "read", "prose"].includes(m.kind));
  const body = d?.src ? imageZoomHtml(d.src, (m.title || "복구") + " 이미지", true) : Array.isArray(parsed?.sections) ? parsed.sections.filter(s => typeof s?.body === "string").map(s => `<h3>${esc(s.heading || "본문")}</h3><div class="job-text">${esc(s.body)}</div>`).join("") : Array.isArray(parsed?.issues) ? `<p>${parseIssues(parsed).length ? "복구한 검사 지적입니다." : "이 검사 응답에는 지적이 없습니다."}</p>${parseIssues(parsed).map(i => `<article class="job-issue"><b>${esc(i.claim)}</b><p>${esc(i.conflict)}</p></article>`).join("")}` : `<div class="job-text">${esc((typeof parsed?.body === "string" ? parsed.body : d?.text || "").slice(0, 120000))}</div>`;
  const steps = failure && Array.isArray(report?.steps) ? report.steps.map(s => esc(stepLabel(s.kind)) + " " + esc(STEP_STATUS[s.status] || s.status)).join(" · ") : "";
  const result = R.busy ? `<p class="note" role="status">결과를 불러오는 중…</p>` : d ? `<section class="job-detail"><h2>${esc(m.title || "작업 결과")}</h2><p class="note">${esc(labels[r.status] || "상태 확인 필요")} · ${esc(r.model || "")}</p>
    ${typeof DocumentCost!=="undefined" ? DocumentCost.jobHtml(r,report) : ""}
    ${report ? `<p class="banner ${report.saved ? "" : "warn"}">${report.saved ? "서버에 저장된 결과입니다. 문서 열기는 AI를 다시 실행하지 않습니다." : d.text ? "초안을 보관했습니다. 문서는 자동 저장되지 않았습니다." : "문서가 저장되지 않았습니다."}</p>` : ""}
    ${d.error || failure?.message ? `<p class="banner warn" role="alert">${esc(d.error || failure.message)}</p>` : ""}
    ${failure?.code ? `<p class="note">오류 코드 <code>${esc(failure.code)}</code>${failure.httpStatus ? " · HTTP " + esc(failure.httpStatus) : ""}</p>` : ""}
    ${steps ? `<p class="note">${steps}</p>` : ""}
    ${jobDiagnosisHtml(r, report, !!failure)}
    ${R.pending(r) ? `<p>서버에서 작업을 계속하고 있습니다. 이 화면을 닫아도 작업은 유지됩니다.</p><button class="btn" data-job-cancel="${esc(r.id)}">작업 중단</button>` : ""}
    ${d.result !== undefined ? body : ""}
    ${d.result !== undefined || r.error ? `<div class="row">${d.result !== undefined && supported && m.recoveryV === 1 && !R.closed(r) ? `<button class="btn pri" data-job-apply="${esc(r.id)}" ${R.applying ? "disabled" : ""}>${r.type === "document.pipeline" ? "저장된 문서 열기" : r.type.endsWith(".image") ? "이 이미지 적용" : m.kind === "page" ? "문서로 저장 (자동 검사 전)" : m.kind === "prose" ? "이 단편 보관" : "검사 결과 반영"}</button>` : ""}<button class="btn" data-job-download="${esc(r.id)}">결과 내려받기</button></div>` : ""}
    ${!R.pending(r) && !R.closed(r) ? `<div class="row"><button class="btn" data-job-dismiss="${esc(r.id)}">복구 목록에서 닫기</button></div>` : ""}
    <details class="memo"><summary>작업 번호</summary><p class="note">${esc(r.id)}</p></details></section>` : "";
  const panel = selected && result ? `<div id="job-result-${esc(selected)}" class="job-result">${result}</div>` : "";
  return `<div class="sheet jobs"><div class="crumb"><span>도구</span></div><h1 class="t">AI 작업</h1>
    <p class="note">새로고침하거나 탭을 다시 열어도 접수한 작업을 조회합니다. 복구할 때 AI를 다시 실행하지 않습니다. 서버 문서 작업은 생성·검사를 마치면 자동 저장합니다. 원본이 바뀐 작업의 초안과 개별 AI 결과도 여기서 확인할 수 있습니다.</p>
    <div class="row"><button class="btn" data-act="jobs-refresh">상태 새로고침</button><button class="btn" data-act="jobs-filter">${R.all ? "복구할 작업만 보기" : "전체 기록 보기"}</button></div>
    ${R.error ? `<p class="banner warn" role="alert">${esc(R.error)}</p>` : ""}
    ${R.networkError ? `<p class="banner warn" role="status">${esc(R.networkError)}</p>` : ""}
    ${visible.some(x => x.id === selected) ? "" : panel}
    <div class="job-list">${visible.map(x => `<article class="job-card ${x.id === selected ? "selected" : ""}"><div><b>${esc(x.meta?.title || "대상 정보 없는 작업")}</b><span>${esc(x.meta?.kind === "illustration" ? "단편 삽화" : KIND[x.meta?.kind] || (x.type?.endsWith(".image") ? "이미지 생성" : "AI 작업"))} · ${esc(R.pending(x) && x.phase ? ({generate:"문서 작성",check:"설정 검사",fix:"자동 수정",saving:"서버 저장"}[x.phase] || labels[x.status]) : labels[x.status] || "상태 확인 필요")}${R.closed(x) ? " · 확인함" : ""}</span><small>${esc(new Date(x.createdAt).toLocaleString("ko-KR"))}</small></div><button class="btn" data-job-preview="${esc(x.id)}" aria-expanded="${x.id === selected && !!panel}"${x.id === selected && panel ? ` aria-controls="job-result-${esc(x.id)}"` : ""}>${R.pending(x) ? "진행 보기" : "결과 보기"}</button></article>${x.id === selected ? panel : ""}`).join("") || `<p class="note">${R.fetching ? "작업을 불러오는 중…" : "복구할 작업이 없습니다."}</p>`}</div></div>`;
}
