"use strict";
/* 스토리 모드의 상태·탐험 기록과 프롬프트 */
/* ---------- 스토리 모드: 상태와 탐험 기록 ---------- */
/* 스토리 모드 세계관에만 w.mode = "story"와 w.story가 있다. 없으면 기본 모드로 동작한다.
   장 섹션은 문서의 sections 안에 ch 표시를 붙여 둔다. 그래서 편집, 검사, 대조, 고치기가 장 섹션도 함께 다룬다. */
const STORY_DEF = 5, STORY_MIN = 5, STORY_MAX = 10;   // 장 수는 세계관을 만들 때 5~10장 중에서 고른다
const BEATS = ["발단", "전개", "위기", "절정", "결말"];
const totalOf = w => Math.min(STORY_MAX, Math.max(STORY_MIN, +w?.story?.total || STORY_DEF));
/* 장 수에 맞춰 다섯 구간에 장을 나눈다. 늘어난 장은 전개, 위기, 절정 순으로 하나씩 더한다 (예: 8장 → 1·2·2·2·1) */
function beatsFor(total) {
  const cnt = [1, 1, 1, 1, 1], order = [1, 2, 3];
  for (let i = 0; i < Math.max(0, total - 5); i++) cnt[order[i % 3]]++;
  const out = []; cnt.forEach((c, b) => { for (let j = 0; j < c; j++) out.push(c > 1 ? `${BEATS[b]} ${j + 1}/${c}` : BEATS[b]); });
  return out;
}
const isStory = w => !!(w && w.mode === "story" && w.story);
const storyOn = w => isStory(w) && w.story.status !== "ended";
const curCh = w => w.story.chapters[w.story.chapter - 1] || w.story.chapters[w.story.chapters.length - 1];
const chSrc = n => "ch" + n;   // 장 계획이 확정한 사실·연표·관계의 출처
const chOf = src => { const m = /^ch(\d+)$/.exec(String(src || "")); return m ? +m[1] : 0; };
const srcTitle = (w, src, dflt) => src === "user" ? "사용자 설정" : chOf(src) ? `${chOf(src)}장 줄거리` : (w.entities[src]?.title || dflt);
const emptyExplore = () => ({ opened: {}, created: [], edited: [], searched: [] });
/* 이번 장 탐험 점수: 3·고침 + 3·검색 + 2·새 문서 + min(열람, 3) */
function exploreScores(w, ch) {
  const x = ch?.explore || emptyExplore(), sc = {}, pk = w.story.protagonistKey;
  const add = (k, n, kind) => { if (!w.entities[k] || k === pk) return; const o = (sc[k] ||= { k, s: 0, kinds: [] }); o.s += n; if (kind) o.kinds.push(kind); };
  for (const k of x.edited || []) add(k, 3, "직접 고침");
  for (const k of x.searched || []) add(k, 3, "검색해서 만듦");
  for (const k of x.created || []) add(k, 2, "새로 작성");
  for (const [k, n] of Object.entries(x.opened || {})) add(k, Math.min(n, 3), `${n}번 열람`);
  return Object.values(sc).sort((a, b) => b.s - a.s);
}
let exploreT = null;
/* 탐험 기록: 주인공 문서는 세지 않는다. 장마다 새로 등장한 항목을 읽는 것도 탐험으로 센다 */
function noteExplore(k, kind) {
  const w = S.world; if (!storyOn(w) || S.storyGen || !w.entities[k] || k === w.story.protagonistKey) return;
  const ch = curCh(w);
  const x = (ch.explore ||= emptyExplore());
  if (kind === "opened") x.opened[k] = (x.opened[k] || 0) + 1;
  else if ((x[kind] ||= []).includes(k)) return; else x[kind].push(k);
  clearTimeout(exploreT); exploreT = setTimeout(() => { Store.saveWorld(w).catch(() => {}); }, 1000);
  try { renderSide(); } catch {}
}
/* 이 문서에 아직 반영하지 않은 장 (그 장의 affected에 들어 있고, 문서가 그 장보다 앞서 쓰였을 때) */
function missingChs(w, k) {
  const p = S.pages[k]; if (!isStory(w) || !p || k === w.story.protagonistKey) return [];
  const from = p.syncedTo ?? p.baseAsOf ?? 0;
  return w.story.chapters.filter(c => c.n > from && c.n <= w.story.chapter && (c.affected || []).some(a => a.key === k)).map(c => c.n);
}
/* 장 제목에서 "제2장:", "2장 —", "Chapter 2.", "(2장)" 같은 장 번호를 뗀다. 장 번호는 앱이 배지로 붙인다 */
const CH_NUM = "(?:제\\s*)?\\d+\\s*장|chapter\\s*\\d+|ch\\.?\\s*\\d+";
const CH_HEAD_RE = new RegExp("^(?:" + CH_NUM + ")(?=[\\s:：.\\-—–·|]|$)[\\s:：.\\-—–·|]*", "i");
const CH_TAIL_RE = new RegExp("\\s*[(（\\[]\\s*(?:" + CH_NUM + ")\\s*[)）\\]]$", "i");
const chTitle = t => { const x = norm(t), y = x.replace(CH_HEAD_RE, "").replace(CH_TAIL_RE, "").replace(/^[「『"']\s*|\s*[」』"']$/g, "").trim(); return y || x; };
const stripHead = t => chTitle(String(t || "").replace(/^#+\s*/, "").replace(/^\[\d+장\]\s*/, "").replace(/^\d+(\.\d+)*\.?\s+/, "")).slice(0, 80);
/* 장 블록 하나를 문서 섹션으로: 큰 섹션 하나(작중 사건명) + 하위 섹션들. 모두 ch 표시가 붙는다 */
function blockToSections(ch, heading, secs) {
  const list = (Array.isArray(secs) ? secs : []).filter(s => s && String(s.body || "").trim()).map(s => ({ heading: stripHead(s.heading), body: String(s.body).trim() }));
  if (!list.length) return [];
  const h = stripHead(heading) || list[0].heading || `${ch}장`;
  if (list.length === 1) return [{ heading: h, level: 1, ch, body: list[0].body }];
  return [{ heading: h, level: 1, ch, body: "" }, ...list.map(s => ({ heading: s.heading || h, level: 2, ch, body: s.body }))];
}
function patchInfobox(box, patch) {
  const out = (box || []).map(r => ({ ...r }));
  for (const x of (Array.isArray(patch) ? patch : [])) {
    if (!x || !x.label || !x.value) continue;
    const label = String(x.label).slice(0, 30), value = String(x.value).slice(0, 300), i = out.findIndex(r => r.label === label);
    if (i >= 0) out[i].value = value; else if (out.length < 10) out.push({ label, value });
  }
  return out;
}
const PAGE_KEEP = ["createdAt", "rewrittenAt", "direction", "editedAt", "fixedAt", "stale", "conflicts", "autoConflicts", "autoDismissed", "pending", "baseAsOf", "syncedTo", "storyNotice", "portrait", "avatar", "looks", "looksEditedAt", "shortStories", "motifs", "recoveryJobs", "checkLog", "preWrite", "renamedFrom"];
/* 기존 본문은 그대로 두고 섹션을 덧붙인 새 문서 객체. 링크, 언급, 사실은 integrate가 다시 계산한다 */
function rebuildPage(w, k, p, addSecs, extra = {}) {
  autoLink(w, k, { sections: addSecs, infobox: [] });
  const out = { type: p.type, summary: stripMarks(extra.summaryPatch || "") || p.summary, categories: p.categories || [], notices: p.notices || [],
    infobox: patchInfobox(p.infobox, extra.infoboxPatch), sections: [...p.sections, ...addSecs], navboxes: [],
    facts: extra.facts || [], relations: extra.relations || [], timeline: extra.timeline || [], newEntities: extra.newEntities || [] };
  const np = integrate(w, k, out);
  for (const f of PAGE_KEEP) if (p[f] !== undefined) np[f] = p[f];
  return np;
}

/* ---------- prompts ---------- */
/* ---------- 스토리 모드 프롬프트 ---------- */
/* 숨겨진 진실: 이야기가 나중에 밝히려고 감춘 답. 드러나는 장 전까지 위키(작중 사람들)는 겉으로 알려진 것만 안다 */
const secretsOf = w => (isStory(w) && Array.isArray(w.story.secrets)) ? w.story.secrets : [];
const hiddenSecrets = w => secretsOf(w).filter(x => !x.revealed && !x.pendingDisclosure);
function secretsBlock(w, mode) {
  const hid = hiddenSecrets(w), shown = secretsOf(w).filter(x => x.revealed), pending = secretsOf(w).filter(x => !x.revealed && x.pendingDisclosure);
  const note = pending.length ? `\n## 공개 여부 확인이 필요한 기록\n${pending.map(x => `- id ${x.id}: ${x.truth} (이전 장 본문에 공개 표시가 있었으나 인용 확인은 보류됨)`).join("\n")}\n이미 작성된 실제 본문을 우선한다. 이 메모만으로 공개를 확정하거나 모두가 아직 모른다고 단정하지 않는다.\n` : "";
  if (!hid.length && !shown.length && !pending.length) return "";
  if (mode === "check") return note + (hid.length ? `\n## 아직 드러나지 않은 진실 (이 시점의 작중 사람들은 모른다)\n${hid.map(x => `- 진실: ${x.truth} / 이 시점에 알려진 것: ${x.cover}`).join("\n")}\n문서가 위 '진실'을 사실로 단정하거나, 분류·인포박스·한 줄 정의·인물 관계로 드러내거나, 답을 가리키는 해설을 붙였으면 모순으로 지적한다(severity high, evidence에는 '아직 드러나지 않은 진실'이라고 적는다). 혐의나 주장으로 쓴 것, 해설 없는 단서는 지적하지 않는다.\n` : "");
  return note + `${hid.length ? `\n## 아직 드러나지 않은 진실 (쓰지 말 것)
이 위키는 작중 사람들이 지금 시점에 아는 것으로 쓴다. 아래 진실은 이야기 뒤에서 드러날 답이라 아직 아무도 모른다.
${hid.map(x => `- 진실(쓰지 않는다): ${x.truth}\n  이 시점에 알려진 것(이것만 쓴다): ${x.cover}`).join("\n")}
- 진실을 사실로 단정하지 않고, 분류·인포박스·한 줄 정의·인물 관계로도 드러내지 않는다.
- 혐의, 소문, 주장은 누가 주장하는지와 함께 쓴다(예: "검찰은 그가 이중 첩자였다고 주장한다").
- 진실과 모순되는 사실을 새로 확정하지도 않는다. 알려진 것 너머는 비워 둔다.
- 의미심장한 단서는 하나쯤 남겨도 되지만, 그 단서가 무엇을 뜻하는지 해설하지 않는다.` : ""}${shown.length ? `\n## 이미 드러난 진실 (확정된 사실)\n${shown.map(x => `- ${x.truth}`).join("\n")}` : ""}`;
}
function storyBlock(w, key, forPage) {
  const st = w.story, n = st.chapter, ended = st.status === "ended", pk = st.protagonistKey, pt = w.entities[pk]?.title || "주인공";
  const lines = st.chapters.map(c => `- ${c.n}장 「${c.title}」${c.n === n && !ended ? " (진행 중)" : ""} · ${c.era}: ${c.summary}`).join("\n");
  let extra = "";
  if (forPage && key === pk) {
    const pr = st.protagonist || {};
    extra = `\n\n이 문서는 이야기의 주인공 문서다.${pr.desc ? ` 사용자가 정한 주인공의 특징(반드시 지킨다): ${pr.desc}.` : ""}${st.cast?.length ? ` 사용자가 정한 등장인물(${st.cast.map(c => w.entities[c.key]?.title || c.name).join(", ")})은 정해진 관계대로 본문과 인물 관계 섹션에 링크해 다룬다.` : ""}${pr.want ? ` 주인공이 바라는 것: ${pr.want}.` : ""}${pr.wound ? ` 주인공의 결핍이나 상처: ${pr.wound}.` : ""} 기본 프로필(출신, 가족, 능력, 동기)을 쓰되, 아래 '아직 드러나지 않은 진실'에 걸린 부분은 이 시점에 알려진 것만 쓴다. `
      + (n === 1 && !ended ? `마지막 큰 섹션은 1장 발단 사건 「${st.chapters[0].incident || st.chapters[0].title}」의 첫 장면이다. 주인공이 지내던 일상에서 시작해 사건이 주인공 앞에 닥친 순간에서 멈춘다. 주인공의 결정과 행동, 사건의 결과는 쓰지 않는다(플레이어가 대화로 치른 뒤 기록한다).` : `생애 섹션의 끝부분에서 1장부터 ${n}장까지의 사건을 차례로 다룬다.`);
    if (n === 1 && !ended && st.wish) extra += `\n사용자가 바라는 이야기: ${st.wish}${storyWishPeople(w).replace("이번 장에", "1장 첫 장면에 등장시키거나 언급하며")} 만든 인물은 본문에서 [[링크]]한다.`;
  }
  const N = totalOf(w);
  return `## 이야기 진행 상황 (${ended ? `완결 · ${N}장` : `현재 ${n}장 / ${N}장`}, 작중 시점 ${w.era})
이 위키는 「${pt}」을(를) 주인공으로 하는 이야기를 다룬다. ${ended ? `이야기는 ${N}장에서 끝났다. 결말: ${st.epilogue}\n이 문서는 결말 직후 시점에 작성된다.` : `이 문서는 ${n}장 시점에 작성된다.`}
지금까지의 줄거리:
${lines}

규칙:
${ended ? "- 결말과 모순되는 내용을 쓰지 않는다." : `- ${w.era} 이후의 일은 쓰지 않는다. 결말을 암시하거나 예언하지 않는다.\n- 진행 중인 사건은 아직 결과가 나지 않은 것으로 쓴다.`}
- 이 항목이 주인공과 직접 얽혀 있으면 그 연결을 본문에 드러낸다.
- '1장', '2장', '장', '이야기', '주인공' 같은 이야기 바깥의 구분은 본문에 쓰지 않는다. 이 위키는 작중 세계의 백과사전이다. 시점은 "${w.era} 현재"처럼 작중 연도와 계절로 쓴다.
- 줄거리에 나온 사건은 확정된 사실이다. 이 항목이 그 사건에 나온다면 일치시킨다.
- 위키를 쓰는 작중 사람들이 알 수 있는 것만 쓴다. 인물의 속마음, 생각, 느낌은 본인의 증언, 기록, 남이 본 행동으로만 드러낸다(예: "머릿속이 백색 소음으로 가득했다" 대신 "그는 답하지 못했다", "변호인은 그가 손을 떨었다고 증언했다").${extra}${secretsBlock(w, "write")}`;
}
function storyStyleRules() {
  return `- 절제: 규칙은 방향이지 최대치가 아니다. 사건의 크기, 피해 규모, 숫자, 수식어는 이 이야기와 항목에 맞는 만큼만 쓰고, 장면을 키우려고 부풀리지 않는다.
- 문체: ${STYLES.encyc.desc}
- 하이퍼링크: 다른 항목은 [[제목]] 또는 [[제목|본문에 보일 말]]로 감싼다. 이름 있는 인물, 장소, 조직, 사건, 물건은 처음 나올 때 링크한다. 이미 있는 항목은 아래 목록의 제목을 글자 그대로 쓴다. ${linkNameRule()} 자기 자신은 링크하지 않는다.
- 작중 시점과 맞지 않는 연도를 쓰지 않는다. 학년, 기수, 계급, 직위, 나이, 재학·재직·복무 기간은 작중 기준 시점에서 거꾸로 계산해 모든 연도와 맞춘다. 예를 들어 기준 시점에 1학년(신입생)인 인물은 그 전 해들에는 아직 입학 전이므로 그 학교의 학생으로 활동할 수 없고, 기준 시점에 2학년인 선배는 1년 전에 1학년이다. 과거 사건에 등장시킬 때는 그때의 나이와 신분이 그 사건에 맞는지 확인한다.
- 본문 서식: 문단은 빈 줄로 구분, 목록은 "- ", 인용문은 "> "(다음 줄에 "> — 화자, 출처"), 강조는 **굵게**. 직접 인용은 없는 것이 기본이고 꼭 필요할 때만 1개까지이며, 선언문이나 예고편 대사처럼 다듬지 않고 그 상황에서 나올 법한 짧은 말로 쓴다(나쁜 예: "그들의 권리는 석판보다 단단하다." 좋은 예: "다 끝났소? 그럼 창문 좀 닫으시오. 촛불이 저 꼴이니."). 각주와 취소선은 쓰지 않는다.
- 확인된 사건은 단정형으로 쓴다. 실제로 알아내지 못한 의문은 무엇을 확인하지 못했고 어떤 결과가 남았는지 분명하게 쓴다. 모르는 내용을 확정하거나 숨기지 않는다. 출처 없는 "~라고 전해진다" 같은 얼버무림과 "A가 아니라 B" 꼴의 반전 대구는 피한다.
- 해석이 엇갈린다, 논쟁을 낳고 있다는 식의 섹션이나 마무리 문단을 쓰지 않는다. 장 섹션은 그 장에 실제로 일어난 일과 그 결과로 끝내고, "모든 것이 바뀌었다" 같은 최대치 문장으로 맺지 않는다.`;
}
const entityIndex = (w, skip, max = 80) => Object.entries(w.entities).filter(([k]) => !skip.includes(k)).sort((a, b) => (b[1].page ? 1 : 0) - (a[1].page ? 1 : 0)).slice(0, max)
  .map(([, o]) => `- ${o.title}${o.type ? " — " + o.type : ""}${o.summary ? ". " + o.summary.slice(0, 50) : ""}`).join("\n") || "(없음)";
const firstPara = p => { const s = (p?.sections || []).find(x => !x.ch && x.body.trim()); return s ? stripMarks(s.body.split(/\n{2,}/)[0]).slice(0, 300) : ""; };
/* 이미 쓰인 인물 문서의 '특징' 소제목들과 그 첫 문장, 성격 일화의 소재. 성격의 중복을 금지하지 않고 표현과 일화의 기계적 반복을 피하는 참고로 쓴다.
   소제목만으로는 표현이 다른 같은 일화(예: 배급품 불평)를 가려낼 수 없어 첫 문장을 짧게 붙인다. 인물 2명 이상이 쓴 소재는 코드로 세어 따로 모은다 */
const motifKey = m => String(m).replace(/\s+/g, "");
const traitGist = body => { const t = stripMarks(String(body || "").split(/\n{2,}/)[0]).replace(/\s+/g, " "), m = /^.*?[.!?](?=\s|$)/.exec(t), x = (m ? m[0] : t).trim(); return x.length > 60 ? x.slice(0, 60) + "…" : x; };
const traitLabel = s => { const g = traitGist(s.body); return g ? `${s.heading}(${g})` : s.heading; };
function traitIndex(w, exceptKey, max = 30) {
  const rows = [], seen = new Map(), staged = !!w.stage && !isStory(w);
  for (const [k, p] of Object.entries(S.pages)) {
    if (k === exceptKey || p.type !== "인물" || !w.entities[k]) continue;
    const i = p.sections.findIndex(s => (s.level || 1) === 1 && /특징|능력|특기/.test(s.heading));
    const t = [];
    if (staged) {
      let feature = false;
      for (const s of p.sections || []) {
        if ((s.level || 1) === 1) feature = /특징|능력|특기|성격/.test(s.heading);
        else if (s.level === 2 && feature) t.push(traitLabel(s));
      }
    } else if (i >= 0) for (let j = i + 1; j < p.sections.length && (p.sections[j].level || 1) === 2; j++) t.push(traitLabel(p.sections[j]));
    const ms = Array.isArray(p.motifs) ? p.motifs.filter(x => typeof x === "string" && x.trim()) : [];
    for (const m of new Set(ms.map(motifKey))) { const o = seen.get(m) || { name: ms.find(x => motifKey(x) === m).trim(), n: 0 }; o.n++; seen.set(m, o); }
    if (t.length || ms.length) rows.push({ at: p.createdAt || 0, line: `- ${p.title}: ${t.length ? t.join(" / ") : "(특징 소제목 없음)"}${ms.length ? ` (소재: ${ms.join(", ")})` : ""}` });
  }
  const many = [...seen.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n);
  const body = rows.sort((a, b) => b.at - a.at).slice(0, max).map(x => x.line).join("\n");
  return body + (many.length ? `\n- 이미 많이 쓰인 소재: ${many.map(x => `${x.name}(${x.n}명)`).join(", ")}\n${staged ? "소재의 의미와 쓰임을 비교해 이 인물만의 특징을 고른다. 확정 설정이 요구하는 공통 요소는 유지한다." : "이미 많이 쓰인 소재로 이 인물의 성격을 보여 주지 않는다. 확정 사실이 그 소재를 요구할 때만 예외다."}` : "");
}
/* 기존 인물 문서의 짜임('특징'·'생애' 하위 섹션 수)이 한 모양으로 굳었는지 코드로 센다. 3개 이상이면서 절반 이상이 같으면 다른 짜임을 요구한다 */
function outlineNote(w, exceptKey) {
  const sig = new Map(); let n = 0;
  for (const [k, p] of Object.entries(S.pages)) {
    if (k === exceptKey || p.type !== "인물" || !w.entities[k]) continue;
    const c = { 특징: -1, 생애: -1 }; let cur = null;
    for (const s of p.sections || []) {
      if ((s.level || 1) === 1) { cur = /특징|능력|특기/.test(s.heading) ? "특징" : /생애|행적|경력/.test(s.heading) ? "생애" : null; if (cur && c[cur] < 0) c[cur] = 0; else if (cur) cur = null; }
      else if (cur) c[cur]++;
    }
    if (c.특징 < 0 || c.생애 < 0) continue;
    n++; const key = c.특징 + "/" + c.생애; sig.set(key, (sig.get(key) || 0) + 1);
  }
  const [top, m] = [...sig.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!top || m < 3 || m * 2 < n) return "";
  const [a, b] = top.split("/");
  return `- 목차 짜임: 기존 인물 문서 ${n}개 중 ${m}개가 '특징' 하위 섹션 ${a}개, '생애' 하위 섹션 ${b}개로 같은 짜임이다. 이 인물은 실제로 겪은 일에 맞춰 하위 섹션 수를 다르게 잡고, 이 인물에게만 있는 일(특정 작전, 관계, 이후의 직업 등)은 큰 섹션으로 세울 수 있다.`;
}
const TRAIT_RULE = `성격은 무작위로 정한 성격 경향이 주어지면 그 값을 출발점으로 삼고, 인물이 맡은 역할, 살아온 경험, 주변 사람과의 관계에 맞게 다듬어 자연스럽게 드러나게 한다. 사용자가 정한 특징과 이미 확정된 설정을 우선한다. 서로 다른 인물의 성격이나 성향이 겹쳐도 된다. 아래 특징 목록은 성격의 중복을 금지하는 목록이 아니라 표현 반복을 살피는 참고다. 같은 문구와 일화를 기계적으로 되풀이하거나, 차별화하려고 억지 기벽이나 집착을 붙이지 않는다. 장르의 전형적인 성격도 역할과 경험에 맞으면 쓸 수 있지만, 장르만 보고 모든 인물에게 일괄적으로 입히지 않는다. 직업도 마찬가지다. 일하는 방식과 능력을 그 직업에서 흔히 떠올리는 인물상이나, 그 인물상을 뒤집은 익숙한 대비('무엇보다 무엇을 믿는다'는 식)로 정하지 않는다. 이 인물의 성격 경향과 경험, 그리고 이 세계에서 그 분야가 실제로 일하는 구체적인 방법에서 끌어낸다.원안과 핵심 규칙에 나오는 장치(그 세계의 기본 보급품, 기본 장비, 기본 제도 등)를 성격 일화의 중심 소재로 삼지 않는 것을 기본으로 한다. 성격은 그 인물의 생활, 취향, 사람, 장소, 습관, 일하는 방식에서 찾는다. 성격 경향은 한 가지 방식으로만 드러내지 않는다. 예를 들어 원칙과 융통은 규칙 위반만이 아니라 일, 돈, 시간, 약속, 사람, 취향을 대하는 방식으로도 드러난다.`;
/* 이야기를 시작할 때 사용자가 적은 바람: 시작 때만이 아니라 장마다 따른다 */
const storyWishBlock = w => w.story?.wish ? `## 사용자가 바라는 이야기 (따른다)\n${w.story.wish}\n전개와 등장인물은 이 바람을 따른다. 새 인물을 바라면(예: 용의자 여럿, 경쟁자들) 아래의 새 인물 수 제한보다 이 바람이 우선한다.\n` : "";
const storyWishPeople = w => w.story?.wish ? " 다만 사용자가 바라는 이야기가 새 인물을 원하면, 그 바람이 아직 채워지지 않은 만큼 이번 장에 새 인물을 최대 4명까지 만든다(서로 역할·처지·동기가 겹치지 않게, 각자 이번 사건과 이어지게)." : "";
/* 그 장이 뼈대의 어느 구간인지: 절정과 결말에는 새 인물을 들이지 않는다 */
const beatBase = (w, n) => String(w.story.spine[n - 1]?.beat || "").split(" ")[0];
const lateBeat = (w, n) => ["절정", "결말"].includes(beatBase(w, n)) || n >= totalOf(w);
function newItemRule(w, n) {
  const b = n >= totalOf(w) ? "결말" : beatBase(w, n);
  if (b === "결말") return `- 새 항목: 이번 장은 결말이다. 새 인물이나 새 항목을 만들지 않는다. 지금까지 등장한 인물과 항목이 각자 어떻게 되었는지로 이야기를 맺는다. newEntities는 빈 배열이고, affected에는 기존 항목만 넣는다.`;
  if (b === "절정") return `- 새 항목: 이번 장은 절정이다. 새 인물은 만들지 않는다. 승부는 지금까지 등장한 인물, 조직, 물건, 장소, 그리고 앞선 장에 깔아 둔 복선으로 낸다. 결전의 무대나 결정적 물건처럼 꼭 필요한 새 항목만 0~2개까지 만들 수 있고, 만들면 newEntities와 affected(kind "new")에 넣는다.`;
  const ti = traitIndex(w, null, 20);
  const prev = w.story.chapters[w.story.chapter - 1], prevPeople = (prev?.fresh || []).filter(k => w.entities[k]?.type === "인물").length;
  const personRule = prevPeople ? "직전 장에 새 인물이 나왔으므로 이번 장에는 새 인물을 만들지 않는다. 이미 있는 인물로 쓴다." : "새 인물은 이번 장 사건에 꼭 필요할 때만 1명까지 만든다. 연인, 옛 연인, 숨겨진 가족처럼 주인공의 과거를 새로 지어내는 인물은 만들지 않는다.";
  return `- 새 항목: 새 항목은 필요할 때만 0~4개까지 만든다(바람으로 만드는 새 인물은 따로 센다). 기존 항목만으로 진행해도 된다. 장소, 조직, 물건, 사건, 기술 중에서 이번 장 사건에 맞는 것으로 고른다. ${personRule}${storyWishPeople(w)} 이미 있는 항목과 이름이나 역할이 겹치지 않게 한다. 새 항목은 이번 장 사건에서 실제로 역할을 맡아야 하고(적, 조력자, 단서, 무대, 무기 등), protagonistBlock 본문에서 [[링크]]한다. 사건의 인과를 위해 필요한 경우만 추가한다. 모두 newEntities에 넣고, affected에도 kind "new"로 넣는다.
- 새 인물을 만든다면 한 문장 정의(summary)에 이번 사건에서 맡은 역할과 처지를 담는다. ${TRAIT_RULE}${ti ? `\n  다른 인물의 특징 (표현 반복 참고):\n${ti.split("\n").map(x => "  " + x).join("\n")}` : ""}`;
}
/* 스토리 진행 기록: 프롬프트 생성은 읽기 전용, 검증이 끝난 장만 기록을 교체한다. */
const storyQuote = t => stripMarks(t).replace(/\s+/g, " ").trim();
const storyText = (value, max = 600) => typeof value === "string" ? stripMarks(value).slice(0, max).trim() : "";
const STORY_CHOICE_KINDS = ["information", "relationship", "time", "risk", "opportunity", "outcome"];
const STORY_THREAD_KINDS = { goal: "목표", relationship: "관계", promise: "약속", conflict: "갈등", consequence: "행동의 여파", ongoing: "진행 중인 일", mystery: "의문·단서", legacy: "이전 기록" };
const STORY_THREAD_STATES = { active: "이어짐", changed: "변화", fulfilled: "성취·이행", failed: "좌절", abandoned: "포기", continuing: "계속됨" };
const STORY_THREAD_CLOSED = ["fulfilled", "failed", "abandoned"];
const storyState = value => {
  const state = String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[ -]+/g, "_");
  return ({ open: "active", progress: "changed", progressed: "changed", in_progress: "changed", updated: "changed", resolved: "fulfilled", completed: "fulfilled", left_open: "continuing", ongoing: "continuing", deferred: "unchanged", maintained: "unchanged", "이어짐": "active", "진행중": "active", "진행_중": "active", "변화": "changed", "진전": "changed", "성취": "fulfilled", "성취·이행": "fulfilled", "이행": "fulfilled", "완료": "fulfilled", "해결": "fulfilled", "좌절": "failed", "실패": "failed", "포기": "abandoned", "계속됨": "continuing", "유지": "unchanged", "보류": "unchanged" }[state] || state);
};
// 의미를 추측하지 않고 서식·문장부호 차이만 흡수한다. 확인되지 않은 인용은 적용하지 않는다.
const storyComparable = t => storyQuote(t).normalize("NFKC").replace(/[“”‘’「」『』"'`.,!?…:;()[\]{}·—–-]/g, "").replace(/\s+/g, " ").trim();
function storyMatchedQuote(body, value) {
  const quote = storyQuote(value), a = storyComparable(body), b = storyComparable(quote);
  return b.length >= 6 && a.includes(b) ? quote : "";
}

function storyMemory(w) {
  const saved = w.story.continuity;
  if ([1, 2].includes(saved?.version)) {
    const memory = JSON.parse(JSON.stringify(saved));
    if (!Array.isArray(memory.threads) || !Array.isArray(memory.choices)) throw new Error("이야기 진행 기록의 형식을 확인할 수 없습니다.");
    if (memory.version === 1) {
      memory.threads = memory.threads.map(t => {
        const { question, answer, ...rest } = t;
        const automatic = t.id === "main" && /^발단 「.*」이 만든 중심 갈등과 주인공의 선택은 어떻게 귀결되는가\?$/.test(question || "");
        return { ...rest, kind: automatic ? "ongoing" : "legacy", subject: automatic ? `「${w.story.chapters[0].title}」에서 이어지는 인물들의 생활과 선택` : question || t.subject || "이전 이야기에서 이어지는 내용", status: storyState(t.status), ...(answer ? { outcome: answer } : {}), legacy: { question, status: t.status, ...(answer ? { answer } : {}) } };
      });
      memory.version = 2;
    }
    return memory;
  }
  const first = w.story.chapters[0], incident = first.incident || first.summary || first.title;
  return { version: 2, focus: storyText(w.seed, 1200), threads: [{ id: "main", kind: "ongoing", subject: `「${first.title}」에서 시작한 인물들의 생활과 선택`, importance: "major", status: "active", origin: { source: "chapter:1", title: first.title, quote: incident, chapter: 1 }, development: "앞에서 시작한 일과 그 후속 변화", recordedAt: 1, lastChapter: 1, history: [] }], choices: [] };
}
function storySources(w) {
  const rows = [{ source: "seed", title: "사용자 원안", text: w.seed || "", chapter: 1 }];
  for (const c of w.story.chapters) rows.push({ source: "chapter:" + c.n, title: c.title, chapter: c.n, text: [c.incident, c.summary, ...(c.affected || []).map(x => x.change), ...(c.wove || []).map(x => x.how), ...(S.pages[w.story.protagonistKey]?.sections || []).filter(s => s.ch === c.n).map(s => s.body)].filter(Boolean).join("\n") });
  for (const [key, p] of Object.entries(S.pages)) {
    if (!w.entities[key]) continue;
    const parts = [p.summary, ...(p.infobox || []).map(x => `${x.label}: ${stripMarks(x.value)}`), ...(p.sections || []).filter(s => !s.ch || s.ch <= w.story.chapter).map(s => `${s.heading}\n${stripMarks(s.body)}`), ...(w.entities[key].facts || []).filter(x => !x.sup).map(x => x.t)];
    rows.push({ source: "page:" + key, title: p.title, chapter: null, text: parts.filter(Boolean).join("\n\n") });
  }
  for (const c of w.story.chapters) for (const [key, s] of Object.entries(c.dialogues || {})) (s.turns || []).forEach((t, i) => rows.push({ source: `dialogue:${c.n}:${key}:${i}`, title: key === "@scene" ? "주인공의 행동(상황)" : `${w.entities[key]?.title || key}와의 대화`, chapter: c.n, text: `${t.user}\n${t.reply}\n${t.memory}` }));
  return rows;
}
function storyMemoryBlock(w, sources = true) {
  const memory = storyMemory(w), legacy = ![1, 2].includes(w.story.continuity?.version);
  const context = { ...memory, threads: memory.threads.map(({ legacy: archived, ...thread }) => thread) };
  const catalog = sources ? storySources(w) : [], perPage = Math.max(180, Math.min(1100, Math.floor(20000 / Math.max(1, catalog.length))));
  const excerpts = sources ? catalog.map(row => {
    if (!row.source.startsWith("page:")) return { ...row, text: row.text.slice(0, 1600) };
    const p = S.pages[row.source.slice(5)], paragraphs = (p.sections || []).filter(s => !s.ch || s.ch <= w.story.chapter).flatMap(s => String(s.body || "").split(/\n{2,}/)).map(storyQuote).filter(Boolean);
    // 개요/특징과 사건 서술을 함께 대표한다. 기존에 기록한 내용의 원문은 아래 기록에 항상 남는다.
    const samples = [0, Math.floor(paragraphs.length / 3), Math.floor(paragraphs.length * 2 / 3), paragraphs.length - 1].map(i => paragraphs[i]).filter(Boolean);
    const excerpts = [...new Set([p.summary || "", ...samples])].filter(Boolean), share = Math.max(30, Math.floor(perPage / Math.max(1, excerpts.length)));
    return { ...row, text: excerpts.map(t => t.slice(0, share)).join("\n").slice(0, perPage) };
  }) : [];
  return `## 이야기의 책임 기록 (계획보다 우선하는 누적 기록)\n${JSON.stringify(context)}\n${legacy ? "기존 세계관에는 누적 진행 기록이 아직 없다. 아래 자료와 기존 주인공 본문에서 이어지는 목표·관계·약속·갈등·행동의 여파·진행 중인 일만 continuity.introduced에 출처 원문과 함께 복원한다. 실제 의문이나 단서일 때만 mystery로 분류한다. 모든 설정을 복선이나 해결해야 할 문제로 만들지 않는다.\n" : "기록을 최근에 열지 않았다는 이유로 빼지 않는다. 성취·좌절·포기와 과거 선택의 영향도 유지한다. legacy 유형은 원문과 이력을 보존한 이전 기록이다. 질문형으로 적혀 있어도 답을 강제하지 말고, 필요한 경우 updates.kind와 subject로 실제 내용에 맞게 분류·표현을 정리한다.\n"}${sources ? `## 기존 기록의 출처 자료 (일부 문서는 발췌이며, 언급되지 않았다는 것이 부재의 증거는 아니다)\n${JSON.stringify(excerpts)}\n` : ""}`;
}
/* 장 전환 응답의 본문: 지난 장 기록(record)과 새 장 첫 장면(protagonistBlock). 인용 근거는 둘 다에서 찾는다 */
const storyOutBody = out => [...(out?.record?.sections || []), ...(out?.protagonistBlock?.sections || [])].map(s => storyQuote(s?.body)).join("\n");
/* 열린 장: 장이 시작될 때는 첫 장면(상황이 주인공 앞에 닥친 순간)까지만 쓰고, 플레이어가 대화로 치른 뒤 장이 끝날 때 기록으로 다시 쓴다 */
/* 세계의 시계 블록(내부 전용). 시계가 없는 예전 이야기는 뼈대를 보여 주고 이번 장에서 시계를 만들게 한다 */
function storyClocksBlock(w, nextN, finish) {
  const st = w.story, N = totalOf(w);
  const spine = `## 장 구성\n${st.spine.map(s => `- ${s.n}장 ${s.beat}${st.clocks?.length ? "" : `: ${s.intent}${s.revised ? " (앞선 장의 탐험 때문에 수정됨)" : ""}`}`).join("\n")}\n`;
  if (!st.clocks?.length) return `## 잠정 이야기 뼈대 (독자에게 공개하지 않는다. 확정 사건과 선택보다 우선하지 않는다)\n${spine.replace("## 장 구성\n", "")}${finish ? "" : `
## 세계의 시계 만들기 (내부 전용)
이 이야기에는 아직 세계의 시계가 없다. 위 뼈대의 남은 의도, 숨겨진 진실, 지금까지의 일을 바탕으로 이번 응답의 clocks에 만든다. ${WORLD_CLOCK_RULE} 지금까지 이미 벌어진 단계 수를 at에 쓴다.
`}`;
  return `${spine}
## 세계의 시계 (내부 전용, 독자에게 공개하지 않는다)
${st.clocks.map(c => `- [id: ${c.id}] ${c.name}: ${c.aim}\n${c.stages.map((x, i) => `  ${i + 1}) ${i < c.at ? "[이미 벌어짐] " : i === c.at ? "[다음] " : ""}${x}`).join("\n")}`).join("\n")}
${finish ? "" : `- 장이 넘어가는 동안 각 시계는 한 칸 나아가거나 멈춘다(clockMoves의 to는 새로 벌어진 단계까지의 수). 주인공이 그 흐름을 막거나 늦췄으면 멈추거나 한 칸 물러설 수 있고, 손 놓았거나 모르는 채 지나갔으면 나아간다. ${nextN}장은 ${st.spine[nextN - 1]?.beat || ""} 구간이니 그에 맞는 속도로 돌린다. 위기·절정 구간에 이르면 시계들이 끝 단계에 가까워진다. 마지막 장(${N}장)의 첫 장면은 시계들이 맞물려 결말로 이어질 상황을 연다.
- 새로 벌어진 단계는 첫 장면에서 주인공에게 닿거나 그 소식이 들려온다. 언제 어떻게 닿을지는 아래 '열린 장' 규칙대로 플레이어가 가던 쪽을 통해 정한다. 단계를 그대로 옮기지 말고 이 장면의 구체적인 일로 쓴다.
- 시계는 숨겨진 진실을 드러내지 않는다. 진실은 플레이어가 단서로 짚었을 때만 드러난다. 미공개 진실마다 정해진 단서(clues) 중 아직 나오지 않은 것을 이번 첫 장면, nearby 인물, 장소에 놓을 수 있다. 정해진 단서가 없으면 진실과 이어지는 사실의 조각을 여러 곳에 흘린다. 단서는 조각이지 해설이 아니다.
`}`;
}
/* 말 옮기기: 장이 넘어가는 동안 주인공이 누군가에게 한 말이 그 인물과 가까운 사람에게 전해진다 */
const STORY_HEARSAY_RULE = `## 말 옮기기 (hearsay)
- 장이 넘어가는 동안 주인공이 위 대화에서 한 말이나 행동이 그 상대(from)를 통해 from과 가까운 인물(to: 연인, 가족, 단짝, 같은 조직의 가까운 동료처럼 문서나 관계에 드러난 사이)에게 전해질 수 있다.
- 말할 거리가 되는 것만 옮긴다(고백, 작업, 협박, 약속, 털어놓은 비밀, 다툼, 이상한 행동). 평범한 인사나 잡담은 옮기지 않는다. 0~3건, 없으면 빈 배열.
- 누가 옮기는지는 성격이 정한다. 입이 가벼운 인물은 잘 옮기고, 입이 무거운 인물은 덜 옮긴다. 주인공이 비밀로 해 달라고 했으면 from의 성격과 주인공과의 거리에 따라 지키거나 어긴다.
- what은 to가 전해 들은 모양 그대로 쓴다. 들은 말이라 부풀거나 비틀릴 수 있다(예: 같이 밥 먹자고 했다 → 내 연인에게 작업을 걸었다).
- source는 그 말이 나온 위 대화의 source를 글자 그대로 쓴다. from은 그 대화의 상대, to는 이미 있는 다른 인물(주인공 제외)이다. 숨겨진 진실은 옮기지 않는다. 주인공이 실제로 한 말과 행동만 옮긴다.
`;
function openChapterRules(w, nextN, finish) {
  const st = w.story, N = totalOf(w), prev = st.chapters[nextN - 2], pk = st.protagonistKey, pt = w.entities[pk].title;
  const marked = (S.pages[pk]?.sections || []).some(x => x.ch === nextN - 1);
  const rec = prev?.open ? `- record는 방금 끝난 ${nextN - 1}장 「${prev.title}」의 기록이다. ${marked ? `주인공 문서의 ${nextN - 1}장 섹션(지금은 첫 장면만 있다)을 이 기록으로 바꾼다. 첫 장면에서 출발해` : `주인공 문서 본문 끝에 있는 첫 장면 뒤에 덧붙는다. 첫 장면을 되풀이하지 말고 그 뒤부터`} ${pt}이(가) 위 '등장인물과 실제로 나눈 대화'에서 실제로 한 말과 행동, 그것이 낳은 결과, 다른 인물과 세계의 반응, 장이 끝날 때의 모습을 차례로 쓴다. ${pt}의 결정과 행동은 플레이어가 한 것만 쓴다. 대화가 없었으면 ${pt}은(는) 큰 결정 없이 첫 장면의 흐름 속에 있었던 것으로 쓴다. 대화 내용을 대본처럼 옮기지 말고 위키 문체로 정리한다. heading은 ${nextN - 1}장의 작중 사건명, sections는 하위 섹션 1~3개, 모두 합쳐 800~2,000자. record.summary는 ${nextN - 1}장에 실제로 일어난 일 3~5문장이다.
` : "";
  if (finish) return `## 이야기 마무리
${rec}- 이번 응답은 새 장을 열지 않고 이야기를 끝낸다. title·era·summary·protagonistBlock은 쓰지 않는다. affected·facts·timeline·relations·continuity는 ${nextN - 1}장 기록에서 실제로 일어난 일로 쓴다.
`;
  return `## 열린 장: 첫 장면만 쓰고, 끝난 장은 기록한다
${rec}- ${nextN}장은 열린 장이다. 이 장의 사건은 플레이어가 대화와 행동으로 치르고, 장이 끝날 때 기록으로 쓴다. 지금은 첫 장면만 쓴다.
- protagonistBlock은 ${nextN}장의 첫 장면이다. ${pt}이(가) ${prev?.open ? "방금 기록한 장이 끝날 때" : "앞 장이 끝날 때"} 있던 자리와 하던 일에서 시작한다${typeof storyWhere === "function" && storyWhere(w, pk, prev)?.place ? `(그때 있던 곳: ${storyWhereText(storyWhere(w, pk, prev))})` : ""}. 세계와 다른 인물이 움직여 상황이 ${pt} 앞에 닥친 순간에서 멈춘다. ${pt}의 결정과 행동(어디로 감, 무엇을 하기로 함, 누구를 믿음)은 쓰지 않고, 놀람 같은 짧은 반응까지만 쓴다. 결과·해결·절정은 쓰지 않는다. heading은 이 장에 닥친 상황의 이름, sections는 하위 섹션 1~2개, 모두 합쳐 400~1,000자.
- 사건은 하던 일과 끊긴 채 들이닥치지 않는다. 플레이어가 지난 장에 공들인 줄기(관계, 조사, 일, 약속)가 있으면 사건이 그 줄기를 통해 닿게 한다(예: 연인과 함께 있던 자리 근처에서 일이 터진다, 사건의 관계자가 연인을 먼저 찾는다).
- 첫 장면이나 주변 묘사에 ${st.clocks?.length ? "시계의 다음 단계" : `다음 단계(${st.spine[nextN]?.intent || "결말"})`}의 기미를 작게 깐다(소문, 낌새, 지나가는 소리). 그 기미가 무엇을 뜻하는지 해설하지 않고, 미공개 진실을 드러내지 않는다.
- title은 이 장에 닥친 상황의 이름, summary는 첫 장면의 상황 2~4문장이다. 앞으로 어떻게 될지는 쓰지 않는다.
- affected·facts·timeline·relations·continuity는 ${prev?.open ? `${nextN - 1}장 기록과 ` : ""}${nextN}장 첫 장면에서 실제로 일어난 일로 쓴다. 첫 장면 이후에 일어날 일을 확정하지 않는다. 본문 인용은 ${prev?.open ? "record와 " : ""}protagonistBlock 본문 어디서든 한다.
`;
}
function prepareStoryMemory(w, n, out, choice, tolerant = false) {
  const memory = storyMemory(w), data = out.continuity || {}, warnings = [], accepted = [], fail = message => { throw new Error("이야기 진행 기록을 확인하지 못했습니다. " + message); };
  const recover = (fn, label) => { try { return fn(); } catch (e) { if (!tolerant) throw e; warnings.push(label + ": " + (e.message || "형식 확인 필요")); return null; } };
  const rows = key => { if (Array.isArray(data[key])) return data[key]; if (!tolerant) fail("이어지는 내용과 선택의 영향 기록이 필요합니다."); warnings.push(({ updates: "기존 이야기", introduced: "새 이야기", choiceConsequences: "선택 결과" }[key]) + " 기록 누락: 이전 기록을 유지했습니다."); return []; };
  const updates = rows("updates"), introduced = rows("introduced"), choices = rows("choiceConsequences");
  const body = storyOutBody(out), sourceRows = storySources(w);
  const sources = new Map(sourceRows.map(x => [x.source, { ...x, text: storyQuote(x.text) }]));
  sources.set("current", { source: "current", title: out.title, text: body, chapter: n });
  const evidence = value => { const q = storyMatchedQuote(body, value); if (!q) fail("변화·결과·선택의 영향을 뒷받침하는 이번 장 본문 인용이 없습니다."); return q; };
  const update = (thread, row) => {
    const action = storyState(row.status ?? row.state), outcome = storyText(row.outcome ?? row.answer ?? row.result), consequence = storyText(row.consequence);
    const development = storyText(row.development || row.description || row.change || row.detail || row.summary) || outcome || consequence || storyText(row.evidence) || (["unchanged", "continuing"].includes(action) ? thread.development || "이전 상태를 유지한다." : "");
    if (!["unchanged", ...Object.keys(STORY_THREAD_STATES)].includes(action) || !development) fail("앞에서 시작한 내용을 이번 장에서 어떻게 이어갔는지 적어야 합니다.");
    if (row.kind !== undefined && !Object.hasOwn(STORY_THREAD_KINDS, row.kind)) fail("이야기 기록의 유형을 확인할 수 없습니다.");
    if (row.subject !== undefined && !storyText(row.subject, 400)) fail("이야기 기록의 내용을 비울 수 없습니다.");
    if (STORY_THREAD_CLOSED.includes(action) && !outcome) fail("성취·좌절·포기에는 실제로 생긴 결과가 필요합니다.");
    const quiet = ["unchanged", "continuing"].includes(action);
    const quote = quiet && !row.evidence ? "" : evidence(row.evidence);
    if (row.kind !== undefined) thread.kind = row.kind;
    if (row.subject !== undefined) thread.subject = storyText(row.subject, 400);
    thread.history = [...(thread.history || []), { chapter: n, status: action, development, ...(outcome ? { outcome } : {}), ...(consequence ? { consequence } : {}), ...(quote ? { evidence: quote } : {}) }];
    thread.lastChapter = n; thread.development = development;
    if (action !== "unchanged") thread.status = action;
    if (outcome) thread.outcome = outcome;
    if (consequence) thread.consequence = consequence;
    if (quote) thread.evidence = quote;
  };
  const seen = new Set();
  for (const row of updates) recover(() => {
    const thread = memory.threads.find(t => t.id === row?.id);
    if (!thread || seen.has(row.id)) fail("기존 기록의 식별자가 없거나 중복됩니다.");
    update(thread, row); seen.add(row.id); accepted.push({ ...row, status: storyState(row.status ?? row.state) });
  }, "기존 기록 " + (row?.id || "미지정"));
  for (const thread of memory.threads) if (!STORY_THREAD_CLOSED.includes(thread.status) && !seen.has(thread.id)) {
    if (!tolerant) fail("앞에서 이어지는 내용의 기록이 빠졌습니다: " + thread.subject);
    warnings.push(`「${thread.subject}」의 이번 장 갱신을 확인하지 못해 이전 상태를 유지했습니다.`);
    (thread.history ||= []).push({ chapter: n, status: "unchanged", development: "진행 기록 확인 보류: 이전 상태 유지", pending: true });
  }
  if (introduced.length > 8) { if (!tolerant) fail("한 장에 지나치게 많은 새 기록이 추가되었습니다."); warnings.push("새 기록이 많아 첫 8건만 확인했습니다."); }
  for (const row of introduced.slice(0, 8)) recover(() => {
    const source = sources.get(row?.source), quote = storyQuote(row?.quote), subject = storyText(row?.subject ?? row?.question, 400), kind = row?.kind ?? (row?.question ? "legacy" : "");
    if (!source || quote.length < 12 || !source.text.includes(quote) || !subject || !Object.hasOwn(STORY_THREAD_KINDS, kind) || !["major", "minor"].includes(row.importance)) fail("새 기록의 유형·출처·실제 원문을 확인할 수 없습니다.");
    if (memory.threads.some(t => storyQuote(t.subject) === storyQuote(subject))) fail("같은 내용을 다른 기록으로 중복 추가할 수 없습니다.");
    const thread = { id: "t" + cyrb53(row.source + "\n" + quote + "\n" + subject).toString(36), kind, subject, importance: row.importance, status: "active", development: storyText(row.development) || "앞에서 시작한 내용", origin: { source: row.source === "current" ? "chapter:" + n : row.source, title: source.title, quote, chapter: source.chapter }, recordedAt: n, lastChapter: n, history: [] };
    if (row.status && storyState(row.status) !== "active") update(thread, row);
    memory.threads.push(thread);
  }, "새 기록 " + (row?.subject || row?.question || "미지정"));
  const impacts = [];
  for (const row of choices.slice(0, 6)) recover(() => {
    const detail = storyText(row?.detail, 500);
    if (!STORY_CHOICE_KINDS.includes(row?.kind) || !detail) fail("선택이 남긴 구체적인 영향이 필요합니다.");
    const quote = evidence(row.evidence); if (!choice) fail("사용자가 하지 않은 선택의 결과를 만들 수 없습니다.");
    impacts.push({ kind: row.kind, detail, evidence: quote });
  }, "선택 결과");
  if (choices.length > 6) { if (!tolerant) fail("선택 결과 기록이 너무 많습니다."); warnings.push("선택 결과 첫 6건만 확인했습니다."); }
  if (choice && !impacts.length) { if (!tolerant) fail("선택한 행동이 이번 장에 남긴 영향을 기록해야 합니다."); warnings.push("고른 행동은 보관했지만 구체적인 결과 기록은 확인이 필요합니다."); }
  if (choice) memory.choices.push({ chapter: n, choice: choice.custom || choice.picked, consequences: impacts, ...(!impacts.length ? { pending: true } : {}) });
  return { memory, record: { updates: JSON.parse(JSON.stringify(accepted)), introduced: memory.threads.filter(t => t.recordedAt === n).map(t => t.id), choiceConsequences: impacts, warnings } };

}
const STORY_RESPONSIBILITY_RULES = `- 사용자 원안·지침이 약속한 장르의 경험과 중심 내용을 유지한다. 장르 이름만 보고 흔한 거대 음모·숨겨진 혈통·세계 멸망·배지 반납 같은 결말을 자동 선택하지 않는다. 그런 전개가 필요하면 앞서 확정한 사건과 선택에서 인과적으로 나와야 한다.
- 장이 진행된다고 사건 규모나 배후의 계층을 키울 의무는 없다. 인물의 목표·관계·약속·선택의 여파·생활의 변화만으로도 전개할 수 있다. 앞에서 만든 내용을 새 사건으로 덮지 않는다.
- 뼈대는 잠정 계획이다. 확정된 사건·사용자 선택·앞서 만든 내용과 충돌하면 남은 계획을 바꾼다. 계획을 지키려고 이미 일어난 사실을 소급 변경하지 않는다.
- 후속 전개는 내용의 종류에 맞춘다. 목표는 시도·성취·좌절·포기, 관계는 가까워짐·멀어짐·유지, 약속은 이행·변경·불이행, 결정은 그 여파를 다룰 수 있다. 실제 의문·단서일 때만 답이나 해명을 다룬다. 모든 설정을 수수께끼나 해결 과제로 바꾸지 않고, 이름을 재등장시키는 것만으로 후속 결과를 썼다고 하지 않는다. 일상과 관계는 완결 뒤에도 자연스럽게 계속될 수 있다.
- 선택은 접근 방법뿐 아니라 사건의 향방·관계·정보·기회·결말을 바꿀 수 있다. 성공을 보장하거나 예정된 결말로 억지 합류시키지 않는다. 다시 합류해도 이미 얻거나 잃은 것과 관계 변화는 남는다.`;
const STORY_CONTINUITY_OUTPUT = `"continuity":{"updates":[{"id":"기존 기록 id","status":"changed","development":"이어짐·변화·성취·좌절·포기·유지의 구체적 내용","outcome":"성취·좌절·포기일 때 실제 결과","consequence":"필요할 때만 후속 영향","evidence":"실제 변화·결과는 이번 protagonistBlock 본문에서 12자 이상 인용. unchanged/continuing으로 변화 없이 이어갈 때는 생략 가능"}],"introduced":[{"source":"기존 자료 source 또는 current","quote":"실제 출처에서 12자 이상 그대로 인용","kind":"ongoing","subject":"목표·관계·약속·갈등·행동의 여파·진행 중인 일 또는 실제 의문","importance":"major","status":"active","development":"변화가 있을 때 내용","outcome":"성취·좌절·포기일 때 결과","consequence":"필요할 때만 후속 영향","evidence":"실제 변화가 있을 때 이번 장 본문 인용"}],"choiceConsequences":[{"kind":"information/relationship/time/risk/opportunity/outcome","detail":"선택이 실제로 바꾼 내용","evidence":"이번 장 본문에서 12자 이상 그대로 인용"}]}`;

function chapterPlanPrompt(w, nextN, choice) {
  const st = w.story, pk = st.protagonistKey, pp = S.pages[pk], pr = st.protagonist || {}, cur = curCh(w);
  const top = exploreScores(w, cur).slice(0, 8);
  const ex = top.map((x, i) => `### ${i + 1}. 「${w.entities[x.k].title}」 · 점수 ${x.s} · ${x.kinds.join(", ")}\n${entityBrief(w, x.k, null)}${firstPara(S.pages[x.k]) ? "\n개요: " + firstPara(S.pages[x.k]) : ""}`).join("\n\n");
  const N = totalOf(w), finish = nextN > N, last = nextN === N, prevOpen = !!st.chapters[nextN - 2]?.open;
  return `너는 가상 세계관 위키 「${w.title}」의 이야기 편집장이다. 이 위키는 주인공 「${w.entities[pk].title}」을(를) 중심으로 ${N}장짜리 이야기가 진행된다. 지금 ${nextN - 1}장이 끝났고, ${finish ? "이야기를 마무리한다" : `다음 장(${nextN}장)을 연다`}. 이 내용은 위키의 문서들에 반영된다.

## 장 계획 작성

${canonBlock(w)}

${toneBlock(w)}${w.guide ? `## 작가 지침 (사용자 지정)\n${w.guide}\n\n` : ""}## 주인공
「${w.entities[pk].title}」${w.entities[pk].summary ? " — " + w.entities[pk].summary : ""}
- 바라는 것: ${pr.want || "(정해지지 않음)"}
- 결핍이나 상처: ${pr.wound || "(정해지지 않음)"}
${pr.desc ? `- 사용자가 정한 특징 (최우선 제약): ${pr.desc}\n` : ""}${st.cast?.length ? `\n## 사용자가 정한 등장인물 (최우선 제약. 특징과 주인공과의 관계를 지키고, 이야기에 꾸준히 등장시킨다)\n${castText(st.cast.map(c => ({ ...c, name: w.entities[c.key]?.title || c.name })))}\n` : ""}
${secretsOf(w).length ? `## 숨겨진 진실 (독자에게 공개하지 않는다)
${secretsOf(w).map(x => `- [id: ${x.id}] ${x.revealed ? "[이미 드러남] " : x.pendingDisclosure ? "[공개 여부 확인 필요] " : ""}${x.truth} / 드러나기 전 알려진 것: ${x.cover} / 공개 검토 계획 ${x.reveal}장${!x.revealed && x.clues?.length ? ` / 단서: ${x.clues.join(" | ")}` : ""}`).join("\n")}
- reveal 장 번호는 공개를 검토할 잠정 시점이며 강제 공개 기한이 아니다. 이번 장의 증거와 선택으로 실제 알게 된 경우만 위에 표시된 정확한 id를 사용해 revealNow에 {id, evidence}를 넣는다. 이전 장 본문에 이미 공개된 대목을 정리하는 경우 source에 해당 chapter:n 또는 page:키를 함께 쓴다. evidence는 protagonistBlock 본문에서 실제로 드러나는 대목을 12자 이상 그대로 인용한다. 번호가 됐다는 이유만으로 밝혀졌다고 취급하지 않는다.
- 아직 드러나지 않은 답은 summary, protagonistBlock, affected, facts에 사실로 쓰지 않는다. 독자의 선택으로 조사 경로를 놓쳤다면 미공개로 남을 수 있으며 그 결과를 인정한다.
- 아직 공개되지 않은 진실은 집필 계획이다. 이미 확정된 단서나 사실을 지키면서 사용자 선택과 사건 때문에 바꿔야 한다면 secretRevise에 id, truth, cover, reason, source, quote를 적는다. source/quote는 아래 출처 자료 또는 current의 원문이다. 이미 공개된 진실이나 앞에서 확정한 사실은 바꾸지 않는다.

` : ""}${storyWishBlock(w)}${storyClocksBlock(w, nextN, finish)}${(x => x.length ? `## 대화와 조사로 정해진 사실 (decided)\n${JSON.stringify(x)}\n이 사실들은 이미 이야기 속에서 정해졌다. record·첫 장면·문서는 이와 어긋나지 않게 쓴다.\n` : "")(typeof storyTalkDecided === "function" ? storyTalkDecided(w) : [])}

## 지금까지의 장
${st.chapters.map(c => `- ${c.n}장 「${c.title}」 (${c.era}): ${c.summary}${c.wove?.length ? `\n  이 장에 엮인 탐험: ${c.wove.map(x => w.entities[x.key]?.title).filter(Boolean).join(", ")}` : ""}`).join("\n")}

${typeof storyArcBlock === "function" ? storyArcBlock(w) : ""}
${typeof storyDialogueBlock === "function" ? storyDialogueBlock(w) : ""}
${finish ? "" : STORY_HEARSAY_RULE}
## 주인공 문서의 현재 내용
${pp ? docText(pp, w) : "(아직 작성되지 않음)"}

## 이전 진행 기록에서 확인을 보류한 항목
${JSON.stringify(st.chapters.filter(c => c.continuity?.warnings?.length).slice(-3).map(c => ({ chapter: c.n, notes: c.continuity.warnings })))}
위 메모는 새 사실이 아니다. 기존 본문과 기록을 보고 이번 응답에서 정확한 갱신을 작성하되, 이전 상태를 근거 없이 완료 처리하지 않는다.

${storyMemoryBlock(w)}

## ${nextN - 1}장 동안 독자가 탐험한 항목 (중요도 순)
${ex || "(없음)"}

## 독자의 선택
${choice ? `주인공의 다음 행동으로 독자가 고른 것: ${choice.custom || choice.picked}` : "(독자가 선택하지 않았다)"}

${openChapterRules(w, nextN, finish)}
## 규칙
${STORY_RESPONSIBILITY_RULES}
${finish ? "" : `- 이번 장은 전체 ${N}장 중 ${nextN}장이다. ${st.clocks?.length ? `${st.spine[nextN - 1]?.beat || ""} 구간이다. 이 장에 무슨 일이 닥칠지는 위 세계의 시계와 플레이어가 가던 쪽에서 나온다.` : `${st.spine[nextN - 1]?.beat || ""} 구간의 잠정 의도는 참고만 한다: ${st.spine[nextN - 1]?.intent || ""}.`} 이미 벌어진 사건과 독자의 행동에 맞지 않으면 이 장부터 인과에 맞게 진행하고 spineRevise로 이번 단계와 아직 진행하지 않은 뒤 계획도 수정한다.${last ? "" : ` 목표의 일부를 성취하거나 관계가 바뀌어도 된다. 남은 ${N - nextN}개 장은 그 변화와 선택의 여파를 다룰 수 있으므로 억지로 전개를 미루지 않는다.`}`}
- 탐험 반영은 선택 사항이다. 현재 사건과 실제 인과가 있는 항목만 사용하고 wove에 적는다. 관련 없는 탐험을 끼워 넣거나 읽었다는 이유만으로 핵심 배후·만능 단서로 승격하지 않는다. 없어도 되는 경우 wove는 빈 배열이다. '직접 고침'은 확정 설정으로 지키되 장면 등장을 강제하지 않는다.
- 기록 유형 kind는 goal, relationship, promise, conflict, consequence, ongoing, mystery 중 하나를, 중요도 importance는 major 또는 minor 중 하나를 쓴다.
- 상태 값은 unchanged, active, changed, fulfilled, failed, abandoned, continuing 중 하나만 쓴다. 슬래시로 나열한 값을 그대로 출력하지 않는다.
- continuity.updates에는 앞에서 이어지는 각 기록의 유지·변화·결과를 남긴다. 유형이나 표현을 정리할 때만 kind/subject를 넣고, 그대로면 생략한다. 설명용 문자열이나 null로 채우지 않는다. 최근 탐험 목록에 없더라도 빠뜨리지 않는다. unchanged는 이번 장에 변화가 없거나 다루지 않은 이유를 적고 기존 상태를 유지한다. active/changed는 실제 전개, fulfilled/failed/abandoned는 실제 결과(outcome)를 본문 인용으로 뒷받침한다. continuing은 관계·생활·여파 등이 계속됨을 기록하며 변화가 없다면 본문 인용이나 억지 장면을 만들 필요가 없다. 종류가 다른 내용을 전부 해결/미해결로 분류하지 않는다.
- continuity.introduced에는 이후 흐름에 중요한 목표·관계·약속·갈등·행동의 여파·진행 중인 일만 출처 source/quote와 함께 기록한다. 실제로 답을 요구하는 의문·단서만 mystery다. 질문형 문장을 만들 의무는 없다. 필요 없으면 빈 배열이다. 소품·성격·배경을 모두 복선으로 만들지 않는다.
- revealNow와 secretRevise는 이번 장에 실제 공개나 계획 수정이 없으면 빈 배열로 둔다. 임의의 id나 예시 값을 채우지 않는다.
- 독자의 선택이 있으면 continuity.choiceConsequences에 실제로 얻고 놓친 정보·관계·시간·위험·기회·사건 결과 중 바뀐 것을 적고 본문 evidence로 뒷받침한다. 선택을 강제로 성공시키거나 없던 선택을 지어내지 않는다. 선택이 없으면 빈 배열이다. 지난 선택 기록은 이후 장에서도 유지한다.
- 주인공의 결정과 행동은 플레이어가 실제로 한 것에서만 나온다. 위 '등장인물과 실제로 나눈 대화'에 있는 주인공의 말과 행동(kind "주인공의 행동", 상황 채널 포함)${choice ? "과 독자가 고른 행동" : ""}이 그것이다. 이번 장은 먼저 그 말과 행동이 무엇을 낳았는지 정리하고, 그 결과에서 이어 간다. 결과는 의도대로 되지 않아도 된다.
- 플레이어가 하지 않은 주인공의 결정과 행동(어디로 가기로 함, 누구를 만나기로 함, 낮잠을 잠 등)을 새로 지어내지 않는다. 세계와 다른 인물은 움직인다: 사건이 일어나고, 누군가 찾아오고, 약속한 일이 진행된다. 주인공은 그 상황에 놓이고 놀라거나 짧게 반응할 수 있지만, 중요한 결정은 다음 장에서 플레이어가 내리도록 열어 둔다.${choice ? "" : " 플레이어가 이번 장에 아무 말과 행동도 하지 않았으면 주인공은 큰 결정 없이 흐름 속에 머문다."}
- ${st.clocks?.length ? "spineRevise는 빈 배열로 둔다(시계가 뼈대를 대신한다)." : `탐험·선택·이미 확정된 사건 때문에 뒤의 뼈대 단계를 바꿔야 하면 spineRevise로 바꾼다. ${N}단계는 항상 결말로 남겨 둔다. 바꿀 필요가 없으면 빈 배열.`}
- ${finish ? `이야기를 끝낸다. 결말은 ${N}장 기록에서 플레이어가 실제로 한 일로 낸다. 장르와 원안이 실제로 맺기로 한 중심 내용과 주인공의 선택에 대응한다. 모든 관계·목표·생활 문제를 정리할 의무는 없다. 계속되는 관계·일상·노력은 unchanged 또는 continuing으로 자연스럽게 남길 수 있다. 실제로 답을 약속한 의문은 그 약속에 맞게 다루되 모든 설정을 그런 의문으로 바꾸지 않는다. 처리하지 않은 것을 모두 끝냈다고 서술하지 않는다. 기존에 없는 상처의 치유나 사직·희생을 의무로 만들지 않는다. ending.epilogue에 결말 이후를 3~5문장으로 쓴다. nextChoices는 빈 배열.` : `${last ? `이번 장이 마지막 장이다. 첫 장면은 결말로 이어질 마지막 상황을 연다. 결말은 플레이어가 이 장을 치른 뒤 쓴다. ` : ""}nextChoices에는 ${nextN}장이 끝날 때 주인공이 할 수 있는 다음 행동 후보 3개를 한 문장씩 쓴다. 각 후보는 객체가 아니라 문자열 하나다. 서로 방향이 달라야 한다. ending은 null.`}
- 주인공이 죽을 수도 있다. 주인공이 죽으면 이후 장은 그 죽음의 여파와 유산을 중심으로 진행하고, 주인공 문서의 장 섹션은 사후 사건으로 쓴다.
- title과 heading에는 "${nextN}장", "제${nextN}장" 같은 장 번호를 넣지 않는다. 장 번호는 앱이 따로 붙인다.
- era는 이 장의 작중 시점이다. 이전 장(${cur.era})보다 같거나 뒤여야 한다.
- place는 첫 장면에서 주인공이 있는 곳이다. nearby는 이번 장에 주인공이 직접 만나거나 이 세계의 연락 수단으로 닿을 수 있는 인물 3~10명이다(이미 존재하는 인물 제목 그대로, 또는 이번 장의 새 인물). 멀리 있거나 만날 길이 없는 인물은 넣지 않는다. why는 한 줄 이유, place는 그 인물이 첫 장면 무렵 있는 곳이다. ${STORY_PLACE_RULE}${st.entry ? "\n- noticed: 이번 장에서 주변 인물이 주인공의 알 수 없는 지식이나 원래와 다른 모습을 실제로 이상하게 여겼다면 who(인물 제목)와 what(무엇을 이상하게 여겼는지 한 문장)으로 적는다. 없으면 빈 배열." : ""}
- 확정 사실, 사용자 확정 설정, 핵심 규칙, 연표와 모순되지 않는다. "[사용자 확정]"이 붙은 내용과 사용자가 직접 수정한 주인공 문서의 내용을 최우선 제약으로 삼는다.
- ${finish ? `주인공의 상태나 소속이 바뀌었으면 record.infoboxPatch로, 한 줄 정의가 바뀌어야 하면 record.summaryPatch로 고친다.` : `protagonistBlock은 주인공 문서 맨 뒤에 덧붙는 '${nextN}장' 섹션이다. heading에 장 번호를 넣지 않는다. 분량과 범위는 위 '열린 장'을 따른다. 주인공 문서에 이미 있는 내용은 반복하지 않는다. 상태나 소속이 바뀌었으면 infoboxPatch로, 한 줄 정의가 바뀌어야 하면 summaryPatch로 고친다(바꿀 것이 없으면 빈 배열과 빈 문자열).`}
${newItemRule(w, nextN)}
- 새 항목 이름: newEntities와 affected(kind "new")의 title도 본문 링크와 같은 규칙을 따른다. 새 인물의 title은 본명 풀 네임이고, 코드명이나 칭호는 summary와 그 인물 문서의 인포박스에 쓴다.
- affected는 이번 장에서 무언가가 바뀐 기존 항목 2~5개와 위의 새 항목들(있다면)이다. 기존 항목은 아래 목록의 제목을 글자 그대로 쓴다(kind "update"). 엮은 탐험 항목도 바뀌었다면 affected에 넣는다. change는 이번 장에서 그 항목에 일어난 일 한 문장이다.
- facts에는 이번 장에서 확정된 사실을 항목별로 4~10개, timeline에는 이번 장의 주요 사건 1~3개(${TL_DATE_SPEC}${tlDateNote(w).replace(/\n/g, " ")}), relations에는 이번 장에서 새로 생기거나 바뀐 인물 관계를 넣는다. ${REL_SPEC}
${storyStyleRules()}

${relRefBlock(w, Object.keys(w.entities), "", pk, 30)}${eventBlock(w, pk, []).trimEnd()}

## 이미 존재하는 항목 (제목을 글자 그대로 쓴다. 각 줄의 "—" 앞까지가 제목이고, 뒤의 유형과 정의는 제목이 아니다. 제목에 "(인물)" 같은 유형을 붙이지 않는다)
${entityIndex(w, [pk])}

## 출력
${ENTITY_DEFINITION_RULE}
JSON 객체 하나만 출력:
{${prevOpen ? `"record":{"heading":"${nextN - 1}장의 작중 사건명","summary":"${nextN - 1}장에 실제로 일어난 일 3~5문장","sections":[{"heading":"...","level":1,"body":"... [[링크]] ..."}]${finish ? ',"infoboxPatch":[],"summaryPatch":""' : ""}},` : ""}${finish ? "" : `"title":"이 장에 닥친 상황의 이름","era":"이 장의 작중 시점","summary":"첫 장면의 상황 2~4문장",`}"timeline":[{"year":"연도","month":3,"day":14,"event":"..."}],${finish ? "" : `"protagonistBlock":{"heading":"이 장에 닥친 상황의 이름","sections":[{"heading":"...","level":1,"body":"... [[링크]] ..."}],"infoboxPatch":[{"label":"상태","value":"..."}],"summaryPatch":""},`}"affected":[{"title":"항목 제목","change":"이번 장에서 이 항목에 일어난 일 한 문장","kind":"update 또는 new"}],"newEntities":[{"title":"...","type":"${TYPES.join("|")} 중 하나","summary":"한 문장 정의"}],"wove":[{"title":"탐험 항목 제목","how":"이 항목이 이번 장 사건에서 맡은 역할 한 문장"}],"facts":[{"about":"항목 제목","fact":"..."}],${REL_JSON},"spineRevise":[{"n":4,"intent":"..."}],"revealNow":[],"secretRevise":[],${STORY_CONTINUITY_OUTPUT},"dialogueConsequences":[{"character":"대화 상대 이름","detail":"이번 장 본문에 나타난 구체적인 대화의 결과. 없으면 빈 배열"}]${finish ? "" : ',"hearsay":[{"from":"말을 들은 인물 제목","to":"그 말을 전해 들은 가까운 인물 제목","what":"전해진 말(부풀거나 비틀린 그대로)","source":"dialogue:장:키:번호"}]'},${finish ? "" : `"place":{"place":"장소 문서 제목","detail":"그 안의 자리","summary":"새 장소일 때만 한 줄 설명"},"nearby":[{"title":"인물 제목","why":"닿을 수 있는 이유","place":{"place":"이 인물이 있는 장소 문서 제목","detail":"그 안의 자리"}}],`}${st.entry ? '"noticed":[{"who":"인물 제목","what":"..."}],' : ""}"nextChoices":${finish ? "[]" : '["...","...","..."]'},"ending":${finish ? '{"epilogue":"결말 이후 3~5문장"}' : "null"}${finish ? "" : st.clocks?.length ? ',"clockMoves":[{"id":"c1","to":2,"why":"왜 나아갔거나 멈췄거나 물러섰는지 한 문장"}]' : `,${WORLD_CLOCK_JSON.replace('"stages"', '"at":1,"stages"')}`}}`;
}
function chapterBlockPrompt(w, key, chs) {
  const p = S.pages[key], e = w.entities[key];
  const rel = related(w, key).slice(0, 6).map(k => entityBrief(w, k, key)).join("\n\n") || "(없음)";
  const list = chs.map(n => { const c = w.story.chapters[n - 1], a = (c.affected || []).find(x => x.key === key); return `- ${n}장 「${c.title}」 (${c.era}): ${c.summary}\n  이 항목에 일어난 일: ${a?.change || "(줄거리 참고)"}`; }).join("\n");
  return `너는 가상 세계관 위키 「${w.title}」의 집필자다. 이야기가 진행되면서 문서 「${e.title}」에 반영할 새 장이 생겼다. 기존 본문은 그대로 두고, 각 장에서 이 항목에 일어난 일을 문서 끝에 덧붙일 장 섹션으로 쓴다.

## 장 섹션 작성

${canonBlock(w)}

${toneBlock(w)}${w.guide ? `## 작가 지침 (사용자 지정)\n${w.guide}\n\n` : ""}${storyBlock(w, key)}${key === w.story.protagonistKey ? "\n" + storyWishBlock(w) : ""}

## 이 문서의 현재 내용
${docText(p, w)}

## 덧붙일 장 (${chs.join(", ")}장)
${list}

## 관련 항목의 확정 설정 (모순 금지)
${rel}

## 규칙
- 장마다 블록 하나를 쓴다. heading은 그 장에서 이 항목이 겪은 일을 가리키는 작중 사건명이다. "2장", "제2장" 같은 장 번호는 넣지 않는다(앱이 따로 붙인다). sections는 1~3개.
- 블록 하나의 분량은 기존 본문의 15~30%다. 이미 본문에 있는 내용은 반복하지 않는다.
- 위 '이 항목에 일어난 일'과 줄거리에 맞춘다. 그 장 이후의 일은 쓰지 않는다.
${key === w.story.protagonistKey && chs.some(n => w.story.chapters[n - 1]?.open && n === w.story.chapter && !w.story.chapters[n - 1]?.recorded) ? `- 이 문서는 주인공 문서이고 ${w.story.chapter}장은 열린 장이다. 이 장의 블록은 첫 장면만 쓴다: 주인공이 있던 자리와 하던 일에서 시작해, 사건이 주인공 앞에 닥친 순간에서 멈춘다. 주인공의 결정과 행동, 사건의 결과는 쓰지 않는다(플레이어가 대화로 치른 뒤 기록한다). 분량은 400~1,000자.\n` : ""}- 상태, 소속, 직위가 바뀌었으면 infoboxPatch로 고치고, 한 줄 정의가 바뀌어야 하면 summaryPatch에 새 정의를 쓴다. 바꿀 것이 없으면 빈 배열과 빈 문자열.
${chs.every(n => lateBeat(w, n)) ? "- 이야기가 절정이나 결말에 와 있으니 새 인물을 만들지 않는다. 이미 있는 인물과 항목으로 쓴다.\n" : `- 새 인물은 만들지 않는다.${chs.includes(1) && key === w.story.protagonistKey && w.story.wish ? storyWishPeople(w).replace("이번 장에", "1장 첫 장면에 등장시키거나 언급하며") + " 만든 인물은 본문에서 [[링크]]하고 newEntities에 인물로 넣는다." : ""} 필요하면 장소나 물건 하나까지 새로 만들어 링크하고 newEntities에 넣는다.\n`}- facts에는 이 장 섹션이 확정한 사실 2~6개, timeline에는 새로 확정한 사건(있을 때만), newEntities에는 새로 링크한 항목을 넣는다.
${storyStyleRules()}

${relRefBlock(w, Object.keys(w.entities), "", key, 20)}${eventBlock(w, key, []).trimEnd()}
- timeline: ${TL_DATE_SPEC}

## 이미 존재하는 항목 (제목을 글자 그대로 쓴다. 각 줄의 "—" 앞까지가 제목이고, 뒤의 유형과 정의는 제목이 아니다. 제목에 "(인물)" 같은 유형을 붙이지 않는다)
${entityIndex(w, [key], 60)}

## 출력
${ENTITY_DEFINITION_RULE}
JSON 객체 하나만 출력:
{"blocks":[{"ch":${chs[0]},"heading":"작중 사건명","sections":[{"heading":"...","level":1,"body":"..."}]}],"infoboxPatch":[{"label":"...","value":"..."}],"summaryPatch":"","facts":[{"about":"항목 제목","fact":"..."}],${REL_JSON},"timeline":[{"year":"연도","month":3,"day":14,"event":"..."}],"newEntities":[{"title":"...","type":"...","summary":"..."}]}`;
}
