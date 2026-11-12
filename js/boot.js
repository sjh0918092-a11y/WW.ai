"use strict";
/* 시작 */
/* ---------- boot ---------- */
(async function boot() {
  renderAll();
  setInterval(() => { if (S.gen) updateGenLive(); if (S.storyGen) updateStoryLive(); const ct = $("#chkTick"); if (ct && S.checking && S.checkT0) ct.textContent = Math.floor((performance.now() - S.checkT0) / 1000) + "초"; const t = $("#fxTick"); if (t && S.fixv?.t0) t.textContent = Math.floor((performance.now() - S.fixv.t0) / 1000) + "초"; }, 1000);
  const inv = /(?:^#|&)relay=([^&]+)/.exec(location.hash || "");   // 초대 링크(#relay=주소)로 들어오면 중계 서버 주소를 채운다
  let invited = false;
  if (inv) { const u = normRelay(decodeURIComponent(inv[1])); if (/^https:\/\//i.test(u)) { const same = GS.mode === "relay" && GS.relay === u; GS = { ...GS, mode: "relay", relay: u, pass: same ? GS.pass : "" }; saveGS(); invited = !GS.pass; } history.replaceState(null, "", location.pathname + location.search); }
  S.sample = gReady() ? gemini : null; S.sampleReady = true;
  await Store.init();
  try { S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  catch (e) { toast("세계관 목록을 불러오지 못했습니다. " + errMsg(e)); }
  if (Sync.acct) { Sync.load(); await Sync.pull(); S.worlds = (await Store.listWorlds()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); Sync.push(); }   // 로그인되어 있으면 서버에서 바뀐 것을 받고 남은 변경을 올린다
  S.ready = true; S.view = gReady() ? { name: "home" } : { name: "gset" };
  if (invited) S.gres = "초대 링크로 중계 서버 주소가 채워졌습니다. 받은 접속 암호를 넣고 저장해 주세요.";
  Nav.active = true;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const route = Nav.read();
  if (route && !invited) await Nav.restore(route, history.state?.wwNav);
  else { renderAll(); Nav.write(true); }
})();
