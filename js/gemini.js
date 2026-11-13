"use strict";
/* 진단 로그와 Gemini API 호출(연결 설정, 재시도, 스트리밍) */
/* ---------- 진단 로그 ---------- */
/* 문서 작성에 쓸 모델과 생각 깊이 (사용자 지정) */
const PAGE_MODEL = {};   // 모델과 생각 깊이는 'AI 연결 설정'에서 정한다

/* ---------- Gemini API ---------- */
const GKEY = "wwiki:gemini";
const GBASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_RELAY = "https://lucky-feather-d3e9.sjh0918092.workers.dev";   // 기본 중계 서버. 주소는 공개돼도 되고, 접속 암호가 있어야 쓸 수 있다
const GDEF = { mode: "key", relay: DEFAULT_RELAY, pass: "", key: "", main: "gemini-3.8-flash", mainThink: "", quick: "gemini-3.5-flash-lite", quickThink: "", check: "", checkThink: "medium", preCheck: true, imageModel: "gpt-image-2.5-flare", imageDefaultVersion: 1, openaiKey: "" };   // check: 설정 검사·수정 대조. 비우면 기본 모델
const THINKS = [["", "모델 기본값"], ["minimal", "minimal"], ["low", "low"], ["medium", "medium"], ["high", "high"]];
let GS = (() => {
  let st = {}; try { st = JSON.parse(localStorage.getItem(GKEY) || "{}") || {}; } catch {}
  const g = { ...GDEF, ...st };
  if (!st.mode) g.mode = st.key ? "key" : "relay";   // 처음 온 사람(친구)은 중계 서버 연결로 시작하고, 키를 쓰던 사람은 그대로 둔다
  if (!g.relay) g.relay = DEFAULT_RELAY;
  if (!st.imageDefaultVersion) {
    if (!st.imageModel || st.imageModel === "gemini-nano-banana-2.1") g.imageModel = GDEF.imageModel;
    g.imageDefaultVersion = 1;
    try { localStorage.setItem(GKEY, JSON.stringify(g)); } catch {}
  }
  return g;
})();
/* 연결 방식: 내 API 키로 Google에 바로 요청하거나(key), 중계 서버를 거친다(relay) */
const gRelay = () => GS.mode === "relay";
const gReady = () => gRelay() ? !!(GS.relay && GS.pass) : !!GS.key;
const gBase = () => gRelay() ? GS.relay.replace(/\/+$/, "") + "/v1beta" : GBASE;
const gAuth = () => gRelay() ? { "X-WW-Pass": GS.pass } : { "x-goog-api-key": GS.key };
const normRelay = u => { u = String(u || "").trim().replace(/\/+$/, "").replace(/\/v1beta$/, ""); if (u && !/^https?:\/\//i.test(u)) u = "https://" + u; return u; };
const saveGS = () => { try { localStorage.setItem(GKEY, JSON.stringify(GS)); } catch {} };
function parseJsonLoose(t) {
  const tries = [t, t.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")];
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const x of tries) { try { return JSON.parse(x); } catch {} }
  return undefined;
}
async function gFetch(path, init) {
  try { return await fetch(gBase() + path, init); }
  catch (e) { if (e?.name === "AbortError") throw { code: "cancelled" }; throw { code: "network", message: String(e?.message || e) }; }
}
async function gError(res, model) {
  let msg = ""; try { const j = await res.json(); msg = j?.error?.message || ""; } catch {}
  const st = res.status;
  if (/location is not supported/i.test(msg)) return { code: "region", message: msg };
  if (st === 401 || st === 403 || /api key/i.test(msg)) return { code: "bad_key", message: msg };
  if (st === 404) return { code: "model_not_found", message: `${model}: ${msg}` };
  if (st === 429) return { code: "rate_limited", message: msg };
  if (st === 413 || /token count|too long|exceeds the maximum/i.test(msg)) return { code: "prompt_too_large", message: msg };
  if (st >= 500) return { code: "upstream_error", message: msg };
  return { code: "api_" + st, message: msg || "HTTP " + st };
}
/* 연결이 끊기면 받은 데까지 이어 받고, 그래도 안 되면 처음부터 다시 받는다 */
const G_RETRY = 3;            // 끊긴 뒤 다시 시도할 최대 횟수
const G_IDLE_MS = 180000;     // 내부 사고 중 첫 응답은 최대 3분 기다린다
const G_PROGRESS_IDLE_MS = 80000;   // 출력·사고 토큰이 진행된 뒤 80초간 멎었을 때만 복구
const G_STAGE_MAX_MS = 600000;      // 문서 작성·검사 한 호출은 재시도를 포함해 최대 10분
const G_PROGRESS_RETRY = 2;
/* 모바일이 숨겨진 탭을 정지한 시간은 서버의 무응답으로 세지 않는다. */
const G_RESUME_GRACE_MS = 10000;
const gPage = typeof document === "undefined" ? null : document;
let gHiddenAt = gPage?.hidden ? Date.now() : null, gHiddenTotal = 0;
if (gPage) gPage.addEventListener("visibilitychange", () => {
  if (gPage.hidden) { if (gHiddenAt === null) gHiddenAt = Date.now(); }
  else if (gHiddenAt !== null) { gHiddenTotal += Date.now() - gHiddenAt; gHiddenAt = null; }
});
const gActiveNow = () => { const now = Date.now(); return now - gHiddenTotal - (gHiddenAt === null ? 0 : now - gHiddenAt); };
function gActiveTimeout(fn, delay) {
  let due = gActiveNow() + Math.max(0, delay), timer = null, expected = 0, closed = false, lateGraceUsed = false;
  const cancel = () => { closed = true; clearTimeout(timer); gPage?.removeEventListener("visibilitychange", visibility); };
  const arm = () => {
    clearTimeout(timer); if (closed || gPage?.hidden) return;
    const left = Math.max(0, due - gActiveNow()); expected = Date.now() + left;
    timer = setTimeout(() => {
      if (closed || gPage?.hidden) return;
      // 이벤트 자체가 멈췄다가 재개된 경우, 먼저 버퍼의 응답을 읽을 여유를 준다.
      if (!lateGraceUsed && Date.now() - expected > 5000) { lateGraceUsed = true; due = gActiveNow() + G_RESUME_GRACE_MS; arm(); return; }
      if (gActiveNow() < due) { arm(); return; }
      cancel(); fn();
    }, left);
  };
  const visibility = () => { clearTimeout(timer); if (!gPage.hidden) { lateGraceUsed = false; due = Math.max(due, gActiveNow() + G_RESUME_GRACE_MS); arm(); } };
  gPage?.addEventListener("visibilitychange", visibility); arm(); return cancel;
}
function gWaitVisible(signal) {
  if (signal?.aborted) return Promise.reject({ code: "cancelled" });
  if (!gPage?.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const clean = () => { gPage.removeEventListener("visibilitychange", visible); signal?.removeEventListener("abort", abort); };
    const visible = () => { if (!gPage.hidden) { clean(); resolve(); } };
    const abort = () => { clean(); reject({ code: "cancelled" }); };
    gPage.addEventListener("visibilitychange", visible); signal?.addEventListener("abort", abort, { once: true });
  });
}

const G_CONT = "직전 응답이 연결 문제로 중간에 끊겼다. 끊긴 바로 그 글자부터 이어서 출력하라. 이미 출력한 부분은 반복하지 않고, 앞말이나 설명, 코드 블록 표시 없이 나머지 JSON 텍스트만 출력해 원래 JSON 객체를 끝까지 완성한다.";
const gRetryable = e => e && (e.code === "upstream_error" || e.code === "network" || e.code === "stalled" || /^api_5/.test(e.code || ""));
const gSleep = (ms, signal) => new Promise((res, rej) => { if (signal?.aborted) return rej({ code: "cancelled" }); const t = setTimeout(res, ms); signal?.addEventListener("abort", () => { clearTimeout(t); rej({ code: "cancelled" }); }, { once: true }); });
/* 끊긴 응답 뒤에 이어 받은 조각을 붙인다. 모델이 끝부분을 조금 반복해 시작하면 겹친 만큼 잘라 낸다 */
function joinCont(a, b) {
  b = b.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  const max = Math.min(200, a.length, b.length);
  for (let n = max; n >= 16; n--) if (a.endsWith(b.slice(0, n))) return a + b.slice(n);
  return a + b;
}
const gemini = {
  async stream(model, body, opts, prefix) {
    const ctl = new AbortController(); let stalled = false, expired = false, timer = null, hardTimer = null, progressed = false, reader = null;
    const kick = () => { timer?.(); timer = gActiveTimeout(() => { stalled = true; ctl.abort(); }, opts.progressWatch && progressed ? G_PROGRESS_IDLE_MS : G_IDLE_MS); };
    const timeoutError = () => ({ code: "stage_timeout", message: "화면이 열린 동안의 최대 대기 시간(10분, 응답 복구 포함)을 넘었습니다. 잠시 뒤 다시 실행해 주세요." });
    const onUser = () => ctl.abort();
    if (opts.signal) { if (opts.signal.aborted) throw { code: "cancelled" }; opts.signal.addEventListener("abort", onUser, { once: true }); }
    let text = "", finish = "", block = "", usage = null;
    try {
      kick();
      if (opts.deadline) hardTimer = gActiveTimeout(() => { expired = true; ctl.abort(); }, Math.max(0, opts.deadline - gActiveNow()));
      let res;
      try { res = await fetch(gBase() + `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "Content-Type": "application/json", ...gAuth() }, body: JSON.stringify(body), signal: ctl.signal }); }
      catch (e) { if (opts.signal?.aborted) throw { code: "cancelled" }; if (expired) throw timeoutError(); if (stalled) throw { code: "stalled", message: "응답 없음" }; throw { code: "network", message: String(e?.message || e) }; }
      if (!res.ok) throw await gError(res, model);
      reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = "", lastTokens = 0;
      const handle = line => {
        if (!line.startsWith("data:")) return;
        const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") return;
        let j; try { j = JSON.parse(raw); } catch { return; }
        if (j.error) throw { code: "upstream_error", message: [j.error.code, j.error.status, j.error.message].filter(Boolean).join(" ") };
        if (j.promptFeedback?.blockReason) block = j.promptFeedback.blockReason;
        if (j.usageMetadata) usage = j.usageMetadata;
        const c = j.candidates?.[0];
        if (opts.progressWatch) {
          const tokens = (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0);
          if (tokens > lastTokens || c?.finishReason || c?.content?.parts?.some(p => (typeof p.text === "string" && p.text.length > 0) || p.functionCall)) { progressed = true; kick(); }
          lastTokens = Math.max(lastTokens, tokens);
        }
        if (!c) return;
        if (c.finishReason) finish = c.finishReason;
        let add = ""; for (const p of c.content?.parts || []) if (typeof p.text === "string" && !p.thought) add += p.text;
        if (add) { text += add; opts.onText?.({ text: prefix ? joinCont(prefix, text) : text }); }
      };
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          if (!opts.progressWatch) kick();   // SSE 주석·빈 이벤트만으로는 진행으로 보지 않는다
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); handle(line); }
        }
        if (buf.trim()) handle(buf.trim());
      } catch (e) {
        if (opts.signal?.aborted) throw { code: "cancelled" };
        if (expired) throw timeoutError();
        if (stalled) throw { code: "stalled", message: "응답 없음" };
        if (e?.code) throw e;
        throw { code: "upstream_error", message: String(e?.message || e) };
      }
      return { text, finish, block, usage };
    } catch (e) { throw { ...e, text }; }
    finally {
      timer?.(); hardTimer?.(); opts.signal?.removeEventListener("abort", onUser);
      if (reader) { try { await reader.cancel(); } catch {} }
    }
  },
  async json(prompt, opts = {}) {
    if (!gReady()) throw { code: "no_sample" };
    if (opts.progressWatch) opts = { ...opts, deadline: gActiveNow() + G_STAGE_MAX_MS };
    const retryLimit = opts.progressWatch ? G_PROGRESS_RETRY : G_RETRY;
    const tier = opts.modelTier === "quick" ? "quick" : opts.modelTier === "check" ? "check" : "main";
    const model = (tier === "check" ? (GS.check || GS.main || GDEF.main) : (GS[tier] || GDEF[tier])).trim();
    let think = (tier === "check" ? GS.checkThink ?? GDEF.checkThink : GS[tier + "Think"]) || "";
    const mk = (contents, json) => { const b = { contents, generationConfig: json ? { responseMimeType: "application/json" } : {} }; if (think) b.generationConfig.thinkingConfig = { thinkingLevel: think }; return b; };
    const user = [{ role: "user", parts: [{ text: prompt }] }];
    let acc = "", usage = null, retries = 0, contTried = 0;
    opts.onMeta?.({ model, think });
    for (;;) {
      await gWaitVisible(opts.signal);
      if (opts.deadline && gActiveNow() >= opts.deadline) throw { code: "stage_timeout", message: "화면이 열린 동안의 최대 대기 시간(10분, 응답 복구 포함)을 넘었습니다. 잠시 뒤 다시 실행해 주세요." };
      const cont = acc.length >= 200;   // 받은 게 어느 정도 있으면 이어 받기, 아니면 처음부터
      const body = cont ? mk([...user, { role: "model", parts: [{ text: acc }] }, { role: "user", parts: [{ text: G_CONT }] }], false) : mk(user, true);
      try {
        let r;
        try { r = await this.stream(model, body, opts, cont ? acc : ""); }
        catch (e) {
          if (e.code === "api_400" && think && /think/i.test(e.message || "")) { think = ""; opts.onMeta?.({ model, think }); continue; }   // 이 모델이 지원하지 않는 생각 깊이면 기본값으로 다시 보낸다
          throw e;
        }
        if (r.usage) usage = sumUsage(usage, r.usage);
        if (r.block || /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(r.finish)) throw { code: "refused", message: r.block || r.finish, text: acc + r.text };
        const text = cont ? joinCont(acc, r.text) : r.text;
        if (!text.trim()) throw { code: r.finish ? "empty_completion" : "upstream_error", text, message: r.finish ? "" : "완료 신호 없이 연결이 끝났습니다." };
        const out = parseJsonLoose(text);
        if (out !== undefined) { opts.onMeta?.({ model, think, usage, retries }); return out; }
        if (!r.finish) throw { code: "upstream_error", text, message: "완료 신호 없이 연결이 끝났습니다. 받은 응답부터 복구합니다." };
        if (r.finish === "MAX_TOKENS" && contTried < 2 && text.length >= 200) { contTried++; acc = text; continue; }   // 출력 한도에서 잘렸으면 이어 받는다
        if (cont && retries < retryLimit) { retries++; acc = ""; opts.onRetry?.({ n: retries, mode: "restart", reason: "이어 붙인 응답이 맞지 않음" }); continue; }
        throw { code: "invalid_json", text, message: r.finish };
      } catch (e) {
        if (e.code === "cancelled") throw { ...e, text: acc || e.text || "" };
        if (!gRetryable(e) || retries >= retryLimit) { opts.onMeta?.({ model, think, usage, retries }); throw { ...e, code: e.code === "stalled" ? "upstream_error" : e.code, text: e.text || acc }; }
        await gWaitVisible(opts.signal);
        retries++;
        const got = cont ? joinCont(acc, e.text || "") : (e.text || "");
        acc = got.length >= 200 ? got : "";
        opts.onRetry?.({ n: retries, mode: acc ? "continue" : "restart", reason: e.message || e.code, chars: acc.length });
        await gSleep(Math.min(8000, 1500 * 2 ** (retries - 1), opts.deadline ? Math.max(0, opts.deadline - gActiveNow()) : Infinity), opts.signal);
      }
    }
  }
};
function sumUsage(a, b) {
  if (!a) return { ...b };
  return { promptTokenCount: (a.promptTokenCount || 0) + (b.promptTokenCount || 0), candidatesTokenCount: (a.candidatesTokenCount || 0) + (b.candidatesTokenCount || 0), thoughtsTokenCount: (a.thoughtsTokenCount || 0) + (b.thoughtsTokenCount || 0) };
}
async function listGeminiModels() {
  const res = await gFetch(`/models?pageSize=200`, { headers: gAuth() });
  if (!res.ok) throw await gError(res, "");
  const j = await res.json();
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/i.test(m.name) && !/image|tts|live|audio|embedding|transcribe|robotics/i.test(m.name))
    .map(m => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || "" }));
}
const LOGK = "wwiki:log";
const LOG = (() => { try { const v = JSON.parse(localStorage.getItem(LOGK) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } })();
const KIND = { discovery: "새 대상 탐색", angles: "각도 목록", section: "문단 다시 쓰기", prose: "단편 쓰기", image: "이미지 생성", choices: "행동 후보", read: "문서 읽기 검사", ageRule: "나이 규칙 해석", bible: "세계관 생성", storyBible: "스토리 세계관 생성", chapterPlan: "장 계획", chapterBlock: "장 섹션", page: "문서 작성", tone: "분위기 판별", check: "설정 검사", analyze: "수정 대조", fix: "충돌 고치기", worldCheck: "세계 전체 점검", relMigrate: "인물 관계 정리" };
function pushLog(r) {
  LOG.push(r); if (LOG.length > 40) LOG.splice(0, LOG.length - 40);
  try { localStorage.setItem(LOGK, JSON.stringify(LOG)); } catch {}
  try { renderSide(); if (S.view.name === "log") renderMain(); } catch {}
}
const PK = "wwiki:lastPrompt";
let LASTP = (() => { try { const v = JSON.parse(localStorage.getItem(PK) || "null"); return v && typeof v.text === "string" ? v : null; } catch { return null; } })();
async function callJson(kind, prompt, opts = {}, meta = {}) {
  if (kind === "page") { LASTP = { at: Date.now(), title: meta.title || "", type: meta.type || "", text: prompt }; try { localStorage.setItem(PK, JSON.stringify(LASTP)); } catch {} }
  const t0 = performance.now(); let first = null, chars = 0;
  const user = opts.onText;
  const rec = { at: Date.now(), kind, tier: opts.modelTier || "default", model: "", effort: "", in: prompt.length, ...meta };
  const o = { progressWatch: ["page", "check", "read", "prose", "section", "discovery"].includes(kind), ...opts, onText: u => { if (first === null) first = performance.now(); chars = u.text.length; if (user) user(u); },
    onRetry: r => { rec.retry = r.n; (rec.retries ||= []).push(r.reason ? String(r.reason).slice(0, 120) : r.mode); opts.onRetry?.(r); },
    onMeta: m => { rec.model = m.model; rec.effort = m.think || ""; if (m.retries) rec.retry = m.retries; if (m.usage) rec.tok = { i: m.usage.promptTokenCount || 0, o: m.usage.candidatesTokenCount || 0, t: m.usage.thoughtsTokenCount || 0 }; } };
  const done = () => { rec.first = first === null ? null : Math.round(first - t0); rec.total = Math.round(performance.now() - t0); rec.out = chars; };
  try { const r = await S.sample.json(prompt, o); done(); rec.ok = true; pushLog(rec); return r; }
  catch (e) { if (!chars && typeof e?.text === "string") chars = e.text.length; done(); rec.ok = false; rec.err = e?.code || String(e?.message || e).slice(0, 80); if (e?.message) rec.msg = String(e.message).slice(0, 200); pushLog(rec); throw e; }
}
const secs = ms => ms == null ? "-" : (ms / 1000).toFixed(1) + "초";
function logLine(r) {
  const t = new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `[${t}] ${KIND[r.kind] || r.kind}${r.title ? ` 「${r.title}」` : ""}${r.ch ? ` · ${r.ch}장` : ""}${"type" in r ? ` (${r.type || "유형 미정"})` : ""} · ${r.model ? `${r.model}/${r.effort || "기본"}` : r.tier}${r.tok ? ` · 토큰 입력 ${r.tok.i.toLocaleString()} / 생각 ${r.tok.t.toLocaleString()} / 출력 ${r.tok.o.toLocaleString()}` : ""} · 입력 ${Number(r.in || 0).toLocaleString()}자 · 첫 글자 ${secs(r.first)} · 총 ${secs(r.total)} · 출력 ${Number(r.out || 0).toLocaleString()}자 · ${r.retry ? ` · 재시도 ${r.retry}회${r.retries ? `(${r.retries.join(" / ")})` : ""}` : ""} · ${r.ok ? "성공" : "실패(" + r.err + (r.msg ? ": " + r.msg : "") + ")"}${r.ents ? ` · 세계관 항목 ${r.ents}개` : ""}`;
}
const logText = () => ["WorldWiki.ai 진단 로그 · " + APP_VERSION, `저장 위치: ${Store.mode} · 기록 ${LOG.length}건`, ...LOG.map(logLine)].join("\n");
function logHtml() {
  return `<div class="sheet"><div class="crumb"><span>진단</span></div><h1 class="t">진단 로그</h1>
    <p class="note">Gemini를 부를 때마다 걸린 시간을 기록합니다. '첫 글자'는 요청부터 글이 나오기 시작할 때까지, '총'은 끝날 때까지 걸린 시간입니다. 최근 40건이 이 브라우저에만 남습니다.</p>
    <div class="tools"><button type="button" class="btn pri" data-act="log-copy" ${LOG.length ? "" : "disabled"}>로그 복사</button><button type="button" class="btn" data-act="log-clear" ${LOG.length ? "" : "disabled"}>지우기</button><button type="button" class="btn" data-act="log-back">돌아가기</button></div>
    ${LOG.length ? `<pre id="logPre" class="logpre">${esc(logText())}</pre>` : `<p class="note" style="margin-top:12px">아직 기록이 없습니다. 문서를 하나 작성하면 여기에 나타납니다.</p>`}
    <h2 class="nf-h">다른 모델과 비교</h2>
    ${LASTP ? `<p class="note">마지막으로 Gemini에게 보낸 문서 작성 프롬프트입니다. 「${esc(LASTP.title)}」${LASTP.type ? ` (${esc(LASTP.type)})` : ""} · ${Number(LASTP.text.length).toLocaleString()}자. 그대로 복사해 다른 모델에 넣으면 같은 조건으로 비교할 수 있습니다. 답은 JSON으로 나옵니다.</p>
    <div class="tools"><button type="button" class="btn pri" data-act="prompt-copy">프롬프트 복사</button></div>
    <details class="memo"><summary>프롬프트 펼쳐 보기</summary><pre id="promptPre" class="logpre" style="margin:0;border:0">${esc(LASTP.text)}</pre></details>`
    : `<p class="note">문서를 하나 작성하거나 다시 쓰면, 그때 보낸 프롬프트를 여기서 복사할 수 있습니다.</p>`}</div>`;
}
const errMsg = e => ERR[e?.code] || (e?.message ? "문제가 생겼습니다: " + e.message : ERR.upstream_error);
