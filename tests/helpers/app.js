/* 테스트 공용: 앱 파일을 실제 배포(GitHub Pages)처럼 정적 서버로 내려주고, 코드 구간 검사용 원문을 만든다 */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

/* base: 사이트가 올라가는 하위 경로(예: "/WW.ai/"). 그 아래 주소를 저장소 루트의 파일로 돌려준다 */
function appServer({ base = "/" } = {}) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split(/[?#]/)[0]);
    if (p.startsWith(base)) p = "/" + p.slice(base.length); else if (base !== "/" && p + "/" === base) p = "/";
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
}

/* index.html에 외부 스크립트·스타일을 제자리에 펼친 글. 함수 구간을 잘라 vm으로 돌리는 테스트가 쓴다 */
function appSource() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return html
    .replace(/<script src="(?!https?:)([^"?]+)(?:\?[^"]*)?"><\/script>/g, (_, f) => "<script>\n" + fs.readFileSync(path.join(ROOT, f), "utf8") + "</script>")
    .replace(/<link rel="stylesheet" href="(?!https?:)([^"?]+)(?:\?[^"]*)?">/g, (_, f) => "<style>\n" + fs.readFileSync(path.join(ROOT, f), "utf8") + "</style>");
}

module.exports = { ROOT, appServer, appSource };
