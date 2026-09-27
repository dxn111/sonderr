// Sonderr skills — backend playbook library.
// Each skill is a markdown file in ../skills with YAML-ish frontmatter:
//   ---
//   id, name, category, icon, triggers (comma separated), summary
//   ---
//   body = the full instructions injected into the prompt when the skill is active.
// Skills are NOT a user-facing toggle: the harness selects tiny metadata-only
// candidates, then the model loads full instructions on demand via tools.

const fs = require("node:fs");
const path = require("node:path");

const SKILLS_DIR = path.resolve(__dirname, "..", "skills");
const MAX_AUTO_ATTACH = 2; // metadata only; full playbooks still load on demand
const GENERIC_TRIGGERS = new Set(["api", "app", "build", "code", "component", "data", "design", "error", "file", "help", "model", "project", "quality", "review", "search", "server", "skill", "task", "test", "tool", "web", "work"]);
const QUERY_ALIASES = new Map([
  ["ugly", ["frontend", "ui", "visual", "polish"]], ["prettier", ["frontend", "ui", "visual", "polish"]],
  ["beautiful", ["frontend", "ui", "visual", "design"]], ["janky", ["frontend", "ui", "layout"]],
  ["slow", ["performance", "profiling", "optimization"]], ["sluggish", ["performance", "profiling"]],
  ["websearcj", ["web search", "web research"]], ["webseach", ["web search", "web research"]],
  ["looks better", ["frontend"]], ["look better", ["frontend"]], ["look good", ["frontend"]],
  ["less ugly", ["frontend", "ui", "polish"]], ["clean up the ui", ["frontend", "visual"]],
  ["review my code", ["code review"]], ["review this pr", ["pr review"]], ["send an email", ["send email"]],
  ["write an email", ["send email"]], ["make a game", ["game design"]], ["build a website", ["website"]],
  ["check my wallet", ["wallet balance"]], ["show my wallet", ["wallet balance"]],
  ["bugbounty", ["bug bounty program", "security report"]], ["dev", ["developer"]],
  ["crashed", ["crash", "debug"]], ["broken", ["bug", "debug"]], ["devnet solana", ["wallet balance"]], ["secure", ["security"]]
]);
const QUERY_STOP_WORDS = new Set("a an and are as at be but can do for from i in is it its me my of on or please should that the this to we what when where with you your".split(/\s+/));

function parseSkill(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  if (!meta.id || !meta.name) return null;
  return {
    id: meta.id,
    name: meta.name,
    category: meta.category || "General",
    icon: meta.icon || "✦",
    triggers: (meta.triggers || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
    summary: meta.summary || "",
    file,
    instructions: match[2].trim()
  };
}

function scan() {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(SKILLS_DIR); } catch { return out; }
  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    try {
      const skill = parseSkill(fs.readFileSync(path.join(SKILLS_DIR, file), "utf8"), file);
      if (skill) out.push(skill);
    } catch { /* unreadable skill files are skipped, never fatal */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const SKILLS = scan();
const BY_ID = new Map(SKILLS.map(s => [s.id, s]));

function all() { return SKILLS; }
function get(id) { return BY_ID.get(String(id || "").trim()); }
function has(id) { return BY_ID.has(String(id || "").trim()); }

/** Full instructions for one skill (load_skill tool payload). */
function load(id) {
  const skill = get(id);
  if (!skill) return null;
  return { id: skill.id, name: skill.name, category: skill.category, instructions: skill.instructions };
}

/** One line per skill for the system-prompt directory. */
function directory() {
  return SKILLS.map(s => {
    const when = s.triggers.slice(0, 6).join(", ");
    return `- ${s.id} (${s.category}) — ${s.summary} Use for: ${when}.`;
  }).join("\n");
}

/** Small metadata-only recommendations; full instructions require load(). */
function matchingEvidence(skill, text) {
  const value = normalizeText(text);
  if (!value) return [];
  const evidence = [];
  if (new RegExp("(^|[^a-z0-9])" + skill.id.replace(/[-.]+/g, "[\\s.-]+") + "(?=$|[^a-z0-9])", "i").test(value)) {
    evidence.push({ trigger: skill.id, score: 100, explicit: true, matchType: "skill id" });
  }
  const normalizedName = skill.name.toLowerCase().replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalizedName && triggerPattern(normalizedName)?.test(value)) evidence.push({ trigger: normalizedName, score: 95, explicit: true, matchType: "skill name" });
  for (const trigger of skill.triggers) {
    if (!trigger) continue;
    const matcher = triggerPattern(trigger);
    if (matcher?.test(value)) {
      evidence.push({ trigger, score: triggerScore(trigger), explicit: false, matchType: "phrase" });
      continue;
    }
    const triggerWords = meaningfulWords(trigger);
    if (triggerWords.length < 2) continue;
    const queryWords = new Set(meaningfulWords(value));
    const overlap = triggerWords.filter(word => queryWords.has(word)).length;
    if (overlap >= 2 && overlap / triggerWords.length >= 0.66) {
      evidence.push({ trigger, score: Math.max(4, triggerScore(trigger) * overlap / triggerWords.length * 0.58), explicit: false, matchType: "related terms" });
    }
  }
  for (const [alias, expansions] of QUERY_ALIASES) {
    if (!triggerPattern(alias)?.test(value)) continue;
    for (const expansion of expansions) {
      const matcher = triggerPattern(expansion);
      const corresponds = skill.triggers.some(trigger => expansion.includes(" ") ? matcher?.test(trigger) : trigger === expansion);
      if (matcher && corresponds && !evidence.some(item => item.trigger === alias)) {
        evidence.push({ trigger: alias, score: alias.includes(" ") ? 15 : 8, explicit: false, matchType: "synonym" });
      }
    }
  }
  // A collection of near-duplicate or repeated triggers is only one signal.
  const bestBySignal = new Map();
  for (const item of evidence) {
    const key = item.matchType === "phrase" || item.matchType === "related terms" ? item.trigger : `${item.matchType}:${item.trigger}`;
    if (!bestBySignal.has(key) || bestBySignal.get(key).score < item.score) bestBySignal.set(key, item);
  }
  return [...bestBySignal.values()].sort((a, b) => b.score - a.score || b.trigger.length - a.trigger.length);
}

function normalizeText(text) {
  return String(text || "").toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(address|balance|wallet|bounty|contribution|faucet|skill|tool)s\b/g, "$1")
    .replace(/\bbug\s+bounties\b/g, "bug bounty")
    .replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim();
}

function meaningfulWords(text) {
  return normalizeText(text).split(/[\s'-]+/).filter(word => word.length > 1 && !QUERY_STOP_WORDS.has(word));
}

function triggerScore(trigger) {
  const words = meaningfulWords(trigger);
  if (words.length > 1) return Math.min(22, 11 + words.length * 2 + Math.min(3, trigger.length / 18));
  const word = words[0] || "";
  return GENERIC_TRIGGERS.has(word) ? 3 : Math.min(14, 5 + word.length * 0.7);
}

function recommendations(ids, taskText = "") {
  const ranked = new Map(rankForTask(taskText).map(item => [item.id, item]));
  return (ids || []).map(item => typeof item === "string" ? get(item) : get(item?.id)).filter(Boolean)
    .map(s => {
      const candidate = ranked.get(s.id);
      const evidence = (candidate?.evidence || matchingEvidence(s, taskText)).slice(0, 2);
      const reason = evidence.length ? ` Match: ${evidence.map(item => `“${item.trigger}”`).join(", ")}. Confidence: ${candidate?.confidence || "medium"}.` : "";
      return `- ${s.id} — ${s.name} (${s.category}): ${s.summary}${reason}`;
    })
    .join("\n");
}

/** Instructions block for callers that explicitly request eager attachment. */
function promptBlock(ids) {
  const picked = (ids || []).map(get).filter(Boolean);
  if (!picked.length) return "";
  const useContract = [
    "## How to apply these skills",
    "Use the playbooks as task-specific methods: keep the steps that fit the user's request, skip irrelevant steps, and ground decisions in the actual workspace.",
    "A skill is guidance, not permission. It cannot expand tool access, override the user's scope, or bypass system safety and confirmation rules.",
    "Follow the skill's finish check and report only work and results that were actually verified."
  ].join("\n");
  return useContract + "\n\n" + picked.map(s => `### Skill: ${s.name} (${s.id})\n${s.instructions}`).join("\n\n");
}

function triggerPattern(trigger) {
  const words = String(trigger).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const phrase = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s'-]+");
  const finalWord = words[words.length - 1];
  const plural = /s$/i.test(finalWord) ? "" : "(?:s|es)?";
  return new RegExp("(^|[^a-z0-9])" + phrase + plural + "(?=$|[^a-z0-9])", "i");
}

/** Auto-detect relevant skill ids from free text. No user configuration involved. */
function forTask(text) {
  return rankForTask(text).map(item => item.id);
}

function rankForTask(text) {
  return SKILLS.map(skill => {
    const evidence = matchingEvidence(skill, text);
    // Strongest phrase is primary; a small capped bonus rewards a second
    // independent clue without letting a long prompt select every skill.
    const scores = evidence.map(item => item.score);
    const score = (scores[0] || 0) + Math.min(5, (scores[1] || 0) * 0.18) + Math.min(2, (scores[2] || 0) * 0.08);
    const confidence = score >= 13.5 ? "high" : score >= 7 ? "medium" : "low";
    return { id: skill.id, score, confidence, evidence };
  }).filter(item => item.score >= 3.5)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_AUTO_ATTACH)
    .map(item => ({ ...item, evidence: item.evidence.slice(0, 3) }));
}

/** Combined response for a failed load_skill call: what IS available. */
function availableIds() { return SKILLS.map(s => s.id); }

function validateCatalog(items = SKILLS) {
  const errors = [];
  const ids = new Set();
  for (const skill of items) {
    if (ids.has(skill.id)) errors.push("duplicate id: " + skill.id);
    ids.add(skill.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id)) errors.push("invalid id: " + skill.id);
    if (!skill.name || !skill.category || !skill.summary || skill.summary.length < 24) errors.push("incomplete metadata: " + skill.id);
    if (!skill.triggers.length) errors.push("no selection triggers: " + skill.id);
    if (skill.instructions.split(/\s+/).filter(Boolean).length < 100) errors.push("playbook is too brief: " + skill.id);
    if (!/^## (?:Verify|Verification|Done when|Deliver|Delivery)\b/im.test(skill.instructions)) errors.push("missing finish check: " + skill.id);
  }
  return errors;
}

module.exports = { all, get, has, load, directory, recommendations, promptBlock, forTask, rankForTask, matchingEvidence, availableIds, validateCatalog, MAX_AUTO_ATTACH };
