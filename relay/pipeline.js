import { createDocumentEngine, ENGINE_SOURCE } from "./engine.generated.js";
import { snapshotWorld, commitDocument, digest } from "./pipeline-store.js";
import { runProvider } from "./providers.js";
const yieldError = () => ({ code: "pipeline_yield", serverJob: true });
const phaseFor = kind => ["check","read","ageRule"].includes(kind) ? "check" : ["fix","analyze"].includes(kind) ? "fix" : "generate";
const safeError = e => ({ code: e?.code || "pipeline_error", message: e?.safeMessage || "문서 작업을 끝내지 못해 원본을 유지했습니다. AI 작업에서 결과를 확인해 주세요.", ...(e?.status ? { httpStatus: e.status } : {}) });
const resultFor = (state, output, saved, error) => {
  const pageStep = state.steps.find(s => s.kind === "page" && s.response);
  const parts = pageStep?.response?.candidates?.[0]?.content?.parts || [];
  const text = output?.page ? JSON.stringify(output.page) : parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], pipeline: {
    version: 1, saved, wid: state.snapshot?.world.id, targetKey: output?.targetKey || state.input.key, checked: !!output?.checked,
    fixed: output?.fixed || 0, remaining: output?.remaining || 0, notFound: !!output?.notFound, redirectTo: output?.redirectTo || null,
    sceneUsed: output?.sceneUsed || "", angleRecorded: !!state.input.novel && saved,
    steps: state.steps.map(({ kind, model, status }) => ({ kind, model, status })), ...(error ? { error } : {}),
  } };
};

// replay는 순수 메모리 실행. 새 제공자 호출 하나만 먼저 기록하고 alarm 하나에서 실행한다.
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
  const running = state.steps.find(s => s.status === "running");
  if (running) { running.status = "unknown"; running.error = { code: "outcome_unknown", safeMessage: "실행 도중 서버가 중단되어 해당 AI 호출을 다시 보내지 않았습니다.", serverJob: true }; }
  let selected = null, output, engineError;
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
      if (state.steps.length >= 32) throw { code: "step_limit", serverJob: true };
      if (!selected) selected = { slot, kind, model, fingerprint, body };
      runtime.yielded = true; throw yieldError();
    },
  };
  try { output = await createDocumentEngine(runtime).execute(); }
  catch (e) { engineError = e; }
  if (runtime.failures.some(f => f.code === "replay_changed")) { await finish("interrupted",safeError({code:"replay_changed"}),output); return; }
  if (selected) {
    const { body, ...step } = selected;
    step.status = "running"; state.steps.push(step);
    if (!await host.savePipeline(job, state, phaseFor(step.kind), false)) return;
    let response, failure;
    try { response = await runProvider({ keyMode: job.keyMode, input: { type: "gemini.generate", model: step.model, input: body } }, host.env, job.personalKey, signal); }
    catch (e) { failure = { code: e?.code || "outcome_unknown", safeMessage: safeError(e).message, serverJob: true, definite: !!e?.definite, ...(e?.status ? { status: e.status } : {}) }; }
    if (failure) { step.error = failure; step.status = failure.definite ? "failed" : "unknown"; }
    else { step.response = response; step.status = "done"; }
    // 완료 기록과 다음 예약을 함께 저장한다. 응답이 불명확한 호출은 재전송하지 않는다.
    try { await host.savePipeline(job, state, phaseFor(step.kind), true); }
    catch (e) { if (!e.definite) throw e; await finish("failed",safeError(e),output); }
    return;
  }
  const uncertain = state.steps.some(s => s.status === "unknown");
  if (engineError || output?.error || output?.failures?.length || runtime.failures.some(f => f.code === "replay_changed")) {
    const e = engineError || output?.error || { code: output?.failures?.[0]?.code };
    await finish(uncertain ? "interrupted" : "failed", safeError(e), output); return;
  }
  if (uncertain) { await finish("interrupted", safeError({ code: "outcome_unknown" }), output); return; }
  if (!output?.world) { await finish("failed", safeError({ code: "empty_document" }), output); return; }
  await finish("succeeded", null, output, true);
}
