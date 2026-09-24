// Resumable quality budgets. Only active assistant work counts toward the
// minimum; time between turns, app restarts, and user review pauses do not.
// Budgets encourage deliberate passes, never idle waiting or filler changes.
const LEVELS = Object.freeze(Object.fromEntries([
  ...[10, 20, 40, 60].map((seconds, index) => [`S${index + 1}`, { tier: `S${index + 1}`, minimumMs: seconds * 1000, runLimit: [2, 2, 3, 3][index], label: "small task" }]),
  ...[5, 10, 15, 20].map((minutes, index) => [`H${index + 1}`, { tier: `H${index + 1}`, minimumMs: minutes * 60 * 1000, runLimit: [8, 12, 16, 20][index], label: "contained task" }]),
  ...[6, 8, 10, 12, 15, 18, 21, 24, 27, 30].map((hours, index) => [`U${index + 1}`, { tier: `U${index + 1}`, minimumMs: hours * 60 * 60 * 1000, runLimit: 80 + index * 20, label: "extended engineering task" }])
].map(([tier, value]) => [tier, Object.freeze(value)])));
const ORDER = [...Array.from({ length: 4 }, (_, i) => `S${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `H${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `U${i + 1}`)];
const ACTIVE = new Map();

function normalizeTier(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!LEVELS[key]) throw new Error("Quality tier must be S1-S4, H1-H4, or U1-U10");
  return key;
}

function elapsedActiveMs(state, now = Date.now()) {
  if (!state) return 0;
  const stored = Math.max(0, Number(state.activeMs) || 0);
  const activeSince = ACTIVE.get(String(state.taskKey || ""));
  return stored + (activeSince == null ? 0 : Math.max(0, now - activeSince));
}

function activeHourCount(state, now = Date.now()) {
  return Math.floor(elapsedActiveMs(state, now) / (60 * 60 * 1000));
}

function snapshot(state, now = Date.now()) {
  if (!state) return null;
  const elapsedMs = elapsedActiveMs(state, now);
  const minimumMs = Number(state.minimumMs) || LEVELS.H1.minimumMs;
  const remainingMs = Math.max(0, minimumMs - elapsedMs);
  return { ...state, elapsedMs, remainingMs, ready: remainingMs === 0, elapsedMinutes: Math.floor(elapsedMs / 60000), remainingMinutes: Math.ceil(remainingMs / 60000) };
}

function start(taskKey, now = Date.now()) {
  const key = String(taskKey || "");
  if (key && !ACTIVE.has(key)) ACTIVE.set(key, now);
}

function begin(existing, taskKey, tierInput, now = Date.now()) {
  const requested = normalizeTier(tierInput);
  const key = String(taskKey || "");
  if (!key) throw new Error("A task key is required for a quality budget");
  let state;
  if (!existing || existing.taskKey !== key) {
    if (existing?.taskKey) ACTIVE.delete(String(existing.taskKey));
    state = { taskKey: key, tier: requested, startedAt: now, activeMs: 0, minimumMs: LEVELS[requested].minimumMs, label: LEVELS[requested].label };
  } else {
    state = { ...existing, activeMs: Math.max(0, Number(existing.activeMs) || 0) };
    if (ORDER.indexOf(requested) > ORDER.indexOf(existing.tier)) {
      state.tier = requested;
      state.minimumMs = LEVELS[requested].minimumMs;
      state.label = LEVELS[requested].label;
    }
  }
  start(key, now);
  return snapshot(state, now);
}

function resume(existing, taskKey, now = Date.now()) {
  if (!existing || existing.taskKey !== taskKey) return null;
  // Older saved states used wall-clock time. Deliberately discard that value:
  // idle time cannot be proven to represent work.
  const state = { ...existing, activeMs: Math.max(0, Number(existing.activeMs) || 0) };
  start(taskKey, now);
  return snapshot(state, now);
}

function pause(state, now = Date.now()) {
  if (!state) return null;
  const key = String(state.taskKey || "");
  const activeMs = elapsedActiveMs(state, now);
  ACTIVE.delete(key);
  const paused = { ...state, activeMs, pausedAt: now };
  delete paused.elapsedMs;
  delete paused.remainingMs;
  delete paused.ready;
  delete paused.elapsedMinutes;
  delete paused.remainingMinutes;
  return paused;
}

// Persist elapsed active time at each durable milestone without counting the
// same active interval twice on the next snapshot.
function refresh(state, now = Date.now()) {
  if (!state) return null;
  const activeMs = elapsedActiveMs(state, now);
  ACTIVE.delete(String(state.taskKey || ""));
  const refreshed = { ...state, activeMs };
  start(refreshed.taskKey, now);
  return snapshot(refreshed, now);
}

module.exports = { LEVELS, normalizeTier, begin, resume, pause, refresh, snapshot, elapsedActiveMs, activeHourCount };
