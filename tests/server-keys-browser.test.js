const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { appServer } = require('./helpers/app');
(async () => {
 const server = appServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
 const browser = await chromium.launch();
 try {
  const page = await browser.newPage();
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.route('**/api/**', r => r.fulfill({ json: { worlds: [], pages: [], next: 0 } }));
  await page.addInitScript(() => {
   localStorage.setItem('wwiki:gemini', JSON.stringify({ mode: 'relay', relay: 'https://relay.test', pass: 'invitation', main: 'claude-sonnet-4-5', quick: 'claude-sonnet-4-5', documentPipeline: false }));
   localStorage.setItem('wwiki:acct', JSON.stringify({ id: 'tester', token: 'session-test', since: 0 }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => S.ready);
  const result = await page.evaluate(async () => {
   const calls = [], original = AIJobs.run;
   AIJobs.run = async (...args) => { calls.push(args.slice(0, 3)); return { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }; };
   try {
    const sharedImage = imageReady('gpt-image-1');
    const answer = await gemini.json('Return JSON');
    const provider = calls[0][0];
    GS.serverJobs = false;
    let blocked = false;
    try { await gemini.json('Return JSON'); } catch (e) { blocked = e.code === 'job_unavailable'; }
    GS.serverJobs = true; GS.openaiKey = 'personal'; GS.serverKeys = false;
    const personalBlocked = !AIJobs.enabled('openai');
    return { sharedImage, answer, provider, blocked, personalBlocked };
   } finally { AIJobs.run = original; }
  });
  assert.deepEqual(result, { sharedImage: true, answer: { ok: true }, provider: 'claude.generate', blocked: true, personalBlocked: true });
  console.log('✓ Browser routes Claude to server, enables shared OpenAI images, and respects personal-key consent');
 } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
