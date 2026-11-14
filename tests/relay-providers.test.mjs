import assert from "node:assert/strict";
import { AiJobs } from "../relay/jobs.js";
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
  assert.deepEqual(JSON.parse(calls[0].options.body), b.input); assert(calls[0].url.endsWith("/custom-check:generateContent"));
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
    { ...openai("bad-missing-key01"), credential: undefined },
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
  r = await request(largeIndex); assert.equal(r.json.jobs.length, 400); assert(largeIndexStore.data.get("jobs").chunks > 1);
  assert.equal((await request(new AiJobs({ storage: largeIndexStore }, env))).json.jobs.length, 400);
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
} finally { globalThis.fetch = original; }
