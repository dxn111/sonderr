"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const originalCwd = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-mcp-security-"));
process.chdir(tempDir);

try {
  const mcp = require("../server/mcp");
  const publicServer = mcp.addServer({ id: "safe-server", name: "Safe server", command: "node", args: ["server.js"] });
  assert.equal(publicServer.id, "safe-server");
  assert.equal(fs.statSync(path.dirname(mcp.CONFIG_FILE)).mode & 0o777, 0o700, "MCP config directory is owner-only");
  assert.equal(fs.statSync(mcp.CONFIG_FILE).mode & 0o777, 0o600, "MCP config file is owner-only");
  assert.throws(() => mcp.addServer({ id: "bad-cli", name: "Bad CLI", command: "node", args: ["--api-key", "do-not-store-this"] }), /Do not put credentials/i);
  assert.throws(() => mcp.addServer({ id: "bad-env", name: "Bad env", command: "node", env: { PRIVATE_TOKEN: "do-not-store-this" } }), /Do not save credential values/i);
  assert.throws(() => mcp.addServer({ id: "bad-url", name: "Bad URL", url: "https://mcp.example.test/api?access_token=do-not-store-this" }), /query parameters/i);
  const publicJson = JSON.stringify(mcp.listServers());
  assert.equal(publicJson.includes("do-not-store-this"), false, "rejected credentials never enter public MCP metadata");
  console.log("MCP credential storage and file-permission tests passed");
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
