"use strict";
/* 시작 */
/* ---------- boot ---------- */
(async function boot() {
  renderAll();
  setInterval(() => { if (S.gen) updateGenLive(); if (S.storyGen) updateStoryLive(); const ct = $("#chkTick"); if (ct && S.checking && S.checkT0) ct.textContent = Math.floor((performance.now() - S.checkT0) / 1000) + "초"; const t = $("#fxTick"), fv = curFix(); if (t && fv?.t0) t.textContent = Math.floor((performance.now() - fv.t0) / 1000) + "초"; for (const el of document.querySelectorAll("[data-fxt]")) { const v = S.fixJobs.get(el.dataset.fxt); if (v?.t0) el.textContent = Math.floor((performance.now() - v.t0) / 1000) + "초"; } }, 1000);
  const inv = /(?:^#|&)relay=([^&]+)/.exec(location.hash || "");   // 초대 링크(#relay=주소)로 들어오면 중계 서버 주소를 채운다
  let invited = false;
  if (inv) { const u = normRelay(decodeURIComponent(inv[1])); if (/^https:\/\//i.test(u)) { const same = GS.mode === "relay" && GS.relay === u; GS = { ...GS, mode: "relay", relay: u, pass: same ? GS.pass : "" }; saveGS(); invited = !GS.pass; } history.replaceState(null, "", location.pathname + location.search); }
  S.sample = gReady() ? gemini : null; S.sampleReady = true;
  await Store.init();
  try { S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  catch (e) { toast("세계관 목록을 불러오지 못했습니다. " + errMsg(e)); }
  // 로그인되어 있으면 서버에서 바뀐 것을 받고 남은 변경을 올린다. 서버가 늦거나 응답하지 않아도 첫 화면을 막지 않도록 4초까지만 기다리고, 나머지는 뒤에서 받아 화면에 반영한다(Sync.refresh)
  if (Sync.acct) { Sync.load(); const synced = Sync.pull().then(() => Sync.push()).catch(() => {}); await Promise.race([synced, new Promise(r => setTimeout(r, 4000))]); S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  S.ready = true; S.view = gReady() ? { name: "home" } : { name: "gset" };
  if (invited) S.gres = "초대 링크로 중계 서버 주소가 채워졌습니다. 받은 접속 암호를 넣고 저장해 주세요.";
  Nav.active = true;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const route = Nav.read();
  // 복구 기록은 작업 수 배지로 알린다. 첫 화면이나 명시한 문서 주소를 덮어쓰지 않는다.
  if (route && !invited) await Nav.restore(route, history.state?.wwNav);
  else { renderAll(); Nav.write(true); }
  AIRecovery.start();
})();
