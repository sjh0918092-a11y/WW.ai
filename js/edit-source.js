"use strict";
/* 직접 편집: 원문 변환과 충돌 분석 */
/* ---------- 직접 편집 ---------- */
function pageToSource(w, p) {
  const body = p.sections.map(s => { const m = (s.level || 1) === 2 ? "==" : "="; return `${m} ${s.ch && m === "=" ? `[${s.ch}장] ` : ""}${s.heading} ${m}\n${s.body.trim()}`; }).join("\n\n");
  const navbox = Object.values(w.navboxes || {}).filter(nb => nb.src === p.key)
    .map(nb => `= ${nb.title} =\n` + nb.rows.map(r => `${r.label ? `== ${r.label} ==\n` : ""}${r.items.join("\n")}`).join("\n")).join("\n\n");
  return { summary: p.summary || "", type: p.type || "", cats: (p.categories || []).join(" | "), notices: (p.notices || []).join("\n"),
    infobox: (p.infobox || []).map(r => `${r.label}: ${r.value}`).join("\n"), body, navbox };
}
function parseHeadings(text) {
  const pre = [], parts = []; let cur = null;
  for (const line of String(text || "").replace(/\r/g, "").split("\n")) {
    const m = line.match(/^(={1,2})\s*(.+?)\s*\1\s*$/);
    if (m) { cur = { level: m[1].length, heading: m[2].trim(), lines: [] }; parts.push(cur); }
    else (cur ? cur.lines : pre).push(line);
  }
  return { pre: pre.join("\n").trim(), parts: parts.map(p => ({ level: p.level, heading: p.heading, text: p.lines.join("\n").trim() })) };
}
function sourceToOut(f) {
  const b = parseHeadings(f.body), sections = [];
  if (b.pre) sections.push({ heading: "개요", level: 1, body: b.pre });
  let ch = 0;   // "= [2장] 제목 =" 은 장 섹션. 그 아래 하위 섹션도 같은 장이다. [2장]을 지우면 본문 섹션이 된다
  for (const p of b.parts) {
    const m = p.level === 1 ? /^\[(\d+)장\]\s*(.*)$/.exec(p.heading) : null;
    if (p.level === 1) ch = m ? +m[1] : 0;
    const s = { heading: m ? (m[2].trim() || `${m[1]}장`) : p.heading, level: p.level, body: p.text }; if (ch) s.ch = ch;
    sections.push(s);
  }
  const infobox = f.infobox.split("\n").map(l => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(r => r && r.label && r.value);
  const n = parseHeadings(f.navbox), navboxes = []; let box = null;
  const items = t => t.split("\n").map(s => s.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean);
  if (n.pre) { box = { title: "구성원", rows: [{ label: "", items: items(n.pre) }] }; navboxes.push(box); }
  for (const p of n.parts) {
    if (p.level === 1) { box = { title: p.heading, rows: [] }; navboxes.push(box); if (p.text) box.rows.push({ label: "", items: items(p.text) }); }
    else { if (!box) { box = { title: "구성원", rows: [] }; navboxes.push(box); } box.rows.push({ label: p.heading, items: items(p.text) }); }
  }
  return { type: f.type.trim(), summary: f.summary.trim(), categories: f.cats.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean),
    notices: f.notices.split("\n").map(s => s.trim()).filter(Boolean), infobox, sections, navboxes, facts: [], timeline: [], newEntities: [] };
}
function cleanupOrphans(w, k) {
  for (const [x, o] of Object.entries(w.entities))
    if (x !== k && x !== w.mainKey && o.origin === k && !o.page && !o.facts.length && !o.mentions.length && !(S.gen && S.gen.key === x)) delete w.entities[x];
}
function docText(p, w, navs) {
  const keepFn = s => String(s || "").replace(/\[\*\s*([^\]]*)\]/g, " ($1)");
  const nbs = navs || Object.values(w.navboxes || {}).filter(nb => nb.src === p.key);
  return [`# ${p.title}`, p.summary ? `정의: ${p.summary}` : "", ...(p.infobox || []).map(r => `${r.label}: ${stripMarks(r.value)}`),
    ...p.sections.map(s => `${(s.level || 1) === 2 ? "###" : "##"} ${s.ch && (s.level || 1) === 1 ? `[${s.ch}장] ` : ""}${s.heading}\n${stripMarks(keepFn(s.body))}`),
    ...nbs.map(nb => `### 틀: ${nb.title}\n` + nb.rows.map(r => `- ${r.label ? r.label + ": " : ""}${r.items.map(stripMarks).join(" / ")}`).join("\n"))].filter(Boolean).join("\n");
}
/* 수정본이 링크한 기존 항목 */
function linksOfOut(w, out, k) {
  const texts = [...out.sections.map(s => s.body), ...out.infobox.map(r => r.value), ...out.notices, ...out.navboxes.flatMap(nb => nb.rows.flatMap(r => r.items))];
  const ks = [];
  for (const t of texts) for (const m of String(t).matchAll(LINK_RE)) { const lk = kOf(w, m[1]); if (lk !== k && !ks.includes(lk)) ks.push(lk); }
  return ks;
}
/* 수정본과 대조할 기존 설정. 각 항목에 R/U/T/F/M 번호를 붙여 모델이 가리킬 수 있게 한다.
   이 문서가 앞서 대체했던 사실도 다시 대조 대상에 넣는다(수정으로 되돌렸을 수 있으므로). */
function conflictContext(w, k, linkKeys) {
  const refs = {}, R = [], T = [], F = [], M = [];
  (w.rules || []).forEach((r, i) => { refs["R" + (i + 1)] = { kind: "rule", i }; R.push(`R${i + 1}. ${r}`); });
  const U = (w.userCanon || "").trim(); if (U) refs.U = { kind: "canon" };
  let n = 0;
  // 연표는 다 남겨 두므로 대조에는 고른 것만 보낸다. 원안 연표와 직접 수정한 문서의 항목은 언제나 넣는다
  const tlAll = w.timeline.filter(t => t.src !== k && (!t.sup || t.sup.by === k));
  const tlPick = new Set(pickRelevant(w, k, tlAll, t => `${t.year}년 ${t.event}`, TIMELINE_PROMPT_N, [k, ...linkKeys].map(x => w.entities[x]?.title || "").join("\n")));
  for (const t of tlAll) { if (!tlPick.has(t) && t.src !== "seed" && !S.pages[t.src]?.editedAt) continue; n++; refs["T" + n] = { kind: "timeline", t }; T.push(`T${n}. ${t.year}: ${t.event}`); }
  const active = x => !x.sup || x.sup.by === k;
  n = 0;
  for (const ek of [k, ...linkKeys]) {
    const o = w.entities[ek]; if (!o) continue;
    for (const f of o.facts) {
      if (f.src === k || !active(f) || n >= 40) continue;
      n++; refs["F" + n] = { kind: "fact", f };
      F.push(`F${n}. 「${o.title}」에 관해: ${f.t} (출처 「${srcTitle(w, f.src, "?")}」${S.pages[f.src]?.editedAt ? ", 사용자가 직접 수정한 문서" : ""})`);
    }
  }
  n = 0;
  for (const m of w.entities[k].mentions) {
    if (m.from === k || !active(m) || n >= 40) continue;
    n++; refs["M" + n] = { kind: "mention", m };
    M.push(`M${n}. 「${w.entities[m.from]?.title || "?"}」 본문: "${m.text}"${S.pages[m.from]?.editedAt ? " (사용자가 직접 수정한 문서)" : ""}`);
  }
  const L = []; n = 0;
  const near = new Set([k, ...linkKeys]);
  for (const x of (w.relations || [])) {
    if (x.src === k || !active(x) || !(near.has(x.a) || near.has(x.b)) || !w.entities[x.a] || !w.entities[x.b] || n >= 20) continue;
    n++; refs["L" + n] = { kind: "relation", l: x };
    L.push(`L${n}. ${relLine(w, x)} (출처 「${srcTitle(w, x.src, "?")}」${S.pages[x.src]?.editedAt ? ", 사용자가 직접 수정한 문서" : ""})`);
  }
  const text = `### 핵심 규칙\n${R.join("\n") || "(없음)"}\n\n### 사용자 확정 설정 (U)\n${U || "(없음)"}\n\n### 연표\n${T.join("\n") || "(없음)"}\n\n### 다른 문서가 확정한 사실\n${F.join("\n") || "(없음)"}\n\n### 다른 문서 본문에서 이 항목을 언급한 문장\n${M.join("\n") || "(없음)"}\n\n### 확정된 인물 관계\n${L.join("\n") || "(없음)"}`;
  return { refs, text };
}
function factSyncPrompt(w, temp, linkKeys) {
  const linked = linkKeys.filter(k => w.entities[k]).map(k => w.entities[k].title).join(" / ") || "(없음)";
  return `## 문서의 확정 사실 정리
가상 세계관 위키 「${w.title}」(작중 기준 ${w.era})의 문서에서 확정 사실, 연표, 인물 관계를 추출한다. 문서에 적힌 내용만 쓰고 새 내용을 지어내거나 고치지 않는다. 모순을 검사하거나 교정안을 만들지 않는다.
${docText(temp, w, temp.navboxes)}

링크한 항목: ${linked}
JSON 객체 하나만 출력:
{"facts":[{"about":"항목 제목","fact":"사실 한 문장"}],"timeline":[{"year":"연도","about":"사건의 주체 항목 제목","event":"사건"}],"newEntities":[{"title":"항목 제목","type":"${TYPES.join("|")} 중 하나","summary":"본문에 근거한 한 문장 정의"}],"relations":[{"a":"인물 제목","b":"인물 제목","rel":"관계 이름","story":"관계의 시작과 변화 한 문장"}],${EVENTS_JSON}}
${EVENTS_SPEC}
facts에는 「${temp.title}」 자체의 핵심 사실 3~6개와 주요 링크 항목의 사실을 넣는다. about, a, b는 문서 제목이나 링크한 항목 제목 그대로 쓴다. timeline에는 연도가 적힌 사건 중 세계에 영향을 준 것만 0~2개 넣고, 현재 상태·근황·거주는 넣지 않는다. about에는 사건의 주체가 되는 항목 제목을 글자 그대로 쓴다. newEntities에는 아직 정의가 없는 링크 항목만 넣는다. relations는 문서에 적힌 주요 인물 관계를 6개까지 넣는다.`;
}
function analyzePrompt(w, temp, linkKeys, ctx) {
  const linked = linkKeys.filter(x => w.entities[x]).map(x => `- ${w.entities[x].title}${w.entities[x].page || w.entities[x].summary ? "" : " (정의 없음)"}`).join("\n") || "(없음)";
  return `다음은 가상 세계관 위키 「${w.title}」(작중 기준 시점 ${w.era})의 문서 「${temp.title}」이며, 사용자가 직접 수정한 최종본이다. 두 가지를 하라.
1. 이 문서가 확정하는 사실을 추출한다. 문서에 적힌 내용만 쓰고, 새로운 내용을 지어내거나 기존 설정에 맞춰 고치지 않는다.
2. 이 문서의 서술이 아래 '기존 설정'과 정면으로 모순되는 곳을 찾는다. 다음을 모두 만족할 때만 모순이다.
   - 같은 대상, 같은 시점에 관한 서술이다. 부모와 자식, 같은 성을 쓰는 다른 사람, 다른 시기의 일은 같은 대상이 아니다(예: 아버지가 하급 관리 집안 출신이어도 그 아들이 나중에 법관 집안에서 태어난 것은 모순이 아니다).
   - 둘이 동시에 참일 수 없다. 새로 추가된 정보, 더 자세해진 정보, 둘 다 있을 수 있는 일(예: 만년필을 물려줬지만 판결문은 연필로 썼다), 표현이나 해석의 차이는 모순이 아니다.
   - 모순이 아닌 것을 모순으로 적느니 빠뜨리는 쪽이 낫다.

## 수정된 문서
${docText(temp, w, temp.navboxes)}

## 이 문서가 링크한 항목
${linked}

## 기존 설정
${ctx.text}

JSON 객체 하나만 출력:
{"facts":[{"about":"항목 제목","fact":"사실 한 문장"}],"timeline":[{"year":"연도","event":"사건"}],"newEntities":[{"title":"항목 제목","type":"${TYPES.join("|")} 중 하나","summary":"이 문서에 근거한 한 문장 정의"}],"relations":[{"a":"인물 제목","b":"인물 제목","rel":"관계 이름","story":"관계의 시작과 변화 한 문장"}],"conflicts":[{"ref":"R1, U, T3, F7, M2, L4 같은 기존 설정 번호 하나","claim":"수정본의 해당 서술","old":"충돌하는 기존 설정 내용","suggest":"ref가 R일 때만: 수정본에 맞게 고친 규칙 한 문장"}],${EVENTS_JSON}}
${EVENTS_SPEC}
facts에는 링크한 항목 중 중요한 것(인물, 조직, 사건, 장소 위주) 6~10개에 대해 1개씩 넣되, 절정이나 큰 사건에 등장한 항목은 빠짐없이 포함한다. 그리고 「${temp.title}」 자체에 대한 핵심 사실 3~6개를 넣는다. 사실은 모두 한 문장으로 짧게 쓴다. about은 목록의 제목이나 「${temp.title}」를 글자 그대로 쓴다. timeline에는 문서에 연도가 적힌 주요 사건만 넣는다. newEntities에는 '정의 없음'으로 표시된 항목만 넣는다. relations에는 이 문서에 적힌 인물 사이의 주요 관계를 6개까지 넣는다(a, b는 이 문서 제목이나 링크한 항목 제목 그대로). 모순이 없으면 conflicts는 빈 배열.`;
}
function readConflicts(w, raw, refs) {
  const out = [], seen = new Set();
  for (const c of (Array.isArray(raw) ? raw : [])) {
    if (!c || !c.ref) continue;
    const id = String(c.ref).trim().toUpperCase(), ref = refs[id];
    if (!ref || seen.has(id)) continue; seen.add(id);
    const x = { id, kind: ref.kind, claim: stripMarks(c.claim).slice(0, 300), old: stripMarks(c.old).slice(0, 300) };
    if (ref.kind === "rule") Object.assign(x, { i: ref.i, old: x.old || w.rules[ref.i], suggest: stripMarks(c.suggest).slice(0, 300) || w.rules[ref.i] });
    if (ref.kind === "canon") x.old = x.old || "사용자 확정 설정";
    if (ref.kind === "fact") Object.assign(x, { f: ref.f, src: ref.f.src, old: x.old || ref.f.t });
    if (ref.kind === "mention") Object.assign(x, { m: ref.m, src: ref.m.from, old: x.old || ref.m.text });
    if (ref.kind === "timeline") Object.assign(x, { t: ref.t, src: ref.t.src, old: x.old || `${ref.t.year}: ${ref.t.event}` });
    if (ref.kind === "relation") Object.assign(x, { l: ref.l, src: ref.l.src, old: x.old || relLine(w, ref.l) });
    // 사용자 자신이 정한 것(핵심 규칙, 확정 설정, 직접 수정한 문서)과의 충돌은 사용자에게 묻는다
    x.ask = ref.kind === "rule" || ref.kind === "canon" || !!(x.src && S.pages[x.src]?.editedAt);
    out.push(x);
  }
  return out.slice(0, 24);
}
const conflictLabel = (w, c) => c.kind === "rule" ? `핵심 규칙 ${c.id}` : c.kind === "canon" ? "사용자 확정 설정"
  : c.kind === "timeline" ? `연표${c.src && w.entities[c.src] ? ` (「${w.entities[c.src].title}」)` : ""}` : `「${w.entities[c.src]?.title || "?"}」${S.pages[c.src]?.editedAt ? " (직접 수정한 문서)" : ""}`;
