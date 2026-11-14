"use strict";
/* 문서에서 파생한 단편과 삽화 */
/* ---------- 문서에서 파생한 단편: 확정 설정과 별도로 보관 ---------- */
const PROSE_LENGTHS = { short: "약 2,000~3,500자", medium: "약 5,000~8,000자", long: "약 10,000~15,000자" };
const shortStoriesOf = p => (Array.isArray(p?.shortStories) ? p.shortStories : []).filter(x => x && typeof x.id === "string" && typeof x.title === "string" && typeof x.body === "string");
function prosePrompt(w, p, o) {
  const e = w.entities[p.key];
  return `## 문서 기반 단편 소설
너는 가상 세계관의 단편 작가다. 아래 문서의 인물이나 사건을 중심으로 한국어 산문 한 편을 쓴다.
## 지켜야 할 설정
${canonBlock(w)}
${isStory(w) ? storyBlock(w, p.key, true) + "\n" + secretsBlock(w, "write") : ""}
## 기준 문서
${docForCheck(p)}
## 이 대상에 대해 확정된 사실과 관계
${e ? promptFacts(w, p.key, e.facts.filter(live)).map(f => factLine(f)).join("\n") : ""}
${e ? promptMentions(w, p.key, e.mentions.filter(live)).map(m => `「${w.entities[m.from]?.title || "?"}」: ${m.text}`).join("\n") : ""}
${relationsOf(w, p.key).filter(live).map(r => relLine(w, r)).join("\n")}
## 관련 항목 참고
${related(w, p.key).map(k => entityBrief(w, k, null)).join("\n\n") || "(없음)"}
## 독자가 요청한 내용·분위기·문체·시점
${o.direction || "이 문서의 인물이나 사건을 가까이 느낄 수 있는 한 장면을 골라 쓴다."}
## 분량
${PROSE_LENGTHS[o.length] || PROSE_LENGTHS.medium}. 제목을 제외한 본문(공백 포함)의 목표 분량이다. 선택한 범위의 하한을 기준으로 충분히 전개하고, 요약문처럼 짧게 끝내지 않는다. 반복 설명이나 군더더기로 채우지 말고 행동·대화·장면의 전개에 분량을 쓴다.
## 작성 원칙
- 내용, 분위기, 문체, 시점은 독자의 요청을 우선한다. 다만 확정된 신원·나이·신장·생사·관계·연표·시대·규칙과 충돌하는 요청은 그 사실을 바꾸지 않는 범위에서 해석한다.
- 위키 문서를 소설체로 요약하거나 생애와 사건을 차례로 설명하지 않는다. 요청이 달리 정하지 않으면 구체적인 장면을 중심으로 행동, 대화, 감각, 사물의 디테일로 감정을 보여 준다. 긴 분량은 인과가 이어지는 여러 장면으로 나누어도 된다. 전투나 비극을 억지로 붙이지 않는다.
- 대사, 감각, 사소한 행동은 창작할 수 있지만 확정 사실을 뒤집는 사건이나 인물 관계를 새로 만들지 않는다. 시점 인물이 알 수 있는 범위를 지킨다.
- 문서, 자료, 프롬프트를 설명하거나 '작성 방향:'을 붙이지 않는다. 본문은 단편 산문만 쓴다. 위키 링크·분류·각주·설정 목록을 출력하지 않는다.
- 이 글은 문서와 별도인 창작 단편이며, 새 대사와 세부 묘사는 세계관의 확정 사실로 등록되지 않는다.
JSON 객체 하나만 출력: {"title":"단편 제목","body":"빈 줄로 문단을 구분한 단편 전체"}`;
}
function openProse(k) {
  const w = S.world; if (!w || !S.pages[k]) return;
  if (S.proseGen?.busy) { toast("진행 중인 단편을 마치거나 중단해 주세요."); return; }
  if (!S.proseGen || S.proseGen.wid !== w.id || S.proseGen.key !== k) S.proseGen = { wid: w.id, key: k, opts: { direction: "", length: "medium" }, preview: null, error: "", busy: false };
  renderMain(); $("#prosePanel")?.scrollIntoView({ block: "start", behavior: "smooth" });
}
async function generateProse() {
  const v = S.proseGen, w = S.world, p = v && S.pages[v.key];
  if (!v || v.busy || !w || v.wid !== w.id || !p) return;
  if (!S.sample || !gReady()) { v.error = "AI 연결 설정에서 Gemini 문서 모델 연결을 먼저 저장해 주세요."; renderMain(); return; }
  if (portraitBusy(v.key) || S.portraitJob) { v.error = "문서 작업이 끝난 뒤 생성해 주세요."; renderMain(); return; }
  v.busy = true; v.error = ""; v.ctl = new AbortController(); v.stamp = imageDocStamp(p); renderMain();
  try {
    const out = await callJson("prose", prosePrompt(w, p, v.opts), { modelTier: "default", signal: v.ctl.signal, recoveryMeta: { direction: v.opts.direction, length: v.opts.length }, onJob: j => { v.jobId = j.id; }, onText: ({ text }) => { if (S.proseGen === v && $("#proseProgress")) $("#proseProgress").textContent = `단편을 쓰는 중 · ${text.length.toLocaleString()}자 수신`; }, onRetry: r => { if (S.proseGen === v && $("#proseProgress")) $("#proseProgress").textContent = `응답을 복구하는 중 · ${r.n}회`; } }, { title: p.title });
    if (v.ctl.signal.aborted || S.proseGen !== v) return;
    if (!out || typeof out.title !== "string" || typeof out.body !== "string" || !out.title.trim() || !out.body.trim() || out.body.length > 60000) throw new Error("단편 응답 형식이나 분량을 확인할 수 없습니다. 다시 생성해 주세요.");
    v.preview = { id: crypto.randomUUID(), title: out.title.trim().slice(0, 100), body: out.body.trim(), direction: v.opts.direction, length: v.opts.length, createdAt: Date.now(), sourceTitle: p.title, sourceStamp: v.stamp };
  } catch (e) { if (S.proseGen === v) v.error = e.code === "cancelled" ? "단편 생성을 중단했습니다." : (e.message || errMsg(e)); }
  finally { v.busy = false; if (S.proseGen === v && S.world === w && S.view.key === v.key) renderMain(); }
}
async function saveProse(removeId = null) {
  const v = S.proseGen, w = S.world, p = v && S.pages[v.key];
  if (!v || v.busy || !w || v.wid !== w.id || !p || (!removeId && !v.preview)) return;
  if (portraitBusy(v.key) || S.portraitJob) { v.error = "문서 작업이 끝난 뒤 보관해 주세요."; renderMain(); return; }
  v.busy = true; v.saving = true; v.error = ""; renderMain();
  try {
    const latest = await Store.getPage(w.id, v.key); if (!latest) throw new Error("원래 문서가 삭제되었습니다.");
    if (!removeId && (imageDocStamp(latest) !== v.preview.sourceStamp || imageDocStamp(p) !== v.preview.sourceStamp)) throw new Error("생성 중 원래 문서가 바뀌었습니다. 문서를 다시 열고 현재 내용을 기준으로 생성해 주세요.");
    let stories = shortStoriesOf(latest);
    if (removeId) stories = stories.filter(x => x.id !== removeId);
    else { if (stories.length >= 20) throw new Error("문서당 20편까지 보관할 수 있습니다. 필요 없는 단편을 삭제한 뒤 보관해 주세요."); stories = [...stories, v.preview]; }
    const next = { ...latest, shortStories: stories }; await Store.savePage(w.id, next);
    if (!removeId && v.jobId) AIRecovery.handled(v.jobId);
    if (S.world === w && S.pages[v.key] === p) S.pages[v.key] = next;
    if (!removeId) v.preview = null; v.confirmDelete = null; toast(removeId ? "단편을 삭제했습니다." : "단편을 보관했습니다. 세계관 설정에는 반영하지 않습니다.");
  } catch (e) { v.error = "단편을 저장하지 못했습니다. " + (e.message || errMsg(e)); }
  finally { v.busy = false; v.saving = false; if (S.proseGen === v && S.world === w && S.view.key === v.key) renderMain(); }
}
/* 단편 삽화는 문서 프로필과 별도 슬롯에 한 장만 보관한다. */
const proseImageStamp = story => JSON.stringify([story.id, story.title, story.body]);
function proseImagePrompt(w, p, story, o) {
  return `단편 「${story.title}」에 넣을 삽화 한 장을 생성한다. 아래 단편에서 실제로 벌어지는 의미 있는 순간을 골라 인물의 행동·감정과 주변 공간이 드러나는 새 장면으로 구성한다. 문서 프로필을 다시 그리는 작업이 아니다. 전투를 억지로 추가하지 않는다. 그림에 제목·설명·자막·로고를 쓰지 않는다.
## 세계관과 확정 설정
${w.title} · ${w.era}\n${w.seed || ""}\n${(w.rules || []).join("\n")}\n${w.userCanon || ""}
## 공통 이미지 지침
${String(w.imageGuide || "").slice(0, 2000) || "세계관의 시대와 분위기를 따른다."}
## 기준 문서 — 신원·나이·신장·시대·외모·복장 설정
${docText(p, w).slice(0, 10000)}
## 삽화를 그릴 단편 전체
${story.body}
## 이번 삽화 요청
희망 화풍: ${o.style}. 화풍은 공통 이미지 지침을 우선한다.
장면·연출 추가 요청: ${o.direction || "단편의 핵심 장면을 새 구도로 선택한다."}
## 외모 참조의 엄격한 사용 범위 — 다른 연출 요청보다 우선
${portraitSrc(p) ? `첨부 이미지는 기준 문서 「${p.title}」의 프로필이며 오직 해당 인물의 외모를 확인하는 참고 자료다.
- 얼굴의 골격·이목구비·머리카락·피부색 등 정체성을 유지한다. 나이·신장·체형은 문서와 단편의 해당 시점 설정을 따른다.
- 프로필 이미지의 구도, 포즈, 동작, 표정, 시선, 카메라 위치·각도·거리, 프레이밍, 배경, 소품 배치, 조명, 색감, 화풍을 그대로 베끼거나 재현하는 것은 금지한다. 배경만 바꾸거나 같은 포즈를 유지한 변형도 하지 않는다.
- 의상·장비는 단편과 문서의 장면 설정에서 결정한다. 참고 이미지에 있다는 이유만으로 그대로 복제하지 않는다.
- 단편 속 장소·행동·인물 사이의 관계에 맞춰 포즈·표정·카메라·배경·조명을 독립적으로 새로 설계한다. 다른 등장인물에게 프로필 인물의 얼굴을 복사하지 않는다.` : "첨부 프로필은 없다. 문서와 단편의 외모 설정을 따른다."}
완성 전에 단편의 장면인지, 외모 일관성을 지키면서 참고 이미지의 구도와 포즈를 답습하지 않았는지 점검하고 이미지 한 장을 출력한다.`;
}
function openProseImage(id) {
  const v = S.proseGen; if (!v || v.busy || !shortStoriesOf(S.pages[v.key]).some(x => x.id === id)) return;
  v.openStory = id;
  if (v.illustration?.storyId !== id) v.illustration = { storyId: id, preview: "", error: "", opts: { model: GS.imageModel || GDEF.imageModel, ratio: "4:3", style: IMAGE_STYLES[0], quality: "high", direction: "" } };
  renderMain(); $(".prose-image-form")?.scrollIntoView({ block: "start", behavior: "smooth" });
}
async function generateProseImage() {
  const v = S.proseGen, j = v?.illustration, w = S.world, p = v && S.pages[v.key], story = shortStoriesOf(p).find(x => x.id === j?.storyId);
  if (!v || !j || v.busy || !w || v.wid !== w.id || !story) return;
  if (!imageReady(j.opts.model)) { j.error = imageSetupHint(j.opts.model); renderMain(); return; }
  if (portraitBusy(v.key) || S.portraitJob) { j.error = "문서 작업이 끝난 뒤 생성해 주세요."; renderMain(); return; }
  j.error = ""; j.preview = ""; j.stamp = proseImageStamp(story); j.docStamp = imageDocStamp(p); j.ref = portraitSrc(p); j.original = portraitSrc({ portrait: story.illustration });
  v.busy = true; v.ctl = new AbortController(); v.imageTask = true; renderMain();
  const timer = serverImageJob(j.opts.model) ? () => {} : gActiveTimeout(() => { j.timedOut = true; v.ctl.abort(); }, openAIImage(j.opts.model) ? 300000 : 180000); j.timedOut = false;
  try {
    const o = { ...j.opts, useRef: !!j.ref, recoveryMeta: { storyId: story.id }, onJob: task => { j.jobId = task.id; } };
    const src = await requestDocImage(w, p, o, v.ctl.signal, proseImagePrompt(w, p, story, o));
    if (S.proseGen === v && v.illustration === j && !v.ctl.signal.aborted) j.preview = src;
  } catch (e) { if (S.proseGen === v) j.error = j.timedOut ? "삽화 생성 시간이 초과되었습니다." : e.code === "cancelled" ? "삽화 생성을 중단했습니다." : (e.message || errMsg(e)); }
  finally { timer(); v.busy = false; v.imageTask = false; if (S.proseGen === v && S.world === w && S.view.key === v.key) renderMain(); }
}
async function saveProseImage(remove = false, id = null) {
  const v = S.proseGen, j = v?.illustration, w = S.world, p = v && S.pages[v.key], target = id || j?.storyId;
  if (!v || v.busy || !w || v.wid !== w.id || !p || !target || (!remove && !j?.preview)) return;
  if (portraitBusy(v.key) || S.portraitJob) { v.error = "문서 작업이 끝난 뒤 적용해 주세요."; renderMain(); return; }
  v.busy = true; v.saving = true; v.error = ""; if (j) j.error = ""; v.openStory = target; renderMain();
  try {
    const latest = await Store.getPage(w.id, v.key), stories = shortStoriesOf(latest), story = stories.find(x => x.id === target), local = shortStoriesOf(p).find(x => x.id === target);
    if (!story || !local) throw new Error("단편이 삭제되거나 이동되었습니다. 문서를 다시 열어 주세요.");
    if (!remove && (proseImageStamp(story) !== j.stamp || proseImageStamp(local) !== j.stamp || imageDocStamp(latest) !== j.docStamp || imageDocStamp(p) !== j.docStamp || portraitSrc(latest) !== j.ref || portraitSrc(p) !== j.ref || portraitSrc({ portrait: story.illustration }) !== j.original)) throw new Error("생성 중 단편·문서·프로필 또는 기존 삽화가 바뀌었습니다. 다시 열고 생성해 주세요.");
    const nextStory = { ...story }; if (remove) delete nextStory.illustration; else nextStory.illustration = j.preview;
    const next = { ...latest, shortStories: stories.map(x => x.id === target ? nextStory : x) }; await Store.savePage(w.id, next);
    if (!remove && j?.jobId) AIRecovery.handled(j.jobId);
    if (S.world === w && S.pages[v.key] === p) S.pages[v.key] = next;
    if (!remove || j?.storyId === target) v.illustration = null;
    v.confirmImageDelete = null; toast(remove ? "단편 삽화를 삭제했습니다." : "삽화를 단편에 적용했습니다. 문서 프로필은 유지됩니다.");
  } catch (e) { const msg = "삽화를 저장하지 못했습니다. " + (e.message || errMsg(e)); if (j) j.error = msg; v.error = msg; }
  finally { v.busy = false; v.saving = false; if (S.proseGen === v && S.world === w && S.view.key === v.key) renderMain(); }
}
function proseImageHtml(p, story, v) {
  const src = portraitSrc({ portrait: story.illustration }), j = v.illustration, active = j?.storyId === story.id, disabled = v.busy ? "disabled" : "";
  const o = active && j.opts;
  return `${src ? `<div class="portrait prose-illustration">${imageZoomHtml(src, story.title + " 삽화")}</div>` : ""}
    <div class="row"><button type="button" class="btn" data-prose-illustrate="${esc(story.id)}" ${disabled}>${src ? "삽화 다시 생성" : "삽화 한 장 만들기"}</button>${src ? `<button type="button" class="btn" data-prose-image-delete="${esc(story.id)}" ${disabled}>${v.confirmImageDelete === story.id ? "삽화 삭제 확인" : "삽화 삭제"}</button>` : ""}</div>
    ${active ? `<section class="image-gen prose-image-form" aria-label="단편 삽화 생성"><h3>단편 삽화</h3><p class="note">${portraitSrc(p) ? "문서 프로필을 외모 참고로 함께 보냅니다. 구도·포즈·배경·조명은 복제하지 않고 단편의 장면에 맞춰 새로 구성하도록 요청합니다." : "문서 프로필이 없어 문서와 단편의 외모 설명을 참고합니다."} 적용 전까지 기존 삽화는 유지됩니다.</p>
    <label class="lb">이미지 모델<select data-prose-image="model" ${disabled}>${(IMAGE_MODELS.some(m => m.id === o.model) ? IMAGE_MODELS : [...IMAGE_MODELS, { id: o.model, label: o.model }]).map(m => `<option value="${esc(m.id)}" ${o.model === m.id ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
    <label class="lb">화풍<select data-prose-image="style" ${disabled}>${IMAGE_STYLES.map(s => `<option ${o.style === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="lb">화면 비율<select data-prose-image="ratio" ${disabled}>${["1:1", "3:4", "4:3", "9:16", "16:9"].map(r => `<option ${o.ratio === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <label class="lb">장면·연출 추가 요청<textarea data-prose-image="direction" rows="3" maxlength="2000" ${disabled}>${esc(o.direction)}</textarea></label>
    ${!imageReady(o.model) ? `<p class="note">${esc(imageSetupHint(o.model))} <button type="button" class="btn" data-act="gset">AI 연결 설정</button></p>` : ""}
    ${j.error ? `<div class="banner warn" role="alert">${esc(j.error)}</div>` : ""}
    ${j.preview ? `${imageZoomHtml(j.preview, story.title + " 삽화 미리보기", true)}<div class="row"><button type="button" class="btn pri" data-act="prose-image-apply" ${disabled}>이 삽화 적용</button><button type="button" class="btn" data-act="prose-image-discard" ${disabled}>미리보기 버리기</button></div>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="prose-image-generate" ${disabled || !imageReady(o.model) ? "disabled" : ""}>${v.imageTask ? "삽화 생성 중…" : "삽화 한 장 생성"}</button><button type="button" class="btn" data-act="prose-image-close" ${v.saving ? "disabled" : ""}>${v.imageTask ? "삽화 생성 중단" : "닫기"}</button></div><p class="note">선택한 이미지 API의 유료 사용량에 포함됩니다. OpenAI 품질은 높음이며, 실패 시 자동 재시도하지 않습니다.</p></section>` : ""}`;
}

function proseHtml(w, k) {
  const v = S.proseGen; if (!v || v.wid !== w.id || v.key !== k) return "";
  const disabled = v.busy ? "disabled" : "", stories = shortStoriesOf(S.pages[k]);
  return `<section class="image-gen" id="prosePanel" aria-label="문서로 단편 쓰기"><h3>이 문서로 단편 쓰기</h3>
    <p class="note">문서와 확정 설정을 참고해 글을 씁니다. 단편의 대사와 세부 묘사는 위키 본문이나 확정 설정에 자동 반영되지 않습니다. 기존 Gemini 기본 문서 모델을 사용합니다.</p>
    ${!gReady() ? `<p class="note">Gemini 문서 모델 연결이 필요합니다. <button type="button" class="btn" data-act="gset">AI 연결 설정</button></p>` : ""}
    <label class="lb" for="proseDirection">내용·분위기·문체·시점</label><textarea id="proseDirection" data-prose-field="direction" rows="4" maxlength="2000" placeholder="예: 출동 전날 밤, 정비병의 시점으로. 거인의 손을 검진하며 나누는 짧은 대화. 조용하고 따뜻하게, 감정은 행동으로 보여 줘." ${disabled}>${esc(v.opts.direction)}</textarea>
    <label class="lb" for="proseLength">분량</label><select id="proseLength" data-prose-field="length" ${disabled}>${Object.entries(PROSE_LENGTHS).map(([id, label]) => `<option value="${id}" ${v.opts.length === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>
    ${v.error ? `<div class="banner warn" role="alert">${esc(v.error)}</div>` : ""}
    ${v.busy ? `<p class="note" id="proseProgress" role="status">${v.imageTask ? "삽화를 생성하는 중…" : "단편을 처리하는 중…"}</p>` : ""}
    ${v.preview ? `<section class="prose-preview"><h3>${esc(v.preview.title)}</h3><div class="prose-text">${esc(v.preview.body)}</div><div class="row"><button type="button" class="btn pri" data-act="prose-save" ${disabled}>이 단편 보관</button><button type="button" class="btn" data-act="prose-discard" ${disabled}>미리보기 버리기</button></div></section>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="prose-generate" ${disabled || !gReady() ? "disabled" : ""}>${v.busy ? "처리 중…" : v.preview ? "새 단편 생성" : "단편 생성"}</button><button type="button" class="btn" data-act="prose-close" ${v.saving ? "disabled" : ""}>${v.busy && !v.saving && v.ctl ? "생성 중단·닫기" : "닫기"}</button></div>
    ${stories.length ? `<section class="prose-saved"><h3>보관한 단편 · ${stories.length}편</h3>${stories.slice().reverse().map(x => `<details data-prose-id="${esc(x.id)}" ${v.openStory === x.id ? "open" : ""}><summary>${esc(x.title)} · ${fmtDate(x.createdAt)}</summary>${x.sourceStamp && x.sourceStamp !== imageDocStamp(S.pages[k]) ? `<p class="note">이 단편은 이전 문서 내용을 바탕으로 생성되었습니다.</p>` : ""}${x.direction ? `<p class="note">요청: ${esc(x.direction)}</p>` : ""}${proseImageHtml(S.pages[k], x, v)}<div class="prose-text">${esc(x.body)}</div><button type="button" class="btn dng" data-prose-delete="${esc(x.id)}" ${disabled}>${v.confirmDelete === x.id ? "삭제 확인" : "단편 삭제"}</button></details>`).join("")}</section>` : ""}</section>`;
}
