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
  if (world.id !== input.wid || !world.entities || (await digest(world)) !== input.worldHash || (await digest(pages[input.key] || null)) !== input.pageHash) throw fault("source_changed", "접수 전 원본이 바뀌었습니다. 동기화한 뒤 다시 시작해 주세요.");
  if (!world.entities[input.key] && !input.entity) throw fault("source_deleted", "대상 항목이 없어 시작하지 않았습니다.");
  if (input.action === "check" && !pages[input.key]) throw fault("source_deleted", "검사할 문서가 없습니다.");
  const snapshot = { world, pages, version: r[0].results?.[0]?.version || 0, updated, worldUpdated: w.updated };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 8 * 1024 * 1024) throw fault("snapshot_limit", "세계관이 한 번의 서버 문서 작업에 담기에는 큽니다. 개별 서버 작업을 이용해 주세요.");
  return snapshot;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const plain = v => v && typeof v === "object" && !Array.isArray(v);
const CONFLICT = Symbol("conflict");
// 3방향 병합: 작업이 바꾸지 않은 부분은 그사이 바뀐 원본을, 원본이 바뀌지 않은 부분은 작업 결과를 쓴다.
// 객체는 키 단위로 내려가고 배열·값은 통째로 비교한다. 양쪽이 같은 곳을 다르게 바꾸면 충돌이다.
export function merge3(base, ours, theirs) {
  if (same(ours, theirs) || same(base, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (!plain(ours) || !plain(theirs)) return CONFLICT;
  const b = plain(base) ? base : {}, out = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const v = merge3(b[k], ours[k], theirs[k]);
    if (v === CONFLICT) return CONFLICT;
    if (v !== undefined) out[k] = v;
  }
  return out;
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
    let world = bare(output.world), pageUpdated = [];
    if (version !== snapshot.version) {
      for (let i = 0; i < touched.length; i++) {
        const cur = r[3 + i].results?.[0];
        if (!same(cur ? sourcePage(JSON.parse(cur.data)) : null, snapshot.pages[touched[i]] || null)) return false;   // 이 작업이 쓰는 문서를 그사이 누가 고쳤다
        if (cur) pageUpdated.push(cur.updated);
      }
      world = merge3(bare(snapshot.world), world, bare(JSON.parse(row.data)));
      if (world === CONFLICT) return false;
    }
    if (await writeCommit(db, uid, id, snapshot, output, world, version, [row.updated, ...pageUpdated])) return true;
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
