"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const https = require("node:https");
const { spawn } = require("node:child_process");
const { DATA_DIR } = require("./store");

const MODEL_URL = "https://github.com/dxn111/sonderr/releases/download/v1.5.11/sonderr-v1-merged-model.tar";
const MODEL_SHA256 = "e1c58769ce9b85989a3c03dd3d042257a5e3673d30bbe866fa8a238d9bb8e612";
const MODEL_DIR = path.join(DATA_DIR, "models", "sonderr-v1");
const RUNTIME_DIR = path.join(DATA_DIR, "runtime", "sonderr-v1");
const VENV_DIR = path.join(RUNTIME_DIR, "venv");
const PYTHON = path.join(VENV_DIR, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const READY_FILE = path.join(RUNTIME_DIR, "ready.json");
const ARCHIVE = path.join(DATA_DIR, "downloads", "sonderr-v1.tar");
const state = { status: "not-installed", stage: "", progress: 0, downloaded: 0, total: 1004011520, error: "" };
let active = false;

function ready() {
  return fs.existsSync(path.join(MODEL_DIR, "config.json")) && fs.existsSync(PYTHON) && fs.existsSync(READY_FILE);
}
function status() {
  if (!active && ready()) return { status: "installed", stage: "Ready", progress: 100, error: "", sizeBytes: state.total };
  return { ...state };
}
function stage(name, progress, extra = {}) {
  Object.assign(state, { status: "installing", stage: name, progress: Math.max(0, Math.min(100, progress)), ...extra });
}
function run(command, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      output = (output + chunk.toString()).slice(-12000);
      if (onLine) onLine(chunk.toString());
    });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve(output) : reject(new Error(output.trim().split("\n").slice(-3).join(" ") || `${path.basename(command)} exited ${code}`)));
  });
}
function download(url, destination, depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many download redirects"));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Sonderr/1.5 model installer", "Accept": "application/octet-stream" } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume(); return resolve(download(new URL(response.headers.location, url), destination, depth + 1));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`Model download returned HTTP ${response.statusCode}`)); }
      const total = Number(response.headers["content-length"]) || state.total;
      let received = 0;
      const hash = crypto.createHash("sha256");
      const output = fs.createWriteStream(destination, { mode: 0o600 });
      response.on("data", chunk => {
        received += chunk.length; hash.update(chunk);
        state.downloaded = received; state.total = total;
        state.progress = Math.min(68, Math.round(received / total * 68));
      });
      response.on("error", error => output.destroy(error));
      output.on("error", reject);
      output.on("finish", () => {
        if (hash.digest("hex") !== MODEL_SHA256) return reject(new Error("Downloaded model checksum does not match the official release."));
        resolve();
      });
      response.pipe(output);
    });
    request.setTimeout(120000, () => request.destroy(new Error("Model download stalled for two minutes.")));
    request.on("error", reject);
  });
}
function fileSha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256"), input = fs.createReadStream(file);
    input.on("error", reject); input.on("data", chunk => hash.update(chunk)); input.on("end", () => resolve(hash.digest("hex")));
  });
}
function safeExtract() {
  const listing = require("node:child_process").execFileSync("tar", ["-tf", ARCHIVE], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const entries = listing.split("\n").filter(Boolean);
  if (!entries.length || entries.some(name => path.isAbsolute(name) || name.split("/").includes(".."))) throw new Error("Model archive contains an unsafe path.");
  const roots = new Set(entries.map(name => name.split("/")[0]).filter(Boolean));
  if (roots.size !== 1) throw new Error("Model archive has an unexpected directory layout.");
  const temporary = MODEL_DIR + `.install-${process.pid}`;
  fs.rmSync(temporary, { recursive: true, force: true }); fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
  require("node:child_process").execFileSync("tar", ["-xf", ARCHIVE, "--no-same-owner", "--no-same-permissions", "-C", temporary], { stdio: "ignore" });
  const root = path.join(temporary, [...roots][0]);
  if (!fs.existsSync(path.join(root, "config.json"))) throw new Error("The verified model archive is missing config.json.");
  fs.rmSync(MODEL_DIR, { recursive: true, force: true });
  fs.renameSync(root, MODEL_DIR); fs.rmSync(temporary, { recursive: true, force: true });
}
async function install() {
  if (ready()) return status();
  if (active) return status();
  active = true; state.error = "";
  try {
    for (const dir of [DATA_DIR, path.dirname(ARCHIVE), path.dirname(MODEL_DIR), path.dirname(RUNTIME_DIR)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(path.join(MODEL_DIR, "config.json"))) {
      stage("Downloading verified model weights", 0, { downloaded: 0 });
      let archiveReady = false;
      try {
        if (fs.statSync(ARCHIVE).size === state.total && await fileSha256(ARCHIVE) === MODEL_SHA256) archiveReady = true;
      } catch {}
      if (!archiveReady) await download(MODEL_URL, ARCHIVE);
      stage("Unpacking model weights", 69);
      safeExtract();
    }
    stage("Preparing private Python environment", 72);
    if (!fs.existsSync(PYTHON)) {
      fs.rmSync(VENV_DIR, { recursive: true, force: true });
      await run(process.env.PYTHON || "python3", ["-m", "venv", VENV_DIR]);
    }
    const python = PYTHON;
    stage("Installing CPU inference runtime", 77);
    await run(python, ["-m", "pip", "install", "--disable-pip-version-check", "--index-url", "https://download.pytorch.org/whl/cpu", "torch"]);
    stage("Installing model support", 91);
    await run(python, ["-m", "pip", "install", "--disable-pip-version-check", "transformers>=4.51,<5", "accelerate", "safetensors"]);
    fs.writeFileSync(READY_FILE, JSON.stringify({ installedAt: new Date().toISOString(), python, model: MODEL_DIR }), { mode: 0o600 });
    state.status = "installed"; state.stage = "Ready"; state.progress = 100;
    return status();
  } catch (error) {
    state.status = "error"; state.error = String(error.message || error).slice(0, 1000); state.stage = "Install failed";
    throw error;
  } finally { active = false; }
}
function start() {
  if (ready()) return status();
  if (!active) install().catch(() => {});
  return status();
}
module.exports = { MODEL_DIR, PYTHON, status, start, install, ready };
