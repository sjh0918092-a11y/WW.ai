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
   if (!localStorage.getItem('wwiki:gemini')) localStorage.setItem('wwiki:gemini', JSON.stringify({ key: 'old-gemini-secret', openaiKey: 'old-openai-secret', serverKeys: true, mode: 'key', relay: 'https://relay.test', pass: 'invitation', main: 'claude-sonnet-4-5', quick: 'claude-sonnet-4-5', documentPipeline: false }));
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
    saveGS(); const personalBlocked = !Object.hasOwn(GS, "openaiKey");
    return { sharedImage, answer, provider, blocked, personalBlocked };
   } finally { AIJobs.run = original; }
  });
  assert.deepEqual(result, { sharedImage: true, answer: { ok: true }, provider: 'claude.generate', blocked: true, personalBlocked: true });
  await page.click('#side [data-act="gset"]');
  assert.equal(await page.locator('#gKey, #gOpenAI, #gServerKeys, #gMode').count(), 0);
  for (const id of ['gMain','gQuick','gCheck','gImage']) assert.equal(await page.locator('#' + id).evaluate(e => e.tagName), 'SELECT');
  assert.equal(await page.locator('#gAdvanced').getAttribute('open'), null);
  assert.equal(await page.locator('.gset #gQuick, .gset #gCheck, .gset #gImage, .gset #acctBox').count(), 4);
  await page.selectOption('#gMain', 'claude-opus-4-5');
  await page.locator('#gAdvanced summary').click();
  assert((await page.locator('#gMainT option[value="high"]').innerText()).includes('8,192'));
  await page.selectOption('#gMainT', 'high');
  await page.selectOption('#gCheck', '');
  assert((await page.locator('#gCheckT option[value="medium"]').innerText()).includes('4,096'));
  await page.selectOption('#gCheckT', 'medium');
  await page.selectOption('#gQuick', 'gemini-3.5-flash-lite');
  assert.equal(await page.locator('#gQuickT option[value="high"]').innerText(), 'high');
  await page.selectOption('#gCheck', '');
  await page.selectOption('#gImage', 'gemini-3-pro-image');
  await page.click('[data-act="gset-save"]');
  await page.reload(); await page.waitForSelector('#gMain');
  assert.equal(await page.inputValue('#gMain'), 'claude-opus-4-5');
  assert.equal(await page.inputValue('#gCheck'), '');
  assert.equal(await page.inputValue('#gMainT'), 'high');
  assert.equal(await page.inputValue('#gCheckT'), 'medium');
  const thinkingCalls = await page.evaluate(async () => {
    const calls = [], original = AIJobs.run;
    AIJobs.run = async (type, model, input) => { calls.push({type,model,input}); return {candidates:[{content:{parts:[{text:'{"ok":true}'}]},finishReason:'STOP'}]}; };
    try { await gemini.json('test'); await gemini.json('test', {modelTier:'check'}); return calls; }
    finally { AIJobs.run = original; }
  });
  assert.equal(thinkingCalls[0].input.generationConfig.thinkingConfig.thinkingLevel, 'high');
  assert.equal(thinkingCalls[1].input.generationConfig.thinkingConfig.thinkingLevel, 'medium');
  const failure = await page.evaluate(async () => {
    const original = AIJobs.run; let calls = 0;
    AIJobs.run = async () => { calls++; throw {code:'api_400',message:'thinking unsupported',serverJob:true}; };
    try { await gemini.json('test'); return {calls}; }
    catch (error) { return {calls, code:error.code}; }
    finally { AIJobs.run = original; }
  });
  assert.deepEqual(failure, {calls:1,code:'api_400'});
  const saved = await page.evaluate(() => localStorage.getItem('wwiki:gemini'));
  assert(!saved.includes('old-gemini-secret') && !saved.includes('old-openai-secret'));
  assert(!saved.includes('serverKeys') && !saved.includes('openaiKey'));
  // A previously saved model remains selectable even when absent from the current catalog.
  await page.evaluate(() => { GS.main = 'custom-saved-model'; renderMain(); });
  assert.equal(await page.inputValue('#gMain'), 'custom-saved-model');
  await page.route('**/v1beta/models?*', route => route.fulfill({ json: { models: [{name:'models/gemini-account-model',displayName:'계정 모델',supportedGenerationMethods:['generateContent']}] } }));
  await page.click('[data-act="gset-models"]');
  await page.waitForSelector('#gMain option[value="gemini-account-model"]', { state: 'attached' });
  assert.equal(await page.locator('#gMain option[value="claude-sonnet-4-5"]').count(), 1);
  await page.selectOption('#gMain', 'claude-sonnet-4-5');
  await page.evaluate(() => { GS.relay = DEFAULT_RELAY; S.gres = ''; renderMain(); window.scrollTo(0,0); });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/ww-ai-settings-mobile.png',fullPage:true});
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/ww-ai-settings-desktop.png',fullPage:true});
  console.log('✓ Server-only settings migrate secrets, preserve model choices, refresh options, and fit mobile');
 } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
