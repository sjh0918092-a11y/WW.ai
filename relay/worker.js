/**
 * WorldWiki.ai Gemini 중계 서버 (Cloudflare Worker)
 *
 * 앱은 Google 대신 이 Worker로 요청하고, Worker가 저장된 API 키를 붙여 Gemini API로 넘긴다.
 * 친구에게는 키 대신 접속 암호만 알려 준다.
 *
 * Cloudflare 대시보드 → Worker → Settings → Variables and Secrets 에 넣을 값
 *   GEMINI_KEY       (Secret) Gemini API 키
 *   PASSWORDS        (Secret) 접속 암호. 여러 개면 쉼표로 구분 (예: 친구A암호,친구B암호)
 *   ALLOWED_ORIGINS  (Text, 선택) 요청을 허용할 사이트. 쉼표로 구분.
 *                    비워 두면 https://sjh0918092-a11y.github.io 만 허용
 *
 * 계정과 세계관 저장: wrangler.toml의 D1 바인딩(DB)을 쓴다. 테이블은 첫 요청 때 만든다.
 *   POST /api/signup {id, pw, invite}  가입. invite는 PASSWORDS 중 하나(초대 코드)
 *   POST /api/login  {id, pw}          로그인 → {token}
 *   POST /api/logout                   (Authorization: Bearer 토큰)
 *   GET  /api/sync?since=n             since 뒤에 바뀐 세계관과 문서
 *   POST /api/sync {worlds, pages}     올리기. 기기의 수정 시각(updated)이 더 최근인 것만 저장한다
 */
import { pipelineSchema } from "./pipeline-store.js";
import { jobsApi } from "./jobs.js";
export { AiJobs } from "./jobs.js";

const UPSTREAM = "https://generativelanguage.googleapis.com";
const DEFAULT_ORIGINS = "https://sjh0918092-a11y.github.io";
const MAX_BODY = 2 * 1024 * 1024;   // 요청 본문 상한 2MB
// 허용하는 경로: 모델 목록, 모델 하나 조회, 생성(스트리밍 포함), 토큰 세기
const ALLOWED = [
  { method: "GET", re: /^\/v1beta\/models$/ },
  { method: "GET", re: /^\/v1beta\/models\/[A-Za-z0-9._-]+$/ },
  { method: "POST", re: /^\/v1beta\/models\/[A-Za-z0-9._-]+:(streamGenerateContent|generateContent|countTokens)$/ },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const origins = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
    const originOk = origins.includes(origin);
    const cors = originOk ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-WW-Pass, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    } : { "Vary": "Origin" };
    const fail = (status, message) => new Response(JSON.stringify({ error: { code: status, message } }), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });

    if (request.method === "OPTIONS") return originOk ? new Response(null, { status: 204, headers: cors }) : fail(403, "허용되지 않은 사이트입니다.");
    // 배포 확인용: 주소를 브라우저로 열면 이 응답이 보인다.
    // runsIn은 이 Worker가 Google로 요청을 내보내는 Cloudflare 데이터센터(공항 코드)와 나라다. HKG(홍콩) 등이면 Gemini가 막는다.
    if (url.pathname === "/" && request.method === "GET") {
      const where = await egress();
      return new Response(JSON.stringify({ ok: true, service: "WorldWiki relay", keyConfigured: !!env.GEMINI_KEY, passwordsConfigured: !!env.PASSWORDS, storageConfigured: !!env.DB, jobsConfigured: !!env.AI_JOBS, jobsVersion: env.AI_JOBS ? 4 : 0, receivedAt: request.cf?.colo || null, runsIn: where }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (!originOk) return fail(403, "허용되지 않은 사이트입니다. ALLOWED_ORIGINS 설정을 확인하세요.");
    if (url.pathname.startsWith("/api/")) {   // 계정과 세계관 저장
      if (!env.DB) return fail(500, "중계 서버에 저장소(D1)가 연결되지 않았습니다.");
      try { return await api(request, env, url, cors, fail); }
      catch (e) { return fail(500, "저장소 오류: " + (e?.message || e)); }
    }
    if (!env.GEMINI_KEY || !env.PASSWORDS) return fail(500, "중계 서버에 GEMINI_KEY 또는 PASSWORDS가 설정되지 않았습니다.");
    const pass = request.headers.get("X-WW-Pass") || "";
    if (!(await passOk(pass, env.PASSWORDS))) return fail(401, "중계 서버 접속 암호가 틀렸습니다.");
    if (!ALLOWED.some(r => r.method === request.method && r.re.test(url.pathname))) return fail(404, "허용되지 않은 요청입니다.");

    let body;
    if (request.method === "POST") {
      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > MAX_BODY) return fail(413, "요청이 너무 큽니다.");
      body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY) return fail(413, "요청이 너무 큽니다.");
    }
    const target = new URL(UPSTREAM + url.pathname);
    for (const k of ["alt", "pageSize", "pageToken"]) if (url.searchParams.has(k)) target.searchParams.set(k, url.searchParams.get(k));

    let up;
    try {
      up = await fetch(target, {
        method: request.method,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
        body,
      });
    } catch (e) { return fail(502, "Gemini 서버에 연결하지 못했습니다: " + (e?.message || e)); }

    if (up.status === 400 || up.status === 403) {   // 지역 제한이면 어느 데이터센터에서 나갔는지 덧붙인다
      const t = await up.text();
      if (/location is not supported/i.test(t)) {
        const where = await egress();
        return fail(400, `User location is not supported (중계 서버가 ${where ? where.colo + "/" + where.loc : "알 수 없는 곳"}에서 실행됨)`);
      }
      return new Response(t, { status: up.status, headers: { ...cors, "Content-Type": up.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
    }
    const h = new Headers(cors);
    h.set("Content-Type", up.headers.get("Content-Type") || "application/json");
    h.set("Cache-Control", "no-store");
    return new Response(up.body, { status: up.status, headers: h });   // 스트리밍 응답을 그대로 흘려보낸다
  },
};

/* ---------- 계정과 세계관 저장 (D1) ---------- */
const ID_RE = /^[A-Za-z0-9가-힣_.-]{2,24}$/;
const PBKDF2_ITER = 20000;           // 무료 플랜의 CPU 시간 한도 안에서 도는 횟수
const MAX_SYNC = 20 * 1024 * 1024;   // 올리기 한 번의 본문 상한 20MB
const PAGE_LIMIT = 1500;             // 받아 오기 한 번에 내려 주는 문서 수
let schema = null;
function ensureSchema(db) {
  schema ||= db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS worlds (uid TEXT NOT NULL, wid TEXT NOT NULL, data TEXT, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, stamp INTEGER NOT NULL, PRIMARY KEY (uid, wid))"),
    db.prepare("CREATE TABLE IF NOT EXISTS pages (uid TEXT NOT NULL, wid TEXT NOT NULL, pkey TEXT NOT NULL, data TEXT, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, stamp INTEGER NOT NULL, PRIMARY KEY (uid, wid, pkey))"),
    db.prepare("CREATE INDEX IF NOT EXISTS worlds_stamp ON worlds (uid, stamp)"),
    db.prepare("CREATE INDEX IF NOT EXISTS pages_stamp ON pages (uid, stamp)"),
    ...pipelineSchema(db),
  ]).catch(e => { schema = null; throw e; });
  return schema;
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const unhex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function pwHash(pw, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ITER }, key, 256));
}
function sameHex(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
let lastStamp = 0;
const nextStamp = () => (lastStamp = Math.max(lastStamp + 1, Date.now() * 1000));   // 받아 오기 순서를 정하는 서버 순번(겹치지 않게)

async function api(request, env, url, cors, fail) {
  const db = env.DB; await ensureSchema(db);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const body = async () => {
    const len = Number(request.headers.get("Content-Length") || 0); if (len > MAX_SYNC) throw { status: 413 };
    const t = await request.text(); if (t.length > MAX_SYNC) throw { status: 413 };
    try { return JSON.parse(t || "{}"); } catch { return {}; }
  };
  const path = url.pathname, m = request.method;
  try {
    if (path === "/api/signup" && m === "POST") {
      const { id, pw, invite } = await body();
      if (!ID_RE.test(String(id || ""))) return fail(400, "아이디는 2~24자의 한글, 영문, 숫자, _ . - 만 쓸 수 있습니다.");
      if (String(pw || "").length < 6) return fail(400, "비밀번호는 6자 이상이어야 합니다.");
      if (!env.PASSWORDS || !(await passOk(String(invite || ""), env.PASSWORDS))) return fail(403, "초대 코드(접속 암호)가 올바르지 않습니다.");
      if (await db.prepare("SELECT 1 FROM users WHERE id = ?").bind(id).first()) return fail(409, "이미 있는 아이디입니다.");
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      await db.prepare("INSERT INTO users (id, salt, hash, created) VALUES (?, ?, ?, ?)").bind(id, salt, await pwHash(String(pw), salt), Date.now()).run();
      return json(await newSession(db, id));
    }
    if (path === "/api/login" && m === "POST") {
      const { id, pw } = await body();
      const u = ID_RE.test(String(id || "")) ? await db.prepare("SELECT salt, hash FROM users WHERE id = ?").bind(id).first() : null;
      if (!u || !sameHex(await pwHash(String(pw || ""), u.salt), u.hash)) return fail(401, "아이디나 비밀번호가 맞지 않습니다.");
      return json(await newSession(db, id));
    }
    const tok = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const ses = tok ? await db.prepare("SELECT uid FROM sessions WHERE token = ?").bind(tok).first() : null;
    if (!ses) return fail(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
    const uid = ses.uid;
    if (path === "/api/jobs" || path.startsWith("/api/jobs/")) return jobsApi(request, env, url, cors, fail, uid, passOk);
    if (path === "/api/logout" && m === "POST") { await db.prepare("DELETE FROM sessions WHERE token = ?").bind(tok).run(); return json({ ok: true }); }
    if (path === "/api/sync" && m === "GET") {
      const since = Number(url.searchParams.get("since") || 0) || 0;
      const worlds = (await db.prepare("SELECT wid, data, updated, deleted, stamp FROM worlds WHERE uid = ? AND stamp > ? ORDER BY stamp").bind(uid, since).all()).results || [];
      const pages = (await db.prepare("SELECT wid, pkey, data, updated, deleted, stamp FROM pages WHERE uid = ? AND stamp > ? ORDER BY stamp LIMIT ?").bind(uid, since, PAGE_LIMIT).all()).results || [];
      const more = pages.length >= PAGE_LIMIT;
      const top = more ? pages.at(-1).stamp : Math.max(since, ...worlds.map(x => x.stamp), ...pages.map(x => x.stamp));
      return json({ id: uid, worlds, pages, next: top, more });
    }
    if (path === "/api/sync" && m === "POST") {
      const { worlds = [], pages = [] } = await body();
      const st = [];
      for (const w of (Array.isArray(worlds) ? worlds : []).slice(0, 500)) {
        if (!w || typeof w.wid !== "string" || !w.wid) continue;
        const del = w.deleted ? 1 : 0, s = nextStamp();
        st.push(db.prepare("INSERT INTO worlds (uid, wid, data, updated, deleted, stamp) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (uid, wid) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = excluded.deleted, stamp = excluded.stamp WHERE excluded.updated >= worlds.updated")
          .bind(uid, w.wid, del ? null : String(w.data || ""), Number(w.updated) || 0, del, s));
        if (del) st.push(db.prepare("UPDATE pages SET data = NULL, deleted = 1, stamp = ? WHERE uid = ? AND wid = ? AND deleted = 0").bind(nextStamp(), uid, w.wid));
      }
      for (const p of (Array.isArray(pages) ? pages : []).slice(0, 5000)) {
        if (!p || typeof p.wid !== "string" || typeof p.pkey !== "string" || !p.wid || !p.pkey) continue;
        const del = p.deleted ? 1 : 0;
        st.push(db.prepare("INSERT INTO pages (uid, wid, pkey, data, updated, deleted, stamp) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (uid, wid, pkey) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = excluded.deleted, stamp = excluded.stamp WHERE excluded.updated >= pages.updated")
          .bind(uid, p.wid, p.pkey, del ? null : String(p.data || ""), Number(p.updated) || 0, del, nextStamp()));
      }
      for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
      return json({ ok: true, saved: st.length });
    }
    return fail(404, "허용되지 않은 요청입니다.");
  } catch (e) {
    if (e?.status === 413) return fail(413, "한 번에 올리기에는 너무 큽니다.");
    throw e;
  }
}
async function newSession(db, uid) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare("INSERT INTO sessions (token, uid, created) VALUES (?, ?, ?)").bind(token, uid, Date.now()).run();
  return { id: uid, token };
}

async function passOk(pass, list) {
  if (!pass) return false;
  const enc = new TextEncoder();
  const digest = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const a = await digest(pass);
  let ok = false;
  for (const p of String(list).split(/[,\n]/).map(s => s.trim()).filter(Boolean)) {
    const b = await digest(p);
    let same;
    if (crypto.subtle.timingSafeEqual) same = crypto.subtle.timingSafeEqual(a, b);
    else { let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; same = d === 0; }
    if (same) ok = true;
  }
  return ok;
}

// Worker가 바깥으로 요청을 내보내는 위치(데이터센터 코드와 나라)
async function egress() {
  try {
    const t = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
    const g = k => (t.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1] || "";
    return { colo: g("colo"), loc: g("loc") };
  } catch { return null; }
}
