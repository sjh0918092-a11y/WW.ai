/* 실제 SQLite/Worker와 클라이언트 저장 코드를 연결한다. 외부 서버·유료 AI 호출은 없다. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import worker from "../relay/worker.js";
import { D1 } from "./helpers/d1.mjs";

const db = new D1(), origin = "https://sjh0918092-a11y.github.io", env = { DB: db, PASSWORDS: "x", GEMINI_KEY: "x" };
const queries = [], prepare = db.prepare.bind(db);
db.prepare = sql => {
  const wrap = st => ({ ...st, bind: (...args) => wrap(st.bind(...args)), all: async () => { queries.push(sql); return st.all(); } });
  return wrap(prepare(sql));
};
// 기존 테이블만 있는 배포 상태를 재현한다. 본문 크기 색인은 최초 수신 때 한 번 채워야 한다.
db.sqlite.exec("CREATE TABLE worlds(uid TEXT,wid TEXT,data TEXT,updated INTEGER,deleted INTEGER,stamp INTEGER,PRIMARY KEY(uid,wid)); CREATE TABLE pages(uid TEXT,wid TEXT,pkey TEXT,data TEXT,updated INTEGER,deleted INTEGER,stamp INTEGER,PRIMARY KEY(uid,wid,pkey))");
const stamp = Date.now() * 1000, updated = Date.now() - 1000;
const world = { kind: "world", id: "w", title: "속도 검증", updatedAt: updated };
db.sqlite.prepare("INSERT INTO worlds VALUES('u','w',?,?,0,?)").run(JSON.stringify(world), updated, stamp - 1);
const insert = db.sqlite.prepare("INSERT INTO pages VALUES('u','w',?,?,?,0,?)");
for (let i = 0; i < 192; i++) insert.run("p" + i, JSON.stringify({ key: "p" + i, savedAt: updated, portrait: "x".repeat(256 * 1024) }), updated, stamp + i);
const request = (path, options = {}) => worker.fetch(new Request("https://relay.test/api" + path, { ...options, headers: { Origin: origin, Authorization: "Bearer tok", "Content-Type": "application/json", ...options.headers } }), env);
await request("/sync?meta=1"); // 스키마 준비. 아직 로그인 전이므로 계정 색인은 채우지 않는다.
db.sqlite.exec("INSERT INTO users VALUES('u','s','h',1); INSERT INTO sessions VALUES('tok','u',1); INSERT INTO users VALUES('other','s','h',1); INSERT INTO sessions VALUES('other-token','other',1)");

const source = fs.readFileSync("js/storage.js", "utf8"), storage = new Map();
function client(mem = { worlds: {}, pages: {} }) {
  const stats = { metadata: 0, bodies: 0, bytes: 0, keys: [] };
  const c = vm.createContext({ console, Date, AbortSignal, setTimeout, clearTimeout, GS: { relay: "https://relay.test" }, DEFAULT_RELAY: "https://relay.test", S: { view: { name: "home" } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    AISettingsSync: { load: async () => true },
    fetch: async (url, options) => {
      const path = String(url).replace("https://relay.test/api", "");
      if (path.includes("meta=1")) stats.metadata++;
      if (path === "/sync/read") { stats.bodies++; if (c.beforeRead) await c.beforeRead(stats.bodies); }
      if (c.beforeRequest) await c.beforeRequest(path);
      const response = await request(path, options), json = await response.json();
      for (const r of [...json.worlds || [], ...json.pages || []]) { stats.bytes += Buffer.byteLength(r.data || ""); stats.keys.push(r.pkey || "world"); }
      return Response.json(json, { status: response.status });
    },
  });
  vm.runInContext(source + "\nglobalThis.sync = Sync; globalThis.store = Store;", c);
  c.sync.acct = { id: "u", token: "tok", since: 0 }; c.store.mem = mem;
  c.sync.refresh = async () => {}; c.sync.render = () => {};
  c.stats = stats; c.reset = () => { stats.metadata = 0; stats.bodies = 0; stats.bytes = 0; stats.keys = []; queries.length = 0; };
  return c;
}
let n = 0; const pass = msg => console.log(`  ✓ ${++n}. ${msg}`);
const a = client(); assert.equal(await a.sync.pull(), 193); assert.equal(a.sync.err, "");
const firstBytes = a.stats.bytes;
assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM sync_index WHERE uid='u'").get().n, 193);
pass("기존 자료의 크기 색인을 만들고 48MB의 세계관·문서를 빠짐없이 받는다");
a.reset(); assert.equal(await a.sync.pull(), 0); assert.equal(a.stats.bytes, 0); assert.equal(a.stats.bodies, 0); assert.equal(a.stats.metadata, 1);
assert(queries.every(sql => !sql.includes("length(CAST") && !/JOIN (worlds|pages) /.test(sql)), "변경이 없으면 본문 조회와 본문 크기 계산을 하지 않아야 한다");
pass(`변경 없는 재동기화: ${(firstBytes / 1048576).toFixed(1)}MB → 본문 0바이트, 목록 요청 1회`);
const reloaded = client(a.store.mem); assert.equal(await reloaded.sync.pull(), 0); assert.equal(reloaded.stats.bytes, 0);
pass("앱을 다시 열어도 저장한 수신 순번으로 같은 본문을 다시 받지 않는다");

db.sqlite.prepare("UPDATE pages SET data=?,updated=?,stamp=? WHERE uid='u' AND pkey='p0'").run(JSON.stringify({ key: "p0", savedAt: updated + 1, summary: "다른 기기 수정" }), updated + 1, stamp + 1000);
a.reset(); assert.equal(await a.sync.pull(), 1); assert.deepEqual(a.stats.keys, ["p0"]); assert.equal(a.store.mem.pages.w.p0.summary, "다른 기기 수정");
const bytes = db.sqlite.prepare("SELECT bytes FROM sync_index WHERE uid='u' AND pkey='p0'").get().bytes;
assert.equal(bytes, Buffer.byteLength(JSON.stringify(a.store.mem.pages.w.p0)));
pass("변경된 문서 하나만 받으며 서버 저장 경로의 크기 정보도 갱신된다");
db.sqlite.prepare("UPDATE pages SET data=?,stamp=? WHERE uid='u' AND pkey='p0'").run(JSON.stringify({ key: "p0", savedAt: updated + 1, summary: "같은 시각, 새 순번" }), stamp + 1100);
a.reset(); assert.equal(await a.sync.pull(), 1); assert.equal(a.store.mem.pages.w.p0.summary, "같은 시각, 새 순번");
pass("수정 시각이 같아도 서버 순번이 달라진 본문을 구별한다");
insert.run("late", JSON.stringify({ key: "late", savedAt: updated }), updated, stamp + 10);
a.reset(); assert.equal(await a.sync.pull(), 1); assert(a.store.mem.pages.w.late);
pass("이미 지난 순번에 늦게 저장된 문서도 5초 겹침 구간에서 받는다");
db.sqlite.prepare("UPDATE pages SET data=NULL,deleted=1,updated=?,stamp=? WHERE uid='u' AND pkey='late'").run(updated + 2, stamp + 1200);
a.reset(); assert.equal(await a.sync.pull(), 1); assert.equal(a.stats.bodies, 0); assert.equal(a.store.mem.pages.w.late, undefined);
pass("문서 삭제도 본문 전송 없이 반영한다");

const interrupted = client(); interrupted.beforeRead = count => { if (count === 3) throw new Error("연결 끊김"); };
await interrupted.sync.pull(); assert(interrupted.sync.err); const savedKeys = new Set(interrupted.stats.keys);
assert(savedKeys.size > 0); interrupted.beforeRead = null; interrupted.reset(); await interrupted.sync.pull(); assert.equal(interrupted.sync.err, "");
assert(interrupted.stats.keys.every(k => !savedKeys.has(k)), "이미 저장한 묶음의 본문을 다시 받아서는 안 된다");
pass("전송 중단 후 다시 동기화해도 저장을 마친 묶음의 본문은 재전송하지 않는다");

db.sqlite.prepare("UPDATE pages SET data=?,updated=?,stamp=? WHERE uid='u' AND pkey='p0'").run(JSON.stringify({ key: "p0", savedAt: updated + 3, summary: "조회 사이 수정 전" }), updated + 3, stamp + 1300);
a.reset(); let raced = false;
a.beforeRead = () => { if (!raced) { raced = true; db.sqlite.prepare("UPDATE pages SET data=?,updated=?,stamp=? WHERE uid='u' AND pkey='p0'").run(JSON.stringify({ key: "p0", savedAt: updated + 4, summary: "조회 사이 수정 후" }), updated + 4, stamp + 1400); } };
assert.equal(await a.sync.pull(), 1); assert.equal(a.sync.err, ""); assert.equal(a.store.mem.pages.w.p0.summary, "조회 사이 수정 후"); a.beforeRead = null;
pass("변경 목록과 본문 조회 사이에 다른 기기가 수정하면 최신 목록으로 다시 확인한다");

const unauthorized = await request("/sync/read", { method: "POST", headers: { Authorization: "Bearer other-token" }, body: JSON.stringify({ records: [{ kind: "p", wid: "w", pkey: "p0", stamp: stamp + 1400 }] }) });
assert.equal(unauthorized.status, 409); assert(!(await unauthorized.text()).includes("조회 사이 수정 후"));
pass("본문 선택 API도 로그인한 계정의 자료만 읽는다");

const tiedStamp = stamp + 10e6;
for (let i = 0; i < 1705; i++) db.sqlite.prepare("INSERT INTO pages VALUES('u','w',?,NULL,?,1,?)").run("deleted-" + i, updated, tiedStamp);
let after = null, more = true; const tied = new Set();
while (more) {
  const response = await request("/sync?meta=1&since=" + (tiedStamp - 1) + (after ? "&after=" + encodeURIComponent(JSON.stringify(after)) : ""));
  const j = await response.json(); assert.equal(response.status, 200);
  j.records.forEach(r => tied.add(r.pkey)); more = j.more; after = j.after;
}
assert.equal(tied.size, 1705);
pass("같은 서버 순번으로 대량 삭제된 문서도 목록을 나눠 받을 때 누락되지 않는다");

a.reset(); let manifestCalls = 0;
a.beforeRequest = path => { if (path.includes("meta=1") && ++manifestCalls === 2) throw new Error("목록 수신 중단"); };
await a.sync.pull(); assert(a.sync.err);
assert((await a.store.getSyncState("https://relay.test/api", "u")).after, "저장한 목록 쪽의 위치도 남아야 한다");
const resumed = client(a.store.mem); let resumedPath;
resumed.beforeRequest = path => { resumedPath ||= path; };
await resumed.sync.pull(); assert.equal(resumed.sync.err, ""); assert(resumedPath.includes("&after=")); assert.equal(resumed.stats.bytes, 0);
pass("앱을 닫았다 다시 열어도 완료한 변경 목록 다음 쪽부터 이어 받는다");

let release, entered, held = false;
const waiting = new Promise(resolve => { entered = resolve; });
resumed.beforeRequest = async () => { if (held) return; held = true; entered(); await new Promise(resolve => { release = resolve; }); };
const pending = resumed.sync.pull(); await waiting;
assert.equal(resumed.sync.pull(), pending); assert.equal(resumed.sync.pulling, true);
release(); await pending; assert.equal(resumed.sync.pulling, false); assert.equal(resumed.sync.pullP, null);
pass("진행 중인 동기화를 다시 눌러도 같은 완료를 기다리고 진행 표시를 해제한다");

const switched = client(); switched.beforeRequest = path => { if (path.includes("meta=1")) switched.sync.acct = { id: "other", token: "other-token", since: 0 }; };
await switched.sync.pull(); assert.equal(Object.keys(switched.store.mem.pages).length, 0); assert.equal(switched.sync.acct.since, 0);
pass("계정이 바뀐 뒤 도착한 이전 계정의 응답과 수신 위치를 적용하지 않는다");
