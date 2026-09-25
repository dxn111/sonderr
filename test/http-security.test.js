"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-http-security-"));
const updates = require("../server/updates");
const { createServer } = require("../server/app");

function request(port, { path = "/", method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  try {
    const homepage = await request(port);
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers["content-security-policy"], /default-src 'self'/);
    assert.equal(homepage.headers["x-frame-options"], "DENY");
    const studiosPage = await request(port, { path: "/studios" });
    assert.equal(studiosPage.status, 200);
    assert.match(studiosPage.body, /id="studiosHome"/);
    const developmentUpdateCheck = await request(port, { path: "/api/update-check" });
    assert.equal(developmentUpdateCheck.status, 200);
    assert.equal(JSON.parse(developmentUpdateCheck.body).status, "development", "a source checkout is never force-updated over local changes");
    const originalUpdateCheck = updates.checkForUpdate;
    updates.checkForUpdate = async () => ({ status: "update-required", currentVersion: "1.5.9", latestVersion: "1.5.10", latestTag: "v1.5.10", updateAvailable: true });
    const blockedWorkspaceApi = await request(port, { path: "/api/sessions" });
    assert.equal(blockedWorkspaceApi.status, 426, "the server blocks workspace APIs, not only the visible UI, while an update is required");
    const allowedUpdateMetadata = await request(port, { path: "/api/update-check" });
    assert.equal(allowedUpdateMetadata.status, 200, "the gate keeps only health/update endpoints available");
    updates.checkForUpdate = originalUpdateCheck;
    const trustedHeaders = { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` };
    const createdStudio = await request(port, { path: "/api/sessions", method: "POST", headers: trustedHeaders, body: JSON.stringify({ title: "Studio smoke", surface: "studios", studio: { track: "developer", goal: "Ship a small fix", milestones: [{ text: "Inspect the code" }] } }) });
    assert.equal(createdStudio.status, 201);
    const studioId = JSON.parse(createdStudio.body).session.id;
    const updatedStudio = await request(port, { path: `/api/studios/projects/${studioId}`, method: "POST", headers: trustedHeaders, body: JSON.stringify({ studio: { track: "developer", goal: "Ship a tested fix", milestones: [{ text: "Inspect the code", done: true }] } }) });
    assert.equal(updatedStudio.status, 200);
    assert.equal(JSON.parse(updatedStudio.body).session.studio.milestones[0].done, true);
    const reloadedStudio = await request(port, { path: `/api/sessions/${studioId}` });
    assert.equal(JSON.parse(reloadedStudio.body).session.studio.goal, "Ship a tested fix");

    const blockedHost = await request(port, { path: "/api/health", headers: { Host: "untrusted.example" } });
    assert.equal(blockedHost.status, 403);

    const blockedOrigin = await request(port, { path: "/api/sessions", method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: "{}" });
    assert.equal(blockedOrigin.status, 403);

    const originlessWalletConfirmation = await request(port, { path: "/api/wallet/confirm", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessWalletConfirmation.status, 403);
    const trustedWalletConfirmation = await request(port, { path: "/api/wallet/confirm", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedWalletConfirmation.status, 502);
    const originlessSwapConfirmation = await request(port, { path: "/api/wallet/swap/confirm", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessSwapConfirmation.status, 403);
    const trustedSwapConfirmation = await request(port, { path: "/api/wallet/swap/confirm", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedSwapConfirmation.status, 502);

    const originlessWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain: "evm", network: "sepolia" }) });
    assert.equal(originlessWalletNetwork.status, 403);
    const trustedWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ chain: "evm", network: "sepolia" }) });
    assert.equal(trustedWalletNetwork.status, 200);
    assert.equal(JSON.parse(trustedWalletNetwork.body).wallet.activeNetworks.evm, "sepolia");
    const invalidWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ chain: "evm", network: "devnet" }) });
    assert.equal(invalidWalletNetwork.status, 400, "an unsupported network must not silently fall back to mainnet");

    const originlessWalletDecline = await request(port, { path: "/api/wallet/decline", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessWalletDecline.status, 403);
    const trustedWalletDecline = await request(port, { path: "/api/wallet/decline", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedWalletDecline.status, 410);

    const watchOff = await request(port, { path: "/api/wallet/watch" });
    assert.equal(watchOff.status, 200);
    assert.equal(JSON.parse(watchOff.body).watch.enabled, false);
    const watchOn = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: true }) });
    assert.equal(watchOn.status, 200);
    assert.equal(JSON.parse(watchOn.body).watch.enabled, true);
    const watchInvalid = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: "false" }) });
    assert.equal(watchInvalid.status, 400, "watch preference requires an actual boolean");
    const watchOffAgain = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: false }) });
    assert.equal(JSON.parse(watchOffAgain.body).watch.enabled, false);

    const protectedFile = await request(port, { path: "/api/file?path=.env" });
    assert.equal(protectedFile.status, 403);

    const oversizedBody = await request(port, { path: "/api/sessions", method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(2_000_001) });
    assert.equal(oversizedBody.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log("http security tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
