"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-secrets-test-"));
const home = path.join(root, "home");
fs.mkdirSync(home);
process.env.HOME = home;
const secrets = require("../server/secrets");

try {
  secrets.set("EXAMPLE_API_KEY", "test-secret-value");
  assert.equal(secrets.get("EXAMPLE_API_KEY"), "test-secret-value");
  assert.equal(fs.statSync(path.join(home, ".sonderr")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(secrets.ENV_FILE).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(secrets.ENV_FILE, "utf8").includes("test-secret-value"), true, "the local secret is stored for use by the configured integration");
  secrets.remove("EXAMPLE_API_KEY");
  assert.equal(secrets.get("EXAMPLE_API_KEY"), "");
  assert.throws(() => secrets.remove("BAD.*KEY"), /Invalid secret name/);

  const linkedHome = path.join(root, "linked-home");
  const outside = path.join(root, "outside");
  fs.mkdirSync(linkedHome); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(linkedHome, ".sonderr"), "dir");
  const entry = path.resolve(__dirname, "../server/secrets.js");
  const blocked = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(entry)}).set("API_KEY", "must-not-write")`], {
    env: { ...process.env, HOME: linkedHome },
    encoding: "utf8"
  });
  assert.notEqual(blocked.status, 0, "secret storage refuses a symlinked private-data directory");
  assert.equal(fs.existsSync(path.join(outside, ".env")), false, "a symlink cannot redirect credentials outside the intended data folder");
  console.log("secret-store permission and symlink tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
