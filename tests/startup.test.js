const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
(async () => {
 const server = appServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
 const browser = await chromium.launch();
 try {
  const context = await browser.newContext(), page = await context.newPage(), errors = [], submissions = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('https://fonts.googleapis.com/**', r => r.abort());
  await context.route('https://fonts.gstatic.com/**', r => r.abort());
  await context.addInitScript(() => {
   localStorage.setItem('wwiki:gemini', JSON.stringify({mode:'relay',relay:'https://relay.test',pass:'test-pass'}));
   localStorage.setItem('wwiki:acct', JSON.stringify({id:'tester',token:'test-token',since:0}));
   for (const [id,status] of [['old-finished-job001','succeeded'],['new-failed-job0001','failed']]) localStorage.setItem('wwiki:job:'+id, JSON.stringify({id,status,owner:'tester',base:'https://relay.test/api',createdAt:Date.now()+(status==='failed'?1000:0),meta:{kind:'page',recoveryV:1,title:'남은 작업'}}));
  });
  await context.route('**/api/**', async route => {
   const req = route.request();
   if (req.method()==='POST' && req.url().endsWith('/jobs')) submissions.push(req.postData());
   if (/\/jobs\/[^/]+$/.test(req.url())) return route.fulfill({json:{job:{id:req.url().split('/').at(-1),status:'failed',meta:{kind:'page',recoveryV:1}},result:undefined}});
   await route.fulfill({json:{jobs:[],worlds:[],pages:[],next:0}});
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => S.ready && Nav.active);
  assert.equal(await page.evaluate(() => S.view.name), 'home');
  assert.equal(await page.evaluate(() => AIRecovery.count()), 2);
  assert((await page.locator('#side [data-act="jobs"]').innerText()).includes('2'));
  await page.goto(url+'#view=home'); await page.waitForFunction(() => S.ready);
  assert.equal(await page.evaluate(() => S.view.name), 'home');
  await page.goto(url+'#view=gset'); await page.waitForSelector('#gMain');
  await page.goto(url+'#view=jobs&job=old-finished-job001');
  await page.waitForFunction(() => AIRecovery.selected === 'old-finished-job001');
  assert.equal(await page.evaluate(() => S.view.job), 'old-finished-job001');
  await page.reload(); await page.waitForFunction(() => AIRecovery.selected === 'old-finished-job001');
  await page.goto(url); await page.waitForFunction(() => S.ready);
  assert.equal(await page.evaluate(() => S.view.name), 'home');
  assert.deepEqual(errors, []); assert.equal(submissions.length, 0);
  console.log('✓ Old results do not hijack home/settings; explicit job links and their reloads still work without AI submissions');
 } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
