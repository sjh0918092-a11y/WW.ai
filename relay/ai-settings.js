/* 큐에서 사용자 AI 설정의 허용 범위만 검사한다. 키·서버 주소는 입력에 허용하지 않는다. */
const TASKS=['bible','storyBible','page','check','read','fix','factSync','analyze','section','discovery','angles','prose','chapterPlan','chapterBlock','choices','tone','ageRule','timelineDate','cats','relMigrate','worldCheck'];
const FLAGS=['seed','rules','canon','stage','timeline','fixedTimeline','facts','userFacts','mentions','related','relatedSummary','relatedBox','relatedFacts','index','relations','events','quotes','glossary','nav','categories','sameEvents','life','traits','gaps','guidelines'];
const COUNTS=['timelineCount','factsCount','mentionsCount','relatedCount','relatedFactsCount','indexCount','relationsCount','eventsCount','quotesCount','glossaryCount','navCount','categoriesCount','sameEventsCount','lifeCount','traitsCount'];
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const model=x=>x===''||typeof x==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(x)&&!/image|tts|live|audio|embedding|transcribe|robotics/i.test(x);
export function validTaskModels(raw){return raw===undefined||plain(raw)&&Object.entries(raw).every(([k,v])=>TASKS.includes(k)&&plain(v)&&Object.keys(v).every(f=>['model','think'].includes(f))&&model(v.model)&&['inherit','','none','minimal','low','medium','high','xhigh','max'].includes(v.think))}
export function validPromptOptions(raw){return raw===undefined||plain(raw)&&Object.entries(raw).every(([k,v])=>FLAGS.includes(k)?typeof v==='boolean':COUNTS.includes(k)&&Number.isInteger(v)&&v>=0&&v<=500)}
