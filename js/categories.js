"use strict";
/* 분류 축과 틀
   - 분류는 축(소속·유형·사건·기타)별로 받는다. 문서에는 지금처럼 이름 목록(p.categories)으로 두고, 축은 p.catAxes = [{name, axis}]로 함께 둔다.
     축이 없는 예전 분류는 이름만 있는 그대로 읽는다.
   - 분류 합치기는 w.categoryAliases = {옛 이름: 새 이름}에만 남기고, 읽을 때 새 이름으로 바꿔 읽는다(문서 데이터는 고치지 않는다).
   - 틀은 분류의 교집합으로 계산한다. 저장하는 것은 정의({id, title, cats, split})뿐이고 구성원은 그릴 때마다 계산한다.
     자동 정의는 저장하지 않고 매번 계산하며, 사용자가 지운 자동 틀만 w.navDefsOff에, 직접 만든 틀은 w.navDefs에 둔다.
   - 예전 방식의 틀(w.navboxes)은 지우지 않고 그대로 보여 준다. */
const CAT_AXES = ["소속", "유형", "사건", "기타"];
const CAT_AXIS_MAX = { 소속: 2, 유형: 2, 사건: 2, 기타: 2 };
const NAV_MIN = 3, NAV_SPLIT = 12, NAV_OPEN_MAX = 4, NAV_PROMPT_N = 40;
const catName = x => norm(stripMarks(String(x || ""))).slice(0, 40);
/* 합친 분류를 따라가 지금 이름을 돌려준다 */
function catAlias(w, c) {
  const a = w?.categoryAliases || {}; let n = 0;
  while (c && a[c] && a[c] !== c && n++ < 20) c = a[c];
  return c;
}
/* 생성 응답의 categories → [{name, axis}]. 예전 형식(이름 배열)은 축 없이 받는다 */
function parseCats(raw) {
  const out = [], seen = new Set();
  const add = (x, axis) => { const name = catName(x); if (!name || TYPES.includes(name) || seen.has(name)) return; seen.add(name); out.push(axis ? { name, axis } : { name }); };   // 유형 이름은 분류로 두지 않는다
  if (Array.isArray(raw)) { for (const x of raw) if (typeof x === "string") add(x, null); }
  else if (raw && typeof raw === "object") {
    for (const ax of CAT_AXES) { const v = raw[ax]; (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter(x => typeof x === "string").slice(0, CAT_AXIS_MAX[ax]).forEach(x => add(x, ax)); }
  }
  return out.slice(0, 8);
}
/* 소속·유형을 고르는 기준. 문서 작성(catGuide)과 다시 받기(catRetryPrompt)가 함께 쓴다 */
const CAT_AXIS_RULES = `- 소속: 이 항목이 속한 가장 넓은 곳(국가나 그에 맞먹는 세력)을 첫째로 붙인다. 국가 안의 군·부대·기관·회사·학교에 속하면 그 국가를 먼저 붙이고, 그 조직은 둘째로만 붙인다(예: 'A국 해군' 소속이면 ["A국", "A국 해군"]). 해당하면 1개는 반드시 붙인다(최대 2개).
- 유형: 이 항목이 무엇인지 나타내는 넓은 말. 원안과 핵심 규칙이 만든 이 세계 고유의 존재·신분·계층(이 세계관의 중심 소재)에 해당하는 항목이면 그 이름을 유형의 첫째로 쓴다. 현실에도 있는 직업이나 범주는 그다음이다. 해당하면 1개는 반드시 붙인다(최대 2개).`;
/* 소속이 "X 육군"처럼 이 세계의 국가나 기존 소속 분류 X로 시작하면 X를 첫째 소속으로 보탠다(넓은 소속이 빠지지 않게). 생성 응답에만 쓴다 */
function widenAffil(w, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const names = parseCats({ 소속: Array.isArray(raw.소속) ? raw.소속 : typeof raw.소속 === "string" ? [raw.소속] : [] }).map(x => x.name);
  if (!names.length) return raw;
  const st = catStats(w), wide = new Set([...Object.values(w.entities).filter(o => o.type === "국가").map(o => norm(o.title)), ...[...st].filter(([, s]) => s.axis === "소속").map(([c]) => c)]);
  const out = [];
  for (const c of names) {
    const parent = [...wide].filter(x => x.length >= 2 && c !== x && c.startsWith(x + " ")).sort((a, b) => b.length - a.length)[0];
    if (parent && !out.includes(parent) && !names.includes(parent)) out.push(parent);
    if (!out.includes(c)) out.push(c);
  }
  raw.소속 = out.slice(0, CAT_AXIS_MAX.소속);
  return raw;
}
/* 축별 응답인데 소속이나 유형이 비었는가 */
const axisCatsMissing = raw => !!raw && typeof raw === "object" && !Array.isArray(raw) && (!parseCats({ 소속: raw.소속 }).length || !parseCats({ 유형: raw.유형 }).length);
function catRetryPrompt(w, key, out) {
  const e = w.entities[key], st = catStats(w, key), list = ax => [...st].filter(([, s]) => s.axis === ax).sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([c, s]) => `${c}(${s.n})`).join(", ") || "(없음)";
  const box = (Array.isArray(out?.infobox) ? out.infobox : []).filter(r => r && r.label).slice(0, 10).map(r => `${r.label}: ${stripMarks(String(r.value || ""))}`).join("\n");
  return `가상 세계관 위키 「${w.title}」의 문서 「${e.title}」에 붙일 분류 중 소속과 유형을 정한다.
정의: ${stripMarks(String(out?.summary || e.summary || ""))}
${box ? "인포박스:\n" + box + "\n" : ""}원안: ${String(w.seed || "").slice(0, 600)}
핵심 규칙: ${(w.rules || []).slice(0, 8).join(" / ") || "(없음)"}
지금 붙은 분류: ${JSON.stringify(out?.categories || {})}
${CAT_AXIS_RULES}
- 유형 이름(${TYPES.join(", ")})은 쓰지 않는다.
- 같은 뜻이면 아래 기존 이름을 글자 그대로 쓴다. 같은 뜻의 분류가 이미 둘 이상 있으면 문서 수가 많은 쪽 하나만 쓴다. 합친 분류("○○의 △△")는 만들지 않는다.
- 정말 해당하는 것이 없으면 빈 배열로 둔다.
기존 소속 분류(괄호는 문서 수): ${list("소속")}
기존 유형 분류: ${list("유형")}
JSON 객체 하나만 출력: {"소속":["..."],"유형":["..."]}`;
}
/* 소속이나 유형이 비었으면 한 번만 다시 받아 빈 축을 채운다. 실패해도 문서 작성은 계속한다 */
async function ensureAxisCats(w, key, out, opts = {}) {
  if (!axisCatsMissing(out?.categories)) return false;
  let r;
  try { r = await callJson("cats", catRetryPrompt(w, key, out), { modelTier: "check", ...opts }, { title: w.entities[key]?.title || "" }); }
  catch (err) { if (err?.code === "cancelled" || opts.signal?.aborted) throw err; return false; }
  let ch = false;
  for (const ax of ["소속", "유형"]) if (!parseCats({ [ax]: out.categories[ax] }).length) { const got = parseCats({ [ax]: r?.[ax] }); if (got.length) { out.categories[ax] = got.map(x => x.name); ch = true; } }
  return ch;
}
/* 이 항목의 분류 이름들(합친 분류는 새 이름으로). 문서가 있으면 문서의 분류, 없으면 링크할 때 받아 둔 소속·유형 */
function docCats(w, k) {
  const p = S.world === w ? S.pages[k] : null, e = w.entities[k];
  const names = p ? (p.categories || []) : (e?.cats || []).map(x => x.name);
  return [...new Set(names.map(c => catAlias(w, norm(c))).filter(Boolean))];
}
/* 세계관의 분류 현황: 이름 → {n: 붙은 문서 수, axis: 가장 많이 기록된 축(없으면 "")} */
function catStats(w, except) {
  const m = new Map(), get = c => m.get(c) || m.set(c, { n: 0, ax: {} }).get(c);
  const pages = S.world === w ? S.pages : {};
  for (const [k, p] of Object.entries(pages)) {
    if (k === except || !w.entities[k]) continue;
    const ax = new Map((p.catAxes || []).map(x => [catAlias(w, norm(x.name)), x.axis]));
    for (const c of new Set((p.categories || []).map(x => catAlias(w, norm(x))))) {
      if (!c) continue; const s = get(c); s.n++;
      const a = ax.get(c); if (a) s.ax[a] = (s.ax[a] || 0) + 1;
    }
  }
  for (const [k, e] of Object.entries(w.entities)) {   // 문서가 없는 항목의 소속·유형은 축 판단에만 보탠다
    if (k === except || pages[k]) continue;
    for (const x of e.cats || []) { const s = m.get(catAlias(w, norm(x.name))); if (s && x.axis) s.ax[x.axis] = (s.ax[x.axis] || 0) + 1; }
  }
  for (const s of m.values()) s.axis = Object.entries(s.ax).sort((a, b) => b[1] - a[1] || CAT_AXES.indexOf(a[0]) - CAT_AXES.indexOf(b[0]))[0]?.[0] || "";
  return m;
}
/* 분류 합치기(사용자가 고를 때만): from을 to로 읽는다 */
function mergeCategory(w, from, to) {
  from = catAlias(w, norm(from)); to = catAlias(w, norm(to));
  if (!from || !to || from === to) return false;
  w.categoryAliases ||= {};
  w.categoryAliases[from] = to;
  delete w.categoryAliases[to];
  for (const [x, y] of Object.entries(w.categoryAliases)) if (y === from) w.categoryAliases[x] = to;
  for (const d of w.navDefs || []) d.cats = [...new Set(d.cats.map(c => catAlias(w, c)))];
  return true;
}

/* ---------- 틀: 분류의 교집합 ---------- */
const navKey = cats => [...cats].sort().join("|");
function autoNavDefs(w) {
  const st = catStats(w), pair = new Map(), ev = new Map();
  for (const k of Object.keys(S.world === w ? S.pages : {})) {
    if (!w.entities[k]) continue;
    const cs = docCats(w, k), of = ax => cs.filter(c => st.get(c)?.axis === ax);
    for (const x of of("소속")) for (const y of of("유형")) { const id = x + "\u0001" + y; pair.set(id, (pair.get(id) || 0) + 1); }
    for (const x of of("사건")) ev.set(x, (ev.get(x) || 0) + 1);
  }
  const defs = [];
  for (const [id, n] of pair) if (n >= NAV_MIN) { const [x, y] = id.split("\u0001"); defs.push({ id: "auto:" + navKey([x, y]), title: `${x}의 ${y}`, cats: [x, y], split: "decade", auto: true }); }
  for (const [x, n] of ev) if (n >= NAV_MIN) defs.push({ id: "auto:" + navKey([x]), title: x, cats: [x], split: "decade", auto: true });
  return defs;
}
/* 쓰이는 틀 정의 전부: 직접 만든 틀 + 지우지 않은 자동 틀. 같은 기준 분류면 직접 만든 쪽 하나만 */
function navDefs(w) {
  const off = new Set(w.navDefsOff || []), seen = new Set(), out = [];
  const user = (w.navDefs || []).filter(d => d && Array.isArray(d.cats) && d.cats.length).map(d => ({ ...d, cats: [...new Set(d.cats.map(c => catAlias(w, norm(c))))] }));
  for (const d of [...user, ...autoNavDefs(w).filter(d => !off.has(d.id))]) { const key = navKey(d.cats); if (seen.has(key)) continue; seen.add(key); out.push(d); }
  return out;
}
const navMembers = (w, d) => Object.keys(w.entities).filter(k => { const cs = docCats(w, k); return d.cats.every(c => cs.includes(c)); });
/* 순서에 쓰는 연도: 인물은 출생, 조직은 창설, 사건은 발생. 인포박스 숫자 대조(numFacts)가 읽은 값을 쓴다. 모르면 null */
const NAV_EVENT_LABEL = /^(?:기간|일시|날짜|일자|발생|시기|연도|시작)/;
function navYear(w, k) {
  const p = S.world === w ? S.pages[k] : null; if (!p) return null;
  const f = numFacts(p), ty = p.type || w.entities[k]?.type || "";
  const order = ty === "인물" ? [f.birth] : [f.founding, f.nation, f.school, f.publication, f.introduction, f.development, f.enactment, f.enforcement, f.birth];
  let h = order.find(Boolean);
  if (!h) {   // 사건은 기간·일시 줄의 첫 연도
    for (const r of p.infobox || []) if (NAV_EVENT_LABEL.test(String(r.label || "").trim())) { const y = yearsOf(stripMarks(r.value)).find(x => !x.approx) || yearsOf(stripMarks(r.value))[0]; if (y) { h = y; break; } }
  }
  return h ? h.y : null;
}
const decadeLabel = y => y < 0 ? `기원전 ${Math.floor(-y / 10) * 10}년대` : `${Math.floor(y / 10) * 10}년대`;
/* 연도순(모르면 맨 끝). 구성원이 NAV_SPLIT개를 넘으면 연대별로 줄을 나눈다 */
function navRows(w, d, members) {
  const items = members.map(k => ({ k, y: navYear(w, k), t: w.entities[k].title }))
    .sort((a, b) => (a.y == null) - (b.y == null) || (a.y ?? 0) - (b.y ?? 0) || a.t.localeCompare(b.t, "ko"));
  if (items.length <= NAV_SPLIT || d.split === "none") return [{ label: "", items }];
  const rows = [];
  for (const it of items) { const label = it.y == null ? "연도 미상" : decadeLabel(it.y), last = rows[rows.length - 1]; if (last && last.label === label) last.items.push(it); else rows.push({ label, items: [it] }); }
  return rows;
}
/* 이 문서에 보일 틀: 구성원 문서(기준 분류를 모두 가짐)와 주제 문서(제목이 기준 분류 하나와 같음).
   많으면 구성원이 많은 것부터 NAV_OPEN_MAX개만 펼치고 나머지(구성원이 적은 쪽)는 접는다 */
function navboxesAt(w, k) {
  const e = w.entities[k]; if (!e) return [];
  const self = catAlias(w, norm(e.title)), hits = [];
  for (const d of navDefs(w)) {
    const topic = d.cats.includes(self), members = navMembers(w, d);
    if (!members.length || (!topic && !members.includes(k))) continue;
    hits.push({ d, members, topic });
  }
  hits.sort((a, b) => b.members.length - a.members.length || a.d.title.localeCompare(b.d.title, "ko"));
  hits.forEach((h, i) => { h.open = i < NAV_OPEN_MAX; });
  return hits;
}
/* 예전 방식의 틀: 같은 구성원을 다루는 자동 틀이 이 문서에 보이면 숨긴다 */
function legacyNavboxesAt(w, k, autos) {
  return navboxesFor(w, k).filter(([, nb]) => {
    const ms = (nb.members || []).filter(x => w.entities[x]);
    if (ms.length < 2) return true;
    return !autos.some(h => ms.filter(x => h.members.includes(x)).length >= Math.ceil(ms.length * 0.6));
  });
}
/* 문서 작성 맥락: 이 항목이 속한 틀의 구성원 목록(계산 결과) */
function navPromptBlock(w, key) {
  const hits = navboxesAt(w, key).slice(0, NAV_OPEN_MAX); if (!hits.length) return "";
  return `## 이 항목이 속한 틀 (분류에서 계산한 목록)
위키가 분류로 모은 목록이다. 본문에서 구성원 수, 순서, 몇 번째인지를 말할 때 이 목록과 맞춘다. 목록에 없는 항목을 구성원으로 세지 않는다. 연도를 모르는 항목은 끝에 있다.
${hits.map(h => { const rows = navRows(w, h.d, h.members), all = rows.flatMap(r => r.items); return `### 틀: ${h.d.title} (기준 분류: ${h.d.cats.join(" + ")} · 총 ${all.length}개, 연도순)\n` + all.slice(0, NAV_PROMPT_N).map((it, i) => `${i + 1}. ${it.t}${it.y != null ? ` (${it.y}년)` : ""}${it.k === key ? " ← 이 항목" : ""}${S.pages[it.k] ? "" : " [미작성]"}`).join("\n") + (all.length > NAV_PROMPT_N ? `\n…외 ${all.length - NAV_PROMPT_N}개` : ""); }).join("\n\n")}

`;
}

/* ---------- 화면 ---------- */
function autoNavHtml(w, h, cur) {
  const rows = navRows(w, h.d, h.members);
  const item = it => it.k === cur ? `<li class="me"><b>${esc(it.t)}</b>${it.y != null ? `<small>${esc(String(it.y))}년</small>` : ""}</li>` : `<li>${linkHtml(it.t)}${it.y != null ? `<small>${esc(String(it.y))}년</small>` : ""}</li>`;
  return `<details class="navbox nb-auto" data-nav="${esc(h.d.id)}"${h.open ? " open" : ""}><summary><span class="nb-t">${esc(h.d.title)}</span><span class="nb-n">${h.members.length}</span><span class="nb-tog" aria-hidden="true"></span></summary>
    <div class="nb-body">${rows.map(r => `<div class="nb-row${r.label ? "" : " nb-one"}">${r.label ? `<div class="nb-l">${esc(r.label)}</div>` : ""}<ul>${r.items.map(item).join("")}</ul></div>`).join("")}
    <div class="nb-src">기준 분류 ${h.d.cats.map(c => `<button type="button" class="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join(" + ")}</div></div></details>`;
}
/* 문서 아래쪽의 틀 전부: 자동 틀, 그리고 겹치지 않는 예전 방식의 틀 */
function navboxesHtml(w, k) {
  const autos = navboxesAt(w, k);
  return autos.map(h => autoNavHtml(w, h, k)).join("") + legacyNavboxesAt(w, k, autos).map(([, nb]) => navboxHtml(nb, nb.src === k, k)).join("");
}
/* 분류 목록: 축별 분류와 문서 수, 분류 합치기, 틀 만들기·지우기 */
function categoriesHtml() {
  const w = S.world, st = catStats(w), names = [...st].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ko"));
  const groups = [...CAT_AXES, ""].map(ax => [ax, names.filter(([, s]) => s.axis === ax)]).filter(([, xs]) => xs.length);
  const opts = names.map(([c, s]) => `<option value="${esc(c)}">${esc(c)} (${s.n})</option>`).join("");
  const aliases = Object.entries(w.categoryAliases || {});
  const defs = navDefs(w), off = (w.navDefsOff || []);
  return `<div class="sheet catidx"><div class="crumb"><span>${esc(w.title)}</span><span>분류 목록</span></div>
    <h1 class="t">분류 목록</h1>
    ${names.length ? groups.map(([ax, xs]) => `<h2 class="nf-h">${ax ? esc(ax) : "축 미정"} <span class="note" style="font-weight:400">${xs.length}개</span></h2><div class="cats">${xs.map(([c, s]) => `<button type="button" class="cat" data-cat="${esc(c)}">${esc(c)}</button><span class="src" style="margin:0 10px 0 3px">(${s.n})</span>`).join("")}</div>`).join("") : `<p class="note">아직 분류가 붙은 문서가 없습니다.</p>`}
    <h2 class="nf-h">분류 합치기</h2>
    <p class="note">같은 뜻의 두 분류를 하나로 읽습니다. 문서에 적힌 분류는 고치지 않고, 화면·틀·새 문서를 쓸 때 옛 이름을 새 이름으로 바꿔 읽습니다.</p>
    <div class="row"><select id="cmFrom" class="txt" aria-label="합칠 분류(옛 이름)"><option value="">합칠 분류</option>${opts}</select><span>→</span><select id="cmTo" class="txt" aria-label="남길 분류(새 이름)"><option value="">남길 분류</option>${opts}</select><button type="button" class="btn pri" data-act="cat-merge" ${names.length > 1 ? "" : "disabled"}>합치기</button></div>
    ${aliases.length ? `<ul class="catlist">${aliases.map(([a, b]) => `<li>${esc(a)} → ${esc(catAlias(w, b))} <button type="button" class="btn" data-cat-unmerge="${esc(a)}" style="padding:1px 8px">되돌리기</button></li>`).join("")}</ul>` : ""}
    <h2 class="nf-h">틀</h2>
    <p class="note">틀은 기준 분류를 모두 가진 항목을 모은 목록입니다. 소속과 유형이 함께 붙은 문서, 또는 같은 사건 분류가 붙은 문서가 ${NAV_MIN}개 이상이면 자동으로 생깁니다. 구성원은 볼 때마다 다시 계산합니다.</p>
    ${defs.length ? `<ul class="catlist">${defs.map(d => `<li><b>${esc(d.title)}</b> <span class="src">${d.auto ? "자동" : "직접 만듦"} · ${d.cats.map(esc).join(" + ")} · ${navMembers(w, d).length}개</span> <button type="button" class="btn" data-nav-del="${esc(d.id)}" style="padding:1px 8px">지우기</button></li>`).join("")}</ul>` : `<p class="note">아직 틀이 없습니다.</p>`}
    <div class="row" style="margin-top:8px"><input id="ndTitle" class="txt" placeholder="틀 제목" maxlength="60"><input id="ndCats" class="txt" list="ndList" placeholder="기준 분류 (| 로 구분, 모두 가진 항목)" maxlength="200"><datalist id="ndList">${names.map(([c]) => `<option value="${esc(c)}"></option>`).join("")}</datalist><button type="button" class="btn" data-act="nav-add">틀 만들기</button></div>
    ${off.length ? `<p class="note">지운 자동 틀 ${off.length}개 <button type="button" class="btn" data-act="nav-restore" style="padding:1px 8px">모두 되살리기</button></p>` : ""}</div>`;
}
async function categoryAction(act, a, b) {
  const w = S.world; if (!w) return;
  if (act === "merge") {
    if (!a || !b) { toast("합칠 분류와 남길 분류를 골라 주세요."); return; }
    if (catAlias(w, a) === catAlias(w, b)) { toast("같은 분류입니다."); return; }
    mergeCategory(w, a, b); toast(`「${a}」 분류를 「${catAlias(w, b)}」(으)로 합쳤습니다.`);
  } else if (act === "unmerge") { if (w.categoryAliases) delete w.categoryAliases[a]; }
  else if (act === "add") {
    const cats = [...new Set(String(b || "").split("|").map(x => catAlias(w, catName(x))).filter(Boolean))].slice(0, 4), title = catName(a) || cats.join(" · ");
    if (!cats.length) { toast("기준 분류를 하나 이상 적어 주세요."); return; }
    if (navDefs(w).some(d => navKey(d.cats) === navKey(cats))) { toast("같은 기준 분류의 틀이 이미 있습니다."); return; }
    (w.navDefs ||= []).push({ id: "user:" + Date.now().toString(36), title, cats, split: "decade" });
    w.navDefsOff = (w.navDefsOff || []).filter(x => x !== "auto:" + navKey(cats));
  } else if (act === "del") {
    if (String(a).startsWith("auto:")) { (w.navDefsOff ||= []).includes(a) || w.navDefsOff.push(a); }
    else w.navDefs = (w.navDefs || []).filter(d => d.id !== a);
  } else if (act === "restore") w.navDefsOff = [];
  renderMain();
  try { await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
