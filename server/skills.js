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
const MAX_AUTO_ATTACH = 2; // keep automatic context aligned with the system-prompt rule

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
  const value = String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return [];
  const evidence = [];
  if (new RegExp("(^|[^a-z0-9])" + skill.id.replace(/-/g, "[\\s-]+") + "(?=$|[^a-z0-9])", "i").test(value)) {
    evidence.push({ trigger: skill.id, score: 100, explicit: true });
  }
  const normalizedName = skill.name.toLowerCase().replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalizedName && value.includes(normalizedName)) evidence.push({ trigger: normalizedName, score: 100, explicit: true });
  for (const trigger of skill.triggers) {
    if (!trigger) continue;
    const matcher = triggerPattern(trigger);
    if (!matcher?.test(value)) continue;
    evidence.push({ trigger, score: trigger.includes(" ") ? 4 : (trigger.length >= 7 ? 2 : 1), explicit: false });
  }
  return evidence.sort((a, b) => b.score - a.score || b.trigger.length - a.trigger.length);
}

function recommendations(ids, taskText = "") {
  return (ids || []).map(item => typeof item === "string" ? get(item) : get(item?.id)).filter(Boolean)
    .map(s => {
      const evidence = matchingEvidence(s, taskText).slice(0, 2);
      const reason = evidence.length ? ` Match: ${evidence.map(item => `“${item.trigger}”`).join(", ")}.` : "";
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
  return SKILLS.map(skill => {
    const evidence = matchingEvidence(skill, text);
    return { id: skill.id, score: evidence.reduce((total, item) => total + item.score, 0), evidence };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_AUTO_ATTACH)
    .map(item => item.id);
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

module.exports = { all, get, has, load, directory, recommendations, promptBlock, forTask, matchingEvidence, availableIds, validateCatalog, MAX_AUTO_ATTACH };
