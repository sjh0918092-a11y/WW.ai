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
function discoveryPrompt(w, direction, rejected) {
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
## 선정 원칙
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
새 후보는 JSON 하나: {"fit":"strong 또는 weak","title":"새 문서 제목(60자 이하)","type":"${TYPES.join(" 또는 ")}","summary":"대상이 무엇인지 한두 문장","connection":"이 세계관의 중심 특징과 어떻게 직접 이어지는지 구체적인 이유","direction":"문서 작성 시 지킬 대상의 정체성과 작성 방향","aliases":["같은 대상의 다른 이름이 있으면"],"novelty":{"verdict":"novel 또는 overlap 또는 uncertain","reason":"개념 중복 판정 근거","comparisons":[{"key":"가장 가까운 기존 항목의 정확한 key","reason":"기존 개념과의 독립적인 차이 또는 겹치는 범위"}]}}
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
  const rejected = []; let candidate = null, target = null;
  const discard = () => { if (target && !S.pages[target] && w.entities[target] === candidate) { delete w.entities[target]; S.recent = S.recent.filter(k => k !== target); } target = null; candidate = null; };
  try {
    for (let attempt = 0; attempt < (v.direction ? 1 : 3); attempt++) {
      v.phase = "선정"; if (S.view.name === "discovery") renderMain();
      const basis = discoveryBasis(w);
      const plan = await callJson("discovery", discoveryPrompt(w, v.direction, rejected), { modelTier: "default", signal: v.ctl.signal }, { title: w.title });
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
      candidate = newEntity(title, plan.type, plan.summary.slice(0, 400)); candidate.src = "discovery";
      w.entities[key] = candidate; target = key; v.target = key; v.phase = "작성"; S.recent = [key, ...S.recent.filter(x => x !== key)].slice(0, 8);
      try {
        await generatePage(key, false, [v.direction, "대상: " + plan.summary, "세계관과의 연결: " + plan.connection.slice(0, 1000), typeof plan.direction === "string" ? plan.direction.slice(0, 2000) : "", "기존 항목과의 독립적인 차이를 유지한다: " + plan.novelty.reason + "\n" + plan.novelty.comparisons.map(x => `「${w.entities[x.key].title}」: ${x.reason}`).join("\n")].filter(Boolean).join("\n"), true);
        if (S.pages[key]) { target = null; candidate = null; return; }
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
    ${v.busy ? `<p role="status"><span class="dot"></span>${v.phase === "작성" ? "새 문서를 작성하는 중…" : "세계관에 맞는 새 대상과 기존 항목의 차이를 검토하는 중…"}</p>` : ""}${v.error ? `<div class="banner warn" role="alert">${esc(v.error)}</div>` : ""}
    ${!S.sample ? `<button type="button" class="btn" data-act="gset">AI 연결 설정</button>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="discovery-create" ${v.busy || !S.sample ? "disabled" : ""}>${v.direction ? "이 내용으로 새 문서 만들기" : "랜덤으로 새 문서 만들기"}</button>${v.busy ? `<button type="button" class="btn" data-act="discovery-stop">생성 중단</button>` : `<button type="button" class="btn" data-act="discovery-back">문서로 돌아가기</button>`}</div></section>`;
}
