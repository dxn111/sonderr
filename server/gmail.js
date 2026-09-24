const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const secrets = require("./secrets");
const store = require("./store");

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const STATE_TTL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 1000;
const MAX_PER_HOUR = 100;
const MAX_PENDING_SENDS = 20;
const RATE_FILE = path.join(store.DATA_DIR, "gmail-rate.json");
const pending = new Map();
const pendingSends = new Map();
let sendQueue = Promise.resolve();

function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function readRate() {
  try { const saved = JSON.parse(fs.readFileSync(RATE_FILE, "utf8")); return Array.isArray(saved.sentAt) ? saved.sentAt.filter(Number.isFinite) : []; }
  catch { return []; }
}

function writeRate(sentAt) {
  fs.mkdirSync(path.dirname(RATE_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(RATE_FILE, JSON.stringify({ sentAt }, null, 2), { mode: 0o600 });
  try { fs.chmodSync(RATE_FILE, 0o600); } catch {}
}

function wait(ms) { return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve(); }

function clientId() { return String(process.env.SONDERR_GMAIL_CLIENT_ID || secrets.get("SONDERR_GMAIL_CLIENT_ID") || "").trim(); }
function clientSecret() { return String(process.env.SONDERR_GMAIL_CLIENT_SECRET || secrets.get("SONDERR_GMAIL_CLIENT_SECRET") || "").trim(); }
function configured() { return Boolean(clientId()); }
function publicConfig() {
  const access = secrets.get("SONDERR_GMAIL_ACCESS_TOKEN");
  const refresh = secrets.get("SONDERR_GMAIL_REFRESH_TOKEN");
  const expiry = Number(secrets.get("SONDERR_GMAIL_TOKEN_EXPIRY") || 0);
  return { configured: configured(), connected: Boolean(refresh || access), account: secrets.get("SONDERR_GMAIL_ACCOUNT") || "", tokenExpiry: expiry || null, scope: SCOPE };
}

function saveClient(input = {}) {
  const id = String(input.clientId || "").trim();
  const secret = String(input.clientSecret || "").trim();
  if (!id || id.length > 512) throw new Error("Google OAuth client ID is required");
  secrets.set("SONDERR_GMAIL_CLIENT_ID", id);
  if (secret) secrets.set("SONDERR_GMAIL_CLIENT_SECRET", secret);
  return publicConfig();
}

function redirectUri(origin) {
  const explicit = String(process.env.SONDERR_GMAIL_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const url = new URL(String(origin || "http://127.0.0.1:4173"));
  return "http://127.0.0.1:" + (url.port || "4173") + "/api/gmail/callback";
}

function connectUrl(origin) {
  if (!configured()) throw new Error("Configure a Google OAuth desktop client ID first");
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirect = redirectUri(origin);
  pending.set(state, { state, verifier, redirect, expiresAt: Date.now() + STATE_TTL_MS });
  const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent", scope: SCOPE, state, code_challenge: challenge, code_challenge_method: "S256" });
  return { url: AUTH_ENDPOINT + "?" + params.toString(), redirectUri: redirect, expiresAt: Date.now() + STATE_TTL_MS };
}

async function exchange(code, item) {
  const response = await fetchWithTimeout(TOKEN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId(), ...(clientSecret() ? { client_secret: clientSecret() } : {}), redirect_uri: item.redirect, grant_type: "authorization_code", code_verifier: item.verifier }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google OAuth token exchange failed");
  secrets.set("SONDERR_GMAIL_ACCESS_TOKEN", data.access_token);
  if (data.refresh_token) secrets.set("SONDERR_GMAIL_REFRESH_TOKEN", data.refresh_token);
  secrets.set("SONDERR_GMAIL_TOKEN_EXPIRY", String(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000));
  try {
    const profile = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + data.access_token } });
    const profileData = await profile.json().catch(() => ({}));
    if (profileData.emailAddress) secrets.set("SONDERR_GMAIL_ACCOUNT", String(profileData.emailAddress));
  } catch {}
  return data;
}

async function accessToken() {
  const access = secrets.get("SONDERR_GMAIL_ACCESS_TOKEN");
  const expiry = Number(secrets.get("SONDERR_GMAIL_TOKEN_EXPIRY") || 0);
  if (access && expiry > Date.now() + 30_000) return access;
  const refresh = secrets.get("SONDERR_GMAIL_REFRESH_TOKEN");
  if (!refresh) throw new Error("Connect a Gmail account first");
  const response = await fetchWithTimeout(TOKEN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refresh, client_id: clientId(), ...(clientSecret() ? { client_secret: clientSecret() } : {}), grant_type: "refresh_token" }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google token refresh failed");
  secrets.set("SONDERR_GMAIL_ACCESS_TOKEN", data.access_token);
  secrets.set("SONDERR_GMAIL_TOKEN_EXPIRY", String(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000));
  return data.access_token;
}

function mimeLine(value) { return String(value || "").replace(/[\r\n]+/g, " ").trim(); }
function address(value) {
  const item = String(value || "").trim();
  if (!item || /[\r\n<>]/.test(item) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) throw new Error("Invalid Gmail recipient address");
  return item;
}
function normalizeMessage(input = {}) {
  const fields = ["to", "cc", "bcc"];
  const result = {};
  const all = [];
  for (const field of fields) {
    const values = Array.isArray(input[field]) ? input[field] : (input[field] ? [input[field]] : []);
    result[field] = values.map(address);
    all.push(...result[field]);
  }
  if (!all.length) throw new Error("At least one Gmail recipient is required");
  if (new Set(all.map(value => value.toLowerCase())).size > 10) throw new Error("Gmail is limited to 10 recipients per message");
  const subject = String(input.subject || "").trim();
  const body = String(input.body || "").trim();
  if (!subject || /[\r\n]/.test(subject) || subject.length > 200) throw new Error("Gmail subject is invalid or missing");
  if (!body || body.length > 100_000) throw new Error("Gmail body is invalid or too long");
  return { ...input, to: result.to, cc: result.cc, bcc: result.bcc, subject, body, from: input.from ? address(input.from) : "" };
}
function encodeMessage(input) {
  const to = input.to || [];
  const cc = input.cc || [];
  const bcc = input.bcc || [];
  const from = mimeLine(input.from || publicConfig().account);
  const headers = ["To: " + to.map(mimeLine).join(", "), cc.length ? "Cc: " + cc.map(mimeLine).join(", ") : "", bcc.length ? "Bcc: " + bcc.map(mimeLine).join(", ") : "", from ? "From: " + from : "", "Subject: " + mimeLine(input.subject), "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", String(input.body || "")].filter(Boolean).join("\r\n");
  return Buffer.from(headers, "utf8").toString("base64url");
}

async function deliver(input) {
  input = normalizeMessage(input);
  const token = await accessToken();
  const response = await fetchWithTimeout(SEND_ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ raw: encodeMessage(input) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(data.error?.message || "Gmail rejected the message");
  return { accepted: true, messageId: data.id, provider: "gmail" };
}

async function send(input) {
  const task = sendQueue.then(async () => {
    const now = Date.now();
    const history = readRate().filter(time => time > now - 60 * 60 * 1000);
    if (history.length >= MAX_PER_HOUR) throw new Error("Gmail safety limit reached: maximum " + MAX_PER_HOUR + " messages per hour");
    const last = history[history.length - 1] || 0;
    await wait(Math.max(0, MIN_INTERVAL_MS - (Date.now() - last)));
    const result = await deliver(input);
    writeRate([...history, Date.now()].slice(-MAX_PER_HOUR));
    return result;
  });
  sendQueue = task.catch(() => {});
  return task;
}

function prepare(input) {
  input = normalizeMessage(input);
  for (const [token, item] of pendingSends) if (item.expiresAt < Date.now()) pendingSends.delete(token);
  if (pendingSends.size >= MAX_PENDING_SENDS) throw new Error("Too many pending Gmail confirmations; finish or let an existing draft expire first");
  const to = input.to;
  const token = crypto.randomBytes(24).toString("hex");
  const draft = { token, input: { ...input, to }, expiresAt: Date.now() + STATE_TTL_MS };
  pendingSends.set(token, draft);
  return { token, expiresAt: draft.expiresAt, from: publicConfig().account || "Connected Gmail account", to: { to, cc: input.cc || [], bcc: input.bcc || [] }, subject: input.subject, bodyPreview: String(input.body).slice(0, 1000), recipients: [...input.to, ...input.cc, ...input.bcc].length, requiredSkill: "email-safety", identityFooter: "welcome preset", gmail: true };
}

async function confirm(token) {
  const item = pendingSends.get(String(token || ""));
  if (!item) throw new Error("Gmail confirmation expired or was already used");
  pendingSends.delete(item.token);
  if (item.expiresAt < Date.now()) throw new Error("Gmail confirmation expired");
  return send(item.input);
}

function callbackUrl(query) {
  const state = String(query?.state || "");
  const item = pending.get(state);
  pending.delete(state);
  if (!item || item.expiresAt < Date.now()) throw new Error("Gmail authorization expired; start again");
  if (query.error) throw new Error(String(query.error_description || query.error));
  if (!query.code) throw new Error("Google did not return an authorization code");
  return exchange(String(query.code), item).then(() => ({ ok: true }));
}

async function disconnect() {
  const token = secrets.get("SONDERR_GMAIL_ACCESS_TOKEN") || secrets.get("SONDERR_GMAIL_REFRESH_TOKEN");
  if (token) { try { await fetchWithTimeout(REVOKE_ENDPOINT + "?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }); } catch {} }
  for (const name of ["SONDERR_GMAIL_ACCESS_TOKEN", "SONDERR_GMAIL_REFRESH_TOKEN", "SONDERR_GMAIL_TOKEN_EXPIRY", "SONDERR_GMAIL_ACCOUNT"]) secrets.remove(name);
  return publicConfig();
}

module.exports = { publicConfig, saveClient, connectUrl, callbackUrl, send, prepare, confirm, disconnect, redirectUri };
