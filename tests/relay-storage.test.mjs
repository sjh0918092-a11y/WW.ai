/* 중계 서버의 계정·저장 API 테스트 (Node 22 내장 SQLite로 D1을 흉내 낸다)
 * 실행: node tests/relay-storage.test.mjs
 */
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import worker from "../relay/worker.js";

function fakeD1() {   // D1의 prepare/bind/first/all/run/batch만 흉내
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    _run() { if (/^\s*(select)/i.test(sql)) return db.prepare(sql).all(...args); return db.prepare(sql).run(...args); },
  });
  return { prepare: sql => stmt(sql), batch: async list => { db.exec("BEGIN"); try { const r = list.map(s => s._run()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const ORIGIN = "https://sjh0918092-a11y.github.io";
const env = { DB: fakeD1(), PASSWORDS: "초대암호,other", GEMINI_KEY: "x" };
const call = async (path, { method = "GET", body, token } = {}) => {
  const r = await worker.fetch(new Request("https://relay.test" + path, { method, headers: { Origin: ORIGIN, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: r.status, json: await r.json() };
};
let n = 0; const ok = m => console.log(`  ✓ ${++n}. ${m}`);

let r = await call("/api/signup", { method: "POST", body: { id: "철수", pw: "secret1", invite: "틀린코드" } });
assert.strictEqual(r.status, 403); ok("초대 코드가 틀리면 가입을 막는다");
r = await call("/api/signup", { method: "POST", body: { id: "a", pw: "secret1", invite: "초대암호" } });
assert.strictEqual(r.status, 400); ok("아이디 형식을 검사한다");
r = await call("/api/signup", { method: "POST", body: { id: "철수", pw: "secret1", invite: "초대암호" } });
assert.strictEqual(r.status, 200); const t1 = r.json.token; assert(t1);
r = await call("/api/signup", { method: "POST", body: { id: "철수", pw: "secret2", invite: "초대암호" } });
assert.strictEqual(r.status, 409); ok("가입하면 토큰을 주고, 같은 아이디는 다시 가입할 수 없다");
r = await call("/api/login", { method: "POST", body: { id: "철수", pw: "틀림" } }); assert.strictEqual(r.status, 401);
r = await call("/api/login", { method: "POST", body: { id: "철수", pw: "secret1" } }); assert.strictEqual(r.status, 200); const t2 = r.json.token;
ok("비밀번호가 맞을 때만 로그인된다");
const pw = await env.DB.prepare("SELECT hash FROM users WHERE id = ?").bind("철수").first();
assert(!pw.hash.includes("secret1") && pw.hash.length === 64); ok("비밀번호는 해시로만 저장한다");

r = await call("/api/sync"); assert.strictEqual(r.status, 401); ok("로그인하지 않으면 저장소에 접근할 수 없다");
r = await call("/api/sync", { method: "POST", token: t1, body: { worlds: [{ wid: "w1", data: '{"title":"A"}', updated: 100 }], pages: [{ wid: "w1", pkey: "p1", data: '{"t":1}', updated: 100 }, { wid: "w1", pkey: "p2", data: '{"t":2}', updated: 100 }] } });
assert.strictEqual(r.status, 200);
r = await call("/api/sync?since=0", { token: t2 });
assert.strictEqual(r.json.worlds.length, 1); assert.strictEqual(r.json.pages.length, 2); const s1 = r.json.next;
ok("한 기기에서 올린 세계관을 다른 기기(다른 토큰)에서 받는다");
await call("/api/sync", { method: "POST", token: t1, body: { pages: [{ wid: "w1", pkey: "p1", data: '{"t":"old"}', updated: 50 }] } });
r = await call("/api/sync?since=0", { token: t1 }); assert.strictEqual(r.json.pages.find(p => p.pkey === "p1").data, '{"t":1}');
await call("/api/sync", { method: "POST", token: t1, body: { pages: [{ wid: "w1", pkey: "p1", data: '{"t":"new"}', updated: 200 }] } });
r = await call("/api/sync?since=" + s1, { token: t1 }); assert.strictEqual(r.json.pages.length, 1); assert.strictEqual(r.json.pages[0].data, '{"t":"new"}');
ok("더 오래된 수정은 덮어쓰지 않고, since 뒤에 바뀐 것만 내려 준다");
await call("/api/signup", { method: "POST", body: { id: "영희", pw: "secret3", invite: "other" } });
const t3 = (await call("/api/login", { method: "POST", body: { id: "영희", pw: "secret3" } })).json.token;
r = await call("/api/sync?since=0", { token: t3 }); assert.strictEqual(r.json.worlds.length, 0); ok("다른 사람의 세계관은 보이지 않는다");
await call("/api/sync", { method: "POST", token: t1, body: { worlds: [{ wid: "w1", deleted: true, updated: 300 }] } });
r = await call("/api/sync?since=0", { token: t1 });
assert(r.json.worlds[0].deleted === 1 && r.json.pages.every(p => p.deleted === 1 && p.data === null)); ok("세계관을 지우면 그 문서들도 지운 것으로 표시하고 내용을 비운다");
const many = Array.from({ length: 1700 }, (_, i) => ({ wid: "w2", pkey: "k" + i, data: "{}", updated: 1 }));
await call("/api/sync", { method: "POST", token: t3, body: { worlds: [{ wid: "w2", data: "{}", updated: 1 }], pages: many } });
let since = 0, got = 0, more = true, rounds = 0;
while (more) { r = await call("/api/sync?since=" + since, { token: t3 }); got += r.json.pages.length; since = r.json.next; more = r.json.more; rounds++; }
assert.strictEqual(got, 1700); assert.strictEqual(rounds, 2); ok("문서가 많으면 나눠서 내려 주고 빠짐없이 받는다");
r = await call("/api/logout", { method: "POST", token: t2 }); r = await call("/api/sync", { token: t2 }); assert.strictEqual(r.status, 401); ok("로그아웃하면 그 토큰은 더 쓸 수 없다");
const bad = await worker.fetch(new Request("https://relay.test/api/sync", { headers: { Origin: "https://evil.example", Authorization: "Bearer " + t1 } }), env);
assert.strictEqual(bad.status, 403); ok("허용하지 않은 사이트에서 온 요청은 막는다");
console.log(`\n모두 통과 (${n}개)`);
