"use strict";
/* 인물 이름 안전장치: 어느 경로로 만들어졌든 인물 문서의 인포박스 이름(본명·코드명 등)을 이 문서로 이어 준다.
   - 이름 칸의 이름은 w.aliases에 이 문서 키로 등록한다(앞으로 그 이름으로 링크하면 이 문서로 간다).
   - 그 이름의 빨간 링크 항목이 이미 있으면 이 문서에 합친다. 문서가 있는 항목은 건드리지 않고 w.nameTwins에 남겨 설정 노트에 띄운다.
   - 인물 문서의 제목이 호출명·코드명·칭호이고 본명이 따로 적혀 있으면 작성 직후와 세계관을 열 때 제목을 본명으로 옮긴다(옛 제목은 별칭).
     [제목을 본명으로 바꾸기] 버튼은 그 사이에 남은 문서용이다. */
const NAME_JUNK = /미상|불명|없음|비공개|알\s*수\s*없|해당\s*없|기밀|불확실|^[-—–]+$/;
const REAL_NAME_LABEL = /^(?:본명|성명|이름)$/;
const CODE_NAME_LABEL = /^(?:코드명|코드네임|암호명|제식명|활동명|별칭|별명|가명|호출부호|호출명|콜사인|이명|칭호)$/;
/* 인포박스 이름 칸(IDENTITY_LABEL)의 이름들. 링크된 이름은 다른 항목을 가리킬 수 있어 읽지 않는다. real이면 본명 칸만 */
function infoboxNames(p, real = false) {
  const out = [];
  for (const r of p?.infobox || []) {
    const label = stripMarks(r.label).replace(/\s/g, "");
    if (!(real ? REAL_NAME_LABEL.test(label) : IDENTITY_LABEL.test(label) || CODE_NAME_LABEL.test(label))) continue;
    const text = stripMarks(String(r.value || "").replace(LINK_RE, ","));
    const separator = /\s*(?:[,，、;/／]|\s또는\s|\s혹은\s)\s*/;
    for (const part of text.split(/\s*(?:[,，、;/／]|\s또는\s|\s혹은\s)\s*(?![^()（）]*[)）])/)) {
      const pm = /^(.*?)\s*[(（]([^)）]*)[)）]\s*$/.exec(part);
      for (let x of pm ? [pm[1], ...pm[2].split(separator)] : [part]) {
        x = norm(x).replace(/^(?:본명|코드명|별칭)\s*[:：]\s*/, "").replace(/^['"‘’“”「」『』]+|['"‘’“”「」『』]+$/g, "").trim();
        if (x.length >= 2 && x.length <= 40 && !NAME_JUNK.test(x)) out.push(x);
      }
    }
  }
  return [...new Set(out)];
}
const isPerson = (w, k) => ((S.world === w ? S.pages[k]?.type : "") || w.entities[k]?.type) === "인물";
const twinOk = (w, a, b) => !(w.entities[a]?.notSame || []).includes(b) && !(w.entities[b]?.notSame || []).includes(a);
/* 인물 문서 k가 생긴 뒤 부른다. 돌려주는 값: { aliased, merged, twins } */
async function registerPersonNames(w, k) {
  const res = { aliased: [], merged: [], twins: [] };
  const p = S.world === w ? S.pages[k] : null, e = w.entities[k];
  if (!p || !e || !isPerson(w, k)) return res;
  const merges = [];
  w.aliases ||= {};
  for (const n of infoboxNames(p)) {
    if (identityName(n) === identityName(p.title)) continue;
    const nk = keyOf(n); if (nk === k) continue;
    const o = w.entities[nk];
    if (o) {
      if (S.pages[nk]) {   // 이미 문서가 있으면 건드리지 않고 알린다
        if (isPerson(w, nk) && twinOk(w, k, nk) && !(w.nameTwins || []).some(t => [t.a, t.b].sort().join() === [k, nk].sort().join())) { (w.nameTwins ||= []).push({ a: k, b: nk, name: n, at: Date.now() }); res.twins.push(nk); }
        continue;
      }
      if (protectedEntity(w, nk) || (o.type && o.type !== "인물") || !twinOk(w, k, nk) || merges.some(x => x[0] === nk)) continue;
      merges.push([nk, k]); res.merged.push(n); continue;
    }
    const cur = w.aliases[nk];
    if (cur && cur !== k && w.entities[cur]) {   // 다른 항목의 별칭이면 그대로 둔다(처음 연결 유지)
      if (isPerson(w, cur)) { const fk = keyOf(sharedForm(n, p.title)); if (!w.aliases[fk] && !w.entities[fk]) { w.aliases[fk] = k; res.aliased.push(sharedForm(n, p.title)); } }   // 같은 이명을 쓰는 나중 인물에게는 '이명(본명)'을 이명으로 하나 더 붙인다
      continue;
    }
    if (cur !== k) { w.aliases[nk] = k; res.aliased.push(n); }
  }
  if (merges.length) await mergeEntities(w, merges);   // 빨간 링크의 언급·사실은 이 문서로 옮기고, 그 이름은 별칭이 된다
  return res;
}
/* ---------- 같은 이명을 쓰는 인물 ----------
   처음 그 이명을 받은 인물은 맨 이명으로 이어진다. 나중 인물에게는 '이명(본명)'이 링크용 이명으로 하나 더 붙는다.
   괄호는 링크를 구분하는 표기일 뿐이며, 실제 이명은 모두 같다 */
const sharedForm = (name, title) => `${name}(${title})`;
const CODE_ONLY = p => infoboxNames({ infobox: (p?.infobox || []).filter(r => CODE_NAME_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))) });
function sharedNames(w) {
  const by = new Map();
  for (const [k, p] of Object.entries(S.world === w ? S.pages : {})) {
    if (!w.entities[k] || !isPerson(w, k)) continue;
    for (const n of CODE_ONLY(p)) {
      if (identityName(n) === identityName(p.title)) continue;
      const g = by.get(identityName(n)) || by.set(identityName(n), { name: n, keys: [] }).get(identityName(n));
      if (!g.keys.includes(k)) g.keys.push(k);
    }
  }
  const out = [];
  for (const g of by.values()) {
    if (g.keys.length < 2) continue;
    const bare = w.aliases?.[keyOf(g.name)];
    const rows = g.keys.map(k => {
      const title = w.entities[k].title, fk = keyOf(sharedForm(g.name, title));
      if (k !== bare && !w.aliases?.[fk] && !w.entities[fk]) (w.aliases ||= {})[fk] = k;   // 이 기능 이전에 만든 세계관도 링크용 이명을 갖게 한다
      return { k, title, link: k === bare ? g.name : sharedForm(g.name, title) };
    });
    out.push({ name: g.name, rows });
  }
  return out;
}
function sharedNamesBlock(w, check = false) {
  const list = sharedNames(w).slice(0, 8); if (!list.length) return "";
  return `## 같은 이명을 쓰는 인물
${list.map(g => `- ${g.name}: ${g.rows.map(r => `${r.title} → [[${r.link}]]`).join(", ")}`).join("\n")}
같은 이명을 여러 인물이 쓴다. 괄호는 링크를 구분하려고 붙인 표기일 뿐이고, 실제 이명은 모두 괄호 없는 이름이다. 본문과 인포박스에는 괄호 없이 쓰고, 링크할 때만 위 표기를 대상으로 쓴다(예: [[${list[0].rows.at(-1).link}|${list[0].name}]]). 맨 이명 링크는 위에서 맨 이명으로 이어진 인물만 가리킨다.
${check ? "이 문서에서 맨 이명으로 건 링크가 문맥상(날짜, 나이, 소속, 선대·후대) 다른 인물을 가리키면 high로 지적한다. claim에는 그 문장을, evidence에는 위 목록의 해당 줄을 쓰고, conflict는 '이명 링크:'로 시작해 어느 인물의 링크 표기로 바꿔야 하는지 쓴다.\n" : ""}
`;
}
/* 고른 말이 기존 인물의 별칭이나 인포박스 이름이면 그 인물의 키. 여럿이면 정하지 않는다 */
function personByName(w, name, except) {
  const id = identityName(name); if (!id) return null;
  const al = w.aliases?.[keyOf(norm(name))];
  if (al && al !== except && w.entities[al] && isPerson(w, al)) return al;
  let hit = null;
  for (const [k, p] of Object.entries(S.world === w ? S.pages : {})) {
    if (k === except || !w.entities[k] || p.type !== "인물") continue;
    if (!infoboxNames(p).some(n => identityName(n) === id) && identityName(p.title) !== id) continue;
    if (hit && hit !== k) return null;
    hit = k;
  }
  return hit;
}
/* 본명 칸의 이름 후보. 본명 칸에 링크로 적은 이름([[…|헤일리 앤 젠킨스]])의 표시 이름도 읽고, 한글 이름을 원어 표기보다 앞에 둔다 */
function realNameCandidates(p) {
  const linked = [];
  for (const r of p?.infobox || []) {
    if (!REAL_NAME_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))) continue;
    for (const m of String(r.value || "").matchAll(LINK_RE)) { const n = norm(m[2] || m[1]); if (n.length >= 2 && n.length <= 40 && !NAME_JUNK.test(n)) linked.push(n); }
  }
  const all = [...new Set([...linked, ...infoboxNames(p, true)])], hangul = n => /[가-힣]/.test(n) ? 1 : 0;
  return all.map((n, i) => ({ n, i })).sort((a, b) => hangul(b.n) - hangul(a.n) || a.i - b.i).map(x => x.n);
}
/* 코드명 형태로 만들어진 인물 제목이면 바꿀 본명. 아니면 "" */
/* 제목이 호출명·코드명처럼 보이는가: 따옴표·숫자·괄호가 있거나 인포박스 호출명·코드명 칸 값에 제목이 들어 있다 */
function codeLikeTitle(p) {
  if (!p) return false;
  const codes = (p.infobox || []).filter(r => CODE_NAME_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))).map(r => identityName(r.value));
  return /['"‘’“”「」『』]|\d|[(（]/.test(p.title) || codes.some(c => c.includes(identityName(p.title)));
}
/* 제목이 한글 본명과 겹치는 낱말이 하나도 없으면 칭호·이명 제목으로 본다(「자유의 전초」 ↔ 본명 「캐서린 앤 밀러」).
   「하인츠 키신저」 ↔ 「하인츠 알프레트 키신저」처럼 이름 토막을 함께 쓰면 본명을 길게 적은 것이라 바꾸지 않는다 */
function nicknameTitle(title, real) {
  if (!/[가-힣]/.test(real)) return false;
  const words = t => norm(stripMarks(t)).normalize("NFKC").toLowerCase().split(/[\s·・.\-]+/).filter(Boolean);
  const rw = new Set(words(real)), tw = words(title);
  return tw.length > 0 && !tw.some(x => rw.has(x));
}
function realNameFor(w, k) {
  const p = S.world === w ? S.pages[k] : null; if (!p || !isPerson(w, k)) return "";
  const real = realNameCandidates(p).find(n => identityName(n) !== identityName(p.title)); if (!real) return "";
  if (!codeLikeTitle(p) && !nicknameTitle(p.title, real)) return "";
  const rk = keyOf(real);
  if (rk !== k && S.pages[rk]) return "";   // 본명 문서가 따로 있으면 합치기로 다룬다
  return real;
}
/* 자동 합치기의 '이름 토막' 규칙(문서 없는 "벡"을 "조슬린 벡"에 합침)을 써도 되는가.
   - 상대 인물의 제목이 사람 이름(성+이름)이 아니라 호출명·코드명이면 쪼개지 않는다("워스파이트"는 "워스파이트 2세"의 토막이 아니라 다른 사람일 수 있다).
   - 합칠 항목의 사실·언급에 나온 연도에 상대 인물이 태어나지 않았거나, 나이 규칙상 활동할 수 없는 나이였으면 합치지 않는다 */
function nameMergeOk(w, dk, bk) {
  const p = S.world === w ? S.pages[bk] : null;
  if (p && (codeLikeTitle(p) || realNameCandidates(p).some(n => identityName(n) !== identityName(p.title)))) return false;
  if (!p && codeLikeTitle({ title: w.entities[bk]?.title || "", infobox: [] })) return false;   // 상대도 문서 없는 빨간 링크면 제목만 본다(숫자·따옴표·괄호)
  const birthRow = (p?.infobox || []).find(r => /출생|탄생|생년/.test(stripMarks(r.label)));
  const born = birthRow ? yearHits(stripMarks(String(birthRow.value)), w)[0]?.y : null;
  if (!Number.isFinite(born)) return true;
  const d = w.entities[dk], texts = [...(d?.facts || []).filter(live).map(f => f.t), ...(d?.mentions || []).filter(live).map(m => m.text)];
  const years = texts.flatMap(t => yearHits(t, w).map(h => h.y)).filter(Number.isFinite);
  if (!years.length) return true;
  const about = p ? [p.summary, ...(p.categories || []), ...(p.infobox || []).map(r => r.value)].join(" ") : "";
  const mins = (typeof ageRules === "function" ? ageRules(w) : []).filter(R => R.subjects.some(sj => about.includes(sj)) && Number.isInteger(R.min)).map(R => R.min);
  const earliest = born + (mins.length ? Math.min(...mins) : 0);
  return !years.some(y => y < earliest);
}
/* 작성 응답의 newEntities에 적힌 새 항목의 호출부호·이명(aliases)을 별칭으로 등록한다.
   그 이름이 이미 다른 항목의 제목이거나 다른 항목의 별칭이면 처음 연결을 그대로 두고, 인물끼리면 이 항목에 '이명(제목)'을 링크용 별칭으로 붙인다.
   같은 이름의 빨간 링크 항목이 따로 있어도 합치지 않는다(다른 사람일 수 있다) */
function registerNewAliases(w, k, aliases) {
  const title = w.entities[k]?.title; if (!title || !Array.isArray(aliases)) return [];
  const person = (w.entities[k].type || "") === "인물", added = [];
  w.aliases ||= {};
  for (const raw of aliases.slice(0, 6)) {
    const n = norm(stripMarks(String(raw || ""))); if (!n || n.length > 40 || NAME_JUNK.test(n) || identityName(n) === identityName(title)) continue;
    const nk = keyOf(n); if (nk === k) continue;
    const cur = w.entities[nk] ? nk : w.aliases[nk];
    if (cur && cur !== k && w.entities[cur]) {
      if (person && isPerson(w, cur)) { const sk = keyOf(sharedForm(n, title)); if (!w.aliases[sk] && !w.entities[sk]) { w.aliases[sk] = k; added.push(sharedForm(n, title)); } }
      continue;
    }
    if (cur !== k) { w.aliases[nk] = k; added.push(n); }
  }
  return added;
}
/* 제목을 본명 키로 옮기고 옛 제목은 별칭으로 남긴다. 버튼과 작성 직후 자동 변경이 함께 쓴다. 옮겼으면 { from, to, real }, 아니면 null */
async function moveTitleToRealName(w, k) {
  const e = w?.entities[k], real = w ? realNameFor(w, k) : ""; if (!e || !real) return null;
  const from = e.title, nk = keyOf(real);
  if (!w.entities[nk]) { const copy = JSON.parse(JSON.stringify(e)); w.entities[nk] = { ...copy, title: real, facts: [], mentions: [], page: false }; }
  else if (S.pages[nk]) return { blocked: real };
  const re = await mergeEntities(w, [[k, nk]]);
  const to = re(k);
  if (w.aliases?.[nk] === to) delete w.aliases[nk];
  try { await Store.saveWorld(w); } catch {}
  if (S.view?.name === "article" && S.view.key === k) S.view = { name: "article", key: to };
  if (Array.isArray(S.recent)) S.recent = [to, ...S.recent.filter(x => x !== k && x !== to)].slice(0, 8);
  return { from, to, real };
}
/* [제목을 본명으로 바꾸기] 버튼 */
async function renameToRealName(k) {
  const w = S.world; if (!w?.entities[k] || !realNameFor(w, k)) return;
  if (S.gen || S.storyGen || S.syncing || S.edit) { toast("다른 작업이 끝난 뒤 바꿔 주세요."); return; }
  const r = await moveTitleToRealName(w, k); if (!r) return;
  if (r.blocked) { toast(`「${r.blocked}」 문서가 이미 있습니다. 합치기로 정리해 주세요.`); return; }
  S.view = { name: "article", key: r.to };
  renderAll(); window.scrollTo({ top: 0 });
  toast(`제목을 「${r.from}」에서 「${r.real}」(으)로 바꿨습니다. 「${r.from}」 링크는 이 문서로 이어집니다.`);
}
/* 작성 직후: 새로 쓰거나 다시 쓴 인물 문서의 코드명 제목을 본명으로 옮기고, 문서 위에 바꾼 사실을 남긴다 */
async function autoRealNameTitle(w, k) {
  if (isStory(w)) return null;
  const r = await moveTitleToRealName(w, k); if (!r || r.blocked) return null;
  const p = S.pages[r.to]; if (p) { p.renamedFrom = { from: r.from, at: Date.now() }; try { await Store.savePage(w.id, p); } catch {} }
  return r;
}
/* 세계관을 열 때: 이미 있는 인물 문서 가운데 칭호·코드명 제목인 것을 모두 본명으로 옮긴다. 옮긴 목록을 돌려준다 */
async function autoRealNameTitles(w) {
  const out = [];
  if (!w || isStory(w) || S.world !== w) return out;
  for (const k of Object.keys(S.pages)) {
    if (S.world !== w || !S.pages[k] || !w.entities[k] || !realNameFor(w, k)) continue;
    const r = await autoRealNameTitle(w, k).catch(() => null); if (r) out.push(r);
  }
  return out;
}
/* 설정 노트: 같은 인물일 수 있는 두 문서 */
function nameTwinsHtml(w) {
  const xs = (w.nameTwins || []).filter(t => S.pages[t.a] && S.pages[t.b] && twinOk(w, t.a, t.b));
  if (!xs.length) return "";
  return `<h2>같은 인물일 수 있는 두 문서</h2>
    <p class="note">인물 문서의 인포박스 이름이 다른 인물 문서의 제목과 같습니다. 같은 인물이면 합치고, 아니면 다른 인물로 표시해 주세요. 자동으로 합치지 않습니다.</p>
    <ul class="twins">${xs.map(t => `<li>${linkHtml(w.entities[t.a].title)} · ${linkHtml(w.entities[t.b].title)} <span class="src">(겹치는 이름: ${esc(t.name)})</span>
      <div class="row" style="margin-top:4px"><button type="button" class="btn" data-mgdo="${t.a}" data-mgto="${t.b}" ${S.gen || S.storyGen || S.syncing ? "disabled" : ""}>「${esc(w.entities[t.b].title)}」에 합치기</button><button type="button" class="btn" data-notsame="${t.a}" data-other="${t.b}">다른 인물입니다</button></div></li>`).join("")}</ul>`;
}

/* 새 AI 응답만 검증한다. 이름이 비슷하다는 추측으로 기존 데이터를 변경하지 않는다. */
function validateAIIdentity(w, key, out) {
  if(!w || !out || typeof out!=="object")return;
  const people=new Map();
  const remember=(name,owner)=>{
    const id=identityName(name);if(!id)return;
    if(!people.has(id))people.set(id,new Set());people.get(id).add(owner);
  };
  for(const [id,e]of Object.entries(w.entities||{})){
    if(e.type!=="인물" || w.entities[key]?.notSame?.includes(id)||e.notSame?.includes(key))continue;
    remember(e.title,id);
  }
  for(const [id,p]of Object.entries(S.world===w?S.pages:{})){
    if(p.type!=="인물" || !w.entities[id])continue;
    if(w.entities[key]?.notSame?.includes(id)||w.entities[id].notSame?.includes(key))continue;
    for(const name of [p.title,...infoboxNames(p)])remember(name,id);
  }
  const rows=[...(out.type?[{...out,title:out.title||w.entities[key]?.title}]:[]),...(Array.isArray(out.newEntities)?out.newEntities:[])];
  for(const [i,row]of rows.entries())if(row?.type==="인물"){
    const owner=keyOf(norm(row.title||""))||String(i);
    for(const name of [row.title,...infoboxNames({infobox:Array.isArray(row.infobox)?row.infobox:[]}),...(Array.isArray(row.aliases)?row.aliases.filter(x=>typeof x==="string"):[])])remember(name,owner);
  }
  for(const row of rows){
    if(!row || !row.type || row.type==="인물")continue;
    const owners=new Set(people.get(identityName(row.title||""))||[]);
    const aliasOwner=w.aliases?.[keyOf(norm(row.title||""))];
    if(aliasOwner && w.entities[aliasOwner]?.type==="인물" && !w.entities[key]?.notSame?.includes(aliasOwner) && !w.entities[aliasOwner].notSame?.includes(key))owners.add(aliasOwner);
    // '본명/성명'과 호출부호를 함께 명시하면서 물건으로 출력한 자기모순도 차단한다.
    const box=Array.isArray(row.infobox)?row.infobox:[];
    const real=box.some(r=>/^(?:본명|성명)$/.test(stripMarks(r?.label||"").replace(/\s/g,"")) && infoboxNames({infobox:[r]},true).length);
    const code=box.some(r=>CODE_NAME_LABEL.test(stripMarks(r?.label||"").replace(/\s/g,"")));
    if(owners?.size===1 || real&&code)throw {code:"identity_conflict",message:`「${row.title||w.entities[key]?.title||"항목"}」을 인물의 이름·호출부호와 별도 대상으로 동시에 분류한 AI 응답이라 저장하지 않았습니다. 다시 시도해 주세요.`};
  }
}
