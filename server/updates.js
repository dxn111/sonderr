"use strict";

const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const safety = require("./safety");

const REPOSITORY = "dxn111/sonderr";
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPOSITORY}/releases/latest`;
const CHECK_CACHE_MS = 5 * 60 * 1000;
const MAX_RELEASE_BYTES = 96 * 1024;
let cachedCheck = null;
let installInProgress = false;
let installStartPending = false;

function parseVersion(input) {
  const match = String(input || "").trim().replace(/^v/i, "").match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] || "" };
}

function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) throw new Error("Cannot compare malformed Sonderr versions.");
  for (const key of ["major", "minor", "patch"]) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function managedInstallPath(env = process.env) {
  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.resolve(env.SONDERR_INSTALL_DIR || path.join(dataHome, "sonderr-v1.5"));
}

function isManagedInstall(root, env = process.env) {
  return path.resolve(String(root || "")) === managedInstallPath(env);
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Sonderr-required-update-check"
      },
      timeout: 6000
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GitHub release check returned HTTP ${response.statusCode || "unknown"}.`));
        return;
      }
      let raw = "", bytes = 0;
      response.setEncoding("utf8");
      response.on("data", chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_RELEASE_BYTES) {
          request.destroy(new Error("GitHub release metadata exceeded its size limit."));
          return;
        }
        raw += chunk;
      });
      response.on("end", () => {
        try {
          const release = JSON.parse(raw);
          const tag = String(release.tag_name || "");
          const version = tag.replace(/^v/i, "");
          if (!/^v\d+\.\d+\.\d+$/.test(tag) || !parseVersion(version) || release.draft || release.prerelease) {
            reject(new Error("The latest GitHub release has an invalid or non-stable version tag."));
            return;
          }
          resolve({
            tag,
            version,
            title: safety.redactText(String(release.name || `Sonderr v${version}`)).slice(0, 160),
            notes: safety.redactText(String(release.body || "")).slice(0, 8000),
            publishedAt: String(release.published_at || "").slice(0, 40),
            url: `${RELEASES_PAGE.replace(/\/latest$/, "")}/tag/${encodeURIComponent(tag)}`
          });
        } catch (error) {
          reject(error instanceof SyntaxError ? new Error("GitHub returned invalid release metadata.") : error);
        }
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("GitHub release check timed out.")));
    request.on("error", reject);
  });
}

async function checkForUpdate({ root = path.resolve(__dirname, ".."), currentVersion = "0.0.0", force = false, releaseFetcher = fetchLatestRelease, env = process.env } = {}) {
  const current = String(currentVersion);
  if (!parseVersion(current)) return { status: "unavailable", currentVersion: current, message: "This build has an invalid version and cannot verify required updates." };
  if (!isManagedInstall(root, env)) return { status: "development", currentVersion: current, updateAvailable: false, message: "Development checkout — managed release update policy does not apply." };
  if (installInProgress) return { status: "installing", currentVersion: current, updateAvailable: true, message: "The required update is installing." };
  if (!force && cachedCheck && Date.now() - cachedCheck.checkedAt < CHECK_CACHE_MS && cachedCheck.currentVersion === current) return cachedCheck.value;
  let value;
  try {
    const release = await releaseFetcher();
    const comparison = compareVersions(release.version, current);
    value = {
      status: comparison > 0 ? "update-required" : "current",
      currentVersion: current,
      latestVersion: release.version,
      latestTag: release.tag,
      title: release.title,
      notes: release.notes,
      publishedAt: release.publishedAt,
      releaseUrl: release.url,
      updateAvailable: comparison > 0,
      installSupported: process.platform !== "win32" && fs.existsSync(path.resolve(root, "scripts", "update-release.sh"))
    };
  } catch {
    value = {
      status: "unavailable",
      currentVersion: current,
      updateAvailable: false,
      message: "Sonderr could not verify the latest official release. Reconnect and retry; this version stays locked until its update status can be verified."
    };
  }
  cachedCheck = { checkedAt: Date.now(), currentVersion: current, value };
  return value;
}

async function startInstall({ root = path.resolve(__dirname, ".."), currentVersion = "0.0.0", tag, port, workspace = process.cwd(), env = process.env } = {}) {
  if (!isManagedInstall(root, env)) throw new Error("Automatic updates are available only for the standard managed Sonderr install. Development checkouts are never overwritten.");
  if (process.platform === "win32") throw new Error("The one-click updater is not available on Windows yet. Follow the release page's manual upgrade instructions.");
  if (installInProgress || installStartPending) throw new Error("A Sonderr update is already running.");
  installStartPending = true;
  try {
    const check = await checkForUpdate({ root, currentVersion, force: true, env });
    if (check.status !== "update-required" || !check.latestTag || check.latestTag !== String(tag || "")) throw new Error("The update changed or could not be verified. Check for updates again before installing.");
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) throw new Error("The local app port could not be verified; restart Sonderr and retry.");
    const script = path.resolve(root, "scripts", "update-release.sh");
    const safeWorkspace = path.resolve(String(workspace || os.homedir()));
    const child = spawn("sh", [script, check.latestTag, String(numericPort), String(process.pid), safeWorkspace], {
      cwd: root,
      env: { ...env, SONDERR_UPDATE_INSTALL_DIR: managedInstallPath(env) },
      detached: true,
      stdio: "ignore"
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    installInProgress = true;
    return { ok: true, restarting: true, version: check.latestVersion };
  } finally { installStartPending = false; }
}

function requestShutdownAfterResponse(res) {
  res.once("finish", () => {
    const timer = setTimeout(() => process.kill(process.pid, "SIGTERM"), 300);
    timer.unref?.();
  });
}

module.exports = { REPOSITORY, parseVersion, compareVersions, managedInstallPath, isManagedInstall, fetchLatestRelease, checkForUpdate, startInstall, requestShutdownAfterResponse };
