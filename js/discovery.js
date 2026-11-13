"use strict";
/* 랜덤 서핑 */
/* ---------- 랜덤 서핑: 미작성 링크도 제외한 새 대상 ---------- */
function updateDiscoveryButton() { const button = $("#discoveryBtn"); if (button) button.disabled = !S.world || !!discoveryOccupied() || !!S.discovery?.busy; }
const discoveryOccupied = () => S.creating || S.gen || S.storyGen || S.syncing || S.checking || S.edit || S.fixing || S.bgSync || S.portraitJob || S.imageGen?.busy || S.proseGen?.busy;
function discoveryOwner(w, title, except = null) {
  const name = norm(title); if (!name) return null;
  const key = keyOf(name);
  if (key !== except && (w.entities[key] || S.pages[key])) return key;
  if (w.aliases && Object.prototype.hasOwnProperty.call(w.aliases, key)) return w.aliases[key] || key;
  const id = identityName(name), canonical = identityName(canonTitle(w, name));
  return Object.entries(w.entities).find(([k, e]) => k !== except && (identityName(e.title) === id || identityName(e.title) === canonical))?.[0] || identityOwner(w, name, except) || null;
}
function discoveryIndex(w, except) {
  return Object.entries(w.entities).filter(([key]) => key !== except).map(([key, e]) => ({
    key, title: e.title, type: e.type || "", status: e.page ? "작성됨" : "빨간 링크·미작성",
    summary: e.summary || e.stub?.summary || "",
    aliases: Object.entries(w.aliases || {}).filter(([, owner]) => owner === key).map(([name]) => name),
    names: (S.pages[key]?.infobox || []).filter(r => IDENTITY_LABEL.test(stripMarks(r.label).replace(/\s/g, ""))).map(r => stripMarks(r.value)),
    facts: (e.facts || []).filter(x => !x.sup).map(x => x.t),
    mentions: (e.mentions || []).filter(x => !x.sup).map(x => ({ from: w.entities[x.from]?.title || x.from, text: x.text }))
  }));
}
function discoveryConfig(w) { return JSON.stringify([w.seed, w.era, w.rules, w.userCanon, w.guide, w.story?.chapter]); }
function discoveryBasis(w, except) { return JSON.stringify([discoveryIndex(w, except), discoveryConfig(w)]); }
async function assertDiscoveryCurrent(w, except, basis, signal) {
  if (signal.aborted || S.world !== w || !S.worlds.some(x => x.id === w.id)) throw { code: "cancelled" };
  const stored = await Store.getWorld(w.id);
  if (signal.aborted || S.world !== w || !stored) throw { code: "cancelled" };
  const others = Object.fromEntries(Object.entries(w.entities).filter(([key]) => key !== except));
  if (JSON.stringify(stored.entities) !== JSON.stringify(others) || JSON.stringify(stored.aliases || {}) !== JSON.stringify(w.aliases || {}) || discoveryConfig(stored) !== discoveryConfig(w) || basis !== discoveryBasis(w, except)) throw new Error("기존 항목이나 설정이 다른 곳에서 바뀌었습니다. 세계관을 다시 열고 시도해 주세요.");
}
function validateDiscoveryNovelty(w, result) {
  const keys = new Set(Object.keys(w.entities)), comparisons = result?.comparisons;
  if (!["novel", "overlap", "uncertain"].includes(result?.verdict) || typeof result.reason !== "string" || !result.reason.trim() || !Array.isArray(comparisons) || (keys.size && !comparisons.length) || comparisons.length > 3 || comparisons.some(x => !x || !keys.has(x.key) || typeof x.reason !== "string" || !x.reason.trim())) throw new Error("선정 결과의 개념 중복 비교 근거를 확인하지 못해 새 문서를 만들지 않았습니다.");
  if (result.verdict === "overlap") {
    if (!comparisons.length) throw new Error("개념이 겹치는 기존 항목을 확인하지 못했습니다.");
    throw { code: "discovery_duplicate", existing: w.entities[comparisons[0].key].title, reason: result.reason.slice(0, 500) };
  }
  if (result.verdict !== "novel") throw new Error("기존 항목과 개념이 충분히 다른지 확인하지 못해 새 문서를 만들지 않았습니다. " + result.reason.slice(0, 400));
}
/* ---------- 각도: 세계의 중심 주제를 다른 자리에서 비추는 시선 ----------
   w.angles = [{ id, label, area, axis, consequence, surprise, contrast, scene, safe, existing, uses, scenes, off, retired, removed }]. existing: 만들 때 분류된 기존 관련 문서 수(혼잡 판정·표시용), uses: 각도로 실제 쓴 횟수(은퇴 판정용) (예전 목록은 consequence 대신 why). 목록은 AI가 한 번 만들고, 어느 각도를 쓸지는 코드가 고른다. */
const ANGLE_RATE = 0.3;   // 사용자 설명 없는 랜덤 서핑 중 각도를 쓰는 비율
const ANGLE_CANDIDATES = 15, ANGLE_PICK = 8;
const ANGLE_MAX_USES = 2, ANGLE_MIN_ACTIVE = 4, ANGLE_REFILL = 6;   // 두 번 쓴 각도는 은퇴, 활성 각도가 4개 미만이면 6개 보충
const ANGLE_PRIOR_FULL = 30;   // 보충 때 은퇴·삭제 각도를 장면까지 넘기는 최근 개수
const ANGLE_CROWDED = 3;   // 관련 문서가 이만큼 있는 후보는 이미 다뤄진 영역으로 보고 버린다
const ANGLE_FLIP = ["감정 반전", "체계의 지지자"];   // 기존 문서들의 공통 결론(dominant)을 뒤집는 축
/* 후보를 낼 축. 축마다 최소 하나씩 후보를 낸다 */
const ANGLE_AXES = [
  ["감정 반전", "이미 작성된 문서들이 고통이라고 결론 내린 것을 즐기는 사람, 영광이라고 결론 내린 것을 귀찮아하는 사람. 세계 안의 공식 입장이 아니라 기존 문서들의 공통 결론(dominant)을 뒤집는다"],
  ["일상화", "이 설정이 작중 시점까지 이어지면서 사람들에게 익숙해지고 평범해진 것들. 형태는 아래 경과 시간에 맞춘다"],
  ["의외의 수혜자", "이 체계로 엉뚱하게 돈을 벌거나 이득을 본 사람과 산업"],
  ["문화적 반응", "종교, 예술, 방송, 유행, 스포츠화 같은 사회의 반응. 형태는 아래 경과 시간에 맞춘다"],
  ["체계의 지지자", "기존 문서들의 공통 결론(dominant)과 달리 이 체계를 진심으로 옹호하는 사람과 그 논리. 악역이나 허수아비가 아니라 독자가 일부 수긍할 만한 논리를 가진 인물이어야 한다"],
  ["개인적 관계", "우정, 가족, 편지 같은 사적인 연결"]];
/* 핵심 설정이 성립한 뒤 작중 시점까지의 햇수. 작중 시점(w.era)과 연표의 가장 이른 연도를 같은 기년법으로 읽을 수 있을 때만 구하고, 아니면 null */
function worldSpan(w) {
  const era = yearHits(w?.era || "", w)[0]; if (!era) return null;
  const years = (Array.isArray(w?.timeline) ? w.timeline : []).filter(t => t && !t.sup).flatMap(t => { const y = String(t.year ?? "").trim(); return yearHits(/\d$/.test(y) ? y + "년" : /원$/.test(y) ? y + "년" : y, w); }).filter(h => h.cal === era.cal);
  if (!years.length) return null;
  const first = Math.min(...years.map(h => h.y)), n = yDiff(first, era.y);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const spanLine = n => n === null ? "경과 시간 알 수 없음. 원안과 연표를 보고 판단할 것" : n < 1 ? "세계의 핵심 설정이 성립한 뒤 작중 시점까지 1년이 채 되지 않음" : `세계의 핵심 설정이 성립한 뒤 작중 시점까지 약 ${n}년`;
const angleBasis = a => a.consequence || a.why || "";
const liveAngles = w => Array.isArray(w?.angles) ? w.angles.filter(a => a && a.id && a.label && !a.off && !a.retired && !a.removed) : [];
/* 문서 k가 링크하거나 k를 언급한(사실을 남긴) 문서들이 쓴 각도 */
function neighborAngles(w, k) {
  if (!w || !k) return new Set();
  const keys = new Set(S.pages[k]?.links || []);
  for (const [x, p] of Object.entries(S.pages)) if (x !== k && (p?.links || []).includes(k)) keys.add(x);
  for (const m of w.entities[k]?.mentions || []) if (m?.from) keys.add(m.from);
  for (const f of w.entities[k]?.facts || []) if (f?.src) keys.add(f.src);
  keys.delete(k);
  return new Set([...keys].map(x => S.pages[x]?.angle).filter(Boolean));
}
/* 경로(랜덤 서핑·빨간 링크)와 관계없이 쓴다. 꺼짐과 연속 사용 금지는 세계 단위. person이면 감정 반전 축만. 이웃 문서가 쓴 각도는 뺀다 */
function pickAngle(w, k = null, rand = Math.random, opts = {}) {
  if (!w || w.angleOff || w.angleLast) return null;
  const near = neighborAngles(w, k);
  const on = liveAngles(w).filter(a => (!opts.person || a.axis === "감정 반전") && !near.has(a.id)); if (!on.length) return null;
  if (!(rand() < ANGLE_RATE)) return null;
  const rank = a => [a.uses || 0, a.existing || 0];   // 덜 쓴 각도 우선, 같으면 기존 문서가 적은 쪽
  const [mu, me] = on.map(rank).sort((x, y) => x[0] - y[0] || x[1] - y[1])[0], pool = on.filter(a => (a.uses || 0) === mu && (a.existing || 0) === me);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
/* 빨간 링크처럼 대상이 이미 정해진 새 문서에 얹는 각도. 대상은 바꾸지 않고 섹션 하나(인물이면 태도)만 그 시선으로 쓴다 */
const pageAngleBlock = (a, guide) => a ? `## 이번 각도: 「${a.label}」 (${a.axis ? "축: " + a.axis + ", " : ""}근거: ${angleBasis(a)})
${prevScenes(a)}문서의 대상과 본문 구성은 평소대로 쓴다. 단, 섹션 하나를 「${a.label}」의 시선으로 쓴다. 그 섹션은 이 대상과 직접 이어져야 하며, 어울리지 않으면 쓰지 않는다. 그 섹션에서 아직 없는 관련 대상이 자연스럽게 나오면 [[링크]]로 남긴다.
이 각도는 문서의 대상·이름·정체를 바꾸지 않는다. 어조·문체·세계 규칙도 바꾸지 않는다.
이 문서가 인물이면 섹션 대신 다음을 따른다. ${a.axis === "감정 반전" ? "" : "이번 각도는 감정 반전 축이 아니므로 인물 문서라면 버린다. "}위의 확정 사실·언급에 이 인물의 성격이나 태도가 정해져 있지 않을 때만 이 각도를 인물의 태도로 반영한다. 확정 사실·언급과 충돌하면 각도를 버린다.
${guide ? "사용자가 요청한 방향이 성격·태도·시선을 이미 정했다면 이번 각도는 버린다. 사용자가 정한 대상·이름·역할은 각도보다 항상 우선한다.\n" : ""}각도를 실제로 반영했으면 angleUsed를 true, 버렸거나 어울리지 않아 쓰지 않았으면 false로 쓴다. 반영했으면 실제로 쓴 장면을 sceneUsed에 한 문장으로 쓴다.` : "";
/* 새 문서가 저장된 뒤 각도 사용을 세계에 기록한다(저장 전에 호출하고 같은 saveWorld로 남긴다) */
function noteAngleUse(w, used, scene = "") {
  const a = used && (w.angles || []).find(x => x.id === used.id);
  if (a) {
    a.uses = (a.uses || 0) + 1;
    scene = norm(scene || "").slice(0, 200); if (scene && !nearSame(scene, a.scene)) a.scenes = [...(a.scenes || []), scene].slice(-10);   // 예시 장면을 그대로 옮긴 것은 기록하지 않는다
    if (a.uses >= ANGLE_MAX_USES && !a.retired) { a.retired = true; a.endedAt = Date.now(); }
  }
  w.angleLast = !!a;
  return a;
}
/* 두 문장이 같거나 거의 같은가: 공백·문장부호를 지우고 비교, 한쪽이 다른 쪽을 품거나 글자 두 개 묶음이 70% 이상 겹치면 같다고 본다 */
function nearSame(x, y) {
  const a = squash(x), b = squash(y); if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]; if (s.length >= 6 && l.includes(s) && s.length >= l.length * 0.6) return true;
  const grams = t => { const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b); let hit = 0; for (const [g, n] of ga) hit += Math.min(n, gb.get(g) || 0);
  return (2 * hit) / Math.max(1, a.length - 1 + b.length - 1) >= 0.7;
}
/* 이전 형식(count 하나에 기존 문서 수와 사용 횟수가 섞임) 변환. 세계를 열 때 count가 남은 각도만 한 번 바꾼다. 바뀐 것이 있으면 true
   uses = 이 각도로 쓴 문서 수, existing = 나머지. 생성 즉시 잘못 은퇴한 각도(uses가 한도 미만)는 되살린다. off·removed는 건드리지 않는다 */
function fixOldAngles(w, pages = S.pages) {
  let changed = false;
  for (const a of Array.isArray(w?.angles) ? w.angles : []) {
    if (!a || !Object.prototype.hasOwnProperty.call(a, "count")) continue;
    const uses = Object.values(pages || {}).filter(p => p?.angle === a.id).length;
    a.uses = uses; a.existing = Math.max(0, (Number(a.count) || 0) - uses); delete a.count;
    if (a.retired && uses < ANGLE_MAX_USES) { delete a.retired; delete a.endedAt; }
    else if (!a.retired && uses >= ANGLE_MAX_USES) { a.retired = true; a.endedAt = Date.now(); }
    changed = true;
  }
  return changed;
}
function prevScenes(a) { return a?.scenes?.length ? `이전 장면: ${a.scenes.join(" / ")}. 이와 다른 장면·인물·장소를 쓴다.\n` : ""; }
const angleName = (w, id) => (w.angles || []).find(a => a.id === id)?.label || `삭제된 각도(${id})`;
/* selection: 랜덤 서핑의 선정 단계. 예시 장면은 선정에만 참고로 넣고, 문서 작성에는 넣지 않는다(대본처럼 옮겨 쓰지 않게) */
const angleBlock = (a, selection = false) => a ? `## 이번 각도: 「${a.label}」 (근거: ${angleBasis(a)})
${selection && a.scene ? `이 각도의 예시 장면(참고용이며 그대로 쓰지 않는다): ${a.scene}\n` : ""}${prevScenes(a)}이 각도에서 새 대상을 고른다. 어조·문체·세계 규칙은 바꾸지 않는다.
세계의 중심 주제를 다른 자리에서 비추는 것이지, 다른 이야기를 하는 것이 아니다. 장르·분위기·세계 규칙을 바꾸는 대상은 고르지 않는다.` : "";
/* 기존 각도(활성·은퇴·삭제)를 넘겨 겹치는 후보를 막는다. 은퇴·삭제는 최근 ANGLE_PRIOR_FULL개만 장면까지 */
function priorAnglesBlock(list) {
  list = (list || []).filter(a => a && a.label); if (!list.length) return "";
  const active = list.filter(a => !a.retired && !a.removed), ended = list.filter(a => a.retired || a.removed).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  const recent = ended.slice(0, ANGLE_PRIOR_FULL), old = ended.slice(ANGLE_PRIOR_FULL);
  return `## 이미 있는 각도
아래 각도와 영역(area)이 같거나 문구만 바꾼 후보는 내지 않는다.
${active.length ? "지금 쓰는 각도:\n" + JSON.stringify(active.map(a => ({ label: a.label, area: a.area || "" }))) + "\n" : ""}${recent.length ? "은퇴·삭제한 각도(쓴 장면 포함):\n" + JSON.stringify(recent.map(a => ({ label: a.label, area: a.area || "", scenes: a.scenes || [] }))) + "\n" : ""}${old.length ? "그보다 오래된 은퇴·삭제 각도:\n" + JSON.stringify(old.map(a => ({ label: a.label, area: a.area || "" }))) + "\n" : ""}`;
}
function anglesPrompt(w, prior = [], pick = ANGLE_PICK) {
  const index = Object.entries(w.entities).map(([key, e]) => ({ key, title: e.title, status: e.page || S.pages[key] ? "작성됨" : "빨간 링크·미작성", summary: (e.summary || e.stub?.summary || firstPara(S.pages[key] || {}) || "").slice(0, 200) }));
  return `## 각도 목록 만들기
가상 세계관 위키에서 새 문서의 대상을 고를 때 쓸 '각도' 목록을 만든다. 각도는 세계의 중심 주제를 다른 자리에서 비추는 시선이다. 어조·문체·장르·세계 규칙은 그대로 두고, 대상을 보는 자리만 바꾼다. 시선만 바뀌고 문체는 톤 지침 그대로여야 한다.
${canonBlock(w)}
## 작가 지침
${w.guide || "(없음)"}
${toneBlock(w)}
## 이미 위키에 있는 항목 전체 (작성된 문서와 빨간 링크)
${JSON.stringify(index)}
이미 문서나 빨간 링크로 다뤄진 영역은 각도로 내지 않는다. 위 항목의 소재를 이름만 바꿔 다시 꺼내지 않는다.
${priorAnglesBlock(prior)}## 세계의 경과 시간
${spanLine(worldSpan(w))}
'일상화'와 '문화적 반응' 축의 후보는 경과 시간에 맞는 형태로 낸다.
- 며칠~몇 달: 부정과 혼란, 소문과 음모론, 사재기, 첫 농담과 유행어, 서툰 첫 적응
- 몇 년: 임시방편의 제도화, 새 직업, 반대 운동, 세대 간 인식 차이
- 수십 년 이상: 일상화, 상품, 관광, 전통, 향수
- 시작점이 없는 세계(원래부터 그랬던 세계): 신화, 민담, 속담, 관습
경과 시간에 맞지 않는 결과(예: 사태 일주일 만에 생긴 관광 산업)는 safe를 통과하지 못한 것으로 보고 버린다. 나머지 축(감정 반전, 의외의 수혜자, 체계의 지지자, 개인적 관계)은 경과 시간과 관계없이 낸다.
## 할 일 1: 기존 문서들의 공통 결론
위 '작성됨' 문서들의 요약을 읽고, 이 문서들이 이 세계에 대해 공통으로 내린 결론(무엇을 고통·비극·영광·당연한 것으로 보는가)을 dominant에 한 문장으로 쓴다. 세계 안의 공식 입장이 아니라 지금까지 쓰인 문서들의 시선이다. 작성된 문서가 없으면 원안이 기본으로 깔고 있는 시선을 쓴다.
## 할 일 2: 후보 ${ANGLE_CANDIDATES}개
아래 축마다 최소 하나씩, 모두 ${ANGLE_CANDIDATES}개의 후보를 낸다. 축마다 감정의 결이 달라야 한다.
${ANGLE_AXES.map(([name, desc]) => `- ${name}: ${desc}`).join("\n")}
각 후보에는 다음을 쓴다.
- label: 각도 한 줄 설명(40자 이하). 세계 규칙을 직업·기관 이름으로 바꿔 말한 것은 각도가 아니다.
- area: 이 후보가 다루는 영역을 짧은 명사구로(예: "낙제생 문화", "졸업 앨범 산업"). 같은 area의 후보는 하나만 남긴다.
- consequence: 핵심 설정이 작중 시점까지 지속된 기간 동안 생겼을 법한 2차·3차 결과. 규칙을 다시 말하거나 요약한 것은 근거로 인정하지 않는다.
- surprise: 원안을 읽은 사람이 바로 떠올리지 못할 이유.
- contrast: 이 후보가 dominant와 어떻게 다른지. 감정 반전과 체계의 지지자 축은 반드시 dominant를 뒤집어야 한다.
- scene: 이 세계에서만 나올 수 있는 구체적인 장면이나 사물 하나를 한 문장으로(예: "교실 벽에 붙은 역장 충격파 대피 안내문"). 범주만 있고 장면이 없는 후보는 버린다.
- safe: 어떤 세계 규칙도 어기지 않고, 톤 지침의 문체로 쓸 수 있는 이유. safe에서 지킬 것은 세계 규칙과 문체뿐이다. "주제나 결론을 유지한다"는 safe의 근거로 인정하지 않는다. 기존 문서들과 다른 결론에 이르러도 된다.
## 할 일 3: ${pick}개 고르기
후보 중 ${pick}개를 고른다. area가 같은 후보는 하나만 고른다. 기준은 "원안을 읽은 사람이 바로 떠올릴 법한가? 그렇다면 버린다"이다. 단 safe를 설명하지 못하는 후보는 의외성이 높아도 버린다. 장르·분위기·세계 규칙을 바꾸는 후보('갑자기 코미디', '다른 행성 이야기' 같은 것)도 버린다. 고른 것이 한 축에 몰리지 않게 한다.
## 할 일 4: 작성된 문서 분류
위 항목 중 '작성됨'인 문서가 각각 후보(고르지 않은 후보 포함) 중 어디에 해당하는지 고른다. 세계의 중심 시선이거나 어느 각도에도 맞지 않으면 null로 둔다.
JSON 하나만 출력: {"dominant":"기존 문서들이 공통으로 내린 결론 한 문장","candidates":[{"id":"c1","axis":"${ANGLE_AXES.map(x => x[0]).join(" 또는 ")}","label":"각도 한 줄 설명","area":"다루는 영역(짧은 명사구)","consequence":"핵심 설정이 작중 시점까지 지속된 기간 동안 생겼을 법한 결과","surprise":"바로 떠올리지 못할 이유","contrast":"dominant와 다른 점","scene":"이 세계에서만 나올 구체적인 장면이나 사물 한 문장","safe":"세계 규칙과 문체를 지킬 수 있는 이유"}],"picked":["고른 후보 id ${pick}개"],"classify":[{"key":"문서 key","angle":"후보 id 또는 null"}]}`;
}
const squash = t => String(t || "").replace(/[\s\p{P}\p{S}]/gu, "");
/* 규칙을 다시 말한 것뿐인 결과는 근거로 인정하지 않는다 */
function restatesRule(w, text) {
  const c = squash(text); if (!c) return true;
  return [w.seed, ...(w.rules || [])].map(squash).filter(r => r.length >= 4).some(r => r.includes(c) || (c.includes(r) && c.length <= r.length * 1.3));
}
/* 응답을 각도 목록으로 바꾼다. 고른 후보부터, 모자라면 나머지 후보로 채운다.
   필드가 빠졌거나 규칙을 되풀이했거나 관련 문서가 ANGLE_CROWDED개 이상인 후보는 버린다 */
function parseAngles(w, r, prior = [], pick = ANGLE_PICK) {
  const field = (a, k, n) => typeof a?.[k] === "string" ? norm(a[k]).slice(0, n) : "";
  const cands = (Array.isArray(r?.candidates) ? r.candidates : []).filter(a => a && typeof a === "object");
  const byDoc = new Map(), counts = new Map();   // 문서 하나는 한 후보에만 센다
  for (const c of Array.isArray(r?.classify) ? r.classify : []) { const e = c && w.entities[c.key]; if (e && (e.page || S.pages[c.key])) byDoc.set(c.key, c.angle == null ? null : String(c.angle)); }
  for (const id of byDoc.values()) if (id !== null) counts.set(id, (counts.get(id) || 0) + 1);
  const picked = Array.isArray(r?.picked) ? r.picked.map(String) : [];
  const order = [...picked.map(id => cands.find(a => String(a.id) === id)).filter(Boolean), ...cands.filter(a => !picked.includes(String(a.id)))];
  const out = [], areas = new Set(prior.map(a => squash(a?.area)).filter(Boolean));   // 기존 각도(활성·은퇴·삭제 전체)와 같은 영역도 버린다
  let next = Math.max(0, ...prior.map(a => +String(a?.id || "").replace(/^a/, "") || 0)) + 1;
  for (const a of order) {
    const area = field(a, "area", 60), areaKey = squash(area);
    if (!areaKey || areas.has(areaKey)) continue;
    const label = field(a, "label", 80), consequence = field(a, "consequence", 300), surprise = field(a, "surprise", 300), safe = field(a, "safe", 300), scene = field(a, "scene", 200), contrast = field(a, "contrast", 300);
    const axis = ANGLE_AXES.some(x => x[0] === a.axis) ? a.axis : "", existing = counts.get(String(a.id)) || 0;
    if (!label || !consequence || !safe || !scene || restatesRule(w, consequence) || (ANGLE_FLIP.includes(axis) && !contrast) || existing >= ANGLE_CROWDED || out.some(x => x.label === label)) continue;
    areas.add(areaKey);
    out.push({ id: "a" + next++, label, area, axis, consequence, surprise, contrast, scene, safe, existing, uses: 0, scenes: [], off: false });   // 새 각도는 언제나 쓰지 않은 상태로 시작
    if (out.length >= pick) break;
  }
  return out.length ? { angles: out, dominant: field(r, "dominant", 300) } : null;
}
/* 각도 목록을 AI 호출 한 번으로 만든다. 실패하면 null(랜덤 서핑은 각도 없이 계속한다) */
async function buildAngles(w, signal, prior = [], pick = ANGLE_PICK) {
  try {
    const r = await callJson("angles", anglesPrompt(w, prior, pick), { modelTier: "default", ...(signal ? { signal } : {}) }, { title: w.title });
    if (signal?.aborted) throw { code: "cancelled" };
    return parseAngles(w, r, prior, pick);
  } catch (e) { if (e?.code === "cancelled" || signal?.aborted) throw { code: "cancelled" }; return null; }
}
const anglesTried = new Set();   // 이번 접속에서 목록 만들기를 이미 시도한 세계관(실패해도 랜덤 서핑마다 다시 부르지 않는다)
async function ensureAngles(w, signal) {
  if (Array.isArray(w.angles) || w.angleOff || anglesTried.has(w.id)) return;
  anglesTried.add(w.id);
  const list = await buildAngles(w, signal);
  if (!list || Array.isArray(w.angles) || S.world !== w) return;
  w.angles = list.angles; w.angleDominant = list.dominant;
  try { await Store.saveWorld(w); } catch {}
}
/* 문서가 실제로 저장된 뒤에만 각도 사용을 기록한다 */
async function recordAngle(w, key, used, scene = "") {
  try {
    const page = S.pages[key]; if (!page || !(await Store.getPage(w.id, key))) return;
    const last = w.angleLast, a = noteAngleUse(w, used, scene);
    if (a) { page.angle = a.id; await Store.savePage(w.id, page); }
    if (a || last) await Store.saveWorld(w);
  } catch {}
  maybeRefillAngles(w);
}
/* 켜져 있고 은퇴하지 않은 각도가 ANGLE_MIN_ACTIVE개 미만이면 생성 작업 뒤에 ANGLE_REFILL개를 보충한다. 실패는 조용히 넘기고 다음 기회에 다시 시도한다 */
let angleRefilling = null;
function maybeRefillAngles(w) {
  if (!w || !Array.isArray(w.angles) || !w.angles.length || w.angleOff || !S.sample || angleRefilling || S.angleGen) return null;
  if (liveAngles(w).length >= ANGLE_MIN_ACTIVE) return null;
  const run = angleRefilling = (async () => {
    try {
      const r = await buildAngles(w, null, w.angles, ANGLE_REFILL);
      if (!r || !S.worlds.some(x => x.id === w.id)) return;
      const ids = new Set(w.angles.map(a => a.id)), areas = new Set(w.angles.map(a => squash(a.area)).filter(Boolean));
      const add = r.angles.filter(a => !ids.has(a.id) && !areas.has(squash(a.area)));
      if (!add.length) return;
      w.angles.push(...add); await Store.saveWorld(w);
      if (S.world === w && S.view.name === "canon") renderMain();
    } catch {} finally { if (angleRefilling === run) angleRefilling = null; }
  })();
  return run;
}
async function regenAngles() {
  const w = S.world; if (!w || !S.sample || S.angleGen || S.discovery?.busy) return;
  S.angleGen = w.id; renderMain();
  const kept = (w.angles || []).map(a => a.retired || a.removed ? a : { ...a, removed: true, endedAt: Date.now() });   // 은퇴·삭제·이전 각도는 다시 만들지 않게 남긴다
  let list = null; try { list = await buildAngles(w, null, kept); } catch {}
  S.angleGen = null;
  if (list && S.world === w) { w.angles = [...kept, ...list.angles]; w.angleDominant = list.dominant; w.angleLast = false; try { await Store.saveWorld(w); toast(`각도 ${list.angles.length}개를 새로 만들었습니다.`); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); } }
  else toast("각도 목록을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  if (S.world === w && S.view.name === "canon") renderMain();
}
async function editAngle(id, op, value) {
  const w = S.world; if (!w || !Array.isArray(w.angles)) return;
  const i = w.angles.findIndex(a => a.id === id); if (i < 0) return;
  if (op === "toggle") w.angles[i].off = !w.angles[i].off;
  else if (op === "delete") { w.angles[i].removed = true; w.angles[i].endedAt = Date.now(); }   // 다시 만들지 않게 기록은 남긴다
  else if (op === "revive") { delete w.angles[i].retired; delete w.angles[i].endedAt; }
  else if (op === "label") { const label = norm(value || "").slice(0, 80); if (!label) { toast("각도 문구를 비울 수 없습니다."); return; } w.angles[i].label = label; }
  try { await Store.saveWorld(w); } catch (err) { toast("저장하지 못했습니다. " + errMsg(err)); }
  if (op === "label") toast("각도 문구를 고쳤습니다.");
  if (S.view.name === "canon") renderMain();
}
function anglesHtml(w) {
  const all = Array.isArray(w.angles) ? w.angles : null, list = all ? all.filter(a => !a.removed) : null, removed = all ? all.length - list.length : 0, busy = S.angleGen === w.id;
  const item = a => `<li class="${a.off || a.retired ? "off" : ""}"><input class="txt" data-angle-label="${esc(a.id)}" maxlength="80" value="${esc(a.label)}" aria-label="각도 문구"><span class="src">${!a.area ? `<b data-angle-legacy="${esc(a.id)}">이전 버전에서 만든 각도입니다. 다시 만들기를 권장합니다.</b><br>` : ""}${a.retired ? `<b data-angle-retired="${esc(a.id)}">은퇴 · ${ANGLE_MAX_USES}번 사용</b> · ` : ""}${a.axis ? esc(a.axis) + " · " : ""}${a.area ? "영역: " + esc(a.area) + " · " : ""}이 세계에서 생긴 결과: ${esc(angleBasis(a))}${a.surprise ? `<br>의외인 이유: ${esc(a.surprise)}` : ""}${a.scene ? `<br>장면: ${esc(a.scene)}` : ""}${a.contrast ? `<br>기존 결론과 다른 점: ${esc(a.contrast)}` : ""}${a.safe ? `<br>규칙·문체를 지키는 이유: ${esc(a.safe)}` : ""}${a.scenes?.length ? `<br>쓴 장면: ${a.scenes.map(esc).join(" / ")}` : ""} · <span data-angle-stat="${esc(a.id)}">기존 문서 ${a.existing || 0}개 · 사용 ${a.uses || 0}번</span>${a.off ? " · 꺼짐" : ""}</span>
      <div class="row" style="margin-top:4px"><button type="button" class="btn" data-angle-save="${esc(a.id)}">문구 저장</button>${a.retired ? `<button type="button" class="btn" data-angle-revive="${esc(a.id)}">다시 켜기</button>` : `<button type="button" class="btn" data-angle-toggle="${esc(a.id)}">${a.off ? "켜기" : "끄기"}</button>`}<button type="button" class="btn" data-angle-del="${esc(a.id)}">삭제</button></div></li>`;
  return `<h2 id="angles">랜덤 서핑 각도</h2>
    <p class="note">새 문서(랜덤 서핑, 빨간 링크, 방향을 정한 작성)의 ${Math.round(ANGLE_RATE * 100)}%에 아래 각도 하나를 얹습니다. 랜덤 서핑은 그 시선에서 새 대상을 고르고, 대상이 정해진 문서는 섹션 하나(인물은 태도)만 그 시선으로 씁니다. 어조·문체·세계 규칙은 그대로이고, 두 문서 연속으로 쓰지 않으며, 다시 쓰기에는 쓰지 않습니다. 튀는 각도는 끄거나 지워 주세요.</p>
    <p class="note">각도는 ${ANGLE_MAX_USES}번 쓰면 은퇴하고, 쓸 수 있는 각도가 ${ANGLE_MIN_ACTIVE}개 미만이 되면 문서를 하나 만든 뒤 ${ANGLE_REFILL}개를 새로 보충합니다. 링크로 이어진 문서가 쓴 각도는 고르지 않습니다.</p>
    <label class="lb" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-angle-off ${w.angleOff ? "checked" : ""}>이 세계관에서 각도 쓰지 않기 <span class="note">모든 새 문서에 적용</span></label>
    ${w.angleDominant ? `<p class="note">기존 문서들의 공통 결론: ${esc(w.angleDominant)}</p>` : ""}
    ${list ? (list.length ? `<ul class="angles">${list.map(item).join("")}</ul>` : `<p class="note">각도가 없습니다.</p>`)
      : `<p class="note">아직 만들지 않았습니다. 랜덤 서핑을 처음 쓸 때 자동으로 만듭니다.</p>`}
    ${removed ? `<p class="note" id="anglesRemoved">삭제한 각도 ${removed}개는 다시 만들거나 보충할 때 겹치지 않도록 기억해 둡니다.</p>` : ""}
    <div class="row"><button type="button" class="btn" data-act="angles-regen" ${!S.sample || busy || S.discovery?.busy ? "disabled" : ""}>${busy ? "만드는 중…" : list ? "각도 목록 다시 만들기" : "각도 목록 만들기"}</button><span class="note">원안·규칙·분위기·작가 지침과 기존 항목을 보고 새로 뽑고, 작성된 문서 수를 다시 셉니다. 지금까지의 각도와 겹치지 않게 만듭니다. 이미 있는 목록은 이 버튼을 눌러야만 바뀝니다.</span></div>`;
}
function discoveryPrompt(w, direction, rejected, angle = null) {
  const index = discoveryIndex(w);
  const anchors = [...new Set([w.mainKey, ...S.recent.slice(0, 5)])].filter(k => S.pages[k]).map(k => `「${w.entities[k]?.title || S.pages[k].title}」: ${firstPara(S.pages[k]).slice(0, 600)}`).join("\n");
  return `## 랜덤 서핑의 새 대상 선정
세계관 위키에 아직 한 번도 등록되지 않은 새 문서의 대상을 하나 고른다. 아래의 기존 항목은 작성 여부와 무관하게 절대로 선택하지 않는다.
${canonBlock(w)}
## 작가 지침
${w.guide || "(없음)"}
${toneBlock(w)}
${isStory(w) ? storyBlock(w, w.mainKey, true) : ""}
## 세계관의 중심을 보여 주는 문서
${anchors || "원안과 규칙에서 세계관의 중심 소재를 읽는다."}
## 제외할 기존 항목 전체 (빨간 링크 포함)
${JSON.stringify(index)}
## 사용자 설명
${direction || "세계관 안에서 새로 발견할 가치가 있는 대상을 무작위로 하나 고른다."}
${angleBlock(angle, true)}
${angle && direction ? "사용자 설명이 성격·태도·시선을 이미 정했다면 이번 각도는 버리고 angle을 null로 쓴다. 사용자가 정한 대상·이름·역할은 각도보다 항상 우선한다. 설명이 대상(무엇)만 정했다면 이 각도를 얹는다.\n" : ""}## 선정 원칙
- 원안·작가 지침·대표 문서에서 중심 소재와 장르를 먼저 읽는다. '이 세계관의 특징이 없었어도 똑같이 존재할 문서인가?'를 자문하고, 그렇다면 다시 고른다. 세계관과 관계없는 평범한 시민의 신상이나 무관한 현실 지식 문서를 끼워 넣지 않는다.
- 중심 소재와 직접 연결되는 역할·경험·관계·사건·생활상을 가진 새 대상을 고른다. 군사 세계관이라고 전투나 무기만 뽑지는 않는다. 정비·검진·산업·생활·문화도 중심 특징에서 자연스럽게 파생될 때 다룬다. 모든 대상을 억지로 세계적 인물이나 대사건으로 만들지 않는다.
- 인물·장소·사건·물건·조직·제도·문화 등 종류를 다양하게 검토하되, 다양성보다 세계관과의 연결을 우선한다.
- 기존 항목은 이름만 바꾸거나, 본명·코드명·다른 호칭으로 다시 만들지 않는다. 기존 빨간 링크는 사용자가 아직 선택하지 않은 대상이므로 재활용하지 않는다. 이름이 달라도 핵심 역할·목적·범위가 사실상 같거나, 기존 개념을 조금 좁히거나 넓혀 재포장한 후보는 제외한다. 제목 차이만으로 새롭다고 판단하지 않는다.
- 이름·콘셉트를 정하는 이번 응답 안에서 기존 항목 전체와 정체성·역할·목적·대상·장소·시기·범위를 비교한다. 요약뿐 아니라 확정 사실과 다른 문서의 언급을 읽고, 가장 가까운 기존 항목 최대 3개의 정확한 key와 차이를 novelty.comparisons에 쓴다. 단어가 다르다는 이유로 novel을 주지 않는다.
- 같은 기능의 조직·시설·제도를 다른 이름으로 만들기, 기존 개념의 범위를 조금 좁히거나 넓히기, 일부 단계·시간대·부서·사례를 떼어 재포장하기도 overlap이다. '거인병 정기 검진'이 있는데 '거대 병사 주간 건강 점검'을 새 제도로 고르는 경우가 그 예다.
- 관련 있다는 이유만으로 중복이라 하지 않는다. 같은 직업인 별개 인물, 별개 발생 사건, 독립된 목적·기능이 있는 대상은 구체적인 차이가 확인되면 novel이다. 별개라는 근거가 부족하면 차이를 지어내지 말고 uncertain으로 판정한다. 아직 내용이 없는 빨간 링크를 빈틈으로 이용하지 않는다.
- 랜덤 후보가 overlap이면 이번 응답 안에서 다른 콘셉트를 골라 비교한 후 novel인 최종 후보 하나만 출력한다. 사용자 설명을 지키면서 다른 대상을 고를 수 없다면 existing 또는 unsuitable로 알린다. 비교 판정을 생략하지 않는다.
- 사용자 설명이 있으면 그것이 무엇인지, 역할·종류·이름을 그대로 존중한다. 예를 들어 '미국의 마라톤 선수. 이름은 제임스 그레이'는 인물의 이름과 직업을 지정한 것이지 검색어 전체가 제목인 것이 아니다. 이름이 없으면 어울리는 이름을 짓는다. 설명을 지키면서 자연스러운 연결을 만들 수 없다면 unsuitable에 이유를 쓴다.
- 사용자 설명이 이미 있는 대상을 뜻하면 {"existing":"기존 항목의 정확한 제목"}만 출력한다. 중복 없이 만들 수 없다면 기존 대상을 새것이라고 우기지 않는다.
${rejected.length ? "## 이미 거절된 후보 — 다시 선택하지 않는다\n" + rejected.join("\n") : ""}
연결 근거를 점검해 원안·규칙·작가 지침의 구체적인 특징에 직접 이어지면 fit을 strong, 연결이 막연하거나 부자연스러우면 weak로 쓴다. 근거가 약한데 strong이라고 우기지 않는다.
새 후보는 JSON 하나: {"fit":"strong 또는 weak","title":"새 문서 제목(60자 이하)","type":"${TYPES.join(" 또는 ")}","summary":"대상이 무엇인지 한두 문장","connection":"이 세계관의 중심 특징과 어떻게 직접 이어지는지 구체적인 이유","direction":"문서 작성 시 지킬 대상의 정체성과 작성 방향","aliases":["같은 대상의 다른 이름이 있으면"],"angle":${angle ? `"${angle.id}" 또는 null(이번 각도를 따르지 못했을 때)` : "null"},"novelty":{"verdict":"novel 또는 overlap 또는 uncertain","reason":"개념 중복 판정 근거","comparisons":[{"key":"가장 가까운 기존 항목의 정확한 key","reason":"기존 개념과의 독립적인 차이 또는 겹치는 범위"}]}}
기존 항목이 하나도 없을 때만 comparisons를 빈 배열로 둔다. 부적합하면 {"unsuitable":"이유"}.`;
}
function openDiscoveryPrompt() {
  if (!S.world || discoveryOccupied() || S.discovery?.busy) { toast("현재 작업을 마치거나 중단한 뒤 새 문서를 만들 수 있습니다."); return; }
  if (!S.discovery || S.discovery.wid !== S.world.id) S.discovery = { wid: S.world.id, direction: "", busy: false, error: "" };
  S.discovery.error = ""; S.view = { name: "discovery" }; renderAll(); $("#discoveryDirection")?.focus();
}
async function discoverWorld(direction = "") {
  const w = S.world;
  if (!w || discoveryOccupied() || S.discovery?.busy) return;
  const v = S.discovery = { wid: w.id, direction: String(direction).trim().slice(0, 2000), busy: false, error: "", ctl: new AbortController() };
  S.view = { name: "discovery" };
  if (!S.sample) { v.error = "AI 연결 설정에서 Gemini 문서 모델 연결을 저장해 주세요."; renderAll(); return; }
  v.busy = true; renderAll(); window.scrollTo({ top: 0 });
  const rejected = []; let candidate = null, target = null, angle = null;
  const discard = () => { if (target && !S.pages[target] && w.entities[target] === candidate) { delete w.entities[target]; S.recent = S.recent.filter(k => k !== target); } target = null; candidate = null; };
  try {
    if (!v.direction && !w.angleOff && !Array.isArray(w.angles)) { v.phase = "각도"; if (S.view.name === "discovery") renderMain(); await ensureAngles(w, v.ctl.signal); }
    if (v.ctl.signal.aborted || S.world !== w || S.discovery !== v) throw { code: "cancelled" };
    angle = v.angle = pickAngle(w, null);
    for (let attempt = 0; attempt < (v.direction ? 1 : 3); attempt++) {
      v.phase = "선정"; if (S.view.name === "discovery") renderMain();
      const basis = discoveryBasis(w);
      const plan = await callJson("discovery", discoveryPrompt(w, v.direction, rejected, angle), { modelTier: "default", signal: v.ctl.signal }, { title: w.title });
      await assertDiscoveryCurrent(w, null, basis, v.ctl.signal);
      if (v.ctl.signal.aborted || S.world !== w || S.discovery !== v) throw { code: "cancelled" };
      if (typeof plan?.unsuitable === "string") throw new Error(plan.unsuitable.slice(0, 400));
      const named = typeof plan?.existing === "string" ? plan.existing : null;
      const title = typeof plan?.title === "string" ? norm(plan.title) : "";
      const aliases = Array.isArray(plan?.aliases) ? plan.aliases.filter(x => typeof x === "string").slice(0, 8) : [];
      const duplicate = named ? discoveryOwner(w, named) : [title, ...aliases].map(name => discoveryOwner(w, name)).find(Boolean);
      if (named && !duplicate) throw new Error("기존 대상이라는 응답을 받았지만 해당 항목을 확인하지 못했습니다.");
      if (duplicate || named) {
        if (v.direction) throw new Error(`「${named || w.entities[duplicate]?.title || title}」은(는) 이미 등록된 항목입니다. 빨간 링크도 새로 만들지 않습니다.`);
        rejected.push(named || title); continue;
      }
      if (!title || title.length > 60 || !TYPES.includes(plan?.type) || typeof plan?.summary !== "string" || !plan.summary.trim() || typeof plan?.connection !== "string" || !plan.connection.trim()) throw new Error("새 대상의 이름·종류·세계관 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (plan.fit !== "strong") throw new Error(`「${title}」의 세계관 연결 근거가 부족합니다.`);
      const key = keyOf(title);
      if (discoveryOwner(w, title)) { rejected.push(title); continue; }
      try { validateDiscoveryNovelty(w, plan.novelty); }
      catch (err) {
        if (err.code !== "discovery_duplicate") throw err;
        if (v.direction) throw new Error(`「${title}」은(는) 기존 「${err.existing}」과 개념이 겹칩니다. ` + (err.reason || ""));
        rejected.push(`${title}: 기존 「${err.existing}」과 개념 중복. ${err.reason || ""}`); continue;
      }
      const used = angle && (v.direction ? plan.angle === angle.id : plan.angle !== null) ? angle : null;   // 각도를 버렸다고 답하면 각도 없이 쓴다. 설명이 있으면 명시적으로 받아들였을 때만
      v.angle = used;
      candidate = newEntity(title, plan.type, plan.summary.slice(0, 400)); candidate.src = "discovery";
      w.entities[key] = candidate; target = key; v.target = key; v.phase = "작성"; S.recent = [key, ...S.recent.filter(x => x !== key)].slice(0, 8);
      try {
        const res = await generatePage(key, false, [v.direction, angleBlock(used), "대상: " + plan.summary, "세계관과의 연결: " + plan.connection.slice(0, 1000), typeof plan.direction === "string" ? plan.direction.slice(0, 2000) : "", "기존 항목과의 독립적인 차이를 유지한다: " + plan.novelty.reason + "\n" + plan.novelty.comparisons.map(x => `「${w.entities[x.key].title}」: ${x.reason}`).join("\n")].filter(Boolean).join("\n"), true, used);
        if (S.pages[key]) { target = null; candidate = null; await recordAngle(w, key, used, res?.sceneUsed); return; }
        throw new Error("문서를 완성하지 못했습니다. 다시 시도해 주세요.");
      } catch (e) {
        discard();
        if (e.code === "discovery_duplicate") {
          if (v.direction) throw new Error(`「${e.existing || title}」은(는) 기존 대상과 같거나 개념이 겹칩니다. 새 문서를 만들지 않았습니다. ${e.reason || ""}`);
          rejected.push(`${title}: 기존 「${e.existing || title}」과 개념 중복. ${e.reason || ""}`); continue;
        }
        throw e;
      }
    }
    throw new Error("기존 항목과 겹치지 않는 새 대상을 고르지 못했습니다. 다시 시도하거나 내용을 지정해 주세요.");
  } catch (e) {
    discard(); v.error = e.code === "cancelled" ? "새 문서 생성을 중단했습니다." : (e.message || errMsg(e));
    if (S.world === w && S.discovery === v) { S.genErr = null; S.view = { name: "discovery" }; renderAll(); }
  } finally {
    v.busy = false;
    // 완성된 문서는 discovery가 끝나기 전에 그려지므로(이미지·편집 버튼이 잠긴 채) 끝난 뒤 다시 그린다
    if (S.discovery === v) { renderTop(); if (S.world === w && (S.view.name === "discovery" || (S.view.name === "article" && S.view.key === v.target))) renderMain(); }
  }
}
function discoveryHtml() {
  const v = S.discovery, w = S.world;
  if (!v || !w || v.wid !== w.id) return `<div class="sheet"><p>세계관을 먼저 열어 주세요.</p></div>`;
  return `<section class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>랜덤 서핑</span></div><h1 class="t">새 문서 발견하기</h1>
    <p class="note">세계관의 중심 소재에서 자연스럽게 뻗어 나온 새 대상을 만듭니다. 작성된 문서·빨간 링크·별칭으로 이미 등록된 대상은 선택하지 않습니다.</p>
    <label class="lb" for="discoveryDirection">어떤 대상을 만들까요? <span class="note">선택</span></label><textarea id="discoveryDirection" rows="5" maxlength="2000" ${v.busy ? "disabled" : ""} placeholder="예: 주인공이 소속된 조직의 전담 의무관. 이름은 제임스 그레이. 현장 경험이 많은 인물.">${esc(v.direction || "")}</textarea>
    <p class="note">이름뿐 아니라 대상의 종류·역할·특징을 적을 수 있습니다. 비워 두면 세계관에 어울리는 새 대상을 고릅니다.</p>
    <label class="lb" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-angle-off ${w.angleOff ? "checked" : ""} ${v.busy ? "disabled" : ""}>이 세계관에서 각도 쓰지 않기 <span class="note">랜덤 서핑·빨간 링크 등 모든 새 문서에 적용합니다. 켜 두면 가끔 세계를 다른 자리에서 비추는 시선을 얹습니다.</span></label>
    <div class="tools" style="margin-top:4px"><button type="button" class="btn" data-act="angles-open" ${v.busy ? "disabled" : ""}>각도 목록 보기</button></div>
    ${v.busy ? `<p role="status"><span class="dot"></span>${v.phase === "각도" ? "세계관의 각도 목록을 만드는 중…" : v.phase === "작성" ? "새 문서를 작성하는 중…" : "세계관에 맞는 새 대상과 기존 항목의 차이를 검토하는 중…"}${v.angle ? ` <span id="discoveryAngle">이번 각도: ${esc(v.angle.label)}</span>` : ""}</p>` : ""}${v.error ? `<div class="banner warn" role="alert">${esc(v.error)}</div>` : ""}
    ${!S.sample ? `<button type="button" class="btn" data-act="gset">AI 연결 설정</button>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="discovery-create" ${v.busy || !S.sample ? "disabled" : ""}>${v.direction ? "이 내용으로 새 문서 만들기" : "랜덤으로 새 문서 만들기"}</button>${v.busy ? `<button type="button" class="btn" data-act="discovery-stop">생성 중단</button>` : `<button type="button" class="btn" data-act="discovery-back">문서로 돌아가기</button>`}</div></section>`;
}
