import assert from "node:assert/strict";
import { AiJobs } from "../relay/jobs.js";
import { mergeGeminiStream, mergeClaudeStream, mergeOpenAIStream, runProvider } from "../relay/providers.js";
import worker from "../relay/worker.js";
import { JobStorage, jobRequest as request, fireAlarm } from "./helpers/jobs.mjs";
const original = globalThis.fetch;
let n = 0, calls = [];
const ok = message => console.log(`  ✓ ${++n}. ${message}`);
const env = { GEMINI_KEY: "shared-gemini-key" }, storage = new JobStorage(), obj = new AiJobs({ storage }, env);
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const textBody = (id, personal = true) => ({ id, type: "gemini.generate", model: "custom-check", input: { contents: [{ role: "user", parts: [{ text: "원래 검사 입력" }] }], generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "high" } } }, ...(personal ? { credential: { type: "personal", key: "private-gemini-key" } } : {}) });
const openai = (id, ref = false) => ({ id, type: "openai.image", model: "gpt-image-2.5-sunburst", credential: { type: "personal", key: "sk-private-openai" }, input: { prompt: "원래 지침과 문서", size: "1536x864", quality: "medium", ...(ref ? { reference: { mimeType: "image/png", data: png } } : {}) } });
const image = id => ({ id, type: "gemini.image", model: "gemini-nano-banana-2.1", input: { contents: [{ role: "user", parts: [{ text: "원래 이미지 지침" }, { inlineData: { mimeType: "image/png", data: png } }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "1K" } } } });
const success = () => Response.json({ candidates: [{ content: { parts: [{ text: '{"issues":[]}' }] }, finishReason: "STOP" }] });
const submitRun = async b => { const r = await request(obj, "", b); assert.equal(r.status, 202, JSON.stringify(r.json)); await fireAlarm(obj); return request(obj, b.id); };

try {
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return success(); };
  const b = textBody("personal-gemini-01"); await request(obj, "", b);
  assert.equal(storage.data.get("key:" + b.id), "private-gemini-key");
  assert(!(await request(obj, b.id)).json.job.credential);
  assert.equal((await request(obj, "", { ...b, credential: { type: "personal", key: "different-key" } })).status, 409);
  await fireAlarm(obj);
  let r = await request(obj, b.id); assert.equal(r.json.job.status, "succeeded");
  assert.equal(calls[0].options.headers["x-goog-api-key"], b.credential.key);
  assert.deepEqual(JSON.parse(calls[0].options.body), b.input); assert(calls[0].url.endsWith("/custom-check:streamGenerateContent?alt=sse"));
  assert(!storage.data.has("key:" + b.id)); assert(!JSON.stringify(r.json).includes(b.credential.key));
  ok("개인 Gemini 키·모델·생각 깊이를 유지하고 종료 뒤 키를 지운다");

  await submitRun(textBody("shared-gemini-001", false)); assert.equal(calls.at(-1).options.headers["x-goog-api-key"], env.GEMINI_KEY);
  ok("중계 키 요청은 서버 Gemini 키를 사용하며 개인 키와 섞이지 않는다");

  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ data: [{ b64_json: png }] }); };
  r = await submitRun(openai("openai-generate-01")); assert.equal(r.json.job.status, "succeeded");
  let call = calls.at(-1), payload = JSON.parse(call.options.body);
  assert.equal(call.url, "https://api.openai.com/v1/images/generations"); assert.equal(call.options.headers.Authorization, "Bearer sk-private-openai");
  assert.deepEqual(payload, { prompt: "원래 지침과 문서", size: "1536x864", quality: "medium", model: "gpt-image-2.5-sunburst", n: 1, output_format: "png" });
  assert(!call.options.headers["x-goog-api-key"] && !call.options.headers["X-WW-Pass"]);
  assert(!storage.data.has("key:openai-generate-01"));
  ok("OpenAI 생성은 선택한 모델·품질·비율로 한 장만 요청하고 Gemini 인증을 보내지 않는다");

  await submitRun(openai("openai-reference01", true)); call = calls.at(-1);
  assert.equal(call.url, "https://api.openai.com/v1/images/edits");
  assert(call.options.body instanceof FormData); assert.equal(call.options.body.get("n"), "1");
  assert.equal(call.options.body.get("quality"), "medium");
  assert.equal(Buffer.from(await call.options.body.get("image[]").arrayBuffer()).toString("base64"), png);
  assert(!call.options.headers["Content-Type"]);
  ok("참고 이미지는 원본 바이트를 multipart edits로 보내고 경계를 직접 지정하지 않는다");

  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] }, finishReason: "STOP" }] }); };
  const gi = image("gemini-reference01"); r = await submitRun(gi);
  assert.equal(r.json.job.status, "succeeded"); assert.deepEqual(JSON.parse(calls.at(-1).options.body), gi.input);
  ok("Gemini 이미지의 모달리티·해상도·참고 이미지·비율을 유지한다");

  for (const invalid of [
    { ...openai("bad-key-shape-001"), credential: { type: "personal", key: "x\nsecret" } },
    { ...openai("bad-provider-001"), model: "gemini-main" },
    { ...openai("bad-image-size01"), input: { ...openai("x").input, size: "99999x99999" } },
    { ...image("bad-inline-file01"), input: { contents: [{ parts: [{ fileData: { fileUri: "https://evil.test" } }] }], generationConfig: { responseModalities: ["IMAGE"] } } },
    { ...image("bad-mime-type001"), input: { ...gi.input, contents: [{ parts: [{ inlineData: { mimeType: "text/html", data: png } }] }] } },
  ]) assert.equal((await request(obj, "", invalid)).status, 400);
  ok("잘못된 키·공급자·출력 크기·외부 파일·참고 이미지 형식을 차단한다");

  for (const mode of ["cancel", "network", "http", "restart", "missing-key"]) {
    const id = "wipe-private-" + mode.padEnd(12, "0"), s = new JobStorage(), j = new AiJobs({ storage: s }, env);
    await request(j, "", textBody(id));
    if (mode === "cancel") await request(j, id + "/cancel", {});
    else if (mode === "restart") { s.data.get("jobs")[0].status = "running"; await fireAlarm(j); }
    else {
      if (mode === "missing-key") s.data.delete("key:" + id);
      let count = 0;
      globalThis.fetch = async () => { count++; if (mode === "network") throw new Error("lost"); return Response.json({ error: { message: "secret private-gemini-key" } }, { status: 403 }); };
      await fireAlarm(j); await fireAlarm(j);
      assert.equal(count, mode === "missing-key" ? 0 : 1);
    }
    assert(!s.data.has("key:" + id));
    assert(!JSON.stringify((await request(j, id)).json).includes("private-gemini-key"));
  }
  ok("취소·통신 오류·제공자 오류·재기동·키 유실 때 개인 키를 지우고 공유 키로 재실행하지 않는다");

  globalThis.fetch = async () => Response.json({ data: [{ b64_json: "A".repeat(5 * 1024 * 1024) }] });
  r = await submitRun(openai("large-image-result01")); assert.equal(r.json.result.data[0].b64_json.length, 5 * 1024 * 1024);
  ok("기존 텍스트 응답 상한보다 큰 이미지 결과도 KV 조각으로 보관·복구한다");

  const historyStore = new JobStorage(), history = new AiJobs({ storage: historyStore }, env);
  globalThis.fetch = async () => success();
  const held = textBody("unreceived-held01"); await request(history, "", held); await fireAlarm(history);
  for (let i = 0; i < 26; i++) {
    const body = textBody("received-job-" + String(i).padStart(5, "0"));
    assert.equal((await request(history, "", body)).status, 202); await fireAlarm(history);
    assert.equal((await request(history, body.id + "/ack", {})).status, 200);
  }
  assert((await request(history, held.id)).json.result);
  const first = textBody("received-job-00000");
  r = await request(history, first.id); assert.equal(r.json.job.resultCollected, true); assert.equal(r.json.result, undefined);
  assert.equal((await request(history, "", first)).status, 200);
  ok("20회 넘게 받아도 계속 접수하고, 못 받은 결과와 이전 번호의 중복 방지 기록을 보존한다");

  const largeIndexStore = new JobStorage(), largeIndex = new AiJobs({ storage: largeIndexStore }, env);
  largeIndexStore.data.set("jobs", Array.from({ length: 400 }, (_, i) => ({ id: "index-job-" + String(i).padStart(8, "0"), type: "gemini.generate", model: "m".repeat(100), fingerprint: "f".repeat(64), runId: "r".repeat(36), status: "failed", receivedAt: Date.now(), expiresAt: Date.now() + 100000, error: { code: "bad_key", message: "오류".repeat(60) } })));
  r = await request(largeIndex); assert.equal(r.json.jobs.length, 400); assert(Array.isArray(largeIndexStore.data.get("jobs")), "조회는 저장소에 쓰지 않는다");
  globalThis.fetch = async () => success(); await request(largeIndex, "", textBody("index-migrate-0001")); assert(largeIndexStore.data.get("jobs").chunks > 1);
  assert.equal((await request(new AiJobs({ storage: largeIndexStore }, env))).json.jobs.length, 401);
  ok("많은 완료 기록도 KV 값 크기를 넘지 않고 재기동 뒤 목록을 읽을 수 있다");

  const db = { prepare: () => ({ bind: token => ({ first: async () => token === "valid" ? { uid: "personal" } : null }) }), batch: async () => [] };
  const apiEnv = { DB: db, AI_JOBS: { idFromName: n => n, get: () => new AiJobs({ storage: new JobStorage() }, {}) } };
  const response = await worker.fetch(new Request("https://relay.test/api/jobs", { method: "POST", headers: { Origin: "https://sjh0918092-a11y.github.io", Authorization: "Bearer valid", "Content-Type": "application/json" }, body: JSON.stringify(openai("personal-auth-001")) }), apiEnv);
  assert.equal(response.status, 202);
  ok("로그인한 개인 키 요청은 서버 공유 키·중계 암호를 요구하지 않는다");

  const legacyStorage = new JobStorage(), legacyObj = new AiJobs({ storage: legacyStorage }, env), legacyBody = textBody("legacy-v688-job01", false);
  await request(legacyObj, "", legacyBody);
  const legacyInput = JSON.stringify({ model: legacyBody.model, input: legacyBody.input });
  const legacyJob = legacyStorage.data.get("jobs")[0]; delete legacyJob.keyMode;
  legacyJob.fingerprint = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(legacyInput))).toString("hex");
  legacyStorage.data.set("in:" + legacyBody.id + ":0", legacyInput);
  assert.equal((await request(legacyObj, "", legacyBody)).status, 200);
  let legacyCalls = 0; globalThis.fetch = async () => { legacyCalls++; return success(); };
  await fireAlarm(legacyObj); assert.equal(legacyCalls, 1); assert.equal((await request(legacyObj, legacyBody.id)).json.job.status, "succeeded");
  ok("v6.88에서 접수한 번호·입력도 업그레이드 뒤 중복 접수 없이 그대로 실행한다");

  const metadataStorage = new JobStorage(), metadataObj = new AiJobs({ storage: metadataStorage }, env);
  const metadataBody = { ...textBody("recovery-meta-001", false), meta: { kind: "page", title: "복구 문서", wid: "world", key: "page", group: "group", recoveryV: 1, worldStamp: "a".repeat(64), pageStamp: "b".repeat(64), hadPage: false, entity: { title: "복구 문서", type: "인물", summary: "정의" } } };
  assert.equal((await request(metadataObj, "", { ...metadataBody, meta: { ...metadataBody.meta, credential: "secret" } })).status, 400);
  assert.equal((await request(metadataObj, "", { ...metadataBody, meta: { kind: "page", title: "x".repeat(4000) } })).status, 400);
  assert.equal((await request(metadataObj, "", metadataBody)).status, 202);
  assert.deepEqual((await request(metadataObj)).json.jobs[0].meta, metadataBody.meta);
  assert.equal((await request(metadataObj, metadataBody.id + "/resolve", {})).status, 409);
  globalThis.fetch = async () => success(); await fireAlarm(metadataObj);
  r = await request(metadataObj, metadataBody.id + "/resolve", {}); assert.equal(r.status, 200); assert(r.json.job.resolvedAt && r.json.job.receivedAt);
  assert((await request(metadataObj, metadataBody.id)).json.result);
  assert.equal((await request(metadataObj, "", metadataBody)).status, 200);
  ok("제한된 복구 대상 정보를 보관하고 완료 확인 뒤에도 번호와 원본 결과를 유지한다");
  console.log(`\n모두 통과 (${n}개). 유료 API 호출 0회.`);
  {
    const sse = c => "data: " + JSON.stringify(c) + "\r\n\r\n";
    const merged = mergeGeminiStream(sse({ candidates: [{ content: { role: "model", parts: [{ text: "생각 요약", thought: true }] } }] }) + sse({ candidates: [{ content: { parts: [{ text: '{"a":' }] } }] }) +
      sse({ candidates: [{ content: { parts: [{ text: "1}" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, thoughtsTokenCount: 9 } }));
    assert.equal(merged.candidates[0].content.parts[0].text, '{"a":1}'); assert.equal(merged.candidates[0].finishReason, "STOP"); assert.equal(merged.usageMetadata.thoughtsTokenCount, 9);
    assert.throws(() => mergeGeminiStream(sse({ candidates: [{ content: { parts: [{ text: '{"a":' }] } }] })), e => e.code === "incomplete_response" && !e.definite);
    assert.throws(() => mergeGeminiStream(sse({ error: { code: 500, message: "boom" } })), e => e.code === "upstream_error" && e.definite);
    assert.throws(() => mergeGeminiStream(sse({ error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded. key AIzaSyA1234567890abcdefghijkl" } })),
      e => e.status === 503 && e.detail.startsWith("503 UNAVAILABLE The model is overloaded") && !e.detail.includes("AIza") && e.safeMessage.includes("(공급자 응답: 503 UNAVAILABLE"));
    assert.throws(() => mergeClaudeStream(sse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })), e => e.detail === "overloaded_error Overloaded");
    ok("Gemini 스트림 조각을 사고 요약 없이 합치고, 완료 신호 없는 응답은 성공으로 저장하지 않는다");
    const claude = mergeClaudeStream([
      { type: "message_start", message: { id: "m", role: "assistant", model: "claude-x", usage: { input_tokens: 10, cache_read_input_tokens: 4, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "생각" } },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"b":' } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "2}" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 42 } },
      { type: "message_stop" }].map(sse).join(""));
    assert.deepEqual(claude.content, [{ type: "text", text: '{"b":2}' }]); assert.equal(claude.stop_reason, "end_turn");
    assert.equal(claude.usage.output_tokens, 42); assert.equal(claude.usage.cache_read_input_tokens, 4);
    assert.throws(() => mergeClaudeStream(sse({ type: "message_start", message: { usage: {} } })), e => e.code === "incomplete_response");
    const response = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }], usage: { input_tokens: 3, output_tokens: 2 } };
    assert.deepEqual(mergeOpenAIStream(sse({ type: "response.created", response: { status: "in_progress" } }) + sse({ type: "response.output_text.delta", delta: "{}" }) + sse({ type: "response.completed", response })), response);
    assert.throws(() => mergeOpenAIStream(sse({ type: "response.output_text.delta", delta: "{" })), e => e.code === "incomplete_response");
    assert.throws(() => mergeOpenAIStream(sse({ type: "response.failed", response: { status: "failed" } })), e => e.code === "upstream_error" && e.definite);
    ok("Claude·OpenAI 스트림을 일괄 응답 형태로 되살리고, 끊긴 스트림은 성공으로 저장하지 않는다");
  }
  {
    // 서버 무응답 감시: 첫 응답 없음·도중 멈춤·10분 제한을 구분하고 시간 기록을 남긴다.
    const job = { keyMode: "server", input: { type: "gemini.generate", model: "custom-check", input: textBody("x").input } };
    const fast = { GEMINI_KEY: "k", AI_FIRST_BYTE_MS: 60, AI_STREAM_IDLE_MS: 60 };
    const enc = new TextEncoder();
    const hang = (first) => async (url, options) => new Response(new ReadableStream({ start(c) {
      if (first) c.enqueue(enc.encode(first));
      options.signal.addEventListener("abort", () => c.error(new DOMException("abort", "AbortError")), { once: true });
    } }), { headers: { "Content-Type": "text/event-stream" } });
    globalThis.fetch = hang("");
    let t = {}; await assert.rejects(runProvider(job, fast, null, undefined, t), e => e.code === "no_first_response" && e.definite);
    assert.equal(t.first, null); assert.equal(t.code, "no_first_response"); assert(t.end >= 50 && t.headers !== null);
    globalThis.fetch = hang('data: {"candidates":[{"content":{"parts":[{"text":"{"}]}}]}\n\n');
    t = {}; await assert.rejects(runProvider(job, fast, null, undefined, t), e => e.code === "stream_stalled" && e.definite);
    assert(t.first !== null && t.bytes > 0 && t.end - t.last >= 50);
    globalThis.fetch = (url, options) => new Promise((_, rej) => options.signal.addEventListener("abort", () => rej(new DOMException("abort", "AbortError"))));
    const ctl = new AbortController(); setTimeout(() => ctl.abort("deadline"), 20);
    t = {}; await assert.rejects(runProvider(job, { GEMINI_KEY: "k" }, null, ctl.signal, t), e => e.code === "deadline_exceeded" && !e.definite);
    const user = new AbortController(); setTimeout(() => user.abort(), 20);
    await assert.rejects(runProvider(job, { GEMINI_KEY: "k" }, null, user.signal, {}), e => e?.name === "AbortError");
    globalThis.fetch = async () => success(); t = {};
    await runProvider(job, fast, null, undefined, t); assert(t.first !== null && t.end !== null && !t.code);
    // 상태 조회는 쓰기 0회, 바뀐 것 없는 갱신은 큰 목록 조각을 다시 쓰지 않는다.
    const wStore = new JobStorage(), wObj = new AiJobs({ storage: wStore }, env); let puts = 0;
    wStore.data.set("jobs", Array.from({ length: 400 }, (_, i) => ({ id: "write-job-" + String(i).padStart(8, "0"), type: "gemini.generate", model: "m".repeat(100), status: "failed", receivedAt: Date.now(), expiresAt: Date.now() + 100000, error: { code: "bad_key", message: "오류".repeat(60) } })));
    await request(wObj, "", textBody("write-count-00001")); const chunks = wStore.data.get("jobs").chunks; assert(chunks > 2);
    const tx0 = wStore.transaction.bind(wStore);
    wStore.transaction = fn => tx0(tx => fn({ ...tx, put: async (k, v) => { puts++; return tx.put(k, v); }, delete: async k => { puts++; return tx.delete(k); } }));
    for (let i = 0; i < 5; i++) { await request(wObj); await request(wObj, "write-count-00001"); }
    assert.equal(puts, 0, "상태 조회는 쓰지 않는다");
    await request(wObj, "write-count-00001/cancel", {}); assert(puts > 0 && puts < chunks, `취소는 바뀐 조각만 쓴다(${puts}/${chunks})`);
    wStore.transaction = tx0;
    // 파이프라인 단계 저장은 앞쪽의 세계관 스냅샷 조각을 다시 쓰지 않는다(재기동 뒤 캐시가 없어도).
    for (const fresh of [false, true]) {
      const pStore = new JobStorage(); let pObj = new AiJobs({ storage: pStore }, env); let pPuts = 0;
      pStore.data.set("jobs", [{ id: "pipe-job-000000001", type: "document.pipeline", status: "running", runId: "run-1", expiresAt: Date.now() + 100000 }]);
      const state = { input: { key: "a" }, at: 1, engine: "e", steps: [], snapshot: { world: { id: "w", body: "세계관".repeat(60000) } } };
      await pObj.savePipeline({ id: "pipe-job-000000001", runId: "run-1" }, state, "generate", false);
      const total = pStore.data.get("jobs")[0].pipelineChunks; assert(total > 10);
      if (fresh) pObj = new AiJobs({ storage: pStore }, env);
      const tx1 = pStore.transaction.bind(pStore);
      pStore.transaction = fn => tx1(tx => fn({ ...tx, put: async (k, v) => { if (k.startsWith("pipe:")) pPuts++; return tx.put(k, v); } }));
      state.steps.push({ kind: "page", status: "done", response: { candidates: [{ content: { parts: [{ text: "본문".repeat(500) }] } }] } });
      await pObj.savePipeline({ id: "pipe-job-000000001", runId: "run-1" }, state, "generate", false);
      pStore.transaction = tx1;
      assert(pPuts <= 2, `바뀐 끝 조각만 쓴다(${pPuts}/${total})`);
      assert.deepEqual(await pObj.pipelineState("pipe-job-000000001"), state);
    }
    // Gemini 명시적 캐시: 앞 조각을 한 번 저장해 재사용하고, 거절되면 캐시 없이 보낸다.
    {
      const big = "공통".repeat(4000), log = [];
      const mk = tail => ({ keyMode: "server", input: { type: "gemini.generate", model: "gemini-3.8-flash", input: { contents: [{ role: "user", parts: [{ text: big }, { text: "세계" }, { text: tail }] }], generationConfig: { responseMimeType: "application/json" } } } });
      let expire = Date.now() + 900000, genStatus = 200;
      globalThis.fetch = async (url, o) => {
        log.push({ url: String(url), method: o.method, body: o.body ? JSON.parse(o.body) : null });
        if (String(url).endsWith("/cachedContents")) return Response.json({ name: "cachedContents/c1", expireTime: new Date(expire).toISOString() });
        if (o.method === "PATCH") return Response.json({ expireTime: new Date(Date.now() + 900000).toISOString() });
        if (genStatus !== 200 && JSON.parse(o.body).cachedContent) return Response.json({ error: { message: "CachedContent not found" } }, { status: 404 });
        return success();
      };
      const env2 = { GEMINI_KEY: "k-explicit" };
      await runProvider(mk("문서 A"), env2); await runProvider(mk("문서 B"), env2);
      const gens = log.filter(l => l.url.includes(":streamGenerateContent"));
      assert.equal(log.filter(l => l.url.endsWith("/cachedContents")).length, 1, "같은 앞부분은 캐시를 한 번만 만든다");
      assert(gens.every(g => g.body.cachedContent === "cachedContents/c1" && g.body.contents.length === 1 && g.body.contents[0].parts.length === 1));
      assert.deepEqual(gens.map(g => g.body.contents[0].parts[0].text), ["문서 A", "문서 B"]);
      const created = log.find(l => l.url.endsWith("/cachedContents")).body; assert.equal(created.ttl, "900s"); assert.equal(created.contents[0].parts.length, 2); assert.equal(created.model, "models/gemini-3.8-flash");
      // 만료가 10분 안으로 다가오면 연장한다.
      log.length = 0; expire = Date.now() + 300000;
      const env3 = { GEMINI_KEY: "k-refresh" }; await runProvider(mk("x"), env3); await runProvider(mk("y"), env3);
      assert.equal(log.filter(l => l.method === "PATCH").length, 1);
      // 캐시가 사라져 거절되면 캐시 없이 같은 요청을 보낸다.
      log.length = 0; genStatus = 404; expire = Date.now() + 900000;
      const env4 = { GEMINI_KEY: "k-gone" }; await runProvider(mk("z"), env4);
      const tries = log.filter(l => l.url.includes(":streamGenerateContent")); assert.equal(tries.length, 2); assert(!tries[1].body.cachedContent && tries[1].body.contents[0].parts.length === 3);
      // 끄기 설정과 Gemini 4는 쓰지 않는다.
      log.length = 0; genStatus = 200;
      await runProvider(mk("o"), { GEMINI_KEY: "k-off", GEMINI_EXPLICIT_CACHE: "off" });
      await runProvider({ ...mk("g4"), input: { ...mk("g4").input, model: "gemini-4-carbon" } }, { GEMINI_KEY: "k-g4" });
      assert(!log.some(l => l.url.endsWith("/cachedContents")));
    }
    ok("서버 AI 호출의 무응답을 구분해 빨리 끝내고, 상태 조회는 쓰지 않으며 단계 저장은 바뀐 조각만 쓴다");
  }
} finally { globalThis.fetch = original; }
