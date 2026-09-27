const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".sonderr");
const ENV_FILE = path.join(DATA_DIR, ".env");

function parse(raw) {
  const out = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[match[1]] = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }
  return out;
}

function read() {
  try {
    const directoryInfo = fs.lstatSync(DATA_DIR);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return {};
    const info = fs.lstatSync(ENV_FILE);
    if (!info.isFile() || info.isSymbolicLink()) return {};
    return parse(fs.readFileSync(ENV_FILE, "utf8"));
  } catch { return {}; }
}

function writeSecretFile(text) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const directoryInfo = fs.lstatSync(DATA_DIR);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("Sonderr's secret directory must be a real directory, not a symlink.");
  try { fs.chmodSync(DATA_DIR, 0o700); } catch {}
  if (fs.existsSync(ENV_FILE)) {
    const info = fs.lstatSync(ENV_FILE);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Sonderr's secret store must be a regular file, not a symlink.");
  }
  const temp = ENV_FILE + ".tmp";
  const fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, text); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, ENV_FILE);
  try { fs.chmodSync(ENV_FILE, 0o600); } catch {}
}

function get(name) {
  const key = String(name || "").trim();
  return process.env[key] || read()[key] || "";
}

function set(name, value) {
  const key = String(name || "").trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("Invalid secret name");
  const next = String(value ?? "");
  if (next.length > 16384) throw new Error("Secret is too long");
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const directoryInfo = fs.lstatSync(DATA_DIR);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("Sonderr's secret directory must be a real directory, not a symlink.");
  try { fs.chmodSync(DATA_DIR, 0o700); } catch {}
  let lines = [];
  if (fs.existsSync(ENV_FILE)) {
    const info = fs.lstatSync(ENV_FILE);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Sonderr's secret store must be a regular file, not a symlink.");
  }
  try { lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/); } catch {}
  let replaced = false;
  lines = lines.map(line => {
    if (!new RegExp("^\\s*(?:export\\s+)?" + key + "\\s*=").test(line)) return line;
    replaced = true;
    return key + "=" + JSON.stringify(next);
  });
  if (!replaced) lines.push(key + "=" + JSON.stringify(next));
  writeSecretFile(lines.filter((line, index) => index < lines.length - 1 || line !== "").join("\n") + "\n");
}

function remove(name) {
  const key = String(name || "").trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("Invalid secret name");
  if (!fs.existsSync(ENV_FILE)) return;
  const info = fs.lstatSync(ENV_FILE);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Sonderr's secret store must be a regular file, not a symlink.");
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter(line => !new RegExp("^\\s*(?:export\\s+)?" + key + "\\s*=").test(line));
  writeSecretFile(lines.join("\n"));
}

module.exports = { ENV_FILE, get, set, remove };
