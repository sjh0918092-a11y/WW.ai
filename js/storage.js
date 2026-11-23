"use strict";
/* 저장소(localStorage·IndexedDB), 계정과 서버 저장, 백업 */
/* ---------- storage ---------- */
const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
/* IndexedDB 키-값 저장. 키: "w:<세계관 id>", "p:<세계관 id>:<항목 키>" */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no idb"));
      const r = indexedDB.open("worldwiki-gemini", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction("kv", mode), st = t.objectStore("kv"); let out;
      Promise.resolve(fn(st, v => { out = v; })).catch(rej);
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error?.name === "QuotaExceededError" ? { code: "quota_exceeded", message: "브라우저 저장 공간이 가득 찼습니다." } : t.error || new Error("브라우저 저장소 작업이 중단되었습니다. 저장 공간이 부족할 수 있습니다.")); t.onabort = t.onerror;
    });
  },
  put(k, v) { return this.tx("readwrite", st => { st.put(v, k); }); },
  get(k) { return this.tx("readonly", (st, set) => { const r = st.get(k); r.onsuccess = () => set(r.result); }); },
  del(k) { return this.tx("readwrite", st => { st.delete(k); }); },
  delPrefix(p) { return this.tx("readwrite", st => { st.delete(IDBKeyRange.bound(p, p + "￿")); }); },
  getPrefix(p) {
    return this.tx("readonly", (st, set) => {
      const range = IDBKeyRange.bound(p, p + "￿");
      const kr = st.getAllKeys(range), vr = st.getAll(range);
      vr.onsuccess = () => set(kr.result.map((k, i) => [k.slice(p.length), vr.result[i]]));
    });
  }
};
const Store = {
  mode: "memory", mem: { worlds: {}, pages: {} }, q: Promise.resolve(),
  async init() {
    try { await IDB.open(); await IDB.put("probe", 1); this.mode = "idb"; try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch {} return; } catch {}   // 저장 공간 유지 요청은 응답을 기다리지 않는다(일부 모바일 브라우저에서 늦게 돌아옴)
    this.mode = LS.set("wwiki:probe", 1) ? "local" : "memory";
  },
  run(fn) { const p = this.q.then(fn); this.q = p.catch(() => {}); return p; },
  async listWorlds() {
    if (this.mode === "idb") return (await IDB.getPrefix("w:")).map(([, w]) => w).filter(w => w && w.kind === "world");
    if (this.mode === "local") return Object.values(LS.get("wwiki:v1:worlds") || {});
    return Object.values(this.mem.worlds).map(w => JSON.parse(JSON.stringify(w)));
  },
  /* 메모리의 세계관을 저장한다. 그사이 동기화가 더 새 내용(다른 기기 것, 합친 것)을 저장해 두었으면 덮지 않고 먼저 합친다 */
  saveWorld(w) {
    Sync.mark("w", w.id);
    if (!Sync.incoming.has(w.id)) {   // 받아 둔 것이 없으면 예전처럼 바로 저장한다
      w.updatedAt = Math.max(Date.now(), (w.updatedAt || 0) + 1);
      return this.putWorldRaw(JSON.parse(JSON.stringify(w)));
    }
    return this.run(async () => {
      const stored = await this.getWorld(w.id);
      if (stored && Sync.incoming.get(w.id) === stored.updatedAt && (stored.updatedAt || 0) > (w.updatedAt || 0)) mergeWorldInto(w, stored);   // 동기화로 받은 것만 합친다(되돌리기처럼 일부러 예전으로 돌린 저장은 그대로)
      Sync.incoming.delete(w.id);
      w.updatedAt = Math.max(Date.now(), (w.updatedAt || 0) + 1, (stored?.updatedAt || 0) + 1);
      const copy = JSON.parse(JSON.stringify(w));
      if (this.mode === "idb") return IDB.put("w:" + w.id, copy);
      if (this.mode === "local") { const all = LS.get("wwiki:v1:worlds") || {}; all[w.id] = copy; if (!LS.set("wwiki:v1:worlds", all)) throw { code: "local_full" }; return; }
      this.mem.worlds[w.id] = copy;
    });
  },
  putWorldRaw(copy) {   // 시각을 바꾸지 않고 그대로 저장(서버에서 받은 것)
    const w = copy;
    return this.run(async () => {
      if (this.mode === "idb") return IDB.put("w:" + w.id, copy);
      if (this.mode === "local") { const all = LS.get("wwiki:v1:worlds") || {}; all[w.id] = copy; if (!LS.set("wwiki:v1:worlds", all)) throw { code: "local_full" }; return; }
      this.mem.worlds[w.id] = copy;
    });
  },
  async listPages(wid) {
    if (this.mode === "idb") { const o = {}; for (const [k, p] of await IDB.getPrefix("p:" + wid + ":")) if (p) o[k] = p; return o; }
    if (this.mode === "local") return LS.get("wwiki:v1:p:" + wid) || {};
    return JSON.parse(JSON.stringify(this.mem.pages[wid] || {}));
  },
  savePage(wid, p) {
    p.savedAt = Math.max(Date.now(), (p.savedAt || 0) + 1); const copy = JSON.parse(JSON.stringify(p));
    Sync.mark("p", wid, p.key);
    return this.putPageRaw(wid, copy);
  },
  putPageRaw(wid, copy) {
    const p = copy;
    return this.run(async () => {
      if (this.mode === "idb") { if (typeof StorySnap !== "undefined") await StorySnap.keep(wid, p.key); return IDB.put("p:" + wid + ":" + p.key, copy); }   // 이야기 중이면 처음 바뀌는 문서의 원래 상태를 남긴다
      if (this.mode === "local") { const all = LS.get("wwiki:v1:p:" + wid) || {}; all[p.key] = copy; if (!LS.set("wwiki:v1:p:" + wid, all)) throw { code: "local_full" }; return; }
      (this.mem.pages[wid] ||= {})[p.key] = copy;
    });
  },
  async getWorld(wid) {
    if (this.mode === "idb") return (await IDB.get("w:" + wid)) || null;
    if (this.mode === "local") return (LS.get("wwiki:v1:worlds") || {})[wid] || null;
    return this.mem.worlds[wid] || null;
  },
  async getPage(wid, key) {
    if (this.mode === "idb") return (await IDB.get("p:" + wid + ":" + key)) || null;
    if (this.mode === "local") return (LS.get("wwiki:v1:p:" + wid) || {})[key] || null;
    return this.mem.pages[wid]?.[key] || null;
  },
  async getSyncState(base, owner) {
    const key = "sync:" + JSON.stringify([base, owner]);
    if (this.mode === "idb") return IDB.get(key);
    if (this.mode === "local") return LS.get("wwiki:" + key);
    return this.mem[key] && JSON.parse(JSON.stringify(this.mem[key]));
  },
  putSyncState(base, owner, state) {
    const key = "sync:" + JSON.stringify([base, owner]), copy = JSON.parse(JSON.stringify(state));
    return this.run(() => {
      if (this.mode === "idb") return IDB.put(key, copy);
      if (this.mode === "local") { if (!LS.set("wwiki:" + key, copy)) throw { code: "local_full" }; return; }
      this.mem[key] = copy;
    });
  },
  /* 복구 결과는 읽었던 원본과 같을 때만 세계관·문서를 한 트랜잭션으로 저장한다. */
  commitRecovery(beforeWorld, beforePage, nextWorld, nextPage, valid = () => true) {
    return this.run(async () => {
      const wid = beforeWorld.id, key = nextPage.key;
      const check = (w, p) => {
        if (!valid() || JSON.stringify(w || null) !== JSON.stringify(beforeWorld) || JSON.stringify(p || null) !== JSON.stringify(beforePage || null)) throw new Error("원본이나 로그인 계정이 바뀌었습니다. 결과를 보관한 뒤 다시 확인해 주세요.");
      };
      const page = JSON.parse(JSON.stringify({ ...nextPage, savedAt: Date.now() }));
      const world = nextWorld && JSON.parse(JSON.stringify({ ...nextWorld, updatedAt: Date.now() }));
      if (this.mode === "idb") {
        await IDB.tx("readwrite", st => new Promise((resolve, reject) => {
          const wr = st.get("w:" + wid), pr = st.get("p:" + wid + ":" + key); let count = 0;
          const done = () => {
            if (++count !== 2) return;
            try { check(wr.result, pr.result); } catch (e) { st.transaction.abort(); reject(e); return; }
            if (world) st.put(world, "w:" + wid);
            st.put(page, "p:" + wid + ":" + key);
            resolve();
          };
          wr.onsuccess = done; pr.onsuccess = done;
        }));
      } else if (this.mode === "local") {
        // 두 항목을 원자적으로 바꿀 수 없는 저장 방식에서는 복구 원문을 내려받도록 안내한다.
        throw new Error("이 브라우저에서는 안전한 복구 저장을 사용할 수 없습니다. 결과 내려받기를 이용해 주세요.");
      } else {
        check(this.mem.worlds[wid], this.mem.pages[wid]?.[key]);
        if (world) this.mem.worlds[wid] = world;
        (this.mem.pages[wid] ||= {})[key] = page;
      }
      if (world) Sync.mark("w", wid);
      Sync.mark("p", wid, key);
      return { world: world || beforeWorld, page };
    });
  },
  deletePage(wid, key, silent) {
    if (!silent) Sync.mark("dp", wid, key);
    return this.run(async () => {
      if (this.mode === "idb") { if (typeof StorySnap !== "undefined") await StorySnap.keep(wid, key); return IDB.del("p:" + wid + ":" + key); }
      if (this.mode === "local") { const all = LS.get("wwiki:v1:p:" + wid) || {}; delete all[key]; LS.set("wwiki:v1:p:" + wid, all); return; }
      if (this.mem.pages[wid]) delete this.mem.pages[wid][key];
    });
  },
  deleteWorld(wid, silent) {
    if (!silent) Sync.mark("dw", wid);
    return this.run(async () => {
      if (this.mode === "idb") { await IDB.delPrefix("p:" + wid + ":"); await IDB.delPrefix("snap:" + wid + ":"); return IDB.del("w:" + wid); }
      if (this.mode === "local") { const all = LS.get("wwiki:v1:worlds") || {}; delete all[wid]; LS.set("wwiki:v1:worlds", all); LS.del("wwiki:v1:p:" + wid); return; }
      delete this.mem.worlds[wid]; delete this.mem.pages[wid];
    });
  }
};

/* ---------- 세계관 합치기 ----------
   두 기기에서 같은 세계관을 바꿨을 때 한쪽으로 덮지 않고 합친다(target을 고친다). 지우기보다 잃지 않기를 우선한다:
   대화 기록은 차례마다 합치고, 장이 더 나아간 쪽의 이야기를 바탕으로 삼고, 항목·사실·연표·관계는 합집합으로 둔다 */
const turnSig = t => JSON.stringify([t?.at || 0, t?.user || "", t?.reply || "", t?.ev || ""]);
function mergeSession(a, b) {
  if (!b) return a; if (!a) return JSON.parse(JSON.stringify(b));
  const seen = new Set((a.turns || []).map(turnSig)), extra = (b.turns || []).filter(t => !seen.has(turnSig(t)));
  if (!extra.length) return a;
  const lastA = Math.max(0, ...(a.turns || []).map(t => Number(t.at) || 0)), lastB = Math.max(0, ...(b.turns || []).map(t => Number(t.at) || 0));
  const base = lastB > lastA ? { ...JSON.parse(JSON.stringify(b)), draft: a.draft ?? b.draft } : a;   // 상태(지식·관계·장면)는 마지막 차례가 더 나중인 쪽
  base.turns = [...(a.turns || []), ...JSON.parse(JSON.stringify(extra))].sort((x, y) => (Number(x.at) || 0) - (Number(y.at) || 0));
  return base;
}
function mergeChapter(a, b) {
  if (!b) return a; if (!a) return JSON.parse(JSON.stringify(b));
  const d = a.dialogues ||= {};
  for (const [k, v] of Object.entries(b.dialogues || {})) d[k] = mergeSession(d[k], v);
  for (const [k, v] of Object.entries(b)) if (a[k] === undefined) a[k] = JSON.parse(JSON.stringify(v));
  return a;
}
const storyProgress = w => [(w.storyLog || []).length, w.story ? 1 : 0, (w.story?.chapters || []).length, w.story?.status === "ended" ? 1 : 0, (w.story?.chapters || []).reduce((n, c) => n + Object.values(c.dialogues || {}).reduce((m, s) => m + (s?.turns?.length || 0), 0), 0)];   // 정리한 이야기 수 → 진행 중 여부 → 장 → 결말 → 대화 수
const ahead = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
function unionBy(a = [], b = [], sig = x => JSON.stringify(x)) { const seen = new Set(a.map(sig)); return [...a, ...b.filter(x => !seen.has(sig(x)) && seen.add(sig(x)))]; }
function mergeWorldInto(target, other) {
  if (!target || !other || target.id !== other.id) return target;
  const o = JSON.parse(JSON.stringify(other));
  // 이야기: 더 나아간 쪽(정리한 이야기가 많은 쪽, 장이 많은 쪽)을 바탕으로, 같은 이야기면 겹치는 장의 대화를 합친다
  const oAhead = ahead(storyProgress(o), storyProgress(target)), primary = oAhead ? o : target, secondary = oAhead ? target : o;
  if (primary.story && secondary.story && primary.story.protagonistKey === secondary.story.protagonistKey && (primary.storyLog || []).length === (secondary.storyLog || []).length) {
    const ps = primary === target ? target.story : o.story, ss = primary === target ? JSON.parse(JSON.stringify(o.story)) : target.story;
    ps.chapters = (ps.chapters || []).map((c, i) => mergeChapter(c, ss.chapters?.[i]?.n === c.n ? ss.chapters[i] : null));
    for (const [k, v] of Object.entries(ss.dialogueProfiles || {})) if (!ps.dialogueProfiles?.[k]) (ps.dialogueProfiles ||= {})[k] = v;
  }
  if (oAhead) { if (o.story) { target.story = o.story; target.mode = o.mode; } else { delete target.story; delete target.mode; } }
  target.storyLog = unionBy(target.storyLog || [], o.storyLog || [], x => String(x?.arc));
  if (!target.storyLog.length) delete target.storyLog;
  // 항목: 없는 것은 더하고, 있는 것은 사실·별칭을 합친다
  for (const [k, e] of Object.entries(o.entities || {})) {
    const t = (target.entities ||= {})[k];
    if (!t) { target.entities[k] = e; continue; }
    t.facts = unionBy(t.facts || [], e.facts || [], f => f?.t || JSON.stringify(f));
    if (Array.isArray(e.mentions)) t.mentions = unionBy(t.mentions || [], e.mentions);
    if (e.page && !t.page) t.page = e.page;
    for (const [f, v] of Object.entries(e)) if (t[f] === undefined) t[f] = v;
  }
  for (const f of ["timeline", "relations"]) if (Array.isArray(o[f])) target[f] = unionBy(target[f] || [], o[f]);
  if (o.aliases) target.aliases = { ...o.aliases, ...(target.aliases || {}) };
  for (const [f, v] of Object.entries(o)) if (target[f] === undefined) target[f] = v;
  return target;
}
/* ---------- 계정과 서버 저장 (중계 서버의 /api) ----------
   로그인하면 저장할 때마다 바뀐 세계관과 문서를 모아 서버에 올리고, 앱을 열거나 다시 돌아올 때 바뀐 것을 받아 온다.
   같은 것을 두 기기에서 고치면 수정 시각이 더 최근인 쪽이 남는다. 로그인하지 않으면 지금처럼 브라우저에만 저장한다. */
const AKEY = "wwiki:acct", DKEY = "wwiki:dirty";
const Sync = {
  acct: LS.get(AKEY), dirty: null, incoming: new Map(), timer: null, busy: false, err: "", lastAt: 0, pulling: false, marks: new Map(), markSeq: 0,
  base() { return (GS.relay || DEFAULT_RELAY).replace(/\/+$/, "") + "/api"; },
  load() { const d = LS.get(DKEY) || {}; this.dirty = { w: new Set(d.w || []), p: new Set(d.p || []), dw: new Set(d.dw || []), dp: new Set(d.dp || []) }; },
  persist() { LS.set(DKEY, { w: [...this.dirty.w], p: [...this.dirty.p], dw: [...this.dirty.dw], dp: [...this.dirty.dp] }); },
  pending() { const d = this.dirty; return d ? d.w.size + d.p.size + d.dw.size + d.dp.size : 0; },
  /* 기준 시각: 이 기기가 마지막으로 서버와 맞춘 세계관의 수정 시각. 서버 쪽이 이보다 새로우면 다른 기기가 바꾼 것이다 */
  bases() { const k = "wwiki:bases:" + (this.acct?.id || ""); return this._bases?.k === k ? this._bases.v : (this._bases = { k, v: LS.get(k) || {} }).v; },
  setBase(wid, t) { const b = this.bases(); b[wid] = t; LS.set(this._bases.k, b); },
  /* 서버의 세계관 기록을 어떻게 받을지: take(받기) · merge(양쪽이 바뀌어 합치기) · skip(이미 본 것) */
  worldAction(r, local) {
    if (!local) return "take";
    if (!this.dirty) this.load();
    const base = this.bases()[r.wid], dirty = this.dirty.w.has(r.wid), at = local.updatedAt || 0;
    const serverNew = base == null ? r.updated !== at : r.updated > base;
    if (!serverNew) return "skip";
    if (!dirty) return base != null || at < r.updated ? "take" : "skip";
    return "merge";
  },
  mark(kind, wid, key) {
    if (!this.acct) return; if (!this.dirty) this.load();
    const d = this.dirty, id = key === undefined ? wid : wid + "\u0001" + key;
    this.marks.set(kind + ":" + id, ++this.markSeq);
    if (kind === "w") { d.w.add(id); d.dw.delete(id); }
    if (kind === "p") { d.p.add(id); d.dp.delete(id); }
    if (kind === "dw") { d.dw.add(id); d.w.delete(id); for (const x of [...d.p]) if (x.startsWith(wid + "\u0001")) d.p.delete(x); }
    if (kind === "dp") { d.dp.add(id); d.p.delete(id); }
    this.persist(); this.schedule();
  },
  schedule(ms = 3000) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), ms); },
  async req(path, opts = {}) {
    let res; const token = this.acct?.token, base = this.base();
    try { res = await fetch(base + path, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(opts.headers || {}) } }); }
    catch (e) { throw { code: "network", message: "중계 서버에 연결하지 못했습니다." }; }
    let j = null; try { j = await res.json(); } catch {}
    if (res.ok && (j === null || typeof j !== "object")) throw { code: "network", message: "서버 응답을 끝까지 받지 못했습니다. 회선이 끊겼을 수 있으니 다시 동기화해 주세요." };
    if (!res.ok) { const m = j?.error?.message || "HTTP " + res.status; if (res.status === 401 && this.acct?.token === token && this.base() === base && !/^\/(login|signup)/.test(path)) { this.acct = null; LS.del(AKEY); } throw { code: "acct", status: res.status, message: m }; }
    return j;
  },
  async login(id, pw, signup, invite) {
    const j = await this.req(signup ? "/signup" : "/login", { method: "POST", body: JSON.stringify(signup ? { id, pw, invite } : { id, pw }) });
    this.acct = { id: j.id, token: j.token, since: 0 }; LS.set(AKEY, this.acct); this.load();
    await this.pull();
    for (const w of S.worlds) { this.mark("w", w.id); for (const k of Object.keys(await Store.listPages(w.id))) this.mark("p", w.id, k); }   // 이 브라우저의 세계관도 올려서 합친다(서버에 더 최근 것이 있으면 그쪽이 남는다)
    await this.push();
  },
  async logout() { if(typeof AISettingsSync!=="undefined")AISettingsSync.logout(); try { await this.req("/logout", { method: "POST" }); } catch {} this.acct = null; LS.del(AKEY); LS.del(DKEY); this.dirty = null; this.err = ""; },
  async push() {
    if (!this.acct || this.busy) { if (this.acct) this.schedule(); return; }
    if (!this.dirty) this.load(); if (!this.pending()) return;
    if (this.dirty.w.size && !this._prePull) {   // 세계관을 올리기 전에 다른 기기의 변경을 먼저 받아 합친다(덮어쓰기 방지)
      this._prePull = true;
      try { await this.pull(); } finally { this._prePull = false; }
      if (this.err) { this.schedule(30000); this.render(); return; }
    }
    this.busy = true; this.err = "";
    try {
      await Store.q;
      const token = this.acct?.token, base = this.base(), d = this.dirty, items = [];
      for (const wid of [...d.w]) { const mark = this.marks.get("w:" + wid); const w = await Store.getWorld(wid); if (w) items.push(["w", wid, { wid, data: JSON.stringify(w), updated: w.updatedAt || Date.now() }, mark]); else d.w.delete(wid); }
      for (const id of [...d.p]) { const mark = this.marks.get("p:" + id); const [wid, key] = id.split("\u0001"); const p = await Store.getPage(wid, key); if (p) items.push(["p", id, { wid, pkey: key, data: JSON.stringify(p), updated: p.savedAt || p.createdAt || Date.now() }, mark]); else d.p.delete(id); }
      for (const wid of d.dw) items.push(["dw", wid, { wid, deleted: true, updated: Date.now() }, this.marks.get("dw:" + wid)]);
      for (const id of d.dp) { const [wid, key] = id.split("\u0001"); items.push(["dp", id, { wid, pkey: key, deleted: true, updated: Date.now() }, this.marks.get("dp:" + id)]); }
      let batch = [], size = 0;
      const send = async () => {
        if (!batch.length) return;
        if (this.acct?.token !== token || this.base() !== base || this.dirty !== d) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
        await this.req("/sync", { method: "POST", body: JSON.stringify({ worlds: batch.filter(x => x[0] === "w" || x[0] === "dw").map(x => x[2]), pages: batch.filter(x => x[0] === "p" || x[0] === "dp").map(x => x[2]) }) });
        if (this.acct?.token !== token || this.base() !== base || this.dirty !== d) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
        for (const [k, id, body, mark] of batch) { if (this.marks.get(k + ":" + id) === mark) d[k].delete(id); if (k === "w") this.setBase(id, body.updated); }
        this.persist(); batch = []; size = 0;
      };
      for (const it of items) { const n = (it[2].data || "").length + 200; if (size + n > 4e6 && batch.length) await send(); batch.push(it); size += n; }
      await send();
      this.lastAt = Date.now();
    } catch (e) { this.err = e?.message || "올리지 못했습니다."; this.schedule(30000); }
    this.busy = false; this.render();
  },
  async flush() {
    const token = this.acct?.token, base = this.base(), until = Date.now() + 60000;
    await Store.q;
    for (;;) {
      if (!token || this.acct?.token !== token || this.base() !== base) throw new Error("로그인 계정이나 서버가 바뀌었습니다.");
      if (Date.now() > until) throw new Error("동기화가 지연되어 문서 작업을 시작하지 않았습니다.");
      // 진행 중인 올리기만 기다린다. 받아 오기는 서버 쪽이 더 최신일 때만 덮어써 올리기와 부딪히지 않으므로, 시작 직후 뒤에서 도는 큰 받아 오기를 기다리지 않는다
      if (this.busy) { await gSleep(50); continue; }
      if (!this.dirty) this.load();
      if (!this.pending()) return;
      await this.push(); if (this.err) throw new Error(this.err);
    }
  },
  async applyIncoming(j, current = () => true, equal = false) {
    let changed = 0;
    for (const r of j.worlds || []) {
      if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
      const local = await Store.getWorld(r.wid);
      if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
      if (r.deleted) { if (local && (local.updatedAt || 0) <= r.updated) { await Store.deleteWorld(r.wid, true); changed++; } continue; }
      const act = this.worldAction(r, local);
      if (act === "skip") continue;
      const w = JSON.parse(r.data);
      if (!w || w.kind !== "world" || w.id !== r.wid) throw new Error("세계관 응답 형식이 올바르지 않습니다.");
      if (act === "merge") {   // 이 기기도, 다른 기기도 바꿨다: 덮지 않고 합쳐서 다시 올린다
        const merged = mergeWorldInto(JSON.parse(JSON.stringify(local)), w);
        merged.updatedAt = Math.max(local.updatedAt || 0, r.updated) + 1;
        await Store.putWorldRaw(merged); this.mark("w", r.wid);
      } else { w.updatedAt = r.updated; await Store.putWorldRaw(w); }
      this.incoming.set(r.wid, act === "merge" ? Math.max(local.updatedAt || 0, r.updated) + 1 : r.updated);   // 열린 세계관을 저장할 때 이것을 먼저 합친다
      this.setBase(r.wid, r.updated); changed++;
    }
    for (const r of j.pages || []) {
      if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
      const local = await Store.getPage(r.wid, r.pkey);
      if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
      if (r.deleted) { if (local && (local.savedAt || 0) <= r.updated) { await Store.deletePage(r.wid, r.pkey, true); changed++; } continue; }
      if (!local || (local.savedAt || 0) < r.updated || (equal && local.savedAt === r.updated && !this.dirty?.p.has(r.wid + "\u0001" + r.pkey))) {
        const p = JSON.parse(r.data);
        if (!p || p.key !== r.pkey) throw new Error("문서 응답 형식이 올바르지 않습니다.");
        p.savedAt = r.updated; await Store.putPageRaw(r.wid, p); changed++;
      }
    }
    return changed;
  },
  /* 수동 동기화도 진행 중인 받아 오기의 완료를 기다린다. */
  pull() {
    if (!this.acct) return Promise.resolve(0);
    if (this.pulling && this.pullP) return this.pullP;
    this.pulling = true;
    const p = this.pullP = this.pullOnce().finally(() => { if (this.pullP === p) { this.pullP = null; this.pulling = false; this.render(); } });
    return p;
  },
  async pullOnce() {
    let changed = 0; const acct = this.acct, base = this.base(), current = () => this.acct === acct && this.base() === base;
    try {
      if(typeof AISettingsSync!=="undefined")await AISettingsSync.load();
      if (!current()) throw new Error("로그인 계정이나 서버가 바뀌었습니다.");
      const state = await Store.getSyncState(base, acct.id) || { since: 0, seen: {} };
      let since = state.since || 0, more = true, after = state.after || null, retries = 0;
      while (more) {
        if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
        const j = await this.req("/sync?since=" + since + "&meta=1" + (after ? "&after=" + encodeURIComponent(JSON.stringify(after)) : ""));
        if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
        if (j.metadata !== true) {   // 새 브라우저와 이전 서버가 배포 중에 함께 쓰여도 동작한다.
          changed += await this.applyIncoming(j, current);
          more = !!j.more; since = more ? j.next : Math.max(since, j.next - 5e6);
          state.since = since;
          delete state.after;
          if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
          await Store.putSyncState(base, acct.id, state);
          acct.since = state.since; LS.set(AKEY, acct);
          continue;
        }
        const needed = [], receipt = r => JSON.stringify([r.kind, r.wid, r.pkey]);
        for (const r of j.records) {
          const key = receipt(r), known = state.seen[key];
          if (known === r.stamp) continue;
          if (r.deleted) { changed += await this.applyIncoming({ [r.kind === "w" ? "worlds" : "pages"]: [r] }, current); state.seen[key] = r.stamp; continue; }
          const local = r.kind === "w" ? await Store.getWorld(r.wid) : await Store.getPage(r.wid, r.pkey), at = local && (r.kind === "w" ? local.updatedAt : local.savedAt) || 0;
          if (r.kind === "w" ? this.worldAction(r, local) === "skip" : local && (at > r.updated || (at === r.updated && known === undefined))) state.seen[key] = r.stamp;
          else needed.push(r);
        }
        try {
          let batch = [], size = 0;
          const receive = async () => {
            if (!batch.length) return;
            if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
            const result = await this.req("/sync/read", { method: "POST", body: JSON.stringify({ records: batch.map(({ kind, wid, pkey, stamp }) => ({ kind, wid, pkey, stamp })) }) });
            const got = new Map([...(result.worlds || []).map(r => [JSON.stringify(["w", r.wid, ""]), r.stamp]), ...(result.pages || []).map(r => [JSON.stringify(["p", r.wid, r.pkey]), r.stamp])]);
            if (batch.some(r => got.get(receipt(r)) !== r.stamp)) throw { status: 409, message: "받아 오는 동안 문서가 바뀌었습니다." };
            changed += await this.applyIncoming(result, current, true);
            for (const r of batch) state.seen[receipt(r)] = r.stamp;
            if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
            await Store.putSyncState(base, acct.id, state);
            batch = []; size = 0;
          };
          for (const r of needed) { if (batch.length && size + r.bytes > 2 * 1024 * 1024) await receive(); batch.push(r); size += r.bytes; }
          await receive();
        } catch (e) { if (e.status === 409 && ++retries <= 3) continue; throw e; }
        retries = 0; more = !!j.more;
        if (more) {
          if (!j.after || JSON.stringify(j.after) === JSON.stringify(after)) throw new Error("서버 동기화 위치가 진행되지 않습니다.");
          after = state.after = j.after;
        } else {
          // 5초 겹침은 유지한다. 이미 확인한 순번은 본문 없이 건너뛴다.
          state.since = Math.max(since, j.next - 5e6);
          delete state.after;
          state.seen = Object.fromEntries(Object.entries(state.seen).filter(([, stamp]) => stamp > state.since));
        }
        if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
        await Store.putSyncState(base, acct.id, state);
      }
      if (!current()) throw new Error("동기화 중 계정이나 서버가 바뀌었습니다.");
      await Store.putSyncState(base, acct.id, state);
      acct.since = state.since; LS.set(AKEY, acct); this.lastAt = Date.now(); this.err = "";
    } catch (e) { if (current()) this.err = e?.message || "받아 오지 못했습니다."; }
    if (changed) await this.refresh();
    this.render();
    return changed;
  },
  /* 받아 온 변경을 화면에 반영한다. 작업 중이면 지금 연 세계관은 그대로 두고 알려 준다 */
  async refresh() {
    const working = () => S.gen || S.storyGen || S.storyTalkJob || S.syncing || S.checking || S.edit || S.bgSync || S.portraitJob || S.imageGen?.busy || S.proseGen?.busy || S.discovery?.busy;
    const cur = S.world?.id, key = S.view.key;
    S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (S.view.name === "jobs") {
      if (cur && !S.gen && !S.storyGen && !S.storyTalkJob && !S.checking && !S.syncing && !S.edit && !S.imageGen?.busy && !S.proseGen?.busy) {
        S.world = S.worlds.find(w => w.id === cur) || null;
        S.pages = S.world ? await Store.listPages(cur) : {};
      }
      renderSide(); return;
    }
    if (cur) {
      const busy = working();
      if (!S.worlds.some(x => x.id === cur)) { if (!busy) { S.world = null; S.view = { name: "home" }; renderAll(); } toast("다른 기기에서 이 세계관을 지웠습니다."); return; }
      if (busy) { toast("다른 기기에서 바뀐 내용을 받았습니다. 작업이 끝난 뒤 세계관을 다시 열면 보입니다."); return; }
      if (S.view.name === "storyTalk" && S.world?.id === cur) {
        const original = S.world, incoming = S.worlds.find(w => w.id === cur), pages = await Store.listPages(cur);
        if (S.world !== original || S.view.name !== "storyTalk" || S.view.key !== key || working()) return;
        if (isStory(incoming)) {
          const selected = storyTalkKey(incoming, key), input = document.getElementById("storyTalkInput"), focused = input === document.activeElement,
            start = input?.selectionStart, end = input?.selectionEnd, draft = storyTalkSession(original, key)?.draft;
          if (selected === key && typeof draft === "string") storyTalkSession(incoming, selected, true).draft = draft;
          S.world = incoming; S.pages = pages; S.view = { name: "storyTalk", key: selected };
          renderAll();
          const restored = document.getElementById("storyTalkInput");
          if (focused && restored && !restored.disabled) { restored.focus({ preventScroll: true }); restored.setSelectionRange(start, end); }
          return;
        }
      }
      await openWorld(cur, key); toast("다른 기기에서 바뀐 내용을 받았습니다.");
    } else renderAll();
  },
  render() { try { if (typeof AIRecovery !== "undefined") AIRecovery.authChanged(); if (S.view.name === "gset") { const el = $("#acctBox"); if (el) el.outerHTML = acctHtml(); } renderSide(); } catch {} },
};

/* ---------- 백업 ---------- */
function downloadBackup(worlds, pages, filename) {
  const data = { app: "worldwiki", version: 1, exportedAt: new Date().toISOString(), worlds, pages };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a"); const url = URL.createObjectURL(blob); a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportAll() {
  const pages = {};
  for (const w of S.worlds) pages[w.id] = S.world && S.world.id === w.id ? S.pages : await Store.listPages(w.id);
  downloadBackup(S.worlds, pages, `worldwiki-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast(`세계관 ${S.worlds.length}개를 내보냈습니다.`);
}
function exportWorld() {
  const w = S.world; if (!w) return;
  const opts = S.worldExports[w.id] || { images: true, stories: true };
  const pages = {};
  for (const [key, p] of Object.entries(S.pages)) {
    const copy = { ...p };
    if (!opts.images) delete copy.portrait;
    if (!opts.stories) delete copy.shortStories;
    else if (!opts.images && Array.isArray(copy.shortStories)) copy.shortStories = copy.shortStories.map(story => { const out = { ...story }; delete out.illustration; return out; });
    pages[key] = copy;
  }
  const title = String(w.title || "world").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 60) || "world";
  downloadBackup([w], { [w.id]: pages }, `worldwiki-${title}-${new Date().toISOString().slice(0, 10)}.json`);
  toast(`「${w.title}」 세계관을 내보냈습니다.`);
}
/* 읽기 전용 내보내기: 문서·단편·이미지·연표만 담은 HTML 한 장. 원안·지침·각도·작성 방향 같은 프롬프트는 넣지 않는다 */
const readOnlyKeys = (w, pages) => Object.keys(pages).filter(k => pages[k] && Array.isArray(pages[k].sections))
  .sort((a, b) => (b === w.mainKey) - (a === w.mainKey) || String(pages[a].title).localeCompare(String(pages[b].title), "ko"));
/* JSON판: 같은 범위를 데이터로 담는다. 본문은 저장된 서식([[링크]]·[*각주]·**굵게**)을 그대로 둔다 */
function readOnlyData(w, pages, opts) {
  const img = src => opts.images && src ? { image: src } : {};
  return {
    app: "worldwiki-readonly", version: 1, exportedAt: new Date().toISOString(),
    world: { title: w.title || "", era: w.era || "" },
    timeline: timelineOrder(w.timeline || [], w).filter(t => !t.sup).map(t => ({ when: tlWhen(t), event: t.event })),
    documents: readOnlyKeys(w, pages).map(k => { const p = pages[k]; return {
      key: k, title: p.title, type: p.type || "", categories: pageCats(p, w), summary: p.summary || "",
      ...(p.notices?.length ? { notices: [...p.notices] } : {}),
      infobox: (p.infobox || []).map(r => ({ label: stripMarks(r.label), value: r.value })),
      ...img(portraitSrc(p)),
      sections: p.sections.map(s => ({ heading: s.heading, level: s.level || 1, body: s.body })),
      ...(opts.stories ? { stories: shortStoriesOf(p).map(st => ({ title: st.title, body: st.body, ...img(portraitSrc({ portrait: st.illustration })) })) } : {}),
    }; }),
  };
}
function readOnlyHtml(w, pages, opts) {
  const keys = readOnlyKeys(w, pages);
  const has = new Set(keys);
  const links = html => html.replace(/<a class="wl[^"]*" href="#" data-k="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (m, k, label) => has.has(k) ? `<a href="#d-${k}">${label}</a>` : label);
  const body = (text, fns) => links(blocks(text, fns));
  const one = s => body(s, []).replace(/^<p>|<\/p>$/g, "");
  const img = (src, alt) => opts.images && src ? `<figure><img src="${src}" alt="${esc(alt)}"></figure>` : "";
  const docs = keys.map(k => {
    const p = pages[k], fns = [];
    const rows = (p.infobox || []).map(r => `<tr><th>${esc(stripMarks(r.label))}</th><td>${links(blocks(r.value, fns).replace(/^<p>|<\/p>$/g, ""))}</td></tr>`).join("");
    const pic = img(portraitSrc(p), p.title);
    const box = rows || pic ? `<aside class="ib"><div class="ih">${esc(p.title)}</div>${pic}${p.type ? `<div class="ity">${esc(p.type)}</div>` : ""}<table>${rows}</table></aside>` : "";
    const notices = (p.notices || []).length ? `<div class="notice">${p.notices.map(n => `<div>${one(n)}</div>`).join("")}</div>` : "";
    const secs = p.sections.map(s => `<${(s.level || 1) === 2 ? "h3" : "h2"}>${esc(s.heading)}</${(s.level || 1) === 2 ? "h3" : "h2"}>${body(s.body, fns)}`).join("");
    const fnHtml = fns.length ? `<ol class="fns">${fns.map(f => `<li>${links(inline(f))}</li>`).join("")}</ol>` : "";
    const stories = opts.stories ? shortStoriesOf(p).map(st => `<section class="story"><h3>단편 · ${esc(st.title)}</h3>${img(portraitSrc({ portrait: st.illustration }), st.title + " 삽화")}${body(st.body, [])}</section>`).join("") : "";
    const cats = pageCats(p, w);
    return `<article id="d-${k}"><h1>${esc(p.title)}</h1>${cats.length ? `<p class="meta">분류: ${cats.map(esc).join(" · ")}</p>` : ""}${notices}${box}${p.summary ? `<p class="lead">${leadHtml(p)}</p>` : ""}${secs}${fnHtml}${stories}<p class="top"><a href="#top">맨 위로</a></p></article>`;
  }).join("");
  const tl = timelineOrder(w.timeline || [], w).filter(t => !t.sup).map(t => `<tr><td>${esc(tlWhen(t))}</td><td>${esc(t.event)}</td></tr>`).join("");
  const toc = keys.map(k => `<li><a href="#d-${k}">${esc(pages[k].title)}</a></li>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.title)}</title><style>
body{margin:0;background:#fff;color:#202122;font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:1.7em;border-bottom:1px solid #a2a9b1;margin:1.4em 0 .4em}h2{font-size:1.3em;border-bottom:1px solid #eaecf0;margin:1.2em 0 .3em}h3{font-size:1.08em;margin:1em 0 .2em}
a{color:#0645ad}.meta{color:#54595d;font-size:.9em;margin:0}.lead{margin-top:.6em}article{overflow:hidden;padding-bottom:12px;border-bottom:3px double #c8ccd1}
.ib{float:right;width:280px;max-width:100%;margin:0 0 12px 16px;border:1px solid #a2a9b1;background:#f8f9fa;font-size:.9em}.ib .ih{background:#cedff2;font-weight:700;text-align:center;padding:6px}.ib .ity{text-align:center;color:#54595d;padding:4px}.ib table{width:100%;border-collapse:collapse}.ib th{text-align:left;vertical-align:top;padding:4px 6px;width:35%}.ib td{padding:4px 6px}.ib p{margin:0}
figure{margin:0;text-align:center}img{max-width:100%;height:auto}.story figure{margin:8px 0}.story{border-top:1px solid #eaecf0;margin-top:16px}
.notice{border:1px solid #a2a9b1;border-left:4px solid #36c;background:#f8f9fa;padding:6px 10px;margin:8px 0}blockquote{margin:8px 0;padding:4px 14px;border-left:3px solid #c8ccd1;color:#333}.fns{font-size:.88em;color:#333}
.tl{border-collapse:collapse;width:100%}.tl td{border-top:1px solid #eaecf0;padding:4px 8px;vertical-align:top}.tl td:first-child{white-space:nowrap;color:#54595d}.toc{columns:2 220px}.top{font-size:.85em;text-align:right;clear:both}
@media (max-width:600px){.ib{float:none;width:auto;margin:8px 0}.tl td:first-child{white-space:normal}}
@media (prefers-color-scheme:dark){body{background:#101418;color:#e6e6e6}a{color:#8ab4f8}.ib,.notice{background:#1b2027;border-color:#3a414a}.ib .ih{background:#24364f}h1,h2{border-color:#3a414a}.meta,.ib .ity,.tl td:first-child{color:#a0a6ad}blockquote,.fns{color:#cfd3d7}}
</style></head><body><main id="top"><header><h1 style="margin-top:.4em">${esc(w.title)}</h1>${w.era ? `<p class="meta">작중 기준 ${esc(w.era)}</p>` : ""}</header>
<nav><h2>문서 ${keys.length}개</h2><ul class="toc">${toc || "<li>없음</li>"}</ul></nav>${tl ? `<section><h2>연표</h2><table class="tl">${tl}</table></section>` : ""}${docs}</main></body></html>`;
}
function exportWorldReadOnly(format = "html") {
  const w = S.world; if (!w) return;
  const opts = S.worldExports[w.id] || { images: true, stories: true }, json = format === "json";
  const blob = json ? new Blob([JSON.stringify(readOnlyData(w, S.pages, opts), null, 2)], { type: "application/json" }) : new Blob([readOnlyHtml(w, S.pages, opts)], { type: "text/html" });
  const title = String(w.title || "world").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 60) || "world";
  const a = document.createElement("a"); const url = URL.createObjectURL(blob); a.href = url;
  a.download = `worldwiki-${title}-읽기전용-${new Date().toISOString().slice(0, 10)}.${json ? "json" : "html"}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`「${w.title}」을(를) 읽기 전용 ${json ? "JSON" : "HTML"}으로 내보냈습니다.`);
}
/* 되살린 기록 합치기: 백업 파일, 서버 시점 복원에서 꺼낸 행(wrangler 출력), 세계관 JSON 그대로 중 무엇이든 받아
   안에 든 세계관을 찾고, 이미 있는 세계관이면 덮지 않고 합친다(대화 기록은 차례마다 합친다) */
function recoveredWorlds(data) {
  const out = [], visit = (x, d = 0) => {
    if (!x || d > 8) return;
    if (typeof x === "string") { const t = x.trim(); if (t.startsWith("{")) { try { visit(JSON.parse(t), d + 1); } catch {} } return; }
    if (Array.isArray(x)) { x.forEach(v => visit(v, d + 1)); return; }
    if (typeof x === "object") { if (x.kind === "world" && x.id && x.entities) { out.push(x); return; } for (const v of Object.values(x)) visit(v, d + 1); }
  };
  visit(data); return out;
}
const countTurns = w => (w?.story?.chapters || []).reduce((n, c) => n + Object.values(c.dialogues || {}).reduce((m, s) => m + (s?.turns?.length || 0), 0), 0);
async function mergeRecovered(file) {
  const text = await file.text(); let data;
  try { data = JSON.parse(text); } catch {   // 명령 출력 앞에 안내 줄이 붙어 있어도 JSON 부분만 읽는다
    const i = text.search(/[[{]/); try { data = i >= 0 ? JSON.parse(text.slice(i)) : null; } catch { data = null; }
    if (!data) { toast("JSON 파일을 읽지 못했습니다."); return; }
  }
  const found = recoveredWorlds(data);
  if (!found.length) { toast("파일에서 세계관을 찾지 못했습니다."); return; }
  const done = [];
  try {
    for (const rec of found) {
      const local = await Store.getWorld(rec.id), open = S.world?.id === rec.id ? S.world : null;
      if (!local) { await Store.saveWorld(rec); done.push(`「${rec.title || rec.id}」 새로 추가`); continue; }
      const target = open || JSON.parse(JSON.stringify(local)), before = countTurns(target);
      mergeWorldInto(target, rec);
      await Store.saveWorld(target);
      done.push(`「${target.title || rec.id}」 대화 ${Math.max(0, countTurns(target) - before)}개 되살림`);
    }
  } catch (e) { toast("합치다 멈췄습니다. " + errMsg(e)); return; }
  S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (S.world) { const cur = S.worlds.find(w => w.id === S.world.id); if (cur && cur !== S.world) S.world = cur; }
  renderAll(); toast(done.join(", ") + ".");
}
async function importAll(file) {
  let data; try { data = JSON.parse(await file.text()); } catch { toast("JSON 파일을 읽지 못했습니다."); return; }
  const worlds = (Array.isArray(data?.worlds) ? data.worlds : []).filter(w => w && w.kind === "world" && w.id && w.entities);
  if (!worlds.length) { toast("가져올 세계관이 없습니다. WorldWiki 백업 파일인지 확인해 주세요."); return; }
  let n = 0;
  try {
    for (const w of worlds) {
      const ps = data.pages?.[w.id] || {};
      for (const p of Object.values(ps)) if (p && p.key) await Store.savePage(w.id, p);
      await Store.saveWorld(w); n++;
    }
  } catch (e) { toast("가져오다 멈췄습니다. " + errMsg(e)); }
  S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  toast(`세계관 ${n}개를 가져왔습니다. 같은 id의 세계관은 덮어썼습니다.`);
  renderAll();
}
