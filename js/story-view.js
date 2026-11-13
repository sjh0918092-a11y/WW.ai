"use strict";
/* 스토리 모드 화면 */
/* ---------- 스토리 모드 화면 ---------- */
function storySideHtml(w) {
  const st = w.story, c = curCh(w), ended = st.status === "ended", pk = st.protagonistKey;
  const ex = exploreScores(w, c);
  const busy = S.storyGen ? `<div class="genpill" style="margin-top:8px"><span class="dot"></span><button type="button" class="btn" data-act="story-next" style="padding:2px 8px">${S.storyGen.n}장을 쓰는 중</button></div>` : "";
  return `<section class="story-side"><h4>이야기</h4>
    <div class="stat"><span><em>${ended ? "완결" : `${st.chapter}장`}</em><span class="src"> / ${totalOf(w)}장</span> 「${esc(c.title)}」</span><span>작중 ${esc(c.era)}</span></div>
    <ul><li><button type="button" data-k="${pk}" class="${S.view.name === "article" && S.view.key === pk ? "cur" : ""}">주인공 문서</button></li></ul>
    ${(() => { const fr = (c.fresh || []).filter(k => w.entities[k]); if (!fr.length) return ""; const unread = fr.filter(k => !S.pages[k]).length;
      return `<details${unread ? " open" : ""}><summary>새로 등장 ${fr.length}곳${unread ? ` · 안 읽음 ${unread}` : ""}</summary><ul>${fr.map(k => `<li><button type="button" data-k="${k}" style="${S.pages[k] ? "" : "color:var(--red)"}">${esc(w.entities[k].title)}</button></li>`).join("")}</ul></details>`; })()}
    ${ended ? "" : `<details><summary>이번 장 탐험 ${ex.length}곳</summary>${ex.length ? `<ul>${ex.map(x => `<li><button type="button" data-k="${x.k}" title="${esc(x.kinds.join(", "))}">${esc(w.entities[x.k].title)}</button></li>`).join("")}</ul>` : `<p class="note" style="margin:4px 0 0">아직 없습니다. 문서를 열고, 만들고, 고치면 쌓입니다.</p>`}</details>`}
    ${busy || (ended ? `<button type="button" class="btn pri" data-act="epilogue">에필로그 보기</button>` : `<button type="button" class="btn pri" data-act="story-next" ${!S.pages[pk] ? "disabled title=\"주인공 문서가 완성된 뒤 넘어갈 수 있습니다\"" : ""}>${st.chapter + 1 >= totalOf(w) ? "마지막 장으로" : "다음 장으로"}</button>`)}
  </section>`;
}
/* 장이 넘어간 직후 주인공 문서 위에 띄우는 카드. 이번 장 줄거리와 변화 내용은 스포일러라 보여 주지 않고,
   지난 장 줄거리와 이번 장에 엮인 탐험·영향받은 문서의 이름만 보여 준다 */
function storyCardHtml(w, n) {
  const c = w.story.chapters[n - 1], prev = w.story.chapters[n - 2]; if (!c) return "";
  const fresh = (c.fresh || []).filter(k => w.entities[k]);
  const aff = (c.affected || []).filter(a => w.entities[a.key] && !fresh.includes(a.key));
  const wove = (c.wove || []).filter(x => w.entities[x.key]);
  const endBtn = w.story.status === "ended" && n === w.story.chapter ? `<div class="row" style="margin:0 0 10px"><button type="button" class="btn pri" data-act="epilogue">에필로그로</button><span class="note">마지막 장입니다. 아래 ${n}장 섹션을 읽은 뒤 에필로그를 보세요.</span></div>` : "";
  return `<section class="stcard" aria-label="이번 장 안내">${endBtn}<h3><span class="chb">${n}장</span>${esc(c.title)}</h3><p class="src">작중 ${esc(c.era)}${c.choice ? ` · 고른 행동: ${esc(c.choice.custom || c.choice.picked)}` : ""}</p>
    ${prev ? `<h4>지난 이야기 · ${prev.n}장 「${esc(prev.title)}」</h4><p>${esc(prev.summary)}</p>` : ""}
    <h4>이번 장에 엮인 탐험</h4>${wove.length ? `<p>${wove.map(x => linkHtml(w.entities[x.key].title)).join(" · ")}</p>` : `<p class="note">엮인 탐험이 없습니다. 이번 장은 뼈대대로 흘러갑니다.</p>`}
    ${c.continuity?.warnings?.length ? `<p class="note">본문은 보관했습니다. 일부 진행 기록은 확인이 필요하며 이전 상태를 유지했습니다.</p>` : ""}${fresh.length ? `<h4>이번 장에 새로 등장</h4><p>${fresh.map(k => linkHtml(w.entities[k].title)).join(" · ")}</p>` : ""}
    ${aff.length ? `<h4>이번 장에 영향을 받은 문서</h4><p>${aff.map(a => linkHtml(w.entities[a.key].title)).join(" · ")}</p><p class="note" style="margin-top:4px">무엇이 바뀌었는지는 아래 ${n}장 섹션과 각 문서에서 확인할 수 있습니다. 파란 링크는 열면 이번 장의 변화를 덧붙이고, 빨간 링크는 이번 장 시점으로 새로 작성합니다.</p>` : ""}
    <div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="story-card-close">안내 닫기</button></div></section>`;
}
function storyRecordNotes(w) {
  const notes = w.story.chapters.filter(c => c.continuity?.warnings?.length);
  return notes.length ? `<details class="story-record-notes"><summary>진행 기록 확인 메모 · ${notes.length}개 장</summary>${notes.map(c => `<p>${c.n}장: 본문은 보관했으며 확인하지 못한 갱신은 이전 상태를 유지했습니다.</p><ul>${c.continuity.warnings.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}</details>` : "";
}
function storyMemoryHtml(w) {
  if (![1, 2].includes(w.story.continuity?.version)) return "";
  const memory = storyMemory(w);
  return `<details class="story-memory memo"><summary>이어지는 이야기와 선택의 영향 · ${memory.threads.length}건</summary><div style="padding:12px">
    ${storyRecordNotes(w)}${memory.focus ? `<p class="note">${esc(memory.focus)}</p>` : ""}<ul>${memory.threads.map(t => `<li><b>${esc(t.subject)}</b> <span class="src">· ${esc(STORY_THREAD_KINDS[t.kind] || "이전 기록")} · ${esc(STORY_THREAD_STATES[t.status] || "이어짐")}</span><p>${esc((STORY_THREAD_CLOSED.includes(t.status) ? t.outcome : "") || t.development || "")}</p>${t.consequence ? `<p>${esc(t.consequence)}</p>` : ""}<span class="src">출처: ${esc(t.origin.title || "이전 기록")} · “${esc(t.origin.quote)}”</span></li>`).join("")}</ul>
    ${memory.choices.length ? `<h4>선택이 남긴 변화</h4><ul>${memory.choices.map(c => `<li>${c.chapter}장 · ${esc(c.choice)}<ul>${c.consequences.map(x => `<li>${esc(x.detail)}</li>`).join("")}</ul>${c.pending ? `<span class="src">고른 행동은 보관됨 · 결과 기록 확인 필요</span>` : ""}</li>`).join("")}</ul>` : ""}</div></details>`;
}
function advanceHtml() {
  const w = S.world; if (!isStory(w)) return `<div class="sheet"><p class="note">스토리 모드 세계관이 아닙니다.</p></div>`;
  const st = w.story, c = curCh(w), n = st.chapter + 1, a = S.adv || { pick: -1, custom: "", err: "" }, g = S.storyGen;
  const head = `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>이야기</span></div><h1 class="t">${(g ? g.n : n) >= totalOf(w) ? "마지막 장으로" : `${g ? g.n : n}장으로`}</h1>`;   // 진행 중이면 진행 중인 장 번호(검사 단계에서는 이미 그 장이 반영되어 있다)
  if (g) return head + `<div class="gen-live" style="margin-top:14px"><span class="dot"></span><span id="stCount">${g.n}장 줄거리를 구상하는 중</span><button type="button" class="btn" data-act="story-stop">중단</button></div>
    <p class="note">앞서 시작한 일과 관계, 고른 행동의 결과를 이어 ${g.n}장 줄거리를 정하고, 주인공 문서에 ${g.n}장 섹션을 덧붙입니다. 중단하거나 실패하면 지금 상태 그대로 남습니다.</p>
    <div style="margin-top:14px"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></div>`;
  if (st.status === "ended") return head + `<p class="note">이야기가 끝났습니다.</p><div class="row"><button type="button" class="btn pri" data-act="epilogue">에필로그 보기</button></div></div>`;
  const ex = exploreScores(w, c);
  const choices = (c.nextChoices || []).filter(x => typeof x === "string" && x.trim() && !isBroken(x));
  return head + `<p class="note">${c.n}장 「${esc(c.title)}」 · 작중 ${esc(c.era)}</p>
    <h2 class="nf-h">이번 장에 탐험한 곳</h2>
    ${ex.length ? `<ul class="adv-list">${ex.slice(0, 12).map(x => `<li><span>${linkHtml(w.entities[x.k].title)}</span><span class="src">${esc(x.kinds.join(" · "))}</span></li>`).join("")}</ul>${ex.length > 8 ? `<p class="note">최근 탐험 중 8곳까지 참고합니다. 실제 인과가 있을 때만 줄거리에 쓰이며, 앞서 기록한 목표·관계·약속·여파는 탐험 여부와 관계없이 이어집니다.</p>` : `<p class="note">직접 고친 사실은 지킵니다. 탐험한 항목을 장면에 억지로 등장시키지는 않습니다.</p>`}` : ""}
    ${storyMemoryHtml(w)}
    <h2 class="nf-h">주인공의 다음 행동</h2>
    ${!choices.length ? `<div class="row" style="margin:6px 0 4px"><button type="button" class="btn" data-act="choices-regen" ${!S.sample || a.regen ? "disabled" : ""}>${a.regen ? "선택지를 만드는 중…" : "선택지 다시 만들기"}</button><span class="note">이 장의 행동 후보가 없습니다. 지금까지의 줄거리로 새로 만들 수 있습니다. 직접 정하거나 선택 없이 진행해도 됩니다.</span></div>` : ""}
    <div class="fx-list">${choices.map((x, i) => `<label class="fx-pick"><input type="radio" name="advPick" value="${i}" ${a.pick === i ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}
      <label class="fx-pick"><input type="radio" name="advPick" value="-2" ${a.pick === -2 ? "checked" : ""}><span>직접 정하기</span></label></div>
    <textarea id="advCustom" rows="3" maxlength="300" placeholder="예: 원균을 찾아가 함대 지휘권을 돌려 달라고 요구한다" ${a.pick === -2 ? "" : "hidden"}>${esc(a.custom || "")}</textarea>
    ${a.err ? `<div class="banner warn">${esc(a.err)}</div>` : ""}
    <div class="row"><button type="button" class="btn pri" data-act="story-go" ${!S.sample || (a.pick === -1) || (a.pick === -2 && !norm(a.custom)) ? "disabled" : ""}>이 행동으로 ${n}장 진행</button><button type="button" class="btn" data-act="story-skip" ${!S.sample ? "disabled" : ""}>선택 없이 진행</button><button type="button" class="btn" data-act="story-back">돌아가기</button></div>
    <p class="note" style="margin-top:10px">${n >= totalOf(w) ? "마지막 장에서 결말이 납니다. 이후에도 세계관은 '결말 이후' 시점으로 계속 탐험할 수 있습니다." : `주인공 문서에 ${n}장 섹션이 덧붙고, 이번 장에서 영향을 받은 문서는 열 때 ${n}장의 변화가 반영됩니다.`}${S.sample ? "" : " " + esc(ERR.no_sample)}</p></div>`;
}
function spineHtml(w) {
  const sec = secretsOf(w);
  return `<details class="memo"><summary>숨겨진 뼈대 보기</summary><ol class="spine">${w.story.spine.map(s => `<li><b>${esc(s.beat)}</b> — ${esc(s.intent)}${s.revised && s.orig ? `<br><span class="src">처음 계획: <del>${esc(s.orig)}</del> · 사건과 선택에 따라 바뀜</span>` : ""}</li>`).join("")}</ol>${sec.length ? `<h4 style="margin:10px 12px 4px">공개된 진실과 미사용 계획</h4><ul class="spine">${sec.map(x => `<li>${x.revealed ? "" : "미공개 집필 계획: "}${esc(x.truth)}<br><span class="src">드러나기 전: ${esc(x.cover)} · ${x.revealedAt ? `${x.revealedAt}장에서 드러남` : `미공개 · ${x.reveal}장 공개 검토 계획`}</span></li>`).join("")}</ul>` : ""}</details>`;
}
function epilogueHtml() {
  const w = S.world; if (!isStory(w)) return `<div class="sheet"><p class="note">스토리 모드 세계관이 아닙니다.</p></div>`;
  const st = w.story, pk = st.protagonistKey, pp = S.pages[pk];
  const secIdx = n => pp ? pp.sections.findIndex(s => s.ch === n && (s.level || 1) === 1) : -1;
  return `<div class="sheet"><div class="crumb"><span>${esc(w.title)}</span><span>이야기</span></div><h1 class="t">에필로그</h1>
    ${st.status === "ended" ? `<p style="margin:14px 0 0">${esc(st.epilogue)}</p>` : `<p class="note">아직 이야기가 끝나지 않았습니다. 지금까지의 장입니다.</p>`}
    <p class="note">주인공 ${linkHtml(w.entities[pk].title)}</p>
    ${st.chapters.map(c => { const i = secIdx(c.n); const wove = (c.wove || []).filter(x => w.entities[x.key]); return `<section class="ep-ch"><h3><span class="chb">${c.n}장</span>${esc(c.title)}</h3><span class="src">작중 ${esc(c.era)}${c.choice ? ` · 고른 행동: ${esc(c.choice.custom || c.choice.picked)}` : ""}</span>
      <p>${esc(c.summary)}</p>
      ${wove.length ? `<ul>${wove.map(x => `<li>탐험 반영: ${linkHtml(w.entities[x.key].title)} — ${esc(x.how)}</li>`).join("")}</ul>` : ""}
      ${i >= 0 ? `<div class="row" style="margin-top:8px"><button type="button" class="btn" data-epsec="${i}">주인공 문서의 ${c.n}장 섹션</button></div>` : ""}</section>`; }).join("")}
    ${storyMemoryHtml(w)}
    ${st.status === "ended" ? spineHtml(w) : ""}
    <div class="row"><button type="button" class="btn" data-k="${pk}">주인공 문서로</button></div>
    ${st.status === "ended" ? `<p class="note" style="margin-top:10px">이야기는 끝났지만 세계관은 계속 탐험할 수 있습니다. 새 문서는 결말 직후 시점으로 쓰입니다.</p>` : ""}</div>`;
}

function canonHtml() {
  const ex = S.worldExports[S.world.id] || { images: true, stories: true };
  const w = S.world; const ents = Object.entries(w.entities);
  const f = S.canonFilter;
  const shown = ents.filter(([, o]) => f === "all" || (f === "done" ? o.page : !o.page)).sort((a, b) => a[1].title.localeCompare(b[1].title, "ko"));
  const tab = (id, l, n) => `<button type="button" class="chip" data-filter="${id}" aria-pressed="${f === id}">${l} ${n}</button>`;
  return `<div class="sheet canon"><div class="crumb"><span>${esc(w.title)}</span><span>설정 노트</span></div>
    <h1 class="t">설정 노트</h1>
    <p class="note">문서를 작성할 때마다 아래 내용이 함께 전달됩니다. 사용자 확정 설정은 다른 모든 설정보다 우선합니다.</p>
    <h2>기본 정보</h2>
    <label class="lb" for="wTitle">세계관 이름</label><input id="wTitle" class="txt" maxlength="40" value="${esc(w.title)}">
    <label class="lb" for="wTag">한 줄 소개</label><input id="wTag" class="txt" maxlength="160" value="${esc(w.tagline || "")}">
    <dl class="kv" style="margin-top:12px"><dt>작중 기준 시점</dt><dd>${esc(w.era)}</dd><dt>저장 위치</dt><dd>${esc(storeLabel())}</dd></dl>
    <label class="lb" for="wHist" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="wHist" ${w.historical ? "checked" : ""}>실제 역사에서 갈라진 대체역사 <span class="note">실존 인물을 재해석해 등장시킵니다</span></label>
    <label class="lb">원안</label><div class="seedbox">${esc(w.seed)}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="regen-open" ${S.gen || S.storyGen || S.syncing ? "disabled" : ""}>이 원안으로 다시 만들기</button><span class="note">연표, 핵심 규칙, 분위기${isStory(w) ? ", 이야기" : ""}를 처음부터 새로 만듭니다. 처음 입력값을 고쳐서 만들 수도 있습니다.</span></div>
    ${isStory(w) ? `<h2>이야기</h2>
    <p class="note">주인공 ${linkHtml(w.entities[w.story.protagonistKey].title)} · ${w.story.status === "ended" ? "완결" : `현재 ${w.story.chapter}장 / ${totalOf(w)}장`}. 이야기의 뼈대는 ${w.story.status === "ended" ? "아래 '숨겨진 뼈대 보기'에서" : "결말이 난 뒤에"} 볼 수 있습니다.</p>
    <div style="overflow-x:auto"><table class="tl">${w.story.chapters.map(c => `<tr><td>${c.n}장</td><td><b>${esc(c.title)}</b> <span class="src">· ${esc(c.era)}</span><br>${c.n < w.story.chapter || w.story.status === "ended" ? esc(c.summary) : `<span class="note">진행 중인 장입니다. 줄거리는 다음 장으로 넘어가면 공개됩니다.</span>`}</td></tr>`).join("")}</table></div>
    ${w.story.protagonist?.desc || w.story.cast?.length ? `<dl class="kv" style="margin-top:12px">${w.story.protagonist?.desc ? `<dt>주인공 특징</dt><dd>${esc(w.story.protagonist.desc)}</dd>` : ""}${(w.story.cast || []).filter(c => w.entities[c.key]).map(c => `<dt>${linkHtml(w.entities[c.key].title)}</dt><dd>${esc([c.rel && "관계: " + c.rel, c.desc].filter(Boolean).join(" · ") || "(설명 없음)")}</dd>`).join("")}</dl><p class="note">처음에 정한 주인공 특징과 등장인물입니다. 사용자 확정 설정으로 모든 장과 문서에 반영됩니다.</p>` : ""}
    ${w.story.status === "ended" ? storyMemoryHtml(w) + spineHtml(w) : ""}` : ""}
    <h2>이미지 지침</h2>
    <label class="lb" for="wImageGuide">세계관 공통 이미지 지침</label><textarea id="wImageGuide" rows="4" maxlength="2000" placeholder="예: 1990년대 셀 애니메이션 화풍, 푸른 회색 팔레트, 시대에 맞는 복장, 글자 없는 그림">${esc(w.imageGuide || "")}</textarea>
    <p class="note">이 세계관의 모든 문서에서 이미지를 생성할 때 공통으로 참고합니다. 지침 저장만으로 기존 이미지를 바꾸지는 않습니다.</p>
    <h2>작가 지침</h2>
    <label class="lb" for="wGuide">세계관 전체에 걸쳐 지킬 방향 <span class="note" style="font-weight:400">문체와 구성 규칙보다 우선하고, 확정 설정보다는 뒤에 옵니다. 1,000자까지</span></label>
    <textarea id="wGuide" rows="4" maxlength="1000" placeholder="예: 양산기 바리에이션을 풍부하게. 개그는 줄이고 전쟁물처럼 쓴다.">${esc(w.guide || "")}</textarea>
    <h2>분위기</h2>
    <label class="lb" for="toneLabel">장르와 문화권</label>
    <input id="toneLabel" class="txt" maxlength="60" value="${esc(w.tone?.label || "")}" placeholder="아직 판별하지 않았습니다. 예: 일본 거대 로봇 메카닉 SF">
    <label class="lb" for="toneGuide">문체 지침 <span class="note" style="font-weight:400">한 줄에 하나</span></label>
    <textarea id="toneGuide" rows="${Math.min(10, (w.tone?.guide.length || 4) + 1)}">${esc((w.tone?.guide || []).join("\n"))}</textarea>
    <div class="row"><button type="button" class="btn" data-act="tone-detect" id="toneBtn" ${!S.sample ? "disabled" : ""}>지침 다시 만들기</button><span class="note">장르와 문화권 칸에 적힌 분위기로 지침을 만듭니다. 비워 두면 원안에서 판별합니다. 결과를 확인한 뒤 아래 '설정 저장'을 눌러 주세요.</span></div>
    <h2>핵심 규칙</h2>
    <label class="lb" for="rulesTa">한 줄에 하나씩</label>
    <textarea id="rulesTa" rows="${Math.min(12, (w.rules.length || 3) + 2)}">${esc(w.rules.join("\n"))}</textarea>
    <label class="lb" for="userTa">사용자 확정 설정</label>
    <textarea id="userTa" rows="4" placeholder="예: 태조의 전용기 이름은 '위화'다. 조선 콜로니의 수도는 한양 궤도 거주구다.">${esc(w.userCanon || "")}</textarea>
    <div class="row"><button type="button" class="btn pri" data-act="save-canon">설정 저장</button><span class="note">저장 후 새로 작성하는 문서부터 반영됩니다.</span></div>
    ${anglesHtml(w)}
    ${Object.keys(w.navboxes || {}).length ? `<h2>틀</h2><ul style="margin:0;padding-left:20px">${Object.values(w.navboxes).map(nb => `<li>${esc(nb.title)} <span class="src">· ${nb.members.length}개 항목 · ${linkHtml(nb.srcTitle)}</span></li>`).join("")}</ul>` : ""}
    ${(w.relations || []).length ? `<h2>인물 관계</h2><div style="overflow-x:auto"><table class="tl">${w.relations.filter(x => w.entities[x.a] && w.entities[x.b]).map(x => `<tr><td>${esc(x.rel)}</td><td>${linkHtml(w.entities[x.a].title)} – ${linkHtml(w.entities[x.b].title)}${x.story ? ` <span class="${x.sup ? "" : "note"}">${x.sup ? `<del>${esc(x.story)}</del>` : esc(x.story)}</span>` : ""} <span class="src">· ${esc(srcTitle(w, x.src, "?"))}${x.sup ? " · 대체됨" : ""}</span></td></tr>`).join("")}</table></div>` : ""}
    <h2>연표</h2>
    <div style="overflow-x:auto"><table class="tl">${w.timeline.map(t => `<tr><td>${esc(t.year)}</td><td>${t.sup ? `<del>${esc(t.event)}</del> <span class="src">· 「${esc(w.entities[t.sup.by]?.title || "?")}」 수정으로 대체됨</span>` : esc(t.event)}${t.src && t.src !== "seed" && w.entities[t.src] ? `<span class="src">· ${linkHtml(w.entities[t.src].title)}</span>` : t.ch ? `<span class="src">· ${t.ch}장</span>` : ""}</td></tr>`).join("") || `<tr><td></td><td class="note">없음</td></tr>`}</table></div>
    <h2>항목별 확정 사실</h2>
    <div class="tabs">${tab("all", "전체", ents.length)}${tab("done", "작성됨", ents.filter(x => x[1].page).length)}${tab("stub", "미작성", ents.filter(x => !x[1].page).length)}</div>
    ${shown.map(([k, o]) => `<details class="ent" id="ent-${k}"><summary><span class="et">${esc(o.title)}</span><span class="st ${o.page ? "on" : "off"}">${o.page ? "작성됨" : "미작성"}</span><span class="em">${esc(o.type || "유형 미정")} · 사실 ${o.facts.length} · 언급 ${o.mentions.length}</span></summary>
      ${o.summary ? `<p style="margin:6px 0 0 22px">${esc(o.summary)}</p>` : ""}
      <ul>${o.facts.map(x => `<li>${x.sup ? `<del>${esc(x.t)}</del>` : esc(x.t)} <span class="src">· ${esc(srcTitle(w, x.src, "사용자"))}${S.pages[x.src]?.editedAt ? " (직접 수정)" : ""}${x.sup ? ` · 「${esc(w.entities[x.sup.by]?.title || "?")}」 수정으로 대체됨` : ""}</span></li>`).join("")}${o.mentions.map(x => `<li>${x.sup ? `<del>“${esc(x.text)}”</del>` : `“${esc(x.text)}”`} <span class="src">· 「${esc(w.entities[x.from]?.title || "?")}」${x.sup ? ` · 「${esc(w.entities[x.sup.by]?.title || "?")}」 수정으로 대체됨` : ""}</span></li>`).join("")}</ul>
      <div style="margin:4px 0 6px 22px">${linkHtml(o.title, o.page ? "문서 열기" : "문서 작성하기")}</div></details>`).join("")}
    <section id="worldExport" aria-labelledby="worldExportTitle" style="margin-top:28px;border-top:1px solid var(--line);padding-top:8px">
      <h2 id="worldExportTitle">이 세계관 내보내기</h2>
      <p class="note">「${esc(w.title)}」의 설정과 문서만 JSON 파일로 내보냅니다. 설정을 수정했다면 위의 ‘설정 저장’을 누른 뒤 내보내 주세요.</p>
      <label class="lb" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="exportWorldImages" data-world-export="images" ${ex.images ? "checked" : ""}>이미지 포함 (문서 이미지·단편 삽화)</label>
      <label class="lb" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="exportWorldStories" data-world-export="stories" ${ex.stories ? "checked" : ""}>단편 포함</label>
      <p class="note">단편을 제외하면 단편 삽화도 제외됩니다. 선택은 내보낼 파일에만 적용하며 원래 데이터는 지우지 않습니다. AI 연결 설정의 ‘가져오기’로 복원할 수 있습니다.</p>
      <div class="row"><button type="button" class="btn pri" data-act="export-world">이 세계관 내보내기</button></div>
    </section>
  </div>`;
}
