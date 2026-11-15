/* 실제 Worker/큐를 통해 기존 이미지 요청 가로채기를 연결한다. 외부 API 호출은 없다. */
exports.serverRelay = async (context, handler) => {
 const { default: worker } = await import('../../relay/worker.js');
 const { AiJobs } = await import('../../relay/jobs.js');
 const { JobStorage, fireAlarm } = await import('./jobs.mjs');
 const original = globalThis.fetch, entries = new Map();
 const stmt = { bind: () => stmt, first: async () => ({ uid: 'tester' }), all: async () => ({ results: [] }), run: async () => ({ success: true }) };
 const schedule = entry => {
  if (entry.running || entry.timer || !(entry.storage.data.get('jobs') || []).some(j => j.status === 'queued')) return;
  entry.timer = setTimeout(async () => { entry.timer = null; entry.running = true; try { await fireAlarm(entry.obj); } finally { entry.running = false; schedule(entry); } }, 1);
 };
 const env = { GEMINI_KEY: 'gemini-test', OPENAI_API_KEY: 'sk-test-openai', PASSWORDS: 'test-pass', ALLOWED_ORIGINS: '*', DB: { prepare: () => stmt, batch: async () => [] }, AI_JOBS: {
  idFromName: n => n, get: n => {
   if (!entries.has(n)) { const storage = new JobStorage(); entries.set(n, { storage, obj: new AiJobs({ storage }, env) }); }
   const entry = entries.get(n); return { fetch: async req => { const res = await entry.obj.fetch(req); schedule(entry); return res; } };
  }
 } };
 globalThis.fetch = async (url, options) => {
  const request = new Request(url, options), bytes = Buffer.from(await request.arrayBuffer());
  let response;
  await handler({ request: () => ({ url: () => String(url), postData: () => bytes.toString(), postDataBuffer: () => bytes, allHeaders: async () => Object.fromEntries(request.headers) }), fulfill: async ({ status = 200, json, body, contentType }) => {
   response = json === undefined ? new Response(body, { status, headers: { 'Content-Type': contentType || 'application/json' } }) : Response.json(json, { status });
  } });
  return response;
 };
 await context.route('**/api/**', async route => {
  const r = route.request(), req = new Request(r.url(), { method: r.method(), headers: await r.allHeaders(), ...(['GET','HEAD'].includes(r.method()) ? {} : { body: r.postData() }) });
  const res = await worker.fetch(req, { ...env, ALLOWED_ORIGINS: req.headers.get('Origin') || '' });
  await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
 });
 return () => { globalThis.fetch = original; for (const entry of entries.values()) { clearTimeout(entry.timer); entry.obj.active?.controller.abort(); } };
};
