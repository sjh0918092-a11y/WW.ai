"use strict";
/* 분위기와 문서 생성·검사 프롬프트 */
/* summary는 항목의 정체성을 설명하며, 목표·사건 요약과 구분한다. 모든 생성 경로에서 공유한다. */
const ENTITY_DEFINITION_RULE = `## 항목의 한 줄 정의
summary, newEntities[].summary, protagonist.summary, summaryPatch처럼 항목의 정의를 쓰는 필드에는 그 대상이 누구인지 또는 무엇인지 설명하는 한 문장을 쓴다. 인물은 소속·신분·직업·역할 등 문맥에서 확인되는 정체성을 중심으로, 다른 유형은 종류·기능·대상을 중심으로 쓴다.
- 목표, 바라는 삶, 앞으로 할 행동, 한 사건의 경과나 근황만으로 정의를 대신하지 않는다. 예를 들어 '임무를 마치고 대학에 가는 것'은 목표이며 인물의 정의가 아니다. 목표와 사건은 본문·facts·want 등 해당 필드에 적는다. 장의 줄거리인 summary에는 이 규칙을 적용하지 않는다.
- 기존 설명이 목표나 근황만 담고 있다면 그 사실은 유지하고, 확정 사실과 본문에 근거해 누구인지/무엇인지 드러나는 정의 문장으로 보완한다. 직업·소속·능력을 지어내서 채우지 않는다. 사실 추출 작업에서 정체성을 알 수 없으면 정의는 빈 문자열로 둔다.
- 정의에 링크나 작성 지시를 넣지 않는다.`;
/* ---------- 분위기 ---------- */
const TONE_SPEC = `분위기 지침(tone)은 이 세계관이 어떤 장르와 문화권의 창작물처럼 읽혀야 하는지를 위키 집필자에게 알려 주는 것이다.
- label: 장르와 문화권을 한 구절로 (예: "일본 라이트노벨풍 학원 이능 배틀물", "영미권 정통 하이 판타지", "한국 웹소설풍 회귀 무협", "미국 하드 SF", "홍콩 느와르", "근미래 한국 사이버펑크").
- guide: 6~8개의 구체적인 지침. 각각 한 문장이며 이 세계관에 맞춰 쓴다. 다음을 모두 다룬다.
  - 인명·지명·조직명·기술명의 작명 방식(어느 언어권의 이름인지, 원어나 한자 병기, 칭호와 별칭을 붙이는 방식)
  - 어휘의 결(한자어, 고어, 외래어, 전문 용어의 비율과 종류)
  - 문장의 질감(장중함, 경쾌함, 건조함, 냉소 등)
  - 이 장르의 독자가 가장 보고 싶어 하는 것(예: 메카물이라면 기체의 강함과 무장과 명승부와 에이스 파일럿, 무협이라면 고수의 무공과 결투, 하이 판타지라면 전설과 예언과 영웅의 여정)
  - 이 장르의 팬 위키가 즐겨 기록하는 디테일(예: 능력의 이름과 등급, 혈통과 문장(紋章)과 고대어 어원, 형식 번호와 제원, 문파와 초식)
  - 작중 발언과 인용의 말투
  - 이 장르에서 오글거림을 부르는 표현(칭호 남발, 서술자의 감탄, 과장된 형용사)과, 그 대신 장면의 무게를 전할 방법
  - 수치 표현을 피한다면 크기와 정도를 대신 보여 줄 방법(지형 변화, 희생 규모, 비교 대상, 사람들의 반응)을 guide에 함께 쓴다. "제원을 표로 축적"과 "수치화 금지"처럼 서로 부딪히는 지침을 두지 않는다.
  - 주된 결과 대비되는 디테일을 어디서 쓸지 정한다. 장중한 세계라면 일상적·관료적 디테일(성문 옆 분실물 창구), 가벼운 세계라면 현실적인 무게(동네 꽃집의 임대료)를 문서의 결을 해치지 않는 곁가지 한두 군데로 한정한다.
  - 이 분위기에 어울리지 않아 피할 요소
  위키는 한국어로 쓴다는 점을 전제로 한다.`;
function normTone(t, label) {
  if (!t || typeof t !== "object") return null;
  const guide = (Array.isArray(t.guide) ? t.guide : []).map(x => stripMarks(asText(x)).slice(0, 220)).filter(Boolean).slice(0, 10);
  const lb = norm(label || t.label || "").slice(0, 60);
  return lb && guide.length ? { label: lb, guide } : null;
}
function toneBlock(w) {
  if (!w.tone) return "";
  return `## 세계관의 분위기: ${w.tone.label}
문서의 형식(백과사전 구조, 3인칭, '~이다'체)은 그대로 두고, 작명, 어휘, 문장의 결, 어떤 디테일을 다룰지, 인용의 말투를 아래 지침에 맞춘다. 이미 확정된 고유명사는 바꾸지 않는다.
${w.tone.guide.map(g => "- " + g).join("\n")}

`;
}
function tonePrompt(w, label) {
  const titles = Object.values(w.entities).slice(0, 40).map(o => o.title + (o.summary ? ": " + o.summary.slice(0, 50) : "")).join("\n") || "(없음)";
  return `다음 가상 세계관 위키의 분위기 지침을 만든다.

원안:
"""
${w.seed}
"""
작중 기준 시점: ${w.era}
${w.guide ? `작가 지침:\n${w.guide}\n` : ""}핵심 규칙:
${(w.rules || []).map(r => "- " + r).join("\n") || "(없음)"}
지금까지의 항목:
${titles}
${label ? `\n사용자가 지정한 분위기: "${label}". label은 이것을 글자 그대로 쓰고, guide를 이 분위기에 맞게 만든다.\n` : ""}
${TONE_SPEC}

JSON 객체 하나만 출력: {"label":"...","guide":["..."]}`;
}
async function detectTone(w, label) {
  const t = await callJson("tone", tonePrompt(w, label), { modelTier: "quick" }, { title: w.title });
  return normTone(t, label);
}
function castText(cast) { return cast.map(c => `- ${c.name}${c.desc ? ` — 특징: ${c.desc}` : ""}${c.rel ? ` — 주인공과의 관계: ${c.rel}` : ""}`).join("\n"); }
function biblePrompt(seed, first, guide, story, user = {}) {
  return `너는 가상 세계관 위키의 편집장이다. 사용자가 준 원안을 바탕으로 이 세계관 위키의 '설정 노트' 초안을 만든다.

원안:
"""
${seed}
"""
${guide ? `
작가 지침 (사용자가 세계관 전체에 걸쳐 지키라고 정한 방향):
"""
${guide}
"""
이 지침을 세계관 이름, 핵심 규칙, 연표, 분위기 지침에 반영한다. 원안과 어긋나면 원안을 따른다.
` : ""}
규칙:
- 원안의 내용은 모두 그대로 유지하고, 빈 부분만 그럴듯하게 채운다.
- 원안의 "확장 요소:", "추가 요소:", "넣고 싶은 것:" 목록은 사용자가 위키에서 다루고 싶은 주제이지 작중 항목의 이름이 아니다. 그 단어를 그대로 mainTitle로 쓰지 않는다.
- 원안에 "세계관 이름:"이 적혀 있으면 title은 그 이름을 글자 그대로 쓴다.
- 작중 기준 시점(era)은 원안의 시대감에 맞게 하나 정한다(예: "1987년", "2049년 가을"). 위키 문서들은 이 시점에 작성된 것으로 취급한다.
- 원안의 비틀기는 이 세계의 볼거리를 실제로 만들어 내야 한다. 비틀기가 장르의 쾌감(메카물이면 기체가 싸우고, 무협이면 고수가 겨루고, 판타지면 마법이 판을 뒤집는다)을 낳는 무대를 갖추고, 그 쾌감이 역사의 결정적 순간에 실제로 쓰이게 한다. 동시에 새 요소는 기존 질서(강대국의 경쟁, 경제, 종교, 관료제의 관성 등)와 부딪히고 섞이며, 저항과 지역 차가 있다. 비틀기가 깊게 바꾼 영역은 2~4개로 정한다. 원안이 실제 역사를 바탕으로 한다면, 비틀기 때문에 실제와 결과가 달라진 사건을 연표에 적어도 하나 둔다. 실제 역사를 그대로 따라가며 이름만 바꾸지 않는다.
- 핵심 규칙(rules)은 이 세계가 현실과 다른 점, 사회 구조, 기술 수준, 금기 등 모든 문서가 지켜야 할 대전제 5~8개. 이 중 적어도 하나는 이 세계의 장르적 볼거리를 떠받치는 규칙(예: 기체의 등급 체계, 무공의 경지, 마법의 대가)으로 쓴다. 각각 한 문장. 수량 한도는 '최대 N', 'N 이하', 'N 미만'처럼 경계를 포함하는지 분명히 쓴다(예: '세 명 이상 둘 수 없다' 대신 '최대 두 명까지 둔다'). 무난한 일반론 대신 구체적으로 쓰되, 개별 은어나 풍습처럼 문서 하나에서 다룰 만한 세부 소재는 규칙에 넣지 않는다. 그런 것은 나중에 해당 문서가 생길 때 정해진다.
- 핵심 규칙이 모든 인물에게 같은 경로나 결말을 강제한다면, 그 규칙을 피하거나 거부한 경우가 이 세계에서 어떻게 되는지도 함께 정한다.
- 장르적 볼거리를 떠받치는 규칙이 힘·능력·병기처럼 강약이 있는 것이라면 크기를 비교할 척도(등급, 범위, 대가, 효과가 미치는 반경 등)를 하나 정한다. "현실을 개변한다" 같은 한계가 없는 힘으로 두지 않는다. 강약이 없는 요소(요리, 계절, 관계 등)라면 척도를 만들지 않는다.
- 연표(timeline)는 기준 시점까지의 주요 사건 7~12개, 날짜 오름차순. year는 이 세계가 쓰는 표기 그대로 연도만(예: "1947", "기원전 202", "건안 13", "제국력 312"). 연표의 모든 사건은 월과 일까지 정해 month와 day에 숫자로 쓴다. 계절, 초·중·말, '무렵' 같은 모호한 표현은 쓰지 않는다. calendars의 기년법 중 달과 날이 없는 것은 undatedCalendars에도 적고, 그 기년법의 사건은 month와 day를 빈 문자열로 둔다.
- 이 세계의 문서가 서기 말고 다른 기년법이나 연호(예: 건안, 메이지, 제국력, 성력)로 연도를 적는다면 그 이름을 calendars에 모두 적는다. 서기만 쓰면 빈 배열. 거창한 사건만 넣지 말고 추문, 사고, 우스꽝스러운 사건도 섞는다. 사건마다 고유명사를 넣는다.
- 먼저 원안의 장르와 문화권을 판별해 분위기 지침(tone)을 정하고, 세계관 이름, 핵심 규칙, 연표의 고유명사와 어휘도 그 분위기에 맞춘다.${guide ? ` 아래 작가 지침에 장르나 분위기가 적혀 있으면 tone에 그대로 반영한다.` : ""}
${TONE_SPEC}
${story ? "" : `- 무대(stage)를 정한다. units는 이야기가 벌어지는 주요 단위 3~5개이며 원안의 규모에 맞춘다. 대륙 판타지는 국가·세력, 학원물은 학교·동아리·반, 마을 이야기는 가게·이웃·가문, 생태 세계는 군락·서식지가 될 수 있다. kind는 ${TYPES.join("|")} 중 하나다.
- 원안이 정한 단위가 있으면 그대로 옮기고 없으면 장르와 규모에 맞게 정한다. 대체역사라면 실재 국가·기관을 쓴다. rules, timeline, tone에 이름 없는 "제국", "강대국", "왕국", "학교", "마을"이 나오면 units의 고유명사로 부른다.
- now는 작중 기준 시점에 진행 중인 일을 누가 누구와 어디서 무엇을 두고 그러고 있는지만 한두 문장으로 쓴다. 이 일에 이름이 있으면(예: ○○ 대치, ○○ 축제) 그 이름을 문장에 쓴다. 거리, 인원, 수치, 명령, 기동이나 장면 묘사, 중재·조치·결말의 세부는 넣지 않는다. 그 세부는 이 일을 다루는 문서가 정한다. 분쟁일 필요는 없다(선거, 축제 준비, 개업, 철새의 이동, 새 학기 등). 원안이나 제목이 진행 중인 사건(예: "○○전쟁")을 약속했다면 그것을 쓴다. 연표의 마지막 사건이 now로 이어지게 한다. 시간이 흐르지 않는 사전형 설정집 등은 빈 문자열로 둔다.
- parties는 지금 진행 중인 일의 당사자 2~4개다. 각각 name(고유명사), kind(${TYPES.join("|")} 중 하나), want(지금 진행 중인 일에서 원하는 목표 한 줄. 수단, 수치, 명령, 인물의 나이나 퇴역 시점 같은 세부는 넣지 않는다)를 정한다. 당사자는 이름으로 정하고 now의 문장에서도 그 이름을 쓴다. now가 비면 parties는 빈 배열이다.
- 이 필드를 채우려고 원안에 없는 갈등이나 큰 규모를 만들지 않는다. 작은 공동체 이야기는 그 규모를 유지한다.
`}
${story ? (first ? `- mainTitle은 사용자가 지정한 주인공 "${first}"를 글자 그대로 쓴다. 이 인물이 이야기의 주인공이고 위키의 첫 문서가 된다. 핵심 규칙이나 연표 중 하나 이상이 이 인물과 연결되게 한다.` : "- mainTitle은 이 원안에서 가장 흥미로운 이야기를 끌고 갈 주인공 인물의 이름이다. 코드명이나 별명이 아니라 본명 풀 네임으로 쓴다. 이 인물이 위키의 첫 문서가 된다. 핵심 규칙이나 연표 중 하나 이상이 이 인물과 연결되게 한다.")
  : first ? `- mainTitle은 사용자가 지정한 "${first}"를 글자 그대로 쓴다. 이 항목이 위키의 첫 문서가 되므로, 핵심 규칙이나 연표 중 하나 이상이 이 항목과 연결되게 한다.` : "- mainTitle은 이 세계를 가장 잘 대표하는 항목 이름(제도·사건·국가·도시 등). 위키의 첫 문서가 된다. 도감, 목록, 총람, 분류 체계, 연대기처럼 다른 항목을 모아 놓은 메타 항목은 고르지 않는다. stage.units나 stage.now와 직접 이어지는 항목을 우선한다."}
- 이름 규칙: ${first ? "사용자가 지정한 mainTitle은 글자 그대로 둔다. " : ""}mainTitle로 인물을 고른다면 본명 풀 네임을 쓰고, 코드명이나 칭호는 쓰지 않는다. 이후 문서들의 링크와 새 항목 제목도 같은 규칙을 따른다: ${linkNameRule()}

- historical: 원안이 실재한 국가, 인물, 사건이 있는 현실 역사에서 갈라진 대체역사면 true, 실제 역사와 무관한 가상의 세계면 false.
${story ? `
## 이야기 뼈대
- 스토리 모드에서는 원안에 없는 거창한 세계의 비틀기나 역사 변경을 의무로 추가하지 않는다. 현실적인 사건과 작은 공동체의 이야기도 그 규모를 유지한다.
이 위키는 주인공 한 명을 중심으로 ${user.total || STORY_DEF}장짜리 이야기가 진행되는 스토리 모드다. 독자가 위키를 탐험한 내용이 다음 장의 줄거리에 엮인다. 설정 노트와 함께 다음을 정한다.
${user.desc ? `- 사용자가 정한 주인공의 특징(그대로 지키고, 바라는 것과 상처도 여기서 끌어낸다): ${user.desc}\n` : ""}${user.cast?.length ? `- 사용자가 정한 등장인물(이름은 글자 그대로 쓰고, 특징과 주인공과의 관계를 지킨다. 뼈대와 1장 줄거리에 자연스럽게 등장시킨다):\n${castText(user.cast)}\n` : ""}${ENTITY_DEFINITION_RULE}
- protagonist: 주인공의 한 문장 정의(summary), 주인공이 바라는 것(want), 필요할 때만 결핍이나 상처(wound, 없으면 빈 문자열). 모든 인물에게 사별·죄책감 같은 과거 트라우마를 붙이지 않는다.
- storyPromise: 원안과 지침이 약속한 이야기의 경험(focus), 처음부터 이어갈 중심 내용(central: {kind, subject}). 목표·관계·약속·갈등·행동의 여파·진행 중인 일을 장르에 맞게 고르고 질문형을 강요하지 않는다. 실제 의문일 때만 mystery로 분류한다. 예정된 답이나 결말은 정하지 않는다.
- spine: ${user.total || STORY_DEF}장 각각의 의도. 발단·전개·위기·절정·결말 다섯 구간을 장에 나눠 배치했다(${beatsFor(user.total || STORY_DEF).map((b, i) => `${i + 1}장 ${b}`).join(", ")}). 사건 규모나 배후를 단계마다 키울 필요는 없다. 기존 의문을 풀거나 관계와 선택의 대가를 다루는 장도 가능하다. want와 기존 설정을 지키되 wound를 매 장 건드릴 의무는 없다. 각 의도는 잠정 계획이며 이후 확정 사건과 선택에 맞춰 바꿀 수 있다. 결말 단계는 방향만 정하고 구체적인 결과를 확정하지 않는다. 독자의 탐험이 결말을 바꿀 여지를 남기기 위해서다. 이 뼈대는 독자에게 공개하지 않는다.
- chapter1: 1장(발단)의 작중 사건명(title, "1장"이나 "제1장" 같은 장 번호는 넣지 않는다), 1장의 작중 시점(era), 공개 줄거리 3~5문장(summary), 주인공의 일상을 깨는 발단 사건 한 문장(incident), 1장이 끝날 때 주인공이 할 수 있는 다음 행동 후보 3개(nextChoices, 서로 방향이 다르게).
- secrets: 원안에 실제로 필요할 때만 감춰 둔 답을 0~3개 정한다. 필요 없으면 빈 배열이다. 장르 이름만 보고 거대 음모·숨은 혈통·상층 배후를 만들지 않는다. 처음부터 모든 의심이 하나의 만능 배후로 수렴하도록 정하지 않는다. 각각 무엇이 사실인지(truth), 그 진실이 드러나기 전까지 세상에 알려진 겉모습(cover), 드러나는 장(reveal, 2~${user.total || STORY_DEF})을 정한다. 줄거리가 기억 상실, 정체 숨김, 누명, 음모, 숨은 배후처럼 무언가를 알아 가는 이야기라면 기존 단서로 뒷받침할 수 있는 잠정 답을 넣을 수 있다. 주변 인물의 과거나 세계의 배경처럼 이야기의 반전이 아닌 것은 넣지 않는다. reveal은 공개 검토 시점이며 증거와 선택에 따라 달라질 수 있다. 1장 줄거리(chapter1)와 모든 공개 문장은 cover만으로 쓴다.
- era(세계관 기준 시점)는 chapter1.era와 같게 한다. 연표는 1장 시점까지만 만든다.

JSON 객체 하나만 출력:
{"title":"세계관 이름(2~20자)","tagline":"한 줄 소개","era":"작중 기준 시점","historical":"불리언","rules":["..."],"calendars":["서기 말고 이 세계가 쓰는 기년법·연호 이름"],"undatedCalendars":["calendars 중 달과 날이 없는 기년법(없으면 빈 배열)"],"timeline":[{"year":"1947","month":3,"day":14,"event":"..."}],"mainTitle":"주인공 이름","tone":{"label":"...","guide":["..."]},"storyPromise":{"focus":"원안이 약속한 이야기 경험","central":{"kind":"goal/relationship/promise/conflict/consequence/ongoing/mystery","subject":"장르에 맞게 이어갈 중심 내용"}},"protagonist":{"summary":"한 문장 정의","want":"주인공이 바라는 것","wound":"주인공의 결핍이나 상처"},"spine":[${beatsFor(user.total || STORY_DEF).map((b, i) => `{"n":${i + 1},"beat":"${b}","intent":"${i === (user.total || STORY_DEF) - 1 ? "결말의 방향만" : "..."}"}`).join(",")}],"secrets":[{"truth":"감춰진 진실","cover":"드러나기 전 알려진 겉모습","reveal":3}],"chapter1":{"title":"작중 사건명","era":"1장 작중 시점","summary":"공개 줄거리 3~5문장","incident":"발단 사건 한 문장","nextChoices":["...","...","..."]}}` : `
JSON 객체 하나만 출력:
{"title":"세계관 이름(2~20자)","tagline":"한 줄 소개","era":"작중 기준 시점","historical":"불리언","rules":["..."],"calendars":["서기 말고 이 세계가 쓰는 기년법·연호 이름"],"undatedCalendars":["calendars 중 달과 날이 없는 기년법(없으면 빈 배열)"],"timeline":[{"year":"1947","month":3,"day":14,"event":"..."}],"mainTitle":"...","stage":{"units":[{"name":"고유명사","kind":"TYPES 중 하나","desc":"한 줄 성격","rel":"다른 단위와의 관계 한 줄"}],"now":"작중 기준 시점에 진행 중인 일 한두 문장","parties":[{"name":"당사자 고유명사","kind":"TYPES 중 하나","want":"지금 진행 중인 일에서 원하는 것 한 줄"}]},"tone":{"label":"...","guide":["..."]}}`}`;
}
/* 세계에서 아직 비어 있는 영역: 항목 유형 분포와 연표의 긴 공백 */
/* 몇 안 되는 인물·개체를 수로만 말하고("A국은 ○○ 2기를 운용 중이다") 누구인지 밝히지 않는 버릇을 막는다 */
const FEW_NAMED_RULE = "몇 안 되는 인물이나 개체를 수로만 말하지 않는다(나쁜 예: 'A국은 ○○ 2기를 운용 중이다', '○○ 세 명이 이 부대에 있다'). 독자는 그것이 누구인지 궁금해한다. 그 수가 다섯 이하면 처음 말할 때 하나하나 이름을 밝히고 [[링크]]한다(좋은 예: 'A국은 ○○ 2기([[이름A]], [[이름B]])를 운용 중이다'). 이미 있는 항목이면 목록의 제목을 그대로 쓰고, 없으면 이름을 지어 링크한다. 수십 이상의 큰 수만 수로 써도 된다.";
function linkNameRule() {
  return `${FEW_NAMED_RULE} 이미 있는 인물을 성이나 이름, 별명, 코드명만으로 부를 때도 링크는 [[그 인물의 전체 제목|부른 이름]]으로 건다(예: [[마커스 벡|벡]]). ${PERSON_TITLE_RULE}`;
}
/* 공백의 판단은 모델이 한다. 유형별 수, 단위의 문서·언급 수와 연표의 날짜·연도 차이만 전달한다. */
function worldGapSignals(w) {
  const entities = Object.values(w.entities || {}), cnt = {};
  for (const o of entities) if (o.type) cnt[o.type] = (cnt[o.type] || 0) + 1;
  const stage = normStage(w.stage);
  const out = [`항목 유형별 개수: ${[...new Set([...TYPES, ...Object.keys(cnt)])].map(t => `${t} ${cnt[t] || 0}개`).join(", ")}`];
  for (const u of stage.units) {
    const o = w.entities?.[keyOf(u.name)] || entities.find(o => o.title === u.name);
    const sources = new Set((o?.mentions || []).filter(m => live(m) && m.from !== keyOf(u.name)).map(m => m.from));
    if (!o?.page && sources.size <= 1) out.push(`주요 단위 「${u.name}」: 문서 0개, 다른 문서의 언급 ${sources.size}개`);
  }
  const timeline = timelineOrder((w.timeline || []).filter(live), w), last = timeline[timeline.length - 1];
  out.push(`연표의 마지막 사건 날짜: ${last ? tlWhen(last) : "(없음)"}; 작중 기준 시점: ${w.era || "(없음)"}`);
  const era = tlYear(w, w.era);
  const past = era ? timeline.map(t => ({ t, h: tlYear(w, t.year) })).filter(x => x.h && x.h.cal === era.cal && x.h.y <= era.y).sort((a, b) => a.h.y - b.h.y) : [];
  const bounds = [...past.map(x => ({ year: x.h.y, date: tlWhen(x.t) })), ...(era ? [{ year: era.y, date: w.era }] : [])];
  let gap = null;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i], b = bounds[i + 1], d = b.year - a.year;
    if (!gap || d > gap.d) gap = { a: a.date, b: b.date, d };
  }
  out.push(gap ? `기준 시점 이전 가장 긴 사건 간격(같은 기년법, 기준 시점까지, 연도 기준): ${gap.a} → ${gap.b} (연도 차이 ${gap.d}년)` : "기준 시점 이전 가장 긴 사건 간격: 계산할 날짜 자료 없음");
  return out;
}
function worldGaps(w) {
  const out = worldGapSignals(w);
  return out.length ? `- 참고로 이 세계에서 아직 비어 있는 곳은 다음과 같다. 이 항목과 이어질 수 있다면 그쪽으로 넓힌다. 원안의 장르와 규모를 지키며, 빈 시기의 사건(축제 준비, 개업, 이동철 등)도 그 규모에 맞게 다룬다. 공백을 채우려고 전쟁이나 거대 음모를 만들지 않는다. 새로 확정한 사건 중 연표에 적을 만한 것만 timeline에 넣는다.\n${out.map(x => "  - " + x).join("\n")}` : "";
}
function firstPageBlock(w, key, rewriteDir) {
  if (key !== w.mainKey || isStory(w) || rewriteDir !== null || S.pages[key] || w.entities[key]?.page) return "";
  const { units, now } = normStage(w.stage);
  return `## 이 위키의 첫 문서
- 핵심 규칙과 연표를 항목별로 다시 정리하지 않는다. 규칙은 그 규칙이 실제로 작동한 장면으로만 보여 준다.
- 연표에 없는 새 사건이나 일화를 2개 이상 세운다. 규모는 세계에 맞춘다(마을 이야기면 마을의 사건).
${units.length >= 2 ? "- stage.units 중 2개 이상을 본문에서 다루고, 서로 다른 단위와 장소의 항목을 링크한다. 같은 계보·같은 가문·같은 장소에 링크가 몰리지 않게 한다.\n" : ""}${now ? "- 문서 끝부분에서 작중 기준 시점의 지금(stage.now)을 다룬다.\n" : ""}
`;
}
/* 항목 유형에 맞는 지시만 보낸다. 유형이 정해지지 않았으면 전부 보낸다. */
const showFor = (ty, keys) => !ty || keys.includes(ty);
/* 저장된 주사위 값은 유지하고 모델에 보내는 블록만 영어로 쓴다. 한국어 키워드·금지 예시가 본문에 그대로 섞이는 것을 줄인다. */
const PERSONA_PROMPT_AXES = {
  intro: ["introverted", "extraverted"], mood: ["pessimistic", "optimistic"],
  play: ["serious", "playful"], rule: ["principled", "flexible"],
  temper: ["gentle", "prickly"], drive: ["diligent", "easygoing"],
  calm: ["emotionally stable", "emotionally unstable"]
};
const PERSONA_PROMPT_LIFE = { "편안함": "comfortable circumstances", "보통": "ordinary circumstances", "고단함": "difficult circumstances" };
function personaLines(p) {
  const ax = p && typeof p === "object" && p.axes && typeof p.axes === "object" ? p.axes : {};
  return PERSONA_AXES.map(([id]) => { const v = ax[id]; if (!Number.isInteger(v) || v < 1 || v > 5) return "";
    const [lo, hi] = PERSONA_PROMPT_AXES[id];
    return v === 3 ? `between ${lo} and ${hi} (3)` : `${v === 1 || v === 5 ? "strongly" : "slightly"} ${v < 3 ? lo : hi} (${v})`; }).filter(Boolean);
}
function personaBlock(p) {
  const lines = personaLines(p), life = PERSONA_LIFE.some(([x]) => x === p?.life) ? PERSONA_PROMPT_LIFE[p.life] : "", calm = p?.axes?.calm;
  const hasCalm = Number.isInteger(calm) && calm >= 1 && calm <= 5 && calm !== 3;   // 정서 안정성 축이 없는 옛 항목이나 중간값이면 지시를 붙이지 않는다
  if (!lines.length && !life) return "";
  return `## Personality tendencies and current circumstances (character articles only)
Use this block only for a character article. Ignore it for other article types. These are randomly assigned tendencies: 1 and 5 lean strongly toward an end, 2 and 4 lean slightly, and 3 is neutral.
${lines.length ? `Personality tendencies: ${lines.join(", ")}
` : ""}${life ? `Current circumstances: ${life}
` : ""}- Treat these values as a starting point, adapting them naturally to the character's role, experiences, and relationships.
- These labels are internal writing cues. Keep the article in Korean, but do not copy the labels or translate them into descriptive adjectives. Show them through anecdotes, choices, and actions.
- Neutral axes (3) need not be expressed.${hasCalm ? `
- The emotionally unstable end may emerge through anxiety, low mood, emotional swings, breakdown and recovery. The stable end may emerge through steadiness even in a crisis. Show this axis through anecdotes rather than adjectives as well.` : ""}${life ? `
- Use current circumstances only to guide the ending or current-status sections (recent life, later life, final years). Unless the value is difficult circumstances, do not default to severe lasting injuries, disability, serious illness, or downfall. Show concretely where and how the character lives, what they do, and their relationships. Do not summarize with phrases such as "without lasting injuries", "remaining healthy", or "a peaceful, comfortable, or difficult daily life", or deny misfortunes that never occurred.` : ""}
- User-defined traits (including the protagonist and cast), the user's requested direction, established facts, and characterization or circumstances already shown in other articles take precedence. Follow circumstances established by plot events too. Use these random tendencies only where compatible with that information.
- For a real person or a character based on a real person (including alternate-history reinterpretations), ignore these values and follow the known real-life characterization.

`;
}
const STRUCT_KEYS = { "인물": ["인물"], "조직·국가·도시": ["국가", "조직", "지명"], "사건·전투·전쟁": ["사건"], "병기·기체·함선": ["기술", "물건"], "기술·물건": ["기술", "물건"], "제도·개념·문화": ["제도", "문화", "개념"] };
function structureFor(text, ty) {
  if (!ty) return text;
  return text.split("\n").filter(l => { const m = l.match(/^  - ([^:]+):/); return !m || !STRUCT_KEYS[m[1]] || STRUCT_KEYS[m[1]].includes(ty); }).join("\n");
}
function redirectBlock(w, key) {
  if (key === w.mainKey || (isStory(w) && (key === w.story.protagonistKey || (w.story.cast || []).some(c => c.key === key)))) return "";
  const e = w.entities[key];
  const pages = Object.entries(S.pages).filter(([k]) => k !== key && w.entities[k] && !e.notSame?.includes(k) && !w.entities[k].notSame?.includes(key))
    .map(([k, p]) => {
      const o = w.entities[k], names = infoboxNames(p).join(" / ");
      const facts = o.facts.filter(live).filter(f => /본명|코드명|호출부호|콜사인|이명|칭호|제식명|암호명|별칭|별명|가명|정체|동일/.test(f.t) || f.t.includes(e.title)).slice(-4).map(f => f.t).join(" / ");
      const text = `- ${p.title} (${p.type}): ${p.summary || ""}${names ? "\n  이름 정보: " + names : ""}${facts ? "\n  확정 사실: " + facts : ""}\n  개요: ${firstPara(p)}`;
      return { text, match: text.includes(e.title) ? 1 : 0 };
    }).sort((a, b) => b.match - a.match).slice(0, 80);
  if (!pages.length) return "";
  return `## 같은 대상의 다른 이름인지 먼저 확인
작성할 이름 「${e.title}」이 아래 기존 문서의 본명, 코드명, 제식명, 별명, 가명, 약칭, 옛 이름 등으로 이미 확인되면 새 문서를 쓰지 않고 {"redirect":"기존 문서의 정확한 제목"} 하나만 출력한다. 제식명이 그 인물 자체를 부르는 이름으로 명시되어 있으면 임시 유형이 '물건'이어도 같은 대상으로 본다. 조종사·탑승자·운용자와 그 장비는 서로 다른 대상이다.
명시된 이름 정보, 같은 대상이라는 확정 사실과 언급을 근거로 한다. 직업·능력·역할·이름이 비슷하다는 이유만으로 합치거나, 다른 사람의 이름을 새 별명으로 지어내지 않는다. 별개 인물, 동명이인, 같은 코드명을 이어 쓴 다른 사람, 정체가 아직 드러나지 않은 인물은 각각 유지한다. 근거가 부족하거나 후보가 여럿이면 정상 문서를 작성한다. 넘겨줄 대상은 아래에 실제로 작성된 기존 문서여야 하며 자기 자신으로 넘기지 않는다.
${pages.map(x => x.text).join("\n")}\n\n`;
}
/* 인물 문서 제목은 본명 풀 네임으로. 코드명·기체명·칭호로 정해지면 같은 인물의 제목이 문서마다 달라진다 */
/* 링크와 새 항목 제목에 관한 지침은 linkNameRule() 하나로 붙인다.
   새 항목 제목이나 [[링크]]를 만들 수 있는 프롬프트는 모두 이 함수를 쓰고, tests/name-rule.test.js의 목록에도 넣는다 */
const PERSON_TITLE_RULE = "인물에게 붙은 호출부호·코드명·제식명·세대 번호는 그 인물의 다른 이름이다. 거대한 신체, 병기 취급, 숫자가 붙은 이름만을 이유로 인물을 물건·기체로 분리하지 않는다. 실제 별도 장비라는 근거가 있을 때만 장비 항목을 만들고, 인물 본인의 신체와 본명을 장비와 복무자·조종사로 나누지 않는다. newEntities에도 그 인물의 본명 제목 하나만 넣고 aliases 배열에 그 인물의 호출부호·코드명·이명을 적는다(없으면 빈 배열). 이명은 [[본명|이명]]으로 링크하며 별도 newEntities 항목을 만들지 않는다. 새 인물을 링크할 때 [[ ]] 안의 제목은 본명 풀 네임으로 정한다. 코드명, 호출부호, 기체명, 칭호, 별명, 성이나 이름 하나만 있는 표기는 제목으로 쓰지 않고 보일 말로만 쓴다(예: 본문에서 '블랙버드'로 불리는 마리아 엘레나 로페스는 [[마리아 엘레나 로페스|블랙버드]]). 제목에 이명이나 '본명:'을 덧붙이지 않는다(예: [[Type-18 '블랙버드']]·[[블랙버드(마리아 엘레나 로페스)]]는 쓰지 않는다). 다만 '같은 이명을 쓰는 인물' 목록에 적힌 링크 표기는 그대로 쓴다. 본명이 정해지지 않았거나 작중에서 아직 밝혀지지 않은 비밀이면 가장 널리 불리는 이름을 제목으로 쓴다. 이명은 그 인물 문서의 인포박스(코드명, 별칭 등)에 적는다. 이미 있는 항목 목록에 있는 인물은 그 제목을 그대로 쓴다.";
/* 분류 지침: 축(소속·유형·사건·기타)별로, 넓게, 적게, 이미 있는 것을 우선한다. 같은 분류에 문서가 모여야 분류와 틀이 의미가 있다.
   기존 분류 목록은 합친 분류를 새 이름으로 읽은 결과다 */
function worldCats(w, except, limit = 40) {
  return [...catStats(w, except)].map(([c, s]) => [c, s.n]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit);
}
function catGuide(w, key, max = 30) {
  const st = [...catStats(w, key)].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ko"));
  const list = ax => st.filter(([, s]) => s.axis === ax).slice(0, max).map(([c, s]) => `${c}(${s.n})`).join(", ");
  const have = [...CAT_AXES.map(ax => [ax, list(ax)]), ["축 미정(예전 문서)", list("")]].filter(([, t]) => t);
  return `categories는 위키 하단의 분류처럼 링크 없이 짧게, 축별 객체로 쓴다: {"소속":[...],"유형":[...],"사건":[...],"기타":[...]}
${CAT_AXIS_RULES}
- 사건: 이 항목이 깊이 관련된 사건 문서의 제목. 0~2개.
- 기타: 출생 연도 등 위에 들지 않는 것. 0~2개.
- 분류는 넓은 이름으로 축마다 따로 붙인다. 소속과 유형을 합친 분류("○○의 △△", "○○ 출신 △△")는 만들지 않는다.
- 같은 뜻이면 기존 이름을 글자 그대로 쓴다. 같은 뜻의 분류가 이미 둘 이상 있으면 문서 수가 많은 쪽 하나만 쓴다. 맞는 것이 없을 때만 새로 만든다.
- 이미 있는 넓은 분류가 맞으면 그것을 쓰고, 그것을 좁힌 분류는 따로 만들지 않는다.
- 유형 이름(${TYPES.join(", ")})은 분류로 쓰지 않는다.
${have.length ? `이 세계관에 이미 있는 분류(축별, 괄호는 붙은 문서 수, 많이 쓰인 순):
${have.map(([ax, t]) => `- ${ax}: ${t}`).join("\n")}` : "이 세계관에는 아직 분류가 없다. 다른 문서에도 두루 쓰일 넓은 분류로 만든다."}`;
}
/* 설정 대조에서 링크로 이어진 문서의 전문을 읽는다. 큰 묶음만 문서 경계에서 나눈다. */
const SOURCE_TEXT_BUDGET = 48000;
function sourceBatches(w, key, focus, outgoing = [], eligible = () => true) {
  const links = new Set(outgoing);
  let owners;
  for (const m of focus.matchAll(LINK_RE)) {
    links.add(kOf(w, m[1]));
    if (m[2]) {
      owners ||= documentNameOwners(w);
      for (const k of owners.get(identityName(m[2]))?.keys() || []) links.add(k);
    }
  }
  const mentions = new Set(w.entities[key].mentions.filter(live).map(m => m.from));
  const names = new Set();
  for (const [k, p] of Object.entries(S.pages)) if ((p.links || []).includes(key) || mentions.has(k)) names.add(k);
  for (const k of Object.keys(S.pages)) if (w.entities[k] && hasName(focus, w.entities[k].title)) names.add(k);
  const batches = [[]], titles = [];
  let size = 0;
  for (const k of new Set([...links, ...names])) {
    const p = S.pages[k];
    if (k === key || !p || !eligible(k)) continue;
    if (isStory(w) && (p.syncedTo || p.baseAsOf || 1) > (S.pages[key]?.syncedTo || w.story.chapter)) continue;
    titles.push(p.title);
    const label = `문서 「${p.title}」${p.editedAt ? " [사용자 수정]" : ""}`;
    const text = label + "\n" + docForCheck(p, t => t);
    const pieces = text.length <= SOURCE_TEXT_BUDGET ? [text] : [
      label + "\n" + docForCheck({ ...p, sections: [] }, t => t),
      ...p.sections.map(s => `${label} / 「${s.heading}」\n${s.body}`),
    ];
    for (const piece of pieces) {
      if (size && size + piece.length > SOURCE_TEXT_BUDGET) { batches.push([]); size = 0; }
      batches.at(-1).push(piece);
      size += piece.length + 2;
    }
  }
  const out = batches.map(batch => batch.join("\n\n"));
  out.titles = titles;   // 진단 기록용: 이번 검사에 원문이 함께 넘어간 문서들
  return out;
}
/* 작성 입력: 관련 항목의 단독 문서에서 이 항목이 나오는 문단(그 항목이 주인인 경위). 다시 서술할 때 세부를 지어내지 않게 한다 */
const OWNER_PARA_MAX = 700, OWNER_PER_DOC = 2;
function ownerExcerptBlock(w, key, rel, n = 8) {
  if (n <= 0) return "";
  const e = w.entities[key], names = namesOf(e.title), out = [];
  for (const k of rel) {
    const p = S.pages[k]; if (!p || k === key || out.length >= n) continue;
    if (isStory(w) && (p.syncedTo || p.baseAsOf || 1) > (S.pages[key]?.syncedTo || w.story.chapter)) continue;
    const paras = p.sections.flatMap(s => String(s.body).split(/\n{2,}/).map(t => ({ h: s.heading, t: stripMarks(t).trim() }))).filter(x => x.t && names.some(nm => hasName(x.t, nm)));
    for (const x of paras.slice(0, OWNER_PER_DOC)) { if (out.length >= n) break; out.push(`- 「${p.title}」 / ${x.h}${p.editedAt ? " [사용자 수정]" : ""}: ${x.t.length > OWNER_PARA_MAX ? x.t.slice(0, OWNER_PARA_MAX) + "…" : x.t}`); }
  }
  return out.length ? `## 관련 항목 문서의 해당 대목 (그 항목이 주인인 경위)
아래는 관련 항목의 단독 문서가 이 항목과 얽힌 일을 서술한 문단이다. 옮겨 쓸 재료가 아니라 어긋나지 않기 위한 기준이며, 어떻게 쓸지는 작성 규칙의 '다른 항목과 얽힌 일'을 따른다. 사건 항목이 있는 일과 다른 인물과 함께 겪은 일은 이 대목과 다른 공통 사실을 쓰거나 대목에 없는 공통 사실을 더하지 않는다.
${out.join("\n")}

` : "";
}
function sourceBlock(text) {
  return text ? `## 연결된 문서 원문
${text}

` : "";
}
/* 프롬프트 캐시 경계. 앞부분이 바이트 단위로 같아야 Gemini·OpenAI 자동 캐시가 재사용한다.
 * 보내기 직전에 이 표시로 텍스트 조각을 나누고 표시는 지운다(모델에는 보이지 않는다). */
const PROMPT_CACHE_BREAK = "\u2063\u2063";
const stripCacheBreaks = text => String(text).split(PROMPT_CACHE_BREAK).join("");
/* 모든 유형·세계관이 공유하는 지침을 맨 앞에, 세계관(무대·대체역사)·유형별 지침을 그 뒤에 둔다. */
function pageCommonRules() {
  const st = STYLES.encyc;
  return `## 절제 (아래 모든 규칙에 먼저 적용한다)
아래 규칙들은 방향이지 최대치가 아니다. 규칙 하나를 극단까지 밀어붙이지 않는다. 사건의 크기, 피해 규모, 숫자, 수식어, 극적인 장치는 이 항목에 맞는 만큼만 쓴다. 문서 전체가 같은 강도로 고조되지 않게, 담담한 설명과 강한 장면이 섞이게 한다.

## 세계 넓히기
확정된 설정은 모순을 피하기 위한 바닥일 뿐 테두리가 아니다. 모순만 아니라면 확정되지 않은 부분은 적극적으로 새로 정한다.
- 문서 내용의 절반 이상은 아직 어떤 문서에도 없는 새로운 것이어야 한다.
- 이 문서에서 처음 등장하는 장소, 조직, 사건, 물건을 필요한 만큼 만들어 링크한다. 새 인물은 이 항목의 이야기에 꼭 필요할 때만 많아야 1명이며, 이미 있는 인물로 될 일이면 새로 만들지 않는다. 새 항목은 이름만 봐도 눌러 보고 싶어야 한다. 장소와 사람이 움직인 사건을 우선하고, 위원회, 징발, 철거, 지침 같은 행정 항목으로 링크를 채우지 않는다.
- 확정된 대상에도 새로운 면을 더해도 된다(사건의 뒷이야기, 인물의 다른 시기, 조직의 지부). 이미 확정된 큰 사건도 마찬가지다. 그 사건의 확정된 날짜와 결과는 지키되, 이 항목이 그 안에서 무엇을 했는지는 새로 정해도 된다. 다만 다른 문서가 경과를 확정한 사건이면 새 장면은 그 경과 사이의 빈틈에만 넣고, 다른 항목의 상태나 행동(쓰러짐, 부상, 지연, 출발·이동 방식)과 단계의 순서는 바꾸지 않는다. 모순이 두려워 큰 사건을 비켜 가거나 배경 설명으로만 넘기지 않는다.
- 이 항목이 세계에 영향을 준 사건을 새로 일으켰다면 그 사건을 확정한다(연표에는 0~2개만 넣는다).
- 큰 사건을 피하지 않는다. 전쟁, 반란, 재난, 혁명 같은 큰 사건은 좋은 무대다. 부풀리지 말아야 하는 것은 사건의 크기가 아니라 이 항목이 끼친 영향의 크기다. 이 항목이 영향을 준 범위(어느 나라, 기관, 계층)를 한정하고, 반대하거나 무시하거나 이용한 쪽도 쓴다. "~의 기본 축이 되었다", "~를 중심으로 재편되었다", "모든 ~가 ~에 맞춰졌다" 같은 전면화 문장은 핵심 규칙이 그렇게 정한 경우가 아니면 쓰지 않는다.

## 팬 위키 기법
잘 쓴 팬 위키 문서는 아래 방식으로 읽는 맛을 낸다. 이 항목에 자연스럽게 맞는 것만 한두 가지 쓰고, 맞지 않으면 쓰지 않는다. 기법을 채우려고 문장을 덧붙이지 않는다.
- 평가는 남의 입으로: 강함과 위상은 서술자의 평가 대신 작중 인물의 말, 동시대 대상과의 비교, 전과로 보여 준다.
- 약점과 그 원인: 강점만큼 약점을 쓰고, 왜 생겼는지와 그것이 드러난 장면을 함께 쓴다.
- 항목마다 장면: 무장, 기술, 업적 같은 하위 항목에는 정의만 적지 말고 실제로 쓰인 장면을 붙인다. 장면의 주체는 이 항목 자신이다. 다른 인물이나 사건이 주인인 장면을 빌려 와 풀어 쓰지 않는다. 개념·제도·조직 문서라서 이 항목 자신의 장면이 없으면 이름 없는 사례로 쓰거나, 다른 항목의 사례는 한 문장으로만 쓴다.

## 문장 기준
- 구체성은 의미 있는 디테일이다. 숫자는 그 숫자가 무엇을 뜻하는지 드러날 때만 쓰고, 예산 내역이나 인원수 나열로 분량을 채우지 않는다. "다양한", "중요한 역할을 했다", "큰 영향을 미쳤다", "많은 사람들이" 대신 고유명사와 일화를 쓴다. 어떤 디테일이 어울리는지는 분위기 지침을 따른다.
- 단정형으로 쓴다. "밝혀지지 않았다", "공개되지 않았다", "기밀이다", "기록에 남아 있지 않다", "공식 입장을 내지 않았다", "~라고 전해진다" 같은 얼버무림은 쓰지 않는다. 조직의 반응은 실제로 한 조치(발표, 징계, 해명, 소송)로 쓴다.
- "~의 근거가 되었다", "~의 계기가 되었다", "~의 시초가 되었다", "~의 토대가 되었다", "~의 상징이 되었다", "오늘날까지 이어지고 있다" 같은 연결 상투구는 문서 전체에서 많아야 한 번이다. 한 일이 다른 일로 이어졌다면 누가 언제 무엇을 했는지 장면으로 쓴다.
- 발언은 간접 인용으로 내용만 옮기는 것이 기본이다. 본문 중간에 큰따옴표 대사를 넣고 "~라고 말했다"로 받지 않는다. 직접 인용은 없는 것이 기본이다. 작중에서 실제로 회자되는 한마디가 있을 때만 문서 전체에서 1개까지 넣고, 그런 말이 없으면 넣지 않는다. 인용이 없는 문서도 좋은 문서다. 절정의 순간에 나온 말이나 작중에서 회자되는 한마디를 우선하며, 인물 문서라면 주인공 본인의 말을 우선한다. 인용할 때는 "> " 인용문 상자로 따로 두고 다음 줄에 "> — 화자, 출처"를 붙인다. 격언, 선언문, 예고편 대사처럼 다듬은 말은 쓰지 않는다. 그 상황에서 실제로 나올 법한 짧고 거친 말이며, 말을 더듬거나 흐리거나 엉뚱한 소리를 해도 된다. 화자의 말투와 상황이 드러나게 한다.
  - 나쁜 예(선언문): "침묵하는 다수는 무덤 아래에 있으며, 그들의 권리는 석판보다 단단하다."
  - 좋은 예(그 자리의 말): "다 끝났소? 그럼 창문 좀 닫으시오. 촛불이 저 꼴이니."
  좋은 예는 상황(냉기, 촛불)과 화자의 처지(지치고 겁먹음)가 말에 묻어 있고, 주제를 요약하지 않는다.
- 인물의 속마음, 생각, 느낌은 위키 작성자가 알 수 있는 방식으로만 쓴다. 본인의 증언, 편지, 기록, 남이 본 행동으로 드러내고, 소설처럼 머릿속을 서술하지 않는다.
- "A가 아니라 B였다", "A보다 B였다" 같은 반전 대구는 인용문, 개요, 본문 어디에서도 쓰지 않는다. 이 세계에 없는 현실의 고사나 관용구(아킬레스건, 루비콘 등)도 쓰지 않는다.
- 개요는 훅과 정의를 중심으로 짧게 쓴다. 진영별 이름, 규모 비교, 후대 평가 같은 정보를 개요에 몰아넣지 않고 맞는 섹션에 둔다.
- 근거 없는 칭찬은 하지 않되 강한 것은 강하다고 쓴다. 강함은 형용사가 아니라 비교 대상, 전과, 상대가 치른 대가로 보여 준다. 실패와 갈등은 흐름 속에서 쓰고, "~라는 비판이 있다. 반면 ~" 식의 양론 정리나 "해석이 엇갈린다", "논쟁이 이어지고 있다" 같은 문장은 쓰지 않는다.
- 풍습, 은어, 속설은 이 항목이 직접 원인이거나 핵심 소재일 때만 다루고, 새로 만드는 것은 문서당 많아야 하나다.
- '최초', '처음', '유일', '~만' 같은 주장은 구성원 현황, 기간표, 연표, 사건 장부에 더 이른 사례가 없을 때만 쓰고, 있으면 범위를 좁힌다(예: 육군 최초 → 이 부대 최초).
- 같은 정보를 반복하지 않는다. 인포박스의 수치와 날짜를 개요에서 다시 나열하지 않고, 개요에서 생애나 연혁을 요약하지 않는다.
- 작중 시점과 맞지 않는 연도를 쓰지 않는다. 학년, 기수, 계급, 직위, 나이, 재학·재직·복무 기간은 작중 기준 시점에서 거꾸로 계산해 모든 연도와 맞춘다. 예를 들어 기준 시점에 1학년(신입생)인 인물은 그 전 해들에는 아직 입학 전이므로 그 학교의 학생으로 활동할 수 없고, 기준 시점에 2학년인 선배는 1년 전에 1학년이다. 과거 사건에 등장시킬 때는 그때의 나이와 신분이 그 사건에 맞는지 확인한다.
- 나이, 기간, 금액, 인원처럼 계산이 걸린 수치는 문서 안의 다른 날짜와 수치로 다시 계산해 서로 맞춘다(예: 출생일과 사건 날짜로 그때의 나이를 계산한다). 부대나 기체의 수는 동원, 손실, 격파, 항복, 잔존을 합쳐 처음 숫자와 맞춘다. 비율은 10할(100%)을 넘지 않는다. 개요에서 한 단언(예: 한 발도 쏘지 않았다)은 본문의 사건과 어긋나지 않게 범위를 정확히 쓴다.

## 작성 규칙
- 문체: ${st.desc}
- 분량: ${st.len}.
- 하이퍼링크: 다른 항목은 [[제목]] 또는 [[제목|본문에 보일 말]]로 감싼다. 링크는 공격적으로 건다. 본문과 인포박스에서 따로 문서가 될 만한 이름을 쓸 때마다 링크한다. 앞에서 링크한 이름도 다시 나오면 링크한다. 이름 있는 인물, 장소, 조직, 사건, 문서나 기록, 물건, 제도, 그리고 이 세계에만 있는 용어(예: 어떤 존재들의 방언, 고유한 직업이나 의식)가 여기에 해당한다. 본문에 이름이 나온 인물, 조직, 장소, 사건은 매번 빠짐없이 링크한다. 그 밖의 용어까지 합친 서로 다른 링크 대상의 목표는 문서당 12~18개이고, 꼭 눌러 보고 싶은 것부터 건다. 이미 있는 항목도 본문에 자연스럽게 나왔다면 위 목록의 제목을 글자 그대로 써서 링크한다. ${linkNameRule()} 같은 대상을 다른 이름으로 링크해 새 항목을 만들지 않는다. 다만 링크하려고 기존 항목을 "~의 사례로 꼽힌다", "~와도 관련이 있다"처럼 억지로 끌어오지는 않는다. 현실의 일반 명사(소, 정오, 철도)는 이 세계에서 특별한 의미가 없으면 링크하지 않는다. 자기 자신은 링크하지 않는다.
- 인포박스: 유형에 맞는 4~8개 항목(label/value). value에도 [[링크]]를 쓸 수 있다. 인물이면 '성별' 줄을 반드시 넣는다(남성 또는 여성. 그 인물이나 세계 설정상 의미가 있을 때만 논바이너리나 그 세계의 표현을 쓰고, 사람이 아닌 존재는 '해당 없음'이나 그 존재에 맞는 말을 쓴다). 본문의 대명사와 서술도 이 성별과 맞춘다. 인물이면 해당하는 경우 배우자, 자녀 같은 가족 항목을 넣는다. 전투나 전쟁이면 기간, 장소, 교전 세력, 지휘관(전사한 사람은 이름 뒤에 †), 전력, 피해, 결과를 넣고, 양측이 있는 항목은 value 안에서 "진영 A: … / 진영 B: …"로 나란히 쓴다.
- 다른 항목과 얽힌 일: 그 일을 누가 정하는지(주인)는 아래 세 경우로만 가른다. 이 문서가 주인이 아닌 일은 다시 풀어 쓰지 않는다.
  1. 사건 항목이 있는 일: '참고로 넘길 사건' 목록의 사건, 그리고 이 문서에서 새로 [[사건]]으로 링크한 사건은 그 사건의 문서가 주인이다(문서가 있든 빨간 링크든). 이 항목이 그 안에서 한 일을 받은 내용 안에서 한두 문장으로 쓰고, 시점은 연도까지만 쓰며, 바로 뒤에 '자세한 내용은 [[사건]] 참고.'를 붙인다. 같은 사건의 참고 문구는 문서 전체에서 한 번만 쓰고(그 사건을 다룬 섹션에), 다른 섹션에서 그 사건을 다시 말할 때는 사건 이름에 링크만 건다. 참고 문구는 세부를 대신한다. 그 앞에 그 사건의 정확한 날짜, 지명, 부대 이름, 화기 제원, 수치, 다른 인물의 결정과 직위를 쓰지 않고, 장면은 이 항목의 눈에 보인 것으로만 짧게 묘사한다. (나쁜 예: '2003년 3월 20일 개시된 이라크 침공에서, 공화국수비대 제2메디나 사단이 14km에 걸쳐 구축한 3중 방어선을 매티스 준장의 승인을 받아 단독 돌파했다.' 좋은 예: '2003년 [[이라크 침공]] 때 방어선 정면을 홀로 밀고 나가 기갑부대가 지나갈 길을 열었다. 자세한 내용은 [[이라크 침공]] 참고.')
  2. 사건 항목이 없고 이 항목만 겪은 일: 이 문서가 주인이다. 세부를 이 문서가 정하고 참고 문구를 붙이지 않는다. 다른 문서가 먼저 언급했어도 연도와 결과만 지킨다.
  3. 사건 항목이 없고 다른 인물과 함께 겪은 일: 공통 사실(언제, 어디서, 상대가 무엇을 말하고 했는지)은 다른 문서에 이미 적힌 대로 받은 그대로 쓰고, 바꾸거나 새로 더하지 않는다. 이 항목 쪽의 행동, 반응, 그 뒤에 달라진 것만 이 문서가 정한다. 참고 문구를 붙이지 않는다.
  참고 문구의 대상은 1의 사건뿐이다. 인물, 조직, 국가, 개념 문서로 '자세한 내용은 … 참고.'를 넘기지 않는다.
  이 항목이 다른 인물이나 세력과 함께 겪은 큰 일(교전, 대치, 작전, 혁명, 체제 붕괴, 조약 체결, 재난처럼 여러 세력이 얽힌 일)이나 실제 역사의 큰 사건에 아직 사건 항목이 없으면, 이 항목이 그 안에서 결정적인 일을 했더라도 이름을 붙여 [[사건]]으로 링크하고 1처럼 쓴다. '이미 존재하는 항목'에 그 일의 사건이 있으면 그 제목을 쓴다. 이 문서는 그 사건의 개요만 한두 문장으로 쓰고, 세부는 그 사건의 문서가 정하도록 비워 둔다.
  다른 인물의 생애나 다른 조직의 일처럼 이 항목이 끼지 않은 일은 이 항목과의 관계만 한 문장으로 쓴다. 개념·조직·국가 문서가 사례를 들 때도 '[[인물]]이 몇 년 [[사건]]에서 무엇을 해낸 것이 대표적이다.'처럼 한 문장으로 쓰고 수치를 붙이지 않는다.
  이 항목이 사건 자체이면 그 사건의 경과와 수치는 이 문서가 정한다. 다만 그 안이나 곁의 다른 사건 중 따로 사건 항목이 있는 것(목록의 사건, 문서가 있든 빨간 링크든)은 그 사건 문서가 주인이다. 사건 문서에서는 그 사건이 전체 흐름에서 어떤 의미였는지 두세 문장으로 쓰고 참고 문구를 붙이며, 그 사건의 시각·수치·교전 경과는 옮기지 않는다. 링크 목록처럼 되지 않게 흐름은 이어서 쓴다.
- 위의 확정 사실, 언급, 핵심 규칙, 연표, 사용자 확정 설정과 모순되는 내용은 쓰지 않는다. 다만 다른 문서가 이 문서의 항목 자신을 다시 서술한 사실·언급은 '작성할 문서'의 안내대로 연도와 결과만 지키고, 세부는 이 문서가 정한다. "[사용자 확정]"이 붙은 사실은 다른 문서의 언급과 엇갈리면 이쪽을 따른다. 날짜, 생몰과 나이, 소속, 사건의 결과를 특히 주의한다.
- 본문 서식: 문단은 빈 줄로 구분, 목록은 "- ", 하위 목록은 "  - ", 인용문은 "> ", 강조는 **굵게**. 각주와 취소선은 쓰지 않는다.
- 안내 틀(notices)은 빈 배열로 둔다.`;
}
/* 세계관(무대·대체역사)과 문서 유형에 따라 달라지는 지침. 세계관 고정 자료 뒤에 둔다. */
function pageTypedRules(w, ty) {
  const staged = !!w.stage && !isStory(w), st = STYLES.encyc;
  return `## 이 문서의 엔진 (가장 중요)
쓰기 전에 아래 세 가지를 먼저 정하고, 문서 전체를 이것을 중심으로 짠다. 그 아래의 규칙들은 이 엔진을 해치지 않는 범위에서 지키는 품질 기준이다.
전제: 이 문서가 크게 쓰는 것은 이 문서가 주인인 일뿐이다. 다른 항목과 얽힌 일은 작성 규칙의 '다른 항목과 얽힌 일'에 따라 주인을 가르고, 주인이 아닌 일은 한두 문장으로만 쓴다. 참고 문구는 세부를 대신하는 것이므로, 붙인 자리 앞에 그 일의 날짜, 지명, 부대 이름, 화기 제원, 수치, 다른 인물의 결정과 직위가 없어야 한다. 절정과 큰길은 이 문서가 주인인 일에서 고른다. 아래 세 가지도 이 전제 안에서 정한다.
1. 훅: 이 문서를 읽은 사람이 친구에게 "그거 알아?" 하고 전할 만한 사실 하나. 개요의 첫 문장은 이 항목이 무엇인지 밝히는 정의이고, 훅은 그 뒤 둘째 문장 안에 사실로 둔다. 농담이나 수사로 문서를 시작하지 않는다.
2. 절정: 이 항목이 걸린 가장 극적인 순간 하나. 절정에서는 실제로 무언가가 벌어져야 한다. 긴장만 쌓다가 행정 처리나 협상으로 넘어가지 말고, 이 장르의 핵심 행동(전투, 결투, 능력의 발현, 결정적 결단이나 배신)이 일어나는 순간을 고른다. 이 항목이 인물이면 그 인물이 직접 행동하거나 말하는 순간을 고르고, 주변 인물이 주인공을 대신하게 하지 않는다. 절정은 이 문서만의 장면이어야 한다. 다른 문서가 있거나 따로 문서가 될 사건(빨간 링크)을 절정으로 삼아 그 경과를 다시 쓰지 말고, 그 안에서 이 항목만 겪은 장면이나 이 항목이 주체인 다른 순간을 고른다. 사건의 크기는 이 항목에 맞게 정한다. 장면을 키우려고 피해 규모, 희생자 수, 숫자를 부풀리지 않으며, 작은 항목의 절정은 작은 사건이어도 된다. 문서에서 가장 넉넉한 분량을 이 순간에 주고, 그때 이 항목이 무엇을 보고 듣고 했는지 장면으로 쓴다. 절정이 더 큰 사건 안에 있으면 무대는 이 항목의 눈에 보인 것(강을 건넜다, 포탄이 쏟아졌다, 벽이 무너졌다)으로만 묘사하고, 그 사건의 날짜·지명·부대 이름·화기 제원과 다른 인물의 결정은 사건 문서에 남긴다. 당시의 기록을 직접 인용할 만한 말이 있다면 여기에 두지만, 인용 없이 써도 된다. 문서의 나머지는 이 순간으로 가는 길과 그 뒤의 여파다.
${staged ? "3. 큰길: 이 항목에 직접 작용한 세계의 질서나 사건을 구체적인 선택과 결과로 보여 준다. 소재와 시점은 이 항목의 고유한 이야기에서 고른다." : "3. 큰길: 이 세계의 가장 큰 비틀기나 사건이 이 항목을 통해 피부에 와닿는 장면을 한 번 이상 쓴다. 다른 문서와 겹치는 설정이라도 이 항목의 자리에서 본 모습이라면 반복이 아니다. 장면의 주체는 이 항목이어야 하며, 다른 인물이 주인공인 장면(그 인물의 전과, 그 인물이 겪은 사건)을 가져와 풀어 쓰지 않는다."}
그리고 이 장르의 독자가 이 항목에서 가장 보고 싶어 하는 것을 가장 많은 분량으로 쓴다.
${showFor(ty, ["기술","물건"]) ? `  - 병기·기체·함선: 동시대 다른 기체와 비교한 강함, 대표 전과, 특수 무장과 고유 기능, 명장면, 그것을 몬 파일럿이나 지휘관, 맞수. 이 병기가 전쟁 시기에 존재했다면 절정은 실전으로 고르고, 시험이나 사고는 실전 기록이 없을 때만 절정으로 삼는다. 대표 전투에서는 이 병기가 한 일(전환점에서 무엇을 했는지, 결정타, 입은 손상)을 쓰고, 전투 전체의 경과와 양측 배치는 전투 문서로 넘긴다.
` : ""}${showFor(ty, ["인물"]) ? `  - 인물: 결정적인 선택과 활약, 사랑과 가족, 맞수와 동료, 남긴 것.
` : ""}${showFor(ty, ["국가","조직"]) ? `  - 조직·국가: 무엇을 해냈고 무엇과 싸웠는지, 대표 인물, 전성기와 몰락.
` : ""}${showFor(ty, ["기술","물건","제도","문화","개념"]) ? `  - 마법·이능·기술: 원리와 할 수 있는 것, 대가나 한계, 대표 사용자와 사용 장면.
` : ""}${showFor(ty, ["사건"]) ? `  - 사건: 무엇이 걸려 있었고, 누가 어떻게 움직였고, 결정적 순간이 무엇이었는지.
` : ""}${showFor(ty, ["지명"]) ? `  - 장소: 그곳에서 벌어진 가장 중요한 일, 그곳에 사는 사람들의 하루, 그곳에만 있는 것.
` : ""}  제작 공정, 정비, 예산, 행정 처리, 조사위원회 같은 뒷면의 이야기는 그 자체가 핵심인 항목이 아니면 한두 문단의 곁가지로 둔다.

${w.historical ? `## 실존 인물
이 세계는 실제 역사에서 갈라진 대체역사다. 실존 인물을 재해석해 적극적으로 등장시킨다.
- 세계가 갈라지기 전의 생몰, 출신, 업적은 실제와 맞추고, 갈라진 뒤에 삶이 어떻게 달라졌는지를 쓴다.
- 이름만 빌리지 말고 그 사람의 실제 성격, 능력, 관계에서 출발해 이 세계의 비틀기와 만나는 지점을 쓴다.
- 이 항목의 핵심 자리(지휘관, 대표, 맞수, 대국자)에 그 시대와 분야의 실존 인물이 어울리면 창작 인물보다 실존 인물을 먼저 세우고, 그 곁의 부관, 조종사, 참모 같은 자리에는 창작 인물을 둔다.
- 현실에서 아직 살아 있거나 세상을 떠난 지 오래되지 않은 인물(대략 1990년 이후 사망)은 공적 역할 위주로만 쓰고, 범죄, 추문, 사생활, 연애나 성적인 내용, 실제로 하지 않은 논란성 발언을 지어내지 않는다. 그런 내용이 필요한 자리는 창작 인물로 채운다.

` : ""}${showFor(ty, ["인물"]) ? `## 인물의 성격과 특징\n${TRAIT_RULE}\n\n## 인물 문서
이 항목이 인물이면 이력서가 아니라 사람의 이야기로 쓴다. 동물, 기계, 신, 정령처럼 사람이 아닌 존재라면 아래 항목을 그 존재에 맞게 바꿔 적용하고, 맞지 않는 항목(예: 소의 혼인)은 언급하지 않는다.
- 인물의 성격: 역할, 경험, 관계 속에서 어떤 선택을 하고 어떻게 행동하는지로 보여 준다. 평범하고 선량한 사람도 좋은 인물이다. 강렬한 성격이나 극단적인 결함은 그 인물의 맥락에 맞을 때만 쓰고, 개성을 만들려고 억지로 덧붙이지 않는다.
- 사적인 면은 인물의 삶과 관계에 자연스럽게 연결될 때 다룬다. 특징 수를 채우려고 취미, 약점, 버릇을 억지로 만들지 않는다.
- '특징' 섹션: 이 인물을 이해하는 데 필요한 특징 2~3개를 구체적인 소제목으로 쓰고, 각 특징은 "~한 성격이다"라고 단정하는 대신 일화로 보여 준다. 다른 인물과 성격이 비슷해도 이 인물이 겪은 사건과 관계에 맞게 쓴다. 특징은 기벽이나 집착이 아니어도 된다.
- 강함과 이름: 강함이나 무서움은 적과 맞수가 그를 어떻게 대했는지로 전하고, 이명이 있다면 누가 왜 붙였는지 쓴다.
- 동기의 뿌리: 이 인물이 무엇을 바라는지가 어디서 시작되었고 어떻게 바뀌었는지를 생애 안에서 보여 준다. 바라는 것은 가족의 안녕, 생계, 인정받기, 평온한 노후처럼 소박해도 된다.
- 생애의 하위 섹션은 직책이 아니라 전환점(사건, 결정, 상실, 만남)을 제목으로 삼는다. 각 전환점에서 무엇을 원했고, 어떤 선택지가 있었고, 왜 그쪽을 택했고, 무엇을 잃었는지를 쓴다. 동기는 본인이 남긴 말이나 편지, 주변의 증언, 행동으로 드러낸다.
- 직책과 연도의 나열은 인포박스로 보낸다.
- '인물' 섹션의 중심은 사적인 삶이다. 가족, 배우자, 연인, 친구는 이미 확정된 관계(위의 확정 설정과 인물 관계)를 쓴다. 정해지지 않은 가족이나 연인을 새로 지어내 채우지 않고, 짧게 적거나 비워 둔다. 연인이나 옛 연인은 이 인물의 이야기에 꼭 필요할 때만 쓴다. 사적인 관계가 공적인 선택에 준 영향이 있으면 쓴다. 습관, 버릇, 아끼던 물건 같은 생활 디테일은 한두 가지까지 쓰되, 이 인물의 처지(직업, 과거)에서 나온 이유가 보이는 것을 고른다. 생활 디테일을 기벽이나 강박으로 만들지 않는다.
- '인물 관계' 섹션에서는 확정된 관계와 이 문서에 실제로 나온 인물과의 관계를 다룬다. 관계를 채우려고 새 인물을 만들지 않는다. 각 인물은 이 항목과 어떤 사이였고 그 관계가 어떻게 시작해 어떻게 변했는지만 한두 문장으로 쓰고, 위의 '확정된 인물 관계'와 일치시킨다. 상대 인물의 직위, 그 인물이 내린 결정, 그 인물의 이후 경력은 그 인물의 문서에 남긴다.
- 실패, 후회, 풀리지 않은 갈등도 쓴다.

` : ""}${showFor(ty, ["사건"]) ? `## 사건 문서
이 항목이 전투, 전쟁, 작전, 재난, 반란, 정변 같은 사건이면 줄거리 요약이 아니라 단계마다 긴장이 올라가는 기록으로 쓴다. 아래는 채워야 할 목록이 아니다. 이 사건에 실제로 있었던 것만 흐름 속에 녹여 쓴다.
- 단계와 긴장: 경과는 단계별 하위 섹션으로 나눈다. 시한이 있으면 남은 시간은 각 단계 첫 문장 안에 자연스럽게 넣고, 굵은 글씨나 따로 떨어진 줄로 표시하지 않는다. 결정적 순간 앞에 실패한 시도가 있었다면 그 실패와 잃은 사람을 이름과 함께 쓴다.
- 양쪽의 판단: 진 쪽 지휘부가 무엇을 판단했는지 쓰고, 결과를 가른 오판이 있었다면 그 순간을 장면으로 둔다.
- 교신과 기록: 결정적인 단계 하나를 짧은 교신이나 명령으로 열 수 있다. 이런 교신은 "> " 인용문 상자로 두고 다음 줄에 "> — 화자, 상황"을 붙이며, 직접 인용과 합쳐 문서 전체에서 1개까지만 쓴다.
- 결과와 영향: 지휘부와 파벌의 교체, 제도와 전략의 변화가 다시 무엇을 낳았는지 연쇄로 쓴다. 진영마다 사건을 다르게 부르거나 작중 해석이 갈리면 그 맥락에서 쓴다.

` : ""}## 이 유형의 구성
- 구성: ${structureFor(st.structure, ty)}`;
}
function pageWritingRules(w, ty) { return pageCommonRules() + PROMPT_CACHE_BREAK + pageTypedRules(w, ty); }
function pagePrompt(w, key, rewriteDir = null, guide = "", angle = null, angleMode = "section", birthday = null, persona = null) {   // angleMode: section(대상이 정해진 문서에 얹기) · novel(랜덤 서핑이 방향에 넣어 보낸 각도)
  const e = w.entities[key], inputs = writingOptions();
  const ty = TYPES.includes(e.type) ? e.type : "";
  const staged = !!w.stage && !isStory(w);
  const rel = inputs.related ? related(w, key, inputs.relatedCount) : [];
  const relText = rel.map(k => entityBrief(w, k, null, null, null, inputs)).join("\n\n") || "(아직 없음)";
  const idx = Object.entries(w.entities).filter(([k]) => k !== key && !rel.includes(k))
    .sort((a, b) => (b[1].page ? 1 : 0) - (a[1].page ? 1 : 0)).slice(0, inputs.index ? inputs.indexCount : 0)
    .map(([, o]) => `- ${o.title}${o.type ? " — " + o.type : ""}${o.summary ? ". " + o.summary.slice(0, 60) : ""}`).join("\n") || "(아직 없음)";
  const known = e.facts.length || e.mentions.length || e.summary;
  const target = known
    ? `${isStory(w) ? "아래 확정 사실과 언급의 내용은 반드시 지킨다." : "이 문서가 이 항목의 단독 문서다. 아래 확정 사실과 언급 가운데 [사용자 확정]이 붙은 것은 반드시 지킨다. 나머지는 다른 문서가 이 항목을 서술한 것이며, 어떻게 따를지는 작성 규칙의 '다른 항목과 얽힌 일'을 따른다. 이 항목만 겪은 일은 연도와 결과(생사, 소속, 무엇을 해냈는지)만 지키고 세부는 이 문서가 정한다. 다르게 정하면 검사가 그 문서에 수정 요청을 보낸다. 사건 항목이 있는 일과 다른 인물과 함께 겪은 일의 공통 사실은 받은 그대로 따른다."} 유형과 요약은 이전 응답에서 추출한 설명이므로, 인물의 호출부호를 별도 물건으로 잘못 분류한 경우 그 오분류를 유지하지 않는다. 누구를 가리키는지 먼저 확인하고 본명·신체·호출부호를 같은 인물로 다룬다. 실제 조종사와 별도 장비는 구분한다.\n${e.type ? "이전 분류(확정된 신원과 다르면 바로잡을 것): " + e.type + "\n" : ""}${e.summary ? "요약: " + e.summary + "\n" : ""}${inputs.facts && e.facts.some(live) ? "확정 사실:\n" + promptFacts(w, key, e.facts.filter(f => live(f) && (inputs.userFacts || f.src !== "user")), null, inputs.factsCount).map(f => "- " + factLine(f)).join("\n") + "\n" : ""}${inputs.mentions && e.mentions.some(live) ? "다른 문서에서의 언급:\n" + promptMentions(w, key, e.mentions.filter(live), null, inputs.mentionsCount).map(m => `- 「${w.entities[m.from]?.title || "?"}」: "${m.text}"`).join("\n") : ""}`
    : e.src === "search" ? `검색창에서 직접 입력된 이름이며, 이 세계관의 어떤 문서에서도 언급된 적이 없다. 먼저 이 이름이 아래 셋 중 무엇인지 판정하고 그에 따라 쓴다.
(가) 현실에도 있는 일반 명사나 고유명사(예: 참치, 우산, 파리, 커피, 나폴레옹): 현실의 의미를 그대로 문서의 주제로 삼는다. 일반적인 설명에 더해, 이 세계의 역사·산업·제도·문화가 그 대상과 맞닿는 지점을 섹션 일부(전체의 절반 이하)로 구체적으로 쓴다. 현실과 갈라진 시점 이후의 역사는 이 세계에 맞게 바꾼다. 이 단어를 세계관 고유의 은어나 전혀 다른 뜻으로 재해석하지 않는다.
(나) 현실에는 없지만 이름으로 읽히는 말(인물명, 지명, 조직명, 작전명처럼 그럴듯한 조합): 이 세계 안의 새 항목으로 창작한다.
(다) 의미를 읽어낼 수 없는 문자열(자판을 아무렇게나 두드린 듯한 조합, 무작위 철자, 발음하기도 어려운 나열): 문서를 쓰지 않고 {"notFound": true} 하나만 출력한다.`
    : e.src === "guided" ? "사용자가 방향을 정해 새로 만들기로 한 항목이다. 아래 '사용자가 요청한 방향'에 맞춰 정의한다. 현실에도 있는 말이면 방향이 달리 말하지 않는 한 현실의 의미를 바탕으로 이 세계에서의 모습을 쓴다."
    : e.src === "force" ? "사용자가 이 이름으로 항목을 새로 만들기로 했다. 의미 없는 문자열처럼 보여도 이 세계 안의 고유명사(암호명, 인물의 별칭, 지명, 조직명, 제품명 등)로 해석해 창작하고, 그 이름이 왜 그렇게 붙었는지도 설명한다."
    : "아직 아무 문서에서도 언급되지 않은 새 항목이다. 세계관에 자연스럽게 녹아들도록 정의하라.";
  const focus = [e.title, e.summary, ...e.facts.filter(live).map(f => f.t), ...e.mentions.filter(live).map(m => m.text)].join("\n");
  // 캐시 순서: 공통 지침 → 세계관 고정 자료(원안·규칙·무대·확정 설정·분위기·작가 지침) → 유형별 지침·연표·용어·대상 자료.
  // 같은 세계관에서 연달아 쓰는 문서는 앞의 두 덩어리를 그대로 공유한다. 연표·용어집은 문서가 늘면 바뀌므로 뒤에 둔다.
  return `${inputs.guidelines ? pageCommonRules() + PROMPT_CACHE_BREAK : ""}\n\n너는 가상 세계관 위키 「${w.title}」의 집필자다. 이 위키는 실존하지 않는 세계를 다루며, 작중 기준 시점은 ${w.era}이다. 현실 세계, AI, '설정'이라는 단어 등 세계 바깥의 시선은 언급하지 말고 작중의 백과사전처럼 쓴다.

${canonBlock(w, focus, { ...inputs, timeline: false, glossary: false })}
${toneBlock(w)}${w.guide ? `## 작가 지침 (사용자 지정)
${w.guide}
이 지침은 아래의 문체, 구성, 분량, 기법 규칙보다 우선한다. 다만 핵심 규칙, 연표, 사용자 확정 설정, 다른 문서가 확정한 사실과 부딪히면 그쪽을 따른다.

` : ""}${PROMPT_CACHE_BREAK}${inputs.guidelines ? pageTypedRules(w, ty) + "\n\n" : ""}${canonBlock(w, focus, { ...inputs, seed: false, rules: false, stage: false, canon: false })}
${isStory(w) ? "\n" + storyBlock(w, key, true) + "\n" : ""}
## 작성할 문서: 「${e.title}」
${target}
${rewriteDir === null ? redirectBlock(w, key) : ""}
${refEventsBlock(w, key, rel)}${isStory(w) ? "" : sharedNamesBlock(w)}${(() => { const nbs = (inputs.nav ? navboxesFor(w, key).slice(0, inputs.navCount) : []).filter(([, nb]) => nb.src !== key); return nbs.length ? `\n이 항목은 아래 예전 틀에 실려 있다. 이름, 번호, 역할, 전·현직 여부와 다른 구성원과의 관계를 틀과 일치시킨다.\n${nbs.map(([, nb]) => navboxText(nb, inputs.navCount)).join("\n\n")}` : ""; })()}

${birthday && rewriteDir === null ? `## 생일 (인물 문서일 때만)
이 문서가 인물 문서이고 위의 확정 내용에 생일·출생일이 없다면, 생일(월·일)은 ${birthday.m}월 ${birthday.d}일로 한다. 출생 연도는 확정 내용과 세계관에 맞게 정한다. 사용자가 요청한 방향이 생일을 정했거나, 인물이 아니면 이 항목은 무시한다.
실존 인물이거나 실존 인물을 바탕으로 한 인물(대체역사에서 재해석한 인물 포함)이면 이 날짜를 쓰지 않고 실제 생일을 따른다. 실제 생일을 모르면 생일을 적지 않는다. 지어낸 날짜를 실존 인물에게 붙이지 않는다.

` : ""}${guide ? `## 사용자가 요청한 방향
${guide}
이 방향을 최우선으로 따르되, 위의 확정 내용(핵심 규칙, 연표, 사용자 확정 설정, 다른 문서의 사실과 언급)과 충돌하는 부분은 따르지 않는다. 방향이 분량이나 구성에 관한 것이면 아래 작성 규칙의 분량·구성보다 우선한다.

` : ""}${angle && rewriteDir === null && angleMode === "section" ? pageAngleBlock(angle, guide) + "\n\n" : ""}${rewriteDir !== null ? `## 다시 쓰기
이 문서는 이전 버전을 폐기하고 처음부터 새로 쓰는 것이다. 위에 적힌 확정 내용은 모두 다른 문서나 사용자가 정한 것이므로 반드시 지키고, 그 밖의 부분은 이전과 달라도 된다.
${rewriteDir ? `사용자가 요청한 방향: ${rewriteDir}\n이 방향을 최우선으로 따르되, 확정 내용(핵심 규칙, 연표, 사용자 확정 설정, 다른 문서의 사실과 언급)과 충돌하는 부분은 따르지 않는다. 방향이 분량이나 구성에 관한 것이면 아래 작성 규칙의 분량·구성보다 우선한다.` : ""}

` : ""}${inputs.nav ? navPromptBlock(w, key, inputs.navCount) : ""}${inputs.relations ? relRefBlock(w, [key, ...rel], key, key, inputs.relationsCount) : ""}${(() => { const qi = inputs.quotes ? quoteIndex(w, key, inputs.quotesCount) : ""; return qi ? `## 이미 기록된 발언 (같은 사람의 같은 자리 발언은 글자 그대로)
다른 문서에 이미 기록된 말이다. 같은 사람이 같은 날 같은 자리에서 한 말을 이 문서에서 다시 다룰 때는 아래를 글자 그대로 옮기거나, 인용하지 않고 간접 서술로 쓴다. 같은 자리의 말을 새로 지어내지 않는다.
${qi}

` : ""; })()}${inputs.ownerText ? ownerExcerptBlock(w, key, rel, inputs.ownerTextCount) : ""}${inputs.mentions ? episodeBlock(w, key) : ""}${inputs.related ? periodBlock(w, rel, 16, false) : ""}${inputs.roster ? rosterBlock(w, [key, ...(e.affil?.list || []).map(a => a.org), ...(e.cats || []).filter(c => c.axis === "소속").map(c => kOf(w, c.name)), ...rel], inputs.rosterCount) : ""}${inputs.events ? eventBlock(w, key, rel, inputs.eventsCount) : ""}${inputs.sameEvents ? sameKindBlock(w, key, rel, guide || "", inputs.sameEventsCount) : ""}${inputs.life && ty === "인물" ? lifeFlowBlock(w, key, rel, inputs.lifeCount) : ""}## 관련 항목의 확정 설정 (모순 금지)
${staged ? "아래는 모순을 피하기 위한 참고 자료다. 이 항목이 새로 더하는 사실과 장면을 중심으로 쓰고, 이미 기록된 경위는 연결에 필요한 만큼만 쓴다." : "아래는 모순을 피하기 위한 참고 자료다. 여기 있는 항목과 사실을 본문에 모두 언급할 필요는 없고, 같은 사고, 같은 절차, 같은 규정을 이 문서에서 되풀이하지 않는다. 다만 세계의 큰 사건을 이 항목의 자리에서 보여 주는 것은 되풀이가 아니다."}
${relText}

## 이미 존재하는 다른 항목 (링크할 때 제목을 정확히 그대로 쓴다)
이 목록은 이름이 겹치거나 엇갈리지 않게 하려는 색인이다. 목록에 있다는 이유로 본문에 끌어오지 않는다. 각 줄의 "—" 앞까지가 제목이며, 뒤의 유형과 정의는 제목이 아니다. 제목에 "(인물)" 같은 유형을 붙이지 않는다.
${idx}

${inputs.guidelines ? firstPageBlock(w, key, rewriteDir) : ""}${inputs.gaps ? worldGaps(w) : ""}${showFor(ty, ["인물"]) ? personaBlock(persona) + (() => { const ti = inputs.traits ? traitIndex(w, key, inputs.traitsCount) : ""; return ti ? `## 다른 인물의 특징 (표현 반복 참고)\n${ti}\n\n` : ""; })() : ""}

## 출력
${ENTITY_DEFINITION_RULE}
JSON 객체 하나만 출력:
{"title":"${e.title}",${angle && rewriteDir === null ? (angleMode === "section" ? '"angleUsed":"true 또는 false(이번 각도를 반영했는가)",' : "") + '"sceneUsed":"이번 각도로 실제로 쓴 장면 한 문장(쓰지 않았으면 빈 문자열)",' : ""}"type":"${TYPES.join("|")} 중 하나","summary":"한 문장 정의(링크 없이)","categories":{"소속":["..."],"유형":["..."],"사건":[],"기타":[]},"notices":["..."],"infobox":[{"label":"...","value":"..."}],"sections":[{"heading":"개요","level":1,"body":"..."},{"heading":"생애","level":1,"body":""},{"heading":"1959년 데뷔","level":2,"body":"..."}],${showFor(ty, ["인물"]) ? '"motifs":["' + (staged ? '이 인물의 특징 전체를 대표하는 중심 소재(짧은 명사)' : '이 인물 문서에서 성격을 보여 준 일화의 중심 소재(짧은 명사)') + '"],' : ""}"facts":[{"about":"항목 제목","fact":"이 문서에서 확정한, 그 항목에 관한 사실 한 문장"}],${REL_JSON},"newEntities":[{"title":"새로 링크한 항목 제목","type":"유형","summary":"한 문장 정의","소속":["아는 경우"],"유형":["아는 경우"]}],"timeline":[{"year":"연도","month":3,"day":14,"about":"사건의 주체가 되는 항목 제목","event":"이 문서에서 새로 확정한, 세계에 영향을 준 사건"}],${EVENTS_JSON},${TERMS_JSON},${AFFIL_JSON},${SPAN_JSON}}
relations에는 이 문서에 나온 인물 사이의 관계를 넣는다. 이 항목이 인물이면 이 문서에 실제로 나온 인물과의 주요 관계를 넣는다. 관계를 채우려고 새 인물이나 연인을 지어내지 않는다. '기존 인물 관계'에 이미 있는 관계를 이 문서가 다시 다루면 same으로 그 번호만 쓰고, 관계의 성격이 실제로 바뀌었을 때만 next를 쓴다. a와 b는 이 문서의 제목이거나 이 문서가 링크한 항목의 제목을 글자 그대로 쓴다. 인물이 아닌 항목만 다룬 문서라면 빈 배열.
${REL_SPEC}
${showFor(ty, ["인물"]) ? `${staged ? 'motifs에는 인물의 성격·능력·습관 등 특징 전체의 중심 소재 1~3개를 쓴다. 기존 소재와 의미가 같으면 그 이름을 재사용한다. 인물이 아니면 빈 배열.' : 'motifs에는 이 항목이 인물이면 이 문서에서 성격을 보여 준 일화의 중심 소재 1~3개를 짧은 명사로 쓴다(예: "보급품", "규칙 위반", "음식", "동물", "음악", "가족"). 인물이 아니면 빈 배열.'}\n` : ""}${catGuide(w, key, inputs.categories ? inputs.categoriesCount : 0)} sections의 level은 1(큰 섹션) 또는 2(바로 앞 큰 섹션의 하위 섹션)이며, 섹션 번호는 쓰지 않는다.
facts에는 이 문서가 링크한 항목 중 중요한 것(인물, 조직, 사건, 장소 위주) 6~10개에 대해 1개씩 넣되, 이 문서의 절정이나 큰 사건에 등장한 항목은 빠짐없이 포함해 그 사건에서 무엇을 했고 어떻게 되었는지(쓴 무기나 수단, 생사, 결과)를 사실로 남긴다. 그리고 「${e.title}」 자체에 대한 핵심 사실 3~6개를 넣는다. newEntities에는 위 '이미 존재하는 항목' 목록에 없던 링크 대상을 모두 넣되, summary는 40자 안팎의 한 문장으로 짧게 쓴다. newEntities의 소속과 유형은 이 문서에서 알 수 있는 범위에서 categories와 같은 규칙(기존 분류 이름 우선)으로 0~1개씩 쓰고, 모르면 빈 배열로 둔다. timeline에는 이 문서에서 새로 확정한 사건 중 세계에 영향을 준 것(전쟁, 조약, 창설, 해체, 발견, 사고, 정변처럼 그 해에 일어난 일)만 0~2개 넣는다. 넣을 사건이 없으면 빈 배열이 정상이며, 연표를 채우려고 사건을 만들지 않는다. ${TL_DATE_SPEC}${tlDateNote(w)} 현재 상태, 근황, 거주, 요양, 재직 중, 복무 중 같은 서술은 연표가 아니라 본문에 쓴다. event 문장에는 그 일을 한 주체의 고유명사를 넣고, 같은 이름을 about에 글자 그대로 쓴다. 이미 연표에 있는 사건은 다시 넣지 않는다. ${inputs.events || inputs.sameEvents ? eventsSpec(w) : EVENTS_SPEC_BASE} ${TERMS_SPEC} ${AFFIL_SPEC.replace("{T}", e.title)} ${SPAN_SPEC.replace("{T}", e.title)}`;
}
/* 참고 문구('자세한 내용은 [[사건]] 참고.')를 붙일 수 있는 사건. 주인을 모델이 판단하지 않도록 앱이 항목 유형으로 정한다 */
const REF_EVENTS_N = 12;
function refEventKeys(w, key, rel, extraText = "") {
  const e = w.entities[key], text = [e.summary, extraText, ...e.facts.filter(live).map(f => f.t), ...e.mentions.filter(live).map(m => m.text)].join("\n");
  const cand = new Set([...rel, ...eventKeysFor(w, key, rel), ...e.mentions.filter(live).map(m => m.from)]);
  for (const [k, o] of Object.entries(w.entities)) if (namesOf(o.title).some(n => hasName(text, n))) cand.add(k);
  return [...cand].filter(k => k !== key && (w.entities[k]?.type || w.entities[k]?.stub?.type) === "사건").slice(0, REF_EVENTS_N);
}
const refEventLine = (w, k) => `- [[${w.entities[k].title}]]${S.pages[k] ? "" : " (아직 문서 없음)"}`;
function refEventsBlock(w, key, rel) {
  if (isStory(w)) return "";
  const list = refEventKeys(w, key, rel);
  return `## 참고로 넘길 사건 (앱이 정한 목록)
${list.length ? list.map(k => refEventLine(w, k)).join("\n") : "- (없음)"}
'자세한 내용은 [[사건]] 참고.'는 이 목록의 사건과 이 문서에서 새로 [[사건]]으로 링크한 사건에만 쓴다.

`;
}
/* 제목의 표기들: "白頭(백두)"는 "白頭"와 "백두"로도 찾는다 */
const namesOf = t => { const m = String(t).match(/^(.+?)\((.+)\)$/); return [t, ...(m ? [m[1].trim(), m[2].trim()] : [])].filter(x => x.length >= 2); };
function checkBrief(w, k, key, focus) {
  const o = w.entities[k], p = S.pages[key], ok = src => refOK(src, p) || (!isStory(w) && src === k);   // 항목 자신의 문서가 정한 사실과 정의는 그 항목의 기준이다
  const red = !S.pages[k];   // 단독 문서가 없으면 다른 문서들의 서술이 유일한 기준이므로 넉넉히 넣는다
  const ms = pickRelevant(w, k, o.mentions.filter(m => m.from !== key && live(m) && ok(m.from)), m => m.text, red ? 8 : 2, focus).map(m => `- 「${w.entities[m.from]?.title || "?"}」의 서술: ${m.text}`);
  const rs = pickRelevant(w, k, relationsOf(w, k).filter(x => x.src !== key && live(x) && ok(x.src)), x => relLine(w, x), 3, focus).map(x => "- 관계: " + relLine(w, x));
  return [entityBrief(w, k, key, ok, focus) + (red && ms.length ? "\n(단독 문서가 없는 항목: 아래 다른 문서들의 서술이 기준이다)" : ""), ...ms, ...rs].join("\n");
}
/* 문서 안에서 두 곳 이상에 나오는 대상(항목 이름, 연도)과 그 위치. 검사 모델이 무엇을 맞춰 볼지 고르지 않아도 되게 앱이 먼저 짚어 준다 */
function crossRefs(w, p) {
  const parts = [];
  if (p.summary) parts.push({ name: "한 줄 정의", text: p.summary });
  if (p.categories?.length) parts.push({ name: "분류", text: p.categories.join(" | ") });
  if (p.infobox?.length) parts.push({ name: "인포박스", text: p.infobox.map(r => `${r.label}: ${stripMarks(r.value)}`).join("\n") });
  for (const s of p.sections) parts.push({ name: s.heading, text: s.heading + "\n" + stripMarks(s.body) });
  const subj = new Map();   // 표시 이름 → 검색어들
  for (const [k, o] of Object.entries(w.entities)) {
    if (k === p.key) continue;
    const names = new Set(namesOf(o.title));
    if (o.type === "인물") for (const t of o.title.replace(/\(.*\)$/, "").split(/[\s·]+/)) if (t.length >= 2) names.add(t);   // 성이나 이름만 쓴 경우
    subj.set(o.title, [...names]);
  }
  const out = [];
  for (const [label, names] of subj) {
    const where = parts.filter(x => names.some(n => x.text.includes(n))).map(x => x.name);
    if (where.length >= 2) out.push({ label, where });
  }
  const years = new Map();   // 연도는 기년법까지 같아야 같은 해다. "1312년" 안의 "312년"처럼 글자로 찾지 않는다
  for (const x of parts) for (const h of yearHits(x.text)) { const key = h.cal + "|" + h.y, o = years.get(key) || years.set(key, { label: fmtY(h), where: [] }).get(key); if (!o.where.includes(x.name)) o.where.push(x.name); }
  for (const o of years.values()) if (o.where.length >= 2) out.push(o);
  out.sort((a, b) => b.where.length - a.where.length);
  return out.slice(0, 30).map(x => `- ${x.label}: ${x.where.map(n => `「${n}」`).join(", ")}`).join("\n");
}
/* 검사할 문서의 텍스트 (한 줄 정의, 분류, 인포박스, 본문) */
function docForCheck(p, marks = stripMarks) {
  return [`# ${p.title}`, p.summary ? `한 줄 정의: ${p.summary}` : "", p.categories?.length ? `분류: ${p.categories.join(" | ")}` : "", "[인포박스]", ...(p.infobox || []).map(r => `${r.label}: ${marks(r.value)}`), "[본문]", ...p.sections.map(s => `${(s.level || 1) === 2 ? "###" : "##"} ${s.ch && (s.level || 1) === 1 ? `[${s.ch}장] ` : ""}${s.heading}\n${marks(s.body)}`)].filter(Boolean).join("\n");
}
const NUMBER_CHECK_RULE = "숫자는 주체·속성·사건·단위·시점·범위가 같은지 먼저 확인한다. 한 문장에 이름이 언급됐다는 이유만으로 다른 주체의 숫자를 연결하지 않는다. 예: 약제 A의 최초 도입 연도와 그 약제를 사용하는 부대 B의 창설 연도는 다른 대상의 다른 사건이므로 모순이 아니다. 같은 대상이어도 개발·도입·창설·제정·시행은 서로 다른 속성이다. 1960년대 같은 범위·대략적인 시기는 특정 연도와 같아야 하는 값이 아니다. 귀속 대상이나 범위가 불명확하면 숫자를 맞추라는 지적을 하지 않는다.";
const ISSUE_JSON = `JSON 객체 하나만 출력: {"issues":[{"claim":"문서의 해당 서술(문서에서 글자 그대로)","evidence":"근거가 된 확정 설정이나 문서 안의 다른 서술(글자 그대로)","conflict":"둘이 왜 동시에 참일 수 없는지 한 문장","severity":"high 또는 low"}]}
문제가 없으면 issues는 빈 배열.`;
const CHECK_ISSUE_JSON = ISSUE_JSON.replace('"severity":"high 또는 low"}', '"severity":"high 또는 low","fixDoc":"고칠 쪽이 이 문서가 아니라 다른 문서이면 그 문서 제목(글자 그대로), 이 문서면 빈 문자열"}');
function ownerCheckRule(w, p) {
  return isStory(w) ? "" : `- 주인 문서 원칙: 어떤 항목의 경위, 이력, 국적·소속, 날짜, 수치는 그 항목의 단독 문서가 주인이다. 이 문서가 다른 항목에 대해 쓴 서술이 그 항목의 단독 문서와 어긋나면 이 문서가 고칠 쪽이다(fixDoc은 빈 문자열). 이 문서가 「${p.title}」 자신에 대해 쓴 서술이 다른 문서(국가·사건·개념 문서 등)의 재서술과 어긋나고 그 문서가 [사용자 수정]이 아니면, 고칠 쪽은 그 다른 문서이므로 fixDoc에 그 문서 제목을 쓴다. 사용자 확정 설정, 핵심 규칙, 연표와 어긋나면 언제나 이 문서가 고칠 쪽이다. 이 문서 자신에 대한 서술이라도, 단독 사건 문서가 따로 있는 일(이 사건 안의 하위 사건 포함)의 장소·날짜·경과는 그 사건 문서가 주인이다. 그 사건 문서와 어긋나면 이 문서가 고칠 쪽이다. 다만 아래 '같은 대상인지 먼저 확인한다'에 걸리는 경우는 그 기준을 따른다.
- 재서술의 세부: 다른 문서가 이 문서의 항목을 다시 서술하면서 날짜, 방향, 장소, 경로, 부위, 수치, 누가 안에 있었고 누가 밖에서 왔는지 같은 세부를 다르게 썼으면 모두 대조한다. 요약 수준의 차이(세부 생략)는 지적하지 않는다.
`;
}
/* 주인 문서 원칙(일반 모드): 어떤 항목의 경위·이력·수치는 그 항목의 단독 문서가 주인이다.
   이 문서가 링크하거나 이름을 적은 항목의 단독 문서는 쓴 순서와 관계없이 그 항목에 관한 기준이 된다. 이야기 모드는 장 순서가 기준이다 */
function ownerRefOK(w, p, focus = null) {
  if (isStory(w)) return src => refOK(src, p);
  const text = focus ?? docForCheck(p, t => t);
  return src => refOK(src, p) || (!!S.pages[src] && w.entities[src] && ((p.links || []).includes(src) || hasName(text, w.entities[src].title)));
}
function checkSourceBatches(w, key) {
  const p = S.pages[key], focus = docForCheck(p, t => t);
  return sourceBatches(w, key, focus, p.links, ownerRefOK(w, p, focus));
}
/* 설정 대조에 '관련 항목의 확정 설정'으로 넣을 항목들.
   단독 문서가 없는 항목(빨간 링크)은 원문 대조로 들어오지 않아 이 목록이 유일한 근거이므로 앞에 두고 자리를 따로 준다 */
const CHECK_REF_N = 10, CHECK_RED_N = 8, CHECK_NAMED_N = 8;
function checkKeys(w, key) {
  const p = S.pages[key];
  const all = [...new Set([...related(w, key), ...(p.links || [])])].filter(k => k !== key && w.entities[k]);
  const base = [...all.filter(k => !S.pages[k]).slice(0, CHECK_RED_N), ...all.filter(k => S.pages[k]).slice(0, CHECK_REF_N)];
  const plain = [...(p.infobox || []).map(r => stripMarks(r.value)), ...p.sections.map(s => stripMarks(s.body))].join("\n");
  const named = Object.entries(w.entities).filter(([x]) => x !== key && !base.includes(x) && refNames(w, x).some(n => hasName(plain, n)))
    .sort((a, b) => (S.pages[a[0]] ? 1 : 0) - (S.pages[b[0]] ? 1 : 0)).slice(0, CHECK_NAMED_N).map(([x]) => x);   // 링크 없이 이름만 나온 항목도 대조한다. 문서 없는 항목 먼저
  return [...base, ...named];
}
/* 검사 1: 설정 대조. 문서가 세계관의 확정 설정과 어긋나는지만 엄격하게 본다 */
function checkPrompt(w, key, timelinePairs = timelineMatchPairs(w, key), sourceText = null) {
  const p = S.pages[key];
  const keys = checkKeys(w, key);
  const focus = docForCheck(p);   // 검사할 문서와 관련된 사실부터 넣는다. 최신순으로 자르면 기준이 되는 오래된 사실이 먼저 빠진다
  const ctx = keys.map(k => checkBrief(w, k, key, focus)).join("\n\n");
  const ok = src => refOK(src, p);
  const sources = sourceBlock(sourceText ?? checkSourceBatches(w, key)[0]);
  const own = [...promptFacts(w, key, w.entities[key].facts.filter(f => f.src !== key && live(f) && ok(f.src)), focus).map(f => "- " + factLine(f)), ...promptMentions(w, key, w.entities[key].mentions.filter(m => m.from !== key && live(m) && ok(m.from)), focus).map(m => `- 「${w.entities[m.from]?.title || "?"}」의 서술: ${m.text}`), ...relationsOf(w, key).filter(x => x.src !== key && live(x) && ok(x.src)).map(x => "- 관계: " + relLine(w, x))].join("\n");
  return `다음 위키 문서가 세계관의 확정 설정과 어긋나는지 검사하라. 문서 안의 앞뒤 모순은 다른 검사가 따로 보므로 여기서는 보지 않는다. 문체, 어투, 표현 방식은 지적하지 않는다.

## 대조 순서
1. 두 기록이 가리키는 대상·사건·조항을 맞춘다. 날짜나 이름 표현이 달라도 당사자·장소·경위·결과를 보면 같은 사건일 수 있다. 날짜가 다르다는 이유만으로 처음부터 별개로 보지 않는다.
2. 초안의 문장이 실제로 무엇을 주장하는지 확인한다. 값과 상태뿐 아니라 변화의 방향, 앞선 대상에서 이어받았다는 관계, 원인과 결과, 전체와 일부의 범위를 읽는다. 예를 들어 '어떤 값까지 내려갔다'는 말은 직전 값이 더 높았다는 주장을 포함한다. 평상시 값과 직전 값을 같다고 추정하지 않는다.
3. 기존 사건에 새 장면이 들어가면, 그 장면을 기존 시간순 기록에 끼워 넣는다. 시작·중단·재개 시점과 경과 시간을 맞춰 보고, 새 장면이 이미 확정된 이동·교전·결과를 바꾸는지 확인한다. 앞 문서에서 장면을 생략했다는 사실만으로는 지적하지 않는다.
4. 초안이 다른 문서나 확정 설정에 있는 조항·결정·기록을 근거로 들면, 해당 원문이 그 의무·금지·상한·인과관계를 실제로 뒷받침하는지 따로 대조한다. 이 문서가 그 조약·제도·기록 자체의 문서이면 그 조항의 내용은 이 문서가 정하는 것이므로 대조 대상이 아니다. 실제로 한 선택, 다른 조건과 합쳐 추론한 결과, 규정 자체가 강제한 것을 구분한다.

## 지적 기준
- claim과 evidence에 초안과 근거의 실제 구절을 인용한다. 출처가 주장을 뒷받침하지 않는 경우에는 초안이 지목한 조항이나 기록의 실제 내용을 evidence에 인용한다. 기억이나 짐작, 현실 역사에 기댄 지적은 하지 않는다.
- ${NUMBER_CHECK_RULE}
- [[대상|표시명]]에서는 대상과 표시명을 각각 확인한다. 직접 경험은 해당 시점의 현장 참석 근거를 확인한다. 생년월일과 사건 시점이 주어지면 가능한 만 나이 또는 날짜 범위를 계산한다.
- 원문끼리 엇갈리면 사용자 확정 설정과 사용자 수정 기록을 먼저 따른다.
- 같은 대상인지 먼저 확인한다: 확정 설정(연표, 원안, 다른 문서)에 이 문서의 대상과 같은 이름이 나오면, 그 기록의 날짜를 이 대상의 출생·생존 기간과 맞춰 본다. 그 시점에 이 대상이 아직 태어나지 않았거나 그 일을 할 수 없는 나이였다면 같은 대상이라고 단정하지 않는다. 그런 경우에는 이 문서를 그 기록에 맞추라고 하지 않고 severity low로 남긴다. claim에는 그 이름이 나오는 이 문서의 서술을, evidence에는 그 기록을 쓰고, conflict는 '같은 대상인지 확인 필요:'로 시작해 무엇이 맞지 않는지(예: 2001년이면 이 대상은 세 살)와 '다른 대상이면 문제없고, 같은 대상이면 그 기록을 고쳐야 한다'를 쓴다. 반대로 이 문서가 스스로 이 대상에게 불가능한 나이나 시점의 일을 붙였으면 그것은 이 문서의 오류이므로 high로 지적한다.
- 단독 문서가 없는 항목은 '관련 항목의 확정 설정'에 모은 다른 문서들의 서술이 기준이다. 이 문서가 그 항목의 계급·직위·연도·소속·인원·수치를 그 서술들과 다르게 쓰면 지적한다. 계급·직위처럼 시기에 따라 바뀌는 값은 같은 시점끼리 비교하고, 시점이 겹치지 않으면 진급·이동 순서가 앞뒤로 맞는지 본다. 기준 서술끼리 이미 엇갈려 어느 쪽인지 정할 수 없으면 low로 쓴다.
- '용어 정의와 공통 값'에 있는 종류 전체의 값(크기와 무게, 등급별 효과, 한계 수치)과 다른 값을 쓰면 high다. 경계는 이상·초과·이하·미만까지 같은지 본다(예: 정의는 '3등급 이상이면 버틴다'인데 문서는 '3등급 이하면 무릎 꿇는다'). '수천 톤'처럼 범위로 쓴 값은 그 범위가 공통 값과 겹치지 않을 때만 지적한다.
${ownerCheckRule(w, p)}- 같은 사건의 값·순서가 양립할 수 없거나, 지목한 조항의 내용과 초안이 그 조항에 귀속시킨 제한이 명백히 다르면 high. 예를 들어 명시된 상시 배치 상한을 해외 파견 상한이라고 단정한 경우가 그렇다.
- 시점이나 범위를 확인하면 양립할 수 있으면 지적하지 않는다. 확정 설정에 근거가 없다는 것만으로는 지적하지 않는다. 확정 설정이 정하지 않은 조항, 권한, 의무, 수치를 이 문서가 새로 정하는 것은 허용된다. 기록이 실제로 다른 내용을 말할 때만 지적한다. 한쪽에 서술이 빠졌다는 이유만으로 high로 올리지 않는다.
- 같은 조직·제도·기구를 관련 항목이나 연결된 문서와 다른 이름으로 부르면(예: 다른 문서는 '유엔 전략사찰단'인데 이 문서는 '유엔 전략소녀통제위원회') 같은 대상인지 역할·시기·구성으로 확인하고, 같은 대상이면 기존 이름으로 맞추라고 high로 지적한다. 실제로 다른 기구이면 지적하지 않는다.
- 지적할 것이 없는 것이 정상이다. 개수를 채우려고 지적하지 않는다.

${canonBlock({ ...w, timeline: (w.timeline || []).filter(t => t.src !== key && ok(t.src)) }, focus)}
${isStory(w) ? `\n${storyBlock(w, key)}\n${secretsBlock(w, "check")}\n이 문서는 ${p.baseAsOf || 1}~${p.syncedTo || p.baseAsOf || 1}장 시점에 작성되었다. 이 문서가 그 시점 이후의 일을 아는 것처럼 서술하면 모순으로 본다. 제목 앞에 [n장]이 붙은 섹션은 그 장에 일어난 일을 기록한 섹션이다.\n` : ""}
## 이 항목에 대해 다른 문서가 확정한 사실
${own || "(없음)"}

## 관련 항목의 확정 설정
${ctx || "(없음)"}

${sources}${eventCheckBlock(w, key, ok)}${rosterBlock(w, [key, ...keys], 30, true)}${periodBlock(w, [key, ...keys])}${isStory(w) ? "" : sharedNamesBlock(w, true)}
## 검사할 문서
${docForCheck(p, t => t)}

${timelinePairs.length ? `## 연표 대조
다음 각 쌍이 같은 한 번의 발생을 가리키는지 판단한다. 동일 사건의 다른 표현·관점이면 쌍 번호를 timelineSame에 넣는다. 별개 행위나 후속 사건이거나 확신할 수 없으면 넣지 않는다. 중복 자체는 모순 지적(issues)이 아니다. timelineSame에는 번호를 숫자로 쓰고, 없으면 빈 배열로 둔다.
${timelinePairs.map((x, i) => `${i + 1}. ${tlWhen(x.keep)}\n기존: ${x.keep.event}\n이 문서: ${x.drop.event}`).join("\n")}

${CHECK_ISSUE_JSON.replace('}]}', '}],"timelineSame":[1]}')}` : CHECK_ISSUE_JSON}`;
}
/* 문서 읽기 검사: 앱이 정한 사건(그 사건의 문서가 주인)을 이 문서가 한두 문장보다 길게 다시 썼는지. 찾으면 다듬을 곳으로 짚어 자동 수정이 줄인다 */
function restateCheckBlock(w, key) {
  if (isStory(w)) return "";
  const isEv = (S.pages[key]?.type || w.entities[key]?.type) === "사건", n = isEv ? "두세 문장" : "한두 문장";
  const p = S.pages[key], list = refEventKeys(w, key, [...new Set([...related(w, key), ...(p.links || [])])], docForCheck(p));
  return `## 다른 사건의 재서술 (앱이 정한 목록)
아래 사건은 각 사건의 문서가 주인이다(문서가 아직 없어도 같다). 이 문서에서는 ${isEv ? "그 사건이 이 사건의 흐름에서 어떤 의미였는지 두세 문장으로만 쓰고" : "이 항목이 그 사건에서 한 일을 한두 문장으로만 쓰고"} '자세한 내용은 [[사건]] 참고.'로 넘겨야 한다.
${list.length ? list.map(k => refEventLine(w, k)).join("\n") : "- (없음)"}
이 사건들을 다룬 문단이나 섹션마다 아래가 있는지 본다. 있으면 그 사건을 다룬 문단마다 하나씩 severity high로 지적하되, 할 일을 나눠 적는다. 그 사건을 다룬 첫 문단은 줄일 문단이고, 같은 사건을 다룬 나머지 문단과 그 사건 자리의 인용문은 지울 문단이다.
- 이 항목이 한 일 ${n}을 넘는 서술: 그 사건의 정확한 날짜·시각·경과 시간, 인원·거리·속도·피해 같은 수치, 단계별 경과, 다른 인물의 결정과 직위, 적이나 다른 부대의 이름과 화기.
- 참고 문구 앞이든 뒤든, 그 사건의 경과나 직후 상황(부상과 치료의 세부 포함)을 따로 이어 쓴 문단.
- 같은 섹션 안에서 같은 사건의 요약이 되풀이된 곳, 그 사건 자리에서 나온 인용문.
- 같은 사건의 '자세한 내용은 … 참고.' 문장이 문서 전체에서 두 번 이상 나온 곳: 그 사건을 다룬 섹션의 것 하나를 뺀 나머지 참고 문장마다 '재서술(참고 중복):'으로 시작하는 conflict로 high 지적한다. claim에는 그 참고 문장만 글자 그대로 쓴다.
claim에는 그 문단의 첫 문장(인용문이면 인용문)을 글자 그대로 쓰고, evidence에는 '참고로 넘길 사건: [[사건 이름]]'을 쓴다. 줄일 문단의 conflict는 '재서술(줄임):'으로 시작해 어느 사건의 문서가 주인인지와 이 문단을 이 항목이 한 일 ${n}과 참고 문구로 줄여야 한다는 것을 쓰고, 지울 문단의 conflict는 '재서술(지움):'으로 시작해 같은 사건이 이미 앞 문단에서 요약되므로 지워야 한다는 것을 쓴다.
목록에 없더라도, 사건 항목 없이 여러 세력이 얽힌 큰 일이나 실제 역사의 큰 사건(전쟁, 혁명, 체제 붕괴, 조약 체결, 재난 등)을 이 항목이 한 일 ${n}보다 길게 풀어 쓴 문단은 같은 방식으로 '재서술(줄임):'으로 짚는다. 이때 evidence에는 '사건 항목 없음: [[붙일 사건 이름]]'을 쓰고, conflict에 그 사건 이름을 적는다. 이 항목 혼자 겪은 일은 이 기준으로 지적하지 않는다. 개요의 첫 문장(이 항목이 무엇인지 밝히는 정의)과 인물 관계 항목은 재서술로 줄이거나 지우라고 짚지 않는다(참고 중복만 짚는다). 개요, 인물 관계, 현재처럼 다른 목적의 섹션이 그 사건을 ${n}으로 언급한 것은 재서술이 아니다. 그런 곳에 시각·수치·경과가 들어 있으면 지우지 말고 '재서술(줄임):'으로만 짚는다. 지울 문단은 그 사건을 다룬 섹션 안의 문단뿐이다.

`;
}
/* 문서 내부 검사용: 이 문서가 링크한 인물의 본명과 이명. 한 인물을 본명과 이명으로 번갈아 불러도 다른 인물로 읽지 않게 한다 */
function personNamesBlock(w, p) {
  const rows = [];
  for (const k of [...new Set(p.links || [])]) {
    const q = S.pages[k], e = w.entities[k];
    if (!q || !e || k === p.key || (q.type || e.type) !== "인물") continue;
    const names = infoboxNames(q).filter(n => identityName(n) !== identityName(q.title));
    if (names.length) rows.push(`- ${q.title}: ${names.slice(0, 6).join(", ")}`);
    if (rows.length >= 12) break;
  }
  const self = S.pages[p.key], own = self && (self.type === "인물") ? infoboxNames(self).filter(n => identityName(n) !== identityName(self.title)) : [];
  if (own.length) rows.unshift(`- ${self.title}(이 문서): ${own.slice(0, 6).join(", ")}`);
  return rows.length ? `## 이 문서에 나온 인물의 다른 이름 (같은 인물이다)
${rows.join("\n")}
본문에서 한 인물을 본명과 이 이름들로 번갈아 불러도 같은 인물이다. 본문의 [[대상|표시명]]에서 표시명은 대상 항목을 부른 이름이다.

` : "";
}
/* 검사 2: 문서 읽기. 설정 자료 없이 문서만 주고 편집자처럼 읽어 앞뒤가 안 맞는 곳을 찾게 한다 */
function readPrompt(w, key) {
  const p = S.pages[key];
  return `## 문서 읽기 검사
너는 위키 편집자다. 아래 문서 하나를 처음부터 끝까지 꼼꼼히 읽고, 문서 안에서 앞뒤가 안 맞는 곳을 찾아라. 이 문서는 가상 세계의 백과사전 문서이며 작중 기준 시점은 ${w.era}이다. 세계관 설정과의 대조는 다른 검사가 하므로, 여기서는 이 문서 안의 서술끼리만 맞춰 본다. 문체, 어투, 표현 방식은 지적하지 않는다.

특히 이런 곳을 본다.
- 같은 사건을 섹션마다 다르게 쓴 곳: 누가 했는지, 언제, 어디서, 어떻게, 결과(예: 한 섹션에서는 친구가 쐈는데 다른 섹션에서는 주인공이 쏜 것으로 씀).
- 같은 인물이나 관계를 섹션마다 다르게 소개한 곳(만난 시기, 헤어진 이유, 생사, 직위).
- 한 줄 정의, 분류, 인포박스, 섹션 제목이 본문과 어긋나는 곳(예: 분류는 '주요 조직원'인데 인포박스는 '무소속', 제목은 '산탄총잡이'인데 본문은 권총만 씀).
- 앞에서 정한 능력, 한계, 제약과 뒤의 실제 행적이 맞지 않는 곳(예: 120km 넘게 걷지 못한다고 해 놓고 사막을 크게 우회하는 대기동을 손실 없이 해냄, 장갑 구성에 없던 부품이 다른 섹션에 나옴).
- 그 시점 대상의 크기, 무게, 몸 상태로는 불가능한 장소, 도구, 이동, 치료(예: 신장 80m인 상태로 일반 병원 중환자실에 옮겨짐, 거체가 건물 안 회의실에 들어감). 크기가 바뀌는 대상이면 그 장면에서 어느 크기였는지 문서의 서술로 확인하고, 아래 핵심 규칙과 공통 값도 함께 본다. 이런 곳은 severity high다.
- 문서가 기준표나 등급·단계 기준(예: 몇 등급은 시속 몇 km 이상)을 정했으면, 문서 안에 나온 사례의 수치를 그 기준에 하나씩 대입해 본다. 사례의 등급과 수치가 기준과 맞지 않으면 high다.
- 연도가 붙은 장면에서 문서가 다른 곳에 밝힌 시작 시점(제정, 체결, 도입, 창설)보다 앞서 그 제도나 체계를 따르거나 쓴 곳. 나중에 소급했다고 밝힌 곳은 지적하지 않는다.
- 국어사전에 없는 낱말이나 오타로 보이는 조어(예: '심의'를 '심열'로 씀, 문맥에 맞지 않는 '초빙 훈련' 같은 결합). claim에 그 낱말이 든 서술을, conflict에 원래 쓰려던 말로 보이는 것을 적는다. 이런 곳은 severity high로 써서 작성 직후 자동으로 고치게 한다. 이 세계에서 정한 고유 용어는 지적하지 않는다.
- 이 세계의 용어를 아래 '용어 정의'와 다른 뜻으로 쓴 곳(예: 정의는 대대로 물려받는 칭호인데 한 사람의 이름처럼 씀, 번호 체계가 정의와 다름). evidence에는 정의를 옮긴다.
- 연도·나이·학년·기수·재직 기간이 서로 맞지 않는 곳(예: 기준 시점에 1학년인 인물이 그보다 2년 전에 이미 그 학교 학생으로 활동함).
- 날짜·나이·시간이 나오면 먼저 그 시점의 상태를 말하는지, 그 시점에 상태가 바뀌었다고 말하는지 읽는다. 생일이 주어졌으면 사건 당시 나이와 그 나이가 된 날짜를 구분해 계산한다.
- 같은 사건의 시작·중단·재개·종료를 시간순으로 놓고, 주장된 지속 시간이 그 사이에 실제로 들어가는지 계산한다. 날짜가 범위로 주어졌으면 가능한 범위에서도 성립하는지 확인한다. 예를 들어 출발 당일 정오에 멈췄다면 그날 아침부터 하루가 넘게 계속 움직였을 수는 없다.
- 인원, 횟수, 탄수, 금액처럼 서로 맞아야 하는 숫자가 어긋나는 곳.
- ${NUMBER_CHECK_RULE}
- 문장 하나가 스스로 말이 안 되는 곳(예: "귀환한 400명 중 절반만 살아남았다", 위원회 소속 로비스트).
- 부정어가 겹치거나 엉뚱하게 붙어 뜻이 앞뒤 문맥과 반대로 뒤집힌 곳(예: 모든 처치를 받아들였다는 대목인데 "일체의 약물 거부 없이"처럼 써서 거부했다는 뜻과 섞임, "~하지 않을 수 없었다"를 하지 않았다는 뜻으로 씀).
- 같은 조직·제도·장소를 섹션마다 다른 이름으로 부른 곳(예: 같은 감시 기구를 한 곳에서는 '사찰단', 다른 곳에서는 '통제위원회'라 부름).

## 반드시 맞춰 볼 것 (앱이 찾은, 이 문서의 두 곳 이상에 나오는 대상과 그 위치)
${crossRefs(w, p) || "(없음)"}
위 대상마다 적힌 위치들의 서술을 생각하는 단계에서 나란히 놓고 맞춰 본다. 분류는 항목 하나하나를 인포박스와 본문에 맞춰 본다. 대조 과정은 출력하지 않고, 찾은 것만 issues에 쓴다.

## 지적 기준
- claim과 evidence에는 어긋나는 두 서술을 문서에서 글자 그대로 옮긴다(한 문장이 스스로 말이 안 되면 evidence에 그 문장의 어느 부분이 왜 안 맞는지 적는다). 문서에서 인용할 수 없으면 지적하지 않는다.
- 둘이 동시에 참일 수 없는 것이 분명하면 severity high.
- 날짜·나이·기간 계산이 근거라면 conflict에 어떤 시점과 값을 비교했는지 적는다. 날짜 범위가 불명확해도 가능한 경우가 하나라도 있으면 계산만으로 high로 올리지 않는다.
- 둘 다 참일 수는 있지만 독자가 모순으로 읽기 쉬운 곳은 severity low로 쓰고, conflict에 어떻게 읽으면 둘 다 참이 되는지도 적는다.
- 지적할 것이 없는 것이 정상이다. 개수를 채우려고 지적하지 않는다.

${eventBeatsCheckBlock(w, key)}${restateCheckBlock(w, key)}${personNamesBlock(w, p)}${(w.rules || []).length ? `## 핵심 규칙 (크기·능력·제약을 맞춰 볼 때만 쓴다. 규칙과 문서의 대조 자체는 다른 검사가 한다)\n${w.rules.map(r => "- " + r).join("\n")}\n\n` : ""}${(() => { const g = glossaryBlock(w, docForCheck(p)); return g ? g + "\n\n" : ""; })()}## 문서
${docForCheck(p, t => t)}

${ISSUE_JSON}`;
}
