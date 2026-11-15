const assert = require('node:assert/strict'), { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
const server = appServer();
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => S.ready);
    await page.evaluate(async () => {
      GS = { ...GS, mode: 'key', key: 'fake-test-key', serverJobs: false };
      S.sample = gemini;
      gemini.stream = async () => ({ text: '{"issues":[],"edits":[],"facts":[]}', finish: 'STOP' });
      for (const kind of ['page', 'check', 'read', 'fix', 'factSync']) {
        await callJson(kind, '공통 지침\n## 세계관 원안\n항구의 작은 세계\n## 관련 항목의 확정 설정\n항해자의 기록 <script>test</script>', {}, { title: '항구' });
      }
      await logSave; S.view = { name: 'log' }; renderAll();
    });
    assert.equal(await page.locator('#main > .sheet > details.memo').filter({ has: page.locator('table') }).count(), 5);
    await page.locator('#main > .sheet > details.memo').filter({ has: page.locator('table') }).first().locator('summary').first().click();
    assert(await page.getByRole('columnheader', { name: '글자수' }).first().isVisible());
    await page.screenshot({ path: '/tmp/worldwiki-input-log.png' });
    await page.reload(); await page.waitForFunction(() => S.ready);
    assert.equal(await page.evaluate(() => LOG.filter(r => r.input?.messages).length), 5);
    assert.equal(await page.evaluate(() => LOG[0].requests[0].messages[0].text.includes('<script>test</script>')), true);
    await page.evaluate(() => { S.view = { name: 'log' }; renderAll(); });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '전문 로그 내려받기' }).click();
    assert((await downloaded).suggestedFilename().endsWith('.txt'));
    await page.getByRole('button', { name: '지우기', exact: true }).click();
    await page.evaluate(() => logSave);
    await page.reload(); await page.waitForFunction(() => S.ready);
    assert.equal(await page.evaluate(() => LOG.length), 0);
    assert.deepEqual(errors, []);
    console.log('통과: 5단계 실제 입력 기록·화면 구간 표·새로고침 복원·내려받기·지우기');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
