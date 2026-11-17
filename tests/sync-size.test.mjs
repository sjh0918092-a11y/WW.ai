/* 받아 오기 응답 크기 테스트: 초상화처럼 큰 문서가 많아도 한 번의 조회가 D1 응답 한도(50MB)를 넘지 않게 나눠 내려 주는지 확인한다
 * 실행: node tests/sync-size.test.mjs   (Node 22 이상)
 */
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import worker from "../relay/worker.js";

const db = new DatabaseSync(":memory:");
let biggest = 0;
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => { const results = db.prepare(sql).all(...args); biggest = Math.max(biggest, Buffer.byteLength(JSON.stringify(results))); return { results }; },
  run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  _run() { return /^\s*select/i.test(sql) ? db.prepare(sql).all(...args) : db.prepare(sql).run(...args); },
});
const env = { DB: { prepare: sql => stmt(sql), batch: async list => list.map(s => s._run()) }, PASSWORDS: "x", GEMINI_KEY: "x" };
const call = async p => { const r = await worker.fetch(new Request("https://relay.test/api" + p, { headers: { Authorization: "Bearer tok", Origin: "https://sjh0918092-a11y.github.io" } }), env); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };

await call("/sync?since=0").catch(() => {});   // 표를 만든다(로그인 전이라 실패해도 된다)
db.exec("INSERT INTO users VALUES ('u', 's', 'h', 1); INSERT INTO sessions VALUES ('tok', 'u', 1)");
const big = "가".repeat(700 * 1024);   // 약 2MB(UTF-8 3바이트)
const ins = db.prepare("INSERT INTO pages (uid, wid, pkey, data, updated, deleted, stamp) VALUES ('u', 'w', ?, ?, 1, 0, ?)");
for (let i = 0; i < 30; i++) ins.run("p" + i, JSON.stringify({ key: "p" + i, portrait: big }), 100 + i * 2);
for (let i = 0; i < 20; i++) ins.run("s" + i, JSON.stringify({ key: "s" + i }), 101 + i * 2);
db.prepare("INSERT INTO worlds VALUES ('u', 'w', ?, 1, 0, 150)").run(JSON.stringify({ kind: "world", id: "w" }));

const got = new Set(); let worlds = 0, since = 0, rounds = 0, more = true;
while (more) {
  const j = await call("/sync?since=" + since);
  assert(j.next > since || !j.more, "다음 순번이 앞으로 나아가야 한다");
  for (const p of j.pages) got.add(p.pkey);
  worlds += j.worlds.length; more = j.more; since = j.next;
  assert(++rounds < 50, "끝나지 않는다");
}
assert.equal(got.size, 50, "모든 문서를 받아야 한다");
assert(worlds >= 1, "세계관도 받아야 한다");
assert(rounds > 1, "큰 문서는 여러 번에 나눠 받아야 한다");
assert(biggest < 12 * 1024 * 1024 * 1.1, "한 번의 조회 결과가 크기 목표를 크게 넘지 않아야 한다: " + biggest);
console.log(`  ✓ 큰 문서 50개를 ${rounds}번에 나눠 받았고, 한 번의 조회 결과는 최대 ${(biggest / 1048576).toFixed(1)}MB였다`);
