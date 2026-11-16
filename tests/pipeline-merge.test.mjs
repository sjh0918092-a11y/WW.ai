/* 서버 문서 작업 저장의 3방향 병합: 동시 작업이 장부에 각자 더한 항목은 합치고, 같은 곳을 다르게 고치면 충돌이다. */
import assert from 'node:assert/strict';
import { merge3, renumberRelations } from '../relay/pipeline-store.js';
const C = v => typeof v === 'symbol';
const base = { title: '세계', relSeq: 1, timeline: [{ year: '1990', event: 'A', src: 'a' }], events: [{ k: 'e1', src: 'a', nums: [] }],
  relations: [{ id: 1, a: 'p', b: 'q', rel: '동료', src: 'a' }], glossary: [{ term: '거체', definition: '큰 몸', src: 'a' }],
  entities: { usa: { title: '미국', summary: '나라', facts: [{ t: '강대국', src: 'a' }], mentions: [{ from: 'a', text: '미국 언급' }] } } };
const clone = () => structuredClone(base);
let n = 0; const ok = s => console.log(`  ✓ ${++n}. ${s}`);

{ const o = clone(), t = clone();
  o.timeline.push({ year: '1991', event: 'X', src: 'x' }); o.entities.usa.mentions.push({ from: 'x', text: 'x 언급' }); o.entities.usa.facts.push({ t: 'x 사실', src: 'x' }); o.events.push({ k: 'e2', src: 'x' });
  t.timeline.push({ year: '1992', event: 'Y', src: 'y' }); t.entities.usa.mentions.push({ from: 'y', text: 'y 언급' }); t.events.push({ k: 'e3', src: 'y' });
  const m = merge3(base, o, t); assert(!C(m));
  assert.deepEqual(m.timeline.map(x => x.src), ['a', 'y', 'x']); assert.equal(m.entities.usa.mentions.length, 3); assert.equal(m.entities.usa.facts.length, 2); assert.equal(m.events.length, 3);
  ok('두 작업이 연표·사건·언급·사실에 각자 더한 항목을 모두 살린다'); }
{ const o = clone(), t = clone(); o.timeline = []; t.timeline.push({ year: '1992', event: 'Y', src: 'y' });
  const m = merge3(base, o, t); assert.deepEqual(m.timeline.map(x => x.src), ['y']);
  ok('작업이 지운 항목은 지우고 그사이 더해진 항목은 남긴다'); }
{ const o = clone(), t = clone(); o.entities.usa.facts[0].sup = { by: 'x' }; t.entities.usa.facts[0].sup = { by: 'y' };
  assert(C(merge3(base, o, t)));
  const o2 = clone(), t2 = clone(); o2.entities.usa.facts = []; t2.entities.usa.facts[0].sup = { by: 'y' };
  assert(C(merge3(base, o2, t2)));
  ok('같은 항목을 양쪽이 다르게 고치거나, 한쪽이 지운 항목을 다른 쪽이 고치면 충돌이다'); }
{ const o = clone(), t = clone(); o.title = '작업 제목'; t.title = '다른 기기 제목'; assert(C(merge3(base, o, t)));
  const o2 = clone(), t2 = clone(); o2.entities.usa.summary = 'x 요약'; t2.entities.usa.summary = 'y 요약'; assert(C(merge3(base, o2, t2)));
  ok('장부가 아닌 값은 예전처럼 양쪽이 다르게 고치면 충돌이다'); }
{ const o = clone(), t = clone();
  o.entities.navy = { title: '미 해군', summary: 'x가 붙인 요약', type: '조직', origin: 'x', facts: [], mentions: [{ from: 'x', text: 'x' }] };
  t.entities.navy = { title: '미 해군', summary: 'y가 붙인 요약', type: '조직', origin: 'y', facts: [], mentions: [{ from: 'y', text: 'y' }] };
  const m = merge3(base, o, t); assert(!C(m)); assert.equal(m.entities.navy.summary, 'y가 붙인 요약'); assert.equal(m.entities.navy.mentions.length, 2);
  ok('두 작업이 같은 새 항목을 만들면 빈 칸은 먼저 저장된 쪽을 두고 언급은 모두 합친다'); }
{ const o = clone(), t = clone();
  o.relSeq = 2; o.relations.push({ id: 2, a: 'p', b: 'r', rel: '맞수', src: 'x' });
  t.relSeq = 2; t.relations.push({ id: 2, a: 'q', b: 'r', rel: '연인', src: 'y' });
  const m = renumberRelations(base, o, merge3(base, o, t));
  assert.equal(m.relations.length, 3); assert.equal(new Set(m.relations.map(x => x.id)).size, 3); assert.equal(m.relSeq, 3);
  assert.equal(m.relations.find(x => x.src === 'y').id, 2, '먼저 저장된 쪽의 번호는 그대로');
  ok('두 작업이 새 관계에 같은 번호를 붙이면 작업 쪽 번호를 다시 매긴다'); }
{ const page = { key: 'usa', title: '미국', sections: [{ body: '본문' }], autoConflicts: [{ by: 'a', old: '옛 서술' }] };
  const o = structuredClone(page), t = structuredClone(page);
  o.autoConflicts.push({ by: 'x', old: 'x가 지적한 서술' }); t.autoConflicts.push({ by: 'y', old: 'y가 지적한 서술' });
  const m = merge3(page, o, t); assert(!C(m)); assert.equal(m.autoConflicts.length, 3);
  const o2 = structuredClone(page), t2 = structuredClone(page); o2.autoConflicts.push({ by: 'x', old: 's' }); t2.sections[0].body = '다른 기기에서 고친 본문';
  const m2 = merge3(page, o2, t2); assert.equal(m2.sections[0].body, '다른 기기에서 고친 본문'); assert.equal(m2.autoConflicts.length, 2);
  const o3 = structuredClone(page), t3 = structuredClone(page); o3.sections[0].body = '작업 본문'; t3.sections[0].body = '다른 기기 본문';
  assert(C(merge3(page, o3, t3)));
  ok('다른 문서의 수정 요청 표시는 항목 단위로 합치고, 본문을 양쪽이 다르게 고치면 충돌이다'); }
