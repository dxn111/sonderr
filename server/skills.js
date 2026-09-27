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
const MAX_LOCAL_SKILL_CHARS = 3_600;
const GENERIC_TRIGGERS = new Set(["api", "app", "build", "code", "component", "data", "design", "error", "file", "help", "model", "project", "quality", "review", "search", "server", "skill", "task", "test", "tool", "web", "work"]);
const QUERY_ALIASES = new Map([
  ["ugly", ["frontend", "ui", "visual", "polish"]], ["prettier", ["frontend", "ui", "visual", "polish"]],
  ["beautiful", ["frontend", "ui", "visual", "design"]], ["janky", ["frontend", "ui", "layout"]],
  ["slow", ["performance", "profiling", "optimization"]], ["sluggish", ["performance", "profiling"]],
  ["websearcj", ["web search", "web research"]], ["webseach", ["web search", "web research"]],
  ["looks better", ["frontend"]], ["look better", ["frontend"]], ["look good", ["frontend"]],
  ["less ugly", ["frontend", "ui", "polish"]], ["clean up the ui", ["frontend", "visual"]],
  ["review my code", ["code review"]], ["review this pr", ["pr review"]], ["send an email", ["send email"]],
  ["review my pull request", ["pr review"]], ["pull request review", ["pr review"]],
  ["write an email", ["send email"]], ["make a game", ["game design"]], ["build a website", ["website"]],
  ["stuck", ["not working", "debug"]], ["blocked on a bug", ["debug", "error"]],
  ["too slow", ["performance", "profiling"]], ["speed this up", ["speed up", "performance"]],
  ["api review", ["api contract", "code review"]], ["review an api", ["api contract", "code review"]],
  ["write unit tests", ["unit test", "test cases"]], ["test it", ["check my work", "test suite"]],
  ["check whether it works", ["check my work", "verification"]], ["system prompt", ["prompt design"]],
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

function sectionPriority(title, body, focusWords) {
  const heading = String(title || "").toLowerCase();
  let score = 0;
  if (/purpose|mission|when to use|scope/.test(heading)) score += 12;
  if (/guardrail|boundar|safety|security|privacy|consent|permission|risk/.test(heading)) score += 11;
  if (/verify|verification|done when|finish|deliver/.test(heading)) score += 10;
  if (/workflow|approach|steps|method|process|loop/.test(heading)) score += 8;
  if (/pitfall|failure|edge case|troubleshoot/.test(heading)) score += 7;
  const content = `${heading} ${body}`.toLowerCase();
  let matches = 0;
  for (const word of focusWords) if (content.includes(word)) matches++;
  return score + Math.min(8, matches * 2);
}

function focusedInstructions(instructions, focus, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars <= 0 || instructions.length <= maxChars) {
    return { instructions, focused: false, sections: [] };
  }
  const lines = instructions.split(/\r?\n/);
  const sections = [];
  let current = { title: "Overview", lines: [], index: -1 };
  const push = () => {
    const body = current.lines.join("\n").trim();
    if (body) sections.push({ ...current, body });
  };
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      push();
      current = { title: heading[1].trim(), lines: [lines[i]], index: i };
    } else current.lines.push(lines[i]);
  }
  push();
  const focusWords = meaningfulWords(focus).filter(word => word.length >= 3).slice(0, 12);
  const ranked = sections.map((section, index) => ({
    ...section,
    order: index,
    priority: sectionPriority(section.title, section.body, focusWords)
  })).sort((a, b) => b.priority - a.priority || a.order - b.order);
  const note = "[Focused playbook extract for this task; remaining sections were omitted to fit the local model context.]";
  const budget = Math.max(600, maxChars - note.length - 4);
  const chosen = [];
  let used = 0;
  for (const section of ranked) {
    const block = section.body;
    const remaining = budget - used;
    if (block.length <= remaining) {
      chosen.push(section);
      used += block.length + 2;
    } else if (section.priority >= 10 && remaining >= 240) {
      const clipped = { ...section, body: block.slice(0, remaining - 35).trimEnd() + "\n[section shortened]" };
      chosen.push(clipped);
      used += clipped.body.length + 2;
    }
  }
  if (!chosen.length) {
    chosen.push({ ...ranked[0], body: ranked[0].body.slice(0, budget - 35).trimEnd() + "\n[section shortened]" });
  }
  const selected = chosen.sort((a, b) => a.order - b.order).map(section => section.body).join("\n\n");
  return {
    instructions: `${selected}\n\n${note}`.slice(0, maxChars),
    focused: true,
    sections: chosen.map(section => section.title)
  };
}

/** Load full instructions for hosted models, or a focused extract for a small local context. */
function load(id, { focus = "", maxChars = 0 } = {}) {
  const skill = get(id);
  if (!skill) return null;
  const focused = focusedInstructions(skill.instructions, focus, maxChars);
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    instructions: focused.instructions,
    focused: focused.focused,
    sections: focused.sections,
    omittedInstructions: focused.focused && focused.instructions.length < skill.instructions.length
  };
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

function rankForTask(text, limit = MAX_AUTO_ATTACH) {
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
    .slice(0, Math.max(1, Math.min(10, Number(limit) || MAX_AUTO_ATTACH)))
    .map(item => ({ ...item, evidence: item.evidence.slice(0, 3) }));
}

function searchCatalog(query = "", { offset = 0, limit = 12 } = {}) {
  const rawQuery = String(query || "").trim();
  const listAll = !rawQuery || /^(?:\*|all|list all|every skill|available skills)$/i.test(rawQuery);
  let results;
  if (listAll) {
    results = SKILLS.map(skill => ({ id: skill.id, score: 0, confidence: "catalog", evidence: [] }));
  } else {
    results = rankForTask(rawQuery, 10);
    if (!results.length) {
      const value = normalizeText(rawQuery);
      results = SKILLS.filter(skill => normalizeText(`${skill.id} ${skill.name} ${skill.category} ${skill.summary} ${skill.triggers.join(" ")}`).includes(value))
        .map(skill => ({ id: skill.id, score: 0, confidence: "related", evidence: [] }));
    }
  }
  const safeOffset = Math.max(0, Math.min(results.length, Number.isInteger(Number(offset)) ? Number(offset) : 0));
  const safeLimit = Math.max(1, Math.min(20, Number.isInteger(Number(limit)) ? Number(limit) : 12));
  return {
    query: listAll ? "all" : rawQuery,
    total: results.length,
    offset: safeOffset,
    skills: results.slice(safeOffset, safeOffset + safeLimit).map(result => {
      const skill = get(result.id);
      return { id: skill.id, name: skill.name, category: skill.category, summary: skill.summary, triggers: skill.triggers.slice(0, 8), confidence: result.confidence, evidence: result.evidence.slice(0, 2) };
    }),
    hasMore: safeOffset + safeLimit < results.length,
    note: "Catalog metadata only; load a playbook by exact id to read its full instructions."
  };
}

// Some workflows carry a playbook requirement independent of lexical score.
// Keep these rules narrow and tied to actions so ordinary questions that only
// mention a domain do not pull in a long playbook unnecessarily.
function requiredForTask(text) {
  const value = normalizeText(text);
  if (!value) return [];
  const required = [];
  const emailSoftwareWork = /\b(?:email|e mail)\b.{0,28}\b(?:address )?(?:validation|validator|regex|pattern|field|format|parser|schema|api|endpoint|component|code)\b|\b(?:validation|validator|regex|pattern|field|format|parser|schema|api|endpoint|component|code)\b.{0,28}\b(?:email|e mail)\b/i.test(value);
  const outboundEmail = /\b(?:draft|write|compose|send|reply|respond|forward|prepare|rewrite|polish)\b.{0,80}\b(?:email|e mail|newsletter)\b/i.test(value)
    || /\b(?:email|e mail|newsletter)\b.{0,80}\b(?:draft|write|compose|send|reply|respond|forward|prepare|rewrite|polish)\b/i.test(value);
  if (outboundEmail && !emailSoftwareWork && has("email-safety")) required.push("email-safety");
  const explicitVerification = /\b(?:run|execute|perform)\s+(?:the\s+)?(?:tests?|checks?)\b|\b(?:test|verify|check)\s+(?:this|that|it|the (?:change|fix|code|project|build|result|feature|work))\b|\bdoes it work\b/i.test(value);
  if (explicitVerification && has("test-and-verify")) required.push("test-and-verify");
  return required;
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

module.exports = { all, get, has, load, directory, recommendations, promptBlock, forTask, rankForTask, searchCatalog, requiredForTask, matchingEvidence, availableIds, validateCatalog, MAX_AUTO_ATTACH, MAX_LOCAL_SKILL_CHARS };
