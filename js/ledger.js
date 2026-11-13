"use strict";
/* 장부: 생성 응답이 내놓은 구조화된 값을 받아 둘 때의 검사.
   한국어 문장은 파싱하지 않는다. 항목 키와 이름(글자 그대로 포함되는지)만 비교한다. */

/* ---------- 연표 ---------- */
const TIMELINE_PER_PAGE = 2;   // 문서 하나가 연표에 넣을 수 있는 사건 수
/* 글에 이름이 그대로 나온 항목들을 처음 나온 자리 순서로. 같은 자리면 긴 이름이 먼저다 */
function namedIn(w, text) {
  const t = stripMarks(text), hits = [];
  for (const [k, o] of Object.entries(w.entities)) {
    let at = -1, len = 0;
    for (const n of namesOf(o.title)) { const i = t.indexOf(n); if (i >= 0 && (at < 0 || i < at || (i === at && n.length > len))) { at = i; len = n.length; } }
    if (at >= 0) hits.push({ k, at, len });
  }
  return hits.sort((a, b) => a.at - b.at || b.len - a.len).map(x => x.k);
}
/* 연표 항목의 주어가 되는 고유명사. 모델이 about으로 밝힌 것이 사건 문장에 나오면 그것, 아니면 문장에 처음 나오는 기존 항목 이름.
   어느 쪽도 없으면 null(주어 없는 항목) */
function timelineSubject(w, t) {
  const ev = stripMarks(t?.event || ""); if (!ev) return null;
  const about = norm(stripMarks(asText(t.about || "")));
  if (about) {
    const k = kOf(w, about), o = w.entities[k];
    if (o && namesOf(o.title).concat(about.length >= 2 ? [about] : []).some(n => ev.includes(n))) return { k, name: o.title };
    if (!o && about.length >= 2 && ev.includes(about)) return { name: about };
  }
  const k = namedIn(w, ev)[0];
  return k ? { k, name: w.entities[k].title } : null;
}
const sameYearText = (a, b) => { const A = yearNum(a), B = yearNum(b); return isNaN(A) || isNaN(B) ? String(a).trim() === String(b).trim() : A === B; };
/* 이미 연표에 있는 항목 중 연도와 주어가 같은 것. 옛 항목에는 주어 기록이 없으므로 같은 방법으로 그 자리에서 구한다 */
function sameTimelineEntry(w, year, s) {
  return (w.timeline || []).find(x => {
    if (!live(x) || !sameYearText(x.year, year)) return false;
    if (s.k && x.k) return s.k === x.k;
    const xs = x.k ? { k: x.k, name: w.entities[x.k]?.title || x.about || "" } : timelineSubject(w, x);
    if (!xs) return false;
    return s.k && xs.k ? s.k === xs.k : norm(s.name) === norm(xs.name);
  }) || null;
}
/* 생성된 문서가 낸 연표 항목을 받아 둘지 정한다. 받았으면 true */
function acceptTimeline(w, t, src) {
  if (!t || !t.year || !t.event) return false;
  const s = timelineSubject(w, t); if (!s) return false;           // 주어가 되는 고유명사가 없다
  const yr = String(t.year).slice(0, 24);
  if (sameTimelineEntry(w, yr, s)) return false;                    // 같은 해, 같은 대상의 사건이 이미 있다
  const ev = stripMarks(t.event).slice(0, 200), mine = x => x.src === src && x.year === yr && x.event === ev;
  if (w.timeline.some(mine)) return false;
  addTimeline(w, t, src);
  const added = w.timeline.find(mine); if (!added) return false;
  if (s.k) added.k = s.k; else added.about = s.name.slice(0, 60);
  return true;
}
/* 문서 하나가 낸 연표 목록을 받는다. 앞에서부터 TIMELINE_PER_PAGE개까지 */
function acceptPageTimeline(w, list, src) {
  let n = 0;
  for (const t of (Array.isArray(list) ? list : [])) { if (n >= TIMELINE_PER_PAGE) break; if (acceptTimeline(w, t, src)) n++; }
  return n;
}

/* ---------- 연표 날짜 ----------
   새 연표 항목에 month·day가 비었거나 범위를 벗어나면(dateAsk) 그 항목들만 quick 모델에게 한 번 다시 묻는다.
   그래도 받지 못하면 날짜 없이 둔다. 옛 항목(dateAsk 없음)은 묻지 않는다 */
function timelineDatePrompt(w, items) {
  const rows = items.map((t, i) => {
    const p = S.pages[t.src], yd = String(t.year).replace(/[^\d]/g, "");
    const said = p && yd ? pageTexts(p).flatMap(sentencesOf).filter(x => x.includes(yd)).slice(0, 3) : [];
    const evs = (w.events || []).filter(e => (t.k && e.k === t.k) || (e.name && t.event.includes(e.name))).slice(0, 3);
    return `${i + 1}. ${t.year}: ${t.event}${p ? ` (「${p.title}」)` : ""}${said.map(x => `\n   문서의 서술: ${x.slice(0, 200)}`).join("")}${evs.map(e => `\n   사건 장부: 「${e.name}」 ${e.date}`).join("")}`;
  });
  return `## 연표 날짜 정하기
가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 연표 항목에 월과 일이 빠져 있다. 항목마다 month와 day를 숫자로 정한다.
- 사건 장부나 문서의 서술에 날짜가 있으면 그 날짜를 그대로 쓴다. 없으면 사건과 그 해의 흐름에 맞게 하나로 정한다.
- 계절, 초·중·말, '무렵' 같은 모호한 표현은 쓰지 않는다. 이 세계의 기년법에 달이 없는 항목은 month와 day를 빈 문자열로 둔다.${tlDateNote(w)}

${rows.join("\n")}

JSON 객체 하나만 출력: {"dates":[{"i":1,"month":3,"day":14}]}`;
}
async function askTimelineDates(w) {
  const items = (w.timeline || []).filter(t => t.dateAsk && !t.sup).slice(0, 40);
  if (!items.length || !S.sample) return 0;
  let r = null;
  try { r = await callJson("timelineDate", timelineDatePrompt(w, items), { modelTier: "quick" }, { title: w.title + " · 연표 날짜" }); } catch {}
  let n = 0;
  for (const d of (Array.isArray(r?.dates) ? r.dates : [])) {
    const t = items[(parseInt(d?.i, 10) || 0) - 1], md = t && tlMD(d.month, d.day);
    if (md && !tlMD(t.month, t.day)) { Object.assign(t, md); n++; }
  }
  for (const t of items) delete t.dateAsk;   // 한 번만 다시 묻는다. 받지 못한 항목은 날짜 없이 둔다
  sortTimeline(w);
  return n || -1;   // 물어봤으면 0이 아니다(표시를 지웠으니 저장해야 한다)
}
/* 생성 흐름에서 연표를 받은 뒤 부른다. 뒤에서 돌고, 끝나면 저장한다 */
function afterTimeline(w) {
  if (!w || !(w.timeline || []).some(t => t.dateAsk) || !S.sample) return;
  askTimelineDates(w).then(async n => {
    if (!n) return;
    try { await Store.saveWorld(w); } catch {}
    if (S.world === w && S.view?.name === "canon") renderMain();
  }).catch(() => {});
}
/* 사건 장부의 날짜("2015년 11월 4일")에서 연도와 월·일을 읽는다 */
function evYMD(w, text) {
  const t = String(text || ""), h = yearHits(t, w)[0], m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(t);
  return { h: h ? { y: h.y, cal: h.cal } : null, md: m ? tlMD(m[1], m[2]) : null };
}
/* 이 문서(k)가 낸 연표 항목의 날짜가 사건 장부의 같은 사건(항목 키가 같거나 사건 이름이 글자 그대로 들어간) 날짜와 다르면 지적한다 */
function timelineIssues(w, k) {
  const p = S.pages[k]; if (!p || p.editedAt) return [];
  const mine = (w.timeline || []).filter(t => t.src === k && !t.sup && tlMD(t.month, t.day)); if (!mine.length) return [];
  const refs = [...eventRefs(w, k), ...(w.events || []).filter(x => x.src === k)], out = [];
  for (const t of mine) {
    const ty = tlYear(w, t.year), md = tlMD(t.month, t.day);
    for (const e of refs) {
      if (!((t.k && e.k === t.k) || (e.name && t.event.includes(e.name)))) continue;
      const d = evYMD(w, e.date); if (!d.md || !d.h || !ty || d.h.cal !== ty.cal || d.h.y !== ty.y) continue;
      if (d.md.month === md.month && d.md.day === md.day) break;
      const rt = S.pages[e.src]?.title || "?";
      out.push({ claim: `연표: ${tlWhen(t)} ${t.event}`.slice(0, 300), severity: "high",
        conflict: `근거: 「${rt}」의 사건 기록 — 「${e.name}」 ${e.date} · 사건 장부: 같은 사건의 날짜가 이 문서의 연표에는 ${md.month}월 ${md.day}일, 사건 장부에는 ${d.md.month}월 ${d.md.day}일로 적혀 있다. 사건 장부의 날짜에 맞춘다.`.slice(0, 400) });
      break;
    }
  }
  return out;
}

/* ---------- 사건 장부 ----------
   w.events: [{ k(사건 항목 키, 항목이 없으면 이름의 키), name, date, place, nums: [{name, value, unit}], parts(참가 항목 키), result, src, createdAt }]
   문서가 날짜·장소·수치까지 구체적으로 서술한 사건만 생성 응답의 "events"로 받는다.
   처음 기록된 값이 기준이다(refOK와 같은 원칙). 사용자가 직접 고친 문서의 기록은 언제나 기준이다 */
const EVENTS_PER_PAGE = 6;
const evText = (x, n) => norm(stripMarks(asText(x ?? ""))).slice(0, n);
function normEvent(w, x) {
  if (!x || typeof x !== "object") return null;
  const name = evText(x.name || x.title, 80); if (!name) return null;
  const date = evText(x.date, 40), place = evText(x.place, 80);
  const nums = (Array.isArray(x.nums) ? x.nums : []).map(n => n && typeof n === "object" ? { name: evText(n.name, 30), value: evText(n.value, 30), unit: evText(n.unit, 20) } : null).filter(n => n && n.name && n.value).slice(0, 10);
  if (!date || (!place && !nums.length)) return null;   // 날짜와, 장소나 수치가 있어야 구체적인 기록이다
  const parts = [...new Set((Array.isArray(x.participants) ? x.participants : []).map(t => kOf(w, evText(t, 80))).filter(k => w.entities[k]))].slice(0, 12);
  return { k: kOf(w, name), name, date, place, nums, parts, result: evText(x.result, 200) };
}
/* 이 문서(src)의 사건 기록을 새로 받는다. 이 문서가 전에 남긴 기록은 바꿔 끼운다 */
function ingestEvents(w, src, list) {
  if (!Array.isArray(list)) return 0;
  const got = [];
  for (const x of list) {
    const ev = normEvent(w, x); if (!ev) continue;
    const same = got.find(y => y.k === ev.k);
    if (same) { for (const n of ev.nums) if (!same.nums.some(m => numKey(m) === numKey(n))) same.nums.push(n); continue; }
    if (got.length < EVENTS_PER_PAGE) got.push({ ...ev, src, createdAt: Date.now() });
  }
  w.events = (w.events || []).filter(x => x.src !== src).concat(got);
  return got.length;
}
const numKey = n => norm(n.name).replace(/\s/g, "") + "|" + norm(n.unit).replace(/\s/g, "").toLowerCase();
const numVal = v => { const t = String(v).replace(/[\s,]/g, ""); return /^-?\d+(?:\.\d+)?$/.test(t) ? String(+t) : t; };
const eventEdited = x => !!S.pages[x.src]?.editedAt;
/* 기준 순서: 사용자가 직접 고친 문서 > 먼저 쓴 문서 */
const eventRank = (a, b) => (eventEdited(b) - eventEdited(a)) || ((S.pages[a.src]?.createdAt ?? a.createdAt ?? 0) - (S.pages[b.src]?.createdAt ?? b.createdAt ?? 0));
/* 문서 p를 검사할 때 기준이 되는 다른 문서의 사건 기록 */
const eventRefs = (w, k) => (w.events || []).filter(x => x.src !== k && S.pages[x.src] && refOK(x.src, S.pages[k])).sort(eventRank);
const numText = x => x.nums.map(n => `${n.name} ${n.value}${n.unit}`).join("; ");
/* 같은 사건(키가 같은)에서 이름과 단위가 같은 수치의 값이 기준과 다르면 지적한다. 고칠 쪽은 이 문서다 */
function eventIssues(w, k) {
  const p = S.pages[k]; if (!p || p.editedAt) return [];   // 직접 고친 문서는 그 자체가 기준이다
  const mine = (w.events || []).filter(x => x.src === k); if (!mine.length) return [];
  const refs = eventRefs(w, k), out = [];
  for (const m of mine) for (const n of m.nums) {
    let ref = null, rn = null;
    for (const r of refs) { if (r.k !== m.k) continue; const hit = r.nums.find(x => numKey(x) === numKey(n)); if (hit) { ref = r; rn = hit; break; } }
    if (!ref || numVal(rn.value) === numVal(n.value)) continue;
    const rt = S.pages[ref.src].title, val = n.value + n.unit;
    const claim = pageTexts(p).flatMap(sentencesOf).find(s => s.includes(n.value) && (!n.unit || s.includes(n.unit))) || `「${m.name}」의 ${n.name}: ${val}`;
    out.push({ claim: claim.slice(0, 300), severity: "high",
      conflict: `근거: 「${rt}」의 사건 기록 — 「${ref.name}」 ${ref.date} ${rn.name} ${rn.value}${rn.unit} · 사건 장부: 같은 사건의 ${n.name}이(가) 이 문서에는 ${val}, ${eventEdited(ref) ? "사용자가 직접 고친" : "먼저 쓴"} 「${rt}」에는 ${rn.value}${rn.unit}로 적혀 있다. 기준 기록에 맞춘다.`.slice(0, 400) });
  }
  return out;
}
/* 키가 달라 같은 사건인지 코드가 정할 수 없는 후보: 날짜가 겹치고 참가자가 한 명 이상 같다. 판단은 검사 모델에 맡긴다 */
const sameDay = (a, b) => { a = String(a || "").replace(/\s/g, ""); b = String(b || "").replace(/\s/g, ""); return !!a && !!b && (a.includes(b) || b.includes(a)); };
function eventCandidates(w, k) {
  const mine = (w.events || []).filter(x => x.src === k), refs = eventRefs(w, k), out = [];
  for (const m of mine) for (const r of refs) if (r.k !== m.k && sameDay(m.date, r.date) && m.parts.some(x => r.parts.includes(x)) && out.length < 8) out.push([m, r]);
  return out;
}
const cell = t => String(t || "").replace(/\|/g, "/").replace(/\n/g, " ") || "-";
function eventRow(w, x, mark) {
  return `| ${cell(x.name)} | ${cell(x.date)} | ${cell(x.place)} | ${cell(numText(x))} | ${cell(x.parts.map(p => w.entities[p]?.title).filter(Boolean).join(", "))} | ${cell(x.result)} | 「${cell(S.pages[x.src]?.title || w.entities[x.src]?.title || "?")}」${mark || ""} |`;
}
const EVENT_HEAD = "| 사건 | 날짜 | 장소 | 수치 | 참가 | 결과 | 기록한 문서 |\n|---|---|---|---|---|---|---|";
/* 이 문서가 다룰 사건: 이 항목 자체, 이 항목이 참가한 사건, 관련 항목의 사건. 그 사건의 기록은 전부 넣는다 */
function eventLedgerFor(w, key, rel = [], okSrc = null) {
  const near = new Set([key, ...rel]), all = (w.events || []).filter(x => x.src !== key && (!okSrc || okSrc(x.src)));
  const ks = new Set(all.filter(x => near.has(x.k) || x.parts.includes(key)).map(x => x.k));
  const rows = [];
  for (const ek of ks) {
    const list = all.filter(x => x.k === ek).sort(eventRank);
    list.forEach((x, i) => rows.push(eventRow(w, x, (i === 0 ? " (기준)" : "") + (eventEdited(x) ? " [사용자 확정]" : ""))));
  }
  return rows.slice(0, 40);
}
function eventBlock(w, key, rel) {
  const rows = eventLedgerFor(w, key, rel); if (!rows.length) return "";
  return `## 사건 장부 (이 문서가 다룰 수 있는 사건의 확정 기록)
같은 사건을 다룰 때 날짜, 장소, 수치는 '(기준)' 기록을 글자 그대로 따른다. 이 사건의 수치를 새로 적을 때는 장부와 같은 이름과 단위를 쓴다.
${EVENT_HEAD}
${rows.join("\n")}

`;
}
/* 검사용: 이 문서의 기준이 되는 사건 기록과, 같은 사건인지 모델이 판단할 후보 */
function eventCheckBlock(w, key, okSrc) {
  const rows = eventLedgerFor(w, key, (w.events || []).filter(x => x.src === key).map(x => x.k), okSrc);
  const cand = eventCandidates(w, key);
  if (!rows.length && !cand.length) return "";
  return `## 사건 장부 (먼저 기록된 사건)
${rows.length ? `${EVENT_HEAD}\n${rows.join("\n")}\n` : "(없음)\n"}${cand.length ? `
## 같은 사건일 수 있는 기록 (이름이 달라 앱이 정하지 못했다. 날짜가 겹치고 참가자가 같다)
${cand.map(([m, r]) => `- 이 문서: 「${m.name}」 ${m.date}${m.place ? ", " + m.place : ""}${m.nums.length ? ", " + numText(m) : ""}\n  「${S.pages[r.src]?.title || "?"}」: 「${r.name}」 ${r.date}${r.place ? ", " + r.place : ""}${r.nums.length ? ", " + numText(r) : ""}`).join("\n")}
두 기록이 같은 사건을 가리키면 날짜, 장소, 수치가 어긋나는 곳을 지적하고(evidence에는 다른 문서의 기록을 옮긴다), 다른 사건이면 지적하지 않는다.
` : ""}`;
}
const EVENTS_SPEC = `events에는 이 문서가 날짜와 함께 장소나 수치까지 구체적으로 서술한 사건만 0~4개 넣는다. 막연히 언급만 한 사건, 날짜가 없는 사건은 넣지 않는다. name은 사건 항목을 링크했다면 그 제목을 글자 그대로 쓰고, 장부에 이미 있는 사건이면 장부의 사건 이름, 수치 이름, 단위를 똑같이 쓴다. nums의 value에는 단위 없이 값만 쓴다. participants에는 참가한 항목 제목을 글자 그대로 쓴다.`;
const EVENTS_JSON = `"events":[{"name":"사건 이름","date":"날짜(문서에 쓴 그대로)","place":"장소","nums":[{"name":"수치 이름(예: 거리, 수심, 병력, 사상자)","value":"값","unit":"단위"}],"participants":["참가 항목 제목"],"result":"결과 한 문장"}]`;

/* ---------- 용어 정의 ----------
   w.glossary: [{ term, definition, src, confirmed, at, alts?: [{ definition, src, at }] }]
   문서가 새 명명 체계, 번호 체계, 핵심 개념을 처음 정하면 생성 응답의 "terms"로 받는다.
   이미 있는 용어를 다르게 정의한 후보는 자동으로 고르지 않고 alts에 두어 설정 노트에서 사용자가 고른다 */
const GLOSSARY_MAX = 80, GLOSSARY_PROMPT_N = 40;
const termKey = t => norm(stripMarks(t)).normalize("NFKC").toLowerCase().replace(/[\s‘’'“”"「」]/g, "");
const defKey = t => norm(stripMarks(t)).replace(/[\s.。,·]/g, "");
const findTerm = (w, term) => (w.glossary || []).find(g => termKey(g.term) === termKey(term)) || null;
function ingestTerms(w, src, list) {
  if (!Array.isArray(list)) return 0;
  w.glossary ||= []; let n = 0;
  for (const x of list.slice(0, 6)) {
    if (!x || typeof x !== "object") continue;
    const term = evText(x.term, 40), definition = evText(x.definition, 300);
    if (!term || !definition) continue;
    const g = findTerm(w, term);
    if (!g) { if (w.glossary.length < GLOSSARY_MAX) { w.glossary.push({ term, definition, src, confirmed: false, at: Date.now() }); n++; } continue; }
    if (g.src === src && !g.confirmed) { g.definition = definition; continue; }   // 같은 문서가 다시 낸 정의는 바꿔 끼운다
    if (g.confirmed || defKey(g.definition) === defKey(definition)) continue;     // 확정된 정의는 후보를 받지 않는다(어긋난 쓰임은 문서 검사가 잡는다)
    g.alts ||= [];
    const a = g.alts.find(y => y.src === src);
    if (a) a.definition = definition; else if (!g.alts.some(y => defKey(y.definition) === defKey(definition)) && g.alts.length < 4) g.alts.push({ definition, src, at: Date.now() });
  }
  return n;
}
/* 문서가 지워지거나 다시 쓰일 때: 그 문서가 낸 후보는 걷어 내고, 그 문서가 처음 정한 미확정 용어는 후보가 있으면 첫 후보로, 없으면 지운다 */
function purgeTerms(w, src) {
  if (!w.glossary) return;
  for (const g of w.glossary) if (g.alts) { g.alts = g.alts.filter(a => a.src !== src); if (!g.alts.length) delete g.alts; }
  w.glossary = w.glossary.filter(g => {
    if (g.src !== src || g.confirmed) return true;
    if (!g.alts?.length) return false;
    const a = g.alts.shift(); Object.assign(g, { definition: a.definition, src: a.src, at: a.at }); if (!g.alts.length) delete g.alts;
    return true;
  });
}
/* 사용자가 고른다. alt가 -1이면 지금 정의를 그대로 두고 확정, 아니면 그 후보로 바꿔 확정 */
function pickTerm(w, i, alt) {
  const g = w.glossary?.[i]; if (!g) return false;
  const a = alt >= 0 ? g.alts?.[alt] : null; if (alt >= 0 && !a) return false;
  if (a) Object.assign(g, { definition: a.definition, src: a.src });
  g.confirmed = true; delete g.alts;
  return true;
}
const termLine = (w, g) => `- ${g.term}: ${g.definition}${g.confirmed ? " [사용자 확정]" : ""}`;
function glossaryBlock(w, text = null) {
  let list = (w.glossary || []).filter(g => g.definition);
  if (text !== null) list = list.filter(g => text.includes(g.term));   // 검사할 문서에 나온 용어만
  if (!list.length) return "";
  list = [...list.filter(g => g.confirmed), ...list.filter(g => !g.confirmed)].slice(0, GLOSSARY_PROMPT_N);
  return `## 용어 정의 (이 세계의 용어는 이 뜻으로만 쓴다)\n${list.map(g => termLine(w, g)).join("\n")}`;
}
const TERMS_SPEC = `terms에는 이 문서가 처음 정한 명명 체계, 번호 체계, 이 세계의 핵심 개념만 0~3개 넣는다(예: 제식 번호가 개인의 이름인지 대대로 물려받는 칭호인지, 번호를 나라마다 매기는지 전 세계 일련번호인지). definition은 무엇을 가리키고 어떻게 붙는지 한두 문장으로 쓴다. '용어 정의'에 이미 있는 용어는 넣지 않고, 그 정의와 다른 뜻으로 쓰지 않는다. 처음 정한 것이 없으면 빈 배열.`;
const TERMS_JSON = `"terms":[{"term":"용어","definition":"뜻과 붙는 방식"}]`;

/* ---------- 세계 전체 점검 (사용자가 버튼을 눌렀을 때만) ----------
   문서 제목과 한 줄 정의, 문서별 확정 사실, 사건 장부, 용어 정의, 연표를 압축해 한 번 보내고, 문서끼리 서로 모르는 곳을 찾게 한다.
   w.worldCheck = { at, items: [{ id, kind, severity, title, docs, keywords, detail, link, alts, linkBad, fix, status, linked?, batch? }] }
   link: 바로 확정할 기본안(결정된 문장). alts: 성격이 다른 대안 0~2개. linkBad: 다시 받아도 정하지 않은 표현이 남아 바로 연결할 수 없음.
   status: open(아직) · linked(연결 설정을 사용자 확정 설정으로 넣음) · kept(그대로 둠) · fix(문서 고치기를 엶)
   batch: 연결을 확정한 뒤 관련 문서에 일괄로 반영한 결과 { done(고침), none(고칠 곳 없음), failed(실패), manual(사용자가 직접 고친 문서라 직접 확인 필요) } */
const WC_KINDS = { repeat: "서로 모르는 반복", first: "'최초' 주장 충돌", unaware: "영향을 모르는 문서" };
const FIRST_WORDS = ["최초", "처음", "유일"];
const WC_DOCS_MAX = 40, WC_FACTS_PER_DOC = 4, WC_BATCH = ["done", "none", "failed", "manual"];
const wcSure = f => f.src === "user" || !!S.pages[f.src]?.editedAt;
/* 문서 하나(항목 k)의 확정 사실. 사용자가 정한 것과 직접 고친 문서에서 온 것을 먼저 */
function wcFacts(w, k, n) {
  const fs = (w.entities[k]?.facts || []).filter(live);
  return [...fs.filter(wcSure), ...fs.filter(f => !wcSure(f))].slice(0, n).map(f => f.t + (wcSure(f) ? " [사용자 확정]" : ""));
}
const wcPages = w => Object.entries(S.pages).filter(([k]) => w.entities[k]).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
function wcFactBlock(w, keys, n) {
  return keys.map(k => { const fs = wcFacts(w, k, n); return fs.length ? `「${S.pages[k]?.title || w.entities[k].title}」\n${fs.map(t => "  - " + t).join("\n")}` : ""; }).filter(Boolean).join("\n");
}
const WC_LINK_RULES = `- link에는 흩어진 기록을 하나로 잇는 설정을 결정된 한두 문장으로 쓴다. 사용자가 [연결하기]를 누르면 이 문장이 그대로 모든 문서가 지키는 확정 설정이 된다. 'A 또는 B', 'A나 B 중 하나', '~일 수도 있다', '어떤 세력'처럼 정하지 않은 채 남기지 않는다. 가능성이 여럿이면 가장 자연스러운 하나를 link로 정하고 나머지는 alts로 보낸다. first는 주장이 맞도록 범위를 좁히는 설정이어도 된다.
- link와 alts는 관련 문서들이 이미 확정한 출처, 소속, 원인('문서별 확정 사실', '사건 장부', '용어 정의', '사용자 확정 설정')과 충돌하면 안 된다. 문서마다 출처나 소속을 이미 다르게 정해 두었다면 그 기록들이 모두 참으로 남도록 잇는다.
- undecided에는 link에 정하지 않은 표현이 남았다면 그 부분을 글자 그대로 옮긴다. 다 정했으면 빈 배열.
- alts에는 link와 성격이 다른 대안을 0~2개 넣는다. 각각 결정된 한두 문장이다. 마땅한 대안이 없으면 빈 배열.`;
function worldCheckPrompt(w) {
  const pages = wcPages(w);
  const docs = pages.map(([, p]) => `- ${p.title} (${p.type || "?"}): ${(p.summary || "").slice(0, 90)}`).join("\n");
  const facts = wcFactBlock(w, pages.map(([k]) => k), WC_FACTS_PER_DOC).split("\n").slice(0, 400).join("\n");
  const claims = pages.flatMap(([, p]) => pageTexts(p).flatMap(sentencesOf).filter(s => FIRST_WORDS.some(x => s.includes(x))).slice(0, 3).map(s => `- 「${p.title}」: ${s.slice(0, 160)}`)).slice(0, 120).join("\n");
  const evs = [...(w.events || [])].filter(x => S.pages[x.src]).sort(eventRank).map(x => eventRow(w, x, "")).slice(0, 150);
  const tl = timelineOrder((w.timeline || []).filter(live), w).map(t => `- ${tlWhen(t)}: ${t.event}`).join("\n");
  const kept = (w.worldCheck?.items || []).filter(x => x.status === "kept").map(x => `- ${x.title}`).join("\n");
  return `## 세계 전체 점검
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 문서 하나씩 보면 멀쩡하지만 모아 보면 이상한 곳을 찾는다. 문체나 한 문서 안의 모순은 보지 않는다.

찾을 것:
1. repeat: 같은 종류의 사건(침투, 실험, 사고, 습격, 발견 등)이 여러 곳에서 일어났는데 문서끼리 서로를 모르는 것. 세계 차원에서 한 흐름으로 이어져야 자연스러운데 각자 지역 사건으로만 처리된 경우다.
2. first: 어떤 문서의 "최초", "처음", "유일" 주장이 더 이른 시기의 다른 기록과 충돌하는 것.
3. unaware: 다른 문서에 영향을 남겼어야 할 사건(예: 어느 나라에서 출격했다는 공격)을, 영향을 받았어야 할 문서(그 나라의 문서)가 모르는 것.

지적 기준:
- 아래 자료에 실제로 있는 문서와 기록만 근거로 삼는다. 우연히 겹칠 수 있는 평범한 일, 서로 무관해도 자연스러운 일은 지적하지 않는다. 지적할 것이 없는 것이 정상이다. 많아야 8개.
- docs에는 그 패턴을 다룬 문서 제목을 글자 그대로, 빠짐없이 쓴다(많아야 12개).
- keywords에는 이 패턴을 다룬 문서를 본문 검색으로 더 찾을 핵심어 1~3개를 쓴다. 문서 본문에 글자 그대로 나올 짧은 말(사건, 사물, 조직의 이름)이어야 하고, 아무 문서에나 나오는 흔한 말은 쓰지 않는다.
- severity: 세계관의 흐름이나 여러 문서에 영향을 주는 것은 high, 둘 다 참일 수 있는 표현 차이(예: '최초'와 '유일')나 문서 한두 개의 사소한 충돌은 low.
${WC_LINK_RULES}
- fix에는 해당 문서들을 어떻게 고치면 되는지 한 문장으로 쓴다.

## 핵심 규칙
${(w.rules || []).map(r => "- " + r).join("\n") || "(없음)"}

## 사용자 확정 설정
${(w.userCanon || "").trim() || "(없음)"}
${kept ? `\n## 사용자가 그대로 두기로 한 것 (다시 지적하지 않는다)\n${kept}\n` : ""}
## 문서 (쓴 순서, 제목 (유형): 한 줄 정의)
${docs || "(없음)"}

## 문서별 확정 사실 (출처, 소속, 원인을 이미 정한 기록. link와 alts는 이것과 충돌하면 안 된다)
${facts || "(없음)"}

## 문서 속 '최초·처음·유일' 서술
${claims || "(없음)"}

## 사건 장부
${evs.length ? EVENT_HEAD + "\n" + evs.join("\n") : "(없음)"}

${glossaryBlock(w) || "## 용어 정의\n(없음)"}

## 연표
${tl || "(없음)"}

JSON 객체 하나만 출력: {"findings":[{"kind":"repeat, first, unaware 중 하나","severity":"high 또는 low","title":"짧은 제목","docs":["관련 문서 제목"],"keywords":["핵심어"],"detail":"무엇이 왜 이상한지 두세 문장","link":"하나로 잇는 결정된 설정 한두 문장","undecided":[],"alts":["성격이 다른 대안 설정 한두 문장"],"fix":"문서를 고칠 방향 한 문장"}]}
없으면 findings는 빈 배열.`;
}
const wcList = (a, n, max) => [...new Set((Array.isArray(a) ? a : []).map(t => evText(t, n)).filter(Boolean))].slice(0, max);
const wcAlts = (a, link) => wcList(a, 400, 4).filter(t => t !== link).slice(0, 2);
function parseWorldCheck(w, r) {
  const at = Date.now();
  return (Array.isArray(r?.findings) ? r.findings : []).filter(x => x && typeof x === "object").slice(0, 8).map((x, i) => {
    const docs = [...new Set((Array.isArray(x.docs) ? x.docs : []).map(t => kOf(w, evText(t, 80))).filter(k => S.pages[k] && w.entities[k]))].slice(0, 12);
    const link = evText(x.link, 400);
    return { id: at.toString(36) + Math.random().toString(36).slice(2, 6) + i, kind: WC_KINDS[x.kind] ? x.kind : "repeat", severity: x.severity === "low" ? "low" : "high", title: evText(x.title, 80), docs,
      keywords: wcList(x.keywords, 30, 3).filter(t => t.length >= 2), detail: evText(x.detail, 500), link, undecided: link ? wcList(x.undecided, 120, 6) : [], alts: wcAlts(x.alts, link), fix: evText(x.fix, 300), status: "open" };
  }).filter(x => x.title && x.detail && (x.docs.length || x.link));
}
/* 핵심어가 본문에 글자 그대로 들어 있는 문서를 관련 문서에 더한다. 뜻은 판단하지 않는다 */
function wcExpandDocs(w, x) {
  if (!x.keywords?.length) return 0;
  let n = 0;
  for (const [k, p] of wcPages(w)) {
    if (x.docs.length >= WC_DOCS_MAX) break;
    if (x.docs.includes(k)) continue;
    const text = [p.title, ...pageTexts(p)].join("\n");
    if (x.keywords.some(kw => text.includes(kw))) { x.docs.push(k); n++; }
  }
  return n;
}
/* link에 정하지 않은 표현이 남은 결과 하나만 다시 받는 프롬프트 */
function worldCheckRetryPrompt(w, x) {
  const evs = (w.events || []).filter(e => S.pages[e.src] && (x.docs.includes(e.src) || x.docs.includes(e.k) || e.parts.some(p => x.docs.includes(p)))).sort(eventRank).map(e => eventRow(w, e, "")).slice(0, 40);
  return `## 연결 설정 다시 쓰기
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 세계 전체 점검에서 찾은 아래 결과의 연결 설정(link)에 정하지 않은 표현이 남아 있다. 결정된 설정으로 다시 쓴다.

## 점검 결과
- 제목: ${x.title}
- 내용: ${x.detail}
- 지금 link: ${x.link}
- 정하지 않은 표현: ${x.undecided.join(" / ")}

## 규칙
${WC_LINK_RULES}

## 사용자 확정 설정
${(w.userCanon || "").trim() || "(없음)"}

## 관련 문서의 확정 사실
${wcFactBlock(w, x.docs, 10) || "(없음)"}

## 관련 사건 기록
${evs.length ? EVENT_HEAD + "\n" + evs.join("\n") : "(없음)"}

${glossaryBlock(w) || "## 용어 정의\n(없음)"}

JSON 객체 하나만 출력: {"link":"결정된 설정 한두 문장","undecided":[],"alts":["성격이 다른 대안 설정 한두 문장"]}`;
}
async function wcRetryLink(w, x) {
  try {
    const r = await callJson("worldCheck", worldCheckRetryPrompt(w, x), { modelTier: "check" }, { title: w.title + " · 연결 설정 다시 쓰기" });
    const link = evText(r?.link, 400), und = wcList(r?.undecided, 120, 6);
    if (!link || und.length) return false;
    x.link = link; x.undecided = [];
    const alts = wcAlts(r?.alts, link); x.alts = alts.length ? alts : x.alts.filter(t => t !== link);
    return true;
  } catch { return false; }
}
async function runWorldCheck() {
  const w = S.world; if (!w) return;
  if (!S.sample) { toast(ERR.no_sample); return; }
  if (S.wcBusy) return;
  if (!Object.keys(S.pages).length) { toast("점검할 문서가 없습니다."); return; }
  S.wcBusy = w.id; S.wcErr = ""; renderMain();
  try {
    const r = await callJson("worldCheck", worldCheckPrompt(w), { modelTier: "check" }, { title: w.title + " · 세계 전체 점검" });
    if (S.world !== w) return;
    const found = parseWorldCheck(w, r);
    for (const x of found) wcExpandDocs(w, x);
    await Promise.all(found.filter(x => x.undecided.length).map(x => wcRetryLink(w, x)));   // 정하지 않은 link는 그 결과만 한 번 다시 받는다
    for (const x of found) { x.linkBad = !!x.undecided.length; delete x.undecided; }
    if (S.world !== w) return;
    const kept = (w.worldCheck?.items || []).filter(x => x.status !== "open");   // 이미 정한 것은 남긴다
    w.worldCheck = { at: Date.now(), items: [...found, ...kept].slice(0, 30) };
    S.wcAlts = null; S.wcEdit = null;
    await Store.saveWorld(w);
  } catch (err) { S.wcErr = errMsg(err); }
  finally { if (S.wcBusy === w.id) S.wcBusy = null; if (S.world === w && S.view.name === "canon") { renderMain(); document.getElementById("worldCheck")?.scrollIntoView({ block: "start" }); } }
}
/* 연결을 확정한 뒤 관련 문서마다 확정 설정을 반영한다(wcFixDoc: 기존 고치기 흐름).
   사용자가 직접 고친 문서는 고치지 않고 '직접 확인 필요'로 남긴다. keys를 주면 그 문서만 다시 시도한다 */
async function worldCheckBatch(w, x, keys = x.docs) {
  if (S.wcRun || !x.linked) return;
  const b = x.batch ||= { done: [], none: [], failed: [], manual: [] };
  for (const f of WC_BATCH) b[f] ||= [];
  const todo = keys.filter(k => S.pages[k]);
  for (const f of WC_BATCH) b[f] = b[f].filter(k => !todo.includes(k));
  const run = S.wcRun = { id: x.id, n: 0, total: todo.length, cur: "" };
  const show = () => { const el = document.getElementById("wcRun-" + x.id); if (el) el.textContent = `관련 문서에 반영하는 중 ${run.n}/${run.total}${run.cur ? ` · 「${run.cur}」` : ""}`; };
  if (S.world === w && S.view.name === "canon") renderMain();
  try {
    for (const k of todo) {
      const p = S.pages[k];
      if (S.world !== w || !p) { b.failed.push(k); continue; }
      if (p.editedAt) { b.manual.push(k); run.n++; continue; }
      run.cur = p.title; show();
      let res = "failed";
      try { res = await wcFixDoc(w, k, x); } catch { res = "failed"; }
      b[WC_BATCH.includes(res) ? res : "failed"].push(k);
      run.n++; show();
    }
  } finally { if (S.wcRun === run) S.wcRun = null; }
  if (S.world !== w) return;
  try { await Store.saveWorld(w); } catch {}
  if (S.view.name === "canon") { renderMain(); document.getElementById("wc-" + x.id)?.scrollIntoView({ block: "center" }); }
  toast(`관련 문서 ${todo.length}개 중 ${b.done.length}개를 고쳤습니다.${b.failed.length ? ` 실패 ${b.failed.length}개는 다시 시도할 수 있습니다.` : ""}${b.manual.length ? ` 직접 고친 문서 ${b.manual.length}개는 직접 확인해 주세요.` : ""}`);
}
/* 제안 하나에 대한 사용자의 선택. arg: fix면 문서 키, alt면 대안 번호, edit면 사용자가 고친 문장 */
async function worldCheckAction(id, what, arg) {
  const w = S.world, x = w?.worldCheck?.items?.find(y => y.id === id); if (!x) return;
  S.wcFocus = id;   // 다시 그려도 이 제안이 접힌 목록 안에 숨지 않게
  if (what === "link" || what === "alt" || what === "edit") {
    if (S.wcRun) { toast("다른 연결을 관련 문서에 반영하는 중입니다. 끝난 뒤 다시 눌러 주세요."); return; }
    const text = evText(what === "link" ? (x.linkBad ? "" : x.link) : what === "alt" ? x.alts?.[arg] : arg, 400);
    if (!text) { if (what === "edit") toast("연결할 설정 문장을 적어 주세요."); return; }
    const uc = (w.userCanon || "").trim();
    if (!uc.includes(text)) w.userCanon = (uc ? uc + "\n" : "") + "- " + text;
    x.status = "linked"; x.linked = text; S.wcAlts = null; S.wcEdit = null;
    renderMain(); document.getElementById("wc-" + id)?.scrollIntoView({ block: "center" });
    try { await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); return; }
    toast("연결 설정을 사용자 확정 설정에 넣었습니다. 관련 문서에 반영합니다.");
    await worldCheckBatch(w, x);
    return;
  }
  if (what === "retry") { if (x.status === "linked" && x.batch?.failed?.length) await worldCheckBatch(w, x, x.batch.failed.slice()); return; }
  if (what === "keep") x.status = "kept";
  else if (what === "fix") {
    const p = S.pages[arg]; if (!p || !x.docs.includes(arg)) return;
    if (S.gen && S.gen.key === arg) { toast("이 문서를 작성하는 중입니다."); return; }
    if (x.status === "open") x.status = "fix";
    try { await Store.saveWorld(w); } catch {}
    const others = x.docs.filter(k => k !== arg).slice(0, 12).map(k => `「${S.pages[k]?.title || w.entities[k]?.title}」`).join(", ");
    const items = [{ claim: `세계 전체 점검: ${x.title}`, conflict: `${x.detail}${others ? ` 함께 볼 문서: ${others}.` : ""}${x.linked ? ` 확정한 설정: ${x.linked}` : ""} 고칠 방향: ${x.fix || x.link}`, severity: "high" }];
    S.fixv = { key: arg, items, sel: new Set([0]), phase: "pick", edits: [], note: "", err: "", skipped: 0 };
    S.view = { name: "fix", key: arg }; renderAll(); window.scrollTo({ top: 0 });
    runFixBatch();
    return;
  } else if (what === "reopen") x.status = "open";
  renderMain(); document.getElementById("wc-" + id)?.scrollIntoView({ block: "center" });
  try { await Store.saveWorld(w); toast("저장했습니다."); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
