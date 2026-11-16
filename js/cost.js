"use strict";
/* 문서별 토큰·비용. 제공자가 보고한 사용량만 계산하며 키·본문은 보관하지 않는다. */
const DocumentCost = {
  prefix: "wwiki:docCost:", records: new Map(), active: new Set(), creation: null,
  tokenKeys: ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "cachedContentTokenCount", "cacheCreationInputTokenCount", "cacheCreation5mInputTokenCount", "cacheCreation1hInputTokenCount", "cacheCreation30mInputTokenCount", "cacheCreation12hInputTokenCount"],
  counts(raw) {
    if (!raw || !this.tokenKeys.some(k => Number.isFinite(raw[k]))) return null;
    return { ...Object.fromEntries(this.tokenKeys.map(k => [k, Number.isFinite(raw[k]) ? Math.max(0, raw[k]) : 0])), complete: typeof raw.complete === "boolean" ? raw.complete : Number.isFinite(raw.promptTokenCount) && Number.isFinite(raw.candidatesTokenCount) };
  },
  rate(model, at, input = 0) {
    const m = String(model || "").replace(/^models\//, "");
    if (m === "gemini-3.8-flash") return at < Date.UTC(2027,0,1) ? [.75,3.75,.075] : [1.5,7.5,.15];
    if (m === "gemini-3.5-flash-lite") return [.3,2.5,.03];
    if (/^claude-sonnet-4-[56](?:-\d{8})?$/.test(m)) return [3,15,.3];
    if (/^claude-opus-4-[56](?:-\d{8})?$/.test(m)) return [5,25,.5];
    if (/^claude-haiku-4-5(?:-\d{8})?$/.test(m)) return [1,5,.1];
    const id=m.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    const openai={"gpt-6-astra":[10,50,1],"gpt-6.1-sol":[2,10,.1],"gpt-6.1-terra":[1,5,.05],"gpt-6-luna":[.1,.5,.01],"gpt-5.5":[5,30,.5],"gpt-5.4":[2.5,15,.25],"gpt-5.4-mini":[.75,4.5,.075]};
    const rate=openai[id];
    if(rate){if(input>272000){if(["gpt-5.5","gpt-5.4"].includes(id))return [rate[0]*2,rate[1]*1.5,rate[2]*2];return null}return rate}
    return null;
  },
  estimate(row, at) {
    const u = this.counts(row.usage), p = this.rate(row.model, at, u?.promptTokenCount || 0);
    if (!u || !p || !u.complete) return null;
    const read = Math.min(u.promptTokenCount, u.cachedContentTokenCount), write = Math.min(u.promptTokenCount-read, u.cacheCreationInputTokenCount);
    const hour = Math.min(write, u.cacheCreation1hInputTokenCount), long = Math.min(write-hour,u.cacheCreation12hInputTokenCount);
    return ((u.promptTokenCount-read-write)*p[0] + read*p[2] + (write-hour-long)*p[0]*1.25 + hour*p[0]*2 + long*p[0]*2.5 + (u.candidatesTokenCount+u.thoughtsTokenCount)*p[1])/1e6;
  },
  key(wid, key) { return this.prefix + JSON.stringify([typeof Sync !== "undefined" ? Sync.base() : GS.relay, typeof Sync !== "undefined" ? Sync.acct?.id || "local" : "local",wid,key]); },
  get(wid, key) {
    const id = this.key(wid,key);
    if (!this.records.has(id)) { try { const r = JSON.parse(localStorage.getItem(id) || "null"); if (r && Array.isArray(r.rows)) { r.rows=r.rows.filter(row=>row && typeof row === "object").slice(0,100); this.records.set(id, r); } } catch {} }
    return this.records.get(id);
  },
  start(wid, key) {
    const r = { id: crypto.randomUUID(), storageKey:this.key(wid,key), wid,key,at:Date.now(),finished:false,rows:[] };
    this.records.set(r.storageKey,r); this.active.add(r.id); this.save(r); return r;
  },
  startWorld() {
    const r=this.start("creating:"+crypto.randomUUID(),"@world");r.category="world";this.creation=r;this.save(r);return r;
  },
  bindWorld(r,wid) {
    if(!r)return;
    const previous=r.storageKey, scope=JSON.parse(previous.slice(this.prefix.length));scope[2]=wid;
    r.wid=wid;r.storageKey=this.prefix+JSON.stringify(scope);
    this.records.delete(previous);this.records.set(r.storageKey,r);
    try{localStorage.removeItem(previous);}catch{}
    this.save(r);this.render();
  },
  save(r) {
    if (!r || this.records.get(r.storageKey) !== r) return;
    try {
      localStorage.setItem(r.storageKey,JSON.stringify(r));
      const keys = [];
      for (let i=0;i<localStorage.length;i++) { const k=localStorage.key(i); if (k.startsWith(this.prefix)) keys.push(k); }
      if (keys.length>20) keys.map(k=>{try{return [k,JSON.parse(localStorage.getItem(k)).at||0]}catch{return[k,0]}}).sort((a,b)=>b[1]-a[1]).slice(20).forEach(([k])=>{localStorage.removeItem(k);this.records.delete(k)});
    } catch {}
  },
  begin(wid,key,kind) {
    return this.beginSession(this.get(wid,key),kind);
  },
  beginSession(r,kind) {
    if (!r || r.finished || !this.active.has(r.id)) return null;
    const row={id:crypto.randomUUID(),kind,model:"",status:"running",usage:null}; r.rows.push(row); this.save(r);this.render();return {record:r,row};
  },
  update(call, model, usage, status) {
    if (!call) return;
    if (model) call.row.model=model;
    if (usage) call.row.usage=this.counts(usage);
    if (status) call.row.status=status;
    this.save(call.record);this.render();
  },
  server(r, job) {
    if (!r) return;
    if (Array.isArray(job.steps)) r.rows=job.steps.map((s,i)=>({id:s.slot||String(i),kind:s.kind,model:s.model||job.model,status:s.status,usage:this.counts(s.usage)}));
    this.save(r);this.render();
  },
  restore(wid,key,receipt,report) {
    const previous=this.get(wid,key);
    if(previous && previous.at>(receipt.createdAt||0))return;
    const r={id:receipt.id,storageKey:this.key(wid,key),wid,key,at:receipt.createdAt||Date.now(),finished:true,rows:(report.steps||[]).map((s,i)=>({...s,id:String(i),usage:this.counts(s.usage)}))};
    this.records.set(r.storageKey,r);this.save(r);this.render();
  },
  finish(r) {
    if (!r) return; this.active.delete(r.id); r.finished=true;
    for (const row of r.rows) if (row.status === "running") row.status="unknown";
    this.save(r);this.render();
  },
  money(n) { return n === null ? "산정 대기" : n === 0 ? "$0.000000" : "$" + n.toFixed(n<.001?6:4); },
  content(r) {
    let total=0, known=0, input=0, output=0, thought=0, missing=0, cached=0, saved=0;
    const rows=r.rows.map(row=>{
      const u=this.counts(row.usage), cost=this.estimate(row,r.at);
      if (u) {input+=u.promptTokenCount; output+=u.candidatesTokenCount; thought+=u.thoughtsTokenCount;}
      const read=u?Math.min(u.promptTokenCount,u.cachedContentTokenCount):0, rate=this.rate(row.model,r.at,u?.promptTokenCount||0);
      cached+=read;if(rate&&cost!==null)saved+=read*(rate[0]-rate[2])/1e6;
      if(cost!==null){total+=cost;known++;} else missing++;
      const label=typeof KIND!=="undefined" ? KIND[row.kind]||row.kind : row.kind;
      return `<li><span>${esc(label)} · ${esc(row.model||"모델 확인 중")}${u?`<br><small class="note">입력 ${u.promptTokenCount.toLocaleString()} · 출력·생각 ${(u.candidatesTokenCount+u.thoughtsTokenCount).toLocaleString()} 토큰</small>`:""}</span><span>${cost===null ? u ? u.complete ? "요금 미등록" : "사용량 일부 미제공" : "사용량 집계 중/미제공" : this.money(cost)}</span></li>`;
    }).join("");
    const amount=known?this.money(total):"산정 대기";
    const partial=missing || !r.finished;
    return `<summary>${r.category==="world"?"세계관 초기 생성 비용":"문서 생성 비용"} · ${amount}${partial&&known?" + 미집계":""} <span class="note">${r.finished?"완료된 요청 기준":"집계 중"}</span></summary><div class="cost-body"><p>${r.rows.some(row=>this.counts(row.usage))?`확인된 입력 ${input.toLocaleString()} · 출력·생각 ${(output+thought).toLocaleString()} 토큰`:"확인된 사용량이 아직 없습니다."}</p><p class="note">캐시 재사용 ${cached.toLocaleString()} 토큰${saved?` · 일반 입력 요금 대비 ${this.money(saved)} 절감 (합계에 반영됨)`:cached?" · 할인액 산정 대기":" · 확인된 캐시 할인 없음"}</p>${rows?`<ul>${rows}</ul>`:"<p>제공자 사용량을 기다리는 중입니다.</p>"}<p class="note">${r.category==="world"?"기본 설정·초기 연표·날짜 보완 집계 · 문서 생성 비용 별도":"문서 작성·검사·수정 집계 · 이미지 비용 별도"} · API 사용량 수신 시 갱신 · 유료 표준 단가의 USD 예상액입니다. 미수신·실패 요청, 세금·할인·저장 비용은 실제 청구와 다를 수 있습니다. Claude가 생각 토큰을 따로 보고하지 않으면 출력에 포함됩니다.</p><p class="note">단가 확인 2026-11-16 · <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Gemini 요금</a> · <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">OpenAI 요금</a> · <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noopener noreferrer">Claude 요금</a></p></div>`;
  },
  mount(root,r,id) {
    let panel=document.getElementById(id);
    if(!root||!r){panel?.remove();return;}
    if(!panel){
      panel=document.createElement("details");panel.id=id;panel.className="doc-cost memo";
      const pref=id==="worldCostPanel"?"wwiki:worldCostExpanded":"wwiki:costExpanded";
      try{panel.open=localStorage.getItem(pref)==="true";}catch{}
      let open=panel.open;panel.addEventListener("toggle",()=>{if(open===panel.open)return;open=panel.open;try{localStorage.setItem(pref,String(open));}catch{}});
      const heading=root.querySelector("h1,h2");if(heading)heading.after(panel);else root.prepend(panel);
    }
    const html=this.content(r);if(panel.innerHTML!==html)panel.innerHTML=html;
  },
  render() {
    if(typeof S==="undefined")return;
    if(S.view.name==="home"){
      const r=this.creation, mine=r&&r.storageKey===this.key(r.wid,r.key);
      this.mount(document.getElementById("worldCostMount"),mine?r:null,"worldCostPanel");return;
    }
    if(!["article","canon"].includes(S.view.name)||!S.world)return;
    const root=document.querySelector("#main .sheet");
    if(S.view.name==="article")this.mount(root,this.get(S.world.id,S.view.key),"docCostPanel");
    this.mount(root,this.get(S.world.id,"@world"),"worldCostPanel");
  },
  jobHtml(receipt, report) {
    const steps=report?.steps||receipt?.steps;
    if(!Array.isArray(steps))return "";
    return `<details class="doc-cost memo">${this.content({at:receipt.createdAt||Date.now(),finished:!["running","queued","submitting"].includes(receipt.status),rows:steps.map((s,i)=>({...s,id:String(i)}))})}</details>`;
  }
};
