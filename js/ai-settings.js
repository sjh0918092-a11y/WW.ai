"use strict";
/* 작업 배정과 문서 작성 입력의 사용자 설정. 브라우저·서버 엔진에서 함께 사용한다. */
const AI_TASKS = [
 ["bible","세계관 기본 설정"],["storyBible","스토리 기본 설정"],["page","문서 작성"],["preWrite","작성 전 점검"],
 ["check","설정 검사"],["read","문서 내부 검사"],["fix","충돌 고치기"],
 ["factSync","확정 사실·관계·분류 정리"],["analyze","직접 편집한 문서의 설정 대조"],
 ["section","문단 다시 쓰기"],["discovery","새 대상 탐색"],["angles","각도 목록"],
 ["storyCast","대화 인물 준비"],["storyChat","등장인물 대화"],["storyChatReview","중요 대화 검토"],
 ["prose","단편 쓰기"],["chapterPlan","장 계획"],["chapterBlock","장 섹션 작성"],["choices","행동 후보"],
 ["tone","분위기 판별"],["ageRule","나이 규칙 해석"],["timelineDate","연표 날짜 보완"],["timelineCheck","연표 점검"],
 ["cats","분류 정리"],["relMigrate","기존 인물 관계 정리"],["worldCheck","세계 전체 점검"]
];
const AI_PROMPT_FIELDS = [
 ["seed","세계관 원안",true],["rules","핵심 규칙",true],["canon","사용자 확정 설정",true],["stage","주요 단위·현재 상황",true],
 ["timeline","연표",true,"timelineCount",48],["fixedTimeline","원안·사용자 수정 연표도 포함",true],
 ["facts","대상의 확정 사실",true,"factsCount",40],["userFacts","사용자 확정 사실도 포함",true],
 ["mentions","다른 문서의 대상 언급",true,"mentionsCount",30],
 ["related","관련 항목",true,"relatedCount",8],["relatedSummary","관련 항목 요약",true],["relatedBox","관련 항목 인포박스",true],
 ["relatedFacts","관련 항목의 사실",true,"relatedFactsCount",6],
 ["ownerText","관련 항목 문서의 해당 대목",true,"ownerTextCount",8],["roster","소속 구성원 현황",true,"rosterCount",30],
 ["index","기존 항목 제목·요약 목록",true,"indexCount",60],
 ["relations","기존 인물 관계",true,"relationsCount",24],["events","사건 장부",true,"eventsCount",40],
 ["quotes","기록된 발언",true,"quotesCount",8],["glossary","용어 정의",true,"glossaryCount",40],
 ["sameEvents","같은 유형의 사건 참고",true,"sameEventsCount",8],
 ["nav","안내 틀 자료 (틀별 항목 수)",true,"navCount",40],["categories","기존 분류 목록",true,"categoriesCount",30],["life","인물 생애 흐름",true,"lifeCount",3],
 ["traits","다른 인물 특징 참고",true,"traitsCount",30],["gaps","세계의 빈자리 참고",true],["guidelines","공통 작성 지침",true]
];
function isOpenAITextModel(id){return typeof id==="string"&&/^(?:gpt-(?:4(?:\.1|o)(?:-[A-Za-z0-9._-]+)?|[5-9][A-Za-z0-9._-]*)|o[3-9](?:-[A-Za-z0-9._-]+)?)$/.test(id)&&!/image|audio|realtime|transcribe|tts|search|deep-research/i.test(id)}
function openAIThinkingLevels(model){
 if(!isOpenAITextModel(model)||/^gpt-4/.test(model))return [];
 const levels=["low","medium","high"];
 if(/^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(model))levels.unshift("minimal");
 else if(/^gpt-(?:5\.[1-9]|[6-9])/.test(model)&&!/^gpt-(?:6-astra|6\.1-sol)/.test(model))levels.unshift("none");
 if(/^gpt-(?:5\.[2-9]|[6-9])/.test(model))levels.push("xhigh");if(/^gpt-[6-9]/.test(model))levels.push("max");
 if(/^gpt-5-pro(?:-|$)/.test(model))return ["high"];
 return /-pro(?:-|$)/.test(model)?levels.filter(x=>["medium","high","xhigh","max"].includes(x)):levels;
}
const AI_THINK_VALUES=["inherit","","none","minimal","low","medium","high","xhigh","max"];
function normalizeTaskModels(raw={}) {
 const out={};for(const [kind]of AI_TASKS){const v=raw?.[kind];if(!v||typeof v!=="object")continue;
  const model=typeof v.model==="string"&&/^[A-Za-z0-9._-]{1,100}$/.test(v.model)&&!/image|tts|live|audio|embedding|transcribe|robotics/i.test(v.model)?v.model:"";
  const think=AI_THINK_VALUES.includes(v.think)?v.think:"inherit";
  if(model||think!=="inherit")out[kind]={model,think};
 }return out;
}
function normalizePromptOptions(raw={}) {
 const out={};for(const [key,,enabled,count,def]of AI_PROMPT_FIELDS){out[key]=typeof raw?.[key]==="boolean"?raw[key]:enabled;
  if(count)out[count]=Number.isInteger(raw?.[count])?Math.max(0,Math.min(500,raw[count])):def;
 }return out;
}
function writingOptions(){return normalizePromptOptions(GS.prompt)}
/* 따로 정하지 않으면 다른 작업의 배정을 따르는 작업: 작성 전 점검은 문서 작성과 같은 모델·생각 수준 */
const TASK_INHERIT={preWrite:"page"};
function taskSelection(kind,tier="main",settings=GS){
 tier=tier==="quick"?"quick":tier==="check"?"check":"main";
 const tasks=normalizeTaskModels(settings.taskModels),own=tasks[kind]||{},parent=TASK_INHERIT[kind]?tasks[TASK_INHERIT[kind]]||{}:{};
 const task={model:own.model||parent.model||"",think:own.think&&own.think!=="inherit"?own.think:parent.think&&parent.think!=="inherit"?parent.think:own.think??parent.think};
 return {model:task.model||(tier==="check"?settings.check||settings.main||GDEF.main:settings[tier]||GDEF[tier]),think:task.think&&task.think!=="inherit"?task.think:task.think===""?"":(tier==="check"?settings.checkThink??GDEF.checkThink:settings[tier+"Think"])||""};
}
function normalizeModelCatalog(raw={}) {
 const out={};for(const provider of ["gemini","claude","openai"]){if(!Array.isArray(raw?.[provider]))continue;
  const ids=new Map();for(const m of raw[provider])if(m&&typeof m.id==="string"&&(provider==="openai"?isOpenAITextModel(m.id):(provider==="gemini"?/^gemini-[A-Za-z0-9._-]{1,100}$/:/^claude-[A-Za-z0-9._-]{1,100}$/).test(m.id)))ids.set(m.id,{id:m.id,label:typeof m.label==="string"?m.label.slice(0,150):m.id});
  out[provider]=[...ids.values()].slice(0,500);
 }return out;
}
const AI_EXPORT_FIELDS=["main","mainThink","quick","quickThink","check","checkThink","preCheck","imageModel","serverJobs","documentPipeline"];
function aiSettingsFile(){return {format:"worldwiki-ai-settings",version:1,settings:{...Object.fromEntries(AI_EXPORT_FIELDS.map(k=>[k,GS[k]])),taskModels:normalizeTaskModels(GS.taskModels),prompt:writingOptions(),modelCatalog:normalizeModelCatalog(GS.modelCatalog)}}}
function parseAISettingsFile(value){
 const plain=o=>o&&typeof o==="object"&&!Array.isArray(o);
 if(!plain(value)||value.format!=="worldwiki-ai-settings"||value.version!==1||!plain(value.settings))throw new Error("WorldWiki AI 설정 파일을 선택해 주세요.");
 const raw=value.settings,allowed=new Set([...AI_EXPORT_FIELDS,"taskModels","prompt","modelCatalog"]);
 if(Object.keys(raw).some(k=>!allowed.has(k)))throw new Error("알 수 없는 설정 항목이 있습니다.");
 const out={};
 for(const k of AI_EXPORT_FIELDS){if(raw[k]===undefined)continue;const v=raw[k];
  const valid=["preCheck","serverJobs","documentPipeline"].includes(k)?typeof v==="boolean":k.endsWith("Think")?AI_THINK_VALUES.slice(1).includes(v):typeof v==="string"&&(k==="check"&&v===""||/^[A-Za-z0-9._-]{1,100}$/.test(v))&& (k==="imageModel"?!/tts|live|audio|embedding|transcribe|robotics/i.test(v):!/image|tts|live|audio|embedding|transcribe|robotics/i.test(v));
  if(!valid)throw new Error("설정값을 확인해 주세요: "+k);out[k]=v;
 }
 if(raw.taskModels!==undefined){if(!plain(raw.taskModels)||Object.entries(raw.taskModels).some(([k,v])=>!AI_TASKS.some(([id])=>id===k)||!plain(v)||Object.keys(v).some(f=>!["model","think"].includes(f))||typeof v.model!=="string"||v.model!==""&&(!/^[A-Za-z0-9._-]{1,100}$/.test(v.model)||/image|tts|live|audio|embedding|transcribe|robotics/i.test(v.model))||!AI_THINK_VALUES.includes(v.think)))throw new Error("작업별 모델 설정을 확인해 주세요.");out.taskModels=normalizeTaskModels(raw.taskModels)}
 if(raw.prompt!==undefined){const defs=normalizePromptOptions();if(!plain(raw.prompt)||Object.entries(raw.prompt).some(([k,v])=>!Object.hasOwn(defs,k)||(typeof defs[k]==="boolean"?typeof v!=="boolean":!Number.isInteger(v)||v<0||v>500)))throw new Error("작성 입력 설정을 확인해 주세요.");out.prompt=normalizePromptOptions(raw.prompt)}
 if(raw.modelCatalog!==undefined){const c=raw.modelCatalog;if(!plain(c)||Object.keys(c).some(k=>!["gemini","claude","openai"].includes(k))||Object.entries(c).some(([provider,rows])=>!Array.isArray(rows)||rows.length>500||rows.some(m=>!plain(m)||Object.keys(m).some(k=>!["id","label"].includes(k))||typeof m.label!=="string"||m.label.length>150||typeof m.id!=="string"||!(provider==="openai"?isOpenAITextModel(m.id):(provider==="gemini"?/^gemini-[A-Za-z0-9._-]{1,100}$/:/^claude-[A-Za-z0-9._-]{1,100}$/).test(m.id)))))throw new Error("모델 목록을 확인해 주세요.");}
 out.modelCatalog=normalizeModelCatalog(raw.modelCatalog);
 return out;
}
