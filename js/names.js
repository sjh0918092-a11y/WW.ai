"use strict";
/* 인물 이름 안전장치: 어느 경로로 만들어졌든 인물 문서의 인포박스 이름(본명·코드명 등)을 이 문서로 이어 준다.
   - 이름 칸의 이름은 w.aliases에 이 문서 키로 등록한다(앞으로 그 이름으로 링크하면 이 문서로 간다).
   - 그 이름의 빨간 링크 항목이 이미 있으면 이 문서에 합친다. 문서가 있는 항목은 건드리지 않고 w.nameTwins에 남겨 설정 노트에 띄운다.
   - 기존 문서의 제목은 자동으로 바꾸지 않는다. 코드명 제목은 사용자가 [제목을 본명으로 바꾸기]를 눌렀을 때만 바꾼다. */
const NAME_JUNK = /미상|불명|없음|비공개|알\s*수\s*없|해당\s*없|기밀|불확실|^[-—–]+$/;
const REAL_NAME_LABEL = /^(?:본명|성명|이름)$/;
const CODE_NAME_LABEL = /^(?:코드명|암호명|제식명|활동명|별칭|별명|가명|호출부호|콜사인|이명|칭호)$/;
/* 인포박스 이름 칸(IDENTITY_LABEL)의 이름들. 링크된 이름은 다른 항목을 가리킬 수 있어 읽지 않는다. real이면 본명 칸만 */
function infoboxNames(p, real = false) {
  const out = [];
  for (const r of p?.infobox || []) {
    const label = stripMarks(r.label).replace(/\s/g, "");
    if (!(real ? REAL_NAME_LABEL : IDENTITY_LABEL).test(label)) continue;
    const text = stripMarks(String(r.value || "").replace(LINK_RE, ","));
    for (const part of text.split(/\s*(?:[,，、;/／]|\s또는\s|\s혹은\s)\s*/)) {
      const pm = /^(.*?)\s*[(（]([^)）]*)[)）]\s*$/.exec(part);
      for (let x of pm ? [pm[1], pm[2]] : [part]) {
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
    if (cur && cur !== k && w.entities[cur]) continue;   // 다른 항목의 별칭이면 그대로 둔다
    if (cur !== k) { w.aliases[nk] = k; res.aliased.push(n); }
  }
  if (merges.length) await mergeEntities(w, merges);   // 빨간 링크의 언급·사실은 이 문서로 옮기고, 그 이름은 별칭이 된다
  return res;
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
/* 코드명 형태로 만들어진 인물 제목이면 바꿀 본명. 아니면 "" */
function realNameFor(w, k) {
  const p = S.world === w ? S.pages[k] : null; if (!p || !isPerson(w, k)) return "";
  const real = infoboxNames(p, true).find(n => identityName(n) !== identityName(p.title)); if (!real) return "";
  const codes = (p.infobox || []).filter(r => CODE_NAME_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))).map(r => identityName(r.value));
  const codeLike = /['"‘’“”「」『』]|\d|[(（]/.test(p.title) || codes.some(c => c.includes(identityName(p.title)));
  if (!codeLike) return "";
  const rk = keyOf(real);
  if (rk !== k && S.pages[rk]) return "";   // 본명 문서가 따로 있으면 합치기로 다룬다
  return real;
}
/* [제목을 본명으로 바꾸기]: 문서를 본명 키로 옮기고 옛 제목은 별칭으로 남긴다 */
async function renameToRealName(k) {
  const w = S.world, e = w?.entities[k], real = w ? realNameFor(w, k) : ""; if (!e || !real) return;
  if (S.gen || S.storyGen || S.syncing || S.edit) { toast("다른 작업이 끝난 뒤 바꿔 주세요."); return; }
  const from = e.title, nk = keyOf(real);
  if (!w.entities[nk]) { const copy = JSON.parse(JSON.stringify(e)); w.entities[nk] = { ...copy, title: real, facts: [], mentions: [], page: false }; }
  else if (S.pages[nk]) { toast(`「${real}」 문서가 이미 있습니다. 합치기로 정리해 주세요.`); return; }
  const re = await mergeEntities(w, [[k, nk]]);
  const to = re(k);
  if (w.aliases?.[nk] === to) delete w.aliases[nk];
  try { await Store.saveWorld(w); } catch {}
  S.view = { name: "article", key: to }; S.recent = [to, ...S.recent.filter(x => x !== k && x !== to)].slice(0, 8);
  renderAll(); window.scrollTo({ top: 0 });
  toast(`제목을 「${from}」에서 「${real}」(으)로 바꿨습니다. 「${from}」 링크는 이 문서로 이어집니다.`);
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
