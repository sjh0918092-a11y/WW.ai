const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const source = fs.readFileSync(require("node:path").join(__dirname, "../js/consistency.js"), "utf8");
const saved = [];
const c = {
  S: { world: { id: "world" }, pages: { viewed: { check: { numV: "old" } }, related: {} } },
  Store: { savePage(wid, page) { saved.push(page); return Promise.resolve(); } },
  numStamp: () => "new", isHeld: () => false,
  refreshNumeric(w, k) { c.S.pages[k].check.numV = "new"; return ["related"]; },
};
vm.createContext(c);
vm.runInContext(source.slice(source.indexOf("function saveRouted("), source.indexOf("function parseIssues(")), c);
for (const state of [{ gen: { key: "viewed" } }, { gen: { key: "writing" } }, { checking: "viewed" }, { checking: "checking-other" }]) {
  Object.assign(c.S, { gen: null, checking: null }, state);
  c.refreshOnOpen("viewed");
  assert.equal(c.S.pages.viewed.check.numV, "old", "작업 중에는 열람 문서를 변경하지 않는다");
  assert.equal(saved.length, 0, "열람 문서와 관련 문서를 자동 저장하지 않는다");
}
Object.assign(c.S, { gen: null, checking: null });
c.refreshOnOpen("viewed");
assert.equal(c.S.pages.viewed.check.numV, "new");
assert.deepEqual(saved, [c.S.pages.viewed, c.S.pages.related], "작업 종료 후 다시 열면 미뤘던 갱신을 저장한다");
c.refreshOnOpen("viewed");
assert.equal(saved.length, 2, "이미 최신인 결과는 다시 저장하지 않는다");
console.log("통과: 작성·검사 중 열람 자동 저장 차단 및 종료 후 갱신");
