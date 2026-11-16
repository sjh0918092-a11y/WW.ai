import { isOpenAITextModel, openAIRequest, normalizeOpenAI } from './openai.js';
import { validTaskModels, validPromptOptions } from './ai-settings.js';
/* 제공자별 허용 입력과 요청. 키는 URL·오류 메시지·결과에 포함하지 않는다. */
const MODEL = /^[A-Za-z0-9._-]{1,100}$/;
const TYPES = ["gemini.generate", "claude.generate", "openai.generate", "gemini.image", "openai.image", "document.pipeline"];
const MIMES = ["image/png", "image/jpeg", "image/webp"];
const SIZES = ["1024x1024", "1152x1536", "1536x1152", "864x1536", "1536x864"];
const only = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every(k => keys.includes(k));
const reference = r => only(r, ["mimeType", "data"]) && MIMES.includes(r.mimeType) && typeof r.data === "string" && r.data.length <= 1536 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(r.data) && r.data.length % 4 === 0;
const parts = (c, image = false) => only(c, ["role", "parts"]) && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.every(p =>
  only(p, ["text"]) && typeof p.text === "string" || image && only(p, ["inlineData"]) && reference(p.inlineData));

function validMeta(m) {
  const strings = ["kind", "title", "wid", "key", "group", "worldStamp", "pageStamp", "assetStamp", "refStamp", "storyId", "storyStamp", "direction", "length"];
  return only(m, [...strings, "recoveryV", "hadPage", "entity", "rewrite"]) && JSON.stringify(m).length <= 4096 &&
    strings.every(k => m[k] === undefined || typeof m[k] === "string" && m[k].length <= (k === "direction" ? 2000 : 300)) &&
    (m.recoveryV === undefined || m.recoveryV === 1) && ["hadPage", "rewrite"].every(k => m[k] === undefined || typeof m[k] === "boolean") &&
    (m.entity === undefined || only(m.entity, ["title", "type", "summary"]) && ["title", "type", "summary"].every(k => typeof m.entity[k] === "string" && m.entity[k].length <= 300));
}

export function validateJob(b) {
  if (!b || typeof b.id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(b.id) || !TYPES.includes(b.type) || typeof b.model !== "string" || !MODEL.test(b.model)) return "작업 번호·종류·모델을 확인해 주세요.";
  if (b.meta !== undefined && !validMeta(b.meta)) return "작업 복구 정보를 확인해 주세요.";
  if (b.credential !== undefined && (!only(b.credential, ["type", "key"]) || b.credential.type !== "personal" || typeof b.credential.key !== "string" || !/^[\x21-\x7e]{8,512}$/.test(b.credential.key))) return "개인 API 키 형식을 확인해 주세요.";
  const i = b.input;
  if (b.type === "document.pipeline") return validPipeline(i) && !(b.credential && [b.model, i?.settings?.main, i?.settings?.quick, i?.settings?.check, ...Object.values(i?.settings?.taskModels || {}).map(v => v?.model)].some(m => /^claude-/.test(m || "") || isOpenAITextModel(m))) ? null : "서버 문서 작업의 대상·원본·모델 설정을 확인해 주세요.";
  if (b.type === "openai.image") {
    if (!/^gpt-image-/.test(b.model) || !only(i, ["prompt", "size", "quality", "reference"]) || typeof i.prompt !== "string" || !i.prompt.trim() || i.prompt.length > 200000 || !SIZES.includes(i.size) || !["low", "medium", "high", "auto"].includes(i.quality) || (i.reference !== undefined && !reference(i.reference))) return "OpenAI 이미지 요청·참고 이미지를 확인해 주세요.";
    return null;
  }
  if (b.type === "openai.generate" && (!isOpenAITextModel(b.model) || b.credential)) return "OpenAI 텍스트는 서버 키와 지원하는 텍스트 모델을 사용해 주세요.";
  if (b.type !== "openai.generate" && isOpenAITextModel(b.model)) return "OpenAI 작업 종류를 확인해 주세요.";
  if (b.type === "claude.generate" && (!/^claude-/.test(b.model) || b.credential)) return "Claude는 서버 키와 claude- 모델 이름을 사용해 주세요.";
  if (b.type !== "claude.generate" && /^claude-/.test(b.model)) return "Claude 작업 종류를 확인해 주세요.";
  const image = b.type === "gemini.image", config = i?.generationConfig;
  if (["claude.generate","openai.generate"].includes(b.type) && config?.thinkingConfig !== undefined &&
    (!only(config.thinkingConfig, ["thinkingLevel"]) || !["", "none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(config.thinkingConfig.thinkingLevel))) return "생각 수준을 확인해 주세요.";
  if (!only(i, ["contents", "generationConfig", "systemInstruction", "safetySettings"]) || !Array.isArray(i.contents) || !i.contents.length ||
    !i.contents.every(c => parts(c, image) && ["user", "model", undefined].includes(c.role)) ||
    (i.systemInstruction !== undefined && !parts(i.systemInstruction)) ||
    (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) ||
    (config?.responseModalities !== undefined && (!Array.isArray(config.responseModalities) || config.responseModalities.some(m => !(image ? ["TEXT", "IMAGE"] : ["TEXT"]).includes(m)))) ||
    (image && (!config?.responseModalities?.includes("IMAGE") || (config.candidateCount !== undefined && config.candidateCount !== 1))) ||
    (!image && /image|tts|live|audio|embedding|transcribe|robotics/i.test(b.model))) return "Gemini 요청 내용을 확인해 주세요. 외부 파일·도구 호출은 지원하지 않습니다.";
  return null;
}

export function usageCounts(raw) {
  const keys = ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "cachedContentTokenCount", "cacheCreationInputTokenCount", "cacheCreation5mInputTokenCount", "cacheCreation1hInputTokenCount", "cacheCreation30mInputTokenCount", "cacheCreation12hInputTokenCount"];
  if (!raw || !keys.some(k => Number.isFinite(raw[k]))) return null;
  return {...Object.fromEntries(keys.filter(k => Number.isFinite(raw[k])).map(k => [k, Math.max(0, raw[k])])), ...(raw.complete === false ? {complete:false} : {})};
}

export async function boundedText(stream, limit, onChunk) {
  if (!stream) return "";
  const reader = stream.getReader(), dec = new TextDecoder(); let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; onChunk?.(value.byteLength);
      if (size > limit) { await reader.cancel(); throw { code: "too_large" }; }
      text += dec.decode(value, { stream: true });
    }
    return text + dec.decode();
  } finally { reader.releaseLock(); }
}

async function providerError(res, model) {
  let message = "";
  try { message = JSON.parse(await boundedText(res.body, 16384))?.error?.message || ""; } catch {}
  const status = res.status;
  // 제공자의 원문은 입력이나 키를 되비출 수 있으므로 분류한 고정 메시지만 저장한다.
  let code = "api_" + status, safeMessage = "AI 서버가 요청을 완료하지 못했습니다. 설정과 사용 한도를 확인해 주세요.";
  if (/location is not supported/i.test(message)) { code = "region"; safeMessage = "AI 서버가 현재 서버의 실행 지역을 지원하지 않습니다."; }
  else if (status === 401 || status === 403) code = "bad_key";
  else if (status === 404) code = "model_not_found";
  else if (status === 429) code = "rate_limited";
  else if (status === 524) safeMessage = "AI 서버의 응답 시간이 초과되었습니다.";
  else if (status === 413 || /token count|too long|exceeds the maximum/i.test(message)) code = "prompt_too_large";
  else if (status === 400 && /think/i.test(message)) safeMessage = "선택한 thinking 설정을 지원하지 않습니다.";
  return { code, safeMessage, definite: true, status, ...(code === "model_not_found" && typeof model === "string" && MODEL.test(model) ? {model} : {}) };
}

export function serverKeyName(type, model) {
  return type === "openai.image" || type === "openai.generate" || isOpenAITextModel(model) ? "OPENAI_API_KEY" : type === "claude.generate" || /^claude-/.test(model) ? "ANTHROPIC_API_KEY" : "GEMINI_KEY";
}

// 현재 모델 선택 목록의 Claude 4.5는 수동 예산, 기존 4.6 설정은 adaptive를 사용한다.
export function claudeThinking(model, level = "") {
  if (!level) return {};
  const budgets = { minimal: 1024, low: 2048, medium: 4096, high: 8192 };
  if (!Object.hasOwn(budgets, level)) throw { code: "invalid_thinking", definite: true, safeMessage: "Claude 생각 깊이를 확인해 주세요." };
  if (/^claude-(sonnet|opus|haiku)-4-5(?:-|$)/.test(model)) return {
    thinking: { type: "enabled", budget_tokens: budgets[level] },
    ...(/^claude-opus-/.test(model) ? { output_config: { effort: level === "minimal" ? "low" : level } } : {}),
  };
  if (/^claude-(sonnet|opus)-4-6(?:-|$)/.test(model)) return {
    thinking: { type: "adaptive" }, output_config: { effort: level === "minimal" ? "low" : level },
  };
  throw { code: "unsupported_thinking", definite: true, safeMessage: "이 모델의 생각 깊이 설정은 아직 지원하지 않습니다. 기본값이나 Claude 4.5 모델을 선택해 주세요." };
}

// 서버 AI 호출의 무응답 감시. 브라우저 경로처럼 첫 응답과 도중 멈춤을 따로 본다.
// 10분 전체 제한까지 기다리지 않고, 멈춘 스트림은 확정 실패로 빨리 끝낸다. env로 조정할 수 있다.
export const FIRST_BYTE_MS = 240000, STREAM_IDLE_MS = 90000;
const watchMs = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const stalledError = (first, ms) => ({ code: first ? "no_first_response" : "stream_stalled", definite: true, safeMessage: first
  ? `AI가 ${Math.round(ms / 1000)}초 동안 첫 응답을 보내지 않아 연결을 끊었습니다. 생각 수준을 낮추거나 잠시 뒤 다시 실행해 주세요.`
  : `AI 응답이 도중에 ${Math.round(ms / 1000)}초 동안 멈춰 연결을 끊었습니다. 잠시 뒤 다시 실행해 주세요.` });
const deadlineError = () => ({ code: "deadline_exceeded", safeMessage: "서버 실행 제한(10분)을 넘어 AI 호출을 중단했습니다. 생각 수준을 낮추거나 잠시 뒤 다시 실행해 주세요." });

// trace에는 진단용 시각(시작 기준 ms)과 받은 크기만 남긴다. 본문·키는 넣지 않는다.
export async function runProvider(job, env, personalKey, signal, trace = {}) {
  const at = Date.now(), since = () => Date.now() - at;
  Object.assign(trace, { at, headers: null, first: null, last: null, end: null, bytes: 0 });
  const watched = ["gemini.generate", "claude.generate", "openai.generate"].includes(job.input?.type || "gemini.generate");
  const firstMs = watchMs(env?.AI_FIRST_BYTE_MS, FIRST_BYTE_MS), idleMs = watchMs(env?.AI_STREAM_IDLE_MS, STREAM_IDLE_MS);
  const ctl = new AbortController(), forward = () => ctl.abort(signal.reason);
  if (signal?.aborted) forward(); else signal?.addEventListener("abort", forward, { once: true });
  let stalled = null, timer = null;
  const arm = ms => { clearTimeout(timer); if (watched) timer = setTimeout(() => { stalled = stalledError(trace.first === null, ms); ctl.abort("stalled"); }, ms); };
  const onChunk = bytes => { const t = since(); if (trace.first === null) trace.first = t; trace.last = t; trace.bytes += bytes; arm(idleMs); };
  arm(firstMs);
  try { return await callProvider(job, env, personalKey, ctl.signal, trace, since, onChunk); }
  catch (e) {
    const out = stalled || (signal?.aborted && signal.reason === "deadline" ? deadlineError() : e);
    trace.code = out?.code || (signal?.aborted ? "cancelled" : "outcome_unknown");
    throw out;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", forward); trace.end = since(); }
}

async function callProvider(job, env, personalKey, signal, trace, since, onChunk) {
  const { type = "gemini.generate", model, input } = job.input;
  const claude = type === "claude.generate" || type === "gemini.generate" && /^claude-/.test(model);
  const openai = type === "openai.generate" || type === "gemini.generate" && isOpenAITextModel(model);
  if ((claude || openai) && job.keyMode === "personal") throw { code: "server_key_missing", definite: true };
  const key = job.keyMode === "personal" ? personalKey : env[serverKeyName(type, model)];
  if (!key) throw { code: "server_key_missing", definite: true };
  let url, headers, body, explicit = null;
  if (type === "openai.image") {
    const { reference: ref, ...values } = input;
    const fields = { ...values, model, n: 1, output_format: "png" };
    url = "https://api.openai.com/v1/images/" + (ref ? "edits" : "generations");
    headers = { Authorization: "Bearer " + key };
    if (ref) {
      body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.append(k, String(v));
      body.append("image[]", new Blob([Uint8Array.from(atob(ref.data), c => c.charCodeAt(0))], { type: ref.mimeType }), "reference." + ref.mimeType.split("/")[1]);
    } else { body = JSON.stringify(fields); headers["Content-Type"] = "application/json"; }
  } else if (openai) {
    url = "https://api.openai.com/v1/responses";
    headers = { "Content-Type":"application/json", Authorization:"Bearer "+key };
    body = JSON.stringify({ ...openAIRequest(model,input), stream: true });
  } else if (claude) {
    url = "https://api.anthropic.com/v1/messages";
    headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
    const messages = input.contents.map(c => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map(p => ({ type: "text", text: p.text })) }));
    const system = (input.systemInstruction?.parts || []).map(p => p.text).join("\n");
    const json = input.generationConfig?.responseMimeType === "application/json";
    body = JSON.stringify({ model, max_tokens: 16384, stream: true, ...claudeThinking(model, input.generationConfig?.thinkingConfig?.thinkingLevel), messages, ...(system || json ? { system: [system, json ? "Return only a valid JSON value. Do not wrap it in Markdown fences." : ""].filter(Boolean).join("\n\n") } : {}) });
  } else {
    // 텍스트는 스트리밍으로 받는다. 일괄 응답은 생성이 끝날 때까지 응답 헤더가 없어
    // 긴 본문·사고가 100초를 넘으면 Cloudflare가 연결을 끊고 HTTP 524를 돌려준다.
    const streamed = type === "gemini.generate";
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + (streamed ? ":streamGenerateContent?alt=sse" : ":generateContent");
    headers = { "Content-Type": "application/json", "x-goog-api-key": key }; body = JSON.stringify(input);
    if (streamed) explicit = await geminiExplicitCache(model, input, key, job.keyMode, env, signal);
  }
  let res = await fetch(url, { method: "POST", headers, body: explicit ? explicit.body : body, signal });
  // 명시적 캐시가 만료·삭제됐거나 거절되면 캐시를 버리고 같은 요청을 캐시 없이 한 번 보낸다(생성 전 거절이라 중복 과금이 없다).
  if (explicit && !res.ok && [400, 403, 404].includes(res.status)) {
    const text = await res.text().catch(() => "");
    if (res.status === 404 || /cach/i.test(text)) { explicit.drop(); res = await fetch(url, { method: "POST", headers, body, signal }); }
    else res = new Response(text, { status: res.status, headers: res.headers });   // 캐시와 무관한 거절(생각 설정 등)은 원래 오류 처리로 넘긴다
  }
  trace.headers = since(); trace.httpStatus = res.status;
  if (!res.ok) throw await providerError(res, model);
  const text = await boundedText(res.body, type.endsWith(".image") ? 20 * 1024 * 1024 : 4 * 1024 * 1024, onChunk);
  let result;
  if (/:streamGenerateContent/.test(url)) result = mergeGeminiStream(text);
  else if (openai) result = mergeOpenAIStream(text);
  else if (claude) result = mergeClaudeStream(text);
  else try { result = JSON.parse(text); } catch { throw { code: "invalid_response" }; }
  if (openai) result = normalizeOpenAI(result);
  if (claude) {
    if (!Array.isArray(result?.content) || !result.content.some(p => p.type === "text" && p.text)) throw { code: "empty_response", definite: true };
    if (!["end_turn", "max_tokens", "stop_sequence"].includes(result.stop_reason)) throw { code: "invalid_response", definite: true };
    result = { candidates: [{ content: { parts: result.content.filter(p => p.type === "text").map(p => ({ text: p.text })) }, finishReason: result.stop_reason === "max_tokens" ? "MAX_TOKENS" : "STOP" }], usageMetadata: result.usage ? {
      promptTokenCount: (result.usage.input_tokens || 0) + (result.usage.cache_read_input_tokens || 0) + (result.usage.cache_creation_input_tokens || 0),
      candidatesTokenCount: Math.max(0, (result.usage.output_tokens || 0) - (result.usage.output_tokens_details?.thinking_tokens || 0)),
      thoughtsTokenCount: result.usage.output_tokens_details?.thinking_tokens || 0,
      cachedContentTokenCount: result.usage.cache_read_input_tokens || 0,
      cacheCreationInputTokenCount: result.usage.cache_creation_input_tokens || 0,
      cacheCreation5mInputTokenCount: result.usage.cache_creation?.ephemeral_5m_input_tokens || 0,
      cacheCreation1hInputTokenCount: result.usage.cache_creation?.ephemeral_1h_input_tokens || 0,
    } : undefined };
  }
  if (!result || (type === "openai.image" ? !Array.isArray(result.data) || !result.data.length : (!Array.isArray(result.candidates) || !result.candidates.length) && !result.promptFeedback?.blockReason)) throw { code: "empty_response", definite: true };
  return result;
}

// Gemini 명시적 캐시. 자동(암묵) 캐시는 같은 앞부분이어도 적중이 보장되지 않아,
// 캐시 경계로 나뉜 요청의 앞 조각들을 cachedContents로 저장하고 요청은 마지막 조각만 보낸다.
// 15분 유지, 쓸 때 남은 시간이 10분 아래면 15분으로 연장. 키·모델·내용 해시별로 이 실행 환경 메모리에 둔다.
// 만들거나 쓰다 실패하면 일반 요청으로 보낸다. env.GEMINI_EXPLICIT_CACHE = "off"이면 쓰지 않는다.
const geminiCaches = new Map(), cacheRefused = new Map();   // cacheRefused: 캐시를 만들 수 없던 모델은 10분간 다시 시도하지 않는다
const CACHE_TTL_S = 900, GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/";
const sha = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, "0")).join("").slice(0, 24);
async function geminiExplicitCache(model, input, key, keyMode, env, signal) {
  const parts = input?.contents?.[0]?.parts;
  if (env?.GEMINI_EXPLICIT_CACHE === "off" || /^gemini-4/.test(model) || (cacheRefused.get(model) || 0) > Date.now() || input.systemInstruction || input.contents[0].role === "model" || !Array.isArray(parts) || parts.length < 2) return null;
  const stable = parts.slice(0, -1), text = stable.map(p => p.text || "").join("");
  if (text.length < 6000) return null;
  const id = (await sha(keyMode + ":" + key)).slice(0, 10) + ":" + model + ":" + await sha(text);   // 키가 다르면(개인 키·서버 키 교체) 캐시를 섞지 않는다
  const headers = { "Content-Type": "application/json", "x-goog-api-key": key };
  const create = async () => {
    const res = await fetch(GEMINI_API + "cachedContents", { method: "POST", headers, signal,
      body: JSON.stringify({ model: "models/" + model, contents: [{ role: "user", parts: stable }], ttl: CACHE_TTL_S + "s" }) });
    if (!res.ok) { try { await res.body?.cancel(); } catch {} throw new Error("cache " + res.status); }
    const out = await res.json(); if (typeof out?.name !== "string") throw new Error("cache name");
    return { name: out.name, expiresAt: Date.parse(out.expireTime) || Date.now() + CACHE_TTL_S * 1000 };
  };
  let entry = geminiCaches.has(id) ? await geminiCaches.get(id).catch(() => null) : null;
  if (!entry || entry.expiresAt - Date.now() < 60000) {
    const pending = create(); geminiCaches.set(id, pending);
    while (geminiCaches.size > 50) geminiCaches.delete(geminiCaches.keys().next().value);
    entry = await pending.catch(() => null);
    if (!entry) { geminiCaches.delete(id); cacheRefused.set(model, Date.now() + 600000); return null; }
  } else if (entry.expiresAt - Date.now() < 600000) {
    try {
      const res = await fetch(GEMINI_API + entry.name + "?updateMask=ttl", { method: "PATCH", headers, signal, body: JSON.stringify({ ttl: CACHE_TTL_S + "s" }) });
      if (res.ok) { const out = await res.json().catch(() => ({})); entry.expiresAt = Date.parse(out.expireTime) || Date.now() + CACHE_TTL_S * 1000; } else { try { await res.body?.cancel(); } catch {} }
    } catch {}
  }
  const rest = { ...input, contents: [{ role: "user", parts: parts.slice(-1) }, ...input.contents.slice(1)] };
  return { body: JSON.stringify({ ...rest, cachedContent: entry.name }), drop: () => geminiCaches.delete(id) };
}

// 캐시 진단용: 앞부분(캐시 대상)의 실제 토큰 수. Gemini countTokens는 생성 요금이 없다. 실패하면 null.
export async function countGeminiTokens(model, text, env, keyMode, personalKey, signal) {
  const key = keyMode === "personal" ? personalKey : env.GEMINI_KEY;
  if (!key || /^claude-/.test(model) || isOpenAITextModel(model)) return null;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":countTokens", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal,
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }] }) });
    if (!res.ok) return null;
    const n = (await res.json())?.totalTokens; return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// SSE의 data 줄을 JSON으로 읽는다. 스트림이 아닌 JSON 본문이면 null을 돌려 호출자가 그대로 쓰게 한다.
function sseEvents(text) {
  if (/^[\[{]/.test(text.trim())) return null;
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
    try { events.push(JSON.parse(raw)); } catch { throw { code: "invalid_response" }; }
  }
  if (!events.length) throw { code: "invalid_response" };
  return events;
}
const plainJson = text => { try { return JSON.parse(text); } catch { throw { code: "invalid_response" }; } };
const cutOff = () => ({ code: "incomplete_response", safeMessage: "AI 응답이 완료 신호 없이 끊겼습니다. 중복 실행을 피하려고 자동으로 다시 보내지 않았습니다." });
const streamError = () => ({ code: "upstream_error", definite: true, safeMessage: "AI 서버가 응답 도중 오류를 보냈습니다. 잠시 뒤 다시 시도해 주세요." });

// OpenAI Responses 스트림은 마지막 completed/incomplete 이벤트에 전체 응답을 담는다.
export function mergeOpenAIStream(text) {
  const events = sseEvents(text); if (!events) return plainJson(text);
  let final = null;
  for (const e of events) {
    if (e?.type === "error" || e?.type === "response.failed") throw streamError();
    if (["response.completed", "response.incomplete"].includes(e?.type) && e.response) final = e.response;
  }
  if (!final) throw cutOff();
  return final;
}

// Claude Messages 스트림을 일괄 응답과 같은 message 객체로 되살린다. 사고 블록은 버린다.
export function mergeClaudeStream(text) {
  const events = sseEvents(text); if (!events) return plainJson(text);
  let message = null, stopped = false; const blocks = [];
  for (const e of events) {
    if (e?.type === "error") throw streamError();
    if (e?.type === "message_start" && e.message) message = { ...e.message, content: [], usage: { ...(e.message.usage || {}) } };
    else if (e?.type === "content_block_start" && Number.isInteger(e.index)) blocks[e.index] = { ...e.content_block, ...(e.content_block?.type === "text" ? { text: e.content_block.text || "" } : {}) };
    else if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && blocks[e.index]?.type === "text") blocks[e.index].text += e.delta.text || "";
    else if (e?.type === "message_delta" && message) {
      if (e.delta && "stop_reason" in e.delta) message.stop_reason = e.delta.stop_reason;
      if (e.usage) for (const [k, v] of Object.entries(e.usage)) if (v !== null && v !== undefined) message.usage[k] = v;
    } else if (e?.type === "message_stop") stopped = true;
  }
  if (!message || !stopped) throw cutOff();
  message.content = blocks.filter(b => b?.type === "text");
  return message;
}

// SSE(또는 JSON 배열) 조각을 generateContent 한 번의 응답 형태로 합친다. 사고 요약 조각은 버린다.
export function mergeGeminiStream(text) {
  let chunks;
  const trimmed = text.trim();
  if (/^[\[{]/.test(trimmed)) { try { chunks = [].concat(JSON.parse(trimmed)); } catch { throw { code: "invalid_response" }; } }
  else {
    chunks = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
      try { chunks.push(JSON.parse(raw)); } catch { throw { code: "invalid_response" }; }
    }
  }
  if (!chunks.length) throw { code: "invalid_response" };
  let out = "", finishReason = "", candidate = null, promptFeedback, usageMetadata, modelVersion;
  for (const c of chunks) {
    if (c?.error) throw { code: "upstream_error", definite: true, safeMessage: "AI 서버가 응답 도중 오류를 보냈습니다. 잠시 뒤 다시 시도해 주세요." };
    if (c?.promptFeedback) promptFeedback = c.promptFeedback;
    if (c?.usageMetadata) usageMetadata = c.usageMetadata;
    if (c?.modelVersion) modelVersion = c.modelVersion;
    const cand = c?.candidates?.[0]; if (!cand) continue;
    candidate = cand;
    if (cand.finishReason) finishReason = cand.finishReason;
    for (const p of cand.content?.parts || []) if (typeof p.text === "string" && !p.thought) out += p.text;
  }
  // 완료 신호 없이 끊긴 응답은 과금 여부와 내용 완결을 알 수 없으므로 성공으로 저장하지 않는다.
  if (!finishReason && !promptFeedback?.blockReason) throw { code: "incomplete_response", safeMessage: "AI 응답이 완료 신호 없이 끊겼습니다. 중복 실행을 피하려고 자동으로 다시 보내지 않았습니다." };
  const { content, ...rest } = candidate || {};
  return {
    ...(candidate ? { candidates: [{ ...rest, content: { role: content?.role || "model", parts: [{ text: out }] }, finishReason }] } : {}),
    ...(promptFeedback ? { promptFeedback } : {}), ...(usageMetadata ? { usageMetadata } : {}), ...(modelVersion ? { modelVersion } : {}),
  };
}

function validPipeline(i) {
  const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  const settings = ["main", "quick", "check", "mainThink", "quickThink", "checkThink", "preCheck", "taskModels", "prompt"];
  return only(i, ["action", "wid", "key", "rewrite", "direction", "novel", "angleId", "entity", "settings", "worldHash", "pageHash"]) &&
    ["generate", "check"].includes(i.action) && str(i.wid,200) && str(i.key,200) && [i.worldHash,i.pageHash].every(h => /^[a-f0-9]{64}$/.test(h)) &&
    ["rewrite","novel"].every(k => i[k] === undefined || typeof i[k] === "boolean") &&
    (i.direction === undefined || typeof i.direction === "string" && i.direction.length <= 10000) && (i.angleId === undefined || str(i.angleId,200)) &&
    (i.entity === undefined || only(i.entity,["title","type","summary","src","searched"]) && str(i.entity.title,300) && typeof i.entity.type === "string" && i.entity.type.length <= 100 && typeof i.entity.summary === "string" && i.entity.summary.length <= 2000 && (i.entity.src === undefined || i.entity.src === "search" || i.entity.src === "discovery") && (i.entity.searched === undefined || typeof i.entity.searched === "boolean")) &&
    only(i.settings,settings) && settings.every(k => i.settings[k] === undefined || (k === "taskModels" ? validTaskModels(i.settings[k]) : k === "prompt" ? validPromptOptions(i.settings[k]) : k === "preCheck" ? typeof i.settings[k] === "boolean" : k.endsWith("Think") ? ["", "none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(i.settings[k]) : i.settings[k] === "" || MODEL.test(i.settings[k]) && !/image|tts|live|audio|embedding|transcribe|robotics/i.test(i.settings[k])));
}
