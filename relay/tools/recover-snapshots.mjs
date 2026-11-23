#!/usr/bin/env node
/* 사라진 대화 되살리기: 서버 데이터베이스(D1)를 지난 여러 시점으로 잠깐씩 돌려 스토리 세계관을 꺼낸 뒤, 끝나면 지금으로 되돌린다.
   시각을 몰라도 된다. 꺼낸 것들을 앱의 '되살린 기록 합치기'에 넣으면 대화를 차례마다 합친다(덮지 않음).
   GitHub에서: 저장소 Actions → '사라진 대화 되살리기' → Run workflow (비밀값 CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID 필요)
   컴퓨터에서: relay 폴더에서  node tools/recover-snapshots.mjs            (지난 8시간)
         node tools/recover-snapshots.mjs --hours 24               (지난 24시간)
   실행하는 동안에는 모든 기기에서 앱을 닫아 둔다. 끝나면 recovered-worlds.json 이 생긴다. */
import { writeFileSync } from "node:fs";

const DB = "worldwiki-db", DB_ID = "3ce1b198-c233-45c6-8b46-8c0aa8638327";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const HOURS = Number(arg("--hours", 8)) || 8, STEP = Number(arg("--step", 20)) || 20, ONLY = arg("--wid", "");
const select = `SELECT wid, updated, data FROM worlds WHERE deleted = 0 AND data LIKE '%"dialogues"%'${ONLY ? ` AND wid = '${ONLY.replace(/'/g, "")}'` : ""}`;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

/* 두 가지 방법: 토큰이 있으면 Cloudflare API(GitHub Actions에서), 없으면 이 컴퓨터의 wrangler 로그인 */
let D;
if (TOKEN && ACCOUNT) {
  const api = async (path, opt = {}) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}${path}`, { ...opt, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(JSON.stringify(j.errors || r.status));
    return j.result;
  };
  D = {
    bookmark: async () => (await api("/time_travel/bookmark")).bookmark,
    restoreAt: iso => api(`/time_travel/restore?timestamp=${encodeURIComponent(iso)}`, { method: "POST" }),
    restoreTo: b => api(`/time_travel/restore?bookmark=${encodeURIComponent(b)}`, { method: "POST" }),
    query: async sql => (await api("/query", { method: "POST", body: JSON.stringify({ sql }) })).flatMap(x => x.results || []),
  };
} else {
  const { execFileSync } = await import("node:child_process");
  const run = args => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", input: "y\n", env: { ...process.env, CI: "1" }, maxBuffer: 1 << 30 });
  const json = out => { const i = out.search(/[[{]/); return JSON.parse(out.slice(i)); };
  D = {
    bookmark: async () => (run(["d1", "time-travel", "info", DB]).match(/[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}/) || [])[0],
    restoreAt: async iso => run(["d1", "time-travel", "restore", DB, `--timestamp=${iso}`]),
    restoreTo: async b => run(["d1", "time-travel", "restore", DB, `--bookmark=${b}`]),
    query: async sql => json(run(["d1", "execute", DB, "--remote", "--json", "--command", sql])).flatMap(x => x.results || []),
  };
}

const now = await D.bookmark();
if (!now) { console.error("지금 시점 bookmark를 읽지 못했습니다. 로그인(또는 토큰)과 데이터베이스 이름을 확인해 주세요."); process.exit(1); }
console.log("지금 시점 bookmark:", now, "(문제가 생기면 이 값으로 되돌린다)");

// 시각 목록: 지난 HOURS시간을 STEP분 간격으로 + 지금 기록의 수정 시각 직전 30분은 2분 간격으로(덮어쓰기 직전을 촘촘히)
const current = await D.query(select.replace("wid, updated, data", "wid, updated"));
const times = new Set(), end = Date.now();
for (let t = end - HOURS * 3600e3; t < end; t += STEP * 60e3) times.add(Math.floor(t / 60e3) * 60e3);
for (const r of current) for (let t = r.updated - 30 * 60e3; t < r.updated; t += 2 * 60e3) times.add(Math.floor(t / 60e3) * 60e3);
const list = [...times].sort((a, b) => a - b);
console.log(`시점 ${list.length}개를 차례로 확인합니다.`);

const found = []; let restored = false;
try {
  for (const t of list) {
    const iso = new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
    try {
      await D.restoreAt(iso); restored = true;
      const got = await D.query(select);
      for (const r of got) { try { found.push(JSON.parse(r.data)); } catch {} }
      console.log(`  ${iso}: 세계관 ${got.length}개`);
    } catch (e) { console.log(`  ${iso}: 건너뜀 (${String(e.message || e).split("\n")[0].slice(0, 120)})`); }
  }
} finally {
  if (restored) { await D.restoreTo(now); console.log("데이터베이스를 지금 시점으로 되돌렸습니다."); }
}
writeFileSync("recovered-worlds.json", JSON.stringify(found));
console.log(`recovered-worlds.json 에 ${found.length}개를 담았습니다. 앱 설정의 '되살린 기록 합치기'로 이 파일을 고르세요.`);
