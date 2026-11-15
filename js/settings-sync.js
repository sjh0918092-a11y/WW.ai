"use strict";
/* 계정별 AI 설정. 서버에 설정이 있으면 먼저 받고, 사용자가 저장한 변경만 올린다. */
const AISettingsSync = {
  prefix:"wwiki:account-ai:", ownerKey:"wwiki:account-ai-owner", records:new Map(), running:null, timer:null, err:"", formDirty:false,
  context(){return Sync.acct?.token?{base:Sync.base(),owner:Sync.acct.id,token:Sync.acct.token}:null},
  key(ctx){return this.prefix+JSON.stringify([ctx.base,ctx.owner])},
  current(ctx){return !!ctx&&Sync.acct?.id===ctx.owner&&Sync.acct?.token===ctx.token&&Sync.base()===ctx.base},
  value(){return {...aiSettingsFile().settings,pass:GS.pass||""}},
  defaults(){return {...Object.fromEntries(AI_EXPORT_FIELDS.map(k=>[k,GDEF[k]])),taskModels:{},prompt:normalizePromptOptions(),pass:""}},
  validate(value){
    if(!value||typeof value.pass!=="string"||value.pass.length>1024)throw new Error("서버 설정 형식을 확인하지 못했습니다.");
    const {pass,...settings}=value;
    if([...AI_EXPORT_FIELDS,"taskModels","prompt"].some(k=>!Object.hasOwn(settings,k)))throw new Error("서버 설정 형식을 확인하지 못했습니다.");
    return {...parseAISettingsFile({format:"worldwiki-ai-settings",version:1,settings}),pass};
  },
  record(ctx){
    const key=this.key(ctx);if(this.records.has(key))return this.records.get(key);
    let r=LS.get(key);
    try{if(!r||!Number.isInteger(r.seq)||r.seq<0)throw 0;r={...r,value:this.validate(r.value),dirty:r.dirty===true,remote:r.remote===true}}catch{
      const owner=LS.get(this.ownerKey);r={value:!owner||owner===key?this.value():this.defaults(),dirty:false,seq:0,remote:false,revision:0};
    }
    this.store(ctx,r);return r;
  },
  store(ctx,r){this.records.set(this.key(ctx),r);LS.set(this.key(ctx),r)},
  apply(ctx,value){
    if(!this.current(ctx))return;
    GS={...GS,...structuredClone(value)};saveGS({sync:false});LS.set(this.ownerKey,this.key(ctx));S.sample=gReady()?gemini:null;
    if(S.ready&&S.view.name==="gset"&&!this.formDirty){
      const open=[...document.querySelectorAll(".gset details[id][open]")].map(el=>el.id);renderMain();for(const id of open){const el=document.getElementById(id);if(el)el.open=true}
    }
  },
  changed(){
    const ctx=this.context();if(!ctx)return;
    const r=this.record(ctx),value=this.value();
    if(JSON.stringify(value)===JSON.stringify(r.value))return;
    this.store(ctx,{...r,value,dirty:true,seq:r.seq+1});LS.set(this.ownerKey,this.key(ctx));this.err="";this.schedule(ctx,100);this.render();
  },
  schedule(ctx,ms=3000){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;if(this.current(ctx))this.load()},ms)},
  async request(ctx,method,body){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
    try{
      const response=await fetch(ctx.base+"/settings",{method,headers:{"Content-Type":"application/json",Authorization:"Bearer "+ctx.token},...(body?{body:JSON.stringify(body)}:{}),signal:ctl.signal});
      let result;try{result=await response.json()}catch{throw new Error("설정 서버 응답을 확인하지 못했습니다.")}
      if(!response.ok){if(response.status===401&&this.current(ctx)){Sync.acct=null;LS.del(AKEY)}throw new Error(result?.error?.message||"설정 서버에 연결하지 못했습니다.")}
      if(!result||!Object.hasOwn(result,"settings")||!Number.isInteger(result.revision))throw new Error("설정 서버 응답을 확인하지 못했습니다.");
      return {...result,settings:result.settings===null?null:this.validate(result.settings)};
    }finally{clearTimeout(timer)}
  },
  async work(ctx){
    try{
      let r=this.record(ctx);if(LS.get(this.ownerKey)!==this.key(ctx)){this.formDirty=false;this.apply(ctx,r.value);}
      const remote=await this.request(ctx,"GET");if(!this.current(ctx))return false;
      r=this.record(ctx);
      if(r.dirty||remote.settings===null){
        const sent=r, result=await this.request(ctx,"POST",{settings:sent.value,initialize:!sent.dirty});if(!this.current(ctx))return false;
        r=this.record(ctx);
        if(r.seq===sent.seq&&JSON.stringify(r.value)===JSON.stringify(sent.value)){
          this.store(ctx,{...r,value:result.settings,dirty:false,remote:true,revision:result.revision});this.apply(ctx,result.settings);
        }else this.schedule(ctx,100);
      }else{
        this.store(ctx,{...r,value:remote.settings,dirty:false,remote:true,revision:remote.revision});this.apply(ctx,remote.settings);
      }
      this.err="";return true;
    }catch(e){if(this.current(ctx)){this.err=e.message||"설정을 서버에 저장하지 못했습니다.";this.schedule(ctx,10000)}return false}
    finally{if(this.current(ctx))this.render()}
  },
  async load(){
    const ctx=this.context();if(!ctx)return false;
    if(this.running&&this.running.ctx.base===ctx.base&&this.running.ctx.token===ctx.token&&this.running.ctx.owner===ctx.owner)return this.running.promise;
    const run={ctx,promise:null};this.running=run;run.promise=this.work(ctx);
    try{return await run.promise}finally{if(this.running===run){this.running=null;this.render()}}
  },
  async flush(){
    clearTimeout(this.timer);this.timer=null;
    for(let i=0;i<3;i++){const ok=await this.load(),ctx=this.context();if(!ok||!ctx)return false;if(!this.record(ctx).dirty)return true}
    const ctx=this.context();if(ctx)this.schedule(ctx,100);return false;
  },
  message(){
    const ctx=this.context();if(!ctx)return "로그인하면 AI 설정을 계정에 저장하고 다른 기기에서도 불러옵니다.";
    if(this.err)return "기기에 저장됨 · 서버 동기화 재시도 중: "+this.err;
    if(this.running)return "AI 설정을 서버와 동기화하는 중…";
    const r=this.record(ctx);return r.dirty?"AI 설정을 서버에 저장하는 중…":r.remote?"AI 설정이 계정에 저장되어 있습니다.":"AI 설정을 서버에서 불러오는 중…";
  },
  render(){const el=document.getElementById("gSyncStatus");if(el)el.textContent=this.message()},
  logout(){clearTimeout(this.timer);this.timer=null;this.err="";this.formDirty=false},
  external(){const ctx=this.context();if(ctx){this.records.delete(this.key(ctx));this.load()}}
};
