const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function run() {
  const rows = ["first", "second", "third"].map((id, i) => ({
    id, owner: "owner", base: "relay", type: "document.pipeline", status: "failed",
    createdAt: 3 - i, meta: { title: id, kind: "page" },
    ...(id === "second" ? { error: { message: "검사 요청이 실패했습니다.", code: "rate_limited", httpStatus: 429 } } : {}),
  }));
  const pending = new Map(), revealed = [];
  const c = {
    S: { ready: true, view: { name: "jobs" } }, Sync: { acct: { id: "owner", token: "token" }, base: () => "relay" }, GS: {},
    AIJobs: { current: () => true, receipts: () => rows, save() {} }, KIND: { page: "문서 작성" },
    parseJsonLoose: JSON.parse, esc: v => String(v ?? ""),
    renderSide() {}, renderMain() {},
    document: { getElementById: id => ({ scrollIntoView: () => revealed.push(id) }) },
  };
  vm.createContext(c);
  const source = fs.readFileSync(path.join(__dirname, "../js/recovery.js"), "utf8");
  vm.runInContext(source + "\nObject.assign(globalThis, { AIRecovery, jobsHtml });", c);
  c.AIRecovery.result = r => new Promise(resolve => pending.set(r.id, resolve));
  const first = c.AIRecovery.preview("first", true);
  assert.match(c.jobsHtml(), /data-job-preview="first"[^>]*>결과 보기<\/button><\/article>\s*<div id="job-result-first"[^>]*><p[^>]*>결과를 불러오는 중…/);
  const second = c.AIRecovery.preview("second", true);
  assert.deepEqual(revealed, ["job-result-first", "job-result-second"]);
  pending.get("first")();
  await first;
  assert.match(c.jobsHtml(), /id="job-result-second"[^>]*><p[^>]*>결과를 불러오는 중…/);
  pending.get("second")({ pipeline: { saved: false, steps: [{ kind: "page", status: "done" }, { kind: "check", status: "failed" }] } });
  await second;
  const html = c.jobsHtml();
  assert(html.indexOf('data-job-preview="second"') < html.indexOf('id="job-result-second"'));
  assert(html.indexOf('id="job-result-second"') < html.indexOf('data-job-preview="third"'));
  assert.match(html, /rate_limited.*HTTP 429/);
  assert.match(html, /초안 생성 완료 · 설정 대조 실패/);
  assert.doesNotMatch(html, /id="job-result-first"/);
  console.log("선택 카드 아래 로딩과 오류를 표시하며, 늦게 도착한 이전 결과는 선택을 바꾸지 않는다");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
