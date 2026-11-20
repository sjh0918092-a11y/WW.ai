/* UI에서 만든 새 문서 작성 경로와 요청 오류 진단. AI 호출 없이 접수 검증만 확인한다. */
import assert from 'node:assert/strict';
import {validateJob} from '../relay/providers.js';
const job=()=>({id:'pipeline-input-validation',type:'document.pipeline',model:'gemini-3.8-flash',input:{
 action:'generate',wid:'world',key:'key',worldHash:'a'.repeat(64),pageHash:'b'.repeat(64),
 entity:{title:'새 항목',type:'',summary:'',searched:true},settings:{main:'gemini-3.8-flash',check:'gpt-6-luna',checkThink:'medium'}
}});
for(const src of [undefined,'search','guided','force','discovery']){
 const b=job();if(src!==undefined)b.input.entity.src=src;assert.equal(validateJob(b),null,src);
}
const invalid=(edit,expected)=>{const b=job();edit(b.input);const message=validateJob(b);assert.match(message,expected);assert(!message.includes('private-sentinel'));};
invalid(i=>{i.entity.src='private-sentinel';},/작성 경로/);
invalid(i=>{i.entity.title='';},/제목/);
invalid(i=>{i.entity.summary='x'.repeat(2001);},/요약/);
invalid(i=>{i.entity.secret='private-sentinel';},/새 문서 항목.*형식/);
invalid(i=>{i.pageHash='private-sentinel';},/원본 확인/);
invalid(i=>{i.direction='x'.repeat(10001);},/10,000자/);
invalid(i=>{i.settings.mainThink='private-sentinel';},/기본 모델의 생각 수준/);
invalid(i=>{i.settings.main=123;},/기본 모델 이름/);
invalid(i=>{i.settings.quick='gpt-image-1';},/빠른 모델 이름/);
invalid(i=>{i.settings.taskModels={page:{model:'private-sentinel',think:'bad'}};},/작업별 모델/);
invalid(i=>{i.settings.prompt={factsCount:501};},/입력의 항목·개수/);
invalid(i=>{i.settings.secret='private-sentinel';},/설정 항목/);
for(const input of [null,[],{},'private-sentinel'])assert.equal(typeof validateJob({...job(),input}),'string');
const personal=job();personal.credential={type:'personal',key:'private-sentinel'};assert.match(validateJob(personal),/서버 키/);
console.log('✓ All UI document origins accepted; malformed fields rejected with specific, safe messages; personal-key isolation preserved');
