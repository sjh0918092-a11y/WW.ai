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
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error?.name === "QuotaExceededError" ? { code: "quota_exceeded" } : t.error); t.onabort = t.onerror;
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
    try { await IDB.open(); await IDB.put("probe", 1); this.mode = "idb"; try { await navigator.storage?.persist?.(); } catch {} return; } catch {}
    this.mode = LS.set("wwiki:probe", 1) ? "local" : "memory";
  },
  run(fn) { const p = this.q.then(fn); this.q = p.catch(() => {}); return p; },
  async listWorlds() {
    if (this.mode === "idb") return (await IDB.getPrefix("w:")).map(([, w]) => w).filter(w => w && w.kind === "world");
    if (this.mode === "local") return Object.values(LS.get("wwiki:v1:worlds") || {});
    return Object.values(this.mem.worlds).map(w => JSON.parse(JSON.stringify(w)));
  },
  saveWorld(w) {
    w.updatedAt = Date.now(); const copy = JSON.parse(JSON.stringify(w));
    Sync.mark("w", w.id);
    return this.putWorldRaw(copy);
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
    p.savedAt = Date.now(); const copy = JSON.parse(JSON.stringify(p));
    Sync.mark("p", wid, p.key);
    return this.putPageRaw(wid, copy);
  },
  putPageRaw(wid, copy) {
    const p = copy;
    return this.run(async () => {
      if (this.mode === "idb") return IDB.put("p:" + wid + ":" + p.key, copy);
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
      if (this.mode === "idb") return IDB.del("p:" + wid + ":" + key);
      if (this.mode === "local") { const all = LS.get("wwiki:v1:p:" + wid) || {}; delete all[key]; LS.set("wwiki:v1:p:" + wid, all); return; }
      if (this.mem.pages[wid]) delete this.mem.pages[wid][key];
    });
  },
  deleteWorld(wid, silent) {
    if (!silent) Sync.mark("dw", wid);
    return this.run(async () => {
      if (this.mode === "idb") { await IDB.delPrefix("p:" + wid + ":"); return IDB.del("w:" + wid); }
      if (this.mode === "local") { const all = LS.get("wwiki:v1:worlds") || {}; delete all[wid]; LS.set("wwiki:v1:worlds", all); LS.del("wwiki:v1:p:" + wid); return; }
      delete this.mem.worlds[wid]; delete this.mem.pages[wid];
    });
  }
};

/* ---------- 계정과 서버 저장 (중계 서버의 /api) ----------
   로그인하면 저장할 때마다 바뀐 세계관과 문서를 모아 서버에 올리고, 앱을 열거나 다시 돌아올 때 바뀐 것을 받아 온다.
   같은 것을 두 기기에서 고치면 수정 시각이 더 최근인 쪽이 남는다. 로그인하지 않으면 지금처럼 브라우저에만 저장한다. */
const AKEY = "wwiki:acct", DKEY = "wwiki:dirty";
const Sync = {
  acct: LS.get(AKEY), dirty: null, timer: null, busy: false, err: "", lastAt: 0, pulling: false,
  base() { return (GS.relay || DEFAULT_RELAY).replace(/\/+$/, "") + "/api"; },
  load() { const d = LS.get(DKEY) || {}; this.dirty = { w: new Set(d.w || []), p: new Set(d.p || []), dw: new Set(d.dw || []), dp: new Set(d.dp || []) }; },
  persist() { LS.set(DKEY, { w: [...this.dirty.w], p: [...this.dirty.p], dw: [...this.dirty.dw], dp: [...this.dirty.dp] }); },
  pending() { const d = this.dirty; return d ? d.w.size + d.p.size + d.dw.size + d.dp.size : 0; },
  mark(kind, wid, key) {
    if (!this.acct) return; if (!this.dirty) this.load();
    const d = this.dirty, id = key === undefined ? wid : wid + "\u0001" + key;
    if (kind === "w") { d.w.add(id); d.dw.delete(id); }
    if (kind === "p") { d.p.add(id); d.dp.delete(id); }
    if (kind === "dw") { d.dw.add(id); d.w.delete(id); for (const x of [...d.p]) if (x.startsWith(wid + "\u0001")) d.p.delete(x); }
    if (kind === "dp") { d.dp.add(id); d.p.delete(id); }
    this.persist(); this.schedule();
  },
  schedule(ms = 3000) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), ms); },
  async req(path, opts = {}) {
    let res;
    try { res = await fetch(this.base() + path, { ...opts, headers: { "Content-Type": "application/json", ...(this.acct?.token ? { Authorization: "Bearer " + this.acct.token } : {}), ...(opts.headers || {}) } }); }
    catch (e) { throw { code: "network", message: "중계 서버에 연결하지 못했습니다." }; }
    let j = null; try { j = await res.json(); } catch {}
    if (!res.ok) { const m = j?.error?.message || "HTTP " + res.status; if (res.status === 401 && this.acct && !/^\/(login|signup)/.test(path)) { this.acct = null; LS.del(AKEY); } throw { code: "acct", status: res.status, message: m }; }
    return j;
  },
  async login(id, pw, signup, invite) {
    const j = await this.req(signup ? "/signup" : "/login", { method: "POST", body: JSON.stringify(signup ? { id, pw, invite } : { id, pw }) });
    this.acct = { id: j.id, token: j.token, since: 0 }; LS.set(AKEY, this.acct); this.load();
    await this.pull();
    for (const w of S.worlds) { this.mark("w", w.id); for (const k of Object.keys(await Store.listPages(w.id))) this.mark("p", w.id, k); }   // 이 브라우저의 세계관도 올려서 합친다(서버에 더 최근 것이 있으면 그쪽이 남는다)
    await this.push();
  },
  async logout() { try { await this.req("/logout", { method: "POST" }); } catch {} this.acct = null; LS.del(AKEY); LS.del(DKEY); this.dirty = null; this.err = ""; },
  async push() {
    if (!this.acct || this.busy) { if (this.acct) this.schedule(); return; }
    if (!this.dirty) this.load(); if (!this.pending()) return;
    this.busy = true; this.err = "";
    try {
      const d = this.dirty, items = [];
      for (const wid of d.w) { const w = await Store.getWorld(wid); if (w) items.push(["w", wid, { wid, data: JSON.stringify(w), updated: w.updatedAt || Date.now() }]); else d.w.delete(wid); }
      for (const id of d.p) { const [wid, key] = id.split("\u0001"); const p = await Store.getPage(wid, key); if (p) items.push(["p", id, { wid, pkey: key, data: JSON.stringify(p), updated: p.savedAt || p.createdAt || Date.now() }]); else d.p.delete(id); }
      for (const wid of d.dw) items.push(["dw", wid, { wid, deleted: true, updated: Date.now() }]);
      for (const id of d.dp) { const [wid, key] = id.split("\u0001"); items.push(["dp", id, { wid, pkey: key, deleted: true, updated: Date.now() }]); }
      let batch = [], size = 0;
      const send = async () => {
        if (!batch.length) return;
        await this.req("/sync", { method: "POST", body: JSON.stringify({ worlds: batch.filter(x => x[0] === "w" || x[0] === "dw").map(x => x[2]), pages: batch.filter(x => x[0] === "p" || x[0] === "dp").map(x => x[2]) }) });
        for (const [k, id] of batch) d[k].delete(id);
        this.persist(); batch = []; size = 0;
      };
      for (const it of items) { const n = (it[2].data || "").length + 200; if (size + n > 4e6 && batch.length) await send(); batch.push(it); size += n; }
      await send();
      this.lastAt = Date.now();
    } catch (e) { this.err = e.message || "올리지 못했습니다."; this.schedule(30000); }
    this.busy = false; this.render();
  },
  async pull() {
    if (!this.acct || this.pulling) return 0; this.pulling = true;
    let changed = 0;
    try {
      let since = this.acct.since || 0, more = true;
      while (more) {
        const j = await this.req("/sync?since=" + since);
        for (const r of j.worlds || []) {
          const local = await Store.getWorld(r.wid);
          if (r.deleted) { if (local && (local.updatedAt || 0) <= r.updated) { await Store.deleteWorld(r.wid, true); changed++; } continue; }
          if (!local || (local.updatedAt || 0) < r.updated) { let w; try { w = JSON.parse(r.data); } catch { continue; } if (w && w.kind === "world") { w.updatedAt = r.updated; await Store.putWorldRaw(w); changed++; } }
        }
        for (const r of j.pages || []) {
          const local = await Store.getPage(r.wid, r.pkey);
          if (r.deleted) { if (local && (local.savedAt || 0) <= r.updated) { await Store.deletePage(r.wid, r.pkey, true); changed++; } continue; }
          if (!local || (local.savedAt || 0) < r.updated) { let p; try { p = JSON.parse(r.data); } catch { continue; } if (p && p.key) { p.savedAt = r.updated; await Store.putPageRaw(r.wid, p); changed++; } }
        }
        more = !!j.more; since = more ? j.next : Math.max(0, j.next - 5e6);   // 끝에서는 5초를 겹쳐 받아 순서가 엇갈린 기록도 놓치지 않는다
      }
      this.acct.since = since; LS.set(AKEY, this.acct); this.lastAt = Date.now(); this.err = "";
    } catch (e) { this.err = e.message || "받아 오지 못했습니다."; }
    this.pulling = false;
    if (changed) await this.refresh();
    this.render();
    return changed;
  },
  /* 받아 온 변경을 화면에 반영한다. 작업 중이면 지금 연 세계관은 그대로 두고 알려 준다 */
  async refresh() {
    const cur = S.world?.id, key = S.view.key;
    S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (S.view.name === "jobs") {
      if (cur && !S.gen && !S.storyGen && !S.checking && !S.syncing && !S.edit && !S.imageGen?.busy && !S.proseGen?.busy) {
        S.world = S.worlds.find(w => w.id === cur) || null;
        S.pages = S.world ? await Store.listPages(cur) : {};
      }
      renderSide(); return;
    }
    if (cur) {
      const busy = S.gen || S.storyGen || S.syncing || S.checking || S.edit || S.bgSync || S.portraitJob || S.imageGen?.busy || S.proseGen?.busy || S.discovery?.busy;
      if (!S.worlds.some(x => x.id === cur)) { if (!busy) { S.world = null; S.view = { name: "home" }; renderAll(); } toast("다른 기기에서 이 세계관을 지웠습니다."); return; }
      if (busy) { toast("다른 기기에서 바뀐 내용을 받았습니다. 작업이 끝난 뒤 세계관을 다시 열면 보입니다."); return; }
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
