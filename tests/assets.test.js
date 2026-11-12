/* 분리된 파일 점검: index.html이 부르는 파일이 모두 있고, ?v= 값이 앱 버전과 같은지 확인한다 (브라우저 불필요) */
const fs = require("fs"), path = require("path"), assert = require("assert");
const { ROOT } = require("./helpers/app");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const version = /const APP_VERSION = "v([\d.]+)/.exec(fs.readFileSync(path.join(ROOT, "js/core.js"), "utf8"))[1];
const refs = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="(?!https?:)([^"?]+)(?:\?v=([^"]*))?"/g)].map(m => ({ file: m[1], v: m[2] }));
let n = 0; const pass = s => console.log(`  ✓ ${++n}. ${s}`);
assert(refs.length > 1); pass(`앱 파일 ${refs.length}개를 불러온다`);
for (const r of refs) assert(fs.existsSync(path.join(ROOT, r.file)), "없는 파일: " + r.file);
pass("불러오는 파일이 모두 저장소에 있다");
for (const r of refs) assert.equal(r.v, version, `${r.file}의 ?v= 값(${r.v})이 APP_VERSION(v${version})과 다르다`);
pass(`모든 파일의 ?v= 값이 APP_VERSION과 같다 (v${version})`);
const loaded = new Set(refs.map(r => r.file));
for (const f of fs.readdirSync(path.join(ROOT, "js"))) assert(loaded.has("js/" + f), "index.html이 부르지 않는 파일: js/" + f);
pass("js/ 안의 파일을 빠짐없이 불러온다");
