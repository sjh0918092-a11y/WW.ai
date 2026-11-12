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
    if (["loading"].includes(view)) return null;
    if (["fix", "compose", "advance"].includes(view)) { view = "article"; key ||= S.world?.mainKey; }
    const r = { view };
    if (view !== "home" && S.world) r.world = S.world.id;
    if (view === "article") r.key = key || S.world?.mainKey;
    if (view === "notfound") r.title = S.view.title;
    return r;
  },
  hash(r) { return "#" + new URLSearchParams(Object.entries(r).filter(([, v]) => typeof v === "string")).toString(); },
  read() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has("view")) return null;
    const view = q.get("view");
    if (!["home", "gset", "log", "article", "canon", "notfound", "discovery", "epilogue"].includes(view)) return { view: "home" };
    return { view, ...(q.get("world") ? { world: q.get("world") } : {}), ...(q.get("key") ? { key: q.get("key") } : {}), ...(q.get("title") ? { title: q.get("title") } : {}) };
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
    S.view = { name: r.view, ...(r.view === "notfound" ? { title: r.title || "" } : {}) };
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
function addFact(e, t, src) {
  t = stripMarks(t).slice(0, 240); if (!t || e.facts.some(f => f.t === t)) return;
  e.facts.push({ t, src }); if (e.facts.length > 24) e.facts.splice(e.facts.findIndex(f => f.src !== "user"), 1);
}
function addMention(e, from, text) {
  if (!text || e.mentions.some(m => m.from === from && m.text === text)) return;
  e.mentions.push({ from, text }); if (e.mentions.length > 6) e.mentions.shift();
}
/* 링크가 걸린 문장부터 같은 문단의 뒤 문장 두 개까지 (다음 문서가 맥락을 잃지 않게) */
function sentenceAround(t, idx, len) {
  const stop = /[.!?。\n]/, end = /[.!?。]/; let a = idx, b = idx + len, n = 0;
  while (a > 0 && !stop.test(t[a - 1])) a--;
  while (b < t.length && t[b] !== "\n") { if (end.test(t[b])) { n++; if (n >= 3 || b - a > 380) { b++; break; } } b++; }
  return stripMarks(t.slice(a, Math.min(t.length, b))).replace(/^[-\s]+/, "").trim().slice(0, 420);
}
const yearNum = y => { const m = String(y).match(/-?\d+/); if (!m) return NaN; let n = +m[0]; if (/기원전|BC|B\.C/i.test(y)) n = -Math.abs(n); return n; };
function addTimeline(w, t, src, ch) {
  if (!t || !t.year || !t.event) return;
  const ev = stripMarks(t.event).slice(0, 200), yr = String(t.year).slice(0, 24);
  if (w.timeline.some(x => x.year === yr && x.event === ev)) return;
  w.timeline.push(ch ? { year: yr, event: ev, src, ch } : { year: yr, event: ev, src });
  w.timeline = w.timeline.map((x, i) => [x, i]).sort((a, b) => { const A = yearNum(a[0].year), B = yearNum(b[0].year); if (isNaN(A) && isNaN(B)) return a[1] - b[1]; if (isNaN(A)) return 1; if (isNaN(B)) return -1; return A - B || a[1] - b[1]; }).map(x => x[0]);
  if (w.timeline.length > 48) w.timeline.splice(w.timeline.findIndex(x => x.src !== "seed"), 1);
}
/* 사실과 언급의 상태: sup = 다른 문서의 직접 수정으로 대체됨 (생성에서 제외) */
const live = x => !x.sup;
const factLine = f => f.t + (f.src === "user" || S.pages[f.src]?.editedAt ? " [사용자 확정]" : "");
/* 인물 관계: {a, b, rel, story, src, sup?} — a, b는 항목 키 */
function addRelation(w, key, r) {
  if (!r || !r.a || !r.b || !r.rel) return;
  const a = kOf(w, r.a), b = kOf(w, r.b);
  if (a === b || !w.entities[a] || !w.entities[b]) return;
  const rel = stripMarks(r.rel).slice(0, 60), story = stripMarks(r.story || "").slice(0, 260);
  w.relations ||= [];
  // 같은 두 사람 사이의 같은 관계는 출처가 달라도 한 번만 둔다. 앞선 기록에 설명이 없으면 채운다
  const same = w.relations.find(x => !x.sup && samePair(x, a, b) && relKey(x.rel) === relKey(rel));
  if (same) { if (!same.story && story) same.story = story; return; }
  w.relations.push({ a, b, rel, story, src: key });
  if (w.relations.length > 500) w.relations.splice(w.relations.findIndex(x => !S.pages[x.src]?.editedAt), 1);
}
const samePair = (x, a, b) => (x.a === a && x.b === b) || (x.a === b && x.b === a);
const relKey = r => String(r || "").replace(/[\s·,()（）]/g, "");
/* 이미 쌓인 중복 관계를 하나로 합친다. 사용자가 정한 것, 직접 수정한 문서의 것, 먼저 생긴 것 순으로 남긴다 */
function dedupeRelations(w) {
  const rank = x => x.src === "user" ? 0 : S.pages[x.src]?.editedAt ? 1 : 2;
  const list = (w.relations || []).map((x, i) => [x, i]).sort((p, q) => rank(p[0]) - rank(q[0]) || p[1] - q[1]);
  const keep = new Map();
  for (const [x] of list) {
    const id = [x.a, x.b].sort().join("|") + "|" + relKey(x.rel) + "|" + (x.sup ? "sup" : "");
    const k = keep.get(id); if (k) { if (!k.story && x.story) k.story = x.story; continue; }
    keep.set(id, x);
  }
  const kept = new Set(keep.values()), before = (w.relations || []).length;
  w.relations = (w.relations || []).filter(x => kept.has(x));
  return before - w.relations.length;
}
const relationsOf = (w, k) => (w.relations || []).filter(x => (x.a === k || x.b === k) && w.entities[x.a] && w.entities[x.b]);
const relLine = (w, x) => `「${w.entities[x.a].title}」–「${w.entities[x.b].title}」: ${x.rel}${x.story ? ". " + x.story : ""}${x.src === "user" || S.pages[x.src]?.editedAt ? " [사용자 확정]" : ""}`;
function purge(w, key) {
  for (const e of Object.values(w.entities)) {
    e.facts = e.facts.filter(f => f.src !== key); e.mentions = e.mentions.filter(m => m.from !== key);
    for (const x of [...e.facts, ...e.mentions]) if (x.sup?.by === key) delete x.sup;   // 이 문서가 대체했던 사실은 되살린다
  }
  w.timeline.forEach(t => { if (t.sup?.by === key) delete t.sup; });
  w.relations = (w.relations || []).filter(x => x.src !== key);
  w.relations.forEach(x => { if (x.sup?.by === key) delete x.sup; });
  w.timeline = w.timeline.filter(x => x.src !== key);
}
/* 다시 쓰기 준비: 이전 버전이 남긴 흔적을 모두 걷어낸다. 실패하면 restoreRewrite로 되돌린다. */
function prepareRewrite(w, key) {
  const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [] });
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
function restoreRewrite(w, backup) { const b = JSON.parse(backup); w.entities = b.entities; w.timeline = b.timeline; w.navboxes = b.navboxes; if (b.relations) w.relations = b.relations; }
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
function canonBlock(w) {
  const rules = (w.rules || []).map(r => "- " + r).join("\n") || "- (없음)";
  const tl = (w.timeline || []).filter(live).map(t => `- ${t.year}: ${t.event}${S.pages[t.src]?.editedAt ? " [사용자 확정]" : ""}`).join("\n") || "- (없음)";
  return `## 세계관 원안\n${w.seed}\n\n## 핵심 규칙 (절대 위반 금지)\n이 규칙들은 어기면 안 되는 전제일 뿐, 문서마다 언급해야 할 소재가 아니다. 이 항목과 직접 관련된 규칙만 본문에 반영한다.\n${rules}\n\n## 사용자 확정 설정 (최우선. 다른 모든 정보보다 우선한다)\n${(w.userCanon || "").trim() || "(없음)"}\n\n## 연표\n${tl}`;
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
