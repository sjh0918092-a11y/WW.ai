/* 계정과 서버 저장 e2e 테스트: 브라우저 두 개를 두 기기처럼 쓰고, 서버는 실제 relay/worker.js에 가짜 D1을 붙여 돌린다
 * 실행: node tests/sync.test.js   (Node 22 이상, Playwright 필요)
 */
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const { appServer } = require("./helpers/app");
const { chromium } = require("playwright");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");
const server = appServer();
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    _run() { return /^\s*select/i.test(sql) ? db.prepare(sql).all(...args) : db.prepare(sql).run(...args); },
  });
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { db.exec("BEGIN"); try { const r = list.map(s => s._run()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
let ok = 0; const pass = m => console.log(`  ✓ ${++ok}. ${m}`);
const until = async (fn, msg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 200)); } throw new Error("시간 초과: " + msg); };

(async () => {
  const worker = (await import(path.join(ROOT, "relay", "worker.js"))).default;
  await new Promise(r => server.listen(0, r));
  const URL_ = `http://127.0.0.1:${server.address().port}/`;
  const env = { DB: fakeD1(), PASSWORDS: "초대암호", GEMINI_KEY: "x", ALLOWED_ORIGINS: URL_.replace(/\/$/, "") };
  const row = (sql, ...a) => env.DB.raw.prepare(sql).get(...a);
  const browser = await chromium.launch();
  const device = async () => {
    const ctx = await browser.newContext();
    await ctx.route("**/api/**", async r => {   // 중계 서버의 /api 요청을 실제 worker 코드로 처리
      const q = r.request(), h = await q.allHeaders();
      const resp = await worker.fetch(new Request(q.url(), { method: q.method(), headers: h, body: ["GET", "HEAD"].includes(q.method()) ? undefined : q.postData() }), env);
      await r.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers), body: await resp.text() });
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => { console.error("페이지 오류:", e); process.exitCode = 1; });
    await page.goto(URL_); await page.waitForSelector("#gPass");   // Gemini 연결이 없으니 설정 화면에서 시작한다
    return { ctx, page };
  };
  const listTitles = page => page.locator(".wcard button.open").allInnerTexts();
  try {
    /* 기기 A: 세계관 하나를 가진 상태에서 가입 */
    const A = await device();
    const illustrationFixture = await A.page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 16; c.getContext("2d").fillRect(0, 0, 16, 16); return c.toDataURL("image/png"); });
    const backup = { app: "worldwiki", version: 1, worlds: [{ kind: "world", id: "wsync1", title: "동기화 세계", tagline: "", seed: "테스트 원안입니다.", era: "1900년", rules: [], timeline: [], userCanon: "", style: "encyc", entities: { e1: { title: "첫 문서", type: "인물", summary: "첫 문서다.", facts: [], mentions: [], page: true, box: "" } }, mainKey: "e1", createdAt: 1, updatedAt: 1000 }],
      pages: { wsync1: { e1: { key: "e1", title: "첫 문서", type: "인물", summary: "첫 문서다.", categories: [], notices: [], infobox: [], sections: [{ heading: "개요", level: 1, body: "원래 본문이다." }], links: [], shortStories: [{ id: "sync-short", title: "밤의 기록", body: "정비병은 잠시 손을 멈췄다.", illustration: illustrationFixture, createdAt: 1 }], createdAt: 1, savedAt: 1000 } } } };
    const f = path.join(os.tmpdir(), "ww-sync-backup.json"); fs.writeFileSync(f, JSON.stringify(backup));
    await A.page.setInputFiles("#importFile", f); await A.page.waitForTimeout(500);
    await A.page.fill("#acId", "테스터"); await A.page.fill("#acPw", "secret1");
    await A.page.click(".memo summary:has-text('처음이면 가입하기')"); await A.page.fill("#acInv", "초대암호");
    await A.page.click('[data-act="acct-signup"]');
    await A.page.waitForFunction(() => document.querySelector("#acctBox")?.textContent.includes("로그인되어 있습니다"));
    await until(() => row("SELECT 1 FROM pages WHERE wid = 'wsync1' AND pkey = 'e1'"), "A의 문서가 서버에 올라감");
    assert(row("SELECT data FROM worlds WHERE wid = 'wsync1'").data.includes("동기화 세계"));
    pass("가입하면 이 브라우저에 있던 세계관과 문서를 서버에 올린다");

    /* 기기 B: 로그인하면 받아 온다 */
    const B = await device();
    await B.page.fill("#acId", "테스터"); await B.page.fill("#acPw", "secret1"); await B.page.click('[data-act="acct-login"]');
    await B.page.waitForFunction(() => document.querySelector("#acctBox")?.textContent.includes("로그인되어 있습니다"));
    await B.page.click('#side [data-act="home"]');
    await until(async () => (await listTitles(B.page)).includes("동기화 세계"), "B의 초기 동기화 완료");
    assert.deepStrictEqual(await listTitles(B.page), ["동기화 세계"]);
    await B.page.click('.wcard button.open:has-text("동기화 세계")'); await B.page.waitForSelector(".article h2");
    assert((await B.page.locator(".article").innerText()).includes("원래 본문이다."));
    pass("다른 기기에서 같은 아이디로 로그인하면 세계관과 문서가 그대로 보인다");

    await B.page.click("[data-prose-open]"); await B.page.locator(".prose-saved summary").click();
    assert((await B.page.locator(".prose-saved .prose-text").innerText()).includes("정비병은 잠시"));
    assert.strictEqual(await B.page.locator(".prose-illustration img").getAttribute("src"), illustrationFixture);
    assert.strictEqual(JSON.parse(row("SELECT data FROM pages WHERE wid = 'wsync1' AND pkey = 'e1'").data).shortStories[0].id, "sync-short");
    await B.page.click('[data-act="prose-close"]');
    pass("문서에 보관한 단편과 삽화도 서버를 거쳐 다른 기기에서 API 키 없이 읽는다");

    // 이미지도 기존 문서 데이터로 동기화하며 별도 업로드 API를 쓰지 않는다.
    const png = Buffer.from(await B.page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = c.height = 32; c.getContext("2d").fillRect(0, 0, 32, 32);
      return c.toDataURL("image/png").split(",")[1];
    }), "base64");
    await B.page.locator("[data-portrait-file]").setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: png });
    await B.page.waitForSelector(".portrait img");
    const portrait = await B.page.locator(".portrait img").getAttribute("src");
    await until(() => JSON.parse(row("SELECT data FROM pages WHERE wid = 'wsync1' AND pkey = 'e1'").data).portrait === portrait, "이미지가 기존 동기화 API로 올라감");
    await A.page.click('[data-act="acct-sync"]');
    await A.page.click('#side [data-act="home"]'); await A.page.click('.wcard button.open:has-text("동기화 세계")');
    await A.page.waitForSelector(".portrait img");
    assert.strictEqual(await A.page.locator(".portrait img").getAttribute("src"), portrait);
    pass("프로필 이미지는 기존 문서 동기화로 다른 기기에 전달된다");

    await B.page.locator(".portrait-menu summary").click(); await B.page.click("[data-portrait-remove]");
    await until(() => !JSON.parse(row("SELECT data FROM pages WHERE wid = 'wsync1' AND pkey = 'e1'").data).portrait, "이미지 삭제가 서버에 올라감");
    await A.page.click('#side [data-act="gset"]'); await A.page.click('[data-act="acct-sync"]');
    await A.page.click('#side [data-act="home"]'); await A.page.click('.wcard button.open:has-text("동기화 세계")');
    assert.strictEqual(await A.page.locator(".portrait img").count(), 0);
    pass("이미지 삭제도 다른 기기에 동기화된다");

    /* B에서 고치면 A가 받는다 */
    await B.page.click("[data-edit]"); await B.page.waitForSelector("#edBody");
    await B.page.fill("#edBody", "= 개요 =\n기기 B에서 고친 본문이다.");
    await B.page.click('[data-act="ed-save"]'); await B.page.waitForSelector(".article h2");
    await until(() => (row("SELECT data FROM pages WHERE wid = 'wsync1' AND pkey = 'e1'")?.data || "").includes("기기 B에서 고친"), "B의 수정이 서버에 올라감");
    await A.page.click('#side [data-act="home"]'); await A.page.click('.wcard button.open:has-text("동기화 세계")'); await A.page.waitForSelector(".article h2");
    assert((await A.page.locator(".article").innerText()).includes("원래 본문이다."));
    await A.page.click('#side [data-act="gset"]'); await A.page.click('[data-act="acct-sync"]');
    await A.page.click('#side [data-act="home"]'); await A.page.click('.wcard button.open:has-text("동기화 세계")'); await A.page.waitForSelector(".article h2");
    await A.page.waitForFunction(() => document.querySelector(".article").innerText.includes("기기 B에서 고친 본문이다."));
    pass("한 기기에서 고친 문서를 다른 기기가 동기화하면 받는다");

    /* 새로고침해도 로그인이 유지되고, 오래된 수정이 최신을 덮지 않는다 */
    await A.page.reload(); await A.page.waitForFunction(() => S.ready && Nav.active);
    await A.page.click('#side [data-act="gset"]'); await A.page.waitForSelector("#acctBox");   // 새로고침은 원래 문서 주소를 복원하므로 계정 화면을 직접 연다
    assert((await A.page.locator("#acctBox").innerText()).includes("테스터"));
    assert.strictEqual(row("SELECT count(*) c FROM sessions").c, 2);
    pass("새로고침해도 로그인이 유지된다");

    /* 예전 기록을 든 기기가 저장해도 다른 기기의 대화를 덮지 않고 합친다 */
    const turnsOnServer = () => (JSON.parse(row("SELECT data FROM worlds WHERE wid = 'wsync1'")?.data || "{}").story?.chapters?.[0]?.dialogues?.e2?.turns || []).map(t => t.user);
    await A.page.evaluate(async () => { const w = await Store.getWorld("wsync1"); w.story = { protagonistKey: "e1", chapter: 1, total: 3, status: "active", chapters: [{ n: 1, title: "t", dialogues: { e2: { turns: [{ user: "하나", reply: "1", at: 1 }] } } }] }; await Store.saveWorld(w); });
    await until(() => turnsOnServer().join() === "하나", "첫 대화가 서버에 올라감");
    await B.page.evaluate(() => Sync.pull());
    await until(() => B.page.evaluate(async () => (await Store.getWorld("wsync1"))?.story?.chapters?.[0]?.dialogues?.e2?.turns?.length === 1), "B가 첫 대화를 받음");
    await A.page.evaluate(async () => { const w = await Store.getWorld("wsync1"); w.story.chapters[0].dialogues.e2.turns.push({ user: "둘", reply: "2", at: 2 }, { user: "셋", reply: "3", at: 3 }); await Store.saveWorld(w); });
    await until(() => turnsOnServer().join() === "하나,둘,셋", "A의 대화가 서버에 올라감");
    await B.page.evaluate(async () => { const w = await Store.getWorld("wsync1"); w.story.chapters[0].dialogues.e2.turns.push({ user: "넷", reply: "4", at: 4 }); await Store.saveWorld(w); });   // B는 받아 오기 전의 예전 기록에 저장한다
    await until(() => turnsOnServer().join() === "하나,둘,셋,넷", "B가 덮지 않고 합쳐서 올림");
    await A.page.evaluate(() => Sync.pull());
    await until(() => A.page.evaluate(async () => (await Store.getWorld("wsync1")).story.chapters[0].dialogues.e2.turns.map(t => t.user).join() === "하나,둘,셋,넷"), "A도 합친 기록을 받음");
    pass("예전 기록을 든 기기가 저장해도 다른 기기의 대화를 덮지 않고 합친다");
    const kept = await B.page.evaluate(async () => {   // 화면에 열린 예전 세계관 객체로 저장해도, 그사이 받아 둔 더 새 기록을 먼저 합친다
      const mem = await Store.getWorld("wsync1"), newer = JSON.parse(JSON.stringify(mem));
      newer.story.chapters[0].dialogues.e2.turns.push({ user: "다섯", reply: "5", at: 5 }); newer.updatedAt = mem.updatedAt + 10; await Store.putWorldRaw(newer); Sync.incoming.set("wsync1", newer.updatedAt);   // 동기화가 받아 저장한 것처럼
      mem.story.chapters[0].dialogues.e2.turns.push({ user: "여섯", reply: "6", at: 6 }); await Store.saveWorld(mem);
      return (await Store.getWorld("wsync1")).story.chapters[0].dialogues.e2.turns.map(t => t.user).join();
    });
    assert.strictEqual(kept, "하나,둘,셋,넷,다섯,여섯");
    pass("열린 세계관을 저장할 때도 그사이 받은 기록을 덮지 않는다");
    const revived = await B.page.evaluate(async () => {   // 서버 시점 복원에서 꺼낸 행(wrangler 출력)을 합치면 사라진 대화가 돌아온다
      const old = JSON.parse(JSON.stringify(await Store.getWorld("wsync1")));
      old.story.chapters[0].dialogues.e2.turns.splice(3, 0, { user: "사라졌던 말", reply: "돌아옴", at: 3.5 });
      const now = await Store.getWorld("wsync1"); now.story.chapters[0].dialogues.e2.turns = now.story.chapters[0].dialogues.e2.turns.filter(t => t.user === "하나"); await Store.saveWorld(now);
      const file = new File([JSON.stringify([{ results: [{ data: JSON.stringify(old) }], success: true }])], "world-backup.json");
      await mergeRecovered(file);
      return (await Store.getWorld("wsync1")).story.chapters[0].dialogues.e2.turns.map(t => t.user).join();
    });
    assert.strictEqual(revived, "하나,둘,셋,사라졌던 말,넷,다섯,여섯");
    pass("되살린 기록 합치기: 시점 복원에서 꺼낸 세계관을 덮지 않고 합쳐 사라진 대화를 되돌린다");
    { // GitHub 실행 결과는 zip으로 받아진다: 압축을 풀지 않고 골라도 합친다
      const zipped = await B.page.evaluate(async () => { const old = JSON.parse(JSON.stringify(await Store.getWorld("wsync1"))); old.story.chapters[0].dialogues.e2.turns.push({ user: "zip에서 온 말", reply: "z", at: 99 }); return JSON.stringify([old]); });
      const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "rz-")); fs.writeFileSync(path.join(dir, "recovered-worlds.json"), zipped);
      require("child_process").execFileSync("zip", ["-q", "-j", path.join(dir, "recovered-worlds.zip"), path.join(dir, "recovered-worlds.json")]);
      const bytes = [...fs.readFileSync(path.join(dir, "recovered-worlds.zip"))];
      const got = await B.page.evaluate(async bytes => { await mergeRecovered(new File([new Uint8Array(bytes)], "recovered-worlds.zip")); return (await Store.getWorld("wsync1")).story.chapters[0].dialogues.e2.turns.map(t => t.user); }, bytes);
      assert.ok(got.includes("zip에서 온 말")); pass("되살린 기록 합치기는 zip 파일도 바로 읽는다");
    }
    { // 되살린 파일에 문서가 있으면, 그 시점과 다른 문서는 그 시점 것으로 되돌린다
      const got = await B.page.evaluate(async () => {
        const w = await Store.getWorld("wsync1"), keys = Object.keys(await Store.listPages("wsync1")), k = keys[0];
        const good = JSON.parse(JSON.stringify(await Store.getPage("wsync1", k))); good.summary = "장 반영까지 된 문서";
        const stale = JSON.parse(JSON.stringify(good)); stale.summary = "덮인 예전 문서"; await Store.savePage("wsync1", stale);
        const same = keys[1] ? JSON.parse(JSON.stringify(await Store.getPage("wsync1", keys[1]))) : null;
        await mergeRecovered(new File([JSON.stringify({ worlds: [w], pages: [{ wid: "wsync1", at: "x", list: [good, ...(same ? [same] : [])] }] })], "r.json"));
        return { summary: (await Store.getPage("wsync1", k)).summary, toast: document.querySelector(".toast")?.innerText || "" };
      });
      assert.strictEqual(got.summary, "장 반영까지 된 문서"); assert.ok(got.toast.includes("문서 1개 되살림"), got.toast); pass("되살린 기록 합치기는 덮인 문서도 그 시점 것으로 되돌린다");
    }
    { // 오래된 기록을 든 기기가 올려도 서버는 덮지 않고 서버 기록을 돌려주며, 기기는 합쳐서 다시 올린다
      await B.page.evaluate(() => Sync.push()); await until(() => B.page.evaluate(() => !Sync.pending() && !Sync.busy), "B 올리기 끝");
      const before = JSON.parse(row("SELECT data FROM worlds WHERE wid = 'wsync1'").data).story.chapters[0].dialogues.e2.turns.length;
      await A.page.evaluate(async () => { const w = await Store.getWorld("wsync1"); w.story.chapters[0].dialogues.e2.turns = w.story.chapters[0].dialogues.e2.turns.slice(0, 1); w.updatedAt = Date.now(); await Store.putWorldRaw(w); Sync.setBase("wsync1", 1); Sync.mark("w", "wsync1"); Sync._prePull = true; await Sync.push(); Sync._prePull = false; });
      await until(() => A.page.evaluate(() => !Sync.pending() && !Sync.busy), "A 다시 올리기 끝", 20000);
      const after = JSON.parse(row("SELECT data FROM worlds WHERE wid = 'wsync1'").data).story.chapters[0].dialogues.e2.turns.length;
      assert.ok(after >= before, `서버 기록이 줄면 안 된다 (${before} → ${after})`); pass("오래된 기록으로 올려도 서버 세계관을 덮지 않고 합친다");
    }

    /* B에서 세계관을 지우면 A에서도 사라진다 */
    await B.page.click('#side [data-act="home"]');
    await B.page.click('[data-del="wsync1"]'); await B.page.click('[data-del-yes="wsync1"]');
    await until(() => row("SELECT deleted FROM worlds WHERE wid = 'wsync1'")?.deleted === 1, "삭제가 서버에 올라감");
    await A.page.click('#side [data-act="gset"]').catch(() => {}); await A.page.click('[data-act="acct-sync"]');
    await A.page.click('#side [data-act="home"]');
    await A.page.waitForFunction(() => !document.querySelector(".wcard"), null, { timeout: 10000 });
    pass("한 기기에서 지운 세계관은 다른 기기에서도 사라진다");

    /* 로그아웃 */
    await B.page.click('#side [data-act="gset"]'); await B.page.click('[data-act="acct-logout"]');
    await B.page.waitForFunction(() => document.querySelector("#acctBox")?.textContent.includes("처음이면 가입하기"));
    assert.strictEqual(row("SELECT count(*) c FROM sessions").c, 1);
    pass("로그아웃하면 그 기기의 로그인이 서버에서도 끊긴다");

    /* 틀린 비밀번호 */
    await B.page.fill("#acId", "테스터"); await B.page.fill("#acPw", "wrongpw"); await B.page.click('[data-act="acct-login"]');
    await B.page.waitForFunction(() => document.querySelector("#acctBox")?.textContent.includes("아이디나 비밀번호가 맞지 않습니다"));
    pass("비밀번호가 틀리면 로그인되지 않는다");
    await A.ctx.close(); await B.ctx.close();
    console.log(`\n모두 통과 (${ok}개)`);
  } catch (e) { console.error("\n실패:", e); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
