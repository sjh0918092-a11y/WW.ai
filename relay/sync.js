/* 본문 크기와 변경 목록은 저장할 때 갱신한다. 받아 올 때는 선택한 본문만 읽는다. */
export const SYNC_LIMIT = 1500;
export const SYNC_BYTES = 2 * 1024 * 1024;

export function syncSchema(db) {
  const sql = [
    "CREATE TABLE IF NOT EXISTS sync_index (uid TEXT NOT NULL, kind TEXT NOT NULL, wid TEXT NOT NULL, pkey TEXT NOT NULL, stamp INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(uid,kind,wid,pkey))",
    "CREATE INDEX IF NOT EXISTS sync_index_stamp ON sync_index(uid,stamp,kind,wid,pkey)",
    "CREATE TABLE IF NOT EXISTS sync_index_ready (uid TEXT PRIMARY KEY)",
  ];
  for (const [table, kind, key] of [["worlds", "w", "''"], ["pages", "p", "NEW.pkey"]]) {
    for (const action of ["INSERT", "UPDATE"]) sql.push(`CREATE TRIGGER IF NOT EXISTS sync_${table}_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
      INSERT INTO sync_index(uid,kind,wid,pkey,stamp,updated,deleted,bytes) VALUES(NEW.uid,'${kind}',NEW.wid,${key},NEW.stamp,NEW.updated,NEW.deleted,COALESCE(length(CAST(NEW.data AS BLOB)),0))
      ON CONFLICT(uid,kind,wid,pkey) DO UPDATE SET stamp=excluded.stamp,updated=excluded.updated,deleted=excluded.deleted,bytes=excluded.bytes; END`);
    sql.push(`CREATE TRIGGER IF NOT EXISTS sync_${table}_delete AFTER DELETE ON ${table} BEGIN DELETE FROM sync_index WHERE uid=OLD.uid AND kind='${kind}' AND wid=OLD.wid AND pkey=${kind === "w" ? "''" : "OLD.pkey"}; END`);
  }
  return sql.map(s => db.prepare(s));
}

async function ensureIndex(db, uid) {
  if (await db.prepare("SELECT 1 FROM sync_index_ready WHERE uid=?").bind(uid).first()) return;
  // 기존 자료는 계정별로 한 번만 채운다. 트리거가 이미 기록한 더 최근 값은 건드리지 않는다.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO sync_index SELECT uid,'w',wid,'',stamp,updated,deleted,COALESCE(length(CAST(data AS BLOB)),0) FROM worlds WHERE uid=? AND NOT EXISTS(SELECT 1 FROM sync_index_ready WHERE uid=?)").bind(uid, uid),
    db.prepare("INSERT OR IGNORE INTO sync_index SELECT uid,'p',wid,pkey,stamp,updated,deleted,COALESCE(length(CAST(data AS BLOB)),0) FROM pages WHERE uid=? AND NOT EXISTS(SELECT 1 FROM sync_index_ready WHERE uid=?)").bind(uid, uid),
    db.prepare("INSERT OR IGNORE INTO sync_index_ready(uid) VALUES(?)").bind(uid),
  ]);
}

const refKey = r => JSON.stringify([r.kind, r.wid, r.pkey]);
const fault = (status, message) => Object.assign(new Error(message), { status });

export async function syncManifest(db, uid, since, after) {
  await ensureIndex(db, uid);
  let args = [uid, since], tail = "";
  if (after) {
    if (!Array.isArray(after) || after.length !== 4 || !Number.isSafeInteger(after[0]) || after[0] < since || !["w", "p"].includes(after[1]) || after.slice(2).some(v => typeof v !== "string")) throw fault(400, "동기화 위치가 올바르지 않습니다.");
    tail = " AND (stamp,kind,wid,pkey) > (?,?,?,?)"; args.push(...after);
  }
  const rows = (await db.prepare("SELECT kind,wid,pkey,stamp,updated,deleted,bytes FROM sync_index WHERE uid=? AND stamp>?" + tail + " ORDER BY stamp,kind,wid,pkey LIMIT ?").bind(...args, SYNC_LIMIT + 1).all()).results || [];
  const more = rows.length > SYNC_LIMIT; rows.length = Math.min(rows.length, SYNC_LIMIT);
  const last = rows.at(-1);
  return { id: uid, metadata: true, records: rows, more, next: last?.stamp ?? since, after: last ? [last.stamp, last.kind, last.wid, last.pkey] : null };
}

async function bodies(db, uid, refs) {
  const out = { worlds: [], pages: [] };
  for (const [table, kind, cols] of [["worlds", "w", "t.wid"], ["pages", "p", "t.wid,t.pkey"]]) {
    const selected = refs.filter(r => r.kind === kind);
    if (!selected.length) continue;
    out[table] = (await db.prepare(`SELECT ${cols},t.data,t.updated,t.deleted,t.stamp FROM json_each(?) r JOIN ${table} t ON t.uid=? AND t.wid=json_extract(r.value,'$.wid') ${kind === "p" ? "AND t.pkey=json_extract(r.value,'$.pkey')" : ""} AND t.stamp=json_extract(r.value,'$.stamp')`).bind(JSON.stringify(selected), uid).all()).results || [];
  }
  return out;
}

export async function syncRead(db, uid, refs) {
  if (!Array.isArray(refs) || refs.length > SYNC_LIMIT || refs.some(r => !r || !["w", "p"].includes(r.kind) || typeof r.wid !== "string" || typeof r.pkey !== "string" || !Number.isSafeInteger(r.stamp))) throw fault(400, "받아 올 문서 목록이 올바르지 않습니다.");
  if (!refs.length) return { worlds: [], pages: [] };
  if (new Set(refs.map(refKey)).size !== refs.length) throw fault(400, "받아 올 문서가 중복되었습니다.");
  const rows = (await db.prepare("SELECT i.bytes FROM json_each(?) r JOIN sync_index i ON i.uid=? AND i.kind=json_extract(r.value,'$.kind') AND i.wid=json_extract(r.value,'$.wid') AND i.pkey=json_extract(r.value,'$.pkey') AND i.stamp=json_extract(r.value,'$.stamp')").bind(JSON.stringify(refs), uid).all()).results || [];
  if (rows.length !== refs.length) throw fault(409, "받아 오는 동안 문서가 바뀌었습니다.");
  if (refs.length > 1 && rows.reduce((n, r) => n + r.bytes, 0) > SYNC_BYTES) throw fault(413, "받아 올 문서를 더 작은 묶음으로 나눠 주세요.");
  const result = await bodies(db, uid, refs);
  // 목록 조회 뒤 본문이 바뀌어도 이전 순번의 본문을 잘못 확정하지 않는다.
  if (result.worlds.length + result.pages.length !== refs.length) throw fault(409, "받아 오는 동안 문서가 바뀌었습니다.");
  return result;
}

/* 구버전 브라우저도 본문 전체를 훑는 누적 크기 조회 없이 같은 형식으로 받는다. */
export async function syncLegacy(db, uid, since) {
  await ensureIndex(db, uid);
  const take = async kind => {
    const candidates = (await db.prepare("SELECT kind,wid,pkey,stamp,bytes FROM sync_index WHERE uid=? AND kind=? AND stamp>? ORDER BY stamp,wid,pkey LIMIT ?").bind(uid, kind, since, SYNC_LIMIT + 1).all()).results || [];
    const rows = []; let size = 0;
    for (const r of candidates) {
      if (rows.length >= SYNC_LIMIT || size > SYNC_BYTES) break;
      rows.push(r); size += r.bytes;
    }
    return { rows, end: rows.length < candidates.length || size > SYNC_BYTES ? rows.at(-1)?.stamp : null };
  };
  const w = await take("w"), p = await take("p"), ends = [w.end, p.end].filter(x => x != null), more = ends.length > 0;
  const next = more ? Math.min(...ends) : Math.max(since, ...w.rows.map(r => r.stamp), ...p.rows.map(r => r.stamp));
  const refs = [...w.rows, ...p.rows].filter(r => !more || r.stamp <= next);
  return { id: uid, ...await bodies(db, uid, refs), next, more };
}
