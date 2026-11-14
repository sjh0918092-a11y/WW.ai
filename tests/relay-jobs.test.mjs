/* 유료 API 호출 없이 영구 큐·중복 접수·재기동·사용자 격리를 검증한다. */
import assert from "node:assert/strict";
import { AiJobs } from "../relay/jobs.js";
import worker from "../relay/worker.js";

class Storage {
  data = new Map(); alarm = null; queue = Promise.resolve();
  transaction(fn) {
    const p = this.queue.then(async () => {
      const data = structuredClone(this.data); let alarm = this.alarm;
      const tx = {
        get: async k => structuredClone(data.get(k)),
        put: async (k, v) => { assert(Buffer.byteLength(JSON.stringify(v)) < 128 * 1024, "KV 값 크기 제한"); data.set(k, structuredClone(v)); },
        delete: async k => data.delete(k),
        getAlarm: async () => alarm, setAlarm: async at => { alarm = at; }, deleteAlarm: async () => { alarm = null; },
      };
      const result = await fn(tx); this.data = data; this.alarm = alarm; return result;
    });
    this.queue = p.catch(() => {}); return p;
  }
}
const env = { GEMINI_KEY: "secret-api-key" }, instances = new Map();
const instance = (storage = new Storage()) => ({ storage, obj: new AiJobs({ storage }, env) });
const input = (id = "test-job-00000001", text = "비공개 프롬프트") => ({ id, type: "gemini.generate", model: "test-main", input: { contents: [{ role: "user", parts: [{ text }] }], generationConfig: { responseMimeType: "application/json" } } });
const request = async (obj, path = "", body, options = {}) => {
  const res = await obj.fetch(new Request("https://jobs.test/" + path, {
    method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...options.headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), ...options,
  }));
  return { status: res.status, json: await res.json() };
};
const success = text => Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
const originalFetch = globalThis.fetch; let calls = 0;
let n = 0; const ok = message => console.log(`  ✓ ${++n}. ${message}`);

try {
  const { obj, storage } = instance(), body = input();
  globalThis.fetch = async () => { calls++; return success("완료"); };
  for (const invalid of ["{", null, {}, { ...body, id: "short" }, { ...body, input: { contents: [] } },
    { ...body, input: { ...body.input, generationConfig: { responseModalities: "IMAGE" } } },
    { ...body, input: { ...body.input, tools: [{ googleSearch: {} }] } },
    { ...body, input: { ...body.input, systemInstruction: { parts: [{ fileData: {} }] } } },
    { ...body, model: "gemini-image" }]) assert.equal((await request(obj, "", invalid)).status, 400);
  assert.equal((await request(obj, "", input(body.id, "가".repeat(800000)))).status, 413);
  assert.equal(storage.data.size, 0); assert.equal(calls, 0);
  ok("잘못된 요청·이미지·도구·2MiB 초과 본문은 저장하거나 실행하지 않는다");

  const dup = await Promise.all(Array.from({ length: 4 }, () => request(obj, "", body)));
  assert.deepEqual(dup.map(r => r.status).sort(), [200, 200, 200, 202]);
  assert.equal(storage.data.get("jobs").length, 1); assert(storage.alarm); assert.equal(calls, 0);
  const scheduled = storage.alarm;
  await request(obj); await request(obj, body.id);
  assert.equal(storage.alarm, scheduled, "조회가 예약 실행 시각을 뒤로 미루지 않는다");
  assert.equal((await request(obj, "", input(body.id, "다른 입력"))).status, 409);
  ok("동시에 중복 접수해도 작업은 하나이고, 같은 번호의 다른 요청은 거절한다");

  // 클라이언트 요청이 끝난 뒤 객체를 재생성해도 저장된 요청과 alarm만으로 실행된다.
  const restarted = new AiJobs({ storage }, env);
  await restarted.alarm(); assert.equal(calls, 1);
  let r = await request(restarted, body.id);
  assert.equal(r.json.job.status, "succeeded"); assert.equal(r.json.result.candidates[0].content.parts[0].text, "완료");
  assert(!JSON.stringify(r.json).includes("비공개 프롬프트")); assert(!JSON.stringify(r.json).includes("secret-api-key"));
  assert(![...storage.data.keys()].some(k => k.startsWith("in:")));
  await restarted.alarm(); assert.equal(calls, 1);
  ok("접수 응답 뒤 서버 객체가 재생성돼도 실행·결과 조회가 되며, 완료 작업은 다시 실행하지 않는다");

  const big = input("large-text-000001", "가😀".repeat(100000));
  await request(obj, "", big);
  const output = "한글😀".repeat(30000);
  globalThis.fetch = async req => { calls++; assert.match(req, /^https:\/\/generativelanguage.googleapis.com\//); return success(output); };
  await obj.alarm(); r = await request(obj, big.id);
  assert.equal(r.json.result.candidates[0].content.parts[0].text, output);
  assert(![...storage.data.keys()].some(k => k.startsWith("in:")));
  assert([...storage.data.keys()].filter(k => k.startsWith("out:" + big.id)).length > 1);
  ok("긴 한글·이모지 입력과 결과는 KV 제한 안에서 나눠 저장하고 원문 그대로 복구한다");

  const cancelled = input("cancelled-job-001"); await request(obj, "", cancelled);
  let release, started;
  const gate = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async () => { calls++; started(); return new Promise(resolve => { release = resolve; }); };
  const running = obj.alarm(); await gate;
  r = await request(obj, cancelled.id); assert.equal(r.json.job.status, "running");
  assert.equal((await request(obj, cancelled.id + "/forget", {})).status, 409);
  const late = await request(obj, cancelled.id + "/cancel", {}); assert.equal(late.json.job.status, "cancelled");
  release(success("버릴 결과")); await running;
  r = await request(obj, cancelled.id); assert.equal(r.json.job.status, "cancelled"); assert.equal(r.json.result, undefined);
  ok("실행 중에도 상태를 조회·중단할 수 있고 늦게 도착한 결과는 반영하지 않는다");

  const beforeCancel = calls, queued = input("queued-cancel-01"); await request(obj, "", queued);
  await request(obj, queued.id + "/cancel", {}); await obj.alarm(); assert.equal(calls, beforeCancel);
  ok("대기 중인 작업을 중단하면 AI를 호출하지 않는다");

  const uncertain = instance(), lost = input("lost-running-001"), next = input("next-queued-0001");
  await request(uncertain.obj, "", lost); await request(uncertain.obj, "", next);
  const jobs = uncertain.storage.data.get("jobs"); jobs[0].status = "running";
  uncertain.storage.data.set("jobs", structuredClone(jobs));
  const beforeRestart = calls;
  globalThis.fetch = async () => { calls++; return success("다음 작업"); };
  await new AiJobs({ storage: uncertain.storage }, env).alarm();
  r = await request(uncertain.obj, lost.id); assert.equal(r.json.job.status, "interrupted"); assert.equal(r.json.job.error.code, "outcome_unknown");
  assert.equal((await request(uncertain.obj, next.id)).json.job.status, "succeeded"); assert.equal(calls, beforeRestart + 1);
  ok("실행 도중 서버가 종료됐으면 원래 요청을 재전송하지 않고 다음 대기 작업을 진행한다");

  for (const [id, handler, state] of [
    ["network-error-01", async () => { throw new Error("연결 끊김"); }, "interrupted"],
    ["provider-error01", async () => new Response("rejected", { status: 429 }), "failed"],
    ["invalid-output01", async () => new Response("{bad"), "interrupted"],
    ["empty-output-001", async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }), "failed"],
    ["large-output-001", async () => success("x".repeat(4 * 1024 * 1024)), "interrupted"],
  ]) {
    const test = instance(); await request(test.obj, "", input(id)); let count = 0;
    globalThis.fetch = async (...args) => { count++; return handler(...args); };
    await test.obj.alarm(); await test.obj.alarm(); assert.equal(count, 1);
    assert.equal((await request(test.obj, id)).json.job.status, state);
  }
  ok("네트워크 오류·사용 한도·잘못된 응답·용량 초과에도 자동으로 중복 호출하지 않는다");

  const capacity = instance();
  for (let i = 0; i < 8; i++) assert.equal((await request(capacity.obj, "", input("queue-limited-00" + i))).status, 202);
  assert.equal((await request(capacity.obj, "", input("queue-limited-009"))).status, 429);
  ok("계정당 진행·대기 작업 상한을 적용한다");

  const rollback = instance();
  rollback.storage.transaction = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(request(rollback.obj, "", input("failed-commit-01")), /disk unavailable/);
  assert.equal(rollback.storage.data.size, 0);
  ok("영구 저장에 실패한 작업은 접수 성공으로 응답하지 않는다");

  const finished = storage.data.get("jobs"); finished.forEach(j => { if (j.status !== "queued") j.expiresAt = Date.now() - 1; });
  storage.data.set("jobs", finished);
  await obj.alarm(); assert.equal(storage.data.get("jobs").length, 0); assert.equal(storage.alarm, null);
  assert.deepEqual([...storage.data.keys()], ["jobs"]);
  ok("보관 기간이 지나면 입력·결과 조각과 작업 기록을 정리한다");

  // 기존 Worker의 인증 경로를 통과시킨다. namespace는 uid에서만 정한다.
  const db = {
    prepare: () => ({ bind: token => ({ first: async () => token === "alice-token" ? { uid: "alice" } : token === "bob-token" ? { uid: "bob" } : null }) }),
    batch: async () => [],
  };
  const workerEnv = { ...env, DB: db, PASSWORDS: "relay-pass", AI_JOBS: {
    idFromName: name => name,
    get: name => {
      if (!instances.has(name)) instances.set(name, instance());
      return instances.get(name).obj;
    },
  } };
  const api = async (path = "", body, { token = "alice-token", pass = "relay-pass", origin = "https://sjh0918092-a11y.github.io", customEnv = workerEnv } = {}) => {
    const res = await worker.fetch(new Request("https://relay.test/api/jobs" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Origin: origin, Authorization: "Bearer " + token, "X-WW-Pass": pass, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), customEnv);
    return { status: res.status, json: await res.json(), headers: res.headers };
  };
  assert.equal((await api("", undefined, { token: "bad" })).status, 401);
  assert.equal((await api("", input(), { pass: "wrong" })).status, 403);
  assert.equal((await api("", input(), { origin: "https://evil.test" })).status, 403);
  assert.equal((await api("", input(), { customEnv: { ...workerEnv, AI_JOBS: undefined } })).status, 503);
  assert.equal((await api("", input(), { customEnv: { ...workerEnv, PASSWORDS: undefined }, pass: "undefined" })).status, 503);
  r = await api("", input()); assert.equal(r.status, 202); assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://sjh0918092-a11y.github.io");
  assert.equal((await api("/" + body.id, undefined, { token: "bob-token" })).status, 404);
  assert.equal((await api("/" + body.id + "/cancel", {}, { token: "bob-token" })).status, 404);
  assert.equal((await api("/" + body.id)).status, 200);
  assert.equal((await api("/" + body.id + "/cancel", {})).status, 200);
  ok("로그인·접속 암호·Origin을 검사하고 다른 계정의 작업 조회·중단을 막는다");

  const forgotten = instance(), forget = input("forget-result-01");
  globalThis.fetch = async () => success("보관 결과");
  await request(forgotten.obj, "", forget); await forgotten.obj.alarm();
  assert.equal((await request(forgotten.obj, forget.id + "/forget", {})).status, 200);
  assert.equal((await request(forgotten.obj, forget.id)).status, 404);
  assert.deepEqual([...forgotten.storage.data.keys()], ["jobs"]);
  ok("사용자가 확인한 완료 기록과 결과를 명시적으로 삭제할 수 있다");

  // 삭제 뒤 같은 번호를 잘못 재사용해도 이전 실행의 늦은 완료가 새 결과를 덮지 않는다.
  const reused = instance(), reusedBody = input("reused-job-id-001");
  let firstRelease, firstStart, secondRelease, secondStart;
  const firstGate = new Promise(resolve => { firstStart = resolve; });
  globalThis.fetch = async () => { firstStart(); return new Promise(resolve => { firstRelease = resolve; }); };
  await request(reused.obj, "", reusedBody); const firstRun = reused.obj.alarm(); await firstGate;
  await request(reused.obj, reusedBody.id + "/cancel", {}); await request(reused.obj, reusedBody.id + "/forget", {});
  await request(reused.obj, "", reusedBody);
  const secondGate = new Promise(resolve => { secondStart = resolve; });
  globalThis.fetch = async () => { secondStart(); return new Promise(resolve => { secondRelease = resolve; }); };
  const replacement = new AiJobs({ storage: reused.storage }, env), secondRun = replacement.alarm(); await secondGate;
  firstRelease(success("이전 실행")); await firstRun;
  assert.equal((await request(replacement, reusedBody.id)).json.job.status, "running");
  secondRelease(success("새 실행")); await secondRun;
  assert.equal((await request(replacement, reusedBody.id)).json.result.candidates[0].content.parts[0].text, "새 실행");
  ok("삭제된 번호의 이전 실행이 늦게 끝나도 새 실행의 상태·결과를 덮어쓰지 않는다");
  console.log(`\n모두 통과 (${n}개). 유료 API 호출 0회.`);
} finally { globalThis.fetch = originalFetch; }
