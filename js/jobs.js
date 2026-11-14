"use strict";
/* AI 한 호출을 서버에 접수하고 같은 번호로 조회한다. 복구 화면은 recovery.js에서 연결한다. */
const AIJobs = {
  prefix: "wwiki:job:", active: new Set(),
  enabled(provider = "gemini") {
    if (GS.serverJobs === false || !Sync.acct?.token) return false;
    const personal = GS.serverKeys === true && GS.serverKeysFor === normRelay(GS.relay || DEFAULT_RELAY);
    return provider === "openai" ? !!(personal && GS.openaiKey) : gRelay() ? !!GS.pass : !!(personal && GS.key);
  },
  receipts() {
    const all = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.prefix)) { const r = LS.get(k); if (r?.id) all.push(r); } } } catch {}
    return all;
  },
  save(r) { return LS.set(this.prefix + r.id, r); },
  async ack(ctx, receipt) {
    try { await this.req(ctx, "/" + receipt.id + "/ack", {}); receipt.acked = true; this.save(receipt); } catch {}
  },
  current(ctx) { return Sync.acct?.id === ctx.owner && Sync.acct?.token === ctx.token && Sync.base() === ctx.base; },
  async req(ctx, path, body) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), body === undefined ? 120000 : 60000);
    try {
      const res = await fetch(ctx.base + "/jobs" + path, { method: body === undefined ? "GET" : "POST", headers: {
        "Content-Type": "application/json", Authorization: "Bearer " + ctx.token,
        ...(body?.credential || !ctx.pass ? {} : { "X-WW-Pass": ctx.pass }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: ctl.signal });
      let j; try { j = await res.json(); } catch { throw { transport: true }; }
      if (!res.ok) throw { code: res.status === 401 ? "job_auth" : "job_api", status: res.status, transport: res.status >= 500,
        message: j?.error?.message || "서버 작업을 확인하지 못했습니다." };
      return j;
    } catch (e) {
      if (e?.status) throw { ...e, serverJob: true };
      throw { code: "job_network", transport: true, serverJob: true, message: "서버 연결을 다시 확인하는 중입니다. 같은 작업 번호를 유지합니다." };
    } finally { clearTimeout(timer); }
  },
  async cache(receipt, result) {
    const record = { receipt, result }, key = "job:" + receipt.id;
    let cached = false;
    try {
      if (Store.mode === "idb") { await IDB.put(key, record); cached = true; }
      else if (Store.mode === "local") cached = LS.set(key, record);
    } catch {}
    if (cached) {
      receipt.cached = true; receipt.bytes = JSON.stringify(result).length * 2;
      this.save(receipt);
      // 로컬 결과 캐시는 최근 20건·약 40MiB까지. 아직 못 받은 서버 결과에는 손대지 않는다.
      const old = this.receipts().filter(r => r.cached).sort((a, b) => b.createdAt - a.createdAt);
      let bytes = 0;
      for (let i = 0; i < old.length; i++) {
        bytes += old[i].bytes || 0;
        if (i < 20 && bytes <= 40 * 1024 * 1024) continue;
        try { if (Store.mode === "idb") await IDB.del("job:" + old[i].id); else LS.del("job:" + old[i].id); } catch { continue; }
        old[i].cached = false; this.save(old[i]);
      }
    }
    return cached && LS.get(this.prefix + receipt.id)?.cached === true;
  },
  async run(type, model, input, opts = {}) {
    if (opts.signal?.aborted) throw { code: "cancelled", serverJob: true };
    const provider = type.startsWith("openai.") ? "openai" : "gemini";
    if (!this.enabled(provider)) throw { code: "job_unavailable", serverJob: true, message: "로그인과 서버 AI 작업 설정을 확인해 주세요." };
    const ctx = { base: Sync.base(), owner: Sync.acct.id, token: Sync.acct.token, pass: GS.pass };
    const key = provider === "openai" ? GS.openaiKey : gRelay() ? "" : GS.key;
    const id = crypto.randomUUID(), body = { id, type, model, input, ...(opts.jobMeta ? { meta: opts.jobMeta } : {}), ...(key ? { credential: { type: "personal", key } } : {}) };
    const receipt = { id, type, model, owner: ctx.owner, base: ctx.base, createdAt: Date.now(), status: "submitting", meta: opts.jobMeta || {} };
    // 접수보다 먼저 저장한다. 저장할 수 없으면 AI를 시작하지 않는다. 키·입력은 이 기록에 넣지 않는다.
    if (!this.save(receipt)) throw { code: "job_storage", serverJob: true, message: "작업 번호를 이 브라우저에 저장하지 못해 시작하지 않았습니다." };
    for (const old of this.receipts().filter(r => r.owner === ctx.owner && r.base === ctx.base && !r.acked && (r.cached || ["failed", "interrupted", "cancelled"].includes(r.status))).slice(-10)) this.ack(ctx, old);
    for (const old of this.receipts()) if (old.id !== id && old.createdAt < Date.now() - 86400000 && (old.handledAt || old.dismissedAt || !old.cached) && !["submitting", "queued", "running"].includes(old.status)) {
      if (Store.mode === "idb") IDB.del("job:" + old.id).catch(() => {}); else LS.del("job:" + old.id);
      LS.del(this.prefix + old.id);
    }
    this.active.add(id); opts.onJob?.({ id, type });
    let accepted = false, attempted = false;
    const cancel = async () => {
      receipt.cancelRequested = true; this.save(receipt);
      try { const r = await this.req(ctx, "/" + id + "/cancel", {}); receipt.status = r.job.status; this.save(receipt); } catch {}
    };
    const onAbort = () => { cancel(); }; opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      for (;;) {
        if (opts.signal?.aborted) { await cancel(); throw { code: "cancelled", serverJob: true }; }
        if (!this.current(ctx)) throw { code: "job_account_changed", serverJob: true, message: "로그인 계정이나 서버가 바뀌었습니다. 원래 계정의 작업 번호로 결과를 확인할 수 있습니다." };
        await gWaitVisible(opts.signal);
        if (!this.current(ctx)) throw { code: "job_account_changed", serverJob: true, message: "로그인 계정이나 서버가 바뀌어 접수를 중지했습니다." };
        if (Date.now() - receipt.createdAt > 86400000) throw { code: "job_wait_expired", serverJob: true, message: "작업 대기 시간이 길어졌습니다. 저장된 작업 번호로 상태를 다시 확인해 주세요." };
        try {
          if (!attempted) {
            attempted = true;
            const submitted = await this.req(ctx, "", body); accepted = true;
            receipt.status = submitted.job.status; this.save(receipt);
          }
          let r;
          try { r = await this.req(ctx, "/" + id); }
          catch (e) {
            if (e.status === 404 && !accepted) { const submitted = await this.req(ctx, "", body); accepted = true; receipt.status = submitted.job.status; this.save(receipt); continue; }
            throw e;
          }
          accepted = true;
          if (opts.signal?.aborted) { await cancel(); throw { code: "cancelled", serverJob: true }; }
          if (!this.current(ctx)) throw { code: "job_account_changed", serverJob: true, message: "원래 계정에서 서버 작업 결과를 다시 확인해 주세요." };
          receipt.status = r.job.status; receipt.updatedAt = Date.now(); this.save(receipt);
          opts.onStatus?.(r.job);
          if (r.job.status === "succeeded") {
            if (r.result === undefined) throw { code: "job_result_collected", serverJob: true, message: "이미 받은 오래된 결과입니다. 이 브라우저의 작업 결과 캐시를 확인해 주세요." };
            receipt.receivedAt = Date.now();
            if (await this.cache(receipt, r.result)) this.ack(ctx, receipt);
            return r.result;
          }
          if (["failed", "interrupted", "cancelled"].includes(r.job.status)) {
            receipt.error = r.job.error; this.save(receipt);
            this.ack(ctx, receipt);
            throw { code: r.job.status === "cancelled" ? "cancelled" : r.job.error?.code || "job_failed", serverJob: true,
              message: r.job.error?.message || "서버 작업이 중단되었습니다.", httpStatus: r.job.error?.httpStatus };
          }
        } catch (e) {
          if (!e.transport) throw e;
          opts.onStatus?.({ id, status: "reconnecting" });
        }
        await gSleep(1500, opts.signal);
      }
    } catch (e) {
      if (!accepted && e.status && e.status < 500) { receipt.status = "rejected"; receipt.error = { code: e.code, message: e.message }; this.save(receipt); }
      throw { ...e, serverJob: true, jobId: id };
    } finally { this.active.delete(id); opts.signal?.removeEventListener("abort", onAbort); }
  },
};
