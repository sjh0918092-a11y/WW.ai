"use strict";
/* 본문 글을 골라 링크로 만들기 */
/* ---------- 본문 글을 골라 링크로 만들기 ----------
 * 본문의 평문을 드래그(모바일은 길게 눌러 선택)하면 버튼이 뜨고, 누르면 그 자리를 [[ ]]로 감싼다. 없는 항목이면 빨간 링크가 된다.
 * 화면의 글과 원문을 맞추는 법: 링크·각주 안의 글은 양쪽에서 모두 빼고(굵게·취소선은 기호만 뺀다), 고른 글이 그 문단에서 몇 번째로 나오는지로 원문 위치를 찾는다. */
const SEL_SKIP = "a, sup";
function plainNodes(root) {   // 링크·각주·서식 밖의 글 조각들
  const out = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (!n.parentElement.closest(SEL_SKIP)) out.push(n);
  return out;
}
function maskSource(t) {   // 원문과 같은 길이로, 화면에 평문으로 나오지 않는 부분(링크, 각주, 굵게·취소선 기호)은 \0으로 가린다
  const a = t.split("");   // indexOf와 같은 UTF-16 칸 단위
  const hide = (i, j) => { for (let x = i; x < j; x++) a[x] = "\0"; };
  for (let i = 0; i < t.length; i++) if (t[i] === "[" && t[i + 1] === "*") { let d = 1, j = i + 2; while (j < t.length && d > 0) { if (t[j] === "[") d++; else if (t[j] === "]") d--; j++; } if (d === 0) { hide(i, j); i = j - 1; } }
  const m1 = a.join("");
  for (const m of m1.matchAll(new RegExp(LINK_RE.source, "g"))) if (!m[0].includes("\0")) hide(m.index, m.index + m[0].length);
  for (const re of [/\*\*([^*]+)\*\*/g, /~~([^~]+)~~/g]) for (const m of m1.matchAll(re)) { hide(m.index, m.index + 2); hide(m.index + m[0].length - 2, m.index + m[0].length); }   // 서식 안의 글은 화면에 그대로 보이니 기호만 가린다
  return a.join("");
}
/* 지금 선택이 링크로 만들 수 있는 글이면 { k, bi, n, text } */
function selTarget() {
  const sel = getSelection(); if (!sel || sel.isCollapsed || sel.rangeCount !== 1) return null;
  const r = sel.getRangeAt(0), node = r.startContainer;
  if (node !== r.endContainer || node.nodeType !== 3) return null;   // 한 글 조각 안에서만(링크나 서식 경계를 넘지 않게)
  const secb = node.parentElement.closest(".article .secb"); if (!secb || node.parentElement.closest(SEL_SKIP)) return null;
  const v = S.view; if (v.name !== "article" || !S.world || !S.pages[v.key]) return null;
  let a = r.startOffset, b = r.endOffset; const raw = node.data;
  while (a < b && /\s/.test(raw[a])) a++; while (b > a && /\s/.test(raw[b - 1])) b--;
  const text = raw.slice(a, b); if (!text || text.length > 60 || /[\[\]|*~\n]/.test(text)) return null;
  let n = 0;   // 같은 문단에서 이 글이 앞에 몇 번 나왔나
  for (const x of plainNodes(secb)) {
    const d = x.data, end = x === node ? a : Infinity;
    for (let i = d.indexOf(text); i >= 0 && i < end; i = d.indexOf(text, i + 1)) n++;
    if (x === node) break;
  }
  return { k: v.key, where: secb.dataset.ib != null ? ["infobox", +secb.dataset.ib, "value"] : ["sections", +secb.dataset.bi, "body"], n, text, range: r };   // 섹션 본문 또는 인포박스 값
}
function selBusy(k) {
  const w = S.world;
  if (S.edit) return "편집 중에는 링크를 만들 수 없습니다.";
  if (S.gen?.key === k || S.syncing === k || isHeld(k) || (S.storyGen && isStory(w) && k === w.story.protagonistKey)) return "이 문서를 작성하거나 맞춰 보는 중입니다. 끝난 뒤 다시 해 주세요.";
  return "";
}
async function linkSelection(t) {
  const w = S.world, p = S.pages[t.k]; if (!w || !p) return;
  const busy = selBusy(t.k); if (busy) { toast(busy); return; }
  const [list, idx, fld] = t.where, sec = p[list]?.[idx]; if (!sec || typeof sec[fld] !== "string") return;
  const body = sec[fld], mask = maskSource(body);
  let at = -1;
  for (let i = mask.indexOf(t.text), c = 0; i >= 0; i = mask.indexOf(t.text, i + 1)) if (c++ === t.n) { at = i; break; }
  if (at < 0) { toast("원문에서 이 부분을 찾지 못했습니다. 편집으로 [[ ]]를 넣어 주세요."); return; }
  const title = norm(t.text), owner = S.pages[keyOf(title)] ? null : personByName(w, title, null);   // 기존 인물의 별칭·인포박스 이름이면 새 항목을 만들지 않고 그 인물로
  const lk = owner || kOf(w, title);
  if (lk === t.k) { toast("이 문서 자기 자신에는 링크를 걸 수 없습니다."); return; }
  const tag = owner && w.entities[owner].title !== title ? `[[${w.entities[owner].title}|${title}]]` : `[[${title}]]`;
  sec[fld] = body.slice(0, at) + tag + body.slice(at + t.text.length);
  const made = !w.entities[lk];
  if (made) { w.entities[lk] = newEntity(title, "", ""); w.entities[lk].origin = t.k; }
  const e = w.entities[lk], mention = list === "infobox" ? `${p.title} 정보 — ${sec.label}: ${stripMarks(sec[fld])}`.slice(0, 420) : sentenceAround(sec[fld], at, tag.length), hadMention = e.mentions.some(m => m.from === t.k && m.text === mention);
  addMention(e, t.k, mention);
  const hadLink = (p.links ||= []).includes(lk); if (!hadLink) p.links.push(lk);
  if (list === "infobox") { const pe = w.entities[t.k]; if (pe) pe.box = p.infobox.map(r => r.label + ": " + stripMarks(r.value)).join(" / ").slice(0, 400); }
  getSelection()?.removeAllRanges(); hideSelPop();
  const save = async () => { try { await Store.savePage(w.id, p); await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); } };
  await save(); renderAll();
  const undo = async () => {
    if (S.world !== w || S.pages[t.k] !== p || sec[fld].slice(at, at + tag.length) !== tag) { toast("그새 문서가 바뀌어 되돌릴 수 없습니다. 편집으로 고쳐 주세요."); return; }
    sec[fld] = body;
    if (!hadMention) e.mentions = e.mentions.filter(m => !(m.from === t.k && m.text === mention));
    if (!hadLink) p.links = p.links.filter(x => x !== lk);
    if (made && !S.pages[lk] && !e.mentions.length && !e.facts.length) delete w.entities[lk];
    await save(); renderAll();
  };
  toast(S.pages[lk] ? `「${e.title}」 문서로 링크했습니다.` : `「${title}」 빨간 링크를 만들었습니다. 누르면 문서를 작성합니다.`, { label: "되돌리기", fn: undo });
}
let selPop = null, selT = null;
function hideSelPop() { if (selPop) selPop.style.display = "none"; selT = null; }
function showSelPop() {
  const t = selTarget(); if (!t || selBusy(t.k)) { hideSelPop(); return; }
  if (!selPop) {
    selPop = document.createElement("button"); selPop.type = "button"; selPop.className = "selpop"; selPop.id = "selPop"; document.body.appendChild(selPop);
    selPop.addEventListener("pointerdown", ev => ev.preventDefault());   // 누르는 순간 선택이 풀리지 않게
    selPop.addEventListener("click", () => { const x = selT; hideSelPop(); if (x) linkSelection(x); });
  }
  selT = t;
  const has = !!S.pages[kOf(S.world, norm(t.text))] || !!personByName(S.world, norm(t.text), null);
  selPop.textContent = has ? "문서 링크로 만들기" : "빨간 링크 만들기"; selPop.classList.toggle("blue", has);
  selPop.style.display = "block";
  const rc = t.range.getBoundingClientRect(), bw = selPop.offsetWidth, bh = selPop.offsetHeight;
  let top = rc.bottom + 8; if (top + bh > innerHeight - 12) top = Math.max(12, rc.top - bh - 8);   // 모바일 기본 메뉴(위쪽)와 겹치지 않게 아래에 둔다
  selPop.style.top = top + "px"; selPop.style.left = Math.max(16, Math.min(innerWidth - bw - 16, rc.left + rc.width / 2 - bw / 2)) + "px";
}
let selTimer = null;
document.addEventListener("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(showSelPop, 180); });
addEventListener("scroll", () => { if (selT) showSelPop(); }, { passive: true });
addEventListener("resize", hideSelPop);
