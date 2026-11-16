"use strict";
/* 작성 대기열 보관. 새로고침해도 남도록 세계관마다 기기에 저장하고, 로그인하면 서버(/api/queues)로 다른 기기와 맞춘다.
   같은 대기열을 두 기기가 동시에 처리하지 않도록 지금 처리하는 기기(run)를 함께 적는다. 수정 시각이 더 최근인 쪽이 남는다. */
const GenQueue = {
  prefix: "wwiki:genq:", RUN_TTL: 30 * 60 * 1000, timers: new Map(), pushing: new Set(),
  device() { let d = LS.get("wwiki:device"); if (!d) { d = crypto.randomUUID(); LS.set("wwiki:device", d); } return d; },
  read(wid) { const r = LS.get(this.prefix + wid); return r && Array.isArray(r.items) ? r : { items: [], run: null, updated: 0, dirty: false }; },
  strip: q => ({ key: q.key, title: q.title, ...(q.ent ? { ent: q.ent } : {}) }),
  write(wid, patch) {
    const old = this.read(wid);
    if (JSON.stringify([patch.items ?? old.items, patch.run !== undefined ? patch.run : old.run ?? null]) === JSON.stringify([old.items, old.run ?? null])) return old;
    const r = { ...old, ...patch, updated: Math.max(Date.now(), (old.updated || 0) + 1), dirty: !!Sync.acct };
    if (!r.items.length && !r.run && !Sync.acct) LS.del(this.prefix + wid); else LS.set(this.prefix + wid, r);
    if (Sync.acct) this.schedule(wid);
    return r;
  },
  /* 화면의 대기열(S.genQ)을 저장한다. run을 주면 처리 기기 표시도 바꾼다 */
  save(w, run) { if (!w) return; this.write(w.id, { items: S.genQ.filter(q => q.wid === w.id).map(this.strip), ...(run !== undefined ? { run } : {}) }); },
  load(w) { return this.read(w.id).items.map(q => ({ ...q, wid: w.id })); },
  mine(r) { return !r.run || r.run.dev === this.device(); },
  /* 다른 기기가 최근에 이 대기열을 처리하기 시작했으면 그 기기에 맡긴다 */
  elsewhere(wid) { const r = this.read(wid); return !this.mine(r) && Date.now() - r.run.at < this.RUN_TTL ? r.run : null; },
  started(w, k) { this.save(w, { dev: this.device(), key: k, at: Date.now() }); },
  /* 작성하는 중에 대기열에 넣은 기기가 대기열을 맡는다. 다른 기기가 맡고 있으면 그대로 둔다 */
  claim(w) { if (this.elsewhere(w.id)) this.save(w); else this.save(w, { dev: this.device(), key: S.gen?.wid === w.id ? S.gen.key : "", at: Date.now() }); },
  idle(w) { if (w && this.mine(this.read(w.id))) this.save(w, null); else this.save(w); },
  schedule(wid, ms = 300) { clearTimeout(this.timers.get(wid)); this.timers.set(wid, setTimeout(() => { this.timers.delete(wid); this.push(wid); }, ms)); },
  async push(wid) {
    if (!Sync.acct || this.pushing.has(wid)) return;
    const sent = this.read(wid); if (!sent.dirty) return;
    this.pushing.add(wid);
    try {
      const j = await Sync.req("/queues", { method: "POST", body: JSON.stringify({ wid, items: sent.items, run: sent.run || null, updated: sent.updated }) });
      const now = this.read(wid);
      if (now.updated === sent.updated) this.adopt(wid, j?.queue);
    } catch { this.schedule(wid, 15000); }
    finally { this.pushing.delete(wid); }
  },
  /* 서버 기록이 이 기기 것보다 최근이면 받아들이고, 이 기기에 올리지 않은 더 최근 변경이 있으면 올린다 */
  adopt(wid, q) {
    if (!q || q.wid !== wid || !Array.isArray(q.items)) return false;
    const local = this.read(wid);
    if (local.dirty && local.updated > q.updated) { this.schedule(wid); return false; }
    LS.set(this.prefix + wid, { items: q.items, run: q.run || null, updated: q.updated, dirty: false });
    if (S.world?.id === wid && JSON.stringify(S.genQ.filter(x => x.wid === wid).map(this.strip)) !== JSON.stringify(q.items)) {
      S.genQ = [...S.genQ.filter(x => x.wid !== wid), ...q.items.map(x => ({ ...x, wid }))];
      restoreQueued(S.world); renderSide();
      return true;
    }
    return false;
  },
  async pull(wid) {
    if (!Sync.acct) return;
    try {
      const j = await Sync.req("/queues" + (wid ? "?wid=" + encodeURIComponent(wid) : ""));
      const got = new Set();
      for (const q of j?.queues || []) { got.add(q.wid); this.adopt(q.wid, q); }
      const ids = wid ? [wid] : this.localIds();
      for (const id of ids) if (!got.has(id) && this.read(id).dirty) this.schedule(id);
    } catch {}
  },
  localIds() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.prefix)) out.push(k.slice(this.prefix.length)); } } catch {} return out; },
  /* 로그인 직후: 이 기기의 대기열도 올려서 합친다(서버에 더 최근 것이 있으면 그쪽이 남는다) */
  async login() { for (const id of this.localIds()) { const r = this.read(id); if (r.items.length || r.run) LS.set(this.prefix + id, { ...r, dirty: true }); } await this.pull(); },
};
