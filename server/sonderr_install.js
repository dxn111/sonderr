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
const Q4_MODEL_URL = "https://github.com/dxn111/sonderr/releases/download/v1.5.16/sonderr-v1-Q4_0.gguf";
const Q4_MODEL_SHA256 = "f9fc259f351683b5df613a4b868cb1a4785259c69b92f44e3be6017fbd620490";
const LLAMA_RUNTIME_URL = "https://github.com/dxn111/sonderr/releases/download/v1.5.16/sonderr-linux-x64-llama-runtime.tar.gz";
const LLAMA_RUNTIME_SHA256 = "8bb31dd0321ff64059bbbe0108e1743b6d37d65dbbbc8f221cd06e3ae2cf354d";
const MODEL_DIR = path.join(DATA_DIR, "models", "sonderr-v1");
const RUNTIME_DIR = path.join(DATA_DIR, "runtime", "sonderr-v1");
const QUANTIZED_MODEL = path.join(MODEL_DIR, "sonderr-v1-Q4_0.gguf");
const LLAMA_RUNTIME_DIR = path.join(RUNTIME_DIR, "llama");
const LLAMA_SERVER = path.join(LLAMA_RUNTIME_DIR, "bin", process.platform === "win32" ? "llama-server.exe" : "llama-server");
const VENV_DIR = path.join(RUNTIME_DIR, "venv");
const PYTHON = path.join(VENV_DIR, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const READY_FILE = path.join(RUNTIME_DIR, "ready.json");
const ARCHIVE = path.join(DATA_DIR, "downloads", "sonderr-v1.tar");
const Q4_ARCHIVE = path.join(DATA_DIR, "downloads", "sonderr-v1-Q4_0.gguf");
const LLAMA_ARCHIVE = path.join(DATA_DIR, "downloads", "sonderr-linux-x64-llama-runtime.tar.gz");
const state = { status: "not-installed", stage: "", progress: 0, downloaded: 0, total: 1004011520, error: "" };
let active = false;
let quantizedSupportCache;

function ready() {
  return quantizedReady() || (fs.existsSync(path.join(MODEL_DIR, "config.json")) && fs.existsSync(PYTHON) && fs.existsSync(READY_FILE));
}
function quantizedSupported() {
  if (quantizedSupportCache !== undefined) return quantizedSupportCache;
  quantizedSupportCache = false;
  if (process.platform !== "linux" || process.arch !== "x64") return false;
  const glibc = String(process.report?.getReport?.().header?.glibcVersionRuntime || "").match(/^(\d+)\.(\d+)/);
  if (!glibc || Number(glibc[1]) < 2 || (Number(glibc[1]) === 2 && Number(glibc[2]) < 34)) return false;
  try {
    const listing = require("node:child_process").execFileSync("ldconfig", ["-p"], { encoding: "utf8", timeout: 1_000, stdio: ["ignore", "pipe", "ignore"] });
    const libraries = new Map();
    for (const line of listing.split("\n")) {
      const match = line.match(/^\s*(lib[^ ]+\.so(?:\.[^ ]+)*)\s+\(.*\)\s+=>\s+(\S+)/);
      if (match && !libraries.has(match[1])) libraries.set(match[1], match[2]);
    }
    for (const name of ["libssl.so.3", "libcrypto.so.3", "libgomp.so.1", "libz.so.1", "libzstd.so.1", "libm.so.6", "libc.so.6", "libstdc++.so.6"]) if (!libraries.has(name)) return false;
    const binary = fs.readFileSync(libraries.get("libstdc++.so.6")).toString("latin1");
    const versions = [...binary.matchAll(/GLIBCXX_(\d+)\.(\d+)(?:\.(\d+))?/g)].map(match => [Number(match[1]), Number(match[2]), Number(match[3] || 0)]);
    const latest = versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).at(-1) || [];
    quantizedSupportCache = latest[0] > 3 || (latest[0] === 3 && (latest[1] > 4 || (latest[1] === 4 && latest[2] >= 31)));
  } catch { quantizedSupportCache = false; }
  return quantizedSupportCache;
}
function quantizedReady() {
  return quantizedSupported()
    && fs.existsSync(QUANTIZED_MODEL) && fs.existsSync(LLAMA_SERVER);
}
function status() {
  if (state.status === "error") return { ...state, quantized: quantizedReady(), quantizedSupported: quantizedSupported() };
  if (!active && quantizedSupported() && !quantizedReady() && ready()) return { ...state, status: "update-available", stage: "Q4 optimized runtime available", progress: 0, error: "", quantized: false, quantizedSupported: true };
  if (!active && ready()) return { ...state, status: "installed", stage: "Ready", progress: 100, error: "", sizeBytes: state.total, quantized: quantizedReady(), quantizedSupported: quantizedSupported() };
  return { ...state, quantized: quantizedReady(), quantizedSupported: quantizedSupported() };
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
function download(url, destination, expectedHash = MODEL_SHA256, progress = [0, 68], depth = 0) {
  if (depth > 5) return Promise.reject(new Error("Too many download redirects"));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Sonderr/1.5 model installer", "Accept": "application/octet-stream" } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume(); return resolve(download(new URL(response.headers.location, url), destination, expectedHash, progress, depth + 1));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`Model download returned HTTP ${response.statusCode}`)); }
      const total = Number(response.headers["content-length"]) || state.total;
      let received = 0;
      const hash = crypto.createHash("sha256");
      const output = fs.createWriteStream(destination, { mode: 0o600 });
      response.on("data", chunk => {
        received += chunk.length; hash.update(chunk);
        state.downloaded = received; state.total = total;
        state.progress = Math.min(progress[1], progress[0] + Math.round(received / total * (progress[1] - progress[0])));
      });
      response.on("error", error => output.destroy(error));
      output.on("error", reject);
      output.on("finish", () => {
        if (hash.digest("hex") !== expectedHash) return reject(new Error("Downloaded model checksum does not match the official release."));
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
function safeExtractLlamaRuntime() {
  const listing = require("node:child_process").execFileSync("tar", ["-tzf", LLAMA_ARCHIVE], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  const entries = listing.split("\n").filter(Boolean);
  if (!entries.length || entries.some(name => path.isAbsolute(name) || name.split("/").includes(".."))) throw new Error("The CPU runtime archive contains an unsafe path.");
  if (entries.some(name => name.includes("\\") || !["llama/", "llama/LICENSE", "llama/bin/"].includes(name) && !name.startsWith("llama/bin/"))) throw new Error("The CPU runtime archive has an unexpected entry.");
  const temporary = LLAMA_RUNTIME_DIR + `.install-${process.pid}`;
  fs.rmSync(temporary, { recursive: true, force: true }); fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
  require("node:child_process").execFileSync("tar", ["-xzf", LLAMA_ARCHIVE, "--no-same-owner", "--no-same-permissions", "-C", temporary], { stdio: "ignore" });
  const extractedRoot = path.join(temporary, "llama");
  const binary = path.join(extractedRoot, "bin", "llama-server");
  if (!fs.existsSync(binary) || !fs.statSync(binary).isFile()) { fs.rmSync(temporary, { recursive: true, force: true }); throw new Error("The verified CPU runtime archive is missing llama-server."); }
  fs.rmSync(LLAMA_RUNTIME_DIR, { recursive: true, force: true });
  fs.renameSync(extractedRoot, LLAMA_RUNTIME_DIR);
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.chmodSync(LLAMA_SERVER, 0o700);
}
async function installQuantized() {
  stage("Preparing verified Q4 model", 0, { downloaded: 0, total: 352154592 });
  for (const dir of [DATA_DIR, path.dirname(Q4_ARCHIVE), MODEL_DIR, path.dirname(RUNTIME_DIR)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let modelValid = false;
  try { modelValid = await fileSha256(QUANTIZED_MODEL) === Q4_MODEL_SHA256; } catch {}
  if (!modelValid) {
    fs.rmSync(QUANTIZED_MODEL, { force: true });
    stage("Downloading verified Q4 model", 0, { downloaded: 0, total: 352154592 });
    try { if (await fileSha256(Q4_ARCHIVE) !== Q4_MODEL_SHA256) throw new Error("cached model checksum mismatch"); }
    catch { await download(Q4_MODEL_URL, Q4_ARCHIVE, Q4_MODEL_SHA256, [0, 88]); }
    if (await fileSha256(Q4_ARCHIVE) !== Q4_MODEL_SHA256) throw new Error("Downloaded Q4 model checksum does not match the official release.");
    fs.renameSync(Q4_ARCHIVE, QUANTIZED_MODEL);
    fs.chmodSync(QUANTIZED_MODEL, 0o600);
  }
  if (!fs.existsSync(LLAMA_SERVER)) {
    stage("Downloading verified CPU runtime", 88, { downloaded: 0, total: 22 * 1024 * 1024 });
    try { if (await fileSha256(LLAMA_ARCHIVE) !== LLAMA_RUNTIME_SHA256) throw new Error("cached runtime checksum mismatch"); }
    catch { await download(LLAMA_RUNTIME_URL, LLAMA_ARCHIVE, LLAMA_RUNTIME_SHA256, [88, 98]); }
    if (await fileSha256(LLAMA_ARCHIVE) !== LLAMA_RUNTIME_SHA256) throw new Error("Downloaded CPU runtime checksum does not match the official release.");
    safeExtractLlamaRuntime();
    fs.rmSync(LLAMA_ARCHIVE, { force: true });
  }
  const marker = { installedAt: new Date().toISOString(), model: QUANTIZED_MODEL, runtime: LLAMA_RUNTIME_DIR, format: "GGUF Q4_0", platform: "linux-x64" };
  fs.writeFileSync(READY_FILE, JSON.stringify(marker), { mode: 0o600 });
  state.status = "installed"; state.stage = "Ready"; state.progress = 100;
  return status();
}
async function install() {
  if (quantizedSupported() && !quantizedReady()) {
    if (active) return status();
  } else if (ready()) return status();
  if (active) return status();
  active = true; state.error = "";
  try {
    if (quantizedSupported()) return await installQuantized();
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
  if (quantizedSupported() ? quantizedReady() : ready()) return status();
  if (!active) install().catch(() => {});
  return status();
}
module.exports = { MODEL_DIR, PYTHON, QUANTIZED_MODEL, LLAMA_RUNTIME_DIR, LLAMA_SERVER, status, start, install, ready, quantizedReady, quantizedSupported };
