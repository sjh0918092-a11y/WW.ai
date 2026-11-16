#!/usr/bin/env node
/* 백업 진단 도구: 앱의 '백업 내보내기' JSON(worlds + pages)을 읽어, 문서 간 오류가 어느 경로에서 새는지 보여 준다.
 * AI를 부르지 않는다. 앱의 실제 함수(검사 자료 선택, 결정론 검사, 수정 요청 판정)를 그대로 불러 쓴다.
 *
 * 사용법:
 *   node tools/diagnose-backup.cjs 백업.json                    전체 보고서(마크다운)를 표준 출력으로
 *   node tools/diagnose-backup.cjs 백업.json --out 보고서.md     파일로 저장
 *   node tools/diagnose-backup.cjs 백업.json --pair "소련" "아르자마스-16 마도물리연구소"   두 문서 사이의 경로만
 *   node tools/diagnose-backup.cjs 백업.json --world 세계관제목   세계관이 여럿이면 고른다
 *
 * 한계: 문서의 링크·언급은 백업 시점 상태다. '그때 리뷰에 들어갔는가'는 그 문서보다 먼저 만든 문서만 남겨 다시 계산한 추정이다.
 * v7.62 이후에 만든 문서는 page.check.sources(실제로 넘어간 원문 목록)와 page.checkLog가 남으므로 추정 대신 그 기록을 쓴다. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.join(__dirname, "..");

function appSource() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(?!https?:)([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m => m[1]).filter(f => !/\/boot\.js$/.test(f));
  return files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
}
function loadApp() {
  const node = { addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {} }, local = new Map();
  const c = { console: { ...console, warn() {} }, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, performance, crypto: globalThis.crypto, structuredClone,
    addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, fetch: async () => { throw new Error("진단 도구는 네트워크를 쓰지 않는다"); },
    localStorage: { getItem: k => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, indexedDB: undefined,
    document: { hidden: false, getElementById: () => null, querySelector: () => node, querySelectorAll: () => [], addEventListener() {}, createElement: () => node, body: node, documentElement: node },
    window: { addEventListener() {} }, navigator: {}, location: { hash: "", pathname: "/", search: "", origin: "http://localhost" }, history: { replaceState() {} } };
  vm.createContext(c);
  vm.runInContext(appSource() + `
;globalThis.__app = { S, keyOf, kOf, stripMarks, pageTexts, checkSourceBatches, checkKeys, detIssues, evidenceQuotes, findQuoteIn, hasName, refOK };`, c);
  return c.__app;
}

/* ---------- 입력 ---------- */
const args = process.argv.slice(2);
const opt = (name, n = 1) => { const i = args.indexOf(name); if (i < 0) return null; const v = args.slice(i + 1, i + 1 + n); args.splice(i, n + 1); return n === 1 ? v[0] : v; };
const outFile = opt("--out"), pair = opt("--pair", 2), worldName = opt("--world");
const file = args[0];
if (!file) { console.error("사용법: node tools/diagnose-backup.cjs 백업.json [--out 보고서.md] [--pair 문서A 문서B] [--world 제목]"); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(data.worlds) || !data.pages) {
  console.error(Array.isArray(data.documents) ? "읽기 전용 내보내기(documents)에는 생성 시각·검사 기록·장부가 없습니다. 설정의 '백업 내보내기' 파일을 넣어 주세요." : "백업 형식(worlds, pages)이 아닙니다.");
  process.exit(2);
}
const W = worldName ? data.worlds.find(w => w.title === worldName) : data.worlds[0];
if (!W) { console.error(`세계관 「${worldName}」이 없습니다: ${data.worlds.map(w => w.title).join(", ")}`); process.exit(2); }
const PAGES = data.pages[W.id] || {};

const A = loadApp();
A.S.world = W; A.S.pages = PAGES;
const pages = Object.values(PAGES).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const byTitle = new Map(pages.map(p => [p.title, p]));
const T = ms => ms ? new Date(ms).toISOString().slice(11, 19) : "-";
const cell = t => String(t ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const lines = [];
const out = s => lines.push(s);

/* 그 문서를 리뷰할 때 원문이 함께 넘어간 문서들. 기록이 있으면 기록, 없으면 그보다 먼저 만든 문서만으로 다시 계산한다 */
function reviewSources(p) {
  if (Array.isArray(p.check?.sources)) return { titles: p.check.sources, batches: p.check.batches, recorded: true };
  const all = A.S.pages, before = {};
  for (const [k, q] of Object.entries(all)) if ((q.createdAt || 0) <= (p.createdAt || 0)) before[k] = q;
  A.S.pages = before;
  try {
    const b = A.checkSourceBatches(W, p.key);
    return { titles: b.titles || [], batches: b.length, chars: b.reduce((n, x) => n + x.length, 0), recorded: false };
  } finally { A.S.pages = all; }
}
function refsAtReview(p) {
  const all = A.S.pages, before = {};
  for (const [k, q] of Object.entries(all)) if ((q.createdAt || 0) <= (p.createdAt || 0)) before[k] = q;
  A.S.pages = before;
  try { return A.checkKeys(W, p.key).map(k => W.entities[k]?.title).filter(Boolean); } finally { A.S.pages = all; }
}
const SRC = new Map(pages.map(p => [p.key, reviewSources(p)]));

/* 두 문서 사이: 누가 먼저 썼고, 나중 문서를 리뷰할 때 앞 문서가 들어갔는가 */
function pairReport(a, b) {
  const P = byTitle.get(a), Q = byTitle.get(b);
  if (!P || !Q) return `문서를 찾지 못했습니다: ${!P ? a : b}`;
  const [first, later] = (P.createdAt || 0) <= (Q.createdAt || 0) ? [P, Q] : [Q, P];
  const sLater = SRC.get(later.key), sFirst = SRC.get(first.key);
  const r = [];
  r.push(`- 먼저 쓴 문서: 「${first.title}」 ${T(first.createdAt)} / 나중 문서: 「${later.title}」 ${T(later.createdAt)}`);
  r.push(`- 「${later.title}」 리뷰에 「${first.title}」 원문이 ${sLater.titles.includes(first.title) ? "들어감" : "안 들어감"}${sLater.recorded ? " (기록)" : " (추정)"}, 리뷰 호출 ${sLater.batches}회${sLater.chars ? `, 원문 ${sLater.chars.toLocaleString()}자` : ""}`);
  r.push(`- 「${first.title}」 리뷰 때는 「${later.title}」가 아직 없었음`);
  const fix = (first.autoConflicts || []).filter(c => c.by === later.key);
  r.push(`- 「${later.title}」가 「${first.title}」에 보낸 수정 요청: ${fix.length}건${fix.length ? " — " + fix.map(c => cell(c.old).slice(0, 60)).join(" / ") : ""}`);
  const un = (later.check?.issues || []).filter(i => i.unrouted === first.title);
  if (un.length) r.push(`- 보내지 못한 수정 요청: ${un.length}건`);
  const logs = (later.checkLog || []).filter(x => x.event);
  if (logs.length) r.push(`- 「${later.title}」 진단 기록: ${logs.map(x => `${T(x.at)} ${x.event}${x.cleared ? "(리뷰 결과 지워짐)" : ""}`).join(", ")}`);
  if (later.check === null || later.check === undefined) r.push(`- 주의: 「${later.title}」에는 리뷰 결과가 없습니다${later.fixedAt ? ` (고치기 ${T(later.fixedAt)} 뒤 지워짐)` : ""}.`);
  return r.join("\n");
}

if (pair) { console.log(`## 「${pair[0]}」 ↔ 「${pair[1]}」\n` + pairReport(pair[0], pair[1])); process.exit(0); }

/* ---------- 1. 요약 ---------- */
const routedTotal = pages.reduce((n, p) => n + (p.autoConflicts || []).length, 0);
const unroutedTotal = pages.reduce((n, p) => n + (p.check?.issues || []).filter(i => i.unrouted).length, 0);
const noCheck = pages.filter(p => !p.check);
const issuesAll = pages.flatMap(p => (p.check?.issues || []).map(i => ({ p, i })));
const prefixed = issuesAll.filter(({ i }) => /^근거: 「[^」]+」/.test(i.conflict || ""));
out(`# 백업 진단: 「${W.title}」`);
out(`내보낸 시각 ${data.exportedAt || "-"} · 문서 ${pages.length}개 · 항목 ${Object.keys(W.entities || {}).length}개 (단독 문서 없는 항목 ${Object.entries(W.entities || {}).filter(([k]) => !PAGES[k]).length}개)\n`);
out(`| 지표 | 값 | 볼 점 |\n|---|---|---|`);
out(`| 다른 문서로 간 수정 요청(autoConflicts) | ${routedTotal}건 | 0이면 주인 문서 → 앞 문서 수정 경로가 막힌 것 |`);
out(`| 보내지 못한 수정 요청(unrouted) | ${unroutedTotal}건 | v7.62부터 기록. 모델은 고칠 문서를 지목했는데 근거 구절을 그 문서에서 못 찾은 경우 |`);
out(`| 근거가 「제목」 접두어로 시작하는 남은 지적 | ${prefixed.length}/${issuesAll.length}건 | v7.61까지는 이 형식이면 수정 요청이 버려졌다 |`);
out(`| 리뷰 결과가 없는 문서 | ${noCheck.length}개 | ${noCheck.map(p => `「${p.title}」${p.fixedAt ? "(고치기 뒤)" : ""}`).join(", ") || "-"} |`);
out(`| 자동 수정된 지적 | ${pages.reduce((n, p) => n + (p.autoFixed?.n || 0), 0)}건 | 내용은 v7.62부터 check.fixed에 남는다 |`);
out("");

/* ---------- 2. 문서별 리뷰 입력 ---------- */
out(`## 문서별 리뷰 입력 (만든 순서)\n`);
out(`| 만든 시각 | 문서 | 원문 넘어간 문서 수 | 호출 | 원문 글자 | 관련 항목 칸에 못 들어간 빨간 링크 | 남은 지적 | 자동 수정 |\n|---|---|---|---|---|---|---|---|`);
for (const p of pages) {
  const s = SRC.get(p.key), refs = new Set(refsAtReview(p));
  const redLinks = [...new Set(p.links || [])].filter(k => W.entities[k] && !PAGES[k]).map(k => W.entities[k].title);
  const dropped = redLinks.filter(t => !refs.has(t));
  out(`| ${T(p.createdAt)} | ${cell(p.title)} | ${s.titles.length}${s.recorded ? "" : "*"} | ${s.batches} | ${s.chars ? s.chars.toLocaleString() : "-"} | ${dropped.length ? `${dropped.length}/${redLinks.length}: ${dropped.slice(0, 4).map(cell).join(", ")}${dropped.length > 4 ? " …" : ""}` : `0/${redLinks.length}`} | ${p.check ? (p.check.issues || []).length : "없음"} | ${p.autoFixed?.n || 0} |`);
}
out(`\n\\* 표시는 기록이 없어 그 문서보다 먼저 만든 문서만으로 다시 계산한 추정값이다. '관련 항목 칸에 못 들어간 빨간 링크'는 현재 코드 기준이다.\n`);

/* ---------- 3. 나중 문서의 리뷰가 앞 문서를 대조한 쌍 ---------- */
out(`## 앞 문서를 원문으로 대조한 나중 문서 (주인 문서 → 앞 문서 수정 경로의 후보)\n`);
out(`앞 문서에 오류가 있으면, 아래 나중 문서의 리뷰가 '고칠 쪽: 앞 문서'로 수정 요청을 보내야 한다.\n`);
out(`| 앞 문서 | 나중 문서들 (리뷰에 앞 문서 원문이 들어감) | 받은 수정 요청 |\n|---|---|---|`);
for (const p of pages) {
  const laters = pages.filter(q => (q.createdAt || 0) > (p.createdAt || 0) && SRC.get(q.key).titles.includes(p.title));
  if (!laters.length) continue;
  out(`| ${cell(p.title)} | ${laters.map(q => cell(q.title)).join(", ")} | ${(p.autoConflicts || []).length} |`);
}
out("");

/* ---------- 4. 빨간 링크 ---------- */
const reds = Object.entries(W.entities || {}).filter(([k]) => !PAGES[k]).map(([k, e]) => ({ k, e, from: new Set((e.mentions || []).map(m => m.from)) })).filter(x => x.from.size >= 2)
  .sort((a, b) => b.from.size - a.from.size).slice(0, 25);
out(`## 여러 문서가 링크한 빨간 링크 (단독 문서가 없는 사실의 주인 후보)\n`);
out(`| 항목 | 링크한 문서 수 | 링크 문장 | 확정 사실 | 문서 |\n|---|---|---|---|---|`);
for (const x of reds) out(`| ${cell(x.e.title)} | ${x.from.size} | ${(x.e.mentions || []).length} | ${(x.e.facts || []).length} | ${[...x.from].map(k => PAGES[k]?.title).filter(Boolean).map(cell).join(", ")} |`);
out("");

/* ---------- 5. 지금 코드의 결정론 검사 ---------- */
out(`## 지금 코드의 결정론 검사 결과 (AI 없이 다시 계산)\n`);
let detN = 0;
for (const p of pages) {
  let is = [];
  try { is = A.detIssues(W, p.key); } catch (e) { out(`- 「${p.title}」 검사 실패: ${e.message}`); continue; }
  is = is.filter(i => !/텍스트 검사/.test(i.conflict || ""));
  for (const i of is) { detN++; out(`- **「${p.title}」** ${i.severity === "high" ? "[다듬을 곳]" : "[참고]"} ${cell(i.claim).slice(0, 120)}\n  - ${cell(i.conflict).slice(0, 300)}`); }
}
if (!detN) out("(없음)");
out("");

/* ---------- 6. 남은 지적과 수정 요청 판정 ---------- */
out(`## 남은 지적의 근거 구절 (수정 요청 판정 재현)\n`);
out(`근거 구절이 그 근거 문서 본문에서 글자 그대로 찾아지는지 지금 코드로 다시 본다. 찾아지면 모델이 고칠 문서를 지목했을 때 수정 요청이 간다.\n`);
let shown = 0;
for (const { p, i } of issuesAll) {
  const m = /^근거: 「([^」]+)」/.exec(i.conflict || ""); if (!m) continue;
  const src = byTitle.get(m[1]); if (!src) continue;
  const ev = String(i.conflict).replace(/^근거: /, "").split(" · ")[0];
  const body = A.pageTexts(src).join("\n").replace(/\s+/g, " ");
  const found = A.evidenceQuotes(ev).map(q => A.findQuoteIn(body, q)).filter(Boolean)[0];
  out(`- 「${p.title}」 → 근거 「${src.title}」: ${found ? `찾음 (“${cell(found).slice(0, 50)}”)` : "못 찾음"}`); shown++;
}
if (!shown) out("(근거 문서를 밝힌 남은 지적 없음)");
out("");

/* ---------- 7. 진단 기록 ---------- */
const logged = pages.filter(p => p.checkLog?.length);
out(`## 진단 기록 (page.checkLog, v7.62부터)\n`);
if (!logged.length) out("(이 백업에는 진단 기록이 없습니다. v7.62 이후에 만든 문서부터 남습니다.)");
for (const p of logged) out(`- 「${p.title}」: ${p.checkLog.map(x => x.event ? `${T(x.at)} ${x.event}${x.cleared ? "(리뷰 결과 지워짐)" : ""}` : `${T(x.at)} ${x.auto ? "작성 직후" : "수동"} 리뷰 — 원문 ${x.sources ?? "?"}개/${x.batches ?? "?"}회, 지적 ${x.issues}(다듬을 곳 ${x.high}), 수정 요청 ${x.routed?.length ? x.routed.join("·") : 0}, 못 보냄 ${x.unrouted?.length ? x.unrouted.join("·") : 0}, 자동 수정 ${x.fixed}`).join(" / ")}`);

const report = lines.join("\n") + "\n";
if (outFile) { fs.writeFileSync(outFile, report); console.error(`보고서를 저장했습니다: ${outFile}`); }
else process.stdout.write(report);
