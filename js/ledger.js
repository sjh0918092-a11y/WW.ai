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
