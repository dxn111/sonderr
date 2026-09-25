const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const secrets = require("./secrets");
const safety = require("./safety");

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".sonderr");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const MAX_SESSIONS = 200;
const MAX_MESSAGES_PER_SESSION = 240;
const MAX_MESSAGE_CHARS = 200_000;

const initial = {
  version: 1,
  sessions: [],
  settings: {
    provider: process.env.SONDERR_PROVIDER || "openai",
    model: process.env.SONDERR_MODEL || "gpt-4o-mini",
    baseURL: process.env.SONDERR_API_BASE_URL || "https://api.openai.com/v1",
    temperature: 0.2,
    maxTokens: 8192,
    approvalMode: process.env.SONDERR_APPROVAL_MODE || "ask",
    environmentPath: ".sonderr/environment",
    enabledSkills: ["repo-audit", "test-and-verify"]
  }
};

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { fs.chmodSync(DATA_DIR, 0o700); } catch {}
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  if (!fs.existsSync(CREDENTIALS_FILE)) fs.writeFileSync(CREDENTIALS_FILE, "{}", { mode: 0o600 });
  try { fs.chmodSync(DATA_FILE, 0o600); } catch {}
  try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch {}
}

function read() {
  ensure();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return structuredClone(initial); }
}

function write(data) {
  ensure();
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
  try { fs.chmodSync(DATA_FILE, 0o600); } catch {}
  return data;
}

function listSessions() {
  return read().sessions.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

function cleanStudio(raw = {}) {
  const track = ["project", "site", "app", "developer", "bounty"].includes(raw.track) ? raw.track : "project";
  const goal = safety.redactText(String(raw.goal || "").replace(/[\u0000-\u001f]/g, " ").trim()).slice(0, 500);
  const previewPath = String(raw.previewPath || "").replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 300);
  const milestones = (Array.isArray(raw.milestones) ? raw.milestones : []).slice(0, 12).map(item => ({
    id: /^[a-zA-Z0-9-]{1,64}$/.test(String(item?.id || "")) ? String(item.id) : crypto.randomUUID(),
    text: safety.redactText(String(item?.text || "").replace(/[\u0000-\u001f]/g, " ").trim()).slice(0, 120),
    done: item?.done === true
  })).filter(item => item.text);
  return { track, goal, milestones, ...(["site", "app"].includes(track) && previewPath ? { previewPath } : {}) };
}

function createSession(title = "New task", surface = "chat", studio = null) {
  const data = read();
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    title: String(title || "New task").replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "New task",
    surface: surface === "studios" ? "studios" : "chat",
    ...(surface === "studios" ? { studio: cleanStudio(studio || {}) } : {}),
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  data.sessions.unshift(session);
  // Chat history is intentionally bounded. The active provider context is much
  // smaller, and keeping an unlimited local transcript is a privacy and disk
  // risk for a desktop app.
  if (data.sessions.length > MAX_SESSIONS) data.sessions = data.sessions.slice(0, MAX_SESSIONS);
  write(data);
  return session;
}

function updateStudio(id, raw) {
  const data = read();
  const session = data.sessions.find(item => item.id === id && item.surface === "studios");
  if (!session) return null;
  session.studio = cleanStudio(raw);
  session.updatedAt = new Date().toISOString();
  write(data);
  return session;
}

function getSession(id) {
  return read().sessions.find(s => s.id === id) || null;
}

function setSessionPlugin(id, pluginId = "") {
  const data = read();
  const session = data.sessions.find(item => item.id === id);
  if (!session) return null;
  session.activePluginId = String(pluginId || "").trim().slice(0, 64);
  session.updatedAt = new Date().toISOString();
  write(data);
  return session.activePluginId;
}

// --- Todo lists (per session, persisted so the card replays) ---
const TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);
const TODO_PRIORITIES = new Set(["high", "medium", "low"]);
const EARNING_CATEGORIES = new Set(["faucet", "bounty", "grant", "job", "airdrop", "other"]);
const EARNING_STATUSES = new Set(["candidate", "researching", "eligible", "ineligible", "claim_ready", "submitted", "pending", "paid", "rejected", "closed"]);
const EARNING_NETWORKS = new Set(["solana-mainnet", "solana-devnet", "solana-testnet", "ethereum-mainnet", "base-mainnet", "testnet", "other", "unknown"]);
const MAX_EARNING_ENTRIES = 100;

function cleanLedgerText(value, limit = 500) {
  return safety.redactText(String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim()).slice(0, limit);
}

function safeLedgerUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.port) return "";
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|auth|session|sig|password|email/i.test(key)) return "";
    }
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

function sanitizeEarningEntry(raw = {}, existing = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("An opportunity object is required");
  const title = cleanLedgerText(raw.title ?? existing?.title, 120);
  if (!title) throw new Error("A short opportunity title is required");
  const category = EARNING_CATEGORIES.has(raw.category) ? raw.category : (existing?.category || "other");
  const status = EARNING_STATUSES.has(raw.status) ? raw.status : (existing?.status || "candidate");
  const network = EARNING_NETWORKS.has(raw.network) ? raw.network : (existing?.network || "unknown");
  const sourceInput = raw.sources ?? existing?.sources ?? (raw.url ? [raw.url] : []);
  const sources = [...new Set((Array.isArray(sourceInput) ? sourceInput : []).slice(0, 4).map(safeLedgerUrl).filter(Boolean))];
  const amount = cleanLedgerText(raw.amount ?? existing?.amount, 48);
  const currency = cleanLedgerText(raw.currency ?? existing?.currency, 24);
  const eligibility = cleanLedgerText(raw.eligibility ?? existing?.eligibility, 320);
  const evidence = cleanLedgerText(raw.evidence ?? existing?.evidence, 600);
  const nextCheckAt = cleanLedgerText(raw.nextCheckAt ?? existing?.nextCheckAt, 40);
  if (nextCheckAt && !Number.isFinite(Date.parse(nextCheckAt))) throw new Error("nextCheckAt must be an ISO date/time");
  return {
    id: existing?.id || crypto.randomUUID(), title, category, network, status,
    sources, amount, currency, eligibility, evidence, nextCheckAt,
    savedAt: existing?.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function listEarningOpportunities() {
  const entries = read().earningOpportunities;
  if (!Array.isArray(entries)) return [];
  return entries.slice(-MAX_EARNING_ENTRIES).flatMap(item => {
    try {
      const clean = sanitizeEarningEntry(item);
      clean.id = cleanLedgerText(item.id, 64) || clean.id;
      clean.savedAt = cleanLedgerText(item.savedAt, 40) || clean.savedAt;
      clean.updatedAt = cleanLedgerText(item.updatedAt, 40) || clean.updatedAt;
      return [clean];
    } catch { return []; }
  });
}

function saveEarningOpportunity(raw = {}) {
  const data = read();
  const entries = Array.isArray(data.earningOpportunities) ? data.earningOpportunities.slice(-MAX_EARNING_ENTRIES) : [];
  const id = cleanLedgerText(raw.id, 64);
  const existingIndex = id ? entries.findIndex(item => item.id === id) : -1;
  const current = existingIndex >= 0 ? entries[existingIndex] : null;
  const next = sanitizeEarningEntry(raw, current);
  if (existingIndex >= 0) entries[existingIndex] = next;
  else entries.push(next);
  data.earningOpportunities = entries.slice(-MAX_EARNING_ENTRIES);
  write(data);
  return { ...next, sources: [...next.sources] };
}

function sanitizeTodos(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, 100)) {
    const content = String(item?.content || "").trim().slice(0, 500);
    if (!content) continue;
    const status = TODO_STATUSES.has(item?.status) ? item.status : "pending";
    const priority = TODO_PRIORITIES.has(item?.priority) ? item.priority : "medium";
    const key = content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(item?.id || "").trim().slice(0, 64) || "t" + (out.length + 1),
      content, status, priority,
      active: status === "in_progress"
    });
  }
  return out;
}

function getTodos(id) {
  const session = getSession(id);
  return session ? (session.todos || []) : null;
}

function setTodos(id, todos) {
  const data = read();
  const session = data.sessions.find(s => s.id === id);
  if (!session) return null;
  session.todos = sanitizeTodos(todos);
  session.updatedAt = new Date().toISOString();
  write(data);
  return session.todos;
}

// A compact, structured resume point for substantial tasks. This is separate
// from the bounded chat transcript so progress survives old messages rolling
// out of the provider context window.
const TASK_CHECKPOINT_STATUSES = new Set(["active", "paused", "completed"]);
function cleanCheckpointText(value, limit) {
  return safety.redactText(String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim()).slice(0, limit);
}
function cleanCheckpointList(value, maxItems = 16) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(item => cleanCheckpointText(item, 400)).filter(Boolean);
}
function sanitizeTaskCheckpoint(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const goal = cleanCheckpointText(raw.goal, 800);
  const currentMilestone = cleanCheckpointText(raw.currentMilestone, 400);
  const nextAction = cleanCheckpointText(raw.nextAction, 600);
  const status = TASK_CHECKPOINT_STATUSES.has(raw.status) ? raw.status : "paused";
  const taskKey = cleanCheckpointText(raw.taskKey, 80);
  if (!goal || !currentMilestone || !taskKey || (status !== "completed" && !nextAction)) return null;
  return {
    taskKey,
    goal,
    status,
    currentMilestone,
    verified: cleanCheckpointList(raw.verified),
    decisions: cleanCheckpointList(raw.decisions, 12),
    nextAction: status === "completed" ? "" : nextAction,
    updatedAt: new Date().toISOString(),
    ...(raw.interruptedAt ? { interruptedAt: cleanCheckpointText(raw.interruptedAt, 40) } : {})
  };
}
function taskCheckpoint(id) {
  const session = getSession(id);
  return session?.taskCheckpoint && typeof session.taskCheckpoint === "object" ? { ...session.taskCheckpoint } : null;
}
function setTaskCheckpoint(id, checkpoint) {
  const next = sanitizeTaskCheckpoint(checkpoint);
  if (!next) return null;
  const data = read();
  const session = data.sessions.find(item => item.id === id);
  if (!session) return null;
  session.taskCheckpoint = next;
  session.updatedAt = next.updatedAt;
  write(data);
  return { ...next };
}
function pauseTaskCheckpoint(id, taskKey) {
  const current = taskCheckpoint(id);
  if (!current || current.taskKey !== taskKey || current.status !== "active") return current;
  return setTaskCheckpoint(id, { ...current, status: "paused" });
}
function pauseInterruptedTaskCheckpoints() {
  const data = read();
  const now = new Date().toISOString();
  let changed = false;
  for (const session of data.sessions) {
    const current = session.taskCheckpoint;
    if (!current || current.status !== "active") continue;
    session.taskCheckpoint = sanitizeTaskCheckpoint({
      ...current,
      status: "paused",
      nextAction: "Sonderr stopped while this task was running. Review the workspace, then choose Continue to resume from the last saved checkpoint.",
      interruptedAt: now
    });
    session.updatedAt = now;
    changed = true;
  }
  if (changed) write(data);
  return changed;
}

function qualityState(id) {
  const session = getSession(id);
  return session ? (session.quality || null) : null;
}

function setQualityState(id, quality) {
  const data = read();
  const session = data.sessions.find(s => s.id === id);
  if (!session) return null;
  session.quality = quality && typeof quality === "object" ? { ...quality } : null;
  session.updatedAt = new Date().toISOString();
  write(data);
  return session.quality;
}

function addMessage(id, role, content, meta = null) {
  const data = read();
  const session = data.sessions.find(s => s.id === id);
  if (!session) return null;
  if (!new Set(["user", "assistant"]).has(role)) throw new Error("Invalid message role");
  const message = {
    id: crypto.randomUUID(),
    role,
    content: String(content).slice(0, MAX_MESSAGE_CHARS),
    createdAt: new Date().toISOString()
  };
  if (meta && typeof meta === "object") {
    if (Array.isArray(meta.events) && meta.events.length) message.events = meta.events;
    if (meta.mode) message.mode = meta.mode;
    if (meta.model) message.model = meta.model;
    if (Array.isArray(meta.images) && meta.images.length) message.images = meta.images.slice(0, 4).map(String);
  }
  session.messages.push(message);
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  session.updatedAt = new Date().toISOString();
  write(data);
  return session;
}

function settings() {
  const current = read().settings || {};
  const merged = { ...initial.settings, ...current };
  if (!merged.provider) merged.provider = "openai";
  if (merged.provider === "local") {
    merged.provider = "openai";
    merged.baseURL = initial.settings.baseURL;
    merged.model = initial.settings.model;
  }
  if (!merged.approvalMode) merged.approvalMode = "ask";
  if (!merged.environmentPath) merged.environmentPath = ".sonderr/environment";
  if (!Array.isArray(merged.enabledSkills)) merged.enabledSkills = initial.settings.enabledSkills;
  // API keys live only in the permission-restricted credential file. Older
  // builds persisted an apiKey in settings, so omit it from every read too.
  delete merged.apiKey;
  return merged;
}

function credentials() {
  ensure();
  try { return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8")); } catch { return {}; }
}

function updateSettings(next) {
  const data = read();
  const incoming = next && typeof next === "object" ? next : {};
  const { apiKey, ...safeSettings } = incoming;
  const legacyApiKey = String(data.settings?.apiKey || "");
  const credentialProvider = incoming.provider || data.settings?.provider || initial.settings.provider;
  if (legacyApiKey && !apiKey) {
    const saved = credentials();
    if (!saved[credentialProvider]) {
      saved[credentialProvider] = legacyApiKey;
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
      try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch {}
    }
  }
  delete data.settings.apiKey; // migrate away the legacy plaintext setting.
  data.settings = { ...initial.settings, ...data.settings, ...safeSettings };
  write(data);
  if (Object.prototype.hasOwnProperty.call(incoming, "apiKey")) {
    const saved = credentials();
    if (apiKey) saved[credentialProvider] = String(apiKey);
    else delete saved[credentialProvider];
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
    try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch {}
  }
  return settings();
}

function providerKey(provider) {
  return credentials()[provider || settings().provider] || process.env.SONDERR_API_KEY || "";
}

function providerTpmProfileHash(profileKey) {
  return crypto.createHash("sha256").update(String(profileKey || "")).digest("hex");
}

function providerTpmLimit(profileKey) {
  const limits = read().providerTpmLimits;
  const hash = providerTpmProfileHash(profileKey);
  const item = limits && typeof limits === "object" ? limits[hash] : null;
  if (!item || !Number.isFinite(Number(item.limit)) || !Number.isFinite(Number(item.expiresAt)) || Number(item.expiresAt) <= Date.now()) return null;
  return Number(item.limit);
}

function rememberProviderTpmLimit(profileKey, limit, expiresAt) {
  const amount = Number(limit), expiry = Number(expiresAt);
  if (!String(profileKey || "") || !Number.isFinite(amount) || amount < 128 || !Number.isFinite(expiry) || expiry <= Date.now()) return false;
  const data = read();
  const prior = data.providerTpmLimits && typeof data.providerTpmLimits === "object" ? data.providerTpmLimits : {};
  const entries = Object.entries(prior).filter(([, item]) => Number(item?.expiresAt) > Date.now()).slice(-31);
  const limits = Object.fromEntries(entries);
  limits[providerTpmProfileHash(profileKey)] = { limit: amount, expiresAt: expiry };
  data.providerTpmLimits = limits;
  write(data);
  return true;
}

function emailConfig() {
  const data = read();
  return data.email && typeof data.email === "object" ? { ...data.email } : {};
}

function updateEmailConfig(next = {}) {
  const data = read();
  const current = emailConfig();
  const requestedPort = Number(next.port ?? current.port ?? 587);
  const allowed = {
    host: String(next.host ?? current.host ?? "").trim().slice(0, 255),
    port: Number.isFinite(requestedPort) ? Math.max(1, Math.min(65535, requestedPort)) : 587,
    secure: Boolean(next.secure ?? current.secure ?? false),
    username: String(next.username ?? current.username ?? "").trim().slice(0, 320),
    from: String(next.from ?? current.from ?? next.username ?? "").trim().slice(0, 320)
  };
  data.email = allowed;
  write(data);
  if (Object.prototype.hasOwnProperty.call(next, "password")) {
    if (next.password) secrets.set("SONDERR_EMAIL_PASSWORD", String(next.password));
    else secrets.remove("SONDERR_EMAIL_PASSWORD");
    // Remove the old JSON copy when a password is updated through the UI.
    const saved = credentials();
    if (Object.prototype.hasOwnProperty.call(saved, "emailPassword")) {
      delete saved.emailPassword;
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
      try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch {}
    }
  }
  return { ...allowed, passwordConfigured: Boolean(emailPassword()) };
}

function emailPassword() {
  const legacy = credentials();
  if (Object.prototype.hasOwnProperty.call(legacy, "emailPassword")) {
    delete legacy.emailPassword;
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(legacy, null, 2), { mode: 0o600 });
    try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch {}
  }
  return secrets.get("SONDERR_EMAIL_PASSWORD");
}

function walletConfig() {
  const data = read();
  return data.wallet && typeof data.wallet === "object" ? { ...data.wallet } : {};
}

function updateWalletConfig(next = {}) {
  const data = read();
  const current = walletConfig();
  const chain = String(next.chain ?? current.activeChain ?? current.chain ?? "evm").trim().slice(0, 20);
  const wallets = current.wallets && typeof current.wallets === "object" ? { ...current.wallets } : {};
  if (current.chain && current.address && !wallets[current.chain]) {
    wallets[current.chain] = { chain: current.chain, rpcUrl: current.rpcUrl || "", network: current.network || "", address: current.address };
  }
  const previous = wallets[chain] || (current.chain === chain ? current : {});
  const selected = {
    chain,
    rpcUrl: String(next.rpcUrl ?? previous.rpcUrl ?? "").trim().slice(0, 2048),
    network: String(next.network ?? previous.network ?? "Custom network").trim().slice(0, 80),
    address: String(next.address ?? previous.address ?? "").trim().slice(0, 256)
  };
  wallets[chain] = selected;
  data.wallet = {
    ...selected,
    activeChain: chain,
    wallets
  };
  write(data);
  return { ...data.wallet };
}

function walletPortfolioSnapshot(key = "default") {
  const data = read();
  if (data.walletPortfolioSnapshots && typeof data.walletPortfolioSnapshots === "object" && data.walletPortfolioSnapshots[key]) return { ...data.walletPortfolioSnapshots[key] };
  return data.walletPortfolio && typeof data.walletPortfolio === "object" ? { ...data.walletPortfolio } : null;
}

function saveWalletPortfolioSnapshot(snapshot = {}, key = "default") {
  const data = read();
  const saved = { ...snapshot, savedAt: new Date().toISOString() };
  const snapshots = data.walletPortfolioSnapshots && typeof data.walletPortfolioSnapshots === "object" ? { ...data.walletPortfolioSnapshots } : {};
  snapshots[key] = saved;
  data.walletPortfolioSnapshots = snapshots;
  data.walletPortfolio = saved;
  write(data);
  return { ...saved };
}

function walletWatchState() {
  const data = read();
  const state = data.walletWatch && typeof data.walletWatch === "object" ? data.walletWatch : {};
  return { enabled: Boolean(state.enabled), snapshots: state.snapshots && typeof state.snapshots === "object" ? { ...state.snapshots } : {}, events: Array.isArray(state.events) ? state.events.slice(-50) : [] };
}

function updateWalletWatch(next = {}) {
  const data = read(), current = walletWatchState();
  const saved = {
    enabled: next.enabled == null ? current.enabled : Boolean(next.enabled),
    snapshots: next.snapshots && typeof next.snapshots === "object" ? next.snapshots : current.snapshots,
    events: Array.isArray(next.events) ? next.events.slice(-50) : current.events
  };
  data.walletWatch = saved;
  write(data);
  return { enabled: saved.enabled, snapshots: { ...saved.snapshots }, events: saved.events.slice(-50) };
}

function addWalletWatchEvent(event = {}) {
  const state = walletWatchState();
  const item = { ...event, id: String(event.id || crypto.randomUUID()), receivedAt: new Date().toISOString() };
  updateWalletWatch({ events: [...state.events, item] });
  return item;
}

function onboarding() {
  const data = read();
  return data.onboarding && typeof data.onboarding === "object" ? { ...data.onboarding } : { completed: false };
}

function saveOnboarding(next = {}) {
  const data = read();
  data.onboarding = { ...onboarding(), ...next, completed: true, completedAt: new Date().toISOString() };
  write(data);
  return { ...data.onboarding };
}

module.exports = { DATA_DIR, DATA_FILE, CREDENTIALS_FILE, listSessions, createSession, updateStudio, getSession, setSessionPlugin, addMessage, getTodos, setTodos, taskCheckpoint, setTaskCheckpoint, pauseTaskCheckpoint, pauseInterruptedTaskCheckpoints, sanitizeTaskCheckpoint, qualityState, setQualityState, sanitizeTodos, listEarningOpportunities, saveEarningOpportunity, settings, updateSettings, providerKey, providerTpmLimit, rememberProviderTpmLimit, emailConfig, updateEmailConfig, emailPassword, walletConfig, updateWalletConfig, walletPortfolioSnapshot, saveWalletPortfolioSnapshot, walletWatchState, updateWalletWatch, addWalletWatchEvent, onboarding, saveOnboarding };
