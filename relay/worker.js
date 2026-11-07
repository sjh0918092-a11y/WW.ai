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
 */
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
      "Access-Control-Allow-Headers": "Content-Type, X-WW-Pass",
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
      return new Response(JSON.stringify({ ok: true, service: "WorldWiki relay", keyConfigured: !!env.GEMINI_KEY, passwordsConfigured: !!env.PASSWORDS, receivedAt: request.cf?.colo || null, runsIn: where }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (!originOk) return fail(403, "허용되지 않은 사이트입니다. ALLOWED_ORIGINS 설정을 확인하세요.");
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
