/* D1 원본의 단조 증가 버전과, 작업 번호별 원자적 저장. */
export function pipelineSchema(db) {
  const sql = [
    "CREATE TABLE IF NOT EXISTS world_versions (uid TEXT NOT NULL, wid TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(uid,wid))",
    "CREATE TABLE IF NOT EXISTS pipeline_commits (uid TEXT NOT NULL, job TEXT NOT NULL, wid TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, PRIMARY KEY(uid,job))",
  ];
  for (const table of ["worlds", "pages"]) for (const action of ["INSERT", "UPDATE", "DELETE"]) {
    const ref = action === "DELETE" ? "OLD" : "NEW";
    const when = action === "UPDATE" ? " WHEN OLD.data IS NOT NEW.data OR OLD.deleted IS NOT NEW.deleted OR OLD.updated IS NOT NEW.updated" : "";
    sql.push(`CREATE TRIGGER IF NOT EXISTS pipeline_${table}_${action.toLowerCase()} AFTER ${action} ON ${table}${when} BEGIN INSERT INTO world_versions(uid,wid,version) VALUES(${ref}.uid,${ref}.wid,1) ON CONFLICT(uid,wid) DO UPDATE SET version=version+1; END`);
  }
  return sql.map(s => db.prepare(s));
}
const canonical = v => v && typeof v === "object" ? Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const digest = async v => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(v)))))].map(n => n.toString(16).padStart(2,"0")).join("");
export function sourcePage(p) { if (!p) return null; const out = { ...p }; delete out.portrait; delete out.shortStories; delete out.savedAt; return out; }
const fault = (code, message) => Object.assign(new Error(message), { code, safeMessage: message, definite: true });
export async function snapshotWorld(db, uid, input) {
  const r = await db.batch([
    db.prepare("SELECT version FROM world_versions WHERE uid=? AND wid=?").bind(uid,input.wid),
    db.prepare("SELECT data,updated FROM worlds WHERE uid=? AND wid=? AND deleted=0").bind(uid,input.wid),
    db.prepare("SELECT pkey,json_remove(data,'$.portrait','$.shortStories') AS data,updated FROM pages WHERE uid=? AND wid=? AND deleted=0 ORDER BY pkey LIMIT 1501").bind(uid,input.wid),
  ]);
  const w = r[1].results?.[0];
  if (!w) throw fault("source_deleted", "세계관이 없거나 삭제되어 시작하지 않았습니다.");
  if (r[2].results.length > 1500) throw fault("snapshot_limit", "문서가 1,500개를 넘는 세계관은 개별 서버 작업을 이용해 주세요.");
  const world = JSON.parse(w.data), pages = {}, updated = {};
  for (const row of r[2].results) { pages[row.pkey] = sourcePage(JSON.parse(row.data)); updated[row.pkey] = row.updated; }
  if (world.id !== input.wid || !world.entities || (await digest(world)) !== input.worldHash || (await digest(pages[input.key] || null)) !== input.pageHash) throw fault("source_stale", "접수 전 원본이 바뀌었습니다. 동기화한 뒤 다시 시작해 주세요.");
  if (!world.entities[input.key] && !input.entity) throw fault("source_deleted", "대상 항목이 없어 시작하지 않았습니다.");
  if (input.action === "check" && !pages[input.key]) throw fault("source_deleted", "검사할 문서가 없습니다.");
  const snapshot = { world, pages, version: r[0].results?.[0]?.version || 0, updated, worldUpdated: w.updated };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 8 * 1024 * 1024) throw fault("snapshot_limit", "세계관이 한 번의 서버 문서 작업에 담기에는 큽니다. 개별 서버 작업을 이용해 주세요.");
  return snapshot;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const plain = v => v && typeof v === "object" && !Array.isArray(v);
const CONFLICT = Symbol("conflict");
/* 문서마다 항목을 덧붙이는 장부 목록은 항목 단위로 합친다. 항목을 구별하는 값(출처 문서 포함)이 같으면 같은 항목이다.
   경로는 키 이름의 배열이며 "*"는 아무 키(항목 키)다. 나머지 배열은 순서·내용이 뜻을 가지므로 통째로 비교한다 */
const LEDGERS = [
  [["timeline"], t => [t.src, t.ch ?? "", t.year, t.event]],
  [["events"], x => [x.k, x.src]],
  [["relations"], x => [x.a, x.b, x.rel, x.src, x.prev ?? 0]],
  [["glossary"], g => [String(g.term || "").replace(/\s/g, "").toLowerCase()]],
  [["nameTwins"], t => [t.a, t.b].sort()],
  [["entities", "*", "facts"], f => [f.src, f.t]],
  [["entities", "*", "mentions"], m => [m.from, m.text]],
  [["entities", "*", "cats"], c => [c.name, c.axis ?? ""]],
  [["autoConflicts"], c => [c.by, c.old]],
  [["autoDismissed"], c => [c.by, c.old]],
  [["conflicts"], c => [c.by, c.old]],
];
const ledgerAt = path => LEDGERS.find(([p]) => p.length === path.length && p.every((x, i) => x === "*" || x === path[i]))?.[1] || null;
/* 같은 값이 둘 이상이면 몇 번째인지까지 붙여 구별한다 */
function keyed(list, idOf) {
  const seen = new Map(), out = new Map();
  for (const item of list) { const id = JSON.stringify(item && typeof item === "object" ? idOf(item) : item), n = seen.get(id) || 0; seen.set(id, n + 1); out.set(id + "#" + n, item); }
  return out;
}
function mergeLedger(base, ours, theirs, idOf, path) {
  const B = keyed(Array.isArray(base) ? base : [], idOf), O = keyed(ours, idOf), T = keyed(theirs, idOf), out = [];
  for (const [id, t] of T) {
    if (!O.has(id)) {
      if (!B.has(id)) { out.push(t); continue; }       // 그사이 원본이 더한 항목
      if (same(B.get(id), t)) continue;                 // 작업이 지운 항목(그사이 원본은 그대로)
      return CONFLICT;                                  // 작업이 지운 항목을 원본이 고쳤다
    }
    const v = merge3(B.get(id), O.get(id), t, [...path, "#"]);
    if (v === CONFLICT) return CONFLICT;
    out.push(v);
  }
  for (const [id, o] of O) {
    if (T.has(id)) continue;
    if (!B.has(id)) { out.push(o); continue; }          // 작업이 더한 항목
    if (!same(B.get(id), o)) return CONFLICT;           // 원본이 지운 항목을 작업이 고쳤다
  }
  return out;
}
// 3방향 병합: 작업이 바꾸지 않은 부분은 그사이 바뀐 원본을, 원본이 바뀌지 않은 부분은 작업 결과를 쓴다.
// 객체는 키 단위로 내려가고, 장부 목록은 항목 단위로, 나머지 배열·값은 통째로 비교한다. 양쪽이 같은 곳을 다르게 바꾸면 충돌이다.
export function merge3(base, ours, theirs, path = [], fresh = false) {
  if (same(ours, theirs) || same(base, theirs)) return ours;
  if (same(base, ours)) return theirs;
  const idOf = Array.isArray(ours) && Array.isArray(theirs) ? ledgerAt(path) : null;
  if (idOf) return mergeLedger(base, ours, theirs, idOf, path);
  if (path.length === 1 && path[0] === "relSeq" && Number.isInteger(ours) && Number.isInteger(theirs)) return Math.max(ours, theirs);   // 관계 번호는 큰 쪽(겹친 번호는 아래에서 다시 매긴다)
  // 두 작업이 같은 새 항목(빨간 링크)을 각자 만들며 요약·유형 같은 칸을 다르게 채웠으면 먼저 저장된 쪽을 둔다
  if (fresh && path.length === 3 && !plain(ours) && !plain(theirs) && !Array.isArray(ours) && !Array.isArray(theirs)) return theirs;
  if (!plain(ours) || !plain(theirs)) return CONFLICT;
  const b = plain(base) ? base : {}, out = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const v = merge3(b[k], ours[k], theirs[k], [...path, k], fresh || (path.length === 1 && path[0] === "entities" && b[k] === undefined));
    if (v === CONFLICT) return CONFLICT;
    if (v !== undefined) out[k] = v;
  }
  return out;
}
/* 두 작업이 각자 새 관계에 같은 번호를 붙였으면 작업 쪽 새 관계의 번호를 다시 매긴다(prev 참조도 함께) */
export function renumberRelations(base, ours, merged) {
  if (!Array.isArray(merged?.relations)) return merged;
  const baseIds = new Set((base?.relations || []).map(x => x.id)), mine = new Set((ours?.relations || []).filter(x => !baseIds.has(x.id)).map(x => JSON.stringify([x.a, x.b, x.rel, x.src, x.prev ?? 0])));
  const count = new Map(); for (const x of merged.relations) count.set(x.id, (count.get(x.id) || 0) + 1);
  let seq = Math.max(merged.relSeq || 0, ...merged.relations.map(x => x.id || 0)); const remap = new Map();
  const relations = merged.relations.map(x => {
    if (count.get(x.id) > 1 && mine.has(JSON.stringify([x.a, x.b, x.rel, x.src, x.prev ?? 0]))) { count.set(x.id, count.get(x.id) - 1); remap.set(x.id, ++seq); return { ...x, id: seq }; }
    return x;
  }).map(x => x.prev && remap.has(x.prev) && mine.has(JSON.stringify([x.a, x.b, x.rel, x.src, x.prev])) ? { ...x, prev: remap.get(x.prev) } : x);
  return remap.size ? { ...merged, relations, relSeq: seq } : merged;
}
const bare = w => { const { updatedAt, ...rest } = w || {}; return rest; };
export async function commitDocument(db, uid, id, snapshot, output) {
  if (Object.keys(output.pages).length + output.removed.length > 40) throw fault("commit_limit", "한 문서 작업에서 바뀐 문서가 너무 많아 초안으로 보관했습니다.");
  const wid = snapshot.world.id, touched = [...new Set([...Object.keys(output.pages), ...output.removed])];
  // 작업 중 원본 버전이 바뀌었으면 실제 내용을 비교해 겹치지 않는 변경은 합친다. 경쟁이 생기면 몇 번 다시 시도한다.
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await db.batch([
      db.prepare("SELECT applied FROM pipeline_commits WHERE uid=? AND job=?").bind(uid,id),
      db.prepare("SELECT version FROM world_versions WHERE uid=? AND wid=?").bind(uid,wid),
      db.prepare("SELECT data,updated FROM worlds WHERE uid=? AND wid=? AND deleted=0").bind(uid,wid),
      ...touched.map(k => db.prepare("SELECT json_remove(data,'$.portrait','$.shortStories') AS data,updated FROM pages WHERE uid=? AND wid=? AND pkey=? AND deleted=0").bind(uid,wid,k)),
    ]);
    if (r[0].results?.[0]) return r[0].results[0].applied === 1;   // 같은 작업 번호로 이미 저장됨(재시작)
    const row = r[2].results?.[0];
    if (!row) return false;
    const version = r[1].results?.[0]?.version || 0;
    let world = bare(output.world), pageUpdated = [], pages = output.pages;
    if (version !== snapshot.version) {
      pages = { ...output.pages };
      for (let i = 0; i < touched.length; i++) {
        const key = touched[i], cur = r[3 + i].results?.[0], now = cur ? sourcePage(JSON.parse(cur.data)) : null, before = snapshot.pages[key] || null;
        if (cur) pageUpdated.push(cur.updated);
        if (same(now, before)) continue;
        // 이 작업이 쓰는 문서를 그사이 누가 고쳤다. 지운 문서·지워진 문서는 합치지 않는다.
        // 본문이 아니라 수정 요청 표시 같은 장부만 서로 다르게 더했으면 항목 단위로 합치고, 같은 곳을 다르게 고쳤으면 초안으로 보관한다
        if (!now || !before || !pages[key]) return false;
        const merged = merge3(before, sourcePage(pages[key]), now);
        if (merged === CONFLICT) return false;
        pages[key] = merged;
      }
      const base = bare(snapshot.world);
      world = merge3(base, world, bare(JSON.parse(row.data)));
      if (world === CONFLICT) return false;
      world = renumberRelations(base, bare(output.world), world);
    }
    if (await writeCommit(db, uid, id, snapshot, { ...output, pages }, world, version, [row.updated, ...pageUpdated])) return true;
  }
  return false;
}
async function writeCommit(db, uid, id, snapshot, output, merged, version, seen) {
  const wid = snapshot.world.id;
  const at = Math.max(Date.now(), snapshot.worldUpdated + 1, ...Object.values(snapshot.updated).map(t => t + 1), ...seen.map(t => t + 1));
  let stamp = Date.now() * 1000;
  const world = { ...merged, updatedAt: at };
  const gate = "EXISTS(SELECT 1 FROM pipeline_commits WHERE uid=? AND job=? AND applied=0)";
  const st = [db.prepare(`INSERT INTO pipeline_commits(uid,job,wid,applied,created) SELECT ?,?,?,0,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?) AND EXISTS(SELECT 1 FROM worlds WHERE uid=? AND wid=? AND deleted=0) AND COALESCE((SELECT version FROM world_versions WHERE uid=? AND wid=?),0)=? ON CONFLICT(uid,job) DO NOTHING`).bind(uid,id,wid,at,uid,uid,wid,uid,wid,version),
    db.prepare(`UPDATE worlds SET data=?,updated=?,stamp=? WHERE uid=? AND wid=? AND ${gate}`).bind(JSON.stringify(world),at,stamp++,uid,wid,uid,id)];
  for (const [key, value] of Object.entries(output.pages)) {
    const data = JSON.stringify({ ...sourcePage(value), savedAt: at });
    // 기존 이미지·단편은 DB의 원본에서 보존한다. 엔진 입력에는 포함하지 않는다.
    st.push(db.prepare(`INSERT INTO pages(uid,wid,pkey,data,updated,deleted,stamp) SELECT ?,?,?,?, ?,0,? WHERE ${gate} ON CONFLICT(uid,wid,pkey) DO UPDATE SET data=json_patch(excluded.data, json_remove(json_object('portrait',json_extract(pages.data,'$.portrait'),'shortStories',json_extract(pages.data,'$.shortStories')), CASE WHEN json_type(pages.data,'$.portrait') IS NULL THEN '$.portrait' ELSE '$.unused_pipeline' END, CASE WHEN json_type(pages.data,'$.shortStories') IS NULL THEN '$.shortStories' ELSE '$.unused_pipeline' END)),updated=excluded.updated,deleted=0,stamp=excluded.stamp`).bind(uid,wid,key,data,at,stamp++,uid,id));
  }
  for (const key of output.removed) st.push(db.prepare(`UPDATE pages SET data=NULL,deleted=1,updated=?,stamp=? WHERE uid=? AND wid=? AND pkey=? AND ${gate}`).bind(at,stamp++,uid,wid,key,uid,id));
  st.push(db.prepare("UPDATE pipeline_commits SET applied=1 WHERE uid=? AND job=? AND applied=0").bind(uid,id));
  st.push(db.prepare("SELECT applied FROM pipeline_commits WHERE uid=? AND job=?").bind(uid,id));
  // D1 batch는 전부 한 트랜잭션. 기록과 문서 변경은 함께 성공하거나 함께 취소된다.
  const result = await db.batch(st);
  return result.at(-1).results?.[0]?.applied === 1;
}
