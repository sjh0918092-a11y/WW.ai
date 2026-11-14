/* 제공자별 허용 입력과 요청. 키는 URL·오류 메시지·결과에 포함하지 않는다. */
const MODEL = /^[A-Za-z0-9._-]{1,100}$/;
const TYPES = ["gemini.generate", "gemini.image", "openai.image"];
const MIMES = ["image/png", "image/jpeg", "image/webp"];
const SIZES = ["1024x1024", "1152x1536", "1536x1152", "864x1536", "1536x864"];
const only = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every(k => keys.includes(k));
const reference = r => only(r, ["mimeType", "data"]) && MIMES.includes(r.mimeType) && typeof r.data === "string" && r.data.length <= 1536 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(r.data) && r.data.length % 4 === 0;
const parts = (c, image = false) => only(c, ["role", "parts"]) && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.every(p =>
  only(p, ["text"]) && typeof p.text === "string" || image && only(p, ["inlineData"]) && reference(p.inlineData));

export function validateJob(b) {
  if (!b || typeof b.id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(b.id) || !TYPES.includes(b.type) || typeof b.model !== "string" || !MODEL.test(b.model)) return "작업 번호·종류·모델을 확인해 주세요.";
  if (b.credential !== undefined && (!only(b.credential, ["type", "key"]) || b.credential.type !== "personal" || typeof b.credential.key !== "string" || !/^[\x21-\x7e]{8,512}$/.test(b.credential.key))) return "개인 API 키 형식을 확인해 주세요.";
  const i = b.input;
  if (b.type === "openai.image") {
    if (!b.credential || !/^gpt-image-/.test(b.model) || !only(i, ["prompt", "size", "quality", "reference"]) || typeof i.prompt !== "string" || !i.prompt.trim() || i.prompt.length > 200000 || !SIZES.includes(i.size) || !["low", "medium", "high", "auto"].includes(i.quality) || (i.reference !== undefined && !reference(i.reference))) return "OpenAI 이미지 요청·개인 키·참고 이미지를 확인해 주세요.";
    return null;
  }
  const image = b.type === "gemini.image", config = i?.generationConfig;
  if (!only(i, ["contents", "generationConfig", "systemInstruction", "safetySettings"]) || !Array.isArray(i.contents) || !i.contents.length ||
    !i.contents.every(c => parts(c, image) && ["user", "model", undefined].includes(c.role)) ||
    (i.systemInstruction !== undefined && !parts(i.systemInstruction)) ||
    (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) ||
    (config?.responseModalities !== undefined && (!Array.isArray(config.responseModalities) || config.responseModalities.some(m => !(image ? ["TEXT", "IMAGE"] : ["TEXT"]).includes(m)))) ||
    (image && (!config?.responseModalities?.includes("IMAGE") || (config.candidateCount !== undefined && config.candidateCount !== 1))) ||
    (!image && /image|tts|live|audio|embedding|transcribe|robotics/i.test(b.model))) return "Gemini 요청 내용을 확인해 주세요. 외부 파일·도구 호출은 지원하지 않습니다.";
  return null;
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

async function providerError(res) {
  let message = "";
  try { message = JSON.parse(await boundedText(res.body, 16384))?.error?.message || ""; } catch {}
  const status = res.status;
  // 제공자의 원문은 입력이나 키를 되비출 수 있으므로 분류한 고정 메시지만 저장한다.
  let code = "api_" + status, safeMessage = "AI 서버가 요청을 완료하지 못했습니다. 설정과 사용 한도를 확인해 주세요.";
  if (/location is not supported/i.test(message)) { code = "region"; safeMessage = "AI 서버가 현재 서버의 실행 지역을 지원하지 않습니다."; }
  else if (status === 401 || status === 403) code = "bad_key";
  else if (status === 404) code = "model_not_found";
  else if (status === 429) code = "rate_limited";
  else if (status === 413 || /token count|too long|exceeds the maximum/i.test(message)) code = "prompt_too_large";
  else if (status === 400 && /think/i.test(message)) safeMessage = "선택한 thinking 설정을 지원하지 않습니다.";
  return { code, safeMessage, definite: true, status };
}

export async function runProvider(job, env, personalKey, signal) {
  const { type = "gemini.generate", model, input } = job.input;
  const key = job.keyMode === "personal" ? personalKey : env.GEMINI_KEY;
  if (!key) throw { code: "server_key_missing", definite: true };
  let url, headers, body;
  if (type === "openai.image") {
    if (job.keyMode !== "personal") throw { code: "server_key_missing", definite: true };
    const { reference: ref, ...values } = input;
    const fields = { ...values, model, n: 1, output_format: "png" };
    url = "https://api.openai.com/v1/images/" + (ref ? "edits" : "generations");
    headers = { Authorization: "Bearer " + key };
    if (ref) {
      body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.append(k, String(v));
      body.append("image[]", new Blob([Uint8Array.from(atob(ref.data), c => c.charCodeAt(0))], { type: ref.mimeType }), "reference." + ref.mimeType.split("/")[1]);
    } else { body = JSON.stringify(fields); headers["Content-Type"] = "application/json"; }
  } else {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    headers = { "Content-Type": "application/json", "x-goog-api-key": key }; body = JSON.stringify(input);
  }
  const res = await fetch(url, { method: "POST", headers, body, signal });
  if (!res.ok) throw await providerError(res);
  const text = await boundedText(res.body, type.endsWith(".image") ? 20 * 1024 * 1024 : 4 * 1024 * 1024);
  let result;
  try { result = JSON.parse(text); } catch { throw { code: "invalid_response" }; }
  if (!result || (type === "openai.image" ? !Array.isArray(result.data) || !result.data.length : (!Array.isArray(result.candidates) || !result.candidates.length) && !result.promptFeedback?.blockReason)) throw { code: "empty_response", definite: true };
  return result;
}
