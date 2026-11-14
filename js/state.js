"use strict";
/* 앱 상태, 주소(Nav), 설정 정리 도우미 */
/* ---------- state ---------- */
const S = {
  ready: false, worlds: [], world: null, pages: {}, view: { name: "home" }, recent: [],
  gen: null, genErr: null, checking: null, sample: null, sampleReady: false,
  creating: false, createErr: null, seed: "", seedTab: "own", ownSeed: "", dice: null, whatIfs: null, first: "", guideIn: "",
  discovery: null, worldExports: Object.create(null), confirmDel: null, confirmRewrite: null, canonFilter: "all", focusEnt: null, nf: new Set(),
  edit: null, refreshing: null, confirmDelPage: null, confirmMerge: null, compose: null, portraitJob: null, imageGen: null, proseGen: null,
  mode: "basic", storyN: 5, protoDesc: "", cast: [], regen: null, storyGen: null, syncQ: [], syncing: null, syncErr: null, hold: null, adv: null, storyCard: null
};

/* 주소/방문 기록에는 저장된 화면만 담는다. 복원은 생성·검사를 시작하지 않는다. */
const Nav = {
  active: false, restoring: false, current: "", pos: 0, pending: null, scrollTimer: null,
  route() {
    let view = S.view.name, key = S.view.key;
    if (view === "jobs") return { view, ...(S.view.job ? { job: S.view.job } : {}) };
    if (["loading"].includes(view)) return null;
    if (["fix", "compose", "advance"].includes(view)) { view = "article"; key ||= S.world?.mainKey; }
    const r = { view };
    if (view !== "home" && S.world) r.world = S.world.id;
    if (view === "article") r.key = key || S.world?.mainKey;
    if (view === "notfound") r.title = S.view.title;
    if (view === "category") r.cat = S.view.cat;
    return r;
  },
  hash(r) { return "#" + new URLSearchParams(Object.entries(r).filter(([, v]) => typeof v === "string")).toString(); },
  read() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has("view")) return null;
    const view = q.get("view");
    if (!["home", "gset", "log", "jobs", "article", "canon", "notfound", "discovery", "epilogue", "category", "categories"].includes(view)) return { view: "home" };
    return { view, ...(q.get("job") ? { job: q.get("job") } : {}), ...(q.get("cat") ? { cat: q.get("cat") } : {}), ...(q.get("world") ? { world: q.get("world") } : {}), ...(q.get("key") ? { key: q.get("key") } : {}), ...(q.get("title") ? { title: q.get("title") } : {}) };
  },
  write(replace = false, y = 0) {
    const r = this.route(); if (!r) return;
    const hash = this.hash(r);
    if (!replace && hash === this.current) return;
    if (!replace) {
      history.replaceState({ ...history.state, wwNav: { pos: this.pos, y: scrollY } }, "");
      this.pos++;
    }
    history[replace ? "replaceState" : "pushState"]({ wwNav: { pos: this.pos, y } }, "", location.pathname + location.search + hash);
    this.current = hash;
  },
  sync() { if (this.active && !this.restoring && S.ready) this.write(); },
  async apply(r) {
    if (r.view === "jobs") { S.view = { name: "jobs", ...(r.job ? { job: r.job } : {}) }; return; }
    if (r.world) {
      if (!S.worlds.some(w => w.id === r.world)) { S.world = null; S.view = { name: "home" }; toast("저장된 세계관을 찾을 수 없습니다."); return; }
      if (S.world?.id !== r.world) await openWorld(r.world, r.key, true);
      if (S.world?.id !== r.world) return;
    } else if (!["home", "gset", "log"].includes(r.view)) { S.view = { name: "home" }; return; }
    if (!r.world && !S.gen && !S.storyGen && !S.syncing) S.world = null;
    if (r.view === "article") {
      let k = r.key; const w = S.world;
      if (!w.entities[k] && w.aliases?.[k]) k = w.aliases[k];
      if (!w.entities[k]) { k = w.mainKey; toast("이 문서는 없어져 세계관 대문을 열었습니다."); }
      S.view = { name: "article", key: k };
      S.recent = [k, ...S.recent.filter(x => x !== k)].slice(0, 8);
      return;
    }
    if (r.view === "discovery" && S.discovery?.wid !== r.world) S.discovery = { wid: r.world, direction: "", busy: false, error: "" };
    S.view = { name: r.view, ...(r.view === "notfound" ? { title: r.title || "" } : {}), ...(r.view === "category" ? { cat: r.cat || "" } : {}) };
  },
  async restore(r, state) {
    this.pending = { r, state };
    if (this.restoring) return;
    this.restoring = true;
    try {
      while (this.pending) {
        const next = this.pending; this.pending = null;
        await this.apply(next.r);
        if (this.pending) continue;
        this.pos = next.state?.pos ?? this.pos;
        renderAll(); this.write(true, next.state?.y || 0);
        window.scrollTo({ top: next.state?.y || 0, behavior: "instant" });
      }
    } catch (e) { toast("화면을 복원하지 못했습니다. " + errMsg(e)); S.world = null; S.view = { name: "home" }; renderAll(); this.write(true); }
    finally { this.restoring = false; }
  }
};
window.addEventListener("popstate", () => {
  if (!Nav.active) return;
  const r = Nav.read() || { view: "home" }, state = history.state?.wwNav;
  if (!Nav.restoring && Nav.hash(r) === Nav.current) return;
  const crossWorld = r.world && r.world !== S.world?.id;
  if (S.edit || S.discovery?.busy || (crossWorld && (S.gen || S.storyGen || S.syncing || S.checking || S.portraitJob || S.imageGen?.busy || S.proseGen?.busy))) {
    toast(S.edit ? "편집 내용을 저장하거나 취소한 뒤 이동해 주세요." : "진행 중인 작업을 마치거나 중단한 뒤 이동해 주세요.");
    if (state && state.pos !== Nav.pos) history.go(Nav.pos - state.pos);
    else Nav.write(true);
    return;
  }
  Nav.restore(r, state);
});
function saveNavScroll() {
  clearTimeout(Nav.scrollTimer); Nav.scrollTimer = null;
  if (Nav.active && !Nav.restoring && location.hash === Nav.current) history.replaceState({ ...history.state, wwNav: { pos: Nav.pos, y: scrollY } }, "");
}
// iOS Safari의 History API 호출 제한에 걸리지 않도록 스크롤 기록을 묶는다.
window.addEventListener("scroll", () => { if (!Nav.scrollTimer) Nav.scrollTimer = setTimeout(saveNavScroll, 500); }, { passive: true });
window.addEventListener("pagehide", saveNavScroll);

/* 장을 반영한 문서는 설정 검사와 고치기가 끝날 때까지 이전 버전을 보여 준다. hold: { wid, key, page(이전 버전) } */
const shownPage = k => S.hold && S.hold.key === k && S.hold.wid === S.world?.id ? S.hold.page : S.pages[k];
const isHeld = k => !!S.hold && S.hold.key === k && S.hold.wid === S.world?.id;

/* ---------- canon helpers ---------- */
const newEntity = (title, type, summary) => ({ title: norm(title), type: type || "", summary: summary || "", facts: [], mentions: [], page: false, box: "" });
/* 모델이 목록의 유형 표시까지 제목으로 베껴 "김형식(인물)"처럼 쓰는 경우: 원래 이름의 항목이 있으면 그 항목으로 본다 */
const TYPE_SUFFIX = new RegExp("^(.+?)\\s*[(（]\\s*(?:" + TYPES.join("|") + ")\\s*[)）]$");
const IDENTITY_LABEL = /^(?:본명|성명|이름|코드명|암호명|제식명|활동명|별칭|별명|가명|정식명(?:칭)?|공식명(?:칭)?|옛이름|이전명칭)$/;
const identityName = t => norm(stripMarks(t)).normalize("NFKC").toLowerCase().replace(/[‘’'“”"\s]/g, "").replace(/[‐‑‒–—−]/g, "-");
const protectedEntity = (w, k) => k === w.mainKey || (isStory(w) && (k === w.story.protagonistKey || (w.story.cast || []).some(c => c.key === k)));
/* 인포박스가 명시한 다른 이름만 읽는다. 탑승자·조종사·운용 장비는 이름으로 취급하지 않는다. */
function identityOwner(w, title, except) {
  if (S.world !== w) return null;
  const name = identityName(title); if (!name) return null;
  let owner = null;
  for (const [k, p] of Object.entries(S.pages)) {
    if (k === except || !w.entities[k] || w.entities[except]?.notSame?.includes(k) || w.entities[k].notSame?.includes(except)) continue;
    const names = [p.title];
    for (const row of p.infobox || []) if (IDENTITY_LABEL.test(stripMarks(row.label).replace(/\s/g, ""))) {
      names.push(row.value);
      for (const m of String(row.value).matchAll(LINK_RE)) names.push(m[1], m[2] || m[1]);
    }
    if (!names.some(n => identityName(n) === name)) continue;
    if (owner) return null;   // 여러 문서가 같은 이름을 쓰면 자동으로 고르지 않는다
    owner = k;
  }
  return owner;
}
/* 성이나 이름 한 단어("벡")가 정확히 한 인물("마커스 벡")의 이름 첫 단어나 끝 단어와 같으면 그 인물의 키 */
function nameOwner(w, t, except) {
  t = norm(t); if (!t || /\s/.test(t) || t.length > 10) return null;
  let hit = null;
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === except || o.type !== "인물") continue;
    const parts = o.title.replace(/\(.*\)$/, "").trim().split(/[\s·]+/).filter(Boolean);
    if (parts.length < 2 || (parts[0] !== t && parts[parts.length - 1] !== t)) continue;
    if (hit) return null;   // 같은 성을 쓰는 인물이 둘 이상이면 정할 수 없다
    hit = k;
  }
  return hit;
}
function canonTitle(w, t) {
  t = norm(t); if (!w || !t) return t;
  const k = keyOf(t);
  if ((S.world === w && S.pages[k]) || protectedEntity(w, k)) return t;
  const named = identityOwner(w, t, k); if (named) return w.entities[named].title;
  if (w.entities[k]) return t;
  const al = w.aliases?.[k]; if (al && w.entities[al]) return w.entities[al].title;   // 합쳐진 이름은 남은 항목으로 넘어간다
  const m = TYPE_SUFFIX.exec(t); if (m && w.entities[keyOf(norm(m[1]))]) return norm(m[1]);
  const o = nameOwner(w, t); if (o) return w.entities[o].title;
  return t;
}
const kOf = (w, t) => keyOf(canonTitle(w, t));
/* 본문의 [[김형식(인물)]] → [[김형식]], [[벡]] → [[마커스 벡|벡]] */
const cleanLinks = (w, text) => String(text ?? "").replace(LINK_RE, (m, a, b) => {
  const c = canonTitle(w, a); if (c === norm(a)) return m;
  const label = b || (TYPE_SUFFIX.test(norm(a)) ? "" : norm(a));
  return `[[${c}${label && label !== c ? "|" + label : ""}]]`;
});
/* 사실과 언급은 저장할 때 지우지 않는다. 프롬프트에 넣을 것은 pickRelevant가 고른다.
   저장 상한을 넘으면 가장 오래된 기록을 같은 문서에서 온 다음 기록과 한 줄로 합친다(출처가 하나로 남아 문서별 정리가 그대로 된다).
   합칠 짝이 없으면 상한을 넘어도 그대로 둔다 */
const FACT_CAP = 200, MENTION_CAP = 300;
function compactLedger(list, srcOf, field, cap) {
  while (list.length > cap) {
    let merged = false;
    for (let i = 0; i < list.length && !merged; i++) {
      const a = list[i]; if (srcOf(a) === "user" || a.sup) continue;   // 사용자가 정한 것, 대체된 것은 합치지 않는다
      const j = list.findIndex((b, x) => x > i && !b.sup && srcOf(b) === srcOf(a)); if (j < 0) continue;
      a[field] = a[field] + " / " + list[j][field]; a.merged = (a.merged || 1) + (list[j].merged || 1);
      list.splice(j, 1); merged = true;
    }
    if (!merged) return;
  }
}
const compactFacts = e => compactLedger(e.facts, f => f.src, "t", FACT_CAP);
const compactMentions = e => compactLedger(e.mentions, m => m.from, "text", MENTION_CAP);
function addFact(e, t, src) {
  t = stripMarks(t).slice(0, 240); if (!t || e.facts.some(f => f.t === t)) return;
  e.facts.push({ t, src }); compactFacts(e);
}
function addMention(e, from, text) {
  if (!text || e.mentions.some(m => m.from === from && m.text === text)) return;
  e.mentions.push({ from, text }); compactMentions(e);
}
/* 프롬프트에 넣을 사실·언급. 사용자가 정한 사실은 언제나 넣고, 나머지는 pickRelevant로 n개까지 */
const FACT_PROMPT_N = 40, MENTION_PROMPT_N = 30;
function promptFacts(w, k, list, focus, n = FACT_PROMPT_N) {
  const user = list.filter(f => f.src === "user"), rest = list.filter(f => f.src !== "user");
  const keep = new Set([...user, ...pickRelevant(w, k, rest, f => f.t, n, focus)]);
  return list.filter(f => keep.has(f));
}
const promptMentions = (w, k, list, focus, n = MENTION_PROMPT_N) => pickRelevant(w, k, list, m => m.text, n, focus);
/* 링크가 걸린 문장부터 같은 문단의 뒤 문장 두 개까지 (다음 문서가 맥락을 잃지 않게) */
function sentenceAround(t, idx, len) {
  const stop = /[.!?。\n]/, end = /[.!?。]/; let a = idx, b = idx + len, n = 0;
  while (a > 0 && !stop.test(t[a - 1])) a--;
  while (b < t.length && t[b] !== "\n") { if (end.test(t[b])) { n++; if (n >= 3 || b - a > 380) { b++; break; } } b++; }
  return stripMarks(t.slice(a, Math.min(t.length, b))).replace(/^[-\s]+/, "").trim().slice(0, 420);
}
const yearNum = y => { const m = String(y).match(/-?\d+/); if (!m) return NaN; let n = +m[0]; if (/기원전|BC|B\.C/i.test(y)) n = -Math.abs(n); return n; };
/* ---------- 연표 날짜와 정렬 ----------
   연표 항목 { year, month?, day?, event, src, ch?, dateAsk? }. month·day는 숫자이고, 새 항목은 처음부터 월·일을 확정해 받는다.
   dateAsk: 날짜가 비어 들어온 새 항목(askTimelineDates가 한 번 다시 묻고 지운다). 옛 항목에는 날짜를 채우지 않는다 */
const TL_MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function tlMD(m, d) {
  m = typeof m === "string" ? m.trim() : m; d = typeof d === "string" ? d.trim() : d;
  if (m === "" || d === "" || m == null || d == null) return null;
  m = +m; d = +d;
  return Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= TL_MONTH_DAYS[m - 1] ? { month: m, day: d } : null;
}
/* 연표 연도 칸("2016", "기원전 202", "건안 13", "제국력 312")을 기년법을 아는 yearHits로 읽는다. { y, cal } 또는 null */
function tlYear(w, year) {
  const y = String(year ?? "").trim(); if (!y) return null;
  const h = yearHits(/년\s*$/.test(y) ? y : y + "년", w)[0];
  if (h) return { y: h.y, cal: h.cal };
  const n = yearNum(y); return isNaN(n) ? null : { y: n, cal: "" };
}
/* 월·일이 없는 기년법(세계관을 만들 때 undatedCalendars로 받은 것)의 연도면 날짜를 묻지 않는다 */
const tlNeedsDate = (w, year) => { const h = tlYear(w, year); return !(h && h.cal && (w.undatedCalendars || []).includes(h.cal)); };
/* 정렬 기준: 기년법 묶음마다 연도 → 월 → 일. 날짜가 없는 항목은 그 해의 끝, 같으면 넣은 순서(안정 정렬).
   기년법이 다른 연도끼리는 비교하지 않고, 묶음 사이의 순서는 각 묶음의 첫 항목이 들어온 순서를 따른다. 연도를 읽지 못한 항목은 맨 뒤에 넣은 순서대로 */
function timelineOrder(list, w = S.world) {
  const groups = new Map(), rest = [];
  list.forEach((t, i) => {
    const h = tlYear(w, t?.year); if (!h) { rest.push(t); return; }
    const md = tlMD(t.month, t.day);
    (groups.get(h.cal) || groups.set(h.cal, []).get(h.cal)).push({ t, i, y: h.y, m: md ? md.month : 13, d: md ? md.day : 32 });
  });
  return [...[...groups.values()].flatMap(g => g.sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d || a.i - b.i).map(x => x.t)), ...rest];
}
/* 연표를 기준대로 다시 정렬한다. 순서가 바뀌었으면 true. 항목은 건드리지 않는다 */
function sortTimeline(w) {
  const before = w.timeline || [], after = timelineOrder(before, w);
  if (after.every((t, i) => t === before[i])) return false;
  w.timeline = after; return true;
}
/* 표시: 날짜가 있으면 "2016년 3월 14일", 없으면 연도 칸 그대로 */
function tlWhen(t) {
  const md = tlMD(t.month, t.day), y = String(t.year ?? "");
  return md ? `${/년\s*$/.test(y) ? y : y + "년"} ${md.month}월 ${md.day}일` : y;
}
const TL_DATE_SPEC = `연표(timeline)의 모든 사건은 월과 일까지 정한다. month와 day는 숫자로 쓰고, 계절, 초·중·말, '무렵' 같은 모호한 표현은 쓰지 않는다. 같은 사건이 사건 장부, 확정 사실, 다른 문서의 언급에 날짜와 함께 있으면 그 날짜를 그대로 쓴다. 이 세계의 기년법에 달이 없으면(아래 '월·일이 없는 기년법') month와 day를 빈 문자열로 둔다.`;
const tlDateNote = w => (w.undatedCalendars || []).length ? `\n월·일이 없는 기년법: ${w.undatedCalendars.join(", ")}` : "";
function addTimeline(w, t, src, ch) {
  if (!t || !t.year || !t.event) return null;
  const ev = stripMarks(t.event).slice(0, 200), yr = String(t.year).slice(0, 24);
  if (w.timeline.some(x => x.year === yr && x.event === ev)) return null;
  const x = ch ? { year: yr, event: ev, src, ch } : { year: yr, event: ev, src };
  const md = tlMD(t.month, t.day);
  if (md) Object.assign(x, md); else if (tlNeedsDate(w, yr)) x.dateAsk = 1;
  w.timeline.push(x);
  w.timeline = timelineOrder(w.timeline, w);
  return x;
}
/* 사실과 언급의 상태: sup = 다른 문서의 직접 수정으로 대체됨 (생성에서 제외) */
const live = x => !x.sup;
const factLine = f => f.t + (f.src === "user" || S.pages[f.src]?.editedAt ? " [사용자 확정]" : "");
/* 인물 관계: {id, a, b, type?, since?, rel, story, src, prev?, sup?} — a, b는 항목 키.
   type은 관계의 성격(REL_TYPES), since는 시작 연도(모르면 빈 값), rel은 짧은 표시용 이름, story는 세부 뉘앙스.
   prev는 이 관계가 이어받은 이전 국면(관계 id). 생성 응답은 기존 관계를 번호(id)로 가리킨다:
   {"same": n} 기존과 같은 관계 · {"next": n, ...} 기존 관계의 새 국면 · {"a", "b", ...} 새 관계 */
const REL_TYPES = ["적대", "맞수", "동료", "상하", "사제", "가족", "연인", "기타"];
const relType = t => { t = norm(stripMarks(asText(t ?? ""))); return REL_TYPES.includes(t) ? t : ""; };
const relSince = y => { const t = norm(stripMarks(asText(y ?? ""))).slice(0, 16); return /\d/.test(t) ? t : ""; };
const relFixed = x => x.src === "user" || !!S.pages[x.src]?.editedAt;   // 사용자가 정했거나 직접 고친 문서에서 온 관계
const relRank = x => x.src === "user" ? 0 : S.pages[x.src]?.editedAt ? 1 : 2;
/* 번호가 없는 옛 관계에 번호를 붙인다. 번호는 한 번 붙으면 바뀌지 않는다 */
function ensureRelIds(w) {
  const list = w.relations || []; let n = w.relSeq || 0, changed = false;
  for (const x of list) if (Number.isInteger(x.id) && x.id > n) n = x.id;
  const seen = new Set();
  for (const x of list) { if (!Number.isInteger(x.id) || x.id < 1 || seen.has(x.id)) { x.id = ++n; changed = true; } seen.add(x.id); }   // 없거나 겹친 번호는 새로 붙인다
  if (w.relSeq !== n) w.relSeq = n;
  return changed;
}
const relById = (w, id) => (w.relations || []).find(x => x.id === +id) || null;
const fillRel = (x, story, since) => { if (!x.story && story) x.story = story; if (!x.since && since) x.since = since; };
/* 같은 쌍에서 x와 같은 관계로 볼 기록. type이 같으면 같은 관계다. 다만 next로 이어진 국면끼리는 이어받은 국면까지 같아야 같다 */
function sameRelation(list, x) {
  const pair = list.filter(y => y !== x && !y.sup && samePair(y, x.a, x.b));
  const byKey = pair.find(y => relKey(y.rel) === relKey(x.rel) && (!x.type || !y.type || y.type === x.type));
  if (!x.type) return byKey || null;
  if (x.prev) {
    const prev = pair.find(y => y.id === x.prev);
    return pair.find(y => y.type === x.type && y.prev === x.prev) || (prev && prev.type === x.type ? prev : null) || (byKey && byKey.prev === x.prev ? byKey : null);
  }
  return pair.find(y => y.type === x.type && !y.prev) || pair.find(y => y.type === x.type) || byKey || null;
}
function addRelation(w, key, r) {
  if (!r || typeof r !== "object") return;
  w.relations ||= []; ensureRelIds(w);
  const story = stripMarks(asText(r.story || "")).slice(0, 260), since = relSince(r.since);
  if (r.same != null) { const x = relById(w, r.same); if (x && !x.sup) fillRel(x, story, ""); return; }   // 기존과 같은 관계: 새로 두지 않고 비어 있는 설명만 채운다
  let a, b, prev = 0;
  if (r.next != null) {
    const p = relById(w, r.next); if (!p || p.sup) return;
    a = p.a; b = p.b; prev = p.id;
  } else {
    if (!r.a || !r.b) return;
    a = kOf(w, r.a); b = kOf(w, r.b);
  }
  const type = relType(r.type), rel = stripMarks(asText(r.rel || "")).slice(0, 60) || type;
  if (a === b || !w.entities[a] || !w.entities[b] || !rel) return;
  const x = { id: 0, a, b, rel, story, src: key };
  if (type) x.type = type; if (since) x.since = since; if (prev) x.prev = prev;
  const same = sameRelation(w.relations, x);
  if (same) { fillRel(same, story, since); return; }   // 같은 두 사람 사이의 같은 관계는 출처가 달라도 한 번만 둔다
  x.id = ++w.relSeq;
  w.relations.push(x);
  if (w.relations.length > 500) w.relations.splice(w.relations.findIndex(y => !relFixed(y)), 1);
}
const samePair = (x, a, b) => (x.a === a && x.b === b) || (x.a === b && x.b === a);
const relKey = r => String(r || "").replace(/[\s·,()（）]/g, "");
/* 이미 쌓인 중복 관계를 하나로 합친다. 생긴 순서대로 보며 addRelation과 같은 기준으로 같은 관계를 찾고,
   사용자가 정한 것, 직접 수정한 문서의 것, 먼저 생긴 것 순으로 남긴다. 비어 있는 story와 since는 합쳐지는 기록에서 채우고,
   합쳐진 기록을 이어받던 국면은 남은 기록을 잇는다 */
function dedupeRelations(w) {
  const rels = w.relations || []; if (!rels.length) return 0;
  ensureRelIds(w);
  const kept = [], into = new Map(), res = id => { while (into.has(id)) id = into.get(id); return id; };
  for (const x of rels) {
    if (x.prev) x.prev = res(x.prev);
    const same = x.sup ? kept.find(y => y.sup && samePair(y, x.a, x.b) && relKey(y.rel) === relKey(x.rel)) : sameRelation(kept, x);
    if (!same) { kept.push(x); continue; }
    let keep = same, drop = x;
    if (relRank(x) < relRank(same)) { keep = x; drop = same; kept[kept.indexOf(same)] = x; if (!x.prev && same.prev) x.prev = same.prev; }
    fillRel(keep, drop.story, drop.since);
    if (drop.id !== keep.id) into.set(drop.id, keep.id);
  }
  for (const x of kept) { if (x.prev) x.prev = res(x.prev); if (x.prev === x.id) delete x.prev; }
  const before = rels.length;
  w.relations = kept;
  return before - kept.length;
}
const relationsOf = (w, k) => (w.relations || []).filter(x => (x.a === k || x.b === k) && w.entities[x.a] && w.entities[x.b]);
const relLine = (w, x) => `「${w.entities[x.a].title}」–「${w.entities[x.b].title}」: ${x.type ? x.type + (x.since ? `(${x.since}부터)` : "") + " · " : ""}${x.rel}${x.story ? ". " + x.story : ""}${relFixed(x) ? " [사용자 확정]" : ""}`;
/* 생성 프롬프트에 넣는 기존 관계(번호와 함께). keys 안의 두 사람 사이 관계 중 skip 문서가 낸 것은 빼고, focus가 낀 관계를 먼저 */
function relRefLines(w, keys, skip = "", focus = "", max = 24) {
  ensureRelIds(w);
  const ks = new Set(keys);
  const list = (w.relations || []).filter(x => live(x) && x.src !== skip && ks.has(x.a) && ks.has(x.b) && w.entities[x.a] && w.entities[x.b]);
  const pick = [...list.filter(x => x.a === focus || x.b === focus), ...list.filter(x => x.a !== focus && x.b !== focus)].slice(0, max);
  return list.filter(x => pick.includes(x)).map(x => `#${x.id} ${relLine(w, x)}${x.prev ? ` (#${x.prev}에서 바뀐 국면)` : ""}`);
}
function relRefBlock(w, keys, skip, focus, max) {
  const L = relRefLines(w, keys, skip, focus, max);
  return L.length ? `## 기존 인물 관계 (번호는 relations의 same, next에 쓴다. 모순 금지)\n${L.join("\n")}\n\n` : "";
}
const REL_SPEC = `relations의 각 항목은 다음 셋 중 하나다. (1) {"same": n}: '기존 인물 관계'의 n번과 같은 관계를 이 글이 다시 다뤘다. 새로 저장하지 않는다. (2) {"next": n, "type", "since", "rel", "story"}: n번 관계의 성격이 실제로 바뀐 새 국면이다(예: 적대하던 두 사람이 동료가 됨). type이 n번과 같으면 next가 아니라 same이다. (3) {"a", "b", "type", "since", "rel", "story"}: 목록에 없는 새 관계다. 같은 관계를 다른 말로 바꿔 새 관계로 넣지 않는다. type은 ${REL_TYPES.join(", ")} 중 하나, since는 그 관계가 시작된 연도(모르면 빈 문자열), rel은 짧은 표시용 이름(예: 스승과 제자, 의절한 형제)이고 세부 뉘앙스와 경과는 story에 쓴다.`;
const REL_JSON = `"relations":[{"same":3},{"next":5,"type":"동료","since":"연도","rel":"짧은 관계 이름","story":"..."},{"a":"인물 제목","b":"인물 제목","type":"${REL_TYPES.join("|")} 중 하나","since":"관계가 시작된 연도(모르면 빈 문자열)","rel":"짧은 관계 이름","story":"관계가 어떻게 시작해 어떻게 변했는지 한두 문장, 시점 포함"}]`;

/* 옛 관계 옮기기: type이 없는 관계가 같은 쌍에 둘 이상 있으면 quick 모델로 한 번에 type과 since를 매기고 국면 순서를 정해 합친다.
   사용자가 정했거나 직접 고친 문서의 관계는 바꾸지 않는다. 처리한 세계관에는 w.relMigrated를 남겨 다시 돌지 않는다.
   AI 연결이 없거나 실패하면 데이터를 그대로 둔다(화면은 relChips가 같은 쌍의 옛 기록을 최신 하나로 줄여 보여 준다) */
const REL_MIGRATE_PAIRS = 60;
function relMigrateGroups(w) {
  const groups = new Map();
  for (const x of w.relations || []) {
    if (x.sup || !w.entities[x.a] || !w.entities[x.b]) continue;
    const id = [x.a, x.b].sort().join("|"); (groups.get(id) || groups.set(id, []).get(id)).push(x);
  }
  return [...groups.values()].filter(xs => xs.length >= 2 && xs.some(x => !x.type && !relFixed(x)));
}
function relMigratePrompt(w, groups) {
  return `## 인물 관계 정리
가상 세계관 위키 「${w.title}」의 인물 관계 기록이다. 문서마다 같은 관계를 다른 말로 다시 적어 한 쌍에 기록이 여럿 쌓였다. 기록마다 type과 since를 매기고, 쌍 안에서 관계가 이어진 순서 order를 매긴다.
- type은 ${REL_TYPES.join(", ")} 중 하나다. 같은 관계를 다른 말로 쓴 기록에는 같은 type을 매긴다. 관계의 성격이 실제로 바뀐 경우에만 다른 type을 매긴다.
- since는 그 관계가 시작된 연도다. 기록에 나오지 않으면 빈 문자열.
- order는 쌍 안에서 그 관계(국면)가 시작된 순서로 1부터 매긴다. 같은 type의 기록은 같은 order를 매긴다.
- 기록에 적힌 내용만 근거로 삼고 새 내용을 지어내지 않는다.

${groups.map((xs, i) => `P${i + 1} 「${w.entities[xs[0].a].title}」–「${w.entities[xs[0].b].title}」\n${xs.map(x => `  #${x.id} ${x.type ? `[${x.type}] ` : ""}${x.rel}${x.story ? ". " + x.story : ""}`).join("\n")}`).join("\n")}

JSON 객체 하나만 출력: {"relations":[{"id":번호,"type":"${REL_TYPES.join("|")} 중 하나","since":"연도 또는 빈 문자열","order":1}]}`;
}
async function migrateRelations(w) {
  if (w.relMigrated || !S.sample) return false;
  ensureRelIds(w);
  const all = relMigrateGroups(w);
  for (let i = 0; i < all.length; i += REL_MIGRATE_PAIRS) {
    const groups = all.slice(i, i + REL_MIGRATE_PAIRS);
    let r;
    try { r = await callJson("relMigrate", relMigratePrompt(w, groups), { modelTier: "quick" }, { title: w.title + " · 인물 관계 정리" }); } catch { return false; }
    const got = new Map((Array.isArray(r?.relations) ? r.relations : []).filter(x => x && relType(x.type)).map(x => [+x.id, x]));
    if (!got.size) return false;
    for (const xs of groups) {
      const mine = new Set();
      for (const x of xs) {
        const g = got.get(x.id); if (!g || x.type || relFixed(x) || !w.relations.includes(x)) continue;
        x.type = relType(g.type); const since = relSince(g.since); if (since) x.since = since;
        mine.add(x);
      }
      // 국면 순서: order가 같거나 type이 이어지면 같은 국면, type이 바뀐 곳에서 앞 국면을 잇는다
      const ord = xs.filter(x => x.type && got.has(x.id)).map((x, i) => [x, +got.get(x.id).order || 0, i]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map(p => p[0]);
      let type = null, head = 0, prev = 0;
      for (const x of ord) {
        if (type !== null && x.type !== type) { prev = head; head = 0; }
        if (!head) { type = x.type; head = x.id; if (mine.has(x) && prev && !x.prev) x.prev = prev; continue; }
        if (mine.has(x) && prev && !x.prev) x.prev = prev;
      }
    }
  }
  dedupeRelations(w);
  w.relMigrated = 1;
  return true;
}
function purge(w, key) {
  for (const e of Object.values(w.entities)) {
    e.facts = e.facts.filter(f => f.src !== key); e.mentions = e.mentions.filter(m => m.from !== key);
    for (const x of [...e.facts, ...e.mentions]) if (x.sup?.by === key) delete x.sup;   // 이 문서가 대체했던 사실은 되살린다
  }
  w.timeline.forEach(t => { if (t.sup?.by === key) delete t.sup; });
  w.relations = (w.relations || []).filter(x => x.src !== key);
  w.relations.forEach(x => { if (x.sup?.by === key) delete x.sup; });
  w.timeline = w.timeline.filter(x => x.src !== key);
  if (w.events) w.events = w.events.filter(x => x.src !== key);
  if (w.glossary) purgeTerms(w, key);
}
/* 다시 쓰기 준비: 이전 버전이 남긴 흔적을 모두 걷어낸다. 실패하면 restoreRewrite로 되돌린다. */
function prepareRewrite(w, key) {
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], events: w.events || [], glossary: w.glossary || [] });
  purge(w, key);                                   // 이전 버전이 확정한 사실·언급·연표
  for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === key) delete w.navboxes[id];  // 이전 버전이 만든 틀
  const e = w.entities[key];
  e.summary = e.stub?.summary || "";               // 이전 버전이 덮어쓴 정의·유형·인포박스 → 링크 당시의 정의로 복원
  e.type = e.stub?.type || "";
  e.box = ""; e.page = false;
  for (const [k, o] of Object.entries(w.entities))  // 이전 버전만 언급하던 미작성 항목
    if (k !== key && o.origin === key && !o.page && !o.facts.length && !o.mentions.length) delete w.entities[k];
  return backup;
}
function restoreRewrite(w, backup) { const b = JSON.parse(backup); w.entities = b.entities; w.timeline = b.timeline; w.navboxes = b.navboxes; if (b.relations) w.relations = b.relations; if (b.events) w.events = b.events; if (b.glossary) w.glossary = b.glossary; }
const navboxesFor = (w, key) => Object.entries(w.navboxes || {}).filter(([, nb]) => nb.src === key || (nb.members || []).includes(key));
function navboxText(nb) {
  return `### 틀: ${nb.title} (총 ${nb.members.length}개 항목, 「${nb.srcTitle}」 문서에서 확정)\n` + nb.rows.map(r => `- ${r.label}: ${r.items.map(stripMarks).join(" / ")}`).join("\n");
}

function related(w, key) {
  const e = w.entities[key]; const blob = [e.summary, ...e.facts.map(f => f.t), ...e.mentions.map(m => m.text)].join(" ");
  const sc = {};
  for (const m of e.mentions) { sc[m.from] = (sc[m.from] || 0) + 3; const p = S.pages[m.from]; if (p) for (const l of p.links || []) if (l !== key) sc[l] = (sc[l] || 0) + 1; }
  const own = S.pages[key]; if (own) for (const l of own.links || []) sc[l] = (sc[l] || 0) + 2;
  for (const x of relationsOf(w, key)) if (live(x)) { const o = x.a === key ? x.b : x.a; sc[o] = (sc[o] || 0) + 3; }
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === key) continue;
    if (o.title.length >= 2 && blob.includes(o.title)) sc[k] = (sc[k] || 0) + 2;
    if (e.title.length >= 2 && o.facts.some(f => f.t.includes(e.title))) sc[k] = (sc[k] || 0) + 2;  // 이 항목에 소속되었다고 확정된 항목(구성원 등)
  }
  return Object.entries(sc).sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(k => k !== key && w.entities[k]).slice(0, 8);
}
/* 연표도 저장할 때는 지우지 않고, 프롬프트에 넣을 때 고른다. 원안 연표와 직접 수정한 문서의 항목은 언제나 넣고,
   나머지는 pickRelevant로 TIMELINE_PROMPT_N개까지. 고른 것은 연도 순서 그대로 둔다 */
const TIMELINE_PROMPT_N = 48;
function promptTimeline(w, focus, list = w.timeline || [], n = TIMELINE_PROMPT_N) {
  const items = list.filter(live), fixed = t => t.src === "seed" || !!S.pages[t.src]?.editedAt;
  const keep = new Set([...items.filter(fixed), ...pickRelevant(w, null, items.filter(t => !fixed(t)), t => `${t.year}년 ${t.event}`, n, focus)]);
  return timelineOrder(items.filter(t => keep.has(t)), w);
}
function canonBlock(w, focus = null) {
  const rules = (w.rules || []).map(r => "- " + r).join("\n") || "- (없음)";
  const tl = promptTimeline(w, focus).map(t => `- ${tlWhen(t)}: ${t.event}${S.pages[t.src]?.editedAt ? " [사용자 확정]" : ""}`).join("\n") || "- (없음)";
  return `## 세계관 원안\n${w.seed}\n\n## 핵심 규칙 (절대 위반 금지)\n이 규칙들은 어기면 안 되는 전제일 뿐, 문서마다 언급해야 할 소재가 아니다. 이 항목과 직접 관련된 규칙만 본문에 반영한다.\n${rules}\n\n## 사용자 확정 설정 (최우선. 다른 모든 정보보다 우선한다)\n${(w.userCanon || "").trim() || "(없음)"}\n\n## 연표\n${tl}${(w.glossary || []).length ? "\n\n" + glossaryBlock(w) : ""}`;
}
/* 검사의 기준: 검사하는 문서(p)보다 먼저 정해진 설정만. 원안·사용자 지정·이야기 장 줄거리·직접 수정한 문서는 언제나 기준이다.
   나중에 쓴 문서가 정한 설정과 어긋나면, 고칠 쪽은 그 나중 문서이므로 그쪽 검사에서 잡힌다 */
const refOK = (src, p) => { if (!src || src === "seed" || src === "user" || chOf(src) || !p) return true; const q = S.pages[src]; if (!q) return true; return !!q.editedAt || (q.createdAt || 0) <= (p.createdAt || 0); };
/* 검사할 문서(focus)와 관련된 것부터 n개 고른다. focus가 없으면 예전처럼 최신 n개.
   점수: focus의 연도와 겹침 > focus에 나온 다른 항목 이름과 겹침 > 생사·소속·연도가 든 사실. 동점이면 오래된 것(기준)부터 */
let focusMemo = null;
function focusInfo(w, focus) {
  if (focusMemo && focusMemo.w === w && focusMemo.focus === focus) return focusMemo;
  const years = new Set(yearHits(focus).map(h => h.cal + "|" + h.y));
  const names = [];   // [항목 키, 이름]
  for (const [x, o] of Object.entries(w.entities)) for (const n of namesOf(o.title)) if (focus.includes(n)) names.push([x, n]);
  return (focusMemo = { w, focus, years, names });
}
function pickRelevant(w, self, items, textOf, n, focus) {
  if (!focus) return items.slice(-n);
  const fi = focusInfo(w, focus), others = fi.names.filter(([x]) => x !== self).map(([, n]) => n);
  const score = t => {
    const ys = yearHits(t).map(h => h.cal + "|" + h.y);
    return (ys.some(y => fi.years.has(y)) ? 4 : 0) + (others.some(x => t.includes(x)) ? 2 : 0) + (ys.length || /사망|전사|숨[지졌]|죽[었은]|생존|살아|소속|입대|가입|탈퇴|퇴역|은퇴/.test(t) ? 1 : 0);
  };
  const top = new Set(items.map((x, i) => ({ i, s: score(textOf(x)) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map(x => x.i));
  return items.filter((_, i) => top.has(i));   // 고른 것은 원래 순서대로 보여 준다
}
function entityBrief(w, k, excludeSrc, okSrc, focus) {
  const o = w.entities[k];
  const facts = pickRelevant(w, k, o.facts.filter(f => f.src !== excludeSrc && live(f) && (!okSrc || okSrc(f.src))), f => f.t, 6, focus).map(f => "- " + factLine(f)).join("\n");
  const own = !okSrc || !S.pages[k] || okSrc(k);   // 그 항목의 문서가 나중에 쓰였으면 그 문서의 정의와 인포박스는 기준에서 뺀다
  const summary = own ? o.summary : (o.stub?.summary || ""), box = own ? o.box : "";
  return `### 「${o.title}」${o.type ? " · " + o.type : ""}${summary ? " — " + summary : ""}${box ? "\n정보: " + box : ""}${facts ? "\n" + facts : ""}`;
}
