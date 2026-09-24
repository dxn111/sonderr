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
  try { return parse(fs.readFileSync(ENV_FILE, "utf8")); } catch { return {}; }
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
  let lines = [];
  try { lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/); } catch {}
  let replaced = false;
  lines = lines.map(line => {
    if (!new RegExp("^\\s*(?:export\\s+)?" + key + "\\s*=").test(line)) return line;
    replaced = true;
    return key + "=" + JSON.stringify(next);
  });
  if (!replaced) lines.push(key + "=" + JSON.stringify(next));
  fs.writeFileSync(ENV_FILE, lines.filter((line, index) => index < lines.length - 1 || line !== "").join("\n") + "\n", { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); fs.chmodSync(DATA_DIR, 0o700); } catch {}
}

function remove(name) {
  const key = String(name || "").trim();
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter(line => !new RegExp("^\\s*(?:export\\s+)?" + key + "\\s*=").test(line));
  fs.writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch {}
}

module.exports = { ENV_FILE, get, set, remove };
