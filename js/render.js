"use strict";
/* 화면 그리기: 본문 서식과 각 화면 */
/* ---------- rendering: text ---------- */
function linkHtml(target, label) {
  const w = S.world; const t = canonTitle(w, target); const k = keyOf(t);
  if (!label && t !== norm(target) && !TYPE_SUFFIX.test(norm(target))) label = norm(target);
  const e = w && w.entities[k]; const has = !!S.pages[k];
  const tip = has ? (e?.summary || t) : "아직 작성되지 않은 문서입니다. 누르면 바로 작성하고, 두 번 누르거나(PC) 길게 누르면(모바일) 방향을 정해 작성합니다.";
  return `<a class="wl${has ? "" : " new"}" href="#" data-k="${k}" data-t="${esc(t)}" title="${esc(tip)}">${esc(label || t)}</a>`;
}
function inline(raw) {   // 링크를 자리표로 바꿔 두고 서식을 입히므로, 굵게·취소선 안의 링크도 제대로 보인다
  const links = [];
  const out = fmt(raw.replace(LINK_RE, (m, a, b) => "\u0003" + (links.push(linkHtml(a, b)) - 1) + "\u0004")).replace(/\u0003(\d+)\u0004/g, (m, n) => links[n]);
  return out.replace(/\u0001(\d+)\u0002/g, (m, n) => `<sup class="fn"><a href="#fn-${n}" id="fnr-${n}" data-fn="${n}">[${n}]</a></sup>`);
}
const fmt = s => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/~~([^~]+)~~/g, "<del>$1</del>");
function extractFootnotes(src, fns) {
  let text = "", i = 0;
  while (i < src.length) {
    if (src[i] === "[" && src[i + 1] === "*") { let d = 1, j = i + 2; while (j < src.length && d > 0) { if (src[j] === "[") d++; else if (src[j] === "]") d--; j++; } if (d === 0) { fns.push(src.slice(i + 2, j - 1).trim()); text += "\u0001" + fns.length + "\u0002"; i = j; continue; } }
    text += src[i]; i++;
  }
  return text;
}
function blocks(body, fns) {
  const text = extractFootnotes(String(body).replace(/<br\s*\/?>/gi, "\n"), fns);   // 모델이 줄바꿈으로 쓴 <br>은 실제 줄바꿈으로 보여 준다(저장값은 그대로 둬 편집 칸의 한 줄 형식을 지킨다)
  let html = "";
  for (const blk of text.split(/\n{2,}/)) {
    const lines = blk.split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
    let para = [], list = [], quote = [];
    const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
    const flushQ = () => {
      if (!quote.length) return;
      let by = "";
      if (quote.length > 1 && /^[—―–-]{1,2}\s*/.test(quote[quote.length - 1])) by = quote.pop().replace(/^[—―–-]{1,2}\s*/, "");
      html += `<blockquote><div>${quote.map(inline).join("<br>")}</div>${by ? `<cite>${inline(by)}</cite>` : ""}</blockquote>`; quote = [];
    };
    const flushL = () => {
      if (!list.length) return;
      html += `<ul>${list.map(it => `<li>${inline(it.t)}${it.kids.length ? `<ul>${it.kids.map(k => `<li>${inline(k)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
      list = [];
    };
    for (const l of lines) {
      const lm = l.match(/^(\s*)(?:[-*•]|--)\s+(.*)$/);
      if (lm) {
        flushP(); flushQ();
        const sub = lm[1].replace(/\t/g, "  ").length >= 2 || /^\s*--\s/.test(l);
        if (sub && list.length) list[list.length - 1].kids.push(lm[2]); else list.push({ t: lm[2], kids: [] });
      }
      else if (/^\s*>\s?/.test(l)) { flushP(); flushL(); quote.push(l.replace(/^\s*>\s?/, "")); }
      else if (/^#{2,4}\s+/.test(l)) { flushP(); flushL(); flushQ(); html += `<h3>${inline(l.replace(/^#+\s+/, ""))}</h3>`; }
      else { flushL(); flushQ(); para.push(l.trim()); }
    }
    flushP(); flushL(); flushQ();
  }
  return html;
}

/* ---------- rendering: views ---------- */
function renderAll() { renderTop(); renderSide(); renderMain(); }
function renderTop() {
  const w = S.world;
  const bw = $("#brandWorld"); bw.textContent = w ? `${w.title} · 작중 ${w.era}` : ""; bw.hidden = !w;   // 세계관을 열었을 때만 이름을 보인다
  updateDiscoveryButton();
  const q = $("#q"); q.disabled = !w; q.placeholder = w ? `「${w.title}」에서 검색하거나 새 항목 만들기` : "세계관을 열면 검색할 수 있습니다";
}
function renderSide() {
  updateDiscoveryButton();
  const side = $("#side"), w = S.world;
  if (!w || S.view.name === "home") {
    side.innerHTML = `<section><h4>WorldWiki.ai</h4><ul><li><button type="button" class="cur" data-act="home">세계관 목록</button></li></ul></section>
      <section class="stat"><h4>저장 위치</h4><span>${esc(storeLabel())}</span></section><section><h4>도구</h4><ul><li><button type="button" data-act="gset" class="${S.view.name === "gset" ? "cur" : ""}">AI 연결 설정${gReady() ? "" : " ⚠"}</button></li><li><button type="button" data-act="log" class="${S.view.name === "log" ? "cur" : ""}">로그 보기 (${LOG.length})</button></li></ul></section>`;
    return;
  }
  const ents = Object.values(w.entities); const done = ents.filter(e => e.page).length;
  const cur = S.view.name === "article" ? S.view.key : null;
  const rec = S.recent.filter(k => w.entities[k] && k !== w.mainKey).slice(0, 6);
  side.innerHTML = `${isStory(w) ? storySideHtml(w) : ""}
    <section><h4>둘러보기</h4><ul>
      <li><button type="button" data-k="${w.mainKey}" class="${cur === w.mainKey ? "cur" : ""}">${isStory(w) ? "주인공" : "대문"}: ${esc(w.entities[w.mainKey]?.title || w.title)}</button></li>
      <li><button type="button" data-act="canon" class="${S.view.name === "canon" ? "cur" : ""}">설정 노트</button></li>
      <li><button type="button" data-act="home">다른 세계관</button></li>
    </ul></section>
    <section class="stat"><h4>문서 현황</h4><span>작성된 문서 <em>${done}</em></span><span>미작성 항목 <em>${ents.length - done}</em></span><span>연표 사건 <em>${w.timeline.length}</em></span></section>
    ${S.gen ? `<section><h4>작성 중</h4><div class="genpill"><span class="dot"></span><button type="button" class="btn" data-k="${S.gen.key}" style="padding:2px 8px">${esc(S.gen.title)}</button></div></section>` : ""}
    <section><h4>도구</h4><ul><li><button type="button" data-act="gset" class="${S.view.name === "gset" ? "cur" : ""}">AI 연결 설정${gReady() ? "" : " ⚠"}</button></li><li><button type="button" data-act="log" class="${S.view.name === "log" ? "cur" : ""}">로그 보기 (${LOG.length})</button></li></ul></section>
    ${S.syncing ? `<section><h4>장 반영 중</h4><div class="genpill"><span class="dot"></span><button type="button" class="btn" data-k="${S.syncing}" style="padding:2px 8px">${esc(w.entities[S.syncing]?.title || "")}</button></div></section>` : ""}
    ${rec.length ? `<section class="rec"><h4>최근 본 문서</h4><ul>${rec.map(k => `<li><button type="button" data-k="${k}" class="${k === cur ? "cur" : ""}" ${isStory(w) && missingChs(w, k).length ? `title="이번 장의 변화가 아직 반영되지 않았습니다. 열면 반영합니다"` : ""}>${esc(w.entities[k].title)}${isStory(w) && missingChs(w, k).length ? " •" : ""}</button></li>`).join("")}</ul></section>` : ""}`;
}
const storeLabel = () => Sync.acct ? `서버에 저장 (${Sync.acct.id}${Sync.pending() ? ` · 올릴 변경 ${Sync.pending()}건` : ""}) + 이 브라우저` : ({ idb: "이 브라우저 IndexedDB (다른 기기와 공유되지 않음)", local: "이 브라우저 localStorage (용량 약 5MB)", memory: "임시 (새로고침하면 사라짐)" }[Store.mode]);

function gsetHtml() {
  const opt = v => THINKS.map(([x, l]) => `<option value="${x}" ${v === x ? "selected" : ""}>${esc(l)}</option>`).join("");
  const dl = `<datalist id="gmodels">${(S.gmodels || []).map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("")}</datalist>`;
  return `<div class="sheet gset"><div class="crumb"><span>도구</span></div><h1 class="t">AI 연결 설정</h1>
    <p class="note">연결 설정은 이 브라우저의 localStorage에 평문으로 저장됩니다. 공용 컴퓨터에서는 쓰지 마세요.</p>
    <h2 class="nf-h">Gemini 연결 방식</h2>
    <select id="gMode" class="txt"><option value="key" ${gRelay() ? "" : "selected"}>내 API 키로 바로 연결</option><option value="relay" ${gRelay() ? "selected" : ""}>중계 서버로 연결 (초대받은 경우)</option></select>
    <div id="gKeyBox" ${gRelay() ? "hidden" : ""}>
      <label class="lb" for="gKey">Gemini API 키 <span class="note" style="font-weight:400">Google AI Studio에서 발급 · 요청은 브라우저에서 Google로 바로 갑니다</span></label>
      <div class="keyrow"><input id="gKey" class="txt" type="password" autocomplete="off" spellcheck="false" value="${esc(GS.key)}" placeholder="AIza…"><button type="button" class="btn" data-act="gkey-show" data-for="gKey">보기</button></div>
    </div>
    <div id="gRelayBox" ${gRelay() ? "" : "hidden"}>
      <label class="lb" for="gPass">접속 암호 <span class="note" style="font-weight:400">API 키는 중계 서버에 있으니 받은 접속 암호만 넣으면 됩니다</span></label>
      <div class="keyrow"><input id="gPass" class="txt" type="password" autocomplete="off" spellcheck="false" value="${esc(GS.pass)}"><button type="button" class="btn" data-act="gkey-show" data-for="gPass">보기</button></div>
      <details class="memo" style="margin-top:10px" ${GS.relay !== DEFAULT_RELAY ? "open" : ""}><summary>중계 서버 주소 바꾸기</summary>
        <input id="gRelay" class="txt" type="url" autocomplete="off" spellcheck="false" value="${esc(GS.relay)}" placeholder="${esc(DEFAULT_RELAY)}" aria-label="중계 서버 주소">
        <p class="note" style="margin:6px 0 0">비워 두면 기본 서버를 씁니다.</p></details>
      <div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="relay-invite">사이트 링크 복사</button><span class="note">친구에게 링크를 보내고, 접속 암호는 따로 알려 주세요.</span></div>
    </div>
    <h2 class="nf-h">Gemini 문서 모델</h2>
    <div class="two"><div><label class="lb" for="gMain">기본 모델 <span class="note" style="font-weight:400">세계관 생성, 문서 작성, 랜덤 서핑, 충돌 고치기</span></label><input id="gMain" class="txt" list="gmodels" spellcheck="false" value="${esc(GS.main)}"></div>
      <div><label class="lb" for="gMainT">생각 깊이</label><select id="gMainT">${opt(GS.mainThink)}</select></div></div>
    <div class="two"><div><label class="lb" for="gQuick">빠른 모델 <span class="note" style="font-weight:400">분위기 판별</span></label><input id="gQuick" class="txt" list="gmodels" spellcheck="false" value="${esc(GS.quick)}"></div>
      <div><label class="lb" for="gQuickT">생각 깊이</label><select id="gQuickT">${opt(GS.quickThink)}</select></div></div>
    <div class="two"><div><label class="lb" for="gCheck">검사 모델 <span class="note" style="font-weight:400">설정 검사, 수정 대조 · 비워 두면 기본 모델</span></label><input id="gCheck" class="txt" list="gmodels" spellcheck="false" value="${esc(GS.check || "")}" placeholder="${esc(GS.main || GDEF.main)} (기본 모델)"></div>
      <div><label class="lb" for="gCheckT">생각 깊이</label><select id="gCheckT">${opt(GS.checkThink ?? GDEF.checkThink)}</select></div></div>
    <h2 class="nf-h">이미지 생성</h2>
    <label class="lb" for="gImage">기본 이미지 모델</label><input id="gImage" class="txt" list="gImageModels" value="${esc(GS.imageModel || GDEF.imageModel)}"><datalist id="gImageModels">${IMAGE_MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join("")}</datalist>
    <label class="lb" for="gOpenAI">OpenAI API 키 (이미지 생성용)</label>
    <div class="keyrow"><input id="gOpenAI" class="txt" type="password" autocomplete="off" spellcheck="false" value="${esc(GS.openaiKey || "")}" placeholder="sk-…"><button type="button" class="btn" data-act="gkey-show" data-for="gOpenAI">보기</button></div>
    <p class="note">선택 사항입니다. OpenAI 모델을 고르면 브라우저에서 OpenAI로 직접 요청합니다. Gemini 중계 서버는 사용하지 않습니다. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">API 키 발급</a> · ChatGPT 구독과 별도 과금되며, 계정에 따라 조직 인증이 필요할 수 있습니다. 키는 이 브라우저에만 저장되고 세계관 백업·동기화에는 포함되지 않습니다.</p>
    <label class="lb" for="gPre" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="gPre" ${GS.preCheck !== false ? "checked" : ""}>문서 작성 직후 한 번 자동 검사하고, 어긋난 곳은 고쳐서 보여 주기 <span class="note">끄면 자동 검사하지 않습니다. 이후 검사는 문서의 설정 검사 버튼으로 실행합니다</span></label>
    <p class="note" style="margin-top:6px">자동 검사는 새 문서를 작성하거나 다시 쓸 때 한 번만 돕니다. 이후에는 설정 검사 버튼을 눌렀을 때만 검사합니다. 검사 모델을 높이거나 생각 깊이를 올리면 헛짚는 지적이 줄지만, 검사가 느려지고 사용량이 늘어납니다.</p>
    ${dl}
    <p class="note" style="margin-top:8px">모델이 지원하지 않는 생각 깊이를 고르면 그 요청은 모델 기본값으로 다시 보냅니다. 응답은 JSON 모드로 받습니다.</p>
    <div class="row"><button type="button" class="btn pri" data-act="gset-save">저장</button><button type="button" class="btn" data-act="gset-test">Gemini 연결 시험</button><button type="button" class="btn" data-act="gset-models">Gemini 모델 목록 불러오기</button></div>
    <p class="res" id="gRes">${esc(S.gres || "")}</p>
    <h2 class="nf-h">계정 (서버에 세계관 저장)</h2>
    ${acctHtml()}
    <h2 class="nf-h">백업</h2>
    <p class="note">세계관과 문서를 JSON 파일 하나로 내보내거나, 그 파일에서 가져옵니다. 같은 id의 세계관은 가져온 내용으로 덮어씁니다. 저장 위치: ${esc(storeLabel())}</p>
    <div class="row"><button type="button" class="btn" data-act="export" ${S.worlds.length ? "" : "disabled"}>내보내기</button><button type="button" class="btn" data-act="import">가져오기</button><input type="file" id="importFile" accept="application/json,.json" hidden></div>
  </div>`;
}
function acctHtml() {
  const a = Sync.acct, n = Sync.pending();
  return `<div id="acctBox">${a ? `<p style="margin:0"><b>${esc(a.id)}</b>(으)로 로그인되어 있습니다. 세계관이 서버에 저장되어 다른 기기에서도 같은 아이디로 로그인하면 보입니다.</p>
    <p class="note" style="margin:6px 0 0">${Sync.busy || Sync.pulling ? "동기화하는 중…" : n ? `올릴 변경 ${n}건 대기 중` : "모두 서버에 올라가 있습니다"}${Sync.lastAt ? ` · 마지막 동기화 ${new Date(Sync.lastAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : ""}${Sync.err ? ` · <span style="color:var(--red)">${esc(Sync.err)}</span>` : ""}</p>
    <div class="row"><button type="button" class="btn" data-act="acct-sync">지금 동기화</button><button type="button" class="btn" data-act="acct-logout">로그아웃</button></div>
    <p class="note">로그아웃해도 이 브라우저에 저장된 세계관은 남습니다.</p>`
  : `<p class="note" style="margin:0">로그인하면 세계관이 서버에 저장되어 다른 기기에서도 이어서 볼 수 있습니다. 로그인하지 않으면 지금처럼 이 브라우저에만 저장됩니다.</p>
    <div class="two"><div><label class="lb" for="acId">아이디</label><input id="acId" class="txt" autocomplete="username" maxlength="24" spellcheck="false"></div>
      <div><label class="lb" for="acPw">비밀번호</label><input id="acPw" class="txt" type="password" autocomplete="current-password" maxlength="100"></div></div>
    <details class="memo" style="margin-top:10px"><summary>처음이면 가입하기</summary><div style="padding:0 12px 12px">
      <label class="lb" for="acInv">초대 코드 <span class="note" style="font-weight:400">중계 서버 접속 암호와 같습니다</span></label><input id="acInv" class="txt" type="password" autocomplete="off" value="${esc(GS.pass || "")}">
      <div class="row"><button type="button" class="btn" data-act="acct-signup">가입하고 로그인</button></div>
      <p class="note">비밀번호를 잊으면 스스로 찾을 수 없습니다. 서버 관리자에게 초기화를 부탁해야 합니다. 서버 관리자는 저장된 세계관 내용을 볼 수 있습니다(비밀번호는 볼 수 없습니다).</p></div></details>
    <div class="row"><button type="button" class="btn pri" data-act="acct-login">로그인</button></div>
    ${Sync.err ? `<p class="res" style="color:var(--red)">${esc(Sync.err)}</p>` : ""}`}</div>`;
}
async function acctAction(kind) {
  const id = norm($("#acId")?.value || ""), pw = $("#acPw")?.value || "", inv = $("#acInv")?.value || "";
  if (kind !== "logout" && kind !== "sync" && (!id || !pw)) { Sync.err = "아이디와 비밀번호를 넣어 주세요."; Sync.render(); return; }
  Sync.err = ""; const box = $("#acctBox"); if (box) box.querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    if (kind === "logout") { await Sync.logout(); toast("로그아웃했습니다. 이 브라우저의 세계관은 그대로 있습니다."); }
    else if (kind === "sync") { await Sync.pull(); await Sync.push(); toast(Sync.err ? "동기화하지 못했습니다. " + Sync.err : "동기화했습니다."); }
    else { await Sync.login(id, pw, kind === "signup", inv); toast(`${Sync.acct.id}(으)로 로그인했습니다. 세계관을 서버와 맞췄습니다.`); S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  } catch (e) { Sync.err = e.message || "실패했습니다."; }
  Sync.render(); renderSide();
}
function readGsetForm() {
  const v = id => ($("#" + id)?.value ?? "").trim();
  GS = { ...GS, mode: v("gMode") === "relay" ? "relay" : "key", key: v("gKey"), relay: normRelay(v("gRelay")) || DEFAULT_RELAY, pass: v("gPass"), main: v("gMain") || GDEF.main, mainThink: v("gMainT"), quick: v("gQuick") || GDEF.quick, quickThink: v("gQuickT"), check: v("gCheck"), checkThink: v("gCheckT"), preCheck: !!$("#gPre")?.checked, imageModel: v("gImage") || GDEF.imageModel, openaiKey: v("gOpenAI") };
  saveGS(); S.sample = gReady() ? gemini : null;
}
function setGres(t) { S.gres = t; const el = $("#gRes"); if (el) el.textContent = t; }

/* 주사위 칸은 내용 길이에 맞춰 높이를 늘린다 (field-sizing을 지원하지 않는 브라우저용) */
function fitDie(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; }
function renderMain(force) {
  Nav.sync();
  updateDiscoveryButton();
  const m = $("#main");
  if (S.ready && S.view.name === "article" && S.edit && S.edit.key === S.view.key && S.pages[S.view.key]) {
    if (!force && m.dataset.ed === S.edit.key) return;   // 편집 중에는 다른 갱신으로 입력란을 다시 그리지 않는다
    m.innerHTML = editHtml(S.view.key); m.dataset.ed = S.edit.key; return;
  }
  m.dataset.ed = "";
  if (!S.ready || S.view.name === "loading") { m.innerHTML = `<div class="sheet"><p class="note">불러오는 중…</p><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`; return; }
  if (S.view.name === "home") m.innerHTML = homeHtml();
  else if (S.view.name === "canon") m.innerHTML = canonHtml();
  else if (S.view.name === "notfound") m.innerHTML = notFoundHtml(S.view.title);
  else if (S.view.name === "category") m.innerHTML = categoryHtml(S.view.cat);
  else if (S.view.name === "log") m.innerHTML = logHtml();
  else if (S.view.name === "discovery") m.innerHTML = discoveryHtml();
  else if (S.view.name === "gset") m.innerHTML = gsetHtml();
  else if (S.view.name === "fix") m.innerHTML = fixvHtml(S.view.key);
  else if (S.view.name === "compose") m.innerHTML = composeHtml(S.view.key);
  else if (S.view.name === "advance") m.innerHTML = advanceHtml();
  else if (S.view.name === "epilogue") m.innerHTML = epilogueHtml();
  else { refreshOnOpen(S.view.key); m.innerHTML = articleHtml(S.view.key); }
  document.querySelectorAll("textarea.die-v").forEach(fitDie);
  if (S.view.name === "canon" && S.focusEnt) { const d = document.getElementById("ent-" + S.focusEnt); if (d) { d.open = true; d.scrollIntoView({ block: "center" }); } S.focusEnt = null; }
}

function homeHtml() {
  const tab = (id, label) => `<button type="button" role="tab" class="stab" data-stab="${id}" aria-selected="${S.seedTab === id}">${esc(label)}</button>`;
  const ex = `<div class="stabs-row">${tab("own", "직접 작성") + tab("dice", "원안 주사위") + tab("whatif", "만약에")}</div><div class="stabs-row"><span class="stab-sep" aria-hidden="true">예시</span>${EXAMPLES.map((x, i) => tab(String(i), x.label)).join("")}</div>`;
  const list = S.worlds.length ? S.worlds.map(w => {
    const ents = Object.values(w.entities || {}); const done = ents.filter(e => e.page).length;
    return `<article class="wcard"><button type="button" class="open" data-world="${w.id}">${esc(w.title)}</button>
      ${w.tagline ? `<p>${esc(w.tagline)}</p>` : ""}
      <div class="wm"><span>${isStory(w) ? (w.story.status === "ended" ? "스토리 완결 · " : `스토리 ${w.story.chapter}/${totalOf(w)}장 · `) : ""}${w.tone ? esc(w.tone.label) + " · " : ""}작중 ${esc(w.era)} · 문서 ${done} · 미작성 ${ents.length - done}</span>
      ${S.confirmDel === w.id ? `<span class="confirm">문서까지 모두 지울까요?<button type="button" class="btn dng" data-del-yes="${w.id}">삭제</button><button type="button" class="btn" data-act="del-no">취소</button></span>` : `<button type="button" class="btn" data-del="${w.id}" style="padding:2px 10px">삭제</button>`}</div></article>`;
  }).join("") : `<div class="empty">아직 만든 세계관이 없습니다. 왼쪽에 원안을 적고 <b>세계관 만들기</b>를 누르면 설정 노트와 첫 문서가 만들어집니다.</div>`;
  return `<div class="home">
    <section class="sheet">
      <h2>${S.regen ? "세계관 다시 만들기" : "새 세계관 만들기"}</h2>
      ${S.regen ? `<div class="banner warn">「${esc(S.regen.title)}」을(를) 처음부터 다시 만듭니다. 아래는 처음에 넣은 입력값이며, 고쳐도 됩니다. 연표, 핵심 규칙, 분위기${S.mode === "story" ? ", 이야기 뼈대와 1장" : ""}이 새로 만들어집니다.
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px;color:var(--ink)"><input type="checkbox" id="regenKeep" ${S.regen.keep ? "checked" : ""} ${S.creating ? "disabled" : ""}>기존 세계관도 남겨 두기 <span class="note">체크하지 않으면 기존 문서는 모두 지워집니다. 새로 만들기에 실패하면 아무것도 지우지 않습니다</span></label>
        <div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="regen-cancel" ${S.creating ? "disabled" : ""}>다시 만들기 취소</button></div></div>` : ""}
      <p class="sub">원안 몇 문장으로 위키를 엽니다. 본문의 빨간 링크를 누를 때마다 그 항목의 문서가 새로 작성되고, 앞서 확정된 설정은 설정 노트에 쌓여 다음 문서의 제약이 됩니다.</p>
      <label class="lb">방식</label>
      <div class="stabs-row" role="group" aria-label="세계관 방식"><button type="button" class="chip" data-mode="basic" aria-pressed="${S.mode !== "story"}" ${S.creating ? "disabled" : ""}>기본 모드</button><button type="button" class="chip" data-mode="story" aria-pressed="${S.mode === "story"}" ${S.creating ? "disabled" : ""}>스토리 모드</button></div>
      <p class="note" style="margin:6px 0 0">${S.mode === "story" ? `주인공 한 명의 이야기가 장 단위로 위키 위에서 진행됩니다. 장마다 둘러보고 만들고 고친 문서가 다음 장 줄거리에 엮입니다. 이야기 길이는 아래에서 ${STORY_MIN}~${STORY_MAX}장 중에 고릅니다.` : "링크를 따라 자유롭게 문서를 늘려 가는 위키입니다."}</p>
      ${S.mode === "story" ? `<label class="lb">장 수 <span class="note" style="font-weight:400">이야기의 길이. 시작한 뒤에는 바꿀 수 없습니다. 장이 많을수록 생성 횟수와 시간이 늘어납니다</span></label>
      <div class="stabs-row" role="group" aria-label="장 수">${Array.from({ length: STORY_MAX - STORY_MIN + 1 }, (_, i) => STORY_MIN + i).map(n => `<button type="button" class="chip" data-chn="${n}" aria-pressed="${S.storyN === n}" ${S.creating ? "disabled" : ""}>${n}장</button>`).join("")}</div>` : ""}
      <label class="lb" for="seedTa">원안</label>
      <div class="stabs" role="tablist" aria-label="원안 고르기">${ex}</div>
      ${S.seedTab === "dice" && S.dice ? `<div class="dice" aria-label="원안 주사위">
        ${diceKeys().map(k => `<div class="die"><span class="die-l">${DICE_LABEL[k]}</span><textarea class="die-v" rows="1" data-die="${k}" maxlength="80" aria-label="${DICE_LABEL[k]} (직접 고쳐 쓸 수 있습니다)" title="눌러서 직접 고쳐 쓸 수 있습니다" ${S.creating ? "disabled" : ""}>${esc(S.dice[k])}</textarea><button type="button" class="die-lock" data-lock="${k}" aria-pressed="${!!S.dice.locks[k]}" title="이 칸은 다시 굴려도 그대로 둡니다">${S.dice.locks[k] ? "고정됨" : "고정"}</button></div>`).join("")}
        <div class="row" style="margin-top:2px"><button type="button" class="btn" data-act="roll" ${S.creating ? "disabled" : ""}>다시 굴리기</button><span class="note">고정한 칸은 그대로 두고 나머지만 바꿉니다. 칸을 눌러 직접 고쳐 쓸 수 있고, 고쳐 쓴 칸은 고정됩니다. 아래 원안을 고쳐 써도 됩니다.</span></div></div>` : ""}
      ${S.seedTab === "whatif" && S.whatIfs ? `<div class="whatif">
        <p class="note" style="margin:0 0 8px">질문을 고르면 그 질문으로 바로 세계관을 만듭니다. 아래 첫 문서와 작가 지침 칸도 함께 반영됩니다.</p>
        <div class="wi-grid">${S.whatIfs.map(q => `<button type="button" class="wi" data-whatif="${esc(q)}" ${S.creating || !S.sample ? "disabled" : ""}><span>만약</span>${esc(q)}</button>`).join("")}</div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="whatif-more" ${S.creating ? "disabled" : ""}>다른 질문 보기</button></div></div>` : ""}
      <textarea id="seedTa" rows="7" ${S.creating ? "disabled" : ""} ${S.seedTab === "whatif" ? "hidden" : ""} placeholder="어떤 세계인지 몇 문장으로 적어 주세요. 무엇이 현실과 다른지, 언제 어디가 무대인지, 누가 무엇을 두고 다투는지가 있으면 좋습니다.&#10;&#10;예: 우주력 1388년, 위화도에서 회군한 기동갑주가 왕조를 갈아치웠고, 그 왕조가 500년을 버텨 온 콜로니 국가.">${esc(S.seed)}</textarea>
      ${/^\d+$/.test(S.seedTab) ? `<p class="note" style="margin:6px 0 0">예시 원안입니다. 고쳐 쓰면 직접 작성 탭으로 옮겨집니다.</p>` : ""}
      ${S.mode === "story" ? `<label class="lb" for="firstIn">주인공 <span class="note" style="font-weight:400">선택 · 비워 두면 원안에 맞는 인물로 자동 선택</span></label>
      <input id="firstIn" class="txt" type="text" maxlength="60" value="${esc(S.first)}" placeholder="예: 이순신, 한서린" ${S.creating ? "disabled" : ""}>
      <label class="lb" for="protoDesc">주인공 특징 <span class="note" style="font-weight:400">선택 · 성격, 능력, 처지, 바라는 것 등. 반드시 지킬 설정이 됩니다</span></label>
      <textarea id="protoDesc" rows="2" maxlength="500" placeholder="예: 몰락한 무관 가문의 막내. 활은 잘 쏘지만 겁이 많다. 아버지의 누명을 벗기고 싶어 한다." ${S.creating ? "disabled" : ""}>${esc(S.protoDesc)}</textarea>
      <label class="lb">등장인물 <span class="note" style="font-weight:400">선택 · 꼭 나왔으면 하는 인물. 최대 8명</span></label>
      ${S.cast.length ? `<div class="cast">${S.cast.map((c, i) => `<div class="cast-row">
        <input class="txt" data-cast="${i}" data-cf="name" maxlength="40" value="${esc(c.name)}" placeholder="이름" aria-label="등장인물 ${i + 1} 이름" ${S.creating ? "disabled" : ""}>
        <input class="txt cast-rel" data-cast="${i}" data-cf="rel" maxlength="120" value="${esc(c.rel)}" placeholder="주인공과의 관계 (예: 소꿉친구이자 맞수)" aria-label="등장인물 ${i + 1} 주인공과의 관계" ${S.creating ? "disabled" : ""}>
        <button type="button" class="btn" data-cast-del="${i}" aria-label="등장인물 ${i + 1} 빼기" ${S.creating ? "disabled" : ""}>빼기</button>
        <textarea rows="2" data-cast="${i}" data-cf="desc" maxlength="300" placeholder="특징 (예: 북관 출신 궁수. 말수가 적고 셈이 빠르다)" aria-label="등장인물 ${i + 1} 특징" ${S.creating ? "disabled" : ""}>${esc(c.desc)}</textarea></div>`).join("")}</div>` : ""}
      <button type="button" class="btn" data-act="cast-add" ${S.creating || S.cast.length >= 8 ? "disabled" : ""}>+ 등장인물 추가</button>` : `<label class="lb" for="firstIn">첫 문서 <span class="note" style="font-weight:400">비워 두면 세계관을 대표하는 항목으로 자동 선택</span></label>
      <input id="firstIn" class="txt" type="text" maxlength="60" value="${esc(S.first)}" placeholder="예: 위화도 회군, 태조 전용기, 한양 궤도 거주구" ${S.creating ? "disabled" : ""}>`}
      <label class="lb" for="guideIn">작가 지침 <span class="note" style="font-weight:400">선택 · 세계관 전체에 걸쳐 지킬 방향. 모든 문서에 함께 전달됩니다</span></label>
      <textarea id="guideIn" rows="3" maxlength="1000" placeholder="예: 일본 거대 로봇 메카닉 SF풍으로. 네임드 파일럿에게는 전용기를 준다. 양산기 바리에이션을 풍부하게. 잔혹한 묘사는 피한다." ${S.creating ? "disabled" : ""}>${esc(S.guideIn)}</textarea>
      <div class="row" ${S.seedTab === "whatif" && !S.creating && !S.createErr ? "hidden" : ""}>
        <button type="button" class="btn pri" data-act="create" ${S.creating || !S.sampleReady ? "disabled" : ""}>${S.creating ? "설정 노트를 만드는 중…" : S.regen ? (S.regen.keep ? "새 세계관으로 다시 만들기" : "지우고 다시 만들기") : S.mode === "story" ? "이야기 시작하기" : "세계관 만들기"}</button>
        ${S.creating ? `<span class="genpill"><span class="dot"></span>${S.mode === "story" ? "핵심 규칙, 연표, 주인공과 1장을 정리하고 있습니다" : "핵심 규칙과 연표를 정리하고 있습니다"}</span>` : ""}
        ${!S.sampleReady ? `<span class="note">생성 기능을 준비하는 중…</span>` : (!S.sample ? `<span class="note">${esc(ERR.no_sample)}</span>` : "")}
      </div>
      ${S.createErr ? `<div class="banner warn">${esc(S.createErr)}</div>` : ""}
      <ol class="how">
        <li><span>1</span>원안에서 핵심 규칙, 연표, 작중 기준 시점을 뽑아 설정 노트를 만듭니다.</li>
        <li><span>2</span>문서를 쓸 때 링크한 항목마다 한 줄 정의와 언급 문장을 미리 기록합니다.</li>
        <li><span>3</span>그 항목을 열면 기록된 내용을 반드시 지키도록 문서를 작성합니다.</li>
      </ol>
    </section>
    <section><h2 style="font-family:var(--f-display);font-size:18px;margin:4px 0 12px">내 세계관</h2><div class="wlist">${list}</div></section>
  </div>`;
}

function articleHtml(k) {
  const w = S.world, e = w.entities[k], p = shownPage(k), held = isHeld(k);
  if (!e) return `<div class="sheet"><p>문서를 찾을 수 없습니다.</p></div>`;
  const crumb = `<div class="crumb"><span>${esc(w.title)}</span><span>작중 기준 ${esc(w.era)}</span>${e.type ? `<span>분류: ${(p || S.pages[k]) ? `<button type="button" class="cat" data-cat="${esc(e.type)}" title="「${esc(e.type)}」 문서 모두 보기">${esc(e.type)}</button>` : esc(e.type)}</span>` : ""}${p ? `<span>작성 ${fmtDate(p.createdAt)}</span>` : ""}${p?.editedAt ? `<span>직접 수정 ${fmtDate(p.editedAt)}</span>` : ""}</div>`;
  if (S.gen && S.gen.key === k) {
    return `<div class="sheet">${crumb}<h1 class="t">${esc(e.title)}</h1>
      <div class="gen-live"><span class="dot"></span><span id="genCount">${S.gen.phase === "check" ? "설정과 맞춰 보는 중" : S.gen.phase === "fix" ? `설정과 어긋난 ${S.gen.nFix}곳을 고치는 중` : "문서를 작성하는 중"}</span><button type="button" class="btn" data-act="stop">${S.gen.phase ? "검사 건너뛰고 보기" : "작성 중단"}</button></div>
      ${promiseHtml(w, e, "이 문서가 지켜야 할 확정 내용")}
      <ul class="heads" id="genHeads"></ul>
      <div style="margin-top:14px"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></div>`;
  }
  if (!p) {
    const er = S.genErr && S.genErr.key === k ? S.genErr : null;
    return `<div class="sheet">${crumb}<h1 class="t">${esc(e.title)}</h1>
      ${er ? `<div class="banner warn">${esc(er.msg)}</div>` : `<p class="note">아직 작성되지 않은 문서입니다.</p>`}
      ${promiseHtml(w, e, "이미 확정된 내용")}
      <div class="tools"><button type="button" class="btn pri" data-gen="${k}" ${S.gen || !S.sample ? "disabled" : ""}>이 문서 작성하기</button><button type="button" class="btn" data-compose="${k}">방향을 정해 작성</button></div></div>`;
  }
  const fns = [];
  const box = p.infobox?.length || p.type === "인물" || portraitSrc(p) ? `<aside class="infobox"><div class="ih">${esc(p.title)}</div>${portraitHtml(p)}<div class="ity">${esc(p.type)}</div><table>${(p.infobox || []).map((r, i) => `<tr><th>${esc(r.label)}</th><td class="secb" data-ib="${i}">${blocks(r.value, fns).replace(/^<p>|<\/p>$/g, "")}</td></tr>`).join("")}</table></aside>` : "";
  let n1 = 0, n2 = 0;
  const nums = p.sections.map(s => { if ((s.level || 1) === 2 && n1) { n2++; return `${n1}.${n2}.`; } n1++; n2 = 0; return `${n1}.`; });
  const story = isStory(w), pk = story ? w.story.protagonistKey : null, card = story && k === pk && !held && S.storyCard?.wid === w.id ? S.storyCard : null;
  const chb = (s, sub) => s.ch && !sub ? `<span class="chb">${s.ch}장</span>` : "";
  const secs = p.sections.map((s, i) => { const sub = nums[i].split(".").length > 2; return `<${sub ? "h3" : "h2"} id="s-${i}" class="${sub ? "sh" : ""}${!sub && card && s.ch === card.n ? " chnew" : ""}"><span class="n">${nums[i]}</span>${chb(s, sub)}${esc(s.heading)}<button type="button" class="section-edit" data-section-edit="${i}" data-section-key="${k}" aria-label="${esc(s.heading)} 문단 편집" ${held || portraitBusy(k) ? "disabled" : ""}>[편집]</button></${sub ? "h3" : "h2"}><div class="secb" data-bi="${i}">${blocks(s.body, fns)}</div>`; }).join("");
  const toc = p.sections.length > 2 ? `<nav class="toc" aria-label="목차"><b>목차</b><ul>${p.sections.map((s, i) => `<li class="${nums[i].split(".").length > 2 ? "sub" : ""}"><span class="n">${nums[i]}</span> <button type="button" data-sec="${i}">${chb(s, nums[i].split(".").length > 2)}${esc(s.heading)}</button></li>`).join("")}</ul></nav>` : "";
  const stNotice = story && storyOn(w) && p.storyNotice ? `<div class="notice"><div>이 문서는 진행 중인 사건을 다룹니다. (현재 ${w.story.chapter}장)</div></div>` : "";
  const miss = story && !held ? missingChs(w, k) : [];
  const holdTail = " 끝나면 바뀐 내용을 보여 드립니다. 지금은 이전 버전입니다.";
  const syncHtml = !story ? "" : S.storyGen && held ? `<p class="memo-line"><span class="dot"></span>${S.storyGen.n}장을 반영한 이 문서를 ${S.storyGen.phase === "fix" ? `설정과 어긋난 ${S.storyGen.nFix}곳을 고치는 중…` : "설정과 맞춰 보는 중…"}${holdTail}</p>`
    : S.syncing === k ? `<p class="memo-line"><span class="dot"></span>${S.syncPhase?.phase === "check" ? "반영한 장 섹션을 설정과 맞춰 보는 중…" + holdTail : S.syncPhase?.phase === "fix" ? `반영한 장 섹션에서 설정과 어긋난 ${S.syncPhase.nFix}곳을 고치는 중…` + holdTail : `${missingChs(w, k).join(", ")}장의 변화를 이 문서에 반영하는 중…`}</p>`
    : S.syncErr?.key === k ? `<div class="banner warn">${miss.join(", ")}장의 변화를 반영하지 못했습니다. ${esc(S.syncErr.msg)} <button type="button" class="btn" data-act="sync-retry" style="margin-left:6px;padding:2px 10px" ${!S.sample ? "disabled" : ""}>다시 시도</button></div>`
    : miss.length ? `<p class="memo-line"><span class="dot"></span>${miss.join(", ")}장의 변화를 반영할 차례를 기다리는 중</p>` : "";
  const cardHtml = card ? storyCardHtml(w, card.n) : "";
  const fixed = k === w.mainKey || k === pk;
  const twin = !fixed ? identityOwner(w, e.title, k) || ((!e.type || e.type === "인물") ? nameOwner(w, e.title, k) : null) : null;
  const twinHtml = twin && !(e.notSame || []).includes(twin) ? `<div class="banner warn">「${esc(w.entities[twin].title)}」과(와) 같은 대상인가요? 합치면 「${esc(e.title)}」 링크는 모두 「${esc(w.entities[twin].title)}」 문서로 넘어갑니다. ${S.pages[twin] ? `이 문서는 지워지고 「${esc(w.entities[twin].title)}」 문서가 남습니다. 다른 문서들이 이 항목에 대해 확정한 내용은 옮겨집니다.` : `이 문서가 「${esc(w.entities[twin].title)}」 문서가 됩니다.`}
    <div class="row" style="margin-top:6px"><button type="button" class="btn" data-mgdo="${k}" data-mgto="${twin}" ${S.gen || S.storyGen || S.syncing ? "disabled" : ""}>같은 대상이니 합치기</button><button type="button" class="btn" data-notsame="${k}" data-other="${twin}">다른 대상입니다</button></div></div>` : "";
  const mergeBox = S.confirmMerge === k ? `<div class="rwbox">
      <label class="lb" for="mgTo" style="margin-top:0">「${esc(e.title)}」을(를) 어느 문서에 합칠까요?</label>
      <input id="mgTo" class="txt" list="mgList" placeholder="합칠 문서 제목" autocomplete="off"><datalist id="mgList">${Object.entries(w.entities).filter(([x]) => x !== k).sort((a, b) => (b[1].page ? 1 : 0) - (a[1].page ? 1 : 0)).slice(0, 300).map(([, o]) => `<option value="${esc(o.title)}"></option>`).join("")}</datalist>
      <p class="note">같은 대상인데 이름이 달라 따로 생긴 문서를 하나로 합칩니다(별명, 칭호, 성만 쓴 이름 등). 이후 「${esc(e.title)}」 링크는 고른 문서로 넘어갑니다. 고른 문서에 이미 본문이 있으면 이 문서는 지워지고, 없으면 이 문서가 그 이름으로 옮겨집니다. 다른 문서들이 이 항목에 대해 확정한 내용은 옮겨집니다. 되돌릴 수 없습니다.</p>
      <div class="row" style="margin-top:6px"><button type="button" class="btn pri" data-mg-yes="${k}">합치기</button><button type="button" class="btn" data-act="mg-no">취소</button></div></div>` : "";
  const fnHtml = fns.length ? `<section class="fns"><b>각주</b><ol>${fns.map((f, i) => `<li id="fn-${i + 1}">${inline(f)}</li>`).join("")}</ol></section>` : "";
  const back = [...new Set(e.mentions.map(m => m.from))].filter(x => w.entities[x] && x !== k);
  const out = (p.links || []).filter(x => w.entities[x]);
  const newOut = out.filter(x => !S.pages[x]).length;
  const chk = p.check;
  const hi = (chk?.issues || []).filter(i => i.severity === "high"), lo = (chk?.issues || []).filter(i => i.severity !== "high");   // 편집자 메모는 설정 충돌만 다룬다
  S.memo = { k, items: [...hi, ...lo] };
  const fixBtn = n => `<button type="button" class="btn memo-fix" data-fix="${n}" data-fixk="${k}" ${S.fixing || (S.gen && S.gen.key === k) || !S.sample ? "disabled" : ""}>${S.fixing && S.fixing.key === k && S.fixing.i === n ? "고치는 중…" : "고치기"}</button>`;
  const item = (i, n, cls) => `<li class="${cls}">${esc(i.claim)}${i.conflict ? `<span class="memo-why">${esc(i.conflict)}</span>` : ""}${i.target && i.target !== k ? "" : fixBtn(n)}<button type="button" class="memo-del" data-memo-del="${n}" data-memo-k="${k}" aria-label="이 메모 삭제" ${S.fixing && S.fixing.key === k ? "disabled" : ""}>[삭제]</button></li>`;   // 다른 문서가 고칠 대상이면 이 문서의 고치기 버튼은 두지 않는다
  const chkHtml = S.bgSync === k ? `<p class="memo-line"><span class="dot"></span>확정 사실을 정리하는 중</p>` : S.checking === k ? `<p class="memo-line"><span class="dot"></span>설정 노트와 맞춰 보는 중 <span class="src" id="chkTick"></span></p>`
    : (hi.length || lo.length) ? `<details class="memo"${hi.length ? " open" : ""}><summary><span class="memo-dot${hi.length ? " on" : ""}"></span>편집자 메모${hi.length ? ` · 다듬을 곳 ${hi.length}` : ""}${lo.length ? ` · 참고 ${lo.length}` : ""}${chk ? `<span class="src">${fmtDate(chk.at)}</span>` : ""}</summary><ul>${hi.map((i, n) => item(i, n, "")).join("")}${lo.map((i, n) => item(i, hi.length + n, "lo")).join("")}</ul>${hi.length + lo.length > 1 ? `<div class="memo-foot"><button type="button" class="btn" data-act="fixv-open" ${S.gen && S.gen.key === k ? "disabled" : ""}>여러 곳 한꺼번에 교정하기</button></div>` : ""}</details>`
    : chk ? `<p class="memo-line">설정 노트와 맞춰 봤습니다 <span class="src">${fmtDate(chk.at)}</span></p>` : "";
  const rw = `<button type="button" class="btn" data-rw="${k}" aria-expanded="${S.confirmRewrite === k}" ${S.gen || S.storyGen || S.syncing === k || !S.sample ? "disabled" : ""}>다시 쓰기</button>`;
  const binding = e.mentions.filter(m => m.from !== k).length + e.facts.filter(f => f.src !== k).length;
  const rwBox = S.confirmRewrite === k ? `<div class="rwbox">
      <label class="lb" for="rwDir">다시 쓰기 방향 <span class="note" style="font-weight:400">선택</span></label>
      <input id="rwDir" class="txt" type="text" maxlength="300" placeholder="예: 생애는 줄이고 위화도 회군 전투를 중심으로, 분량은 절반 정도">
      <p class="note">이 문서의 이전 버전과 이전 버전이 확정한 사실은 참고하지 않고 새로 씁니다. 다른 문서가 이 항목에 대해 확정한 내용 ${binding}건은 그대로 지킵니다.${p.editedAt ? " 직접 수정한 내용도 사라집니다." : ""}${isStory(w) && p.sections.some(s => s.ch) ? ` 장 섹션은 따로 남지 않고, 현재 ${w.story.chapter}장 시점의 본문으로 합쳐서 새로 씁니다.` : ""} 실패하거나 중단하면 이전 버전이 유지됩니다.</p>
      <div class="row" style="margin-top:6px"><button type="button" class="btn pri" data-rw-yes="${k}">다시 쓰기</button><button type="button" class="btn" data-act="rw-no">취소</button></div>
    </div>` : "";
  return `<article class="sheet">${crumb}<h1 class="t">${esc(p.title)}</h1>
    ${(() => { const cs = pageCats(p); return cs.length ? `<div class="cats"><b>분류</b>${cs.map(c => `<button type="button" class="cat" data-cat="${esc(c)}" title="「${esc(c)}」 분류의 문서 보기">${esc(c)}</button>`).join("")}</div>` : ""; })()}
    ${navboxesFor(w, k).map(([, nb]) => navboxHtml(nb, nb.src === k, k)).join("")}
    ${cardHtml}
    <div class="tools"><button type="button" class="btn" data-edit="${k}">편집</button>${portraitMenuHtml(p, k, held)}<button type="button" class="btn" data-prose-open="${k}" ${held ? "disabled" : ""}>단편 쓰기${shortStoriesOf(p).length ? ` · ${shortStoriesOf(p).length}편` : ""}</button><button type="button" class="btn" data-check="${k}" ${S.checking || !S.sample ? "disabled" : ""}>설정 검사</button>${rw}<button type="button" class="btn" data-focus="${k}">설정 노트에서 보기</button>${fixed ? "" : `<button type="button" class="btn" data-mg="${k}" aria-expanded="${S.confirmMerge === k}">합치기</button>`}${k === pk ? `<button type="button" class="btn dng" disabled title="주인공 문서는 이야기의 중심이라 삭제할 수 없습니다">삭제</button>` : `<button type="button" class="btn dng" data-delpage="${k}" aria-expanded="${S.confirmDelPage === k}">삭제</button>`}</div>
    ${imageGenHtml(w, k)}${proseHtml(w, k)}${mergeBox}${twinHtml}
    ${S.confirmDelPage === k ? `<div class="rwbox"><p style="margin:0">「${esc(p.title)}」 문서를 삭제할까요?</p>
      <p class="note">문서와 이 문서가 확정한 사실, 틀, 연표 항목, 보관한 단편이 지워집니다. 다른 문서가 이 항목을 언급한 내용은 남고, 그 링크는 미작성 문서로 돌아갑니다. 되돌릴 수 없습니다.</p>
      <div class="row" style="margin-top:6px"><button type="button" class="btn dng" data-delpage-yes="${k}">삭제</button><button type="button" class="btn" data-act="delpage-no">취소</button></div></div>` : ""}
    ${p.stale ? `<div class="banner warn">직접 수정한 내용을 설정과 대조하지 못해, 설정 노트에 이전 버전의 사실이 남아 있을 수 있습니다. <button type="button" class="btn" data-refresh="${k}" style="margin-left:6px;padding:2px 10px" ${!S.sample ? "disabled" : ""}>설정과 대조해 다시 저장</button></div>` : ""}
    ${p.conflicts?.length ? `<div class="banner warn"><b>「${esc(p.conflicts[0].byTitle)}」${p.conflicts.some(c => c.byTitle !== p.conflicts[0].byTitle) ? " 등" : ""} 문서가 직접 수정되어, 이 문서의 서술 ${p.conflicts.length}곳이 설정과 맞지 않습니다.</b>
      <ul>${p.conflicts.map(c => `<li>${esc(c.old)} <span class="src">→ ${linkHtml(c.byTitle)}: ${esc(c.claim)}</span></li>`).join("")}</ul>
      <div class="row" style="margin-top:4px"><button type="button" class="btn pri" data-cfix="${k}" ${S.gen || S.fixing || !S.sample ? "disabled" : ""}>AI로 고치기</button><button type="button" class="btn" data-edit="${k}">편집해서 고치기</button><button type="button" class="btn" data-rw="${k}" ${S.gen || !S.sample ? "disabled" : ""}>다시 쓰기</button><button type="button" class="btn" data-dismiss="${k}" data-field="conflicts">표시 지우기</button></div></div>` : ""}
    ${(() => { const ac = (p.autoConflicts || []).filter(c => w.entities[c.by]); if (!ac.length) return "";   // 자동 대조가 이 문서를 고칠 대상으로 정한 지적
      return `<div class="banner warn"><b>「${esc(ac[0].byTitle)}」${ac.some(c => c.byTitle !== ac[0].byTitle) ? " 등" : ""} 문서와 맞지 않는 서술 ${ac.length}곳 (자동 대조)</b>
      <ul>${ac.map(c => `<li>${esc(c.old)} <span class="src">→ ${linkHtml(c.byTitle)}: ${esc(c.claim)}</span></li>`).join("")}</ul>
      <div class="row" style="margin-top:4px"><button type="button" class="btn pri" data-cfix="${k}" data-cfield="autoConflicts" ${S.gen || S.fixing || !S.sample ? "disabled" : ""}>AI로 고치기</button><button type="button" class="btn" data-edit="${k}">편집해서 고치기</button><button type="button" class="btn" data-dismiss="${k}" data-field="autoConflicts">표시 지우기</button></div></div>`; })()}
    ${p.pending?.length ? `<div class="banner warn"><b>이 문서의 수정 내용이 직접 정한 설정과 충돌한 채 저장되었습니다.</b>
      <ul>${p.pending.map(c => `<li><span class="sev">${esc(c.label)}</span>${esc(c.old)} <span class="src">↔ 수정본: ${esc(c.claim)}</span></li>`).join("")}</ul>
      <div class="row" style="margin-top:4px"><button type="button" class="btn" data-edit="${k}">편집</button><button type="button" class="btn" data-act="canon">설정 노트 열기</button><button type="button" class="btn" data-dismiss="${k}" data-field="pending">표시 지우기</button></div></div>` : ""}
    ${rwBox}${syncHtml}${p.autoFixed && Date.now() - p.autoFixed.at < 864e5 ? `<p class="memo-line">작성 직후 설정과 어긋난 ${p.autoFixed.n}곳을 자동으로 고쳤습니다 <span class="src">${fmtDate(p.autoFixed.at)}</span></p>` : ""}${chkHtml}
    ${p.rewrittenAt ? `<p class="src" style="margin:8px 0 0">${fmtDate(p.rewrittenAt)} 다시 씀</p>` : ""}
    <div class="article">${stNotice}${p.notices?.length ? `<div class="notice">${p.notices.map(n => `<div>${blocks(n, fns).replace(/^<p>|<\/p>$/g, "")}</div>`).join("")}</div>` : ""}${box}${toc}${secs}${fnHtml}</div>
    ${(() => {
      const rs = relationsOf(w, k);
      if (!rs.length) return "";
      const groups = new Map();   // 상대 인물 한 명당 카드 한 장. 관계가 여러 번 바뀌었으면 순서대로 보여 준다
      for (const x of rs) { const o = x.a === k ? x.b : x.a; (groups.get(o) || groups.set(o, []).get(o)).push(x); }
      return `<section class="rels"><h3>인물 관계</h3><ul>${[...groups].map(([o, xs]) => {
        const liveXs = xs.filter(x => !x.sup), show = liveXs.length ? liveXs : xs, last = show[show.length - 1];
        const rels = [...new Map(show.map(x => [relKey(x.rel), x.rel])).values()];
        const srcs = [...new Set(show.map(x => srcTitle(w, x.src, "?") + (S.pages[x.src]?.editedAt ? " (직접 수정)" : "")))];
        const story = [...show].reverse().find(x => x.story)?.story || "";
        return `<li class="${liveXs.length ? "" : "sup"}"><div class="rel-h">${linkHtml(w.entities[o].title)}${rels.map((r, i) => `${i ? `<span class="src">→</span>` : ""}<span class="rel-k">${esc(r)}</span>`).join("")}</div>${story ? `<p>${esc(story)}</p>` : ""}<span class="src">출처 ${esc(srcs.join(" · "))}${!liveXs.length && last.sup ? ` · 「${esc(w.entities[last.sup.by]?.title || "?")}」 수정으로 대체됨` : ""}</span></li>`;
      }).join("")}</ul></section>`;
    })()}
    <div class="meta-foot">
      <div class="box"><b>이 문서를 언급한 문서</b>${back.length ? back.map(x => linkHtml(w.entities[x].title)).join(" · ") : `<span class="src">없음 (첫 문서)</span>`}</div>
      <div class="box"><b>이 문서의 링크</b><span class="src">${out.length}개 중 미작성 ${newOut}개</span></div>
    </div></article>`;
}
function editHtml(k) {
  if (S.edit.section) return sectionEditHtml(k);
  const w = S.world, f = S.edit.f, e = w.entities[k];
  const ta = (id, ef, rows, ph) => `<textarea id="${id}" data-ef="${ef}" rows="${rows}" ${ph ? `placeholder="${esc(ph)}"` : ""}>${esc(f[ef])}</textarea>`;
  return `<div class="sheet ed"><div class="crumb"><span>${esc(w.title)}</span><span>문서 편집</span></div>
    <h1 class="t">${esc(e.title)} <span class="note" style="font-family:var(--f-body);font-size:14px;font-weight:400">편집 중</span></h1>
    ${S.edit.fix ? `<div class="banner warn"><b>고치기 제안</b>${S.edit.fix.note ? " · " + esc(S.edit.fix.note) : ""}<ul>${S.edit.fix.applied.map(a => `<li><del>${esc(stripMarks(a.old))}</del><br>→ ${esc(stripMarks(a.new))}</li>`).join("")}</ul>아래 편집 칸에 이미 반영해 두었습니다. 확인하고 저장을 누르면 설정과 대조한 뒤 확정 사실과 연표도 새로 정리합니다.</div>` : ""}
    <label class="lb" for="edSummary">한 줄 정의</label><input id="edSummary" class="txt" data-ef="summary" value="${esc(f.summary)}">
    <div class="ed-2">
      <div><label class="lb" for="edType">유형</label><input id="edType" class="txt" data-ef="type" list="typeList" value="${esc(f.type)}"><datalist id="typeList">${TYPES.map(t => `<option value="${t}"></option>`).join("")}</datalist></div>
      <div><label class="lb" for="edCats">분류 <span class="note" style="font-weight:400">| 로 구분</span></label><input id="edCats" class="txt" data-ef="cats" value="${esc(f.cats)}"></div>
    </div>
    <label class="lb" for="edNotices">안내 틀 <span class="note" style="font-weight:400">한 줄에 하나</span></label>${ta("edNotices", "notices", 2)}
    <label class="lb" for="edInfobox">인포박스 <span class="note" style="font-weight:400">한 줄에 "항목: 값"</span></label>${ta("edInfobox", "infobox", Math.min(10, f.infobox.split("\n").length + 1))}
    <label class="lb" for="edBody">본문</label>${ta("edBody", "body", 26)}
    <details class="ed-help"><summary>문법 안내</summary><dl class="kv">
      <dt>= 제목 =</dt><dd>섹션</dd><dt>== 제목 ==</dt><dd>하위 섹션</dd>${isStory(w) ? `<dt>= [2장] 제목 =</dt><dd>이야기의 장 섹션. 그 아래 하위 섹션도 같은 장에 속합니다. [2장]을 지우면 그 섹션은 일반 본문 섹션으로 합쳐집니다</dd>` : ""}
      <dt>[[항목]]</dt><dd>링크. 보이는 말을 바꾸려면 [[항목|보일 말]]</dd>
      <dt>**굵게** ~~취소선~~</dt><dd>강조와 취소선</dd><dt>[* 내용]</dt><dd>각주</dd>
      <dt>- 항목</dt><dd>목록. 앞에 공백 두 칸을 넣으면 하위 목록</dd><dt>&gt; 문장</dt><dd>인용문. 다음 줄에 "&gt; — 화자"</dd>
    </dl></details>
    <label class="lb" for="edNavbox">틀 <span class="note" style="font-weight:400">구성원 명단 등. 없으면 비워 둡니다</span></label>${ta("edNavbox", "navbox", Math.max(4, Math.min(14, f.navbox.split("\n").length + 1)), "= 독수리 중대 대원 =\n== 창설 대원 ==\n[[캡틴 리버티]] — 1번, 개문 임무\n[[레드 호크]] — 2번")}
    <p class="note" style="margin-top:12px">문서 제목은 바꿀 수 없습니다. 저장하면 수정본을 기존 설정과 대조한 뒤 반영합니다. AI가 쓴 문서와 충돌하면 이 수정이 기준이 되고 해당 문서에 표시가 붙습니다. 핵심 규칙이나 직접 수정한 다른 문서와 충돌하면 어느 쪽을 따를지 묻습니다.</p>
    <div id="edConflicts"></div>
    <div class="banner warn" id="edErr" hidden></div>
    <div class="row"><button type="button" class="btn pri" id="edSave" data-act="ed-save">저장</button><button type="button" class="btn" data-act="ed-cancel">취소</button></div></div>`;
}
function navboxHtml(nb, open, cur) {
  const item = it => {
    const i = it.indexOf(" — "); const name = i >= 0 ? it.slice(0, i) : it, desc = i >= 0 ? it.slice(i + 3) : "";
    const self = [...name.matchAll(LINK_RE)].some(m => keyOf(m[1]) === cur);
    return `<li class="${self ? "me" : ""}">${self ? `<b>${esc(stripMarks(name))}</b>` : inline(name)}${desc ? `<small>${inline(desc)}</small>` : ""}</li>`;
  };
  return `<details class="navbox"${open ? " open" : ""}><summary><span class="nb-t">${esc(nb.title)}</span><span class="nb-n">${nb.members.length}</span><span class="nb-tog" aria-hidden="true"></span></summary>
    <div class="nb-body">${nb.rows.map(r => `<div class="nb-row">${r.label ? `<div class="nb-l">${esc(r.label)}</div>` : ""}<ul>${r.items.map(item).join("")}</ul></div>`).join("")}
    ${nb.src !== cur ? `<div class="nb-src">${linkHtml(nb.srcTitle, nb.srcTitle + " 문서")}</div>` : ""}</div></details>`;
}
function openCompose(k) {
  const w = S.world; if (!w || !w.entities[k]) return;
  if (S.pages[k]) { openEntity(k); return; }
  if (!S.compose || S.compose.key !== k) S.compose = { key: k, type: "", dir: "" };
  S.view = { name: "compose", key: k }; renderAll(); window.scrollTo({ top: 0 });
  if (!lp.touch) setTimeout(() => $("#cpDir")?.focus(), 0);
}
function composeHtml(k) {
  const w = S.world, e = w.entities[k], c = S.compose;
  if (!e) return `<div class="sheet"><p>문서를 찾을 수 없습니다.</p></div>`;
  const busy = S.gen && S.gen.key !== k;
  return `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>새 문서 작성</span></div>
    <h1 class="t">${esc(e.title)}</h1>
    ${promiseHtml(w, e, "이미 확정된 내용")}
    <label class="lb" for="cpType">유형</label>
    <select id="cpType" class="txt"><option value="">자동으로 정하기</option>${TYPES.map(t => `<option value="${t}"${c.type === t ? " selected" : ""}>${t}</option>`).join("")}</select>
    <label class="lb" for="cpDir">작성 방향</label>
    <textarea id="cpDir" rows="6" maxlength="1200" placeholder="예: 위화도 회군에서의 활약을 중심으로. 특수 무장 두 가지와 전용기 파일럿의 맞수 관계를 자세히. 분량은 길게.">${esc(c.dir)}</textarea>
    <p class="note">확정된 내용과 핵심 규칙은 그대로 지키고, 그 안에서 이 방향을 가장 먼저 따릅니다. 분량이나 구성에 관한 요청도 반영됩니다.</p>
    ${busy ? `<div class="banner warn">「${esc(S.gen.title)}」 문서를 작성하는 중입니다. 끝난 뒤 작성할 수 있습니다.</div>` : ""}
    <div class="row"><button type="button" class="btn pri" data-compose-go="${k}" ${busy || !S.sample ? "disabled" : ""}>이 방향으로 작성</button><button type="button" class="btn" data-act="compose-cancel">취소</button></div></div>`;
}
function startCompose(k) {
  const c = S.compose; if (!c || c.key !== k) return;
  const dir = norm(c.dir).slice(0, 1200), guide = [c.type ? `유형: ${c.type}` : "", dir].filter(Boolean).join("\n");
  if (S.world.entities[k].src === "search") S.world.entities[k].src = "guided";
  S.compose = null; S.genErr = null;
  S.recent = [k, ...S.recent.filter(x => x !== k)].slice(0, 8);
  generatePage(k, false, guide);
}
/* 문서의 분류. 생성 때 분류가 빠졌으면 유형(인물·조직 등)을 분류로 쓴다. 유형은 모든 문서의 상위 분류 역할도 한다 */
const pageCats = p => p.categories?.length ? p.categories : p.type ? [p.type] : [];
/* 분류 문서: 같은 분류(또는 같은 유형)가 붙은 작성된 문서를 모아 보여 준다 */
function categoryHtml(cat) {
  const w = S.world, c = norm(cat || "");
  const hits = Object.entries(S.pages).filter(([k, p]) => w.entities[k] && (norm(p.type || "") === c || pageCats(p).some(x => norm(x) === c))).sort((a, b) => a[1].title.localeCompare(b[1].title, "ko"));
  const near = [...new Set(hits.flatMap(([, p]) => [...pageCats(p), p.type || ""]).map(norm))].filter(x => x && x !== c).slice(0, 12);
  return `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>분류</span></div>
    <h1 class="t">분류: ${esc(c)}</h1>
    ${hits.length ? `<p class="note">이 분류에 속한 문서 ${hits.length}개</p><ul class="catlist">${hits.map(([k, p]) => `<li>${linkHtml(p.title)}${p.summary ? `<small>${esc(stripMarks(p.summary))}</small>` : ""}</li>`).join("")}</ul>` : `<p class="note">이 분류에 속한 문서가 없습니다.</p>`}
    ${near.length ? `<div class="cats"><b>함께 쓰인 분류</b>${near.map(x => `<button type="button" class="cat" data-cat="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}</div>`;
}
function notFoundHtml(t) {
  const w = S.world, tl = t.toLowerCase();
  const sim = Object.values(w.entities).filter(o => o.title.length >= 2 && (o.title.toLowerCase().includes(tl) || tl.includes(o.title.toLowerCase()))).slice(0, 6);
  return `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>검색</span></div>
    <h1 class="t">${esc(t)}</h1>
    <p class="nf-h">문서를 찾을 수 없습니다!</p>
    <p class="note">‘${esc(t)}’에 해당하는 항목이 「${esc(w.title)}」에 없고, 새 항목으로 쓸 만한 이름으로도 읽히지 않습니다.</p>
    ${sim.length ? `<p>비슷한 문서: ${sim.map(o => linkHtml(o.title)).join(" · ")}</p>` : ""}
    <div class="tools"><button type="button" class="btn" data-force="${esc(t)}" ${S.gen || !S.sample ? "disabled" : ""}>그래도 이 이름으로 새 문서 만들기</button></div></div>`;
}
function leadHtml(p) {
  const s = p.summary;
  if (s.startsWith(p.title)) return `<strong>${esc(p.title)}</strong>${esc(s.slice(p.title.length))}`;
  return `<strong>${esc(p.title)}</strong> — ${esc(s)}`;
}
function promiseHtml(w, e, head) {
  const items = [...(e.summary ? [`<li><b>정의</b> ${esc(e.summary)}</li>`] : []), ...e.facts.filter(live).map(f => `<li>${esc(f.t)} <span class="src">· ${esc(srcTitle(w, f.src, "사용자"))}</span></li>`), ...e.mentions.filter(live).map(m => `<li>“${esc(m.text)}” <span class="src">· 「${esc(w.entities[m.from]?.title || "?")}」에서 언급</span></li>`)];
  if (!items.length) return `<div class="promise"><h5>${esc(head)}</h5><span class="note">아직 확정된 내용이 없는 새 항목입니다. 핵심 규칙과 연표만 지키며 자유롭게 작성합니다.</span></div>`;
  return `<div class="promise"><h5>${esc(head)} · ${items.length}건</h5><ul>${items.join("")}</ul></div>`;
}
function updateGenLive() {
  if (!S.gen || S.view.name !== "article" || S.view.key !== S.gen.key) return;
  const c = $("#genCount"), h = $("#genHeads"); if (!c || !h) return;
  const raw = S.gen.raw;
  const el = Math.floor((performance.now() - (S.gen.t0 || performance.now())) / 1000);
  const rt = S.gen.retry ? ` · 연결이 끊겨 ${S.gen.retry.mode === "continue" ? "이어 받는 중" : "다시 받는 중"}(${S.gen.retry.n}/${G_RETRY})` : "";
  c.textContent = S.gen.phase === "check" ? `설정과 맞춰 보는 중 · ${el}초` : S.gen.phase === "fix" ? `설정과 어긋난 ${S.gen.nFix}곳을 고치는 중 · ${el}초`
    : (raw ? `문서를 작성하는 중 · ${raw.length.toLocaleString()}자 · ${el}초` : `생각하는 중 · ${el}초`) + rt;
  const heads = [...raw.matchAll(/"heading"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
  if (heads.length !== h.children.length) h.innerHTML = heads.map((x, i) => `<li>${i + 1}. ${esc(x)}</li>`).join("");
}
