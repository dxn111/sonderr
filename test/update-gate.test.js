"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const updates = require("../server/updates");

assert.deepEqual(updates.parseVersion("v1.5.10"), { major: 1, minor: 5, patch: 10, prerelease: "" });
assert.equal(updates.parseVersion("1.05.2"), null, "ambiguous zero-padded versions are rejected");
assert.equal(updates.compareVersions("1.5.10", "1.5.9"), 1, "patch versions compare numerically, not lexically");
assert.equal(updates.compareVersions("1.6.0", "1.5.99"), 1);
assert.equal(updates.compareVersions("1.5.9", "1.5.9"), 0);
assert.equal(updates.compareVersions("1.5.9-beta.2", "1.5.9"), -1);

const managedPath = path.resolve("/tmp/sonderr-update-gate/home/.local/share/sonderr-v1.5");
const env = { HOME: "/tmp/sonderr-update-gate/home", XDG_DATA_HOME: "/tmp/sonderr-update-gate/home/.local/share" };
assert.equal(updates.isManagedInstall(managedPath, env), true);
assert.equal(updates.isManagedInstall(path.dirname(managedPath), env), false, "a source checkout must never be overwritten by the updater");

(async () => {
  let fetched = 0;
  const dev = await updates.checkForUpdate({ root: "/tmp/sonderr-source-checkout", currentVersion: "1.5.9", env, releaseFetcher: async () => { fetched++; throw new Error("must not fetch for development sources"); } });
  assert.equal(dev.status, "development");
  assert.equal(fetched, 0);

  const releaseFetcher = async () => ({
    tag: "v1.5.10", version: "1.5.10", title: "Sonderr v1.5.10",
    notes: "Security maintenance and improvements.", publishedAt: "2026-09-25T00:00:00Z",
    url: "https://github.com/dxn111/sonderr/releases/tag/v1.5.10"
  });
  const pending = await updates.checkForUpdate({ root: managedPath, currentVersion: "1.5.9", env, force: true, releaseFetcher });
  assert.equal(pending.status, "update-required");
  assert.equal(pending.latestTag, "v1.5.10");
  assert.equal(pending.updateAvailable, true);

  const current = await updates.checkForUpdate({ root: managedPath, currentVersion: "1.5.10", env, force: true, releaseFetcher });
  assert.equal(current.status, "current");
  assert.equal(current.updateAvailable, false);

  const unavailable = await updates.checkForUpdate({ root: managedPath, currentVersion: "1.5.9", env, force: true, releaseFetcher: async () => { throw new Error("network detail stays private"); } });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.message.includes("network detail"), false, "raw network errors are not shown in the mandatory update screen");

  await assert.rejects(() => updates.startInstall({ root: "/tmp/sonderr-source-checkout", currentVersion: "1.5.9", tag: "v1.5.10", port: 4173, env }), /standard managed Sonderr install/i);
  console.log("required update gate tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
