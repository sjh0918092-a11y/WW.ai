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
   문서 제목과 한 줄 정의, 사건 장부, 용어 정의, 연표를 압축해 한 번 보내고, 문서끼리 서로 모르는 곳을 찾게 한다.
   결과는 고치지 않고 제안으로만 둔다: w.worldCheck = { at, items: [{ id, kind, title, docs, detail, link, fix, status }] }
   status: open(아직) · linked(연결하는 설정을 사용자 확정 설정으로 넣음) · kept(그대로 둠) · fix(문서 고치기를 엶) */
const WC_KINDS = { repeat: "서로 모르는 반복", first: "'최초' 주장 충돌", unaware: "영향을 모르는 문서" };
const FIRST_WORDS = ["최초", "처음", "유일"];
function worldCheckPrompt(w) {
  const pages = Object.entries(S.pages).filter(([k]) => w.entities[k]).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  const docs = pages.map(([, p]) => `- ${p.title} (${p.type || "?"}): ${(p.summary || "").slice(0, 90)}`).join("\n");
  const claims = pages.flatMap(([, p]) => pageTexts(p).flatMap(sentencesOf).filter(s => FIRST_WORDS.some(x => s.includes(x))).slice(0, 3).map(s => `- 「${p.title}」: ${s.slice(0, 160)}`)).slice(0, 120).join("\n");
  const evs = [...(w.events || [])].filter(x => S.pages[x.src]).sort(eventRank).map(x => eventRow(w, x, "")).slice(0, 150);
  const tl = (w.timeline || []).filter(live).map(t => `- ${t.year}: ${t.event}`).join("\n");
  const kept = (w.worldCheck?.items || []).filter(x => x.status === "kept").map(x => `- ${x.title}`).join("\n");
  return `## 세계 전체 점검
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 문서 하나씩 보면 멀쩡하지만 모아 보면 이상한 곳을 찾는다. 문체나 한 문서 안의 모순은 보지 않는다.

찾을 것:
1. repeat: 같은 종류의 사건(침투, 실험, 사고, 습격, 발견 등)이 여러 곳에서 일어났는데 문서끼리 서로를 모르는 것. 세계 차원에서 한 흐름으로 이어져야 자연스러운데 각자 지역 사건으로만 처리된 경우다.
2. first: 어떤 문서의 "최초", "처음", "유일" 주장이 더 이른 시기의 다른 기록과 충돌하는 것.
3. unaware: 다른 문서에 영향을 남겼어야 할 사건(예: 어느 나라에서 출격했다는 공격)을, 영향을 받았어야 할 문서(그 나라의 문서)가 모르는 것.

지적 기준:
- 아래 자료에 실제로 있는 문서와 기록만 근거로 삼는다. docs에는 관련 문서 제목을 글자 그대로 쓴다.
- 우연히 겹칠 수 있는 평범한 일, 서로 무관해도 자연스러운 일은 지적하지 않는다. 지적할 것이 없는 것이 정상이다. 많아야 8개.
- link에는 흩어진 기록을 하나로 잇는 설정 한두 문장을 쓴다(이 문장은 사용자가 고르면 모든 문서가 지키는 확정 설정이 된다). first는 주장이 맞도록 범위를 좁히는 설정이어도 된다.
- fix에는 해당 문서들을 어떻게 고치면 되는지 한 문장으로 쓴다.

## 핵심 규칙
${(w.rules || []).map(r => "- " + r).join("\n") || "(없음)"}

## 사용자 확정 설정
${(w.userCanon || "").trim() || "(없음)"}
${kept ? `\n## 사용자가 그대로 두기로 한 것 (다시 지적하지 않는다)\n${kept}\n` : ""}
## 문서 (쓴 순서, 제목 (유형): 한 줄 정의)
${docs || "(없음)"}

## 문서 속 '최초·처음·유일' 서술
${claims || "(없음)"}

## 사건 장부
${evs.length ? EVENT_HEAD + "\n" + evs.join("\n") : "(없음)"}

${glossaryBlock(w) || "## 용어 정의\n(없음)"}

## 연표
${tl || "(없음)"}

JSON 객체 하나만 출력: {"findings":[{"kind":"repeat, first, unaware 중 하나","title":"짧은 제목","docs":["관련 문서 제목"],"detail":"무엇이 왜 이상한지 두세 문장","link":"하나로 잇는 설정 한두 문장","fix":"문서를 고칠 방향 한 문장"}]}
없으면 findings는 빈 배열.`;
}
function parseWorldCheck(w, r) {
  const at = Date.now();
  return (Array.isArray(r?.findings) ? r.findings : []).filter(x => x && typeof x === "object").slice(0, 8).map((x, i) => {
    const docs = [...new Set((Array.isArray(x.docs) ? x.docs : []).map(t => kOf(w, evText(t, 80))).filter(k => S.pages[k] && w.entities[k]))].slice(0, 8);
    return { id: at.toString(36) + i, kind: WC_KINDS[x.kind] ? x.kind : "repeat", title: evText(x.title, 80), docs, detail: evText(x.detail, 500), link: evText(x.link, 400), fix: evText(x.fix, 300), status: "open" };
  }).filter(x => x.title && x.detail && (x.docs.length || x.link));
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
    const kept = (w.worldCheck?.items || []).filter(x => x.status !== "open");   // 이미 정한 것은 남긴다
    w.worldCheck = { at: Date.now(), items: [...parseWorldCheck(w, r), ...kept].slice(0, 30) };
    await Store.saveWorld(w);
  } catch (err) { S.wcErr = errMsg(err); }
  finally { if (S.wcBusy === w.id) S.wcBusy = null; if (S.world === w && S.view.name === "canon") { renderMain(); document.getElementById("worldCheck")?.scrollIntoView({ block: "start" }); } }
}
/* 제안 하나에 대한 사용자의 선택 */
async function worldCheckAction(id, what, docKey) {
  const w = S.world, x = w?.worldCheck?.items?.find(y => y.id === id); if (!x) return;
  if (what === "link") {
    if (!x.link) return;
    const uc = (w.userCanon || "").trim();
    if (!uc.includes(x.link)) w.userCanon = (uc ? uc + "\n" : "") + "- " + x.link;
    x.status = "linked";
  } else if (what === "keep") x.status = "kept";
  else if (what === "fix") {
    const p = S.pages[docKey]; if (!p || !x.docs.includes(docKey)) return;
    if (S.gen && S.gen.key === docKey) { toast("이 문서를 작성하는 중입니다."); return; }
    x.status = "fix";
    try { await Store.saveWorld(w); } catch {}
    const others = x.docs.filter(k => k !== docKey).map(k => `「${S.pages[k]?.title || w.entities[k]?.title}」`).join(", ");
    const items = [{ claim: `세계 전체 점검: ${x.title}`, conflict: `${x.detail}${others ? ` 함께 볼 문서: ${others}.` : ""} 고칠 방향: ${x.fix || x.link}`, severity: "high" }];
    S.fixv = { key: docKey, items, sel: new Set([0]), phase: "pick", edits: [], note: "", err: "", skipped: 0 };
    S.view = { name: "fix", key: docKey }; renderAll(); window.scrollTo({ top: 0 });
    runFixBatch();
    return;
  } else if (what === "reopen") x.status = "open";
  renderMain(); document.getElementById("wc-" + id)?.scrollIntoView({ block: "center" });
  try { await Store.saveWorld(w); toast(what === "link" ? "연결하는 설정을 사용자 확정 설정에 넣었습니다. 이후 작성하는 문서부터 반영됩니다." : "저장했습니다."); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
