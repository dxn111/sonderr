const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const store = require("./store");

const MIN_INTERVAL_MS = 1000;
const MAX_PER_HOUR = 100;
const MAX_RECIPIENTS = 10;
const MAX_BODY_CHARS = 100_000;
const DRAFT_TTL_MS = 10 * 60 * 1000;
const RATE_FILE = path.join(store.DATA_DIR, "email-rate.json");
const REPO_URL = "https://github.com/DXN1-0DAY/sonderr-v1.5";
const CONTACT_URL = "https://x.com/Dxn1_0day";
const PROVIDER_PRESETS = Object.freeze([
  { id: "brevo", label: "Brevo SMTP", host: "smtp-relay.brevo.com", port: 587, secure: false, usernameHint: "Generated SMTP username", fromHint: "Verified sender address" },
  { id: "mailgun", label: "Mailgun SMTP", host: "smtp.mailgun.org", port: 587, secure: false, usernameHint: "postmaster@your-domain", fromHint: "Verified sender on your domain" },
  { id: "sendgrid", label: "SendGrid SMTP", host: "smtp.sendgrid.net", port: 587, secure: false, usernameHint: "apikey", fromHint: "Verified sender" }
]);
const pending = new Map();
let sendQueue = Promise.resolve();

function providerPresets() { return PROVIDER_PRESETS.map(item => ({ ...item })); }

function withIdentityFooter(value) {
  const body = String(value || "").trim();
  if (body.includes("This message was prepared by Sonderr, an AI assistant.") && body.includes(REPO_URL) && body.includes(CONTACT_URL)) return body;
  return body + "\n\n---\nThis message was prepared by Sonderr, an AI assistant. For source, contact, or complaints: " + REPO_URL + " · " + CONTACT_URL;
}

function withWelcomeIdentity(value) {
  const body = String(value || "").trim();
  return body + "\n\n— Sonderr\nSonderr is an AI assistant. Source: " + REPO_URL + " · Contact or complaints: " + CONTACT_URL;
}

function decorateBody(value, mode = "ordinary") { return mode === "welcome" ? withWelcomeIdentity(value) : withIdentityFooter(value); }

function config() {
  const saved = store.emailConfig();
  const selected = PROVIDER_PRESETS.find(item => item.id === String(process.env.SONDERR_EMAIL_PROVIDER || "").trim().toLowerCase());
  const envSecure = String(process.env.SONDERR_EMAIL_SECURE || "").toLowerCase();
  const envPort = Number(process.env.SONDERR_EMAIL_PORT || 0);
  const username = String(saved.username || process.env.SONDERR_EMAIL_USERNAME || "").trim();
  return {
    host: String(saved.host || process.env.SONDERR_EMAIL_HOST || selected?.host || "").trim(),
    port: Number(saved.port || (Number.isInteger(envPort) && envPort > 0 ? envPort : selected?.port || 587)),
    secure: saved.secure !== undefined ? Boolean(saved.secure) : (envSecure === "1" || envSecure === "true" || Boolean(selected?.secure)),
    username,
    from: String(saved.from || process.env.SONDERR_EMAIL_FROM || username).trim(),
    password: store.emailPassword()
  };
}

function publicConfig() {
  const c = config();
  return { host: c.host, port: c.port, secure: c.secure, username: c.username, from: c.from, passwordConfigured: Boolean(c.password), configured: Boolean(c.host && c.username && c.from && c.password) };
}

function saveConfig(input) {
  const host = String(input?.host || "").trim();
  const port = Number(input?.port || 587);
  const username = String(input?.username || "").trim();
  const from = String(input?.from || username).trim();
  const secure = Boolean(input?.secure);
  if (!host || /[\r\n]/.test(host)) throw new Error("SMTP host is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP port must be between 1 and 65535");
  if (port === 465 && !secure) throw new Error("Port 465 requires secure TLS");
  if (!username || !from) throw new Error("SMTP username and From address are required");
  if (username.toLowerCase() !== "apikey") validateAddress(username);
  if (Object.prototype.hasOwnProperty.call(input || {}, "password") && String(input.password || "").length > 4096) throw new Error("SMTP password is too long");
  return store.updateEmailConfig({ host, port, secure, username, from, ...(Object.prototype.hasOwnProperty.call(input || {}, "password") ? { password: input.password } : {}) });
}

function validateAddress(value) {
  const address = String(value || "").trim();
  if (!address || /[\r\n<>]/.test(address) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Invalid email address");
  return address;
}

function recipients(input) {
  const fields = ["to", "cc", "bcc"];
  const out = {};
  const all = [];
  for (const field of fields) {
    const values = Array.isArray(input?.[field]) ? input[field] : String(input?.[field] || "").split(/[;,\s]+/).filter(Boolean);
    out[field] = values.map(validateAddress);
    all.push(...out[field]);
  }
  const unique = [...new Set(all.map(item => item.toLowerCase()))];
  if (!unique.length) throw new Error("At least one recipient is required");
  if (unique.length > MAX_RECIPIENTS) throw new Error("Email is limited to " + MAX_RECIPIENTS + " recipients per message");
  return out;
}

function normalizeDraft(input, options = {}) {
  const c = config();
  if (!c.host || !c.username || !c.from || !c.password) throw new Error("Configure SMTP email access in Settings first");
  const to = recipients(input);
  const subject = String(input?.subject || "").trim();
  const rawBody = String(input?.body || "").trim();
  if (!rawBody) throw new Error("Email body is required");
  const body = options.identityMode === "welcome" ? decorateBody(rawBody, "welcome") : (options.includeIdentity === false ? rawBody : decorateBody(rawBody));
  if (!subject) throw new Error("Email subject is required");
  if (/[\r\n]/.test(subject) || subject.length > 200) throw new Error("Email subject is invalid or too long");
  if (body.length > MAX_BODY_CHARS) throw new Error("Email body is too long (maximum 100,000 characters)");
  return { to, subject, body, replyTo: input?.replyTo ? validateAddress(input.replyTo) : "", from: c.from };
}

function readRate() {
  try {
    const raw = JSON.parse(fs.readFileSync(RATE_FILE, "utf8"));
    return Array.isArray(raw.sentAt) ? raw.sentAt.filter(value => Number.isFinite(value)) : [];
  } catch { return []; }
}

function writeRate(sentAt) {
  fs.mkdirSync(path.dirname(RATE_FILE), { recursive: true });
  fs.writeFileSync(RATE_FILE, JSON.stringify({ sentAt }, null, 2), { mode: 0o600 });
  try { fs.chmodSync(RATE_FILE, 0o600); } catch {}
}

function wait(ms) { return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve(); }

class SmtpClient {
  constructor(options) { this.options = options; this.socket = null; this.onData = null; this.buffer = ""; this.waiter = null; }
  attach(socket) {
    this.socket = socket;
    this.buffer = "";
    this.onData = chunk => { this.buffer += String(chunk); this.process(); };
    socket.on("data", this.onData);
    socket.once("error", error => { if (this.waiter) this.waiter.reject(error); });
    socket.once("close", () => { if (this.waiter) this.waiter.reject(new Error("SMTP connection closed")); });
  }
  process() {
    if (!this.waiter) return;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    const collected = this.waiter.lines;
    while (lines.length) {
      const line = lines.shift();
      collected.push(line);
      if (/^\d{3} /.test(line)) {
        const done = this.waiter; this.waiter = null;
        done.resolve({ code: Number(line.slice(0, 3)), lines: collected, text: collected.join("\n") });
        return;
      }
    }
  }
  response() { return new Promise((resolve, reject) => { this.waiter = { resolve, reject, lines: [] }; this.process(); }); }
  async command(line) {
    this.socket.write(line + "\r\n");
    const result = await this.response();
    if (result.code >= 400) { const error = new Error("SMTP rejected command (" + result.code + ")"); error.code = result.code; throw error; }
    return result;
  }
  async connect() {
    const { host, port, secure } = this.options;
    const raw = secure ? tls.connect({ host, port, servername: host, rejectUnauthorized: true }) : net.connect({ host, port });
    this.attach(raw);
    const greetingPromise = this.response();
    await new Promise((resolve, reject) => { raw.once("connect", resolve); raw.once("secureConnect", resolve); raw.once("error", reject); });
    const greeting = await greetingPromise;
    if (greeting.code >= 400) throw new Error("SMTP greeting failed");
    let hello = await this.command("EHLO sonderr.local");
    if (!secure && port !== 465 && /STARTTLS/i.test(hello.text)) {
      await this.command("STARTTLS");
      const old = this.socket;
      if (this.onData) old.off("data", this.onData);
      const upgraded = tls.connect({ socket: old, servername: host, rejectUnauthorized: true });
      await new Promise((resolve, reject) => { upgraded.once("secureConnect", resolve); upgraded.once("error", reject); });
      this.attach(upgraded);
      hello = await this.command("EHLO sonderr.local");
    }
    if (!secure && port !== 465) throw new Error("SMTP server did not advertise STARTTLS; enable secure TLS or use a TLS-capable SMTP port");
    if (!this.options.username || !this.options.password) throw new Error("SMTP credentials are not configured");
    try {
      await this.command("AUTH PLAIN " + Buffer.from("\0" + this.options.username + "\0" + this.options.password).toString("base64"));
    } catch {
      await this.command("AUTH LOGIN");
      await this.command(Buffer.from(this.options.username).toString("base64"));
      await this.command(Buffer.from(this.options.password).toString("base64"));
    }
  }
  async send(draft) {
    await this.connect();
    const all = [...draft.to.to, ...draft.to.cc, ...draft.to.bcc];
    await this.command("MAIL FROM:<" + draft.from + ">");
    for (const address of all) await this.command("RCPT TO:<" + address + ">");
    await this.command("DATA");
    const header = [
      "From: " + draft.from,
      "To: " + draft.to.to.join(", "),
      draft.to.cc.length ? "Cc: " + draft.to.cc.join(", ") : "",
      draft.replyTo ? "Reply-To: " + draft.replyTo : "",
      "Subject: =?UTF-8?B?" + Buffer.from(draft.subject).toString("base64") + "?=",
      "Date: " + new Date().toUTCString(),
      "Message-ID: <" + crypto.randomUUID() + "@sonderr.local>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      ""
    ].filter(Boolean).join("\r\n");
    const body = draft.body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    this.socket.write(header + body + "\r\n.\r\n");
    const accepted = await this.response();
    if (accepted.code >= 400) throw new Error("SMTP rejected the message (" + accepted.code + ")");
    try { await this.command("QUIT"); } catch {}
    this.socket.end();
    return { accepted: true, messageId: header.match(/Message-ID: (.+)/)?.[1] || null };
  }
}

async function sendEmail(draft) {
  const task = sendQueue.then(async () => {
    const now = Date.now();
    const history = readRate().filter(time => time > now - 60 * 60 * 1000);
    if (history.length >= MAX_PER_HOUR) throw new Error("Email safety limit reached: maximum " + MAX_PER_HOUR + " messages per hour");
    const last = history[history.length - 1] || 0;
    await wait(Math.max(0, MIN_INTERVAL_MS - (Date.now() - last)));
    const result = await new SmtpClient(config()).send(draft);
    writeRate([...history, Date.now()].slice(-MAX_PER_HOUR));
    return result;
  });
  sendQueue = task.catch(() => {});
  return task;
}

function prepare(input, options = {}) {
  const draft = normalizeDraft(input, options);
  for (const [token, item] of pending) if (item.expiresAt < Date.now()) pending.delete(token);
  if (pending.size >= 20) throw new Error("Too many pending email confirmations; finish or cancel an existing draft first");
  const token = crypto.randomBytes(24).toString("hex");
  const item = { token, draft, expiresAt: Date.now() + DRAFT_TTL_MS };
  pending.set(token, item);
  return { token, expiresAt: item.expiresAt, from: draft.from, to: draft.to, subject: draft.subject, bodyPreview: draft.body.slice(0, 1000), recipients: [...draft.to.to, ...draft.to.cc, ...draft.to.bcc].length, rateLimit: "1 message/second, 100 messages/hour", requiredSkill: "email-safety", identityFooter: options.identityMode === "welcome" ? "welcome preset" : "enforced" };
}

async function confirm(token) {
  const item = pending.get(String(token || ""));
  if (!item) throw new Error("Email confirmation expired or was already used");
  if (item.expiresAt < Date.now()) { pending.delete(item.token); throw new Error("Email confirmation expired"); }
  pending.delete(item.token);
  return sendEmail(item.draft);
}

module.exports = { publicConfig, saveConfig, prepare, confirm, decorateBody, providerPresets, REPO_URL, CONTACT_URL, MAX_RECIPIENTS, MAX_PER_HOUR };
