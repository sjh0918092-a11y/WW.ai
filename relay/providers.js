import { validTaskModels, validPromptOptions } from './ai-settings.js';
/* 제공자별 허용 입력과 요청. 키는 URL·오류 메시지·결과에 포함하지 않는다. */
const MODEL = /^[A-Za-z0-9._-]{1,100}$/;
const TYPES = ["gemini.generate", "claude.generate", "gemini.image", "openai.image", "document.pipeline"];
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
  if (b.type === "document.pipeline") return validPipeline(i) && !(b.credential && [b.model, i?.settings?.main, i?.settings?.quick, i?.settings?.check, ...Object.values(i?.settings?.taskModels || {}).map(v => v?.model)].some(m => /^claude-/.test(m || ""))) ? null : "서버 문서 작업의 대상·원본·모델 설정을 확인해 주세요.";
  if (b.type === "openai.image") {
    if (!/^gpt-image-/.test(b.model) || !only(i, ["prompt", "size", "quality", "reference"]) || typeof i.prompt !== "string" || !i.prompt.trim() || i.prompt.length > 200000 || !SIZES.includes(i.size) || !["low", "medium", "high", "auto"].includes(i.quality) || (i.reference !== undefined && !reference(i.reference))) return "OpenAI 이미지 요청·참고 이미지를 확인해 주세요.";
    return null;
  }
  if (b.type === "claude.generate" && (!/^claude-/.test(b.model) || b.credential)) return "Claude는 서버 키와 claude- 모델 이름을 사용해 주세요.";
  if (b.type !== "claude.generate" && /^claude-/.test(b.model)) return "Claude 작업 종류를 확인해 주세요.";
  const image = b.type === "gemini.image", config = i?.generationConfig;
  if (b.type === "claude.generate" && config?.thinkingConfig !== undefined &&
    (!only(config.thinkingConfig, ["thinkingLevel"]) || !["", "minimal", "low", "medium", "high"].includes(config.thinkingConfig.thinkingLevel))) return "Claude 생각 깊이를 확인해 주세요.";
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
  const keys = ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "cachedContentTokenCount", "cacheCreationInputTokenCount", "cacheCreation5mInputTokenCount", "cacheCreation1hInputTokenCount"];
  if (!raw || !keys.some(k => Number.isFinite(raw[k]))) return null;
  return Object.fromEntries(keys.filter(k => Number.isFinite(raw[k])).map(k => [k, Math.max(0, raw[k])]));
}

export async function boundedText(stream, limit) {
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
  return type === "openai.image" ? "OPENAI_API_KEY" : type === "claude.generate" || /^claude-/.test(model) ? "ANTHROPIC_API_KEY" : "GEMINI_KEY";
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

export async function runProvider(job, env, personalKey, signal) {
  const { type = "gemini.generate", model, input } = job.input;
  const claude = type === "claude.generate" || type === "gemini.generate" && /^claude-/.test(model);
  if (claude && job.keyMode === "personal") throw { code: "server_key_missing", definite: true };
  const key = job.keyMode === "personal" ? personalKey : env[serverKeyName(type, model)];
  if (!key) throw { code: "server_key_missing", definite: true };
  let url, headers, body;
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
  } else if (claude) {
    url = "https://api.anthropic.com/v1/messages";
    headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
    const messages = input.contents.map(c => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map(p => ({ type: "text", text: p.text })) }));
    const system = (input.systemInstruction?.parts || []).map(p => p.text).join("\n");
    const json = input.generationConfig?.responseMimeType === "application/json";
    body = JSON.stringify({ model, max_tokens: 16384, ...claudeThinking(model, input.generationConfig?.thinkingConfig?.thinkingLevel), messages, ...(system || json ? { system: [system, json ? "Return only a valid JSON value. Do not wrap it in Markdown fences." : ""].filter(Boolean).join("\n\n") } : {}) });
  } else {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    headers = { "Content-Type": "application/json", "x-goog-api-key": key }; body = JSON.stringify(input);
  }
  const res = await fetch(url, { method: "POST", headers, body, signal });
  if (!res.ok) throw await providerError(res, model);
  const text = await boundedText(res.body, type.endsWith(".image") ? 20 * 1024 * 1024 : 4 * 1024 * 1024);
  let result;
  try { result = JSON.parse(text); } catch { throw { code: "invalid_response" }; }
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

function validPipeline(i) {
  const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  const settings = ["main", "quick", "check", "mainThink", "quickThink", "checkThink", "preCheck", "taskModels", "prompt"];
  return only(i, ["action", "wid", "key", "rewrite", "direction", "novel", "angleId", "entity", "settings", "worldHash", "pageHash"]) &&
    ["generate", "check"].includes(i.action) && str(i.wid,200) && str(i.key,200) && [i.worldHash,i.pageHash].every(h => /^[a-f0-9]{64}$/.test(h)) &&
    ["rewrite","novel"].every(k => i[k] === undefined || typeof i[k] === "boolean") &&
    (i.direction === undefined || typeof i.direction === "string" && i.direction.length <= 10000) && (i.angleId === undefined || str(i.angleId,200)) &&
    (i.entity === undefined || only(i.entity,["title","type","summary","src","searched"]) && str(i.entity.title,300) && typeof i.entity.type === "string" && i.entity.type.length <= 100 && typeof i.entity.summary === "string" && i.entity.summary.length <= 2000 && (i.entity.src === undefined || i.entity.src === "search" || i.entity.src === "discovery") && (i.entity.searched === undefined || typeof i.entity.searched === "boolean")) &&
    only(i.settings,settings) && settings.every(k => i.settings[k] === undefined || (k === "taskModels" ? validTaskModels(i.settings[k]) : k === "prompt" ? validPromptOptions(i.settings[k]) : k === "preCheck" ? typeof i.settings[k] === "boolean" : k.endsWith("Think") ? ["", "minimal", "low", "medium", "high"].includes(i.settings[k]) : i.settings[k] === "" || MODEL.test(i.settings[k]) && !/image|tts|live|audio|embedding|transcribe|robotics/i.test(i.settings[k])));
}
