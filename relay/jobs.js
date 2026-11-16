/* 계정별 영구 큐와 Gemini·OpenAI AI 작업.
 * HTTP 요청의 waitUntil이 아니라 Durable Object alarm에서 실행한다.
 * 브라우저에 접수 응답이 도착하지 않아도 같은 id로 다시 접수하면 같은 작업이다.
 */
import { processPipeline } from "./pipeline.js";
import { validateJob, boundedText, runProvider, serverKeyName, usageCounts } from "./providers.js";
const MAX_INPUT = 2 * 1024 * 1024;
const MAX_JOBS = 20;
const MAX_HISTORY = 500;
const MAX_PENDING = 8;
const RETENTION = 24 * 60 * 60 * 1000;
const DEADLINE = 10 * 60 * 1000;
const CHUNK = 16000; // 한글·서로게이트를 포함해 KV 값당 128KiB 제한보다 작다.
const ID = /^[a-zA-Z0-9_-]{16,80}$/;
const terminal = j => !["queued", "running"].includes(j.status);
const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const error = (status, code, message) => reply({ error: { code, message } }, status);
const publicJob = j => Object.fromEntries(Object.entries(j).filter(([k]) => !["inputChunks", "resultChunks", "fingerprint", "runId", "uid", "pipelineChunks"].includes(k)));
const hash = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, "0")).join("");

// 기존 조각(old개)과 같은 내용은 다시 쓰지 않는다. Durable Object는 쓴 행 수로 과금·제한되므로
// 앞부분이 그대로인 큰 상태(세계관 스냅샷·작업 목록)를 매번 통째로 쓰지 않게 한다. 남는 조각은 지운다.
async function writeText(storage, prefix, text, old = 0, prevText) {
  const chunks = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    const part = text.slice(i * CHUNK, (i + 1) * CHUNK);
    if (i < old && (typeof prevText === "string" ? prevText.slice(i * CHUNK, (i + 1) * CHUNK) : await storage.get(prefix + i)) === part) continue;
    await storage.put(prefix + i, part);
  }
  for (let i = chunks; i < old; i++) await storage.delete(prefix + i);
  return chunks;
}
async function readText(storage, prefix, chunks) {
  let text = "";
  for (let i = 0; i < chunks; i++) {
    const part = await storage.get(prefix + i);
    if (typeof part !== "string") throw new Error("작업 데이터가 없습니다.");
    text += part;
  }
  return text;
}
async function deleteText(storage, prefix, chunks) {
  for (let i = 0; i < (chunks || 0); i++) await storage.delete(prefix + i);
}

// 인증과 Origin 검사는 기존 /api 경로에서 먼저 수행한다. 다른 계정의 namespace에는 접근할 수 없다.
export async function jobsApi(request, env, url, cors, fail, uid, passOk) {
  if (!env.AI_JOBS) return fail(503, "서버 작업 기능이 아직 배포되지 않았습니다.");
  const tail = url.pathname.slice("/api/jobs".length);
  if (tail && !/^\/[a-zA-Z0-9_-]{16,80}(?:\/cancel|\/forget|\/ack|\/resolve)?$/.test(tail)) return fail(404, "작업을 찾을 수 없습니다.");
  let text;
  if (!tail && request.method === "POST") {
    let body;
    try { text = await boundedText(request.body, MAX_INPUT); body = JSON.parse(text); }
    catch (e) { return fail(e?.code === "too_large" ? 413 : 400, "작업 요청을 확인해 주세요. 본문은 최대 2MiB입니다."); }
    const invalid = validateJob(body); if (invalid) return fail(400, invalid);
    if (!body.credential) {
      const models = body.type === "document.pipeline" ? [body.input.settings.main || body.model, body.input.settings.quick || "gemini-3.5-flash-lite", body.input.settings.check || body.input.settings.main || body.model] : [body.model];
      const missing = [...new Set(models.map(model => serverKeyName(body.type, model)))].filter(name => !env[name]);
      if (missing.length || !env.PASSWORDS) return fail(503, "서버에 " + [...missing, ...(!env.PASSWORDS ? ["PASSWORDS"] : [])].join(", ") + " 설정이 필요합니다.");
      if (!(await passOk(request.headers.get("X-WW-Pass") || "", env.PASSWORDS))) return fail(403, "중계 서버 접속 암호가 올바르지 않습니다.");
    }
  }
  try {
    const obj = env.AI_JOBS.get(env.AI_JOBS.idFromName("account:" + uid), { locationHint: "enam" });
    const res = await obj.fetch(new Request("https://jobs.internal/" + tail.replace(/^\//, ""), {
      method: request.method,
      headers: { "Content-Type": "application/json", "X-WW-Account": encodeURIComponent(uid) },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : text ?? request.body,
      duplex: "half",
    }));
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch { return fail(503, "서버 작업 저장소에 연결하지 못했습니다. 같은 작업 번호로 다시 확인해 주세요."); }
}

export class AiJobs {
  constructor(state, env) { this.state = state; this.storage = state.storage; this.env = env; this.active = null; }

  // 상태, 요청 본문, 실행 예약을 한 트랜잭션으로 저장해야 접수 직후 종료돼도 작업을 잃지 않는다.
  async update(fn) {
    return this.storage.transaction(async tx => {
      const index = await tx.get("jobs") || [];
      const before = Array.isArray(index) ? JSON.stringify(index) : await readText(tx, "index:", index.chunks);
      let jobs = JSON.parse(before);
      const now = Date.now(), expired = jobs.filter(j => terminal(j) && j.expiresAt <= now);
      for (const j of expired) {
        await deleteText(tx, "in:" + j.id + ":", j.inputChunks);
        await deleteText(tx, "out:" + j.id + ":", j.resultChunks);
        await tx.delete("key:" + j.id);
        await deleteText(tx, "pipe:" + j.id + ":", j.pipelineChunks);
      }
      jobs = jobs.filter(j => !expired.includes(j));
      const value = await fn(jobs, tx);
      // 이미 받은 결과만 정리하며 번호·지문은 24시간 유지한다. 조회가 접수 재실행으로 이어지지 않는다.
      let count = jobs.filter(j => j.resultChunks).length;
      for (const j of jobs.filter(j => j.receivedAt && j.resultChunks)) {
        if (count <= MAX_JOBS) break;
        await deleteText(tx, "out:" + j.id + ":", j.resultChunks);
        j.resultChunks = 0; j.resultCollected = true; count--;
      }
      // 바뀐 것이 없으면 목록을 다시 쓰지 않는다.
      const serialized = JSON.stringify(jobs);
      if (serialized === before) {}
      else if (new TextEncoder().encode(serialized).length < 96000) {
        if (!Array.isArray(index)) await deleteText(tx, "index:", index.chunks);
        await tx.put("jobs", jobs);
      }
      else {
        const old = Array.isArray(index) ? 0 : index.chunks;
        const chunks = await writeText(tx, "index:", serialized, old, Array.isArray(index) ? undefined : before);
        if (chunks !== old) await tx.put("jobs", { chunks });
      }
      // 실행 중인 alarm은 완료 때 다음 작업을 예약한다. 중간 조회가 중복 alarm을 만들지 않는다.
      if (!jobs.some(j => j.status === "running")) {
        const expires = jobs.filter(terminal).map(j => j.expiresAt);
        const due = jobs.some(j => j.status === "queued") ? now + 1000 : expires.length ? Math.min(...expires) : null;
        const scheduled = await tx.getAlarm();
        // 잦은 상태 조회가 실행 시각을 계속 뒤로 미루면 안 된다.
        if (due !== null && (scheduled === null || due < scheduled)) await tx.setAlarm(due);
        else if (due === null && scheduled !== null) await tx.deleteAlarm();
      }
      return value;
    });
  }

  // 조회 전용. 상태 확인은 1.5~5초마다 반복되므로 저장소에 아무것도 쓰지 않는다.
  // 만료 기록은 숨기기만 하고 삭제는 alarm·쓰기 요청의 update에 맡긴다.
  async read(fn) {
    return this.storage.transaction(async tx => {
      const index = await tx.get("jobs") || [], now = Date.now();
      const jobs = (Array.isArray(index) ? index : JSON.parse(await readText(tx, "index:", index.chunks))).filter(j => !(terminal(j) && j.expiresAt <= now));
      // 예약이 사라진 대기 작업만 다시 예약한다(드문 쓰기).
      if (jobs.some(j => j.status === "queued") && !jobs.some(j => j.status === "running") && await tx.getAlarm() === null) await tx.setAlarm(now + 1000);
      return fn(jobs, tx);
    });
  }

  async fetch(request) {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean), id = parts[0];
    if (parts.length > 2 || (id && !ID.test(id))) return error(404, "not_found", "작업을 찾을 수 없습니다.");
    if (request.method === "POST" && !id) return this.submit(request);
    if (request.method === "GET" && !id) return this.read(async jobs => reply({ jobs: jobs.map(publicJob).reverse() }));
    if (request.method === "GET" && parts.length === 1) return this.read(async (jobs, tx) => {
      const j = jobs.find(j => j.id === id); if (!j) return error(404, "not_found", "작업을 찾을 수 없습니다.");
      const out = { job: publicJob(j) };
      if (terminal(j) && j.resultChunks) out.result = JSON.parse(await readText(tx, "out:" + id + ":", j.resultChunks));
      return reply(out);
    });
    if (request.method === "POST" && parts.length === 2 && ["cancel", "forget", "ack", "resolve"].includes(parts[1])) {
      const res = await this.update(async (jobs, tx) => {
        const j = jobs.find(j => j.id === id); if (!j) return error(404, "not_found", "작업을 찾을 수 없습니다.");
        if (parts[1] === "ack" || parts[1] === "resolve") {
          if (!terminal(j)) return error(409, "still_running", "아직 결과를 받을 수 없습니다.");
          j.receivedAt ||= Date.now();
          if (parts[1] === "resolve") j.resolvedAt ||= Date.now();
          return reply({ job: publicJob(j) });
        }
        if (parts[1] === "forget") {
          if (!terminal(j)) return error(409, "still_running", "진행 중인 작업은 먼저 중단해 주세요.");
          await deleteText(tx, "in:" + id + ":", j.inputChunks);
          await deleteText(tx, "out:" + id + ":", j.resultChunks);
          await tx.delete("key:" + id);
          await deleteText(tx, "pipe:" + id + ":", j.pipelineChunks);
          jobs.splice(jobs.indexOf(j), 1); return reply({ ok: true });
        }
        if (!terminal(j)) {
          j.status = "cancelled"; j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
          await deleteText(tx, "in:" + id + ":", j.inputChunks); j.inputChunks = 0;
          await tx.delete("key:" + id);
          await deleteText(tx, "pipe:" + id + ":", j.pipelineChunks); j.pipelineChunks = 0;
        }
        return reply({ job: publicJob(j) });
      });
      if (parts[1] === "cancel" && this.active?.id === id) this.active.controller.abort();
      return res;
    }
    return error(405, "method_not_allowed", "허용되지 않은 요청입니다.");
  }

  async submit(request) {
    let body, input;
    try {
      if (Number(request.headers.get("Content-Length") || 0) > MAX_INPUT) throw { code: "too_large" };
      body = JSON.parse(await boundedText(request.body, MAX_INPUT));
    } catch (e) { return error(e?.code === "too_large" ? 413 : 400, e?.code || "invalid_json", "작업 요청을 확인해 주세요. 본문은 최대 2MiB입니다."); }
    const invalid = validateJob(body); if (invalid) return error(400, "invalid_job", invalid);
    if (body.type === "document.pipeline" && (!this.env.DB || !request.headers.get("X-WW-Account"))) return error(503,"pipeline_unavailable","서버 문서 저장소와 계정 연결을 확인해 주세요.");
    input = JSON.stringify({ type: body.type, model: body.model, input: body.input });
    const fingerprint = await hash(input + "\n" + (body.credential?.key || "relay"));
    const legacy = body.type === "gemini.generate" && !body.credential ? await hash(JSON.stringify({ model: body.model, input: body.input })) : null;
    return this.update(async (jobs, tx) => {
      const old = jobs.find(j => j.id === body.id);
      if (old) return old.fingerprint === fingerprint || (!old.keyMode && old.fingerprint === legacy) ? reply({ job: publicJob(old) }, 200) : error(409, "id_conflict", "같은 작업 번호에 다른 요청이 이미 저장되어 있습니다.");
      if (jobs.length >= MAX_HISTORY || jobs.filter(j => !j.receivedAt).length >= MAX_JOBS || jobs.filter(j => !terminal(j)).length >= MAX_PENDING) return error(429, "queue_full", "작업이 많습니다. 완료 결과를 확인하거나 보관 기간이 지난 뒤 다시 시도해 주세요.");
      if (body.credential) await tx.put("key:" + body.id, body.credential.key);
      const j = { ...(body.type === "document.pipeline" ? { uid: decodeURIComponent(request.headers.get("X-WW-Account")) } : {}), id: body.id, type: body.type, model: body.model, ...(body.meta ? { meta: body.meta } : {}), keyMode: body.credential ? "personal" : "relay", status: "queued", createdAt: Date.now(), fingerprint,
        inputChunks: await writeText(tx, "in:" + body.id + ":", input), resultChunks: 0 };
      jobs.push(j); return reply({ job: publicJob(j) }, 202);
    });
  }

  async pipelineState(id) {
    return this.read(async (jobs, tx) => { const j = jobs.find(j => j.id === id); return j?.pipelineChunks ? JSON.parse(await readText(tx, "pipe:" + id + ":", j.pipelineChunks)) : null; });
  }
  async savePipeline(job, state, phase, queued) {
    // 마지막으로 저장된 상태 문자열은 트랜잭션이 확정된 뒤에만 기억한다(롤백 시 비교 기준이 어긋나지 않게).
    let written = null;
    const ok = await this.update(async (jobs, tx) => {
      const j = jobs.find(j => j.id === job.id); if (!j || j.status !== "running" || j.runId !== job.runId) return false;
      // 변하지 않는 입력·세계관 스냅샷을 앞에 두어, 단계가 늘어도 앞쪽 조각은 다시 쓰지 않게 한다.
      const { input, at, engine, snapshot, ...rest } = state;
      const text = JSON.stringify({ input, at, engine, snapshot, ...rest });
      if (new TextEncoder().encode(text).length > 16 * 1024 * 1024) throw { code:"pipeline_limit", definite:true, safeMessage:"작업 기록이 커서 초안으로 보관했습니다. 원본은 유지했습니다." };
      const prev = this.pipeText?.id === j.id && this.pipeText.chunks === (j.pipelineChunks || 0) ? this.pipeText.text : undefined;
      j.pipelineChunks = await writeText(tx, "pipe:" + j.id + ":", text, j.pipelineChunks || 0, prev);
      written = { id: j.id, chunks: j.pipelineChunks, text };
      j.phase = phase; j.steps = state.steps.map(s => ({kind:s.kind,status:s.status,model:s.model,slot:s.slot,usage:usageCounts(s.response?.usageMetadata),...(s.timing ? {timing:s.timing} : {}),...(s.error?.code ? {code:s.error.code} : {})}));
      if (queued) { j.status = "queued"; await tx.setAlarm(Date.now()+1000); }
      return true;
    });
    if (written) this.pipeText = written;
    return ok;
  }
  async finishPipeline(job, complete) {
    const finish = () => this.update(async (jobs, tx) => {
      const j = jobs.find(j => j.id === job.id); if (!j || j.status !== "running" || j.runId !== job.runId) return;
      // 완료 저장과 취소를 직렬화한다. D1은 작업 번호로 멱등 저장하므로 저장 직후 재시작도 안전하다.
      const out = await complete();
      j.resultChunks = await writeText(tx, "out:" + j.id + ":", JSON.stringify(out.result));
      j.status = out.status; if (out.error) j.error = out.error;
      j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
      await deleteText(tx, "in:" + j.id + ":", j.inputChunks); j.inputChunks = 0;
      await deleteText(tx, "pipe:" + j.id + ":", j.pipelineChunks); j.pipelineChunks = 0;
      await tx.delete("key:" + j.id);
    });
    return this.state.blockConcurrencyWhile ? this.state.blockConcurrencyWhile(finish) : finish();
  }

  async alarm() {
    if (this.active) return;
    // 중간에 서버가 종료됐다면 원래 API 요청의 완료 여부를 알 수 없다. 자동 재전송은 하지 않는다.
    const job = await this.update(async (jobs, tx) => {
      for (const j of jobs.filter(j => j.status === "running" && j.type !== "document.pipeline")) {
        j.status = "interrupted"; j.error = { code: "outcome_unknown", message: "서버 실행이 중단되어 AI 처리 결과를 확인하지 못했습니다. 자동으로 재요청하지 않았습니다." };
        j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
        await deleteText(tx, "in:" + j.id + ":", j.inputChunks); j.inputChunks = 0;
        await tx.delete("key:" + j.id);
      }
      const next = jobs.find(j => j.status === "running" && j.type === "document.pipeline") || jobs.find(j => j.status === "queued"); if (!next) return null;
      next.status = "running"; next.startedAt = Date.now(); next.runId = crypto.randomUUID();
      // alarm 자체가 예기치 않게 종료돼도 남은 임시 키와 running 상태를 나중에 정리한다.
      await tx.setAlarm(next.startedAt + DEADLINE + 60000);
      return { uid: next.uid, createdAt: next.createdAt, id: next.id, runId: next.runId, keyMode: next.keyMode, personalKey: await tx.get("key:" + next.id), input: JSON.parse(await readText(tx, "in:" + next.id + ":", next.inputChunks)) };
    });
    if (!job) return;
    const controller = new AbortController(); this.active = { id: job.id, controller };
    if (job.input.type === "document.pipeline") {
      const timer = setTimeout(() => controller.abort("deadline"), DEADLINE);
      try { await processPipeline(this, job, controller.signal); }
      finally { clearTimeout(timer); job.personalKey = null; if (this.active?.id === job.id) this.active = null; }
      return;
    }
    const image = (job.input.type || "").endsWith(".image");
    const timeout = setTimeout(() => controller.abort(image ? undefined : "deadline"), job.input.type === "openai.image" ? 300000 : image ? 180000 : DEADLINE);
    let result, failure; const timing = {};
    try {
      result = await runProvider(job, this.env, job.personalKey, controller.signal, timing);
    } catch (e) {
      failure = { status: e?.definite ? "failed" : "interrupted", error: {
        code: e?.code || "outcome_unknown",
        message: e?.safeMessage || (e?.definite ? "AI 서버가 요청을 완료하지 못했습니다. 설정과 사용 한도를 확인해 주세요." : "AI 요청의 완료 여부를 확인하지 못했습니다. 중복 실행을 피하려고 자동으로 재요청하지 않았습니다."),
        ...(e?.status ? { httpStatus: e.status } : {}),
        ...(e?.code === "model_not_found" && e.model ? {model:e.model} : {}),
      } };
    } finally { clearTimeout(timeout); job.personalKey = null; if (this.active?.id === job.id) this.active = null; }
    await this.update(async (jobs, tx) => {
      const j = jobs.find(j => j.id === job.id); if (!j || j.status !== "running" || j.runId !== job.runId) return; // 중단한 작업의 늦은 응답은 버린다.
      j.timing = timing;
      if (failure) Object.assign(j, failure);
      else { j.usage = usageCounts(result.usageMetadata); j.resultChunks = await writeText(tx, "out:" + j.id + ":", JSON.stringify(result)); j.status = "succeeded"; }
      await deleteText(tx, "in:" + j.id + ":", j.inputChunks); j.inputChunks = 0;
      await tx.delete("key:" + j.id);
      j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
    });
  }
}
