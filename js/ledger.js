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
function sameTimelineEntry(w, year, s, entry = null) {
  return (w.timeline || []).find(x => {
    if (!live(x) || !sameYearText(x.year, year)) return false;
    if (entry && sameTimelineOccurrence(w, x, entry)) return true;
    if (s.k && x.k) return s.k === x.k;
    const xs = x.k ? { k: x.k, name: w.entities[x.k]?.title || x.about || "" } : timelineSubject(w, x);
    if (!xs) return false;
    return s.k && xs.k ? s.k === xs.k : norm(s.name) === norm(xs.name);
  }) || null;
}
/* 날짜와 장부 사건이 같은 발생 기록만 합친다. 후속 행위나 귀속이 애매한 서술은 남긴다. */
function sameTimelineOccurrence(w, a, b) {
  if ([a, b].some(t => /[~～∼–—-]|\d\s*년?\s*(?:대|경|무렵|전후|이전|이후)/.test(String(t.year)))) return false;
  const A = tlYear(w, a.year), B = tlYear(w, b.year), am = tlMD(a.month, a.day), bm = tlMD(b.month, b.day);
  if (!A || !B || A.y !== B.y || A.cal !== B.cal || !am || !bm || am.month !== bm.month || am.day !== bm.day) return false;
  const occurrence = t => {
    const text = stripMarks(t.event || "");
    if (/여파|계기|이후|영향|조사|기념|추모|(?:발생한|발발한|일어난)\s*(?:뒤|후)/.test(text)) return [];
    const happens = /^(?:이|가|을|를)?\s*(?:발생(?:했|하다|한다|하며)|발발(?:했|하다|한다)|일어(?:났|나다|나며)|일으(?:켰|키다|킨다|키며))/;
    return [...new Set((w.events || []).filter(e => {
      const at = e.name ? text.indexOf(e.name) : -1;
      if (at < 0 && t.k !== e.k) return false;
      const tail = at < 0 ? text : text.slice(at + e.name.length);
      return happens.test(tail) || (/^로\s/.test(tail) && /최초로?\s*관측(?:되|됐)/.test(tail));
    }).map(e => e.k))];
  };
  const ak = occurrence(a), bk = occurrence(b);
  if (ak.length === 1 && bk.length === 1 && ak[0] === bk[0]) return true;
  const an = namedTimelineOccurrence(w, a), bn = namedTimelineOccurrence(w, b);
  if (an.length === 1 && bn.length === 1 && an[0] === bn[0]) return true;
  const ai = pipelineTimelineOccurrence(w, a), bi = pipelineTimelineOccurrence(w, b);
  return !!(ai && bi && ai.key === bi.key && ai.places.some(p => bi.places.includes(p)));
}
/* 장부에 없어도 이름이 명시된 같은 조약·작전의 체결·서명·개시는 확인할 수 있다. */
function namedTimelineOccurrence(w, t) {
  const text = norm(stripMarks(t.event || ""));
  if (/여파|계기|이후|영향|기념|추모|조사|거부|준비|계획|않|아니/.test(text)) return [];
  const names = new Set([
    ...(w.events || []).map(e => e.name).filter(Boolean),
    ...Object.values(w.entities).map(e => e.title).filter(n => /조약|협정|작전/.test(n)),
    ...[...text.matchAll(/['"‘“「『]([^'"’”」』]{4,80}(?:조약|협정|작전))['"’”」』]/g)].map(m => m[1]),
    ...[...text.matchAll(/제\d+차\s*[가-힣A-Za-z0-9·]+(?:\s+[가-힣A-Za-z0-9·]+){0,5}?(?:조약|협정|작전)/g)].map(m => m[0])
  ]);
  return [...new Set([...names].filter(name => {
    const at = text.indexOf(name); if (at < 0) return false;
    const tail = text.slice(at + name.length).replace(/^['"’”」』)]+\s*/, "");
    return /^(?:(?:이|가|을|를|에)\s*)?(?:체결(?:되|됐|하)|서명(?:하|했)|개시(?:되|하|했)|실시(?:되|하|했)|시작(?:되|하|했))/.test(tail);
  }).map(norm))];
}
/* 이름 없는 배관 파괴는 확정된 동일 인물(본명·별칭), 같은 기지·대상·수치까지 모두 맞아야 합친다. */
function pipelineTimelineOccurrence(w, t) {
  const text = stripMarks(t.event || "");
  if (/여파|계기|이후|계획|시도|훈련|복구|교체|않|아니/.test(text) || !/영양액\s*(?:주입\s*)?(?:파이프라인|배관)(?:을|를)\s*파괴(?:하여|해|하|했)/.test(text)) return null;
  const amounts = [...new Set([...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*톤/g)].map(m => String(Number(m[1].replace(/,/g, "")))))];
  if (amounts.length !== 1) return null;
  const actors = [];
  for (const [k, e] of Object.entries(w.entities)) {
    if (e.type !== "인물") continue;
    const names = namesOf(e.title).concat((S.pages[k]?.infobox || []).filter(r => /^(?:본명|성명|이름|코드명|호출부호|암호명|별칭|가명)$/.test(r.label)).flatMap(r => namesOf(stripMarks(r.value))));
    if (names.some(name => {
      const at = text.indexOf(name); if (at < 0 || (at && /[\p{L}\p{N}_]/u.test(text[at - 1]))) return false;
      return /^(?:은|는|이|가)(?=\s|$)/.test(text.slice(at + name.length));
    })) actors.push(k);
  }
  if (actors.length !== 1) return null;
  const places = [...new Set([...text.matchAll(/[가-힣A-Za-z0-9·]{2,20}\s*해군기지/g)].map(m => norm(m[0])))];
  return places.length ? { key: JSON.stringify([actors[0], "영양액 배관 파괴", amounts[0]]), places } : null;
}
/* 옛 연표 정리. 원안과 직접 수정한 출처를 먼저 고르고, 결과의 표시 순서는 보존한다. */
function dedupeTimeline(w) {
  if (w.timelineDedupeV === 3) return false;
  const list = w.timeline || [], rank = t => t.src === "seed" || t.src === "user" ? 0 : S.pages[t.src]?.editedAt ? 1 : 2;
  if (w.calendars?.length === 1) {
    const years = list.map(t => normTimelineYear(w, t.year));
    list.forEach((t, i) => { t.year = years[i]; });
  }
  const kept = [], removed = new Set();
  for (const t of [...list].sort((a, b) => rank(a) - rank(b))) {
    if (live(t) && kept.some(x => live(x) && sameTimelineOccurrence(w, x, t))) removed.add(t);
    else kept.push(t);
  }
  w.timeline = list.filter(t => !removed.has(t)); w.timelineDedupeV = 3;
  return true;   // 중복이 없어도 한 번 검사했다는 표시를 저장한다
}
/* 기존 설정 검사에 실을 날짜가 같은 쌍. 코드는 후보만 고르고 동일 사건인지는 모델이 정한다. */
const timelineMatchStamp = t => JSON.stringify(t);
function timelineMatchPairs(w, key) {
  if (!w.stage || isStory(w) || S.pages[key]?.editedAt) return [];
  const list = (w.timeline || []).filter(live), pairs = [];
  for (const drop of list.filter(t => t.src === key)) {
    const d = tlYear(w, drop.year), dm = tlMD(drop.month, drop.day);
    if (!d || !dm) continue;
    for (const keep of list.filter(t => t.src !== key && refOK(t.src, S.pages[key]))) {
      const k = tlYear(w, keep.year), km = tlMD(keep.month, keep.day);
      if (k && km && k.cal === d.cal && k.y === d.y && km.month === dm.month && km.day === dm.day)
        pairs.push({ keep, drop, a: timelineMatchStamp(keep), b: timelineMatchStamp(drop) });
    }
  }
  return pairs;
}
/* 번호는 요청 당시 객체에만 대응한다. 응답이 없거나 대조 중 기록이 바뀌면 원본을 보존한다. */
function applyTimelineMatches(w, pairs, result) {
  if (!Array.isArray(result?.issues) || !Array.isArray(result?.timelineSame)) return false;
  const removed = new Set();
  for (const n of result.timelineSame) {
    const pair = Number.isInteger(n) && n > 0 ? pairs[n - 1] : null;
    if (!pair || !w.timeline.includes(pair.keep) || !w.timeline.includes(pair.drop)) continue;
    if (timelineMatchStamp(pair.keep) !== pair.a || timelineMatchStamp(pair.drop) !== pair.b) continue;
    removed.add(pair.drop);
  }
  if (!removed.size) return false;
  w.timeline = w.timeline.filter(t => !removed.has(t));
  return true;
}
/* 생성된 문서가 낸 연표 항목을 받아 둘지 정한다. 받았으면 true */
function acceptTimeline(w, t, src) {
  if (!t || !t.year || !t.event) return false;
  t = { ...t, year: normTimelineYear(w, t.year) };
  const s = timelineSubject(w, t); if (!s) return false;           // 주어가 되는 고유명사가 없다
  const yr = String(t.year).slice(0, 24);
  if (sameTimelineEntry(w, yr, s, t)) return false;                 // 같은 대상 또는 날짜까지 같은 사건의 발생
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
async function askTimelineDates(w, opts = {}) {
  const items = (w.timeline || []).filter(t => t.dateAsk && !t.sup).slice(0, 40);
  if (!items.length || !S.sample) return 0;
  let r = null;
  try { r = await callJson("timelineDate", timelineDatePrompt(w, items), { modelTier: "quick", ...opts }, { title: w.title + " · 연표 날짜" }); } catch {}
  let n = 0;
  for (const d of (Array.isArray(r?.dates) ? r.dates : [])) {
    const t = items[(parseInt(d?.i, 10) || 0) - 1], md = t && tlMD(d.month, d.day);
    if (md && !tlMD(t.month, t.day)) { Object.assign(t, md); n++; }
  }
  for (const t of items) delete t.dateAsk;   // 한 번만 다시 묻는다. 받지 못한 항목은 날짜 없이 둔다
  sortTimeline(w);
  return n || -1;   // 물어봤으면 0이 아니다(표시를 지웠으니 저장해야 한다)
}
/* ---------- 연표 점검 ----------
   연표 항목끼리, 또는 핵심 규칙과 함께 성립하지 않는 곳(같은 대상의 나이·복무 기간·생사·순서)을 찾아 고친다.
   세계관을 만들 때 원안 연표에 한 번, 설정 노트의 [연표 점검] 버튼으로 다시. 사용자가 고친 항목은 바꾸지 않는다.
   고친 항목에는 t.fix(이유와 이전 값)를 남겨 설정 노트에 보인다 */
const TL_CHECK_MAX = 80;
const tlSrcLabel = (w, t) => t.src === "seed" ? "원안" : t.src === "user" ? "사용자 수정" : t.ch ? `${t.ch}장` : `「${w.entities[t.src]?.title || "?"}」`;
function timelineCheckPrompt(w, items) {
  const rules = (w.rules || []).map(r => "- " + r).join("\n") || "- (없음)";
  return `## 연표 점검
가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 연표를 핵심 규칙과 맞춰 본다.

## 세계관 원안
${w.seed || "(없음)"}

## 핵심 규칙
${rules}
${w.userCanon ? `\n## 사용자 확정 설정\n${w.userCanon}\n` : ""}
## 연표 (번호. 날짜: 사건 · 출처)
${items.map((t, i) => `${i + 1}. ${tlWhen(t)}: ${t.event} · ${tlSrcLabel(w, t)}`).join("\n")}

## 할 일
- 같은 대상(인물, 조직, 물건)이 나오는 항목들을 모아, 핵심 규칙과 함께 성립하는지 본다. 나이 제한, 활동·복무 기간, 생사, 먼저 있어야 할 일의 순서를 계산한다. 예: 규칙상 활동할 수 있는 기간이 몇 년뿐인데 같은 대상의 첫 활동과 마지막 활동이 그보다 길게 떨어져 있으면 성립하지 않는다.
- 출생 연도가 없어도, 규칙이 허용하는 어떤 출생 연도로도 두 항목을 함께 맞출 수 없으면 성립하지 않는 것이다.
- 성립하지 않는 곳만 고친다. 핵심 규칙과 사용자 확정 설정은 바꾸지 않고 연표 쪽을 고친다. 출처가 '사용자 수정'인 항목은 고치지 않는다.
- 고칠 때는 가장 적게 바꾼다. 사건의 연도·날짜를 옮기거나, 사건 문장에서 그 대상을 맞는 대상으로 바꾼다. 실제 역사 사건에 묶인 항목(그 사건의 연도가 정해진 것)은 연도를 옮기지 말고 다른 쪽 항목을 고친다. 고친 뒤에도 다른 항목과 새로 어긋나지 않게 한다.
- 시점이나 해석으로 함께 성립할 수 있으면 고치지 않는다. 고칠 것이 없는 것이 정상이다.${tlDateNote(w)}

JSON 객체 하나만 출력: {"fixes":[{"i":1,"year":"연도(원래 표기 방식대로)","month":10,"day":22,"event":"고친 사건 문장(바꾸지 않으면 원문 그대로)","why":"무엇이 어떤 규칙과 맞지 않아 어떻게 고쳤는지 한 문장"}]}`;
}
async function checkTimeline(w, opts = {}) {
  const items = (w.timeline || []).filter(live).slice(0, TL_CHECK_MAX);
  if (!items.length || !S.sample) return 0;
  const r = await callJson("timelineCheck", timelineCheckPrompt(w, items), { modelTier: "check", ...opts }, { title: w.title + " · 연표 점검" });
  let n = 0;
  for (const f of (Array.isArray(r?.fixes) ? r.fixes : [])) {
    const t = items[(parseInt(f?.i, 10) || 0) - 1]; if (!t || t.src === "user") continue;
    const year = String(f.year ?? "").trim() ? normTimelineYear(w, String(f.year).trim()) : t.year;
    const event = stripMarks(String(f.event || "")).trim().slice(0, 200) || t.event;
    const md = tlMD(f.month, f.day) || (year === t.year ? tlMD(t.month, t.day) : null);
    if (!tlYear(w, year)) continue;
    const before = `${tlWhen(t)}: ${t.event}`;
    if (year === t.year && event === t.event && md?.month === t.month && md?.day === t.day) continue;
    t.year = year; t.event = event; delete t.month; delete t.day; delete t.dateAsk;
    if (md) Object.assign(t, md); else if (tlNeedsDate(w, year)) t.dateAsk = 1;
    t.fix = { at: Date.now(), why: String(f.why || "").slice(0, 300), before: before.slice(0, 260) };
    n++;
  }
  sortTimeline(w);
  w.timelineCheck = { at: Date.now(), fixed: n };
  return n;
}
/* 세계관을 만든 직후: 실패해도 세계관 만들기는 계속하고, 설정 노트에 실패를 보인다 */
async function checkTimelineAtCreate(w, opts = {}) {
  try { return await checkTimeline(w, opts); }
  catch (err) { w.timelineCheck = { at: Date.now(), failed: String(err?.code || err?.message || "오류").slice(0, 80) }; return 0; }
}
/* 설정 노트의 [연표 점검] 버튼 */
async function runTimelineCheck() {
  const w = S.world; if (!w) return;
  if (!S.sample) { toast(ERR.no_sample); return; }
  if (S.tlChecking) return;
  S.tlChecking = true; renderMain();
  try {
    const n = await checkTimeline(w);
    await Store.saveWorld(w);
    afterTimeline(w);
    toast(n ? `연표 ${n}곳을 고쳤습니다. 고친 항목에 이유를 표시했습니다. 이미 쓴 문서는 다시 쓰지 않습니다.` : "핵심 규칙과 어긋나는 연표 항목이 없습니다.");
  } catch (err) { toast("연표를 점검하지 못했습니다. " + errMsg(err)); }
  finally { S.tlChecking = false; if (S.world === w) renderMain(); }
}
/* 설정 노트의 연표 칸을 읽는다. 바꾼 항목은 사용자 수정(src "user")이 되어 작성과 검사의 기준이 되고, 사건 칸을 비우면 지운다 */
function readTimelineForm(w) {
  if (!document.querySelector("[data-tl-ev]")) return;
  const rows = [...document.querySelectorAll("[data-tl-ev]")];
  const val = (i, f) => (document.querySelector(`[data-tl-${f}="${i}"]`)?.value ?? "").trim();
  const drop = new Set(), now = Date.now();
  for (const el of rows) {
    const i = el.dataset.tlEv, event = stripMarks(el.value).replace(/\s+/g, " ").trim().slice(0, 200), yr = val(i, "y"), mo = val(i, "m"), dy = val(i, "d");
    const md = tlMD(mo, dy);
    if (i.startsWith("n")) {   // 새 줄
      if (!event || !yr) continue;
      const x = { year: normTimelineYear(w, yr), event, src: "user", userAt: now }; if (md) Object.assign(x, md);
      w.timeline.push(x); continue;
    }
    const t = w.timeline[+i]; if (!t || t.sup) continue;
    if (!event) { drop.add(t); continue; }
    const year = yr ? normTimelineYear(w, yr) : t.year;
    const same = year === t.year && event === t.event && (md?.month ?? null) === (tlMD(t.month, t.day)?.month ?? null) && (md?.day ?? null) === (tlMD(t.month, t.day)?.day ?? null);
    if (same) continue;
    if (t.src !== "user") t.from = t.src;
    Object.assign(t, { year, event, src: "user", userAt: now }); delete t.month; delete t.day; delete t.dateAsk; delete t.fix;
    if (md) Object.assign(t, md);
  }
  w.timeline = timelineOrder(w.timeline.filter(t => !drop.has(t)), w);
}
/* 설정 노트의 연표 표: 고칠 수 있는 칸과 출처·점검 표시 */
function timelineEditHtml(w) {
  const src = t => t.sup ? ` <span class="src">· 「${esc(w.entities[t.sup.by]?.title || "?")}」 수정으로 대체됨</span>`
    : t.src === "user" ? ` <span class="src">· 사용자 수정${t.from && w.entities[t.from] ? ` (원래 「${esc(w.entities[t.from].title)}」)` : t.from === "seed" ? " (원래 원안)" : ""}</span>`
    : t.src && t.src !== "seed" && w.entities[t.src] ? ` <span class="src">· ${linkHtml(w.entities[t.src].title)}</span>` : t.ch ? ` <span class="src">· ${t.ch}장</span>` : t.src === "seed" ? ` <span class="src">· 원안</span>` : "";
  const fix = t => t.fix ? `<div class="note">연표 점검으로 고침: ${esc(t.fix.why || "규칙과 맞지 않음")} (이전: ${esc(t.fix.before)})</div>` : "";
  const date = (i, t) => `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><input data-tl-y="${i}" value="${esc(String(t?.year ?? ""))}" placeholder="연도" aria-label="연도" style="width:6.5em"><input data-tl-m="${i}" value="${esc(String(t ? tlMD(t.month, t.day)?.month ?? "" : ""))}" aria-label="월" style="width:3em">월<input data-tl-d="${i}" value="${esc(String(t ? tlMD(t.month, t.day)?.day ?? "" : ""))}" aria-label="일" style="width:3em">일</div>`;
  const row = (t, i) => t.sup ? `<tr><td>${esc(tlWhen(t))} · <del>${esc(t.event)}</del>${src(t)}</td></tr>`
    : `<tr><td>${date(i, t)}<input data-tl-ev="${i}" value="${esc(t.event)}" aria-label="사건" style="width:100%;box-sizing:border-box;margin-top:4px">${src(t)}${fix(t)}</td></tr>`;
  const blank = j => `<tr><td>${date("n" + j, null)}<input data-tl-ev="n${j}" placeholder="새 사건 (비워 두면 추가하지 않음)" aria-label="새 사건" style="width:100%;box-sizing:border-box;margin-top:4px"></td></tr>`;
  const st = w.timelineCheck, stat = !st ? "" : st.failed ? `<span class="note">세계관을 만들 때 연표 점검에 실패했습니다(${esc(st.failed)}). 버튼으로 다시 점검할 수 있습니다.</span>` : `<span class="note">마지막 점검: ${new Date(st.at).toLocaleString()} · 고친 항목 ${st.fixed}개</span>`;
  return `<h2>연표</h2>
    <p class="note">칸을 고치고 '설정 저장'을 누르면 사용자 수정 항목이 되어 이후 작성·검사의 기준이 됩니다. 사건 칸을 비우면 그 항목을 지웁니다.</p>
    <div style="overflow-x:auto"><table class="tl tl-edit">${timelineOrder(w.timeline, w).map(t => row(t, w.timeline.indexOf(t))).join("")}${blank(0)}${blank(1)}</table></div>
    <div class="row"><button type="button" class="btn pri" data-act="save-canon">설정 저장</button><button type="button" class="btn" data-act="timeline-check" ${!S.sample || S.tlChecking ? "disabled" : ""}>${S.tlChecking ? "연표 점검 중…" : "연표 점검"}</button><span class="note">연표가 핵심 규칙(나이, 활동 기간, 순서)과 함께 성립하는지 보고, 어긋난 항목을 고칩니다. 사용자 수정 항목은 바꾸지 않습니다. 칸을 고쳤다면 점검 전에 '설정 저장'을 먼저 눌러 주세요.</span>${stat}</div>`;
}
/* 생성 흐름에서 연표를 받은 뒤 부른다. 뒤에서 돌고, 끝나면 저장한다 */
function afterTimeline(w, opts = {}) {
  if (!w || !(w.timeline || []).some(t => t.dateAsk) || !S.sample) return;
  return askTimelineDates(w, opts).then(async n => {
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
   w.events: [{ k(사건 항목 키, 항목이 없으면 이름의 키), name, kind?(그 세계의 짧은 사건 유형 이름. 옛 기록에는 없다), date, place, nums: [{name, value, unit}], parts(참가 항목 키), result, src, createdAt }]
   문서가 날짜·장소·수치까지 구체적으로 서술한 사건만 생성 응답의 "events"로 받는다.
   처음 기록된 값이 기준이다(refOK와 같은 원칙). 사용자가 직접 고친 문서의 기록은 언제나 기준이다
   detail: 이 문서가 이 사건을 한 문단 넘게 자세히 서술했는가(생성 응답). detailIn: 그 사건의 상세 서술을 맡은 문서 키
   (사건 이름의 문서가 있으면 그 문서, 없으면 detail인 기록 중 기준 순서가 앞선 문서). 다른 문서는 요약하고 그 문서를 참조한다.
   beats: [{actor, action}] 핵심 경과 3~7줄(단계 순서, 결과, 피해 포함). 기준 순서가 앞선 기록의 경과가 기준이다. 옛 기록에는 detail·detailIn·beats가 없다 */
const EVENTS_PER_PAGE = 6;
const evText = (x, n) => norm(stripMarks(asText(x ?? ""))).slice(0, n);
function normEvent(w, x) {
  if (!x || typeof x !== "object") return null;
  const name = evText(x.name || x.title, 80); if (!name) return null;
  const date = evText(x.date, 40), place = evText(x.place, 80);
  const nums = (Array.isArray(x.nums) ? x.nums : []).map(n => n && typeof n === "object" ? { name: evText(n.name, 30), value: evText(n.value, 30), unit: evText(n.unit, 20) } : null).filter(n => n && n.name && n.value).slice(0, 10);
  if (!date || (!place && !nums.length)) return null;   // 날짜와, 장소나 수치가 있어야 구체적인 기록이다
  const parts = [...new Set((Array.isArray(x.participants) ? x.participants : []).map(t => kOf(w, evText(t, 80))).filter(k => w.entities[k]))].slice(0, 12);
  const kind = evKind(w, x.kind), beats = normBeats(x.beats);
  return { k: kOf(w, name), name, ...(kind ? { kind } : {}), date, place, nums, parts, result: evText(x.result, 200), ...(x.detail === true || x.detail === "true" ? { detail: true } : {}), ...(beats.length ? { beats } : {}) };
}
/* 이 문서(src)의 사건 기록을 새로 받는다. 이 문서가 전에 남긴 기록은 바꿔 끼운다 */
function ingestEvents(w, src, list) {
  if (!Array.isArray(list)) return 0;
  const got = [];
  for (const x of list) {
    const ev = normEvent(w, x); if (!ev) continue;
    const same = got.find(y => y.k === ev.k);
    if (same) { for (const n of ev.nums) if (!same.nums.some(m => numKey(m) === numKey(n))) same.nums.push(n); if (ev.detail) same.detail = true; if (!same.beats && ev.beats) same.beats = ev.beats; continue; }
    if (got.length < EVENTS_PER_PAGE) got.push({ ...ev, src, createdAt: Date.now() });
  }
  w.events = (w.events || []).filter(x => x.src !== src).concat(got);
  for (const ek of new Set(got.map(x => x.k))) {   // 상세 서술을 맡은 문서를 장부에 남긴다
    const d = eventDetailIn(w, ek, src);
    for (const x of w.events) if (x.k === ek) { if (d) x.detailIn = d; else delete x.detailIn; }
  }
  return got.length;
}
const BEATS_MAX = 7;
function normBeats(list) {
  return (Array.isArray(list) ? list : []).map(b => b && typeof b === "object" ? { actor: evText(b.actor ?? b.who, 60), action: evText(b.action ?? b.what, 120) } : null).filter(b => b && b.actor && b.action).slice(0, BEATS_MAX);
}
/* 상세 서술을 맡은 문서: 사건 이름의 문서 > detail인 기록 중 직접 고친 문서 > 먼저 쓴 문서. cur는 지금 저장 중인(아직 S.pages에 없을 수 있는) 문서 */
/* 사건 이름의 문서가 없으면: 직접 고친 문서 > 사건 문서(이름이 달라도, 예: 걸프전·걸프 전쟁) > 그 사건의 참가자 문서.
   참가자도 아닌 개념·국가 문서가 사건을 길게 다뤘다고 상세 서술을 맡지는 않는다 */
function eventDetailIn(w, ek, cur = null) {
  if (w.entities[ek] && (cur === ek || (S.world === w && S.pages[ek]))) return ek;
  const all = (w.events || []).filter(x => x.k === ek && x.detail && (x.src === cur || S.pages[x.src]));
  const parts = new Set((w.events || []).filter(x => x.k === ek).flatMap(x => x.parts || []));
  const typeOf = src => S.pages[src]?.type || w.entities[src]?.type;
  const tier = x => eventEdited(x) ? 0 : typeOf(x.src) === "사건" ? 1 : parts.has(x.src) ? 2 : 3;
  const c = all.filter(x => tier(x) < 3).sort((a, b) => tier(a) - tier(b) || eventRank(a, b))[0];
  return c ? c.src : null;
}
/* 기준 핵심 경과: beats가 있는 기록 중 기준 순서가 가장 앞선 것 */
const eventBeats = (w, ek, okSrc = null) => (w.events || []).filter(x => x.k === ek && x.beats?.length && S.pages[x.src] && (!okSrc || okSrc(x.src))).sort(eventRank)[0] || null;
const beatLine = (w, x) => `- 「${x.name}」 (「${S.pages[x.src]?.title || "?"}」${eventEdited(x) ? " [사용자 확정]" : ""}): ${x.beats.map(b => `${b.actor} — ${b.action}`).join(" → ")}`;
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
    const owner = eventDetailIn(w, m.k) === k;   // 이 문서가 그 사건의 상세 서술을 맡았으면 먼저 쓴 다른 문서의 재서술 값에 맞추지 않는다. 사용자가 고친 기록만 따른다
    for (const r of refs) { if (r.k !== m.k || (owner && !eventEdited(r))) continue; const hit = r.nums.find(x => numKey(x) === numKey(n)); if (hit) { ref = r; rn = hit; break; } }
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
function eventKeysFor(w, key, rel = [], okSrc = null) {
  const near = new Set([key, ...rel]), all = (w.events || []).filter(x => x.src !== key && (!okSrc || okSrc(x.src)));
  return [...new Set(all.filter(x => near.has(x.k) || x.parts.includes(key)).map(x => x.k))];
}
function eventLedgerFor(w, key, rel = [], okSrc = null, max = 40) {
  const all = (w.events || []).filter(x => x.src !== key && (!okSrc || okSrc(x.src))), ks = eventKeysFor(w, key, rel, okSrc);
  const rows = [];
  for (const ek of ks) {
    const list = all.filter(x => x.k === ek).sort(eventRank);
    list.forEach((x, i) => rows.push(eventRow(w, x, (i === 0 ? " (기준)" : "") + (eventEdited(x) ? " [사용자 확정]" : ""))));
  }
  return rows.slice(0, max);
}
function eventBlock(w, key, rel, max = null) {
  const rows = max === null ? eventLedgerFor(w, key, rel) : eventLedgerFor(w, key, rel, null, max); if (!rows.length) return "";
  const ks = max === null ? eventKeysFor(w, key, rel) : eventKeysFor(w, key, rel).slice(0, max), beats = ks.map(ek => eventBeats(w, ek)).filter(Boolean);
  const det = ks.map(ek => [ek, eventDetailIn(w, ek)]).filter(([, d]) => d && d !== key && w.entities[d]);
  const evName = ek => (w.events || []).filter(x => x.k === ek).sort(eventRank)[0]?.name || w.entities[ek]?.title || "?";
  return `## 사건 장부 (이 문서가 다룰 수 있는 사건의 확정 기록)
같은 사건을 다룰 때 날짜, 장소, 수치가 '(기준)' 기록과 어긋나지 않게 한다. 이 문서가 그 사건 자체의 문서가 아니면 장부의 날짜·수치·부대 이름을 본문에 옮겨 적지 않는다. 장부는 어긋남을 막는 기준이지 채워 넣을 재료가 아니다. 이 사건 자체의 문서에서 수치를 새로 적을 때는 장부와 같은 이름과 단위를 쓴다.
${EVENT_HEAD}
${rows.join("\n")}
${beats.length ? `
### 핵심 경과 (먼저 기록한 문서 기준. [사용자 확정]은 직접 고친 문서)
${beats.map(x => beatLine(w, x)).join("\n")}
이 경과의 주체와 행위는 바꾸지 않는다. 세부 묘사는 덧붙여도 된다. 단계의 순서와 피해(부상 부위, 회복 기간, 손실)도 바꾸지 않고, 경과 사이에 다른 항목의 상태나 행동을 바꾸는 장면(쓰러짐, 부상, 지연, 출발·이동 방식)을 끼워 넣지 않는다.
` : ""}${det.length ? `
### 자세한 서술을 맡은 문서
${det.map(([ek, d]) => { const t = w.entities[d].title; return `- 「${evName(ek)}」: 이 사건은 「${t}」 문서에 자세히 서술되어 있다. 이 문서에서는 이 항목의 관점에서 2~3문장으로 요약하고, '자세한 내용은 [[${t}]] 문서 참조'를 붙인다. 장면을 다시 묘사하지 않는다.`; }).join("\n")}
이 항목의 역할이 그 사건에서 결정적이고, 상세 서술 문서에 없는 이 항목만의 관점(그 순간 이 항목의 처지, 그 뒤의 영향)이 있으면 그 부분만 덧붙일 수 있다.
` : ""}
`;
}
/* 검사용: 이 문서의 기준이 되는 사건 기록과, 같은 사건인지 모델이 판단할 후보 */
function eventCheckBlock(w, key, okSrc) {
  const rows = eventLedgerFor(w, key, (w.events || []).filter(x => x.src === key).map(x => x.k), okSrc);
  const cand = eventCandidates(w, key);
  const beats = eventKeysFor(w, key, (w.events || []).filter(x => x.src === key).map(x => x.k), okSrc).map(ek => eventBeats(w, ek, x => x !== key && (!okSrc || okSrc(x)))).filter(Boolean);
  if (!rows.length && !cand.length) return "";
  return `## 사건 장부 (먼저 기록된 사건)
${rows.length ? `${EVENT_HEAD}\n${rows.join("\n")}\n` : "(없음)\n"}${beats.length ? `핵심 경과(누가 무엇을 했는가). 이 문서가 같은 사건의 주체나 행위, 단계 순서, 피해를 다르게 썼으면 지적한다(evidence에는 경과 줄을 옮긴다). 세부 묘사를 덧붙인 것은 지적하지 않는다.\n${beats.map(x => beatLine(w, x)).join("\n")}\n` : ""}${cand.length ? `
## 같은 사건일 수 있는 기록 (이름이 달라 앱이 정하지 못했다. 날짜가 겹치고 참가자가 같다)
${cand.map(([m, r]) => `- 이 문서: 「${m.name}」 ${m.date}${m.place ? ", " + m.place : ""}${m.nums.length ? ", " + numText(m) : ""}\n  「${S.pages[r.src]?.title || "?"}」: 「${r.name}」 ${r.date}${r.place ? ", " + r.place : ""}${r.nums.length ? ", " + numText(r) : ""}`).join("\n")}
두 기록이 같은 사건을 가리키면 날짜, 장소, 수치가 어긋나는 곳을 지적하고(evidence에는 다른 문서의 기록을 옮긴다), 다른 사건이면 지적하지 않는다.
` : ""}`;
}
/* ---------- 사건 유형 ----------
   같은 유형의 사건을 문서마다 서로 모른 채 되풀이하지 않게, 쓰는 단계에서 같은 유형의 기존 사건을 보여 준다 */
const EVENT_KINDS_N = 30, EVENT_SAME_KIND_N = 8;
const kindKey = t => norm(stripMarks(String(t || ""))).replace(/[\s·.,]/g, "").toLowerCase();
/* 장부에 쓰인 유형 이름(많이 쓴 순). kind가 없는 옛 기록은 건너뛴다 */
function eventKinds(w) {
  const n = new Map(), name = new Map();
  for (const e of w.events || []) { const k = kindKey(e.kind); if (!k) continue; n.set(k, (n.get(k) || 0) + 1); if (!name.has(k)) name.set(k, e.kind); }
  return [...n.keys()].sort((a, b) => n.get(b) - n.get(a)).slice(0, EVENT_KINDS_N).map(k => name.get(k));
}
/* 응답의 kind: 기존 이름과 같은 종류(띄어쓰기·대소문자만 다름)면 기존 이름으로 맞춘다 */
function evKind(w, t) {
  const v = evText(t, 20); if (!v) return "";
  return (w.events || []).find(e => e.kind && kindKey(e.kind) === kindKey(v))?.kind || v;
}
/* 이 문서가 다룰 만한 유형의 기존 사건. 유형은 이 항목·관련 항목의 사건 유형과 항목 설명에 이름이 나온 유형.
   그런 유형이 없으면 모든 유형에서 고른다. 관련도: 참가자가 겹침 > 관련 유형 > 여러 번 되풀이된 유형 > 먼저 쓴 문서 */
function sameKindEvents(w, key, rel = [], text = "", max = EVENT_SAME_KIND_N) {
  if (max <= 0) return [];
  const near = new Set([key, ...rel]), all = (w.events || []).filter(e => e.kind && S.pages[e.src]);
  if (!all.length) return [];
  const ent = w.entities[key];
  const txt = [text, ent?.title, ent?.summary, ...(ent?.facts || []).filter(f => !f.sup).map(f => f.t)].filter(Boolean).join("\n");
  const relK = new Set([...all.filter(e => near.has(e.k) || near.has(e.src) || e.parts.some(p => near.has(p))).map(e => kindKey(e.kind)),
    ...eventKinds(w).filter(k => txt.includes(k)).map(kindKey)]);
  const cnt = new Map(); for (const e of w.events || []) if (e.kind) cnt.set(kindKey(e.kind), (cnt.get(kindKey(e.kind)) || 0) + 1);
  const pool = all.filter(e => e.src !== key && e.k !== key && (!relK.size || relK.has(kindKey(e.kind))));
  const cats = k => (S.pages[k]?.categories || w.entities[k]?.cats?.map(c => c.name) || []).filter(Boolean);
  const mine = new Set(cats(key));
  const type = S.pages[key]?.type || ent?.type;
  const peer = e => !!type && [e.src, ...e.parts].some(k => k !== key && (S.pages[k]?.type || w.entities[k]?.type) === type && cats(k).some(c => mine.has(c)));
  const peerFirst = e => cnt.get(kindKey(e.kind)) > (w.events || []).length / 3 && peer(e) ? 1 : 0;
  const score = e => e.parts.filter(p => near.has(p)).length * 4 + (relK.has(kindKey(e.kind)) ? 2 : 0) + (cnt.get(kindKey(e.kind)) > 1 ? 1 : 0);
  const seen = new Set(), out = [];
  for (const e of pool.sort((a, b) => peerFirst(b) - peerFirst(a) || score(b) - score(a) || eventRank(a, b))) {
    const id = e.k + "|" + e.src; if (seen.has(id)) continue; seen.add(id);
    out.push(e); if (out.length >= max) break;
  }
  return out;
}
const SAME_KIND_HEAD = "| 유형 | 사건 | 날짜 | 장소 | 참가 | 결과 | 출처 문서 |\n|---|---|---|---|---|---|---|";
/* 기존 인물 문서의 생애 하위 제목만 보여 준다. 문서가 없는 항목은 대상이 아니다. */
function lifeFlowBlock(w, key, rel = [], max = 3) {
  const cats = k => S.pages[k]?.categories || (w.entities[k]?.cats || []).map(c => c.name);
  const mine = new Set(cats(key)), near = new Set(rel);
  const list = Object.entries(S.pages).filter(([k, p]) => k !== key && w.entities[k] && (p.type || w.entities[k].type) === "인물")
    .map(([k, p]) => {
      let life = false; const headings = [];
      for (const s of p.sections || []) {
        if ((s.level || 1) === 1) life = /생애|생애와|일생|행적|이력|활동|삶/.test(s.heading);
        else if (s.level === 2 && life && s.heading) headings.push(s.heading);
      }
      return { k, p, headings, score: (near.has(k) ? 2 : 0) + (cats(k).some(c => mine.has(c)) ? 1 : 0) };
    }).filter(x => x.headings.length).sort((a, b) => b.score - a.score || (b.p.createdAt || 0) - (a.p.createdAt || 0)).slice(0, max);
  if (!list.length) return "";
  return `## 기존 인물들의 생애 흐름
${list.map(x => `- 「${x.p.title}」: ${x.headings.slice(0, 12).join(" → ")}`).join("\n")}
같은 흐름(같은 방식의 출세, 같은 방식의 죽음이나 퇴장)을 반복하지 말고, 이 인물만의 전환점을 고른다. 확정 사실이 같은 흐름을 요구하면 그 안에서 다른 선택과 대가를 쓴다.

`;
}
function sameKindBlock(w, key, rel = [], text = "", max = EVENT_SAME_KIND_N) {
  const list = sameKindEvents(w, key, rel, text, max); if (!list.length) return "";
  return `## 같은 유형의 기존 사건 (다른 문서가 이미 기록한 것)
${SAME_KIND_HEAD}
${list.map(e => `| ${cell(e.kind)} | ${cell(e.name)} | ${cell(e.date)} | ${cell(e.place)} | ${cell(e.parts.map(p => w.entities[p]?.title).filter(Boolean).join(", "))} | ${cell(e.result)} | 「${cell(S.pages[e.src]?.title || "?")}」 |`).join("\n")}
기존 사건과 같은 유형의 사건을 새로 쓸 때는 둘 중 하나를 한다. (가) 기존 사건과의 관계(같은 배후, 영향을 받음, 대응해서 일어남 등)를 밝힌다. (나) 다른 유형의 사건을 고른다. 서로 모르는 듯이 같은 유형을 반복하지 않는다.

`;
}
/* 문서 읽기 검사의 근거: 이 문서가 다룬 사건을 먼저 기록한 다른 문서의 핵심 경과. 뜻 비교는 검사 모델이 한다 */
function eventBeatsCheckBlock(w, key) {
  const p = S.pages[key]; if (!p || p.editedAt) return "";   // 직접 고친 문서는 그 자체가 기준이다
  const mine = (w.events || []).filter(x => x.src === key);
  const ks = new Set([key, ...mine.map(x => x.k), ...(w.events || []).filter(x => x.parts.includes(key)).map(x => x.k)]);
  const list = [...ks].map(ek => eventBeats(w, ek, src => src !== key && refOK(src, p))).filter(Boolean);
  if (!list.length) return "";
  return `## 다른 문서가 먼저 기록한 사건의 핵심 경과
이 문서가 같은 사건을 다룰 때 아래 경과의 주체(누가)와 행위(무엇을)를 다르게 썼는지 본다. 단계의 순서, 피해(부상 부위, 회복 기간, 손실)가 다르거나, 경과 사이에 다른 항목의 상태를 바꾸는 장면을 끼워 넣었으면 그것도 지적한다. 다르게 썼으면 claim에 이 문서의 서술을 글자 그대로 옮기고 evidence에 아래 경과 줄을 옮긴다. 세부 묘사를 덧붙인 것은 지적하지 않는다.
${list.map(x => beatLine(w, x)).join("\n")}

`;
}
const eventKindsNote = w => { const ks = eventKinds(w); return ks.length ? ` 이미 쓰는 유형 이름: ${ks.join(", ")}. 같은 종류면 이 이름을 글자 그대로 쓰고, 새 종류일 때만 새 이름을 짓는다.` : ""; };
const EVENTS_SPEC_BASE = `events에는 이 문서가 날짜와 함께 장소나 수치까지 구체적으로 서술한 사건만 0~4개 넣는다. 막연히 언급만 한 사건, 날짜가 없는 사건은 넣지 않는다. name은 사건 항목을 링크했다면 그 제목을 글자 그대로 쓰고, 장부에 이미 있는 사건이면 장부의 사건 이름, 수치 이름, 단위를 똑같이 쓴다. nums의 value에는 단위 없이 값만 쓴다. participants에는 참가한 항목 제목을 글자 그대로 쓴다. kind에는 이 세계에서 쓰는 짧은 사건 유형 이름으로, 무엇을 상대로 무엇을 한 일인지 드러나는 이름(예: 영해 침범 선박 저지, 재난 방호, 거체 간 격투, 기동 거부)을 하나 쓴다. detail은 이 문서가 이 사건을 한 문단 넘게 자세히 서술했으면 true, 짧게 요약하거나 언급만 했으면 false다. beats에는 이 문서가 서술한 사건의 핵심 경과 3~7줄을 순서대로 쓰고, 각 줄은 actor(그 일을 한 주체: 항목 제목이나 이름)와 action(한 일)이다. 단계가 있으면 단계마다 한 줄씩 순서대로 쓰고, 결과와 피해(부상 부위, 회복 기간, 손실)가 있으면 action에 넣는다. 장부에 핵심 경과가 이미 있는 사건이면 그 주체, 행위, 순서, 피해를 그대로 따른다.`;
const eventsSpec = w => EVENTS_SPEC_BASE + eventKindsNote(w);
const EVENTS_JSON = `"events":[{"name":"사건 이름","kind":"사건 유형","date":"날짜(문서에 쓴 그대로)","place":"장소","nums":[{"name":"수치 이름(예: 거리, 수심, 병력, 사상자)","value":"값","unit":"단위"}],"participants":["참가 항목 제목"],"result":"결과 한 문장","detail":"true 또는 false","beats":[{"actor":"주체","action":"한 일"}]}]`;

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
    const term = evText(x.term, 40), definition = evText(x.definition, 300), about = evText(x.about, 40);
    if (!term || !definition) continue;
    const g = findTerm(w, term);
    if (!g) { if (w.glossary.length < GLOSSARY_MAX) { w.glossary.push({ term, definition, src, confirmed: false, at: Date.now(), ...(about && about !== term ? { about } : {}) }); n++; } continue; }
    if (about && !g.about && about !== g.term) g.about = about;
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
  if (w.entities?.[src]?.affil?.src === src) delete w.entities[src].affil;   // 그 문서가 정한 자기 소속과 존속 기간도 함께 걷어 낸다
  if (w.entities?.[src]?.span?.src === src) delete w.entities[src].span;
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
function glossaryBlock(w, text = null, max = GLOSSARY_PROMPT_N) {
  if (max <= 0) return "";
  let list = (w.glossary || []).filter(g => g.definition);
  if (text !== null) list = list.filter(g => text.includes(g.term) || (g.about && text.includes(g.about)));   // 검사할 문서에 나온 용어와, 문서가 다룬 대상에 걸린 공통 값만
  if (!list.length) return "";
  list = [...list.filter(g => g.confirmed), ...list.filter(g => !g.confirmed)].slice(0, max);
  return `## 용어 정의와 공통 값 (이 세계의 용어는 이 뜻으로만 쓰고, 공통 값은 이 값과 경계를 그대로 따른다)\n${list.map(g => termLine(w, g)).join("\n")}`;
}
const TERMS_SPEC = `terms에는 이 문서가 처음 정한 것 가운데 두 가지만 합쳐 0~3개 넣는다. (1) 명명 체계, 번호 체계, 이 세계의 핵심 개념(예: 제식 번호가 개인의 이름인지 대대로 물려받는 칭호인지, 번호를 나라마다 매기는지 전 세계 일련번호인지). definition은 무엇을 가리키고 어떻게 붙는지 한두 문장으로 쓴다. (2) 한 개체가 아니라 같은 종류 전체에 적용되는 공통 값: 크기와 무게의 관계, 등급·단계별 효과, 한계 수치, 상한(예: 신장 80m급 개체의 체중 범위, 3등급 이상이면 무엇을 할 수 있는지). term은 '대상 + 속성'(예: 전략 소녀의 체중), about은 그 종류의 이름, definition에는 값과 단위, 경계가 이상·초과·이하·미만 중 무엇인지를 글자 그대로 쓴다. '용어 정의와 공통 값'에 이미 있는 것은 넣지 않고, 그 정의나 값과 다르게 쓰지 않는다. 처음 정한 것이 없으면 빈 배열.`;
const TERMS_JSON = `"terms":[{"term":"용어 또는 대상의 속성","about":"공통 값이면 그 종류의 이름(아니면 빈 문자열)","definition":"뜻과 붙는 방식, 또는 값·단위·경계"}]`;

/* ---------- 소속과 기간: 여러 문서에서 계산되는 집계(나라별 현역 수, 'N기 중 가장')의 재료 ----------
   e.affil = { src, list: [{ org(항목 키), role, state, from, to }] } — 그 항목 자신의 문서가 정한다(주인 문서).
   소속 구성원 현황은 저장하지 않고 이것으로 그때그때 계산한다 */
const AFFIL_STATES = ["현역", "퇴역", "사망", "해제", "실종", "기타"];
const AFFIL_SPEC = `affiliations에는 「{T}」 자신이 속했거나 속한 국가·조직·부대를 0~4개 넣는다(그 항목 자신의 소속만. 다른 항목의 소속은 넣지 않는다). org는 그 소속 항목의 제목을 글자 그대로, role은 그 안의 자리(예: 해군 전략 소녀, 지휘관, 회원국), state는 작중 기준 시점의 상태로 ${AFFIL_STATES.join("·")} 중 하나, from과 to는 그 소속이 시작하고 끝난 연도(진행 중이면 to는 빈 문자열, 모르면 빈 문자열)다.`;
const AFFIL_JSON = `"affiliations":[{"org":"소속 항목 제목","role":"자리","state":"현역","from":"연도","to":""}]`;
const yearText = v => { const m = /(\d{3,4})/.exec(String(v ?? "")); return m ? m[1] : ""; };
function ingestAffil(w, key, list) {
  const e = w.entities[key]; if (!e || !Array.isArray(list)) return;
  const out = [];
  for (const x of list.slice(0, 6)) {
    if (!x || typeof x !== "object") continue;
    const title = evText(x.org, 60); if (!title) continue;
    const org = kOf(w, title); if (org === key || out.some(y => y.org === org)) continue;
    if (!w.entities[org]) continue;   // 링크도 하지 않은 소속은 받지 않는다
    out.push({ org, role: evText(x.role, 40), state: AFFIL_STATES.includes(x.state) ? x.state : "기타", from: yearText(x.from), to: yearText(x.to) });
  }
  if (out.length) e.affil = { src: key, list: out }; else if (e.affil?.src === key) delete e.affil;
}
const affilSpan = a => a.from || a.to ? `${a.from || "?"}~${a.to || (a.state === "현역" ? "현재" : "?")}` : "";
/* 소속 org의 구성원: 그 항목 문서가 정한 소속과, 문서가 아직 없는 항목의 소속 분류 */
function rosterOf(w, org) {
  const t = w.entities[org]?.title, rows = [];
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === org) continue;
    const a = o.affil?.list?.find(x => x.org === org);
    if (a) rows.push({ k, a });
    else if (!S.pages[k] && t && (o.cats || []).some(c => c.axis === "소속" && c.name === t)) rows.push({ k, a: null });
  }
  return rows;
}
/* 문서가 정한 기간으로 계산한, 기준 시점까지 구성원이 하나도 없던 연도 구간 */
function rosterGaps(w, rows) {
  const era = +yearText(w.era); if (!era) return [];
  const spans = rows.map(r => r.a).filter(a => a?.from).map(a => [+a.from, a.to ? +a.to : a.state === "현역" ? era : null]).filter(([a, b]) => b !== null && b >= a);
  if (!spans.length) return [];
  const first = Math.min(...spans.map(x => x[0])), out = [];
  let run = null;
  for (let y = first; y <= era; y++) {
    const on = spans.some(([a, b]) => y >= a && y <= b);
    if (!on && run === null) run = y;
    if ((on || y === era) && run !== null) { const endY = on ? y - 1 : y; out.push(endY > run ? `${run}~${endY}` : `${run}`); run = null; }
  }
  return out.slice(0, 4);
}
function rosterBlock(w, orgs, n = 30, check = false) {
  if (n <= 0) return "";
  const parts = [];
  for (const org of [...new Set(orgs)]) {
    const rows = rosterOf(w, org); if (!rows.length || !w.entities[org]) continue;
    const count = {}; for (const r of rows) if (r.a) count[r.a.state] = (count[r.a.state] || 0) + 1;
    const active = rows.filter(r => r.a?.state === "현역").map(r => w.entities[r.k].title), gaps = rosterGaps(w, rows);
    // 문서가 없거나 상태를 정하지 않은 구성원이 있으면 현역 수는 아는 만큼만이다. '현역 0'을 확정값처럼 적으면 검사가 그 조직에 구성원이 없다고 읽는다
    const undecided = rows.filter(r => !r.a?.state).length, states = Object.entries(count).map(([s, c]) => `${s} ${c}`).join(", ");
    const activeText = !states ? `상태를 정한 구성원 문서가 아직 없어 현역 수를 알 수 없음(상태 미정 ${undecided}명)`
      : undecided ? `현역으로 기록된 구성원 ${active.length}명${active.length ? `(${active.join(", ")})` : ""}, 상태 미정 ${undecided}명은 세지 않음`
      : `현역으로 기록된 구성원 ${active.length}명${active.length ? `(${active.join(", ")})` : ""}`;
    const head = `문서가 정한 상태: ${states || "없음"} · ${activeText}${gaps.length ? ` · 구성원이 없던 기간: ${gaps.join(", ")}${undecided ? "(상태 미정 구성원은 반영하지 않음)" : ""}` : ""}`;
    parts.push(`### 「${w.entities[org].title}」 (${head})\n${rows.slice(0, n).map(({ k, a }) => `- ${w.entities[k].title}${a ? `: ${[a.role, a.state, affilSpan(a)].filter(Boolean).join(", ")}` : ": (문서 없음, 상태 미정)"}`).join("\n")}`);
    if (parts.length >= 4) break;
  }
  if (!parts.length) return "";
  return `## 소속 구성원 현황 (각 항목의 문서가 정한 소속·상태·기간을 앱이 모은 표)
수와 공백 기간은 문서가 정한 기간만으로 계산했다. 문서가 없거나 기간을 정하지 않은 구성원은 빠져 있다. 이 표는 기록된 구성원만 모은 것이며 전체 수가 아니다. 표에 없는 구성원이 더 있다고 쓰는 것은 모순이 아니다.
${check ? "공백 기간에 그 조직의 구성원이 활동했다고 쓰면, 다른 문서가 그 기간에 구성원이 없었다고 밝혔는지 원문으로 확인하고, 밝혔으면 high, 아니면 low로 쓴다. '최초', '처음', '유일', '~만' 같은 주장은 이 표와 기간표에 더 이른 사례가 있는지 확인한다. 문서가 '유일', '0기', '모두', '가장 ~한' 같은 말로 구성원을 표보다 적게 말하면 이 표와 맞춰 본다. 표의 상태와 모순되면(예: 표에 현역이 있는데 현역 0기라고 씀) high로 지적한다. 표보다 구성원이 많다고 쓴 것은 지적하지 않는다. 표에 있는 인물의 소속·상태·기간이 다르게 쓰였을 때만 지적한다." : "표에 있는 구성원의 현역 여부와 '최초', '유일', '가장 ~한' 같은 비교는 이 표와 맞춘다. 표는 전체 수가 아니므로 구성원 수를 표에 맞춰 줄이지 않는다. 구성원이 없던 기간에 그 조직의 구성원을 활동시키지 않는다. 표에 있는 항목의 상태와 기간은 바꾸지 않는다. 표에 없는 구성원을 더할 때는 이름을 밝힌다."}
${parts.join("\n\n")}

`;
}
/* ---------- 다른 문서들이 기록한 이 항목의 일 ----------
   이 항목을 언급한 다른 문서 둘 이상이 같은 사건(사건 항목)과 엮어 기록했으면, 이 항목의 문서가 그 일을 다뤄야 한다.
   사건 문서 자신에서 나온 언급은 그 사건과 엮인 것으로 센다 */
const isEventEntity = (w, k) => ((S.pages[k]?.type) || w.entities[k]?.type) === "사건";
function recordedEpisodes(w, key, min = 2) {
  const e = w.entities[key]; if (!e) return [];
  const events = Object.keys(w.entities).filter(k => k !== key && isEventEntity(w, k)), eps = new Map();
  for (const m of e.mentions.filter(m => live(m) && m.from !== key && S.pages[m.from])) {
    const hit = new Set(events.filter(k => namesOf(w.entities[k].title).some(n => hasName(m.text, n))));
    if (isEventEntity(w, m.from)) hit.add(m.from);
    for (const k of hit) { const x = eps.get(k) || eps.set(k, { k, docs: new Set(), text: m.text }).get(k); x.docs.add(m.from); }
  }
  return [...eps.values()].filter(x => x.docs.size >= min).sort((a, b) => b.docs.size - a.docs.size).slice(0, 8);
}
function episodeBlock(w, key) {
  const eps = recordedEpisodes(w, key); if (!eps.length) return "";
  return `## 다른 문서들이 기록한 이 항목의 일 (빠뜨리지 않는다)
아래 일은 다른 문서 둘 이상이 이 항목의 행적으로 기록했다. 이 문서의 생애나 경과에서 적어도 한두 문장으로 다루고, 기록과 다르게 쓰지 않는다.
${eps.map(x => `- 「${w.entities[x.k].title}」 (${[...x.docs].map(d => `「${S.pages[d].title}」`).join(", ")}): ${stripMarks(x.text).slice(0, 200)}`).join("\n")}

`;
}
/* 결정론 지적: 위 일을 이 문서가 이름조차 적지 않았으면 다듬을 곳이 아니라 참고로 띄운다 */
function episodeIssues(w, k) {
  const p = S.pages[k]; if (!p || isStory(w)) return [];
  const text = pageTexts(p).join("\n");
  return recordedEpisodes(w, k).filter(x => !namesOf(w.entities[x.k].title).some(n => text.includes(n))).slice(0, 3).map(x => ({
    claim: `${p.title}: 「${w.entities[x.k].title}」에 대한 서술 없음`, severity: "low", advisory: true, issueKey: "episode:" + x.k, by: "num",
    conflict: `근거: ${[...x.docs].map(d => `「${S.pages[d].title}」`).join(", ")} · 사건 장부: 다른 문서 ${x.docs.size}곳이 이 항목의 「${w.entities[x.k].title}」 행적을 기록했지만 이 문서에는 없다. 생애나 경과에 그 일을 한두 문장 더한다. 예: ${stripMarks(x.text).slice(0, 160)}`.slice(0, 500),
  }));
}
/* ---------- 존속 기간: 그 항목 자신의 문서가 JSON으로 정한다(정보상자 이름을 단어 목록으로 찾지 않는다) ----------
   e.span = { src, what, start, end, endWhat } */
const SPAN_SPEC = `existence에는 「{T}」 자신이 존재하거나 효력을 가진 기간을 쓴다. what은 시작을 뜻하는 짧은 말(예: 출생, 발현, 창설, 체결, 도입, 설립, 취역, 첫 방송), start와 end는 연도, endWhat은 끝을 뜻하는 짧은 말(예: 사망, 퇴역, 해체, 폐지, 종영)이다. 이어지고 있거나 모르면 end와 endWhat은 빈 문자열, 시작을 모르면 start도 빈 문자열로 둔다.`;
const SPAN_JSON = `"existence":{"what":"시작을 뜻하는 말","start":"연도","end":"","endWhat":""}`;
function ingestSpan(w, key, x) {
  const e = w.entities[key]; if (!e || !x || typeof x !== "object" || Array.isArray(x)) return;
  const start = yearText(x.start), end = yearText(x.end);
  if (!start && !end) { if (e.span?.src === key) delete e.span; return; }
  e.span = { src: key, what: evText(x.what, 20), start, end, endWhat: end ? evText(x.endWhat, 20) : "" };
}
const spanText = s => [s.start ? `${s.what || "시작"} ${s.start}` : "", s.end ? `${s.endWhat || "끝"} ${s.end}` : ""].filter(Boolean).join(" ~ ");
/* 대상들의 존속·소속 기간표. 연도가 붙은 서술에서 어떤 항목이 쓰이거나 활동했다면 그 기간 안이어야 한다 */
function periodBlock(w, keys, max = 16, check = true) {
  const rows = [];
  for (const k of [...new Set(keys)]) {
    const o = w.entities[k]; if (!o) continue;
    const lines = [];
    if (o.span && spanText(o.span)) lines.push(spanText(o.span));
    for (const a of o.affil?.list || []) if (affilSpan(a)) lines.push(`${w.entities[a.org]?.title || "?"} ${a.role || ""} ${a.state} ${affilSpan(a)}`.replace(/\s+/g, " "));
    if (lines.length) rows.push(`- ${o.title}: ${lines.slice(0, 5).join(" · ")}`);
    if (rows.length >= max) break;
  }
  if (!rows.length) return "";
  return check ? `## 등장 대상의 존속·소속 기간 (각 항목의 문서가 정한 값)
연도가 붙은 서술에서 어떤 항목(제도, 체계, 조직, 인물, 장비)이 쓰이거나 활동했다면 그 시점이 그 항목의 기간 안인지 계산한다. 생기기 전에 그것을 따르거나 쓰거나, 끝난 뒤에 활동하면 high다. 함께 복무했다, 같은 시설을 썼다, 맞붙었다, 넘겨받았다처럼 둘이 같은 때에 있어야 하는 서술은 두 기간이 겹치는지 계산한다. 나중에 소급해 붙인 이름이나 후대의 평가라고 문서가 밝힌 서술은 지적하지 않는다.
${rows.join("\n")}

` : `## 관련 항목의 존속·소속 기간 (각 항목의 문서가 정한 값)
연도가 붙은 장면에서 이 항목들을 쓰거나 활동시킬 때는 그 시점이 기간 안이어야 한다. 생기기 전의 제도·체계를 그때 따랐다고 쓰지 않고, 기간이 겹치지 않는 둘을 함께 있게 하지 않는다. 나중에 붙은 이름으로 부를 때는 소급한 것임을 밝힌다.
${rows.join("\n")}

`;
}

/* ---------- 세계 전체 점검 (사용자가 버튼을 눌렀을 때만) ----------
   문서 제목과 한 줄 정의, 문서별 확정 사실, 사건 장부, 용어 정의, 연표를 압축해 한 번 보내고, 문서끼리 서로 모르는 곳을 찾게 한다.
   w.worldCheck = { at, items: [{ id, kind, severity, title, docs, keywords, detail, link, alts, linkBad, fix, status, linked?, batch? }] }
   link: 바로 확정할 기본안(결정된 문장). alts: 성격이 다른 대안 0~2개. linkBad: 다시 받아도 정하지 않은 표현이 남아 바로 연결할 수 없음.
   status: open(아직) · linked(연결 설정을 사용자 확정 설정으로 넣음) · kept(그대로 둠) · fix(문서 고치기를 엶)
   batch: 연결을 확정한 뒤 관련 문서에 일괄로 반영한 결과 { done(고침), none(고칠 곳 없음), failed(실패), manual(사용자가 직접 고친 문서라 직접 확인 필요), left?(멈춰서 손대지 않은 문서) }
   점검 결과는 누적한다. at: 처음 찾은 때. seen: again(다시 발견됨) · prev(이번 점검에서 다시 나오지 않음). folded: 상한(WC_ITEMS_MAX)을 넘어 접어 둠.
   kind가 first인 결과는 연결 설정을 만들지 않고, 주장한 문서(claimDoc)의 그 주장(claim)만 고친다 */
const WC_KINDS = { repeat: "서로 모르는 반복", first: "'최초' 주장 충돌", unaware: "영향을 모르는 문서" };
const FIRST_WORDS = ["최초", "처음", "유일"];
const WC_DOCS_MAX = 40, WC_FACTS_PER_DOC = 4, WC_BATCH = ["done", "none", "failed", "manual"], WC_ITEMS_MAX = 30, WC_DATED_PER_DOC = 2;
const WC_LIMIT = { index: 40000 };   // 점검 프롬프트의 문서 색인이 이보다 크면 유형별로 나눠 부른다
const WC_DATE_RE = /(\d+)\s*년\s*(\d+)\s*월\s*(\d+)\s*일/;
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
const WC_LINK_RULES = `- link에는 흩어진 기록을 하나로 잇는 설정을 결정된 한두 문장으로 쓴다. 사용자가 [연결하기]를 누르면 이 문장이 그대로 모든 문서가 지키는 확정 설정이 된다. 'A 또는 B', 'A나 B 중 하나', '~일 수도 있다', '어떤 세력'처럼 정하지 않은 채 남기지 않는다. 가능성이 여럿이면 가장 자연스러운 하나를 link로 정하고 나머지는 alts로 보낸다.
- link와 alts는 관련 문서들이 이미 확정한 출처, 소속, 원인('문서별 확정 사실', '사건 장부', '용어 정의', '사용자 확정 설정')과 충돌하면 안 된다. 문서마다 출처나 소속을 이미 다르게 정해 두었다면 그 기록들이 모두 참으로 남도록 잇는다.
- undecided에는 link에 정하지 않은 표현이 남았다면 그 부분을 글자 그대로 옮긴다. 다 정했으면 빈 배열.
- alts에는 link와 성격이 다른 대안을 0~2개 넣는다. 각각 결정된 한두 문장이다. 마땅한 대안이 없으면 빈 배열.`;
const wcDateKey = m => m ? `${+m[1]}-${+m[2]}-${+m[3]}` : "";
/* 본문에서 "N년 N월 N일"이 든 문장을 기계적으로 고른다. 사건 장부와 연표에 같은 날짜로 이미 있는 것은 뺀다 */
function wcDated(w, k, p, n = WC_DATED_PER_DOC) {
  const evs = (w.events || []).map(e => [wcDateKey(String(e.date || "").match(WC_DATE_RE)), e]).filter(([d]) => d);
  const tls = (w.timeline || []).filter(live).filter(t => t.month && t.day).map(t => [`${yearNum(t.year)}-${+t.month}-${+t.day}`, t]);
  const known = (s, d) => evs.some(([ed, e]) => ed === d && (e.src === k || (e.name && s.includes(e.name)))) || tls.some(([td, t]) => td === d && (t.src === k || (t.event && (s.includes(t.event) || t.event.includes(s)))));
  const out = [];
  for (const s of pageTexts(p).flatMap(sentencesOf)) {
    if (out.length >= n) break;
    const d = wcDateKey(s.match(WC_DATE_RE));
    if (d && !known(s, d) && !out.includes(s)) out.push(s);
  }
  return out.map(s => s.slice(0, 160));
}
/* 문서 하나의 색인 조각: 한 줄 정의, 확정 사실, 최초 주장, 날짜가 든 서술 */
function wcDocIndex(w, k, p) {
  return { doc: `- ${p.title} (${p.type || "?"}): ${(p.summary || "").slice(0, 90)}`, facts: wcFactBlock(w, [k], WC_FACTS_PER_DOC),
    claims: pageTexts(p).flatMap(sentencesOf).filter(s => FIRST_WORDS.some(x => s.includes(x))).slice(0, 3).map(s => `- 「${p.title}」: ${s.slice(0, 160)}`),
    dated: wcDated(w, k, p).map(s => `- 「${p.title}」: ${s}`) };
}
const wcIndexSize = ix => ix.doc.length + ix.facts.length + ix.claims.join("\n").length + ix.dated.join("\n").length + 4;
/* 색인이 크면 문서를 유형별로 묶어 여러 번 부른다. 한 유형이 혼자 넘치면 쓴 순서대로 자른다 */
function wcChunks(w, max = WC_LIMIT.index) {
  const pages = wcPages(w), size = new Map(pages.map(([k, p]) => [k, wcIndexSize(wcDocIndex(w, k, p))]));
  if ([...size.values()].reduce((a, b) => a + b, 0) <= max) return [pages.map(([k]) => k)];
  const byType = new Map();
  for (const [k, p] of pages) { const t = p.type || "?"; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(k); }
  const out = []; let cur = [], n = 0;
  const flush = () => { if (cur.length) out.push(cur); cur = []; n = 0; };
  for (const keys of byType.values()) {
    const total = keys.reduce((a, k) => a + size.get(k), 0);
    if (n + total > max) flush();
    for (const k of keys) { if (n && n + size.get(k) > max) flush(); cur.push(k); n += size.get(k); }
  }
  flush();
  return out;
}
function worldCheckPrompt(w, keys = null) {
  const pages = wcPages(w).filter(([k]) => !keys || keys.includes(k)), ix = pages.map(([k, p]) => wcDocIndex(w, k, p));
  const docs = ix.map(x => x.doc).join("\n");
  const facts = ix.map(x => x.facts).filter(Boolean).join("\n").split("\n").slice(0, 400).join("\n");
  const claims = ix.flatMap(x => x.claims).slice(0, 120).join("\n");
  const dated = ix.flatMap(x => x.dated).slice(0, 200).join("\n");
  const evs = [...(w.events || [])].filter(x => S.pages[x.src]).sort(eventRank).map(x => eventRow(w, x, "")).slice(0, 150);
  const tl = timelineOrder((w.timeline || []).filter(live), w).map(t => `- ${tlWhen(t)}: ${t.event}`).join("\n");
  const kept = (w.worldCheck?.items || []).filter(x => x.status === "kept").map(x => `- ${x.title}`).join("\n");
  const part = keys ? `\n이번에는 문서가 많아 일부(아래 '문서')만 보낸다. 사건 장부와 연표는 세계 전체의 것이다.\n` : "";
  return `## 세계 전체 점검
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 문서 하나씩 보면 멀쩡하지만 모아 보면 이상한 곳을 찾는다. 문체나 한 문서 안의 모순은 보지 않는다.${part}

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
- first는 연결 설정을 만들지 않는다. link와 alts는 비우고, claimDoc에 '최초·처음·유일'을 주장한 문서 제목 하나를, claim에 그 주장 문장을 글자 그대로 쓴다. fix에는 그 문서 하나에서 표현의 범위를 좁히거나 그 말을 빼는 방향을 쓴다.

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

## 문서 속 날짜가 적힌 서술 (사건 장부와 연표에 없는 것. 같은 종류의 사건이 여러 곳에서 일어났는지 볼 때 함께 본다)
${dated || "(없음)"}

## 사건 장부
${evs.length ? EVENT_HEAD + "\n" + evs.join("\n") : "(없음)"}

${glossaryBlock(w) || "## 용어 정의\n(없음)"}

## 연표
${tl || "(없음)"}

JSON 객체 하나만 출력: {"findings":[{"kind":"repeat, first, unaware 중 하나","severity":"high 또는 low","title":"짧은 제목","docs":["관련 문서 제목"],"keywords":["핵심어"],"detail":"무엇이 왜 이상한지 두세 문장","link":"하나로 잇는 결정된 설정 한두 문장","undecided":[],"alts":["성격이 다른 대안 설정 한두 문장"],"fix":"문서를 고칠 방향 한 문장","claimDoc":"first일 때만: 주장한 문서 제목","claim":"first일 때만: 주장 문장"}]}
없으면 findings는 빈 배열.`;
}
const wcList = (a, n, max) => [...new Set((Array.isArray(a) ? a : []).map(t => evText(t, n)).filter(Boolean))].slice(0, max);
const wcAlts = (a, link) => wcList(a, 400, 4).filter(t => t !== link).slice(0, 2);
function parseWorldCheck(w, r) {
  const at = Date.now();
  return (Array.isArray(r?.findings) ? r.findings : []).filter(x => x && typeof x === "object").slice(0, 8).map((x, i) => {
    const docs = [...new Set((Array.isArray(x.docs) ? x.docs : []).map(t => kOf(w, evText(t, 80))).filter(k => S.pages[k] && w.entities[k]))].slice(0, 12);
    const kind = WC_KINDS[x.kind] ? x.kind : "repeat", first = kind === "first";
    const link = first ? "" : evText(x.link, 400);
    const y = { id: at.toString(36) + Math.random().toString(36).slice(2, 6) + i, at, kind, severity: x.severity === "low" ? "low" : "high", title: evText(x.title, 80), docs,
      keywords: wcList(x.keywords, 30, 3).filter(t => t.length >= 2), detail: evText(x.detail, 500), link, undecided: link ? wcList(x.undecided, 120, 6) : [], alts: first ? [] : wcAlts(x.alts, link), fix: evText(x.fix, 300), status: "open" };
    if (first) {
      const cd = kOf(w, evText(x.claimDoc, 80));
      if (S.pages[cd] && w.entities[cd]) { y.claimDoc = cd; if (!docs.includes(cd)) docs.unshift(cd); }
      y.claim = evText(x.claim, 300);
      y.claimDoc = wcClaimDoc(w, y); y.claim ||= wcClaimText(w, y);
    }
    return y;
  }).filter(x => x.title && x.detail && (x.kind === "first" ? x.claimDoc : (x.docs.length || x.link)));
}
/* first: 주장한 문서. 응답에 없으면 관련 문서 가운데 '최초·처음·유일' 문장(주장 문장이나 핵심어가 든 것을 먼저)이 있는 첫 문서 */
const wcFirstSents = p => pageTexts(p).flatMap(sentencesOf).filter(s => FIRST_WORDS.some(t => s.includes(t)));
function wcClaimDoc(w, x) {
  if (x.claimDoc && S.pages[x.claimDoc]) return x.claimDoc;
  const docs = (x.docs || []).filter(k => S.pages[k]), hit = k => wcFirstSents(S.pages[k]);
  const claim = norm(x.claim || "");
  return docs.find(k => claim && hit(k).some(s => s.includes(claim) || claim.includes(norm(s))))
    || docs.find(k => hit(k).some(s => (x.keywords || []).some(kw => s.includes(kw))))
    || docs.find(k => hit(k).length) || docs[0] || "";
}
function wcClaimText(w, x) {
  const p = S.pages[x.claimDoc]; if (!p) return "";
  const ss = wcFirstSents(p);
  return evText(ss.find(s => (x.keywords || []).some(kw => s.includes(kw))) || ss[0] || "", 300);
}
/* 같은 문제인가: kind가 같고 관련 문서가 절반 이상 겹친다(작은 쪽 기준). first는 같은 문서의 같은 주장일 때만 */
const wcClaimKey = t => norm(stripMarks(t || "")).replace(/[\s.。,·'"‘’“”「」]/g, "");
function wcSame(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "first") {
    if (!a.claimDoc || a.claimDoc !== b.claimDoc) return false;
    const A = wcClaimKey(a.claim), B = wcClaimKey(b.claim);
    return !A || !B || A === B || A.includes(B) || B.includes(A);
  }
  const A = a.docs || [], B = b.docs || [];
  if (!A.length || !B.length) return false;
  const both = A.filter(k => B.includes(k)).length;
  return both * 2 >= Math.min(A.length, B.length);
}
/* b를 a에 합친다. 관련 문서와 핵심어는 합집합, 중요도는 높은 쪽. 글은 a(먼저 본 쪽)를 살리되 a의 link가 막혔으면 b의 것으로 */
function wcMergeInto(a, b) {
  a.docs = [...new Set([...(a.docs || []), ...(b.docs || [])])].slice(0, WC_DOCS_MAX);
  a.keywords = [...new Set([...(a.keywords || []), ...(b.keywords || [])])].slice(0, 6);
  for (const e of b.extra || []) if (!a.docs.includes(e.k) && !(a.extra ||= []).some(y => y.k === e.k)) a.extra.push(e);
  if (a.extra) a.extra = a.extra.filter(e => !a.docs.includes(e.k));
  if (b.severity !== "low") a.severity = "high";
  if (a.kind !== "first" && b.link && (!a.link || a.linkBad) && !b.linkBad) { a.link = b.link; a.alts = b.alts || []; a.linkBad = false; }
  if (!a.claim && b.claim) a.claim = b.claim;
  a.at = Math.min(a.at || b.at || Date.now(), b.at || Infinity);
  return a;
}
/* 한 번의 점검(여러 번 나눠 부른 것 포함)에서 나온 결과끼리 합친다 */
function wcDedupe(list) {
  const out = [];
  for (const x of list) { const y = out.find(o => wcSame(o, x)); if (y) wcMergeInto(y, x); else out.push(x); }
  return out;
}
/* 새 결과를 기존 결과에 누적한다. 이미 정한 것(open이 아닌 것)과 같은 문제는 버리고, open과 같으면 합쳐 '다시 발견됨',
   이번에 다시 나오지 않은 open은 '이전 점검'으로 남긴다. 상한을 넘으면 오래된 low부터 접고 지우지 않는다 */
function wcAccumulate(old, found) {
  const items = old || [], opens = items.filter(x => x.status === "open"), hit = new Set(), fresh = [];
  for (const x of found) {
    if (items.some(y => y.status !== "open" && wcSame(y, x))) continue;
    const y = opens.find(o => wcSame(o, x));
    if (y) { wcMergeInto(y, x); y.seen = "again"; hit.add(y); }
    else fresh.push(x);
  }
  for (const y of opens) if (!hit.has(y)) y.seen = "prev";
  const all = [...fresh, ...opens.filter(y => hit.has(y)), ...opens.filter(y => !hit.has(y)), ...items.filter(y => y.status !== "open")];
  for (const y of all) delete y.folded;
  const over = all.length - WC_ITEMS_MAX;
  if (over > 0) [...all].sort((a, b) => (a.severity === "low" ? 0 : 1) - (b.severity === "low" ? 0 : 1) || (a.at || 0) - (b.at || 0)).slice(0, over).forEach(y => { y.folded = true; });
  return all;
}
/* 문서에서 핵심어가 든 문장을 앞뒤 문장과 묶어 max곳까지(문자열 포함 여부만 본다) */
function wcSnips(p, keywords, max = 3) {
  const out = [];
  if (!keywords?.length) return out;
  for (const text of pageTexts(p)) {
    const ss = sentencesOf(text);
    for (let i = 0; i < ss.length && out.length < max; i++) {
      if (!keywords.some(kw => ss[i].includes(kw))) continue;
      out.push(ss.slice(Math.max(0, i - 1), i + 2).join(" ").slice(0, 400)); i += 1;
    }
    if (out.length >= max) break;
  }
  if (!out.length && keywords.some(kw => String(p.title || "").includes(kw))) out.push(String(p.summary || p.title).slice(0, 400));
  return out;
}
/* 핵심어가 본문에 글자 그대로 들어 있지만 아직 관련 문서가 아닌 문서. 바로 넣지 않고 판단을 받는다 */
function wcCandidates(w, x) {
  if (!x.keywords?.length) return [];
  const out = [];
  for (const [k, p] of wcPages(w)) {
    if (out.length >= 30) break;
    if (x.docs.includes(k)) continue;
    const snips = wcSnips(p, x.keywords);
    if (snips.length) out.push({ k, snips });
  }
  return out;
}
const wcQuote = t => "  > " + String(t).replace(/\n/g, " ");
function wcJudgePrompt(w, groups) {
  return `## 관련 문서 판단
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 세계 전체 점검이 찾은 패턴마다, 핵심어 검색으로 걸린 문서의 서술이 그 패턴에 속하는지 판단한다.
- 낱말이 같다고 같은 패턴인 것은 아니고, 표현이 달라도 같은 패턴일 수 있다. 서술의 날짜, 장소, 경위(출격, 발생 경로) 같은 앞뒤 맥락으로 판단한다.
- yes: 이 패턴에 속한다. no: 속하지 않는다(시기나 경위가 다른 별개의 일). unsure: 이 서술만으로는 정할 수 없다.

${groups.map(([x, cands], i) => `### 패턴 ${i + 1}: ${x.title}
설명: ${x.detail}
이미 관련 문서로 정한 것: ${x.docs.map(k => `「${S.pages[k]?.title || "?"}」`).join(", ") || "(없음)"}
${cands.map((c, j) => `- ${i + 1}-${j + 1} 「${S.pages[c.k]?.title || "?"}」\n${c.snips.map(wcQuote).join("\n")}`).join("\n")}`).join("\n\n")}

JSON 객체 하나만 출력: {"judgments":[{"id":"1-1","verdict":"yes, no, unsure 중 하나"}]}`;
}
/* 핵심어로 걸린 문서를 quick 모델에게 한 번에 묻는다. yes는 관련 문서, unsure는 체크를 끈 추가 후보(extra), no는 버린다.
   판단을 받지 못한 문서는 unsure로 둔다 */
async function wcJudgeCandidates(w, found) {
  const groups = found.filter(x => x.kind !== "first").map(x => [x, wcCandidates(w, x)]).filter(([, c]) => c.length);
  if (!groups.length) return false;
  let r = null;
  try { r = await callJson("worldCheck", wcJudgePrompt(w, groups), { modelTier: "quick" }, { title: w.title + " · 관련 문서 판단" }); } catch {}
  const verdict = new Map((Array.isArray(r?.judgments) ? r.judgments : []).filter(j => j && typeof j === "object").map(j => [String(j.id || "").trim(), String(j.verdict || "").trim().toLowerCase()]));
  groups.forEach(([x, cands], i) => cands.forEach((c, j) => {
    const v = verdict.get(`${i + 1}-${j + 1}`);
    if (v === "yes") { if (x.docs.length < WC_DOCS_MAX) x.docs.push(c.k); }
    else if (v !== "no") (x.extra ||= []).push({ k: c.k, on: false, snip: c.snips[0].slice(0, 200) });
  }));
  return true;
}
/* 1차 점검으로 관련 문서와 핵심어가 정해진 뒤, 그 문서들의 본문 서술(핵심어 문장과 앞뒤)을 보내 link와 alts를 한 번 더 받는다 */
function wcLinkPrompt(w, list) {
  return `## 연결 설정 다듬기
너는 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 편집장이다. 세계 전체 점검이 찾은 패턴마다 관련 문서의 본문 서술을 함께 보고 연결 설정(link)과 대안(alts)을 다시 쓴다.
- 이 서술에 적힌 출처, 소속, 원인과 충돌하지 않게 하라. 충돌을 피할 수 없으면 기존 서술을 살리는 방향으로 설정을 짜라(예: 일부는 국가 소속으로 오인됐다).
${WC_LINK_RULES}

## 사용자 확정 설정
${(w.userCanon || "").trim() || "(없음)"}

${list.map(([x, docs], i) => `## 패턴 ${i + 1}: ${x.title}
설명: ${x.detail}
지금 link: ${x.link || "(없음)"}
### 관련 문서의 본문 서술
${docs.map(([k, snips]) => `「${S.pages[k]?.title || "?"}」\n${snips.map(wcQuote).join("\n")}`).join("\n")}
### 관련 문서의 확정 사실
${wcFactBlock(w, x.docs, 6) || "(없음)"}`).join("\n\n")}

JSON 객체 하나만 출력: {"findings":[{"n":1,"link":"결정된 설정 한두 문장","undecided":[],"alts":["성격이 다른 대안 설정 한두 문장"]}]}`;
}
async function wcRefineLinks(w, found) {
  const list = found.filter(x => x.kind !== "first").map(x => [x, x.docs.slice(0, 15).map(k => [k, S.pages[k] ? wcSnips(S.pages[k], x.keywords) : []]).filter(([, sn]) => sn.length)]).filter(([x, docs]) => docs.length);
  if (!list.length) return false;
  let r;
  try { r = await callJson("worldCheck", wcLinkPrompt(w, list), { modelTier: "check" }, { title: w.title + " · 연결 설정 다듬기" }); } catch { return false; }   // 실패하면 1차 결과를 그대로 쓴다
  let n = 0;
  for (const y of (Array.isArray(r?.findings) ? r.findings : [])) {
    const x = list[(parseInt(y?.n, 10) || 0) - 1]?.[0], link = evText(y?.link, 400);
    if (!x || !link) continue;
    x.link = link; x.undecided = wcList(y.undecided, 120, 6); x.alts = wcAlts(y.alts, link); n++;
  }
  return n > 0;
}
/* 일괄 고치기 대상: 관련 문서와, 사용자가 체크한 추가 후보 */
const wcTargets = x => [...(x.docs || []), ...(x.extra || []).filter(e => e.on && !(x.docs || []).includes(e.k)).map(e => e.k)];
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
    const chunks = wcChunks(w), many = chunks.length > 1;   // 색인이 크면 유형별로 나눠 부르고 결과를 합친다
    const rs = await Promise.all(chunks.map((keys, i) => callJson("worldCheck", worldCheckPrompt(w, many ? keys : null), { modelTier: "check" }, { title: w.title + " · 세계 전체 점검" + (many ? ` ${i + 1}/${chunks.length}` : "") })
      .catch(err => { if (!many) throw err; return null; })));
    if (S.world !== w) return;
    if (rs.every(r => r === null)) throw new Error("세계 전체 점검을 받지 못했습니다.");
    const found = wcDedupe(rs.flatMap(r => parseWorldCheck(w, r)));
    await wcJudgeCandidates(w, found);   // 핵심어로 걸린 문서는 판단을 받아 yes만 넣는다
    if (S.world !== w) return;
    await wcRefineLinks(w, found);       // 관련 문서의 본문 서술을 보고 link와 alts를 한 번 더 받는다
    await Promise.all(found.filter(x => x.undecided.length).map(x => wcRetryLink(w, x)));   // 정하지 않은 link는 그 결과만 한 번 다시 받는다
    for (const x of found) { x.linkBad = !!x.undecided.length; delete x.undecided; }
    if (S.world !== w) return;
    w.worldCheck = { at: Date.now(), items: wcAccumulate(w.worldCheck?.items, found) };   // open 제안도 버리지 않고 누적한다
    S.wcAlts = null; S.wcEdit = null;
    await Store.saveWorld(w);
  } catch (err) { S.wcErr = errMsg(err); }
  finally { if (S.wcBusy === w.id) S.wcBusy = null; if (S.world === w && S.view.name === "canon") { renderMain(); document.getElementById("worldCheck")?.scrollIntoView({ block: "start" }); } }
}
/* 연결을 확정한 뒤 관련 문서마다 확정 설정을 반영한다(wcFixDoc: 기존 고치기 흐름).
   사용자가 직접 고친 문서는 고치지 않고 '직접 확인 필요'로 남긴다. keys를 주면 그 문서만 다시 시도한다 */
async function worldCheckBatch(w, x, keys = wcTargets(x)) {
  if (S.wcRun || !x.linked || x.kind === "first") return;   // first는 일괄 반영하지 않는다
  const b = x.batch ||= { done: [], none: [], failed: [], manual: [] };
  for (const f of WC_BATCH) b[f] ||= [];
  const todo = keys.filter(k => S.pages[k]);
  for (const f of WC_BATCH) b[f] = b[f].filter(k => !todo.includes(k));
  delete b.left; delete b.stopped;
  const run = S.wcRun = { id: x.id, n: 0, total: todo.length, cur: "", stop: false };
  const show = () => { const el = document.getElementById("wcRun-" + x.id); if (el) el.textContent = `관련 문서에 반영하는 중 ${run.n}/${run.total}${run.cur ? ` · 「${run.cur}」` : ""}`; };
  if (S.world === w && S.view.name === "canon") renderMain();
  try {
    for (const [i, k] of todo.entries()) {
      if (run.stop) { b.left = todo.slice(i); b.stopped = true; break; }   // 멈추면 남은 문서는 건드리지 않는다
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
  if (b.stopped) { toast(`반영을 멈췄습니다. 고친 문서: ${b.done.map(k => `「${S.pages[k]?.title || "?"}」`).join(", ") || "없음"}. 남은 ${b.left.length}개는 건드리지 않았습니다.`); return; }
  toast(`관련 문서 ${todo.length}개 중 ${b.done.length}개를 고쳤습니다.${b.failed.length ? ` 실패 ${b.failed.length}개는 다시 시도할 수 있습니다.` : ""}${b.manual.length ? ` 직접 고친 문서 ${b.manual.length}개는 직접 확인해 주세요.` : ""}`);
}
/* 일괄 반영 [멈추기]: 지금 고치는 문서까지만 마치고 멈춘다 */
function wcStopBatch(id) {
  const run = S.wcRun; if (!run || run.id !== id || run.stop) return false;
  run.stop = true;
  const el = document.getElementById("wcStop-" + id); if (el) { el.disabled = true; el.textContent = "멈추는 중…"; }
  return true;
}
/* first: 주장한 문서 하나만, 그 표현의 범위를 좁히거나 '최초'를 빼도록 고치기 화면을 연다. 사용자 확정 설정은 건드리지 않는다 */
function wcClaimIssue(w, x, k) {
  const others = (x.docs || []).filter(d => d !== k).slice(0, 8).map(d => `「${S.pages[d]?.title || w.entities[d]?.title || "?"}」`).join(", ");
  return { claim: `세계 전체 점검('최초' 주장 충돌): ${x.claim || x.title}`, severity: "high",
    conflict: `${x.detail}${others ? ` 더 이른 기록이 있는 문서: ${others}.` : ""} 이 문서에서 그 주장 표현만 고친다. '최초·처음·유일'의 범위를 좁히거나(예: 지역, 분야, 방식을 한정) 그 말을 뺀다. 다른 서술은 바꾸지 않고, 새 설정을 만들지 않는다.${x.fix ? ` 고칠 방향: ${x.fix}` : ""}` };
}
/* 추가 후보의 체크. 일괄 고치기는 체크한 후보에만 적용한다 */
async function wcToggleExtra(id, k, on) {
  const w = S.world, x = w?.worldCheck?.items?.find(y => y.id === id), e = x?.extra?.find(y => y.k === k); if (!e) return;
  e.on = !!on; S.wcFocus = id;
  try { await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
/* 제안 하나에 대한 사용자의 선택. arg: fix면 문서 키, alt면 대안 번호, edit면 사용자가 고친 문장 */
async function worldCheckAction(id, what, arg) {
  const w = S.world, x = w?.worldCheck?.items?.find(y => y.id === id); if (!x) return;
  S.wcFocus = id;   // 다시 그려도 이 제안이 접힌 목록 안에 숨지 않게
  if (what === "link" || what === "alt" || what === "edit") {
    if (x.kind === "first") { toast("'최초' 주장 충돌은 연결 설정을 만들지 않습니다. [그 주장 고치기]를 눌러 주세요."); return; }
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
  if (what === "resume") { if (x.status === "linked" && x.batch?.left?.length) await worldCheckBatch(w, x, x.batch.left.slice()); return; }
  if (what === "claim") {
    if (x.kind !== "first") return;
    const k = wcClaimDoc(w, x), p = S.pages[k]; if (!p) { toast("주장한 문서를 찾지 못했습니다."); return; }
    if (S.gen && S.gen.key === k) { toast("이 문서를 작성하는 중입니다."); return; }
    x.claimDoc = k; x.status = "fix";
    try { await Store.saveWorld(w); } catch {}
    startFix({ key: k, items: [wcClaimIssue(w, x, k)], sel: new Set([0]), phase: "pick", edits: [], note: "", err: "", skipped: 0 });
    return;
  }
  if (what === "close") { w.worldCheck.items = w.worldCheck.items.filter(y => y !== x); S.wcFocus = null; }
  else if (what === "keep") x.status = "kept";
  else if (what === "fix") {
    const p = S.pages[arg]; if (!p || !wcTargets(x).concat((x.extra || []).map(e => e.k)).includes(arg)) return;
    if (S.gen && S.gen.key === arg) { toast("이 문서를 작성하는 중입니다."); return; }
    if (x.status === "open") x.status = "fix";
    try { await Store.saveWorld(w); } catch {}
    const others = x.docs.filter(k => k !== arg).slice(0, 12).map(k => `「${S.pages[k]?.title || w.entities[k]?.title}」`).join(", ");
    const items = [{ claim: `세계 전체 점검: ${x.title}`, conflict: `${x.detail}${others ? ` 함께 볼 문서: ${others}.` : ""}${x.linked ? ` 확정한 설정: ${x.linked}` : ""} 고칠 방향: ${x.fix || x.link}`, severity: "high" }];
    startFix({ key: arg, items, sel: new Set([0]), phase: "pick", edits: [], note: "", err: "", skipped: 0 });
    return;
  } else if (what === "reopen") x.status = "open";
  renderMain(); document.getElementById("wc-" + id)?.scrollIntoView({ block: "center" });
  try { await Store.saveWorld(w); toast("저장했습니다."); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
}
