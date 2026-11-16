import { createDocumentEngine, ENGINE_SOURCE } from "./engine.generated.js";
import { snapshotWorld, commitDocument, digest } from "./pipeline-store.js";
import { runProvider, usageCounts } from "./providers.js";
const yieldError = () => ({ code: "pipeline_yield", serverJob: true });
const CHECK_CONCURRENCY = 4;
const isCheck = kind => ["check", "read", "ageRule"].includes(kind);
const phaseFor = kind => ["check","read","ageRule"].includes(kind) ? "check" : ["fix","analyze","factSync"].includes(kind) ? "fix" : "generate";
const safeError = e => ({ code: e?.code || "pipeline_error", message: e?.safeMessage || "문서 작업을 끝내지 못해 원본을 유지했습니다. AI 작업에서 결과를 확인해 주세요.", ...(e?.status ? { httpStatus: e.status } : {}), ...(e?.code === "model_not_found" && e.model ? {model:e.model,phase:e.phase} : {}) });
const resultFor = (state, output, saved, error) => {
  const pageStep = state.steps.find(s => s.kind === "page" && s.response);
  const parts = pageStep?.response?.candidates?.[0]?.content?.parts || [];
  const text = output?.page ? JSON.stringify(output.page) : parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], pipeline: {
    version: 1, saved, wid: state.snapshot?.world.id, targetKey: output?.targetKey || state.input.key, checked: !!output?.checked,
    fixed: output?.fixed || 0, remaining: output?.remaining || 0, notFound: !!output?.notFound, redirectTo: output?.redirectTo || null,
    sceneUsed: output?.sceneUsed || "", angleRecorded: !!state.input.novel && saved,
    steps: state.steps.map(({ kind, model, status, error, response, timing }) => ({ kind, model, status, usage:usageCounts(response?.usageMetadata), ...(timing ? { timing } : {}), ...(error ? { error: safeError(error) } : {}) })), ...(error ? { error } : {}),
  } };
};

// replay는 순수 메모리 실행. 독립된 검사만 최대 4개 기록한 뒤 함께 실행한다.
export async function processPipeline(host, job, signal) {
  const input = job.input.input;
  let state = await host.pipelineState(job.id);
  const finish = async (status, error, output, save = false) => {
    if (save) {
      state.output = output; state.saving = true;
      try { if (!await host.savePipeline(job, state, "saving", false)) return; }
      catch (e) { if (!e.definite) throw e; save = false; status = "failed"; error = safeError(e); }
    }
    await host.finishPipeline(job, async () => {
      let saved = false;
      if (save) {
        try { saved = await commitDocument(host.env.DB, job.uid, job.id, state.snapshot, output); }
        catch (e) { if (!e.definite) throw e; error = safeError(e); status = "failed"; }
        if (!saved && !error) { error = { code: "source_changed", message: "작업 중 원본이 수정되거나 삭제되어 덮어쓰지 않았습니다. 결과는 초안으로 보관했습니다." }; status = "failed"; }
      }
      return { status, ...(error ? { error } : {}), result: resultFor(state, output, saved, error) };
    });
  };
  if (!state) {
    state = { input, at: job.createdAt, engine: ENGINE_SOURCE, steps: [] };
    try { state.snapshot = await snapshotWorld(host.env.DB, job.uid, input); }
    catch (e) { if (!e.definite) throw e; await finish("failed", safeError(e)); return; }
    if (!await host.savePipeline(job, state, "generate", false)) return;
  }
  if (state.saving) { await finish("succeeded", null, state.output, true); return; }
  if (state.engine !== ENGINE_SOURCE) { await finish("interrupted", { code: "engine_changed", message: "서버 실행 규칙이 업데이트되어 중복 호출 없이 중단했습니다. 남은 초안을 확인해 주세요." }); return; }
  for (const running of state.steps.filter(s => s.status === "running")) {
    running.status = "unknown"; running.error = { code: "outcome_unknown", safeMessage: "실행 도중 서버가 중단되어 해당 AI 호출을 다시 보내지 않았습니다.", serverJob: true };
  }
  const selected = [];
  let output, engineError;
  const counts = {}, runtime = { id: job.id, at: state.at, input, snapshot: state.snapshot, failures: [], notes: [], yielded: false,
    async request(kind, model, body) {
      const slot = kind + ":" + (counts[kind] = (counts[kind] || 0) + 1);
      const fingerprint = await digest({ kind,model,body }), old = state.steps.find(s => s.slot === slot);
      if (old) {
        if (old.fingerprint !== fingerprint) throw { code: "replay_changed", serverJob: true };
        if (old.status === "done") return structuredClone(old.response);
        throw { ...old.error, message: old.error?.safeMessage, serverJob: true };
      }
      if (state.steps.some(s => s.status === "unknown")) throw { code: "outcome_unknown", serverJob: true };
      if (state.steps.length + selected.length >= 32) throw { code: "step_limit", serverJob: true };
      if (!selected.length || isCheck(selected[0].kind) && isCheck(kind) && selected.length < CHECK_CONCURRENCY) selected.push({ slot, kind, model, fingerprint, body });
      runtime.yielded = true; throw yieldError();
    },
  };
  try { output = await createDocumentEngine(runtime).execute(); }
  catch (e) { engineError = e; }
  if (runtime.failures.some(f => f.code === "replay_changed")) { await finish("interrupted",safeError({code:"replay_changed"}),output); return; }
  if (selected.length) {
    const phase = phaseFor(selected[0].kind);
    const batch = selected.map(({ body, ...step }) => { step.status = "running"; state.steps.push(step); return { body, step }; });
    // 네트워크 요청 전에 전체 실행 기록을 남긴다. 재시작 시 미확인 요청은 재전송하지 않는다.
    if (!await host.savePipeline(job, state, phase, false)) return;
    let persistence = Promise.resolve(), stopped = false;
    await Promise.allSettled(batch.map(async ({ body, step }) => {
      try {
        step.timing = {};
        step.response = await runProvider({ keyMode: job.keyMode, input: { type: "gemini.generate", model: step.model, input: body } }, host.env, job.personalKey, signal, step.timing);
        step.status = "done";
      } catch (e) {
        step.error = { code: e?.code || "outcome_unknown", safeMessage: safeError(e).message, serverJob: true, definite: !!e?.definite, ...(e?.code === "model_not_found" ? {model:step.model,phase:step.kind} : {}), ...(e?.status ? { status: e.status } : {}) };
        step.status = step.error.definite ? "failed" : "unknown";
      }
      // 먼저 끝난 결과도 즉시 보존하되 상태 저장은 직렬화한다. 모든 응답 전에는 replay하지 않는다.
      persistence = persistence.then(async () => { if (!stopped) stopped = !await host.savePipeline(job, state, phase, false); });
      await persistence;
    }));
    try { await persistence; if (!stopped) await host.savePipeline(job, state, phase, true); }
    catch (e) { if (!e.definite) throw e; await finish("failed",safeError(e),output); }
    return;
  }
  const uncertain = state.steps.some(s => s.status === "unknown");
  if (engineError || output?.error || output?.failures?.length || runtime.failures.some(f => f.code === "replay_changed")) {
    const failure = output?.failures?.[0];
    const provider = failure && state.steps.find(s => s.kind === failure.kind && s.error?.code === failure.code)?.error;
    const e = engineError?.safeMessage ? engineError : provider || failure || engineError || output?.error;
    await finish(uncertain ? "interrupted" : "failed", safeError(e), output); return;
  }
  if (uncertain) { await finish("interrupted", safeError({ code: "outcome_unknown" }), output); return; }
  if (!output?.world) { await finish("failed", safeError({ code: "empty_document" }), output); return; }
  await finish("succeeded", null, output, true);
}
