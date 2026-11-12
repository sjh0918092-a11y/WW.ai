/* 모든 테스트를 차례로 돌리고 결과를 요약한다. 실행: node tests/run-all.js [이름 일부...] */
const { spawnSync } = require("child_process"), fs = require("fs"), path = require("path");
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => /\.test\.m?js$/.test(f) && (!only.length || only.some(o => f.includes(o)))).sort();
const failed = [];
for (const f of files) {
  const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`${ok ? "통과" : "실패"}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  if (!ok) { failed.push(f); console.log((r.stdout + r.stderr).trim().split("\n").slice(-12).map(l => "    " + l).join("\n")); }
}
console.log(`\n${files.length - failed.length}/${files.length} 통과` + (failed.length ? ` · 실패: ${failed.join(", ")}` : ""));
process.exit(failed.length ? 1 : 0);
