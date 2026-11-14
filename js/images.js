"use strict";
/* 문서 이미지 업로드·생성 */
/* ---------- 문서 이미지 업로드: 브라우저에서 축소하고 문서와 함께 저장 ---------- */
const PORTRAIT_MAX = 1536 * 1024;   // data URL 전체 길이. 참조 이미지도 기존 중계 서버의 2MB 요청 한도에 맞춘다
const portraitSrc = p => typeof p?.portrait === "string" && p.portrait.length <= PORTRAIT_MAX && /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(p.portrait) ? p.portrait : "";
async function preparePortrait(file) {
  if (!/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(file.type)) throw new Error("JPG, PNG, WebP, GIF, AVIF 이미지 파일을 선택해 주세요.");
  if (file.size > 10 * 1024 * 1024) throw new Error("이미지는 10MB 이하로 선택해 주세요.");
  const url = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("이미지를 읽지 못했습니다. 다른 이미지 파일을 선택해 주세요.")); img.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || w * h > 40e6) throw new Error("이미지 해상도가 너무 큽니다. 크기를 줄인 뒤 선택해 주세요.");
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서 이미지를 처리하지 못했습니다.");
    let scale = Math.min(1, 2048 / Math.max(w, h));
    for (let i = 0; i < 6; i++, scale *= .8) {
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [.9, .82, .72]) {
        const src = canvas.toDataURL("image/webp", quality);
        if (portraitSrc({ portrait: src })) return src;
      }
    }
    throw new Error("이미지를 저장할 크기로 줄이지 못했습니다. 더 작은 파일을 선택해 주세요.");
  } finally { URL.revokeObjectURL(url); }
}
const portraitBusy = k => S.discovery?.busy || (S.proseGen?.saving && S.proseGen.key === k) || S.gen || S.storyGen || S.syncing === k || S.checking === k || S.fixing || S.bgSync === k || (S.imageGen?.busy && S.imageGen.key === k) || isHeld(k);
async function setPortrait(k, file) {
  const w = S.world, p = S.pages[k];
  if (!w || !p) return;
  if (S.portraitJob || portraitBusy(k)) { toast("문서 작업이 끝난 뒤 이미지를 변경해 주세요."); return; }
  const job = S.portraitJob = { wid: w.id, key: k };
  renderMain();
  try {
    const src = file ? await preparePortrait(file) : "";
    if (S.world !== w || S.pages[k] !== p || portraitBusy(k)) { toast("문서가 바뀌었습니다. 이미지를 다시 선택해 주세요."); return; }
    const next = { ...p };
    if (src) next.portrait = src; else delete next.portrait;
    await Store.savePage(w.id, next);
    if (S.world === w && S.pages[k] === p) S.pages[k] = next;
    toast(src ? "프로필 이미지를 저장했습니다." : "프로필 이미지를 삭제했습니다.");
  } catch (err) { toast("이미지를 저장하지 못했습니다. " + (err.message || errMsg(err))); }
  finally {
    if (S.portraitJob === job) S.portraitJob = null;
    if (S.world === w && S.view.name === "article" && S.view.key === k && !S.edit) renderMain();
  }
}
function portraitHtml(p) {
  const src = portraitSrc(p);
  return src ? `<div class="portrait">${imageZoomHtml(src, p.title + (p.type === "인물" ? " 프로필 이미지" : " 문서 이미지"))}</div>` : "";
}
function imageZoomHtml(src, title, preview = false) {
  return `<button type="button" class="image-open" data-image-view aria-label="${esc(title)} 확대 보기" title="눌러서 크게 보기"><img ${preview ? 'class="preview"' : ""} src="${esc(src)}" alt="${esc(title)}" decoding="async"></button>`;
}
let imageViewer = null;
function openImageViewer(src, title, trigger) {
  if (!portraitSrc({ portrait: src })) return;
  if (!imageViewer) {
    const dialog = imageViewer = document.createElement("dialog");
    dialog.className = "image-viewer"; dialog.setAttribute("aria-label", "이미지 확대 보기");
    dialog.innerHTML = '<header><strong></strong><button type="button" class="btn" data-viewer-zoom aria-pressed="false">100% 크기</button><button type="button" class="btn" data-viewer-close autofocus>닫기</button></header><div class="image-stage"><img class="viewer-image" alt="" draggable="false"></div>';
    document.body.appendChild(dialog);
    const zoom = () => {
      const original = dialog.classList.toggle("original"), button = dialog.querySelector("[data-viewer-zoom]"), stage = dialog.querySelector(".image-stage");
      button.textContent = original ? "화면에 맞춤" : "100% 크기"; button.setAttribute("aria-pressed", String(original));
      requestAnimationFrame(() => { stage.scrollLeft = original ? (stage.scrollWidth - stage.clientWidth) / 2 : 0; stage.scrollTop = original ? (stage.scrollHeight - stage.clientHeight) / 2 : 0; });
    };
    dialog.addEventListener("click", ev => {
      ev.stopPropagation();
      if (ev.target.closest("[data-viewer-close]")) dialog.close();
      else if (ev.target.closest("[data-viewer-zoom]") || ev.target.classList.contains("viewer-image")) zoom();
      else if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close(); }
    });
    dialog.addEventListener("close", () => {
      document.body.style.overflow = dialog._bodyOverflow; document.documentElement.style.overflow = dialog._rootOverflow;
      dialog.querySelector("img").removeAttribute("src");
      (dialog._trigger?.isConnected ? dialog._trigger : document.querySelector("[data-image-view]"))?.focus({ preventScroll: true });
    });
  }
  const dialog = imageViewer;
  dialog._trigger = trigger;
  dialog.classList.remove("original"); dialog.querySelector("[data-viewer-zoom]").textContent = "100% 크기"; dialog.querySelector("[data-viewer-zoom]").setAttribute("aria-pressed", "false");
  dialog.querySelector("strong").textContent = title; const img = dialog.querySelector("img"); img.alt = title; img.src = src;
  if (!dialog.open) {
    dialog._bodyOverflow = document.body.style.overflow; dialog._rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; dialog.showModal();
  }
}
function portraitMenuHtml(p, k, held) {
  const src = portraitSrc(p), busy = S.portraitJob?.key === k && S.portraitJob?.wid === S.world.id;
  const disabled = held || S.portraitJob || portraitBusy(k) ? "disabled" : "";
  return `<details class="portrait-menu"><summary class="btn">${busy ? "이미지 저장 중…" : p.type === "인물" ? "프로필 이미지" : "문서 이미지"}</summary>
    <div class="portrait-actions"><button type="button" class="btn" data-image-open="${k}" ${disabled}>AI로 생성</button><button type="button" class="btn" data-portrait="${k}" ${disabled}>${src ? "이미지 변경" : "이미지 추가"}</button>${src ? `<button type="button" class="btn dng" data-portrait-remove="${k}" ${disabled}>이미지 삭제</button>` : ""}</div>
    <input type="file" data-portrait-file="${k}" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="${esc(p.title)} 프로필 이미지 선택" hidden></details>`;
}

/* ---------- 문서 이미지 생성: 한 장씩 미리 본 뒤 적용 ---------- */
const IMAGE_MODELS = [
  { id: "gpt-image-2.5-flare", label: "OpenAI · GPT Image 2.5 Flare" },
  { id: "gpt-image-2.5-sunburst", label: "OpenAI · GPT Image 2.5 Sunburst" },
  { id: "gemini-nano-banana-2.1", label: "Nano Banana 2.1", price: .0336 },
  { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite", price: .0336 },
  { id: "gemini-3-pro-image", label: "Nano Banana Pro", price: .134 }
];
const IMAGE_STYLES = ["세계관 지침 따름", "실사", "애니메이션", "웹툰", "유화", "수채화", "픽셀아트", "3D 렌더"];
const imageDocStamp = p => JSON.stringify([p.title, p.type, p.summary, p.infobox, p.sections]);
const openAIImage = model => /^gpt-image-/.test(model || "");
const imageReady = model => openAIImage(model) ? !!GS.openaiKey : gReady();
const imageSetupHint = model => openAIImage(model) ? "AI 연결 설정에서 OpenAI API 키를 저장해 주세요. ChatGPT 구독과 별도로 API 사용료가 청구됩니다." : "AI 연결 설정에서 이미지 생성이 가능한 Gemini API 연결을 저장해 주세요.";
const imageSizeFor = ratio => ({ "1:1": "1024x1024", "3:4": "1152x1536", "4:3": "1536x1152", "9:16": "864x1536", "16:9": "1536x864" })[ratio] || "1024x1024";
const serverImageJob = model => typeof AIJobs !== "undefined" && AIJobs.enabled(openAIImage(model) ? "openai" : "gemini");
async function openAIImageFetch(model, prompt, ref, o, signal) {
  const size = imageSizeFor(o.ratio);
  const values = { model, prompt, n: 1, size, quality: o.quality || "high", output_format: "png" };
  let body, endpoint = "generations", headers = { Authorization: "Bearer " + GS.openaiKey };
  if (ref) {
    endpoint = "edits"; body = new FormData();
    for (const [k, v] of Object.entries(values)) body.append(k, String(v));
    const [meta, data] = ref.split(","), mime = /^data:([^;]+)/.exec(meta)[1];
    body.append("image[]", new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: mime }), "reference." + mime.split("/")[1]);
  } else { headers["Content-Type"] = "application/json"; body = JSON.stringify(values); }
  try { return await fetch("https://api.openai.com/v1/images/" + endpoint, { method: "POST", headers, body, signal }); }
  catch (e) { if (e?.name === "AbortError") throw { code: "cancelled" }; throw { code: "network", message: "OpenAI에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요." }; }
}
function imagePrompt(w, p, o) {
  return `위키 문서 「${p.title}」(${p.type})에 넣을 이미지 한 장을 생성한다. 문서에 나온 대상의 외모, 복장, 특징, 시대와 크기 관계를 따른다. 정해지지 않은 외모나 배경은 이 세계관에 맞게 구성한다. 인물이면 해당 인물, 장소면 장소, 물건이면 해당 물건을 중심으로 한다. 그림에 문서 제목이나 설명문을 쓰지 않는다.
## 세계관
${w.title} · 작중 기준 ${w.era}\n${w.seed || ""}\n${(w.rules || []).join("\n")}\n${w.userCanon || ""}
## 세계관 공통 이미지 지침 (모든 문서 이미지에 적용)
${String(w.imageGuide || "").slice(0, 2000) || "세계관의 시대와 분위기를 따른다."}
## 이번 이미지
희망 화풍: ${o.style}. 공통 이미지 지침과 화풍 선택이 충돌하면 공통 이미지 지침을 따른다.
추가 요청: ${o.direction || "없음"}
${o.useRef && portraitSrc(p) ? "첨부 이미지는 같은 대상의 외모·형태 참고다. 정체성과 주요 특징을 유지하면서 공통 이미지 지침과 이번 요청을 반영한다." : ""}
## 문서 내용
${docText(p, w).slice(0, 10000)}`;
}
async function requestDocImage(w, p, o, signal, customPrompt = "") {
  const model = o.model.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error("이미지 모델 이름을 확인해 주세요.");
  const prompt = customPrompt || imagePrompt(w, p, o), ref = o.useRef ? portraitSrc(p) : "";
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(ref);
  const parts = [{ text: prompt }, ...(m ? [{ inlineData: { mimeType: m[1], data: m[2] } }] : [])];
  const geminiBody = { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: o.ratio, ...(model === "gemini-3.1-flash-lite-image" ? {} : { imageSize: "1K" }) } } };
  const send = () => openAIImage(model) ? openAIImageFetch(model, prompt, ref, o, signal) : gFetch(`/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", ...gAuth() }, body: JSON.stringify(geminiBody), signal });
  const t0 = performance.now();
  try {
    let j;
    if (serverImageJob(model)) {
      const input = openAIImage(model) ? { prompt, size: imageSizeFor(o.ratio), quality: o.quality || "high", ...(m ? { reference: { mimeType: m[1], data: m[2] } } : {}) } : geminiBody;
      j = await AIJobs.run(openAIImage(model) ? "openai.image" : "gemini.image", model, input, { signal,
        jobMeta: { kind: customPrompt ? "illustration" : "image", title: p.title, wid: w.id, key: p.key } });
    } else {
      const res = await send();   // 공급자에 맞는 API로 한 번만 요청한다.
      if (!res.ok) throw await gError(res, model);
      j = await res.json();
    }
    const images = [];
    if (openAIImage(model)) for (const entry of j.data || []) if (typeof entry.b64_json === "string") images.push({ mime: "image/png", data: entry.b64_json });
    const collect = x => {
      if (!x || typeof x !== "object" || x.thought === true || x.role === "user" || /thought|reason|^user$/.test(x.type || "")) return;
      const mime = x.mime_type || x.mimeType, data = x.data;
      if (/^image\/(png|jpeg|webp)$/.test(mime || "") && typeof data === "string") images.push({ mime, data });
      for (const [k, v] of Object.entries(x)) if (!["input", "arguments", "data"].includes(k) && typeof v === "object") Array.isArray(v) ? v.forEach(collect) : collect(v);
    };
    collect(j.output_image); collect(j.output); collect(j.outputs); collect(j.steps); collect(j.candidates);
    const img = images[images.length - 1];
    if (!img) throw new Error("모델이 이미지를 반환하지 않았습니다. 요청이나 이미지 모델을 바꿔 다시 시도해 주세요.");
    if (img.data.length > 14e6 || !/^[A-Za-z0-9+/]+=*$/.test(img.data)) throw new Error("반환된 이미지 형식이나 크기를 확인할 수 없습니다.");
    const bytes = Uint8Array.from(atob(img.data), c => c.charCodeAt(0));
    const src = await preparePortrait(new File([bytes], "generated", { type: img.mime }));
    pushLog({ at: Date.now(), kind: "image", title: p.title, model, in: prompt.length, total: Math.round(performance.now() - t0), out: src.length, ok: true });
    return src;
  } catch (e) {
    pushLog({ at: Date.now(), kind: "image", title: p.title, model, in: prompt.length, total: Math.round(performance.now() - t0), out: 0, ok: false, err: e.code || e.name || "image", msg: e.message });
    throw e;
  }
}
function openImageGen(k) {
  const w = S.world, p = S.pages[k]; if (!w || !p) return;
  if (S.imageGen?.busy) { toast("진행 중인 이미지 생성을 마치거나 중단해 주세요."); return; }
  S.imageGen = { wid: w.id, key: k, opts: { model: GS.imageModel || GDEF.imageModel, style: IMAGE_STYLES[0], ratio: p.type === "인물" ? "3:4" : "4:3", quality: "high", direction: "", useRef: !!portraitSrc(p) }, preview: "", error: "", busy: false };
  renderMain(); $(".image-gen")?.scrollIntoView({ block: "start", behavior: "smooth" });
}
async function generateDocImage() {
  const v = S.imageGen, w = S.world, p = v && S.pages[v.key];
  if (!v || v.busy || !w || v.wid !== w.id || !p) return;
  if (!imageReady(v.opts.model)) { v.error = imageSetupHint(v.opts.model); renderMain(); return; }
  if (portraitBusy(v.key) || S.portraitJob) { v.error = "문서 작업이 끝난 뒤 생성해 주세요."; renderMain(); return; }
  v.busy = true; v.timedOut = false; v.error = ""; v.preview = ""; v.stamp = imageDocStamp(p); v.original = portraitSrc(p); v.ctl = new AbortController();
  renderMain();
  const timer = serverImageJob(v.opts.model) ? () => {} : gActiveTimeout(() => { v.timedOut = true; v.ctl.abort(); }, openAIImage(v.opts.model) ? 300000 : 180000);
  try {
    const src = await requestDocImage(w, p, { ...v.opts }, v.ctl.signal);
    if (S.imageGen === v && !v.ctl.signal.aborted) v.preview = src;
  } catch (e) { if (S.imageGen === v) v.error = v.timedOut ? "이미지 생성 시간이 초과되었습니다. 다시 시도해 주세요." : e.code === "cancelled" ? "이미지 생성을 중단했습니다." : (e.message || errMsg(e)); }
  finally { timer(); v.busy = false; if (S.imageGen === v && S.world === w && S.view.key === v.key) renderMain(); }
}
async function applyDocImage() {
  const v = S.imageGen, w = S.world, p = v && S.pages[v.key];
  if (!v || !v.preview || v.busy || !w || w.id !== v.wid || !p) return;
  if (portraitBusy(v.key) || S.portraitJob) { v.error = "문서 작업이 끝난 뒤 적용해 주세요."; renderMain(); return; }
  try {
    const latest = await Store.getPage(w.id, v.key);
    if (!latest || imageDocStamp(latest) !== v.stamp || imageDocStamp(p) !== v.stamp || portraitSrc(latest) !== v.original || portraitSrc(p) !== v.original) throw new Error("생성 중 문서나 기존 이미지가 바뀌었습니다. 문서를 다시 열고 생성해 주세요.");
    const next = { ...latest, portrait: v.preview };
    await Store.savePage(w.id, next);
    if (S.world === w && S.pages[v.key] === p) S.pages[v.key] = next;
    S.imageGen = null; renderMain(); toast("생성한 이미지를 적용했습니다.");
  } catch (e) { v.error = "이미지를 적용하지 못했습니다. " + (e.message || errMsg(e)); renderMain(); }
}
function imageGenHtml(w, k) {
  const v = S.imageGen, p = S.pages[k]; if (!v || v.wid !== w.id || v.key !== k || !p) return "";
  const o = v.opts, disabled = v.busy ? "disabled" : "", price = IMAGE_MODELS.find(m => m.id === o.model)?.price;
  const models = IMAGE_MODELS.some(m => m.id === o.model) ? IMAGE_MODELS : [...IMAGE_MODELS, { id: o.model, label: o.model }];
  return `<section class="image-gen" aria-label="문서 이미지 생성"><h3>AI 이미지 생성</h3>
    ${!imageReady(o.model) ? `<p class="note">${esc(imageSetupHint(o.model))} <button type="button" class="btn" data-act="gset">AI 연결 설정</button></p>` : ""}
    <details class="memo"><summary>세계관 공통 이미지 지침</summary><div class="guide">${esc(w.imageGuide || "지정된 이미지 지침이 없습니다.")}</div><button type="button" class="btn" data-act="image-guide" ${disabled}>이미지 지침 설정</button></details>
    <div class="two"><div><label class="lb" for="imageModel">이미지 모델</label><select id="imageModel" data-igf="model" ${disabled}>${models.map(m => `<option value="${esc(m.id)}" ${o.model === m.id ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
    <div><label class="lb" for="imageStyle">화풍</label><select id="imageStyle" data-igf="style" ${disabled}>${IMAGE_STYLES.map(s => `<option ${o.style === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
    <label class="lb" for="imageRatio">화면 비율</label><select id="imageRatio" data-igf="ratio" ${disabled}>${["1:1", "3:4", "4:3", "9:16", "16:9"].map(r => `<option ${o.ratio === r ? "selected" : ""}>${r}</option>`).join("")}</select>
    ${openAIImage(o.model) ? `<label class="lb" for="imageQuality">생성 품질</label><select id="imageQuality" data-igf="quality" ${disabled}>${[["low", "낮음"], ["medium", "보통"], ["high", "높음"], ["auto", "자동"]].map(([v, label]) => `<option value="${v}" ${(o.quality || "high") === v ? "selected" : ""}>${label}</option>`).join("")}</select><p class="note">OpenAI API는 별도 과금됩니다. 품질과 크기에 따라 비용·생성 시간이 달라지며, ChatGPT 채팅과 결과가 같지는 않을 수 있습니다.</p>` : ""}
    <label class="lb" for="imageDirection">이번 이미지 추가 요청</label><textarea id="imageDirection" data-igf="direction" rows="3" maxlength="2000" placeholder="예: 상반신 초상, 항구를 배경으로, 차분한 표정" ${disabled}>${esc(o.direction)}</textarea>
    ${portraitSrc(p) ? `<label class="lb" style="font-weight:400"><input type="checkbox" data-igf="useRef" ${o.useRef ? "checked" : ""} ${disabled}>기존 이미지를 참고 이미지로 보내기</label>` : ""}
    <p class="note">공통 이미지 지침과 문서 내용을 함께 참고해 한 장을 생성합니다.${price ? ` 1K 이미지 출력비 약 $${price}/장, 입력 비용 별도.` : ""} 기존 이미지는 적용 버튼을 누를 때 바뀝니다.</p>
    ${v.error ? `<div class="banner warn" role="alert">${esc(v.error)}</div>` : ""}
    ${v.preview ? `${imageZoomHtml(v.preview, p.title + " 생성 이미지 미리보기", true)}<div class="row"><button type="button" class="btn pri" data-act="image-apply">이 이미지 적용</button><button type="button" class="btn" data-act="image-discard">미리보기 버리기</button></div>` : ""}
    <div class="row" style="margin-top:10px"><button type="button" class="btn pri" data-act="image-generate" ${disabled || !imageReady(o.model) ? "disabled" : ""}>${v.busy ? "이미지 생성 중…" : v.preview ? "다시 1장 생성" : "1장 생성"}</button><button type="button" class="btn" data-act="image-close">${v.busy ? "생성 중단" : "닫기"}</button></div></section>`;
}
