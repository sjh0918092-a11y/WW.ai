"use strict";
/* 불러온 모델 목록도 계정 설정에 저장한다. 저장된 목록이 있으면 재조회하지 않는다. */
const ModelCatalog={
  scope:"",pending:new Map(),checked:{},errors:{},
  context(){return {base:Sync.base(),owner:Sync.acct?.id||"",token:Sync.acct?.token||"",pass:GS.pass||""}},
  signature(ctx){return JSON.stringify([ctx.base,ctx.owner,ctx.token,ctx.pass])},
  current(ctx){return this.signature(ctx)===this.signature(this.context())},
  prepare(){
    const ctx=this.context(),sig=this.signature(ctx);if(sig!==this.scope){this.scope=sig;this.checked={};this.errors={};}
    const catalog=normalizeModelCatalog(GS.modelCatalog);
    for(const provider of ["gemini","claude"]){const key=provider==="gemini"?"gmodels":"cmodels";if(Array.isArray(catalog[provider]))S[key]=catalog[provider];else delete S[key];}
  },
  remember(provider,rows,ctx=this.context()){
    if(!this.current(ctx))return;
    const models=normalizeModelCatalog({[provider]:rows})[provider];if(!models)return;
    GS.modelCatalog={...normalizeModelCatalog(GS.modelCatalog),[provider]:models};
    S[provider==="gemini"?"gmodels":"cmodels"]=models;saveGS();this.checked[provider]=Date.now();delete this.errors[provider];this.update();
  },
  ensure(){
    if(!gReady()||AISettingsSync.running)return;
    for(const provider of ["gemini","claude"]){if(Array.isArray(GS.modelCatalog?.[provider]))continue;if(provider==="claude"&&!Sync.acct?.token)continue;if(Date.now()-(this.checked[provider]||0)>300000)this.refresh(provider)}
  },
  async refresh(provider){
    this.prepare();
    const ctx=this.context(),sig=this.signature(ctx),key=sig+":"+provider;if(this.pending.has(key))return this.pending.get(key);
    this.checked[provider]=Date.now();
    const run=(async()=>{try{
      let rows;if(provider==="gemini")rows=await listGeminiModels();else{const result=await listClaudeModels();rows=[...result.models];for(const [alias,id]of Object.entries(result.aliases||{})){const m=rows.find(m=>m.id===id);if(m)rows.push({id:alias,label:m.label+" (별칭)"})}}
      if(!this.current(ctx))return;this.remember(provider,rows,ctx);
    }catch(e){if(this.current(ctx)){this.errors[provider]=errMsg(e);this.update()}}
    finally{this.pending.delete(key);if(this.current(ctx))this.update()}})();
    this.pending.set(key,run);this.update();return run;
  },
  update(){
    if(S.view.name!=="gset")return;
    for(const el of document.querySelectorAll('#gMain, #gQuick, #gCheck, [data-task-model]')){
      const value=el.value,task=!!el.dataset.taskModel;
      let options=gModelOptions(value,false,task||el.id==="gCheck");if(task)options=options.replace("기본 모델과 같게","공통 배정 따름");el.innerHTML=options;el.value=value;
    }
    const status=document.getElementById("gCatalogStatus");if(status)status.textContent=this.message();
  },
  message(){
    const counts=[];if(Array.isArray(S.gmodels))counts.push("Gemini "+S.gmodels.length+"개");if(Array.isArray(S.cmodels))counts.push("Claude "+S.cmodels.length+"개");
    const errors=Object.entries(this.errors).map(([provider,error])=>(provider==="gemini"?"Gemini":"Claude")+": "+error);
    const loading=[...this.pending.keys()].some(key=>key.startsWith(this.scope+":"));
    return (counts.length?"불러온 모델: "+counts.join(" · "):"저장된 모델 목록이 없으면 한 번 조회해 계정에 저장합니다.")+(loading?" · 조회 중…":"")+(errors.length?" · "+errors.join(" / "):"");
  }
};
