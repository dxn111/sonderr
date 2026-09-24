"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-http-security-"));
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
