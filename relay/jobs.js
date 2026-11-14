/* 서버 AI 작업 1단계: 계정별 영구 큐와 Gemini 단일 호출.
 * HTTP 요청의 waitUntil이 아니라 Durable Object alarm에서 실행한다.
 * 브라우저에 접수 응답이 도착하지 않아도 같은 id로 다시 접수하면 같은 작업이다.
 */
const MAX_INPUT = 2 * 1024 * 1024;
const MAX_RESULT = 4 * 1024 * 1024;
const MAX_JOBS = 20;
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
const publicJob = j => Object.fromEntries(Object.entries(j).filter(([k]) => !["inputChunks", "resultChunks", "fingerprint", "runId"].includes(k)));
const textParts = c => c && typeof c === "object" && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.every(p => p && typeof p.text === "string" && Object.keys(p).every(k => k === "text"));
const hash = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, "0")).join("");

async function boundedText(stream, limit) {
  if (!stream) return "";
  const reader = stream.getReader(), dec = new TextDecoder(); let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw { code: "too_large" }; }
      text += dec.decode(value, { stream: true });
    }
    return text + dec.decode();
  } finally { reader.releaseLock(); }
}
async function writeText(storage, prefix, text) {
  const chunks = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < chunks; i++) await storage.put(prefix + i, text.slice(i * CHUNK, (i + 1) * CHUNK));
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
  if (tail && !/^\/[a-zA-Z0-9_-]{16,80}(?:\/cancel|\/forget)?$/.test(tail)) return fail(404, "작업을 찾을 수 없습니다.");
  if (!tail && request.method === "POST") {
    if (!env.GEMINI_KEY || !env.PASSWORDS) return fail(503, "서버에 Gemini API 키 또는 접속 암호가 설정되지 않았습니다.");
    if (!(await passOk(request.headers.get("X-WW-Pass") || "", env.PASSWORDS))) return fail(403, "중계 서버 접속 암호가 올바르지 않습니다.");
  }
  try {
    const obj = env.AI_JOBS.get(env.AI_JOBS.idFromName("account:" + uid), { locationHint: "enam" });
    const res = await obj.fetch(new Request("https://jobs.internal/" + tail.replace(/^\//, ""), {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half",
    }));
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch { return fail(503, "서버 작업 저장소에 연결하지 못했습니다. 같은 작업 번호로 다시 확인해 주세요."); }
}

export class AiJobs {
  constructor(state, env) { this.storage = state.storage; this.env = env; this.active = null; }

  // 상태, 요청 본문, 실행 예약을 한 트랜잭션으로 저장해야 접수 직후 종료돼도 작업을 잃지 않는다.
  async update(fn) {
    return this.storage.transaction(async tx => {
      let jobs = await tx.get("jobs") || [];
      const now = Date.now(), expired = jobs.filter(j => terminal(j) && j.expiresAt <= now);
      for (const j of expired) {
        await deleteText(tx, "in:" + j.id + ":", j.inputChunks);
        await deleteText(tx, "out:" + j.id + ":", j.resultChunks);
      }
      jobs = jobs.filter(j => !expired.includes(j));
      const value = await fn(jobs, tx);
      await tx.put("jobs", jobs);
      // 실행 중인 alarm은 완료 때 다음 작업을 예약한다. 중간 조회가 중복 alarm을 만들지 않는다.
      if (!jobs.some(j => j.status === "running")) {
        const expires = jobs.filter(terminal).map(j => j.expiresAt);
        const due = jobs.some(j => j.status === "queued") ? now + 1000 : expires.length ? Math.min(...expires) : null;
        const scheduled = await tx.getAlarm();
        // 잦은 상태 조회가 실행 시각을 계속 뒤로 미루면 안 된다.
        if (due !== null && (scheduled === null || due < scheduled)) await tx.setAlarm(due);
        else if (due === null) await tx.deleteAlarm();
      }
      return value;
    });
  }

  async fetch(request) {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean), id = parts[0];
    if (parts.length > 2 || (id && !ID.test(id))) return error(404, "not_found", "작업을 찾을 수 없습니다.");
    if (request.method === "POST" && !id) return this.submit(request);
    if (request.method === "GET" && !id) return this.update(async jobs => reply({ jobs: jobs.map(publicJob).reverse() }));
    if (request.method === "GET" && parts.length === 1) return this.update(async (jobs, tx) => {
      const j = jobs.find(j => j.id === id); if (!j) return error(404, "not_found", "작업을 찾을 수 없습니다.");
      const out = { job: publicJob(j) };
      if (j.status === "succeeded") out.result = JSON.parse(await readText(tx, "out:" + id + ":", j.resultChunks));
      return reply(out);
    });
    if (request.method === "POST" && parts.length === 2 && ["cancel", "forget"].includes(parts[1])) {
      const res = await this.update(async (jobs, tx) => {
        const j = jobs.find(j => j.id === id); if (!j) return error(404, "not_found", "작업을 찾을 수 없습니다.");
        if (parts[1] === "forget") {
          if (!terminal(j)) return error(409, "still_running", "진행 중인 작업은 먼저 중단해 주세요.");
          await deleteText(tx, "in:" + id + ":", j.inputChunks);
          await deleteText(tx, "out:" + id + ":", j.resultChunks);
          jobs.splice(jobs.indexOf(j), 1); return reply({ ok: true });
        }
        if (!terminal(j)) {
          j.status = "cancelled"; j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
          await deleteText(tx, "in:" + id + ":", j.inputChunks); j.inputChunks = 0;
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
    if (!body || typeof body.id !== "string" || !ID.test(body.id) || body.type !== "gemini.generate" || typeof body.model !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(body.model) ||
      !body.input || !Array.isArray(body.input.contents) || !body.input.contents.length) return error(400, "invalid_job", "작업 번호·종류·모델·입력 내용을 확인해 주세요.");
    // 1단계는 텍스트 전용이다. 이미지·외부 파일·도구 실행은 이후 단계에서 별도로 제한한다.
    const config = body.input.generationConfig;
    if (!body.input.contents.every(c => textParts(c) && ["user", "model", undefined].includes(c.role) && Object.keys(c).every(k => ["role", "parts"].includes(k))) ||
      (body.input.systemInstruction !== undefined && !textParts(body.input.systemInstruction)) ||
      Object.keys(body.input).some(k => !["contents", "generationConfig", "systemInstruction", "safetySettings"].includes(k)) ||
      (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) ||
      (config?.responseModalities !== undefined && (!Array.isArray(config.responseModalities) || config.responseModalities.some(m => m !== "TEXT"))) ||
      /image|tts|live|audio|embedding|transcribe|robotics/i.test(body.model)) return error(400, "unsupported_input", "이번 단계에서는 Gemini 텍스트 생성만 지원합니다.");
    input = JSON.stringify({ model: body.model, input: body.input });
    const fingerprint = await hash(input);
    return this.update(async (jobs, tx) => {
      const old = jobs.find(j => j.id === body.id);
      if (old) return old.fingerprint === fingerprint ? reply({ job: publicJob(old) }, 200) : error(409, "id_conflict", "같은 작업 번호에 다른 요청이 이미 저장되어 있습니다.");
      if (jobs.length >= MAX_JOBS || jobs.filter(j => !terminal(j)).length >= MAX_PENDING) return error(429, "queue_full", "작업이 많습니다. 완료 결과를 확인하거나 보관 기간이 지난 뒤 다시 시도해 주세요.");
      const j = { id: body.id, type: body.type, model: body.model, status: "queued", createdAt: Date.now(), fingerprint,
        inputChunks: await writeText(tx, "in:" + body.id + ":", input), resultChunks: 0 };
      jobs.push(j); return reply({ job: publicJob(j) }, 202);
    });
  }

  async alarm() {
    if (this.active) return;
    // 중간에 서버가 종료됐다면 원래 API 요청의 완료 여부를 알 수 없다. 자동 재전송은 하지 않는다.
    const job = await this.update(async (jobs, tx) => {
      for (const j of jobs.filter(j => j.status === "running")) {
        j.status = "interrupted"; j.error = { code: "outcome_unknown", message: "서버 실행이 중단되어 AI 처리 결과를 확인하지 못했습니다. 자동으로 재요청하지 않았습니다." };
        j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
        await deleteText(tx, "in:" + j.id + ":", j.inputChunks); j.inputChunks = 0;
      }
      const next = jobs.find(j => j.status === "queued"); if (!next) return null;
      next.status = "running"; next.startedAt = Date.now(); next.runId = crypto.randomUUID();
      return { id: next.id, runId: next.runId, input: JSON.parse(await readText(tx, "in:" + next.id + ":", next.inputChunks)) };
    });
    if (!job) return;
    const controller = new AbortController(); this.active = { id: job.id, controller };
    const timeout = setTimeout(() => controller.abort(), DEADLINE);
    let result, failure;
    try {
      if (!this.env.GEMINI_KEY) throw { code: "server_key_missing", definite: true };
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(job.input.model) + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.env.GEMINI_KEY },
        body: JSON.stringify(job.input.input), signal: controller.signal,
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw { code: "upstream_" + res.status, definite: true, status: res.status };
      }
      const text = await boundedText(res.body, MAX_RESULT);
      try { result = JSON.parse(text); } catch { throw { code: "invalid_response" }; }
      if (!result || !Array.isArray(result.candidates) || !result.candidates.length) throw { code: "empty_response", definite: true };
    } catch (e) {
      failure = { status: e?.definite ? "failed" : "interrupted", error: {
        code: e?.code || "outcome_unknown",
        message: e?.definite ? "AI 서버가 요청을 완료하지 못했습니다. 설정과 사용 한도를 확인해 주세요." : "AI 요청의 완료 여부를 확인하지 못했습니다. 중복 실행을 피하려고 자동으로 재요청하지 않았습니다.",
        ...(e?.status ? { httpStatus: e.status } : {}),
      } };
    } finally { clearTimeout(timeout); if (this.active?.id === job.id) this.active = null; }
    await this.update(async (jobs, tx) => {
      const j = jobs.find(j => j.id === job.id); if (!j || j.status !== "running" || j.runId !== job.runId) return; // 중단한 작업의 늦은 응답은 버린다.
      if (failure) Object.assign(j, failure);
      else { j.resultChunks = await writeText(tx, "out:" + j.id + ":", JSON.stringify(result)); j.status = "succeeded"; }
      await deleteText(tx, "in:" + j.id + ":", j.inputChunks); j.inputChunks = 0;
      j.finishedAt = Date.now(); j.expiresAt = j.finishedAt + RETENTION;
    });
  }
}
