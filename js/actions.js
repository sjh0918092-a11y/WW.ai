"use strict";
/* 세계관 생성, 문서 열기·생성·통합 */
/* ---------- actions ---------- */
async function createWorld() {
  const seed = S.seed.trim();
  if (seed.length < 10) { toast("원안을 한두 문장 이상 적어 주세요."); return; }
  if (!S.sample) { S.createErr = ERR.no_sample; renderMain(); return; }
  S.creating = true; S.createErr = null; renderMain();
  try {
    const first = norm(S.first).slice(0, 60), story = S.mode === "story";
    const guide = String(S.guideIn || "").replace(/\r/g, "").trim().slice(0, 1000);
    const user = story ? { total: Math.min(STORY_MAX, Math.max(STORY_MIN, +S.storyN || STORY_DEF)), desc: String(S.protoDesc || "").replace(/\r/g, "").trim().slice(0, 500), cast: (S.cast || []).map(c => ({ name: norm(c.name).slice(0, 40), desc: norm(c.desc).slice(0, 300), rel: norm(c.rel).slice(0, 120) })).filter(c => c.name).slice(0, 8) } : {};
    const b = await callJson(story ? "storyBible" : "bible", biblePrompt(seed, first, guide, story, user), { modelTier: "default" }, { title: first });
    if (!b || !b.title) throw { code: "invalid_json" };
    if (story && !(b.chapter1 && b.chapter1.summary)) throw { code: "invalid_json" };
    const w = { kind: "world", id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: norm(b.title).slice(0, 40), tagline: String(b.tagline || "").slice(0, 160), seed, style: "encyc",
      era: String(b.era || "미상").slice(0, 40), historical: b.historical === true || b.historical === "true", guide, tone: normTone(b.tone, ""), rules: (Array.isArray(b.rules) ? b.rules : []).map(r => stripMarks(asText(r))).filter(Boolean).slice(0, 10),
      calendars: cleanCalendars(b.calendars), timeline: [], userCanon: "", entities: {}, mainKey: null, createdAt: Date.now() };
    for (const t of (Array.isArray(b.timeline) ? b.timeline : [])) addTimeline(w, t, "seed");
    const mt = first || norm(b.mainTitle || b.title);
    w.mainKey = keyOf(mt); w.entities[w.mainKey] = newEntity(mt, "", "");
    if (story) setupStory(w, b, user);
    w.input = { first, ...(story ? { total: user.total, protoDesc: user.desc, cast: user.cast } : {}) };   // 다시 만들기에 쓰는 처음 입력값
    const rg = S.regen && !S.regen.keep ? S.worlds.find(x => x.id === S.regen.wid) : null;
    if (rg) {   // 다시 만들기: 새 설정 노트가 나온 뒤에야 기존 세계관과 문서를 지운다(실패하면 아무것도 지우지 않는다)
      if (S.gen?.wid === rg.id || ((S.storyGen || S.syncing) && S.world?.id === rg.id)) throw { code: "busy", message: "이 세계관에서 작성 중인 문서가 있습니다. 끝난 뒤 다시 만들어 주세요." };
      w.id = rg.id; w.createdAt = rg.createdAt || w.createdAt;
      for (const k of Object.keys(await Store.listPages(rg.id))) Sync.mark("dp", rg.id, k);   // 서버에 남은 옛 문서도 지운다
      await Store.deleteWorld(rg.id);
      S.worlds = S.worlds.filter(x => x.id !== rg.id);
      if (S.world?.id === rg.id) { S.world = null; S.pages = {}; }
    }
    await Store.saveWorld(w);
    S.worlds.unshift(w); S.creating = false; S.regen = null;
    S.seed = S.ownSeed = S.first = S.guideIn = S.protoDesc = ""; S.cast = []; S.seedTab = "own"; S.dice = null; S.whatIfs = null;   // 만들고 나면 입력란을 모두 비운다
    await openWorld(w.id);
  } catch (e) { S.creating = false; S.createErr = errMsg(e); renderMain(); }
}

/* 스토리 모드 세계관 준비: 주인공(=첫 문서), 숨겨진 뼈대, 1장 */
function setupStory(w, b, user = {}) {
  const pr = b.protagonist && typeof b.protagonist === "object" ? b.protagonist : {};
  const sp = Array.isArray(b.spine) ? b.spine : [];
  const total = Math.min(STORY_MAX, Math.max(STORY_MIN, +user.total || STORY_DEF));
  const spine = beatsFor(total).map((beat, i) => { const x = sp.find(y => +y?.n === i + 1) || sp[i] || {}; return { n: i + 1, beat, intent: stripMarks(x.intent || "").slice(0, 300) || `${beat}: 앞선 사건과 주인공의 선택에 따른 전개`, revised: false }; });
  const c1 = b.chapter1, era = norm(c1.era || b.era || w.era).slice(0, 40) || w.era;
  const e = w.entities[w.mainKey]; e.type = "인물"; e.summary = stripMarks(pr.summary || "").slice(0, 200);
  w.mode = "story"; w.era = era;
  w.story = { protagonistKey: w.mainKey, chapter: 1, total, status: "active", spine, endedAt: null, epilogue: "",
    protagonist: { summary: e.summary, want: stripMarks(pr.want || "").slice(0, 200), wound: stripMarks(pr.wound || "").slice(0, 200) },
    chapters: [{ n: 1, title: chTitle(c1.title || "발단").slice(0, 60), era, summary: stripMarks(c1.summary).slice(0, 800), incident: stripMarks(c1.incident || "").slice(0, 240),
      startedAt: Date.now(), explore: emptyExplore(), choice: null, wove: [], affected: [], auto: [],
      nextChoices: (Array.isArray(c1.nextChoices) ? c1.nextChoices : []).map(x => stripMarks(asText(x)).slice(0, 200)).filter(Boolean).slice(0, 3) }] };
  // 사용자가 정한 주인공 특징과 등장인물은 '사용자 확정' 설정으로 남긴다
  if (user.desc) { w.story.protagonist.desc = user.desc; addFact(e, "주인공의 특징(사용자 지정): " + user.desc, "user"); }
  const N = w.story.total;
  w.story.secrets = (Array.isArray(b.secrets) ? b.secrets : []).filter(x => x && x.truth).slice(0, 5).map((x, i) => ({ id: "s" + (i + 1),
    truth: stripMarks(asText(x.truth)).slice(0, 300), cover: stripMarks(asText(x.cover || "")).slice(0, 300) || "알려진 것이 없다",
    reveal: Math.min(N, Math.max(2, parseInt(x.reveal, 10) || N)), revealed: false }));
  w.story.continuity = storyMemory(w);
  if (storyText(b.storyPromise?.focus, 1200)) w.story.continuity.focus = storyText(b.storyPromise.focus, 1200);
  const central = b.storyPromise?.central, oldQuestion = storyText(b.storyPromise?.centralQuestion, 400);
  if (storyText(central?.subject, 400)) { w.story.continuity.threads[0].subject = storyText(central.subject, 400); w.story.continuity.threads[0].kind = Object.hasOwn(STORY_THREAD_KINDS, central.kind) ? central.kind : "ongoing"; }
  else if (oldQuestion) { w.story.continuity.threads[0].subject = oldQuestion; w.story.continuity.threads[0].kind = "legacy"; }
  w.story.cast = [];
  for (const c of user.cast || []) {
    const k = keyOf(c.name); if (k === w.mainKey) continue;
    if (!w.entities[k]) w.entities[k] = newEntity(c.name, "인물", c.desc.slice(0, 200));
    const o = w.entities[k]; o.type = "인물"; o.origin = w.mainKey;
    if (c.desc) addFact(o, c.desc, "user");
    if (c.rel) { addFact(o, `「${e.title}」과(와)의 관계: ${c.rel}`, "user"); addRelation(w, "user", { a: e.title, b: c.name, rel: c.rel.slice(0, 60), story: c.rel.length > 60 ? c.rel : "" }); }
    w.story.cast.push({ key: k, name: c.name, desc: c.desc, rel: c.rel });
  }
}

/* 항목 합치기: pairs = [[없앨 항목 키, 남길 항목 키], ...]
   남길 항목에 문서가 없으면 없앨 항목의 문서를 옮기고, 둘 다 문서가 있으면 없앨 항목의 문서와 그 문서가 남긴 설정을 지운다.
   없앤 이름은 w.aliases에 남겨, 이후 그 이름으로 건 링크가 남길 항목으로 넘어가게 한다(넘겨주기). */
async function mergeEntities(w, pairs) {
  const map = Object.fromEntries(pairs), re = k => { let n = 0; while (map[k] && n++ < 20) k = map[k]; return k; };
  const removed = [], saved = new Set();
  w.aliases ||= {};
  for (const [dk] of pairs) {
    const bk = re(dk), d = w.entities[dk], b = w.entities[bk], dp = S.pages[dk];
    if (!d || !b || dk === bk) continue;
    if (dp && !S.pages[bk]) {
      dp.key = bk; dp.title = b.title; S.pages[bk] = dp; saved.add(bk);
      b.type = d.type || b.type; b.summary = d.summary || b.summary; b.box = d.box || b.box; b.page = true; if (d.stub && !b.stub) b.stub = d.stub;
    } else if (dp) {
      if (dp.shortStories?.length) {
        const ids = new Set((S.pages[bk].shortStories || []).map(x => x.id));
        S.pages[bk].shortStories = [...(S.pages[bk].shortStories || []), ...dp.shortStories.filter(x => !ids.has(x.id))]; saved.add(bk);
      }
      if (!S.pages[bk].portrait && dp.portrait) { S.pages[bk].portrait = dp.portrait; saved.add(bk); }
      purge(w, dk);
      for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === dk) delete w.navboxes[id];
    }
    if (dp) { delete S.pages[dk]; removed.push(dk); }
    for (const f of d.facts) if (!b.facts.some(x => x.t === f.t)) b.facts.push(f);
    for (const x of d.mentions) if (!b.mentions.some(y => y.from === x.from && y.text === x.text)) b.mentions.push(x);
    if (b.facts.length > 24) b.facts.splice(0, b.facts.length - 24);
    delete w.entities[dk];
    w.aliases[dk] = bk;
  }
  for (const [x, y] of Object.entries(w.aliases)) { w.aliases[x] = re(y); if (w.entities[x]) delete w.aliases[x]; }
  for (const [k, o] of Object.entries(w.entities)) {
    for (const f of o.facts) f.src = re(f.src);
    o.mentions = o.mentions.filter(x => { x.from = re(x.from); return x.from !== k; });
    for (const x of [...o.facts, ...o.mentions]) if (x.sup) x.sup.by = re(x.sup.by);
    if (o.origin) o.origin = re(o.origin);
  }
  w.relations = (w.relations || []).filter(x => { x.a = re(x.a); x.b = re(x.b); x.src = re(x.src); if (x.sup) x.sup.by = re(x.sup.by); return x.a !== x.b; });
  for (const t of w.timeline) { t.src = re(t.src); if (t.sup) t.sup.by = re(t.sup.by); }
  for (const nb of Object.values(w.navboxes || {})) {
    nb.src = re(nb.src); nb.members = [...new Set((nb.members || []).map(re))];
    for (const r of nb.rows) r.items = r.items.map(x => cleanLinks(w, x));
  }
  if (w.mainKey) w.mainKey = re(w.mainKey);
  if (isStory(w)) {
    const st = w.story; st.protagonistKey = re(st.protagonistKey);
    const uniq = a => [...new Set((a || []).map(re))];
    for (const c of st.chapters) {
      c.auto = uniq(c.auto);
      const seen = new Set(); c.affected = (c.affected || []).filter(a => { a.key = re(a.key); return !seen.has(a.key) && seen.add(a.key); });
      const seen2 = new Set(); c.wove = (c.wove || []).filter(a => { a.key = re(a.key); return !seen2.has(a.key) && seen2.add(a.key); });
      const x = c.explore; if (x) { const op = {}; for (const [k, n] of Object.entries(x.opened || {})) op[re(k)] = (op[re(k)] || 0) + n; x.opened = op; x.created = uniq(x.created); x.edited = uniq(x.edited); x.searched = uniq(x.searched); }
    }
  }
  for (const [k, p] of Object.entries(S.pages)) {
    const before = JSON.stringify([p.sections, p.infobox, p.notices, p.links, p.conflicts, p.autoConflicts, p.autoDismissed]);
    for (const sec of p.sections) sec.body = cleanLinks(w, sec.body);
    for (const r of p.infobox || []) r.value = cleanLinks(w, r.value);
    p.notices = (p.notices || []).map(x => cleanLinks(w, x));
    p.links = [...new Set((p.links || []).map(re))].filter(x => x !== k);
    for (const c of [...(p.conflicts || []), ...(p.autoConflicts || []), ...(p.autoDismissed || [])]) c.by = re(c.by);
    if (JSON.stringify([p.sections, p.infobox, p.notices, p.links, p.conflicts, p.autoConflicts, p.autoDismissed]) !== before) saved.add(k);
  }
  S.recent = [...new Set(S.recent.map(re))].filter(x => w.entities[x]);
  try {
    for (const k of removed) await Store.deletePage(w.id, k);
    for (const k of saved) if (S.pages[k]) await Store.savePage(w.id, S.pages[k]);
    await Store.saveWorld(w);
  } catch (err) { toast("항목을 합쳤지만 저장하지 못했습니다. " + errMsg(err)); }
  return re;
}
/* 세계관을 열 때 자동으로 합치는 것: "이름(인물)"처럼 유형이 붙은 항목, 그리고 문서가 없는 "벡"처럼 한 인물의 성이나 이름만 쓴 항목 */
async function autoMerge(w) {
  const pairs = [], protect = new Set([w.mainKey, ...(isStory(w) ? [w.story.protagonistKey, ...(w.story.cast || []).map(c => c.key)] : [])]);   // 사용자가 정한 인물은 자동으로 합치지 않는다
  for (const [dk, d] of Object.entries(w.entities)) {
    if (protect.has(dk)) continue;
    const named = identityOwner(w, d.title, dk), p = S.pages[dk], target = S.pages[named];
    if (named && (!p || (!p.editedAt && (protect.has(named) || (target.createdAt || 0) < (p.createdAt || 0) || ((target.createdAt || 0) === (p.createdAt || 0) && named < dk))))) { pairs.push([dk, named]); continue; }
    const m = TYPE_SUFFIX.exec(d.title || "");
    if (m) { const bk = keyOf(norm(m[1])); if (bk !== dk && w.entities[bk]) { pairs.push([dk, bk]); continue; } }
    if (!S.pages[dk] && (!d.type || d.type === "인물")) { const bk = nameOwner(w, d.title, dk); if (bk) pairs.push([dk, bk]); }
  }
  if (!pairs.length) return 0;
  await mergeEntities(w, pairs);
  return pairs.length;
}

/* 예전 버전에서 AI 수정이 다른 문서를 대체하고 경고를 붙인 흔적을 걷어낸다.
   대체 표시(sup)와 경고는 사용자가 직접 수정한 문서만 세울 수 있으므로, 직접 수정한 적 없는 문서가 세운 것은 지운다 */
async function cleanAiSupersede(w) {
  const userEdited = k => !!S.pages[k]?.editedAt, saved = new Set(); let ws = false;
  const un = x => { if (x?.sup && !userEdited(x.sup.by)) { delete x.sup; ws = true; } };
  for (const o of Object.values(w.entities)) { o.facts.forEach(un); o.mentions.forEach(un); }
  (w.timeline || []).forEach(un); (w.relations || []).forEach(un);
  for (const [k, P] of Object.entries(S.pages)) {
    const n = (P.conflicts || []).length; if (!n) continue;
    P.conflicts = P.conflicts.filter(c => userEdited(c.by)); if (P.conflicts.length !== n) saved.add(k);
  }
  try { for (const k of saved) await Store.savePage(w.id, S.pages[k]); if (ws) await Store.saveWorld(w); } catch {}
  return saved.size;
}
/* 이미 저장된 장 제목과 장 섹션 제목에서 장 번호를 뗀다 */
async function cleanChapterTitles(w) {
  if (!isStory(w)) { if ((w.rules || []).some(isBroken)) { w.rules = w.rules.filter(x => !isBroken(x)); try { await Store.saveWorld(w); } catch {} } return; }
  let ws = false; const pg = [];
  for (const c of w.story.chapters) {
    const t = chTitle(c.title); if (t !== c.title) { c.title = t; ws = true; }
    if ((c.nextChoices || []).some(isBroken)) { c.nextChoices = c.nextChoices.filter(x => !isBroken(x)); ws = true; }   // 예전 버전에서 깨져 저장된 선택지
  }
  if ((w.rules || []).some(isBroken)) { w.rules = w.rules.filter(x => !isBroken(x)); ws = true; }
  for (const [k, p] of Object.entries(S.pages)) {
    let ch = false;
    for (const sec of p.sections) if (sec.ch) { const h = stripHead(sec.heading); if (h && h !== sec.heading) { sec.heading = h; ch = true; } }
    if (ch) pg.push(k);
  }
  try { for (const k of pg) await Store.savePage(w.id, S.pages[k]); if (ws) await Store.saveWorld(w); } catch {}
}
/* 사용자가 고른 합치기: dk 항목을 bk 항목에 합친다 */
async function mergeAction(dk, bk) {
  const w = S.world; if (!w || !w.entities[dk] || !w.entities[bk] || dk === bk) return;
  if (S.gen || S.storyGen || S.syncing) { toast("다른 작업이 끝난 뒤 합쳐 주세요."); return; }
  if (S.edit) { toast("편집 중인 문서를 먼저 저장하거나 취소해 주세요."); return; }
  if (dk === w.mainKey || (isStory(w) && dk === w.story.protagonistKey)) { toast(`「${w.entities[dk].title}」은(는) ${isStory(w) ? "주인공" : "대문"} 문서라 다른 문서에 합칠 수 없습니다. 반대로 다른 문서를 이쪽에 합쳐 주세요.`); return; }
  const from = w.entities[dk].title, to = w.entities[bk].title;
  S.confirmMerge = null; S.memo = null; S.fixv = null;
  await mergeEntities(w, [[dk, bk]]);
  S.view = { name: "article", key: bk }; S.recent = [bk, ...S.recent.filter(x => x !== bk)].slice(0, 8);
  renderAll(); window.scrollTo({ top: 0 });
  toast(`「${from}」을(를) 「${to}」에 합쳤습니다. 이제 「${from}」 링크는 「${to}」 문서로 넘어갑니다.`);
}
async function notSame(k, other) {
  const w = S.world, e = w?.entities[k]; if (!e) return;
  (e.notSame ||= []).includes(other) || e.notSame.push(other);
  renderMain(); try { await Store.saveWorld(w); } catch {}
}

/* 다시 만들기: 처음 입력값을 세계관 만들기 화면에 채워 연다 */
function openRegen() {
  const w = S.world; if (!w) return;
  if (S.gen?.wid === w.id || S.storyGen || S.syncing) { toast("작성 중인 문서가 끝난 뒤 다시 만들어 주세요."); return; }
  const story = isStory(w), inp = w.input || {};
  S.regen = { wid: w.id, title: w.title, keep: false };
  S.mode = story ? "story" : "basic";
  S.seed = S.ownSeed = w.seed || ""; S.seedTab = "own"; S.dice = null; S.whatIfs = null;
  S.guideIn = w.guide || "";
  S.first = inp.first ?? (story ? w.entities[w.story.protagonistKey]?.title || "" : "");
  S.protoDesc = story ? (inp.protoDesc ?? w.story.protagonist?.desc ?? "") : "";
  if (story) S.storyN = totalOf(w);
  S.cast = story ? (inp.cast || (w.story.cast || []).map(c => ({ name: w.entities[c.key]?.title || c.name, desc: c.desc || "", rel: c.rel || "" }))).map(c => ({ ...c })) : [];
  S.createErr = null;
  S.view = { name: "home" }; renderAll(); window.scrollTo({ top: 0 });
}
function cancelRegen() {
  const wid = S.regen?.wid; S.regen = null;
  S.seed = S.ownSeed = S.first = S.guideIn = S.protoDesc = ""; S.cast = []; S.createErr = null;
  if (wid && S.worlds.some(x => x.id === wid)) { if (S.world?.id === wid) { S.view = { name: "canon" }; renderAll(); } else openWorld(wid); }
  else renderMain();
}

async function openWorld(wid, goKey, restoring = false) {
  if (S.discovery?.busy) { toast("새 문서 탐색을 마치거나 중단한 뒤 세계관을 열어 주세요."); return; }
  const w = S.worlds.find(x => x.id === wid); if (!w) return;
  if (S.proseGen?.busy && S.proseGen.wid !== wid) { toast("단편 생성을 마치거나 중단한 뒤 다른 세계관을 열어 주세요."); return; }
  if (S.imageGen?.busy && S.imageGen.wid !== wid) { toast("이미지 생성을 마치거나 중단한 뒤 다른 세계관을 열어 주세요."); return; }
  if (S.gen && S.gen.wid !== wid) { toast("다른 세계관의 문서를 작성하는 중입니다. 끝난 뒤 열어 주세요."); return; }
  if (S.storyGen && S.world?.id !== wid) { toast("다음 장을 쓰는 중입니다. 끝난 뒤 열어 주세요."); return; }
  if (S.syncing && S.world?.id !== wid) { toast("장의 변화를 문서에 반영하는 중입니다. 끝난 뒤 열어 주세요."); return; }
  S.world = w; S.pages = {}; S.recent = []; S.confirmDel = null; S.nf = new Set(); S.edit = null; S.confirmDelPage = null; S.confirmMerge = null; S.syncQ = []; S.syncErr = null; S.storyCard = null; S.adv = null;
  S.view = { name: "loading" }; renderAll();
  try { S.pages = await Store.listPages(w.id); } catch (e) { toast(errMsg(e)); }
  const merged = await autoMerge(w);
  await cleanChapterTitles(w);
  const unbadged = await cleanAiSupersede(w);
  if (dedupeRelations(w)) { try { await Store.saveWorld(w); } catch {} }
  if (restoring) { S.view = { name: "article", key: w.mainKey }; }
  else openEntity(goKey && (w.entities[goKey] || w.aliases?.[goKey]) ? goKey : w.mainKey);
  if (unbadged) setTimeout(() => toast(`AI 수정 때문에 잘못 붙어 있던 '설정과 맞지 않음' 경고 ${unbadged}건을 지웠습니다.`), merged ? 3800 : 0);
  if (merged) toast(`같은 대상을 가리키는데 따로 생긴 항목 ${merged}개를 원래 항목에 합쳤습니다. 예: "이름(인물)", 성이나 이름만 쓴 인물.`);
}

function openEntity(k) {
  const w = S.world; if (!w) return;
  if (!w.entities[k] && w.aliases?.[k]) k = w.aliases[k];
  if (!w.entities[k]) return;
  S.confirmRewrite = null; S.genErr = S.genErr && S.genErr.key === k ? S.genErr : null;
  S.view = { name: "article", key: k };
  S.recent = [k, ...S.recent.filter(x => x !== k)].slice(0, 8);
  if (!S.pages[k] && !(S.gen && S.gen.key === k) && !S.genErr) {
    if (S.gen) { renderAll(); toast(`「${S.gen.title}」 문서를 작성하는 중입니다. 끝나면 이 문서를 작성할 수 있습니다.`); return; }
    if (S.storyGen) { renderAll(); toast("다음 장을 쓰는 중입니다. 끝나면 이 문서를 작성할 수 있습니다."); return; }
    generatePage(k); return;
  }
  if (S.pages[k] && isStory(w)) { noteExplore(k, "opened"); maybeSync(k); }
  renderAll(); window.scrollTo({ top: 0 });
}

async function followRedirect(w, k, to) {
  const from = w.entities[k].title, title = w.entities[to].title;
  try { await mergeEntities(w, [[k, to]]); }
  finally { if (S.gen?.wid === w.id && S.gen.key === k) S.gen = null; }
  S.genErr = null;
  if (S.world !== w) return;
  if (S.view.name === "article" && S.view.key === k) openEntity(to); else renderAll();
  toast(`「${from}」은(는) 「${title}」의 다른 이름입니다. 기존 문서로 연결했습니다.`);
}
async function generatePage(k, rewrite, direction, novel = false) {
  if (S.discovery?.busy && !novel) { toast("새 문서 탐색을 마치거나 중단한 뒤 작성해 주세요."); return; }
  const w = S.world; const e = w.entities[k];
  const named = !rewrite && !S.pages[k] && !protectedEntity(w, k) ? identityOwner(w, e.title, k) : null;
  if (novel && named) throw { code: "discovery_duplicate", existing: w.entities[named].title };
  if (named && !S.gen && !S.storyGen && !S.syncing && !S.edit) {
    S.gen = { key: k, wid: w.id, title: e.title, raw: "", t0: performance.now(), ctl: new AbortController() };
    await followRedirect(w, k, named); return;
  }
  if (!S.sample) { S.genErr = { key: k, msg: ERR.no_sample }; S.view = { name: "article", key: k }; renderAll(); return; }
  if (S.gen) { toast(`「${S.gen.title}」 문서를 작성하는 중입니다.`); return; }
  if (S.storyGen) { toast("다음 장을 쓰는 중입니다. 끝난 뒤 작성해 주세요."); return; }
  if (rewrite && S.syncing === k) { toast("이 문서에 장의 변화를 반영하는 중입니다. 끝난 뒤 다시 써 주세요."); return; }
  let backup = null, oldPage = null;
  if (rewrite) { oldPage = S.pages[k]; backup = prepareRewrite(w, k); delete S.pages[k]; }
  const ctl = new AbortController();
  const angle = !rewrite && !novel ? pickAngle(w, Math.random, { person: e.type === "인물" }) : null;   // 랜덤 서핑은 선정 단계에서 따로 고른다
  S.gen = { key: k, wid: w.id, title: e.title, raw: "", t0: performance.now(), ctl, rewrite: !!rewrite, direction: direction || "", angle };
  S.genErr = null; S.confirmRewrite = null; S.view = { name: "article", key: k };
  renderAll(); window.scrollTo({ top: 0 });
  try {
    if (!w.tone && !w.toneTried) {
      w.toneTried = true;
      try { const t = await detectTone(w); if (t) { w.tone = t; toast(`분위기를 「${t.label}」(으)로 판별했습니다. 설정 노트에서 고칠 수 있습니다.`); } } catch {}
      if (ctl.signal.aborted) throw { code: "cancelled" };
    }
    const out = await callJson("page", pagePrompt(w, k, rewrite ? (direction || "") : null, rewrite ? "" : (direction || ""), angle), { signal: ctl.signal, modelTier: "default", ...PAGE_MODEL, onRetry: r => { if (S.gen) { S.gen.retry = r; updateGenLive(); } }, onText: ({ text }) => { if (S.gen) { S.gen.raw = text; updateGenLive(); } } }, { title: e.title, type: TYPES.includes(e.type) ? e.type : "", ents: Object.keys(w.entities).length });
    if (out && Object.prototype.hasOwnProperty.call(out, "redirect")) {
      if (novel) throw { code: "discovery_duplicate", existing: out.redirect };
      if (ctl.signal.aborted) throw { code: "cancelled" };
      const title = typeof out.redirect === "string" ? norm(out.redirect) : "";
      const to = title ? Object.keys(w.entities).find(x => w.entities[x].title === title) || w.aliases?.[keyOf(title)] : null, target = w.entities[to];
      const protectedKey = k === w.mainKey || (isStory(w) && (k === w.story.protagonistKey || (w.story.cast || []).some(c => c.key === k)));
      if (rewrite || S.world !== w || S.pages[k] || protectedKey || !target || to === k || !S.pages[to]
        || (e.type && (target.type || S.pages[to].type) && e.type !== (target.type || S.pages[to].type) && identityOwner(w, e.title, k) !== to) || e.notSame?.includes(to) || target.notSame?.includes(k)) throw { code: "bad_page" };
      await followRedirect(w, k, to);
      return;
    }
    if (out && out.notFound === true && e.src === "search") {
      S.gen = null;
      const nf = e.title;
      if (!e.facts.length && !e.mentions.length) delete w.entities[k];
      S.nf.add(k); S.recent = S.recent.filter(x => x !== k);
      if (S.view.name === "article" && S.view.key === k) { S.view = { name: "notfound", title: nf }; renderAll(); }
      else { renderSide(); toast(`‘${nf}’ 문서를 찾을 수 없습니다.`); }
      return;
    }
    if (novel) {
      const latest = await Store.getWorld(w.id);
      if (ctl.signal.aborted || !latest || !S.worlds.some(x => x.id === w.id)) throw { code: "cancelled" };
      const others = Object.fromEntries(Object.entries(w.entities).filter(([id]) => id !== k));
      if (JSON.stringify(latest.entities) !== JSON.stringify(others) || JSON.stringify(latest.aliases || {}) !== JSON.stringify(w.aliases || {})) throw new Error("기존 항목이 다른 곳에서 바뀌었습니다. 세계관을 다시 열고 시도해 주세요.");
      const names = [out?.title, ...(Array.isArray(out?.infobox) ? out.infobox.filter(r => r && IDENTITY_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))).flatMap(r => [r.value, ...[...String(r.value).matchAll(LINK_RE)].flatMap(m => [m[1], m[2] || m[1]])]) : [])];
      for (const name of names) if (typeof name === "string" && discoveryOwner(w, name, k)) throw { code: "discovery_duplicate", existing: name };
    }
    autoLink(w, k, out);   // 링크가 빠진 기존 항목 이름은 조용히 링크한다
    const searched = !!e.searched; delete e.searched;
    if (Array.isArray(out?.sections)) for (const s of out.sections) if (s) delete s.ch;   // 장 표시는 앱이 붙인다
    const angleUsed = !!angle && (out?.angleUsed === true || out?.angleUsed === "true");
    if (out && typeof out === "object") delete out.angleUsed;
    const page = integrate(w, k, out);
    delete page.angleUsed;
    if (oldPage?.shortStories) page.shortStories = oldPage.shortStories;
    if (oldPage?.portrait) page.portrait = oldPage.portrait;   // 사용자가 올린 이미지는 AI 다시 쓰기와 별개로 유지
    if (isStory(w)) {   // 새로 쓰는 문서는 장 섹션 없이 현재 장 시점으로 처음부터 쓴다
      const st = w.story; page.baseAsOf = page.syncedTo = st.chapter;
      page.storyNotice = storyOn(w) && (k === st.protagonistKey || (curCh(w).affected || []).some(a => a.key === k));
      if (!rewrite) { if (searched) noteExplore(k, "searched"); noteExplore(k, "created"); }
    }
    let cleared = new Set();
    if (!rewrite && direction) page.direction = direction;
    if (rewrite) { page.direction = direction || ""; page.rewrittenAt = Date.now(); cleared = clearBadges(k); }   // 직접 수정본이 사라졌으니 그 수정이 남긴 표시도 지운다
    if (S.world === w) S.pages[k] = page;
    const pre = GS.preCheck !== false && S.world === w ? await preCheck(w, k, page) : null;   // 보여 주기 전에 검사하고 고친다
    const fin = pre?.page || page;
    if (angleUsed) fin.angle = angle.id;
    S.gen = null;
    try { await Store.savePage(w.id, fin); for (const x of cleared) if (S.pages[x] && x !== k) await Store.savePage(w.id, S.pages[x]); if (!novel && !rewrite) noteAngleUse(w, angleUsed ? angle : null); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
    afterGen(k, true);
    if (S.world === w && S.pages[k] === fin) {
      if (pre?.fixed) { toast(`설정과 어긋난 ${pre.fixed}곳을 고쳐서 보여 드립니다.`); bgSync(k); }   // 확정 사실만 정리하며 검사는 다시 하지 않는다
    }
  } catch (err) {
    S.gen = null;
    if (novel) throw err;
    if (rewrite) {
      restoreRewrite(w, backup); if (S.world === w && oldPage) S.pages[k] = oldPage;
      toast(err?.code === "cancelled" ? "다시 쓰기를 취소했습니다. 이전 버전을 그대로 둡니다." : "다시 쓰지 못해 이전 버전을 그대로 둡니다. " + errMsg(err));
    }
    else if (err?.code !== "cancelled") S.genErr = { key: k, msg: errMsg(err), guide: direction || "" };
    else S.genErr = { key: k, msg: ERR.cancelled, cancelled: true, guide: direction || "" };
    afterGen(k, false);
  }
}
function afterGen(k, ok) {
  const here = S.view.name === "article" && S.view.key === k;
  if (here) renderAll(); else { renderSide(); if (ok) toast(`「${S.world.entities[k].title}」 문서가 완성되었습니다.`, { label: "열기", fn: () => openEntity(k) }); }
  drainSync();
}

function integrate(w, key, out) {
  const e = w.entities[key];
  if (Array.isArray(out?.sections)) for (const s of out.sections) if (s && typeof s.body === "string") s.body = cleanLinks(w, s.body);
  if (Array.isArray(out?.infobox)) for (const r of out.infobox) if (r && typeof r.value === "string") r.value = cleanLinks(w, r.value);
  if (Array.isArray(out?.notices)) out.notices = out.notices.map(x => typeof x === "string" ? cleanLinks(w, x) : x);
  if (Array.isArray(out?.navboxes)) for (const nb of out.navboxes) for (const r of (Array.isArray(nb?.rows) ? nb.rows : [])) if (Array.isArray(r?.items)) r.items = r.items.map(x => typeof x === "string" ? cleanLinks(w, x) : x);
  const sections = (Array.isArray(out?.sections) ? out.sections : []).filter(s => s && (s.body || s.heading)).map(s => { const x = { heading: String(s.heading || "").replace(/^#+\s*/, "").replace(/^\d+(\.\d+)*\.?\s+/, "").slice(0, 80), level: s.level === 2 ? 2 : 1, body: String(s.body || "") }; if (s.ch > 0) x.ch = +s.ch; return x; });
  if (sections.length && sections[0].level === 2) sections[0].level = 1;
  if (!sections.some(s => s.body.trim())) throw { code: "bad_page" };
  const categories = [...new Set((Array.isArray(out.categories) ? out.categories : []).filter(x => typeof x === "string" && x.trim()).map(x => norm(stripMarks(x)).slice(0, 40)))].filter(x => x && !TYPES.includes(x)).slice(0, 6);   // 유형 이름은 분류로 두지 않는다(유형으로 이미 모아 볼 수 있다)
  const infobox = (Array.isArray(out.infobox) ? out.infobox : []).filter(r => r && r.label && r.value).slice(0, 10).map(r => ({ label: String(r.label).slice(0, 30), value: String(r.value).slice(0, 300) }));
  const type = TYPES.includes(out.type) ? out.type : (String(out.type || "").slice(0, 8) || "개념");
  const summary = stripMarks(out.summary).slice(0, 220);
  const notices = (Array.isArray(out.notices) ? out.notices : []).filter(x => typeof x === "string" && x.trim()).slice(0, 3).map(x => x.slice(0, 300));
  const hints = {}; for (const n of (Array.isArray(out.newEntities) ? out.newEntities : [])) if (n && n.title) hints[kOf(w, n.title)] = n;
  const links = [];
  for (const t of [...sections.map(s => s.body), ...infobox.map(r => r.value), ...notices]) {
    for (const m of t.matchAll(LINK_RE)) {
      const tt = norm(m[1]); if (!tt) continue; const lk = keyOf(tt); if (lk === key) continue;
      if (!links.includes(lk)) links.push(lk);
      if (!w.entities[lk]) { const h = hints[lk]; w.entities[lk] = newEntity(tt, h && TYPES.includes(h.type) ? h.type : "", h ? stripMarks(h.summary).slice(0, 200) : ""); w.entities[lk].origin = key; }
      else if (!w.entities[lk].summary && hints[lk]?.summary) w.entities[lk].summary = stripMarks(hints[lk].summary).slice(0, 200);
      addMention(w.entities[lk], key, sentenceAround(t, m.index, m[0].length));
    }
  }
  for (const f of (Array.isArray(out.facts) ? out.facts : [])) { if (!f || !f.fact || !f.about) continue; const fk = kOf(w, f.about); if (w.entities[fk]) addFact(w.entities[fk], String(f.fact), key); }
  for (const r of (Array.isArray(out.relations) ? out.relations : []).slice(0, 12)) addRelation(w, key, r);
  if (!e.stub) e.stub = { type: e.type || "", summary: e.summary || "" };  // 문서가 생기기 전, 링크로 약속된 정의
  e.type = type; if (summary) e.summary = summary; e.page = true; delete e.src;
  e.box = infobox.map(r => r.label + ": " + stripMarks(r.value)).join(" / ").slice(0, 400);
  for (const t of (Array.isArray(out.timeline) ? out.timeline : [])) addTimeline(w, t, key);
  w.navboxes ||= {};
  (Array.isArray(out.navboxes) ? out.navboxes : []).slice(0, 2).forEach((nb, i) => {
    if (!nb || !Array.isArray(nb.rows)) return;
    let budget = 80;
    const rows = nb.rows.filter(r => r && Array.isArray(r.items)).slice(0, 12).map(r => ({
      label: stripMarks(r.label || "").slice(0, 40),
      items: r.items.filter(x => typeof x === "string" && x.trim()).slice(0, Math.max(0, budget)).map(x => { budget--; return x.replace(/\[\*[^\]]*\]/g, "").trim().slice(0, 200); })
    })).filter(r => r.items.length);
    if (!rows.length) return;
    const title = stripMarks(nb.title || e.title).slice(0, 60), members = [];
    for (const r of rows) for (const it of r.items) for (const m of it.matchAll(LINK_RE)) {
      const tt = norm(m[1]); if (!tt) continue; const lk = keyOf(tt); if (lk === key || members.includes(lk)) continue;
      members.push(lk);
      if (!w.entities[lk]) { const h = hints[lk]; w.entities[lk] = newEntity(tt, h && TYPES.includes(h.type) ? h.type : "", h ? stripMarks(h.summary).slice(0, 200) : ""); w.entities[lk].origin = key; }
      addMention(w.entities[lk], key, `${title} — ${r.label}: ${stripMarks(it)}`);
      if (!links.includes(lk)) links.push(lk);
    }
    w.navboxes[key + "-" + i] = { title, rows, members, src: key, srcTitle: e.title };
  });
  return { key, title: e.title, type, summary, categories, notices, infobox, sections, links, createdAt: Date.now(), style: w.style, check: null,
    ...(S.world === w && S.pages[key]?.shortStories ? { shortStories: S.pages[key].shortStories } : {}),
    ...(S.world === w && S.pages[key]?.portrait ? { portrait: S.pages[key].portrait } : {}) };
}

/* auto: 문서가 완성된 직후 자동으로 돌리는 검사. 다른 검사가 돌고 있으면 차례를 기다린다. */
