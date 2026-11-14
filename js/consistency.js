"use strict";
/* 설정 대조: 인용, 숫자·연도, 나이 규칙, 검사 실행 */
/* ---------- 인용 대조: 같은 사람이 같은 날 한 말이 문서마다 다르지 않게 ---------- */
const DAY_RE = /(\d{3,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
/* 문서 본문의 인용 상자들: { text, by, speaker, day } */
function quotesOf(p) {
  const out = [];
  for (const s of p.sections || []) {
    let buf = [];
    const flush = () => {
      if (buf.length > 1 && /^[—―–-]{1,2}\s*/.test(buf[buf.length - 1])) {
        const by = stripMarks(buf.pop().replace(/^[—―–-]{1,2}\s*/, "")), text = stripMarks(buf.join(" ")).replace(/^["“]|["”]$/g, "").trim();
        const dm = DAY_RE.exec(by);
        if (text) out.push({ text, by, speaker: norm(by.split(/[,，(]/)[0]), day: dm ? `${dm[1]}-${+dm[2]}-${+dm[3]}` : "", sec: s.heading });
      }
      buf = [];
    };
    for (const line of String(s.body || "").split("\n")) { const m = /^\s*>\s?(.*)$/.exec(line); if (m) buf.push(m[1].trim()); else flush(); }
    flush();
  }
  return out;
}
const sameText = (a, b) => { const n = t => t.replace(/[\s"“”'‘’.,!?…·—-]/g, ""); return n(a) === n(b); };
/* 문서를 쓸 때 넘겨 줄, 관련 인물들이 다른 문서에서 이미 한 말 */
function quoteIndex(w, key, max = 8) {
  const e = w.entities[key], names = new Set([e.title, ...related(w, key).map(k => w.entities[k]?.title).filter(Boolean)]);
  const rows = [];
  for (const [k, p] of Object.entries(S.pages)) {
    if (k === key) continue;
    for (const q of quotesOf(p)) if ([...names].some(n => n && (q.speaker.includes(n) || n.includes(q.speaker) || q.by.includes(n)))) rows.push(`- ${q.by}: "${q.text.slice(0, 200)}" (「${p.title}」에 기록)`);
  }
  return rows.slice(0, max).join("\n");
}
/* 이 문서의 인용과 다른 문서의 인용이 같은 사람, 같은 날짜인데 내용이 다르면 지적. 먼저 쓴(또는 직접 수정한) 문서가 기준 */
function quoteIssues(w, k) {
  const here = S.pages[k]; if (!here) return [];
  const mine = quotesOf(here).filter(q => q.day && q.speaker), out = [];
  if (!mine.length) return out;
  const ref = (a, b) => (!!a.editedAt !== !!b.editedAt) ? !!a.editedAt : (a.createdAt || 0) <= (b.createdAt || 0);   // a가 기준인가
  for (const [x, p] of Object.entries(S.pages)) {
    if (x === k) continue;
    for (const o of quotesOf(p)) for (const q of mine) {
      if (!o.day || o.day !== q.day || !(o.speaker.includes(q.speaker) || q.speaker.includes(o.speaker)) || sameText(o.text, q.text)) continue;
      if (ref(p, here)) out.push({ claim: q.text.slice(0, 300), conflict: `근거: 「${p.title}」에 먼저 기록된 같은 자리의 말: "${o.text.slice(0, 160)}" — ${o.by} · 인용 대조: 같은 사람이 같은 날 한 말이 문서마다 다르다. 이 문서의 인용을 「${p.title}」의 인용과 글자 그대로 맞추거나, 인용을 빼고 간접 서술로 바꾼다.`.slice(0, 500), severity: "high", by: "num" });
      else out.push({ claim: q.text.slice(0, 300), conflict: `근거: 「${p.title}」의 같은 자리 인용: "${o.text.slice(0, 160)}" — ${o.by} · 인용 대조: 같은 사람이 같은 날 한 말이 문서마다 다르다. 이 문서가 기준이므로 고칠 쪽은 「${p.title}」 문서다.`.slice(0, 500), severity: "low", by: "num", target: x, targetOld: o.text.slice(0, 300) });
    }
  }
  return out.slice(0, 4);
}

/* ---------- 숫자 대조: 주체와 사건이 명시된 정확한 연도만 비교한다 (AI 호출 없음) ---------- */
const NUM_KINDS = [
  { kind: "birth", name: "출생", label: /출생|탄생|생년/, verb: /태어|출생|탄생|\d년생/ },
  { kind: "death", name: "사망", label: /사망|전사|서거|몰년|별세/, verb: /사망|숨[지을]|숨졌|전사|죽[었은]|서거|처형|별세|순직|요절/ },
  { kind: "founding", name: "설립·창설", label: /설립|창설|창립|결성|발족|창단/, verb: /설립|창설|창립|결성|발족|창단/ },
  { kind: "introduction", name: "도입", label: /도입/, verb: /도입/ },
  { kind: "development", name: "개발", label: /개발/, verb: /개발/ },
  { kind: "enactment", name: "제정", label: /제정/, verb: /제정/ },
  { kind: "enforcement", name: "시행", label: /시행|발효/, verb: /시행|발효/ },
  { kind: "nation", name: "건국", label: /건국/, verb: /건국/ },
  { kind: "publication", name: "창간", label: /창간/, verb: /창간/ },
  { kind: "school", name: "개교", label: /개교/, verb: /개교/ },
  { kind: "establishment", name: "성립", label: /성립/, verb: /성립/ }];
// 범위·근사 연도를 정확한 기준값으로 취급하지 않는다. 생몰 두 날짜는 별도로 읽는다.
/* ---------- 연도 읽기: 서기 네 자리, 세 자리 이하, 기원전, 가상 기년법("제국력 312년")을 한곳에서 판별한다 ---------- */
/* 결과 { y: 숫자(기원전은 음수), cal: 기년법 이름(서기는 ""), approx: 범위·근사 표현인가 }. cal이 다른 연도끼리는 비교하지 않는다.
   1000~2099년은 예전처럼 거의 항상 연도로 본다. 그 밖의 숫자는 "300년 동안", "300년을 살았다"처럼 기간일 수 있어 엄격하게 본다.
   두 자리 이하 숫자는 기년법 표시("제국력 12년", "기원전 12년")가 있을 때만 연도다 */
const CAL_NOT = /^(?:경|이|전|실|능|노|권|병|체|매|화|활|효|세|협|압|재|학|시|기|정|중|동|인|국|저|마|위|장|탄|추|무|근|담|염|법|도|공|내|외|원|역|자|수|풍|청|필|합|극|박|지|열|전|탈|군사|경제|생산|상상|집중|판단|기억|영향|원심|구심|전투|정신|사고|추진|지구|결단|통솔|순발|응집|설득|표현|이해|창의|생명|경쟁|공격|방어|마법|전투|노동|구매|폭발|파괴|회복|저항|흡인|장악|돌파|지도|정치|외교|자본)력$/;
const YEAR_DUR = /^\s*(?:동안|간|만(?!료)|뒤|후(?!반)|전(?!후|반)|째|차(?!례)|이상|이하|이내|가량|남짓|정도|쯤|여(?![름])|넘|마다|씩|형)/;   // 년 뒤에 오면 기간이다
const YEAR_OK_AFTER = /^(?:$|[\s,.)\]」』·:;~～∼–—-]|에(?!\s*걸쳐)|부터|까지|경|대|무렵|생|도(?:\s|$|에|의|부터))/;   // 엄격한 연도 뒤에 올 수 있는 것
/* 이 세계가 쓰는 기년법·연호 이름: 세계관을 만들 때 AI가 적은 것(w.calendars) + 연표 연도 칸("건안 13")의 이름.
   연호는 새 문서가 늘릴 수 있으므로 연표에서 계속 모은다. "○○력", "○○ 기원"은 목록에 없어도 기년법으로 본다 */
const CAL_SKIP = /^(?:서기|기원전|기원후|AD|A\.D\.|BCE?|B\.C\.|CE|약|대략|초|말|봄|여름|가을|겨울|초반|중반|후반|전반|초기|중기|말기|이른|늦은|무렵|경|연도|년)$/i;
const cleanCalendars = a => [...new Set((Array.isArray(a) ? a : []).map(x => stripMarks(String(x || "")).replace(/\s+/g, " ").trim()).filter(x => x.length >= 1 && x.length <= 10 && /^[가-힣A-Za-z][가-힣A-Za-z ]*$/.test(x) && !CAL_SKIP.test(x)))].slice(0, 40);
let calMemo = null;
function calInfo(w) {
  if (!w) return { re: null };
  const sig = JSON.stringify([w.calendars || [], (w.timeline || []).map(t => t.year)]);
  if (calMemo && calMemo.w === w && calMemo.sig === sig) return calMemo;
  const names = new Set(cleanCalendars(w.calendars));
  for (const t of w.timeline || []) { const m = /^\s*([가-힣A-Za-z][가-힣A-Za-z ]{0,9}?)\s*(?:\d{1,5}|원)\s*년?\s*$/.exec(String(t.year || "")); if (m) for (const x of cleanCalendars([m[1]])) names.add(x); }
  const alt = [...names].sort((a, b) => b.length - a.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*")).join("|");
  return (calMemo = { w, sig, re: alt ? new RegExp(`(?:^|[^가-힣A-Za-z])(${alt})\\s*$`) : null, one: alt ? new RegExp(`(?:^|[^가-힣A-Za-z])(${alt})\\s*원년`, "g") : null });
}
function yearHits(t, w = S.world) {
  t = String(t || ""); const out = [], ci = calInfo(w);
  if (ci.one) for (const m of t.matchAll(ci.one)) out.push({ y: 1, cal: m[1].replace(/\s+/g, ""), approx: false, at: m.index });   // "건안 원년"
  for (const m of t.matchAll(/(^|[^\d,.])(\d{1,5})\s*년/g)) {
    const at = m.index + m[1].length, before = t.slice(Math.max(0, at - 16), at), after = t.slice(at + m[0].length - m[1].length);
    if (/^0/.test(m[2]) && m[2].length !== 4) continue;   // "0079년"만 연도로 본다
    const lm = ci.re && ci.re.exec(before);   // 이 세계의 연호 ("건안 13년", "메이지 45년")
    const mk = lm ? null : /(?:(기원전|BCE?|B\.C\.)|(서기|기원후|AD|A\.D\.|CE)|([가-힣]{1,6}력|[가-힣]{1,6}\s?기원))\s*$/.exec(before);
    const cal = lm ? lm[1].replace(/\s+/g, "") : mk?.[3] && !CAL_NOT.test(mk[3]) ? mk[3].replace(/\s+/g, "") : "", marked = !!(lm || (mk && (mk[1] || mk[2] || cal)));
    let y = +m[2]; if (mk?.[1]) y = -y;
    if (YEAR_DUR.test(after)) continue;
    const legacy = !marked && y >= 1000 && y <= 2099;
    if (!marked && !legacy) {
      if (m[2].length <= 2 || !YEAR_OK_AFTER.test(after) || /(?:후|뒤|이후|만에|전|지나|지난)\s*$/.test(before)) continue;   // 기간이나 어떤 일로부터 몇 해인지일 수 있다
    }
    const approx = /^\s*(?:대|경|무렵|전후|이전|이후|부터|까지)/.test(after) || /^\s*[~～∼–—-]\s*(?:[가-힣A-Z.]*\s*)?\d/.test(after) || /[~～∼–—-]\s*(?:[가-힣A-Z.]*\s*)?$/.test(before);
    out.push({ y, cal, approx, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
const sameYear = (a, b) => a.cal === b.cal && a.y === b.y;
const fmtY = h => h.cal ? `${h.cal} ${h.y}년` : h.y < 0 ? `기원전 ${-h.y}년` : `${h.y}년`;
/* a년에서 b년까지 몇 해인가 (기원전 1년 다음 해는 서기 1년) */
const yDiff = (a, b) => b - a - (a < 0 && b > 0 ? 1 : 0);
const approximateYears = t => /\d\s*년\s*(?:대|경|무렵|전후|이전|이후|부터|까지)|\d\s*(?:년\s*)?[~～∼–—-]\s*\S{0,8}\d/.test(t) || yearHits(t).some(h => h.approx);
const yearsOf = yearHits;
const sentencesOf = t => [...String(t).matchAll(/[^.!?。\n]+[.!?。]?/g)].map(m => m[0].trim()).filter(x => x.length > 4);
/* 인포박스에서 소유자·사건이 명확한 기준값과 그 근거 줄만 읽는다. */
function numFacts(p) {
  const f = {};
  for (const r of p.infobox || []) {
    const v = stripMarks(r.value), ys = yearsOf(v), line = `${r.label}: ${v}`;
    if (!ys.length || /\d\s*년\s*(?:대|경|무렵|전후|이전|이후|부터|까지)/.test(v)) continue;
    if (/^생몰(?:년|연도)?$/.test(r.label.trim())) { f.birth ||= { ...ys[0], line }; if (ys[1] && ys[1].cal === ys[0].cal) f.death ||= { ...ys[1], line }; continue; }
    if (ys.length !== 1 || approximateYears(v)) continue;
    for (const K of NUM_KINDS) if (new RegExp(`^(?:(?:최초|공식|정식|실제|최종)\\s*)?(?:${K.label.source})(?:\\s*(?:일자|연도|년도|시기|시점|일|년))?$`).test(r.label.trim()) && !f[K.kind]) f[K.kind] = { y: ys[0].y, cal: ys[0].cal, line };
  }
  return f;
}
/* 문장에서 항목을 가리키는 이름들: 제목과 괄호 표기, 인물은 겹치지 않는 성이나 이름 */
/* 동기 검사 한 번에만 이름과 문장의 인물 목록을 보관한다. 중첩된 detIssues/ageRuleIssues는 공유하고 반환·예외 때 버린다. */
let nameCheckContext = null;
function withNameCheckContext(w, check) {
  if (nameCheckContext?.w === w && nameCheckContext.pages === S.pages) return check();
  const previous = nameCheckContext;
  nameCheckContext = { w, pages: S.pages, names: new Map(), mentions: new Map(), people: Object.keys(w.entities).filter(k => w.entities[k].type === "인물" || S.pages[k]?.type === "인물") };
  try { return check(); } finally { nameCheckContext = previous; }
}
function refNames(w, k) {
  const memo = nameCheckContext?.w === w && nameCheckContext.pages === S.pages ? nameCheckContext.names : null;
  if (memo?.has(k)) return memo.get(k);
  const o = w.entities[k], out = new Set(namesOf(o.title));
  if (o.type === "인물") for (const t of o.title.replace(/\(.*\)$/, "").split(/[\s·]+/)) if (t.length >= 2 && nameOwner(w, t) === k) out.add(t);
  const names = [...out]; if (memo) memo.set(k, names);
  return names;
}
function mentionedPeople(w, text) {
  const context = nameCheckContext?.w === w && nameCheckContext.pages === S.pages ? nameCheckContext : null;
  if (context?.mentions.has(text)) return context.mentions.get(text);
  const keys = context?.people || Object.keys(w.entities).filter(k => w.entities[k].type === "인물" || S.pages[k]?.type === "인물");
  const people = keys.filter(k => refNames(w, k).some(n => hasName(text, n)));
  if (context) context.mentions.set(text, people);
  return people;
}
function pageTexts(p) {
  return [p.summary || "", ...(p.infobox || []).map(r => `${r.label}: ${stripMarks(r.value)}`), ...p.sections.map(s => stripMarks(s.body))];
}
/* 이름이 목적어·수식어로 언급된 문장은 제외한다. 명시적 주어 또는 '이름의 사건 연도'만 허용한다.
   복합절/다른 주어/소유자/비교/부정/근사 표현은 기계적으로 귀속할 수 없어 보류한다. */
function numericSubject(sen, names, K) {
  if (approximateYears(sen) || /(?:않|아니|못했|이전|이후|무렵|전후|이래|현재|보다|달리|반면|비해|라는|다는|하던|했던|되어야|되면|한다면)/.test(sen)) return false;
  for (const name of names) {
    let start = -1;
    while ((start = sen.indexOf(name, start + 1)) >= 0) {
      if (start && /[\p{L}\p{N}_]/u.test(sen[start - 1])) continue;
      const rest = sen.slice(start + name.length).replace(/^[」』”’"')]+\s*/, "");
      const subject = /^(?:은|는|이|가)(?=\s|[0-9(（]|$)\s*/.exec(rest);
      const own = new RegExp(`^의\\s*(?:(?:최초|공식|정식|실제|최종)\\s*)?(?:${K.label.source})(?:\\s*(?:연도|시점|시기|일자|일))?(?:은|는|이|가|:)?(?=\\s|[0-9]|$)`).exec(rest);
      const head = subject || own; if (!head) continue;
      const tail = rest.slice(head[0].length);
      if (/[\p{L}\p{N}]+(?:은|는|이|가|의)(?=\s)/u.test(tail) || /[,，;；]/.test(tail)) continue;
      if (K.kind !== "birth" && K.kind !== "death" && /[\p{L}\p{N}]+(?:을|를)(?=\s)/u.test(tail)) continue;
      if (!K.verb.test(rest)) continue;
      return true;
    }
  }
  return false;
}
/* 어느 쪽이 기준인가: 한쪽만 직접 수정했으면 그쪽, 아니면 먼저 쓴 문서. true면 문서 A가 문서 B보다 기준 */
function pageIsRef(A, B) {
  if (A === B) return true;
  const a = S.pages[A], b = S.pages[B];
  if (!!a.editedAt !== !!b.editedAt) return !!a.editedAt;
  return (a.createdAt || 0) <= (b.createdAt || 0);
}
const KIN_RE = /아버지|어머니|부친|모친|부모|아내|남편|배우자|형제|자매|형이|형은|동생|아들|딸|자녀|손자|조부|할아버지|할머니|삼촌|이모|고모|가족|연인|약혼/;
/* 다른 항목 이름이 함께 나오면 누구 이야기인지 알 수 없어 비교하지 않는다 */
function onlyAboutFn(w) {
  const named = Object.keys(w.entities).filter(x => S.pages[x] || w.entities[x].type === "인물").map(x => [x, refNames(w, x)]);
  return (sen, E) => named.every(([x, ns]) => x === E || !ns.some(n => sen.includes(n)));
}
/* 이 문서(k)와 관련된 숫자 모순. 이 문서가 다른 항목을 다르게 적었거나(high), 다른 문서가 이 항목을 다르게 적었거나(low), 이 문서 안에서 다르다(high) */
function numericIssues(w, k) {
  const out = [], seen = new Set(), here = S.pages[k]; if (!here) return out;
  /* target: 고칠 쪽이 다른 문서일 때 그 문서 키, targetOld: 그 문서에서 고칠 서술 */
  const push = (claim, evidence, conflict, severity, target, targetOld) => { const key = claim + "|" + evidence; if (seen.has(key)) return; seen.add(key); out.push({ claim: claim.slice(0, 300), conflict: `근거: ${evidence.slice(0, 200)} · 숫자 대조: ${conflict}`.slice(0, 400), severity, by: "num", ...(target ? { target, targetOld: String(targetOld).slice(0, 300) } : {}) }); };
  const eraH = yearHits(w.era).find(h => !h.approx);   // "1920년대"처럼 근사한 기준 시점으로는 나이를 계산하지 않는다
  const KIN = KIN_RE, onlyAbout = onlyAboutFn(w);
  const eIsRef = (P, E) => pageIsRef(E, P);   // true면 항목 E의 인포박스가 기준
  const compare = (P, E) => {   // 문서 P의 문장들을 항목 E의 인포박스 기준값과 비교한다
    const pe = S.pages[E]; if (!pe) return;
    const ref = eIsRef(P, E), why = P === E ? "" : ref ? (pe.editedAt && !S.pages[P].editedAt ? "직접 수정한 " : "먼저 쓴 ") : (S.pages[P].editedAt && !pe.editedAt ? "직접 수정한 " : "먼저 쓴 ");
    const f = numFacts(pe); if (!NUM_KINDS.some(K => f[K.kind])) return;
    const names = refNames(w, E);
    const ibox = new Set((pe.infobox || []).map(r => `${r.label}: ${stripMarks(r.value)}`));
    for (const sen of pageTexts(S.pages[P]).flatMap(sentencesOf)) {
      if (P === E && ibox.has(sen)) continue;   // 기준이 된 인포박스 줄 자체는 비교하지 않는다
      if (!names.some(n => sen.includes(n)) || !onlyAbout(sen, E)) continue;
      const ys = yearsOf(sen);
      for (const K of NUM_KINDS) {
        const base = f[K.kind]; if (!base || !K.verb.test(sen) || !numericSubject(sen, names, K) || KIN.test(sen)) continue;
        if (ys.length === 1 && ys[0].cal === base.cal && ys[0].y !== base.y && !NUM_KINDS.some(O => O !== K && O.verb.test(sen))) {
          const who = P === E ? "이 문서" : `「${pe.title}」 문서`;
          const pt = S.pages[P].title;
          if (ref) {   // 항목 문서의 인포박스가 기준: 다르게 적은 P가 고칠 쪽
            if (P === k) push(sen, `${why}${who} 인포박스 ${base.line}`, `「${pe.title}」의 ${K.name} 연도가 ${fmtY(ys[0])}으로 적혀 있지만 ${why}${who} 인포박스에는 ${fmtY(base)}이다. 이 문서를 그에 맞춘다.`, "high");
            else push(base.line, `「${pt}」의 서술: ${sen}`, `「${pt}」 문서가 이 항목의 ${K.name} 연도를 ${fmtY(ys[0])}으로 적었다. 이 문서가 기준이므로 고칠 쪽은 「${pt}」 문서다.`, "low", P, sen);
          } else {     // 먼저 쓴(또는 직접 수정한) P가 기준: 항목 문서 E의 인포박스가 고칠 쪽
            if (E === k) push(base.line, `${why}「${pt}」 문서: ${sen}`, `${why}「${pt}」 문서가 이 항목의 ${K.name} 연도를 ${fmtY(ys[0])}으로 확정했는데 이 문서 인포박스는 ${fmtY(base)}이다. 이 문서의 인포박스와 그와 얽힌 서술을 ${fmtY(ys[0])}에 맞춘다.`, "high");
            else push(sen, `「${pe.title}」 인포박스 ${base.line}`, `「${pe.title}」 문서가 ${K.name} 연도를 ${fmtY(base)}으로 적었지만 ${why}이 문서가 기준이므로 고칠 쪽은 「${pe.title}」 문서다.`, "low", E, base.line);
          }
        }
      }
      const am = /(?:향년\s*)?(\d{1,3})\s*세/.exec(sen);
      if (am && f.birth && f.death && f.birth.cal === f.death.cal && numericSubject(sen, names, NUM_KINDS[1]) && NUM_KINDS[1].verb.test(sen) && !KIN.test(sen) && !/\d{1,3}\s*세[가-힣]*\s*(때|무렵|에)\b/.test(sen)) {
        const a = +am[1], d = yDiff(f.birth.y, f.death.y);
        if (Math.abs(a - d) > 1) {
          const pt = S.pages[P].title, lines = `${f.birth.line} / ${f.death.line}`;
          if (ref) {
            if (P === k) push(sen, `${why}「${pe.title}」 인포박스 ${lines}`, `사망 나이가 ${a}세로 적혀 있지만 ${why}「${pe.title}」 인포박스의 출생·사망 연도로 계산하면 ${d - 1}~${d}세다. 이 문서를 그에 맞춘다.`, "high");
            else push(f.death.line, `「${pt}」의 서술: ${sen}`, `「${pt}」 문서가 사망 나이를 ${a}세로 적었지만 이 문서의 연도로 계산하면 ${d - 1}~${d}세다. 이 문서가 기준이므로 고칠 쪽은 「${pt}」 문서다.`, "low", P, sen);
          } else {
            if (E === k) push(f.death.line, `${why}「${pt}」 문서: ${sen}`, `${why}「${pt}」 문서가 사망 나이를 ${a}세로 확정했는데 이 문서의 출생·사망 연도로는 ${d - 1}~${d}세다. 이 문서의 연도를 그 나이에 맞춘다.`, "high");
            else push(sen, `「${pe.title}」 인포박스 ${lines}`, `「${pe.title}」 문서의 연도로 계산하면 ${d - 1}~${d}세지만 ${why}이 문서가 기준이므로 고칠 쪽은 「${pe.title}」 문서다.`, "low", E, f.death.line);
          }
        }
      }
    }
  };
  for (const E of [...new Set([...(here.links || []), ...Object.keys(S.pages)])]) if (E !== k && S.pages[E] && w.entities[E] && refNames(w, E).some(n => pageTexts(here).some(t => t.includes(n)))) compare(k, E);   // 이 문서가 다른 항목을 적은 곳
  for (const P of Object.keys(S.pages)) if (P !== k && w.entities[P]) compare(P, k);   // 다른 문서가 이 항목을 적은 곳
  compare(k, k);   // 이 문서 안
  const f = numFacts(here);   // 인포박스의 "(36세)" 같은 현재 나이
  if (f.birth && !f.death && eraH && eraH.cal === f.birth.cal) {
    const am = /\((\d{1,3})\s*세\)/.exec(f.birth.line), age = yDiff(f.birth.y, eraH.y);
    if (am && Math.abs(+am[1] - age) > 1) push(f.birth.line, `작중 기준 시점 ${w.era}`, `작중 기준 시점으로 계산하면 ${age - 1}~${age}세인데 ${am[1]}세로 적혀 있다.`, "high");
  }
  out.push(...personNumericIssues(w, k));
  return out.slice(0, 8);
}
/* ---------- 나이 규칙: 핵심 규칙의 나이 제한으로 출생·기간 연도를 맞춰 본다 ---------- */
/* 숫자 대조 로직(numericIssues, quoteIssues, ageRuleIssues, 성별 규칙)을 바꿀 때마다 올린다.
   문서를 열 때 p.check.numV가 이 값과 다르면 결정론 지적만 다시 계산해 바꿔 끼운다 */
const NUMERIC_VERSION = 10;
/* 규칙 문장은 세계관마다 표현이 달라 코드로 읽지 않는다. 핵심 규칙이 바뀌었을 때만 AI가 한 번 구조로 뽑고(w.ageRules),
   판정은 그 구조로 코드가 한다. 그래서 검사할 때마다 결과가 같다 */
const rulesText = w => (w.rules || []).join("\n");
function ageRulePrompt(w) {
  return `다음은 가상 세계관의 핵심 규칙이다. 이 중 "어떤 부류의 존재가 어떤 기간(활동, 복무, 재위, 각성 상태 등)을 몇 살에 시작하거나 끝내는지"를 나이 숫자로 정한 규칙만 골라 구조로 옮겨라.

## 핵심 규칙
${(w.rules || []).map((r, i) => `R${i + 1}. ${r}`).join("\n") || "(없음)"}

## 옮기는 법
- subjects: 규칙이 적용되는 부류를 문서에서 그대로 쓰일 낱말로 1~3개(예: 전략체, 마법소녀, 엘프, 용기사). "사람", "모든 인물"처럼 누구에게나 해당하는 말은 쓰지 않는다. 그런 규칙은 넣지 않는다.
- startMin, startMax: 그 기간을 시작할 수 있는 나이의 하한과 상한(세). 한쪽만 정해져 있으면 다른 쪽은 null. "열네 살"은 14로 바꾼다.
- endAge: 그 기간이 끝나는 나이(세. 예: "20세를 기점으로 퇴역", "열여섯이 되면 힘을 잃는다" → 20, 16). 정해져 있지 않으면 null.
- spanWords: 인포박스에서 이 기간을 적는 줄의 이름에 들어갈 낱말 1~6개(예: 현역, 복무, 활동, 재위, 각성, 계약).
- 규칙에 나이 숫자가 없으면 넣지 않는다. 규칙이 말하지 않은 숫자를 짐작해 채우지 않는다.
- 예: "엘프는 100세부터 300세 사이에 성년식을 치르고 숲의 수호자가 된다" → {"rule":"R?","subjects":["엘프"],"startMin":100,"startMax":300,"endAge":null,"spanWords":["수호자","수호","활동"]}
- 예: "18세 이상의 기사만 서약할 수 있다" → {"rule":"R?","subjects":["기사"],"startMin":18,"startMax":null,"endAge":null,"spanWords":["서약","기사","복무"]}

JSON 객체 하나만 출력: {"rules":[{"rule":"R번호","subjects":["..."],"startMin":숫자 또는 null,"startMax":숫자 또는 null,"endAge":숫자 또는 null,"spanWords":["..."]}]}
해당하는 규칙이 없으면 rules는 빈 배열.`;
}
/* AI 결과에서 앞뒤가 맞는 것만 남긴다 */
function parseAgeRules(r, w) {
  const num = x => x === null || x === undefined || x === "" ? null : Number.isInteger(+x) && +x >= 0 && +x <= 100000 ? +x : NaN;
  const words = (a, n) => (Array.isArray(a) ? a : []).map(x => stripMarks(String(x || "")).trim()).filter(x => x.length >= 1 && x.length <= 20).slice(0, n);
  const out = [];
  for (const x of (Array.isArray(r?.rules) ? r.rules : []).slice(0, 8)) {
    const subjects = words(x?.subjects, 3), spanWords = words(x?.spanWords, 6), min = num(x?.startMin), max = num(x?.startMax), end = num(x?.endAge);
    if (!subjects.length || !spanWords.length || [min, max, end].some(Number.isNaN) || (min === null && max === null && end === null)) continue;
    if ((min !== null && max !== null && min > max) || (end !== null && ((max ?? min ?? 0) >= end))) continue;
    const i = /^R(\d+)$/.exec(String(x?.rule || "").trim()), text = i && w?.rules?.[+i[1] - 1] ? stripMarks(w.rules[+i[1] - 1]) : "";
    out.push({ subjects, min, max, end, spanWords, text });
  }
  return out;
}
/* 저장된 해석이 지금 규칙의 것일 때만 쓴다. 규칙이 바뀌었는데 아직 다시 해석하지 않았으면 나이 검사를 하지 않는다 */
const ageRules = w => w.ageRules && w.ageRules.text === rulesText(w) ? w.ageRules.rules || [] : [];
/* 검사 결과에 찍는 표시: 숫자 대조 로직 버전 + 그때 쓴 나이 규칙 해석. 규칙이 있는데 아직 해석 전이면 "?"라서,
   나중에 해석이 생기거나 규칙이 바뀌면 표시가 달라져 문서를 열 때 다시 계산된다 */
const hashText = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
function numStamp(w) {
  const t = rulesText(w);
  return `${NUMERIC_VERSION}:${!t.trim() ? "-" : w.ageRules?.text === t ? hashText(t) : "?"}`;
}
let ageRuleCall = null;   // 같은 규칙을 동시에 두 번 해석하지 않는다
async function ensureAgeRules(w, opts = {}) {
  const text = rulesText(w);
  if (w.ageRules?.text === text) return;
  if (!text.trim()) { w.ageRules = { text, rules: [] }; return; }
  if (ageRuleCall?.w === w && ageRuleCall.text === text) return ageRuleCall.p;
  const p = (async () => {
    const r = await callJson("ageRule", ageRulePrompt(w), { modelTier: "check", ...opts }, { title: "핵심 규칙 · 나이 규칙 해석" });
    if (rulesText(w) !== text) return;
    w.ageRules = { text, rules: parseAgeRules(r, w) };
    try { await Store.saveWorld(w); } catch {}
  })();
  ageRuleCall = { w, text, p };
  try { await p; } finally { if (ageRuleCall?.p === p) ageRuleCall = null; }
}
/* 값에서 기간 하나를 읽는다: "1965년 ~ 1973년", "1965년 ~ 현재", "제1전략체전대 (1987~1991)", "1987–91", "제국력 12년 ~ 15년".
   기간이 둘 이상 적힌 줄은 어느 쪽이 시작인지 단정할 수 없어 읽지 않는다. 기존 숫자 대조에는 넣지 않고 나이 규칙에만 쓴다 */
function spanOf(v) {
  if (/\d\s*년\s*(?:대|경|무렵|전후)/.test(v)) return null;
  const found = [];
  for (const m of v.matchAll(/(\d{1,5})\s*(년)?\s*[~～∼–—-]\s*(?:(\d{1,5})(?!\d)(?:\s*(년))?|(현재))/g)) {
    const after = v.slice(m.index + m[0].length);
    if (!m[2] && !m[4] && !m[5] && !/^\s*(?:$|[)\]）,.·;:]|\s)/.test(after)) continue;
    if (/^\s*(?:명|개|척|대|기|권|호|%|인|km|m\b|kg|t\b)/.test(after)) continue;   // "100-200명" 같은 수량
    const a = yearHits(v.slice(Math.max(0, m.index - 16), m.index) + m[1] + "년").pop();   // 앞의 기년법 표시까지 함께 읽는다
    if (!a || a.approx) continue;
    let end = null;
    if (!m[5]) {   // 끝 연도는 시작 연도의 기년법을 따른다. "1987–91"처럼 두 자리로 줄인 끝 연도는 앞 두 자리를 채운다
      let n = +m[3];
      if (m[3].length === 2 && m[1].length === 4 && a.y > 0) { n += Math.floor(a.y / 100) * 100; if (n < a.y) n += 100; }
      else if (m[3].length < 3 && !a.cal && a.y > 0) continue;
      end = a.y < 0 ? -n : n;
      if (end < a.y) continue;
    }
    found.push({ start: a.y, end, cal: a.cal, now: !!m[5] });
  }
  return found.length === 1 ? found[0] : null;
}
function spanFacts(p, spanWords) {
  for (const r of p.infobox || []) {
    if (!spanWords.some(x => r.label.includes(x))) continue;
    const v = stripMarks(r.value), sp = spanOf(v);
    if (sp) return { start: sp.start, end: sp.end, cal: sp.cal, now: sp.now, label: r.label.trim(), line: `${r.label}: ${v}` };
  }
  return null;
}
/* 이름이 다른 낱말의 일부로 들어간 경우(뉘른베르크의 베르크)는 이름으로 보지 않는다 */
const hasName = (t, n) => { let i = -1; while ((i = t.indexOf(n, i + 1)) >= 0) if (!i || !/[\p{L}\p{N}_]/u.test(t[i - 1])) return true; return false; };
/* 문장 속 인물을 명시적 주어로 확인한다. 성·이름 조각은 refNames의 유일 소유자 판정을 따른다. */
function personSubjects(w, key, text) {
  const hits = [];
  for (const name of refNames(w, key)) {
    let at = -1;
    while ((at = text.indexOf(name, at + 1)) >= 0) {
      if (at && /[\p{L}\p{N}_]/u.test(text[at - 1])) continue;
      const tail = /^(?:은|는|이|가)(?=\s|$)/.exec(text.slice(at + name.length));
      if (tail) hits.push({ at, end: at + name.length + tail[0].length });
    }
  }
  const unique = new Map();
  for (const h of hits.sort((a, b) => a.at - b.at)) if (!unique.has(h.end)) unique.set(h.end, h);
  return [...unique.values()];
}
/* 소수점과 단위 안의 점은 문장 경계가 아니다. 이 네 검사에서만 사용한다. */
const personSentences = text => stripMarks(text).split(/(?<=[.!?。])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const uncertainPersonClaim = text => /않|아니|아닌|못했|였다면|었더라면|라면|가정|추정|추측|약\s*\d|대략|가량|남짓|무렵|전후|보다|비해|달리/.test(text);
/* 퇴역 연도는 인물 본인의 명시적 전역·퇴역만. 여러 연도와 다른 주어가 얽히면 읽지 않는다. */
function personRetirements(w, key, p) {
  const rows = [];
  for (const text of personSentences([p.summary || "", ...(p.sections || []).map(s => s.body)].join("\n"))) {
    const subjects = personSubjects(w, key, text), ys = yearHits(text, w);
    if (subjects.length !== 1 || ys.length !== 1 || ys[0].approx || uncertainPersonClaim(text) || KIN_RE.test(text)) continue;
    const tail = text.slice(subjects[0].end).replace(/\d+\s*세(?:은|는|이|가)(?=\s)/g, "");
    if (/[\p{L}\p{N}]+(?:을|를)(?=\s)/u.test(tail.replace(/(?:생일|전역|퇴역)을|가을|겨울/g, ""))) continue;
    if (/[\p{L}\p{N}]+(?:은|는|이|가)(?=\s)/u.test(tail) || !/(?:명예\s*)?(?:전역|퇴역)(?:을\s*(?:마쳤|완료)|했|하|했고|하였다|했다)/.test(tail)) continue;
    rows.push({ ...ys[0], line: text });
  }
  for (const r of p.infobox || []) if (/^(?:명예\s*)?(?:전역|퇴역)(?:\s*(?:연도|년도|일자|일))?$/.test(r.label)) {
    const ys = yearHits(stripMarks(r.value), w);
    if (ys.length === 1 && !ys[0].approx) rows.push({ ...ys[0], line: `${r.label}: ${stripMarks(r.value)}` });
  }
  return rows;
}
/* 인포박스에 확정된 신장·전고만 같은 단위로 대조한다. 계수·식량 등 본문 수치는 수집하지 않는다. */
function personHeights(p) {
  const rows = [];
  for (const r of p.infobox || []) {
    if (!/^(?:전성기\s*)?(?:신장|전고|키)$/.test(r.label.trim())) continue;
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|미터|cm|센티미터)\s*$/.exec(stripMarks(r.value));
    if (m) rows.push({ value: +m[1], unit: /^(?:m|미터)$/.test(m[2]) ? "m" : "cm", line: `${r.label}: ${stripMarks(r.value)}` });
  }
  return rows;
}
function personNumericIssues(w, k) {
  const out = [];
  const push = (P, E, claim, evidence, detail) => {
    const ref = pageIsRef(E, P), target = ref ? P : E;
    const issueKey = JSON.stringify(["person-number", E, ageDates(w, claim).map(ageDateKey), detail]);
    out.push({ claim: (ref ? claim : evidence).slice(0, 300), conflict: `근거: 「${S.pages[ref ? E : P].title}」 ${ref ? evidence : claim} · 숫자 대조: ${detail} 고칠 쪽은 「${S.pages[target].title}」 문서다.`.slice(0, 500), severity: "low", advisory: true, issueKey, by: "num", ...(target === k ? {} : { target, targetOld: (ref ? claim : evidence).slice(0, 300) }) });
  };
  for (const [E, pe] of Object.entries(S.pages)) {
    if (pe.type !== "인물" || !w.entities[E]) continue;
    const rs = personRetirements(w, E, pe), unique = [...new Set(rs.map(x => x.cal + ":" + x.y))], retirement = unique.length === 1 ? rs[0] : null, heights = personHeights(pe);
    for (const [P, p] of Object.entries(S.pages)) {
      if ((P !== k && E !== k) || !w.entities[P]) continue;
      if (P !== E && retirement) for (const r of personRetirements(w, E, p).filter(x => !p.infobox?.some(b => x.line === `${b.label}: ${stripMarks(b.value)}`))) {
        if (r.cal === retirement.cal && r.y !== retirement.y) push(P, E, r.line, retirement.line, `「${pe.title}」의 전역·퇴역 연도가 ${fmtY(retirement)}과 ${fmtY(r)}으로 다르다.`);
      }
      if (!heights.length) continue;
      for (const text of personSentences([p.summary || "", ...(p.sections || []).map(s => s.body)].join("\n"))) {
        const subjects = personSubjects(w, E, text);
        if (subjects.length !== 1 || uncertainPersonClaim(text) || KIN_RE.test(text)) continue;
        /* "신장 60.4미터의 설리번은"처럼 값 바로 뒤의 인물이 주어일 때만 확정한다. */
        const prefix = text.slice(0, subjects[0].at), tail = text.slice(subjects[0].end);
        const m = /(?:신장|전고|키)\s*(\d+(?:\.\d+)?)\s*(m|미터|cm|센티미터)의\s*$/.exec(prefix)
          || /^\s*(?:신장|전고|키)(?:은|는|이|가|:)?\s*(\d+(?:\.\d+)?)\s*(m|미터|cm|센티미터)(?=\s*(?:이다|였다|다[.!?。]|에\s*달|로[서써]?\s|[.!?。]|$))/.exec(tail);
        if (!m) continue;
        const unit = /^(?:m|미터)$/.test(m[2]) ? "m" : "cm", bases = heights.filter(h => h.unit === unit);
        if (!bases.length || new Set(bases.map(h => h.value)).size !== 1 || bases[0].value === +m[1] || (!m[1].includes(".") && Math.round(bases[0].value) === +m[1])) continue;
        push(P, E, text, bases[0].line, `「${pe.title}」의 신장·전고가 ${bases[0].value}${unit}와 ${m[1]}${unit}로 다르다.`);
      }
    }
  }
  return dedupeAdvisories(out);
}
/* v6.85에 더한 검사는 참고로만 남긴다. 같은 인물·시점·결론은 문장 표현과 무관하게 한 건이다. */
const ageDateKey = d => d ? [d.cal, d.y, d.month || null, d.day || null] : null;
function dedupeAdvisories(list) {
  const seen = new Set();
  return list.filter(i => { if (!i.advisory || !i.issueKey) return true; if (seen.has(i.issueKey)) return false; seen.add(i.issueKey); return true; });
}
/* 날짜를 확정할 수 있는 부분만 보존한다. 계절과 초·중·말은 월·일로 추정하지 않는다. */
function ageDates(w, text) {
  return yearHits(text, w).filter(h => !h.approx).map(h => {
    const m = /^\d+\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text.slice(h.at));
    const md = m && ageMD(h, +m[1], +m[2]);
    return { ...h, ...(md || {}) };
  });
}
function ageMD(year, month, day) {
  const leap = year.cal || (year.y % 4 === 0 && (year.y % 100 !== 0 || year.y % 400 === 0));
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? { month, day } : null;
}
function completedAges(birth, date) {
  if (birth.cal !== date.cal) return null;
  const d = yDiff(birth.y, date.y);
  if (d < 0) return null;
  if (birth.month && date.month) { const a = d - (date.month < birth.month || (date.month === birth.month && date.day < birth.day) ? 1 : 0); return [a, a]; }
  return [Math.max(0, d - 1), d];
}
const ageRangeText = a => a[0] === a[1] ? `${a[0]}세` : `${a[0]}~${a[1]}세`;
/* 해당 인물이 주어인 날짜 기록만. 장부의 단순 참가(parts)는 발생 시점의 근거가 아니다. */
function personDatedEvents(w, key) {
  const rows = [], names = refNames(w, key);
  for (const t of w.timeline || []) {
    if (!live(t) || !personSubjects(w, key, stripMarks(t.event || "")).length) continue;
    if (/[~～∼–—-]|\d\s*년?\s*(?:대|경|무렵|전후|이전|이후)/.test(String(t.year))) continue;
    const y = tlYear(w, t.year), md = y && ageMD(y, +t.month, +t.day);
    if (y) rows.push({ ...y, ...(md || {}), text: stripMarks(t.event), src: t.src });
  }
  for (const e of w.events || []) {
    const ds = ageDates(w, e.date || "");
    if (ds.length !== 1) continue;
    /* 본문이 이름으로 가리킨 사건의 날짜는 나이의 시점으로 쓸 수 있다. 발현의 주체 근거로는 쓰지 않는다. */
    if (e.name) rows.push({ ...ds[0], name: e.name, text: "", context: true });
    for (const b of e.beats || []) if (names.includes(norm(stripMarks(b.actor || "")))) rows.push({ ...ds[0], text: `${b.actor}는 ${b.action}`, name: e.name, src: e.src });
  }
  return rows;
}
/* 한 문단의 날짜 후보가 하나일 때만 연결한다. 부분 날짜는 같은 인물의 확정 기록으로만 보충한다. */
function ageDateInParagraph(w, text, records) {
  const dates = ageDates(w, text), years = [...new Set(dates.map(d => d.cal + ":" + d.y))];
  if (years.length > 1 || yearHits(text, w).some(h => h.approx)) return null;
  const mds = [...text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)].map(m => ({ month: +m[1], day: +m[2] }));
  const mdKeys = [...new Set(mds.map(d => d.month + ":" + d.day))]; if (mdKeys.length > 1) return null;
  let date = dates[0] || null;
  if (date && mds.length) { const md = ageMD(date, mds[0].month, mds[0].day); if (!md) return null; date = { ...date, ...md }; }
  const candidates = records.filter(r => (!r.context || (r.name && text.includes(r.name))) && (!date || sameYear(r, date)) && (!mds.length || (r.month === mds[0].month && r.day === mds[0].day)) && (mds.length || (r.name && text.includes(r.name))));
  const precise = [...new Map(candidates.filter(r => r.month).map(r => [r.cal + ":" + r.y + ":" + r.month + ":" + r.day, r])).values()];
  if (precise.length > 1) return null;
  if ((!date || !date.month) && precise.length === 1) date = precise[0];
  return date;
}
const AGE_END = /쇠퇴|감퇴|축소|퇴역|전역|제대|소멸|도달/;
/* 시작 행위를 적은 절만 쓴다. '거체화 형질' 같은 명사 수식은 시작이 아니다. */
const ageOnset = text => !AGE_END.test(text) && !/이후|했던|하였던/.test(text) && !uncertainPersonClaim(text) && /(?:발현|각성)(?:했|하(?:였|여|며|고|자|다|기\s*시작)|되(?:었|어|며|고|다)|됐|을\s*시작|이\s*시작)|거체화(?:했|하(?:였|여|며|고|자|다|기\s*시작)|되(?:었|어|며|고|다)|됐|를\s*시작|\s*징후를?\s*보)|골격\s*팽창(?:과[^.!?]*관측|이\s*(?:시작|관측)|을\s*보)/.test(text);
const ageClauses = text => text.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
const birthDatedClause = text => /\d\s*년[^,，;；.!?]*(?:태어난|태어났|태어나|출생)|\d\s*년(?:\s*\d+\s*월(?:\s*\d+\s*일)?)?\s*생(?=\s|[,，]|$|인|의|으로|이|은|는|가)|출생(?:일|연도|년도)?\s*[:：]?\s*\d/.test(text);
/* 다른 사건의 연도나 관형절을 나이 시점으로 넘기지 않는다. '당시'만 같은 문단의 유일한 날짜를 받는다. */
function ageClaimDate(w, clause, sentence, paragraph, records) {
  if (birthDatedClause(clause) || /\d\s*년[^,，;；.!?]*(?:이후|했던|하였던|이었던|였던)/.test(clause)) return null;
  if (yearHits(clause, w).length) return ageDateInParagraph(w, clause, records);
  const paragraphDate = () => birthDatedClause(paragraph) ? null : ageDateInParagraph(w, paragraph, records);
  if (/당시/.test(clause)) return paragraphDate();
  if (/\d\s*월\s*\d+\s*일/.test(clause)) return ageDateInParagraph(w, clause, records) || paragraphDate();
  if (/\d\s*월\s*\d+\s*일/.test(sentence) && !/\d\s*년[^,，;；.!?]*(?:이후|했던|하였던)/.test(sentence)) return ageDateInParagraph(w, sentence, records) || paragraphDate();
  return null;
}
function datedAgeIssues(w, k) {
  const out = [], seen = new Set();
  const push = (P, E, claim, evidence, message, issueKey) => {
    if (seen.has(issueKey)) return; seen.add(issueKey);
    out.push({ claim: claim.slice(0, 300), conflict: `근거: 「${S.pages[E].title}」 ${evidence} · 나이 규칙: ${message}`.slice(0, 650), severity: "low", advisory: true, issueKey, by: "num", ...(P === k ? {} : { target: P, targetOld: claim.slice(0, 300) }) });
  };
  for (const [E, pe] of Object.entries(S.pages)) {
    if (pe.type !== "인물" || !w.entities[E]) continue;
    const b = numFacts(pe).birth; if (!b) continue;
    const birthDate = ageDates(w, b.line), birth = birthDate.length === 1 ? birthDate[0] : b;
    const records = personDatedEvents(w, E), names = refNames(w, E);
    const head = [pe.summary || "", ...(pe.categories || []), ...(pe.infobox || []).filter(r => /분류|신분|종족|구분|등급|유형|직업|정체|계통|세대|종류|개체/.test(r.label)).map(r => stripMarks(r.value))].join("\n");
    const rules = ageRules(w).filter(R => R.subjects.some(s => head.includes(s)));
    const checkRule = (P, text, a, date, start = false) => {
      if (!a || AGE_END.test(text) || (!start && !ageOnset(text))) return;
      for (const R of rules) if ((R.min !== null && a[1] < R.min) || (R.max !== null && a[0] > R.max)) push(P, E, text, b.line + ` / 핵심 규칙: ${R.text}`, `발현 시 만 ${ageRangeText(a)}로 허용 범위 ${R.min ?? "하한 없음"}~${R.max ?? "상한 없음"}세를 벗어난다.`, JSON.stringify(["onset", E, ageDateKey(date), R.min, R.max, a]));
    };
    if (E === k) for (const r of records) if (r.month && !r.context) checkRule(E, `${fmtY(r)} ${r.month}월 ${r.day}일: ${r.text}`, completedAges(birth, r), r);
    if (E === k) for (const row of pe.infobox || []) {
      if (AGE_END.test(row.label + row.value) || !rules.some(R => R.spanWords.some(s => new RegExp(`^(?:최초\\s*)?${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*(?:시작|개시))?(?:\\s*(?:일|일자|시점|시기|연도|기간))?$`).test(row.label)))) continue;
      const dates = ageDates(w, stripMarks(row.value));
      if (dates[0]?.month && (dates.length === 1 || (dates.length === 2 && /[~～∼–—-]/.test(row.value)))) checkRule(E, `${row.label}: ${stripMarks(row.value)}`, completedAges(birth, dates[0]), dates[0], true);
    }
    for (const [P, p] of Object.entries(S.pages)) {
      if ((P !== k && E !== k) || !w.entities[P]) continue;
      for (const raw of [p.summary || "", ...(p.sections || []).map(s => s.body)]) for (const paragraph of stripMarks(raw).split(/\n\s*\n/)) {
        for (const sentence of personSentences(paragraph)) {
          /* 본인 문서의 생략 주어는 보존하고, 다른 문서에서는 이름이 없는 문장을 즉시 제외한다. */
          if (P !== E && !mentionedPeople(w, sentence).includes(E)) continue;
          for (const sen of ageClauses(sentence)) {
            if (uncertainPersonClaim(sen) || KIN_RE.test(sen)) continue;
            const people = mentionedPeople(w, sen);
            if (P !== E && !people.includes(E)) continue;
            const subjects = personSubjects(w, E, sen);
            const otherPerson = people.some(x => x !== E && w.entities[x].type === "인물" && personSubjects(w, x, sen).length);
            const ageLead = /^(?:(?:만\s*)?\d{1,3}\s*세|\d{3,4}\s*년\s*(?:봄|여름|가을|겨울|초|중|말)?\s*(?:현재|당시)\s*(?:만\s*)?\d{1,3}\s*세)/.test(sen);
            const implicit = P === E && !otherPerson && (subjects.length === 1 || ageLead);
            const date = ageClaimDate(w, sen, sentence, paragraph, records);
            const ages = [...sen.matchAll(/(만\s*)?(\d{1,3})\s*세(?![대기])/g)];
            for (const am of ages) {
              /* 다른 문서에서는 나이 바로 뒤에 붙은 주어 또는 주어 바로 뒤의 나이만 읽는다. */
              const afterAge = am.index + am[0].length;
              const attached = names.some(name => {
                const at = sen.indexOf(name, afterAge); if (at < 0 || !hasName(sen.slice(afterAge), name)) return false;
                return /^(?:의|이던|였던|인|가\s*되던)?\s*(?:제\d+세대\s*)?(?:[가-힣]+\s+){0,3}$/.test(sen.slice(afterAge, at)) && /^(?:(?:은|는|이|가|의)(?=\s|$)|[(（]|$)/.test(sen.slice(at + name.length));
              }) || subjects.some(s => s.end <= am.index && /^\s*$/.test(sen.slice(s.end, am.index)));
              if (!attached && (!implicit || /^(?:의|이던|였던)\s*[가-힣]/.test(sen.slice(afterAge)))) continue;
              const actual = !/^\s*도달\s*(?:후|로|뒤)/.test(sen.slice(afterAge)) && date && completedAges(birth, date), value = +am[2];
              if (actual && (value < actual[0] || value > actual[1])) push(P, E, sen, `${b.line} / ${fmtY(date)}${date.month ? ` ${date.month}월 ${date.day}일` : ""}`, `적힌 ${value}세와 달리 만 ${ageRangeText(actual)}다.`, JSON.stringify(["age", E, ageDateKey(date), value, actual]));
              if (am[1]) checkRule(P, sen, [value, value], date);
            }
            if (date && (subjects.length || implicit)) checkRule(P, sen, completedAges(birth, date), date);
          }
        }
      }
    }
  }
  return out;
}
/* 이 인물 문서(k)의 출생·기간 연도가 나이 규칙과 맞는지. 다른 기준 문서가 함께 적은 연도는 잠긴 것으로 보고 고칠 곳에서 뺀다 */
function ageRuleIssues(w, k) {
  return withNameCheckContext(w, () => ageRuleIssuesInContext(w, k));
}
function ageRuleIssuesInContext(w, k) {
  const p = S.pages[k], out = datedAgeIssues(w, k);
  if (!p || p.type !== "인물") return out;
  const rules = ageRules(w); if (!rules.length) return out;
  const birth = numFacts(p).birth; if (!birth) return out;
  /* 부류 판정은 한 줄 정의, 분류, 인포박스의 분류·신분 같은 줄만 본다. "지휘 전력: … 전략체"처럼 다른 대상을 적은 줄로 일반 인물을 잡지 않게 */
  const head = [p.summary || "", (p.categories || []).join(" "), ...(p.infobox || []).filter(r => /분류|신분|종족|구분|등급|유형|직업|정체|계통|세대|종류|개체/.test(r.label)).map(r => stripMarks(r.value))].join("\n");
  const names = refNames(w, k), title = p.title, eraH = yearHits(w.era).find(h => !h.approx);
  /* 연도 y를 이 항목과 함께 적은, 이 문서보다 기준인 다른 문서들. 숫자 비교가 아니라 "이 연도를 어느 문서가 정했나"를 찾는 용도라 관대하게 본다.
     근거를 놓치면 high가 되어 자동 수정이 기준 문서와 새로 어긋나게 고치지만, 넓게 잡으면 low 표시만 남는다.
     그래서 다른 항목 이름이 함께 나오는 문장도 인정하고(onlyAbout을 쓰지 않음), 기준 문서가 이 항목에 대해 확정한 사실(facts)도 근거로 본다 */
  const hasY = (t, y, cal) => yearHits(t).some(h => !h.approx && h.y === y && h.cal === cal);
  const lockOf = (y, cal) => {
    const found = [];
    for (const [P, q] of Object.entries(S.pages)) {
      if (P === k || !w.entities[P] || !pageIsRef(P, k)) continue;
      const sen = pageTexts(q).flatMap(sentencesOf).find(t => hasY(t, y, cal) && names.some(n => hasName(t, n)) && !KIN_RE.test(t));
      if (sen) found.push({ P, sen, y });
    }
    for (const f of w.entities[k]?.facts || []) {
      const P = f.src;
      if (f.sup || !P || P === k || !S.pages[P] || !w.entities[P] || found.some(x => x.P === P) || !pageIsRef(P, k) || KIN_RE.test(f.t) || !hasY(f.t, y, cal)) continue;
      found.push({ P, sen: f.t, y });
    }
    return found.length ? found : null;
  };
  const range = cs => cs.reduce((a, c) => [Math.max(a[0], c.lo), Math.min(a[1], c.hi)], [-Infinity, Infinity]);
  let cal = "";
  const fy = y => fmtY({ y, cal });
  const yrs = (a, b) => a === b ? fy(a) : b === Infinity ? `${fy(a)} 이후` : a === -Infinity ? `${fy(b)} 이전` : !cal && a > 0 ? `${a}~${b}년` : `${fy(a)}~${fy(b)}`;
  for (const R of rules) {
    if (!R.subjects.some(x => head.includes(x))) continue;   // 이 규칙의 부류(예: 전략체, 마법소녀)인 인물만. 일반 군인의 복무 기간에는 적용하지 않는다
    const span = spanFacts(p, R.spanWords); if (!span || span.cal !== birth.cal) continue;   // 기년법이 다르면 계산하지 않는다
    cal = span.cal;
    const nm = span.label.replace(/\s*기간$/, ""), now = span.now && eraH && eraH.cal === cal;   // "~ 현재"면 작중 기준 시점까지 이어진 것으로 계산한다
    const b = birth.y, s = span.start, e = now ? eraH.y : span.end, endName = now ? `작중 기준 시점(${fmtY(eraH)})의 ${nm}` : `${nm} 종료`;
    const startAge = completedAges(birth, { y: s, cal });
    if (startAge && (R.min === null || startAge[1] >= R.min) && (R.max === null || startAge[0] <= R.max) && (e == null || R.end === null || yDiff(b, e) <= R.end + 1)) continue;
    const C = [];
    if (R.min !== null || R.max !== null) C.push({ v: "start", y: s, lo: R.max !== null ? s - R.max : -Infinity, hi: R.min !== null ? s - R.min : Infinity });
    if (e != null && R.end !== null) C.push({ v: "end", y: e, lo: e - (R.end + 1), hi: Infinity });   // 일찍 끝날 수는 있으니 상한만 둔다. 연도만으로 계산하므로 1년 여유
    if (!C.length) continue;
    const [lo, hi] = range(C);
    if (b >= lo && b <= hi) continue;
    const ruleTxt = `${R.subjects[0]}: ${R.min !== null && R.max !== null ? `${R.min}~${R.max}세` : R.min !== null ? `${R.min}세 이상` : R.max !== null ? `${R.max}세 이하` : ""}${R.min !== null || R.max !== null ? `에 ${nm} 시작` : ""}${R.end !== null ? `${R.min !== null || R.max !== null ? ", " : ""}${R.end}세 기점 종료(종료 시 ${R.end + 1}세 이하)` : ""}`;
    const ages = `출생 ${fy(b)} 기준 ${nm} 시작 ${fy(s)}은 ${yDiff(b, s)}세${e != null ? now ? `, 아직 ${nm} 중인 작중 기준 ${fy(e)}에는 ${yDiff(b, e)}세` : `, 종료 ${fy(e)}은 ${yDiff(b, e)}세` : ""}`;
    const locks = { birth: lockOf(b, cal), start: lockOf(s, cal), end: e != null && !now ? lockOf(e, cal) : null };
    const lockTxt = Object.values(locks).filter(Boolean).flat().map(x => `「${S.pages[x.P].title}」: ${x.sen}`);
    const evidence = [`핵심 규칙: ${(R.text || ruleTxt).slice(0, 100)}`, ...lockTxt.slice(0, 2).map(x => x.slice(0, 90))].join(" / ");   // 고칠 방법이 잘리지 않게 근거는 짧게
    const push = (claim, msg, severity, extra) => out.push({ claim: claim.slice(0, 300), conflict: `근거: ${evidence} · 나이 규칙: ${ages}다. 나이 규칙(${ruleTxt})과 맞지 않는다. ${msg}`.slice(0, 700), severity, by: "num", ...extra });
    if (lo <= hi && !locks.birth) { push(birth.line, `${span.label}을(를) 그대로 두려면 이 문서의 출생을 ${yrs(lo, hi)}${lo === hi ? "으로" : " 사이로"} 고친다.`, "high"); continue; }
    const L = C.filter(c => locks[c.v]); if (locks.birth) L.push({ v: "birth", y: b, lo: b, hi: b });
    const [lo2, hi2] = range(L);
    if (lo2 <= hi2) {   // 잠긴 연도끼리는 맞는다: 이 문서의 잠기지 않은 연도를 고치면 풀린다
      const B = locks.birth ? b : Math.min(hi2, Math.max(lo2, b)), fix = [];
      if (B !== b) fix.push(`출생을 ${fy(B)}으로(기준 문서와 맞는 범위 ${yrs(lo2, hi2)})`);
      for (const c of C) if (!locks[c.v] && (B < c.lo || B > c.hi)) fix.push(c.v === "start" ? `${nm} 시작을 ${yrs(R.min !== null ? B + R.min : -Infinity, R.max !== null ? B + R.max : Infinity)}${R.min !== null && R.max !== null ? " 사이로" : "로"}` : now ? `"현재"를 ${fy(B + R.end + 1)} 이전의 종료 연도로` : `${nm} 종료를 ${fy(B + R.end + 1)} 이전으로`);
      push(B !== b ? birth.line : span.line, `다른 기준 문서가 정한 연도는 두고 이 문서의 ${fix.join(", ")} 고친다.`, "high");
      continue;
    }
    /* 잠긴 연도끼리도 맞지 않는다: 이 문서로는 풀 수 없으니 잠근 문서 중 가장 늦게 쓴(직접 수정하지 않은) 문서로 넘긴다 */
    const cand = L.flatMap(c => locks[c.v]).filter(x => !S.pages[x.P].editedAt).sort((a, z) => (S.pages[z.P].createdAt || 0) - (S.pages[a.P].createdAt || 0));
    const t = cand[0], lockedYears = L.map(c => `${{ birth: "출생", start: nm + " 시작", end: endName }[c.v]} ${fy(c.y)}`).join(", ");
    push(span.line, t ? `기준 문서가 정한 ${lockedYears}끼리 맞지 않아 이 문서만으로는 고칠 수 없다. 고칠 쪽은 「${S.pages[t.P].title}」 문서다.` : `직접 수정한 문서가 정한 ${lockedYears}끼리 맞지 않아 자동으로 고칠 곳을 정할 수 없다.`, "low",
      t ? { target: t.P, targetOld: t.sen.slice(0, 300), targetClaim: `나이 규칙(${ruleTxt})으로는 「${title}」의 ${lockedYears}을(를) 함께 맞출 수 없다(이 서술의 ${fy(t.y)}에 ${yDiff(b, t.y)}세). 이 서술의 연도나 내용을 고친다.` } : {});
  }
  return out;
}
/* 인물 문서 인포박스에 성별이 없으면 채우게 한다 */
function genderIssues(w, k) {
  const p0 = S.pages[k];
  if (!p0 || p0.type !== "인물" || (p0.infobox || []).some(r => /성별/.test(r.label))) return [];
  return [{ claim: (p0.infobox || [])[0] ? `${p0.infobox[0].label}: ${p0.infobox[0].value}` : p0.summary || p0.title, conflict: "근거: 인물 문서 규칙 · 인포박스에 '성별' 줄이 없다. 본문의 서술과 대명사에 맞는 성별(남성, 여성, 설정상 필요하면 그 밖의 표현)을 '성별: …' 줄로 인포박스에 더한다.", severity: "high", by: "num" }];
}
/* 결정론 지적 전부 (숫자 대조 → 나이 규칙 → 인용 대조 → 성별 규칙). 하나가 실패해도 나머지는 쓴다 */
function detIssues(w, k) {
  return withNameCheckContext(w, () => detIssuesInContext(w, k));
}
function detIssuesInContext(w, k) {
  let num = [];
  for (const [name, fn] of [["숫자 대조", numericIssues], ["나이 규칙", ageRuleIssues], ["인용 대조", quoteIssues], ["성별 규칙", genderIssues], ["사건 장부", (w, k) => [...eventIssues(w, k), ...timelineIssues(w, k)]]]) {
    try { num = num.concat(fn(w, k)); } catch (e) { console.warn(`[${name}]`, e); }
  }
  return num.map(i => ({ ...i, by: "num" }));
}
/* 결정론 지적인가. 옛 저장 데이터에는 by 표시가 없으므로 conflict 문구로 알아본다 */
const isNumIssue = i => i.by === "num" || /· (?:숫자 대조|인용 대조|나이 규칙|사건 장부):/.test(i.conflict || "") || /^근거: 인물 문서 규칙 ·/.test(i.conflict || "");
/* 같은 서술에 대한 지적은 하나로 합치고, 다듬을 곳을 앞에 둔다 */
function mergeIssues(list) {
  const all = [], seen = new Map(), keyOfClaim = c => stripMarks(c).replace(/\s+/g, "").slice(0, 40);
  for (const i of list) {
    if (i.advisory) i.severity = "low";
    const ck = i.advisory ? "advisory:" + (i.issueKey || keyOfClaim(i.claim)) : keyOfClaim(i.claim), prev = seen.get(ck);
    if (prev) {
      if (isNumIssue(prev) && !isNumIssue(i)) (prev.ai ||= []).push({ claim: i.claim, conflict: i.conflict, severity: i.severity });   // 결정론 지적을 다시 계산할 때 AI 지적을 되살리려고 따로 남긴다
      if (i.severity === "high") prev.severity = "high"; if (!prev.conflict.includes(i.conflict)) prev.conflict = (prev.conflict + " / " + i.conflict).slice(0, 500); continue;
    }
    seen.set(ck, i); all.push(i);
  }
  all.sort((a, b) => (b.severity === "high") - (a.severity === "high"));
  return all.slice(0, 10);
}
/* 작성 직후 자동으로 고칠 지적: 다듬을 곳 중 고칠 대상이 이 문서인 것만. 다른 문서가 고칠 대상이면 이 문서를 고쳐도 풀리지 않고 다른 서술만 망가진다 */
const autoFixList = (issues, k) => issues.filter(i => !i.advisory && i.severity === "high" && (!i.target || i.target === k));
/* 다른 문서가 고칠 대상인 지적을 그 문서의 autoConflicts에 단다. 이 문서(k)를 다시 검사해 더 이상 나오지 않는 지적은 지운다.
   p.conflicts는 직접 수정한 문서가 낸 것만 남기므로(cleanAiSupersede) 따로 둔다. 바뀐 문서 키들을 돌려준다 */
function routeAutoConflicts(w, k, issues) {
  const changed = new Set(), now = new Map(), byTitle = w.entities[k]?.title || S.pages[k]?.title || "?";
  for (const i of issues) {
    if (i.advisory) continue;
    const T = i.target && i.target !== k && S.pages[i.target]; if (!T) continue;
    const old = i.targetOld || i.claim;
    (now.get(i.target) || now.set(i.target, new Set()).get(i.target)).add(old);
    T.autoConflicts ||= [];
    if (T.autoConflicts.some(c => c.by === k && c.old === old) || T.autoDismissed?.some(d => d.by === k && d.old === old) || T.autoConflicts.length >= 20) continue;   // 사용자가 지운 표시는 다시 달지 않는다
    T.autoConflicts.push({ by: k, byTitle, old, claim: String(i.targetClaim || i.claim).slice(0, 400), at: Date.now() });
    changed.add(i.target);
  }
  for (const [x, T] of Object.entries(S.pages)) {
    if (x === k) continue;
    const kept = c => c.by !== k || now.get(x)?.has(c.old);
    if (T.autoConflicts?.some(c => !kept(c))) { T.autoConflicts = T.autoConflicts.filter(kept); changed.add(x); }
    if (T.autoDismissed?.some(c => !kept(c))) { T.autoDismissed = T.autoDismissed.filter(kept); changed.add(x); }   // 지적이 사라졌으면 지운 기록도 지운다. 나중에 다시 생기면 다시 보여 준다
  }
  return [...changed];
}
/* 옛 버전 숫자 대조가 낸 결과를 지금 로직으로 바꿔 끼운다. AI 지적은 그대로 둔다. 갱신했으면 autoConflicts가 바뀐 문서 키들을, 아니면 null */
function refreshNumeric(w, k) {
  const p = S.pages[k]; if (!p?.check || p.check.numV === numStamp(w)) return null;
  const fresh = detIssues(w, k);
  const old = p.check.issues || [], ai = [...old.filter(i => !isNumIssue(i)), ...old.filter(isNumIssue).flatMap(i => i.ai || [])];   // 결정론 지적에 합쳐졌던 AI 지적도 남긴다
  p.check = { ...p.check, issues: mergeIssues([...fresh, ...ai]), numV: numStamp(w) };
  return routeAutoConflicts(w, k, fresh);
}
/* 두 검사(설정 대조, 문서 읽기)를 동시에 돌려 결과를 합친다. 하나가 실패해도 다른 하나의 결과는 쓴다 */
async function runChecks(w, k, opts, label) {
  const p = S.pages[k];
  if (typeof AIRecovery !== "undefined" && AIJobs.enabled("gemini")) opts = { ...opts, recoveryTarget: { wid: w.id, key: k }, recoveryMeta: { group: opts.recoveryMeta?.group || S.gen?.recovery?.group || crypto.randomUUID() } };
  const [ar, ...rs] = await Promise.allSettled([
    ensureAgeRules(w, opts),   // 핵심 규칙이 바뀌었을 때만 AI를 부른다. 실패하면 나이 검사만 건너뛴다
    callJson("check", checkPrompt(w, k), { modelTier: "check", ...opts }, { title: label }),
    callJson("read", readPrompt(w, k), { modelTier: "check", ...opts }, { title: label })]);
  if ([ar, ...rs].some(r => r.status === "rejected" && r.reason?.code === "cancelled")) throw { code: "cancelled" };
  const num = detIssues(w, k);
  if (rs.every(r => r.status === "rejected") && !num.length) throw rs[0].reason;   // AI 검사가 모두 실패해도 숫자 대조 결과는 쓴다
  return mergeIssues([...num, ...rs.filter(r => r.status === "fulfilled").flatMap(r => parseIssues(r.value))]);
}
/* 다른 문서에 단 자동 대조 표시를 저장한다 */
function saveRouted(w, keys) { for (const x of keys || []) if (S.pages[x]) Store.savePage(w.id, S.pages[x]).catch(() => {}); }
/* 문서를 열 때: 옛 버전 숫자 대조 결과면 결정론 지적만 다시 계산해 저장한다 (AI 호출 없음) */
function refreshOnOpen(k) {
  const w = S.world, p = w && S.pages[k];
  if (!p?.check || p.check.numV === numStamp(w) || S.checking === k || (S.gen && S.gen.key === k) || isHeld(k)) return;
  let routed = null;
  try { routed = refreshNumeric(w, k); } catch (e) { console.warn("[숫자 대조 갱신]", e); p.check.numV = numStamp(w); }
  Store.savePage(w.id, p).catch(() => {}); saveRouted(w, routed);
}
function parseIssues(r) {
  return (Array.isArray(r?.issues) ? r.issues : []).filter(i => i && i.claim && (i.evidence || i.conflict)).slice(0, 8)   // 근거 없는 지적은 버린다
    .map(i => ({ claim: String(i.claim).replace(/^\s*#+\s*/, "").replace(/^\[(인포박스|본문)\]\s*/, "").slice(0, 300), conflict: [i.evidence ? `근거: ${stripMarks(i.evidence)}` : "", stripMarks(i.conflict || "")].filter(Boolean).join(" · ").slice(0, 400), severity: i.severity === "high" ? "high" : "low" }));
}
/* 작성 직후, 문서를 보여 주기 전에 설정 검사를 돌리고 '다듬을 곳'은 자동으로 고친다.
   실패하거나 사용자가 건너뛰면 작성된 문서를 그대로 쓴다. 고쳤으면 { page: 고친 문서, fixed, keep: 남은 지적 } */
async function preCheck(w, k, page, g = S.gen, show = null, label = " · 작성 직후") {
  const res = { page, fixed: 0, keep: null, done: false };
  show ||= () => { if (S.view.name === "article" && S.view.key === k) renderMain(); else renderSide(); };
  try {
    g.phase = "check"; show();
    const issues = await runChecks(w, k, { signal: g.ctl.signal }, page.title + label), high = autoFixList(issues, k);
    page.check = { at: Date.now(), issues, auto: true, numV: numStamp(w) }; res.done = true;
    if (S.world === w && S.pages[k] === page) saveRouted(w, routeAutoConflicts(w, k, issues));
    if (!high.length || S.world !== w || S.pages[k] !== page) return res;
    g.phase = "fix"; g.nFix = high.length; show();
    const f = pageToSource(w, page);
    const fr = await callJson("fix", fixBatchPrompt(w, page, f, high), { modelTier: "default", ...PAGE_MODEL, signal: g.ctl.signal }, { title: page.title + ` · 자동 ${high.length}곳` });
    if (S.world !== w || S.pages[k] !== page) return res;
    const nf = { ...f }, fixedMemo = new Set(); let applied = 0;
    for (const ed of (Array.isArray(fr?.edits) ? fr.edits : []).slice(0, 16)) {
      const fld = ["summary", "cats", "infobox", "body"].includes(ed?.field) ? ed.field : null;
      let old = String(ed?.old || ""); const nw = String(ed?.new ?? "");
      if (!fld || !old.trim() || old === nw) continue;
      let at = nf[fld].indexOf(old); if (at < 0) { old = old.trim(); at = nf[fld].indexOf(old); } if (at < 0) continue;
      nf[fld] = nf[fld].slice(0, at) + nw + nf[fld].slice(at + old.length); applied++;
      fixedMemo.add(Math.max(1, Math.min(high.length, parseInt(ed.memo, 10) || 1)));
    }
    if (!applied) return res;
    const out = sourceToOut(nf); if (!out.sections.some(x => x.body.trim())) return res;
    const backup = JSON.stringify({ entities: w.entities, timeline: w.timeline, navboxes: w.navboxes || {}, relations: w.relations || [], events: w.events || [], glossary: w.glossary || [] });
    let np;
    try {
      for (const o of Object.values(w.entities)) o.mentions = o.mentions.filter(m => m.from !== k);   // 링크와 언급은 고친 본문 기준으로 다시 계산
      for (const [id, nb] of Object.entries(w.navboxes || {})) if (nb.src === k) delete w.navboxes[id];
      np = integrate(w, k, out);
    } catch { restoreRewrite(w, backup); return res; }
    for (const x of PAGE_KEEP) if (page[x] !== undefined) np[x] = page[x];
    const keep = [...high.filter((_, i) => !fixedMemo.has(i + 1)), ...issues.filter(i => !high.includes(i))];
    np.check = { at: Date.now(), issues: keep, auto: true, numV: numStamp(w) }; np.autoFixed = { at: Date.now(), n: fixedMemo.size };
    cleanupOrphans(w, k);
    S.pages[k] = np; Object.assign(res, { page: np, fixed: fixedMemo.size, keep });
  } catch (err) { /* 건너뛰었거나 실패: 작성된 문서를 그대로 보여 주며 자동 재검사를 예약하지 않는다 */ }
  return res;
}
/* 작성 직후의 preCheck 외에는 사용자가 설정 검사 버튼을 눌렀을 때만 실행한다. */
async function checkPage(k) {
  if (!S.sample) { toast(ERR.no_sample); return; }
  if (S.checking) return;
  const w = S.world, p = S.pages[k]; if (!w || !p) return;
  if (isHeld(k)) { toast("이 문서에 반영한 장을 설정과 맞춰 보는 중입니다."); return; }
  if (typeof DocumentPipeline !== "undefined" && DocumentPipeline.enabled()) return DocumentPipeline.check(k);
  S.checking = k; S.checkT0 = performance.now(); renderMain();
  try {
    const group = typeof AIRecovery !== "undefined" && AIJobs.enabled("gemini") ? crypto.randomUUID() : "", issues = await runChecks(w, k, { recoveryMeta: { group } }, p.title);
    if (S.pages[k] === p) {   // 검사하는 동안 문서가 바뀌었으면(장 반영 등) 옛 문서를 저장하지 않는다
      p.check = { at: Date.now(), issues, auto: false, numV: numStamp(w) };
      saveRouted(w, routeAutoConflicts(w, k, issues));
      try { await Store.savePage(w.id, p); if (typeof AIRecovery !== "undefined") AIRecovery.handled(group); } catch (err) { toast("검사 결과를 저장하지 못했습니다. " + errMsg(err)); }
    }
  } catch (err) { toast(errMsg(err)); }
  S.checking = null;
  const here = S.view.name === "article" && S.view.key === k;
  if (here) renderMain();
}
