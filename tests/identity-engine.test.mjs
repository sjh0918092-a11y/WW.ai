import assert from 'node:assert/strict';
import {createDocumentEngine} from '../relay/engine.generated.js';
const entity=(title,type)=>({title,type,summary:'',facts:[],mentions:[],page:false,box:''});
const target='target',main='main',person='person';
const world={id:'identity-server',kind:'world',title:'항구',seed:'사람이 거대해지는 세계',era:'2018년',rules:['전략소녀는 사람이다.'],timeline:[],relations:[],events:[],navboxes:{},aliases:{},toneTried:true,angleOff:true,relMigrated:true,mainKey:main,entities:{[main]:{...entity('기지','지명'),page:true},[target]:entity('마리옹 카르티에','인물')}};
const page={key:main,title:'기지',type:'지명',summary:'기지',infobox:[],sections:[{heading:'개요',level:1,body:'기지이다.'}],links:[],createdAt:1};
const snapshot={world,pages:{[main]:page}},original=JSON.stringify(snapshot);let count=0;
const runtime={id:'identity-regression',at:Date.UTC(2026,10,16),input:{action:'generate',wid:world.id,key:target,settings:{main:'test-main',quick:'test-quick',preCheck:false}},snapshot,notes:[],failures:[],request:async(kind,model,body)=>{
 count++;assert.equal(kind,'page');
 assert(body.contents[0].parts.map(p=>p.text).join("").includes('인물 본인의 신체와 본명을 장비와 복무자·조종사로 나누지 않는다'));
 const out={title:'마리옹 카르티에',type:'물건',summary:'장비',infobox:[{label:'복무자',value:'마리옹 카르티에'}],sections:[{heading:'개요',level:1,body:'전략소녀를 기체로 오인한 잘못된 응답이다.'}]};
 return{candidates:[{content:{parts:[{text:JSON.stringify(out)}]},finishReason:'STOP'}]};
}};
const result=await createDocumentEngine(runtime).execute();
assert.equal(count,1);assert(result.error);assert.equal(result.page,null);assert(!result.pages[target]);assert.equal(result.world.entities[target].type,'인물');assert.equal(JSON.stringify(snapshot),original);
assert(runtime.failures.some(x=>x.code==='identity_conflict'));console.log('✓ Server engine rejects misclassified person before page save, without changing source or extra AI calls');
