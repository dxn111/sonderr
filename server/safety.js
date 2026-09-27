"use strict";

// Security boundaries that do not depend on the model following instructions.
// This module is deliberately conservative around credentials and control-plane
// data, while leaving ordinary programming, research, and file work alone.

const path = require("node:path");

const REDACTION = "[redacted by Sonderr safety]";
const MAX_DEPTH = 10;
const MAX_KEYS = 250;
const SECRET_FIELD_NAMES = new Set([
  "apikey", "accesstoken", "refreshtoken", "idtoken", "authtoken", "sessiontoken",
  "clientsecret", "secret", "password", "passwd", "passphrase", "authorization",
  "proxyauthorization", "bearertoken", "token", "privatekey", "mnemonic", "seed", "seedphrase",
  "credential", "credentials", "walletsecret", "walletprivatekey", "accesskeyid"
]);

function normalizedFieldName(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretField(value) {
  const key = normalizedFieldName(value);
  return SECRET_FIELD_NAMES.has(key)
    || /^(?:api|access|refresh|id|auth|session|bearer|oauth)token(?:secret|value)?$/.test(key)
    || /^(?:secret|private|signing|wallet)(?:key|seed|mnemonic)(?:hex|bytes|phrase|words|value)?$/.test(key)
    || /^(?:aws)?secretaccesskey$/.test(key)
    || /^(?:client|consumer)secret$/.test(key);
}

function normalPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function isSensitiveWorkspacePath(value) {
  const target = normalPath(value);
  if (!target) return false;

  // Generated/uploaded artifacts are intentionally downloadable. Everything
  // else in Sonderr's internal directory is control-plane or secret material.
  if (target === ".sonderr" || target.startsWith(".sonderr/")) {
    return !(/^\.sonderr\/(uploads|generated)(?:\/|$)/.test(target));
  }
  if (target === ".git" || target.startsWith(".git/")) return true;
  if (/(^|\/)\.env(?:\.|$)/.test(target)) return true;
  if (/(^|\/)(credentials?|secrets?|tokens?)(?:\.|\/|$)/.test(target)) return true;
  if (/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|known_hosts|authorized_keys)(?:\.|$)/.test(target)) return true;
  if (/\.(pem|key|p12|pfx|kdbx|keystore)$/i.test(target)) return true;
  if (/(^|\/)(\.ssh|\.gnupg|\.aws|\.kube)(?:\/|$)/.test(target)) return true;
  return false;
}

function assertSafeWorkspacePath(value) {
  if (isSensitiveWorkspacePath(value)) {
    throw new Error("This path contains protected credentials or Sonderr control data and is not available to the assistant.");
  }
}

function redactText(value) {
  let text = String(value ?? "");
  // Context-labelled values are removed before format-specific tokens. Existing
  // markers are skipped, so repeated scrubbing is stable and cannot expose a suffix.
  text = text.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
  text = text.replace(/([?&](?:api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|oauth[_-]?token|bearer[_-]?token|token|key|client[_-]?secret|secret|password|passphrase|signature|sig)=)(?!\[redacted by Sonderr safety\])[^&#\s"'<>]+/gi, "$1" + REDACTION);
  text = text.replace(/\b((?:proxy-)?authorization\s*:\s*(?:bearer\s+)?)(?!\[redacted by Sonderr safety\])[^\s,;"']+/gi, "$1" + REDACTION);
  text = text.replace(/\b(bearer\s+)(?!\[redacted by Sonderr safety\])[A-Za-z0-9._~+/-]{12,}={0,2}/gi, "$1" + REDACTION);
  text = text.replace(/(?<![?&])(["']?(?:api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?token|oauth[_-]?token|bearer[_-]?token|token|client[_-]?secret|secret|password|passwd|passphrase|authorization|private[_-]?key|signing[_-]?key|mnemonic|seed(?:[_ -]?phrase)?)["']?\s*[:=]\s*)(?!\[redacted by Sonderr safety\])(?:"([^"]*)"|'([^']*)'|([^\s,;}&\]]+))/gi, (match, prefix, doubleQuoted, singleQuoted, bare) => prefix + (doubleQuoted !== undefined || singleQuoted !== undefined ? `"${REDACTION}"` : REDACTION));
  text = text.replace(/(--(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password)(?:\s+|=))(?!\[redacted by Sonderr safety\])(?:bearer\s+)?[^\s,;"']+/gi, "$1" + REDACTION);
  text = text.replace(/\b((?:mnemonic|seed phrase|recovery phrase)\s*(?:=|:|is)\s*)(?!\[redacted by Sonderr safety\])[^\r\n]+/gi, "$1" + REDACTION);
  // Known provider/service credential formats intentionally exclude public
  // wallet/token addresses and ordinary hashes.
  text = text.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, REDACTION);
  text = text.replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, REDACTION);
  text = text.replace(/\b(?:gsk_|hf_|xai-|pplx-|r8_)[A-Za-z0-9_-]{20,}\b/gi, REDACTION);
  text = text.replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/gi, REDACTION);
  text = text.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, REDACTION);
  text = text.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTION);
  text = text.replace(/\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g, REDACTION);
  text = text.replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, REDACTION);
  return text;
}

function sanitizeValueInner(value, depth, allowWalletConfirmationToken = false) {
  if (depth > MAX_DEPTH) return "[truncated by Sonderr safety]";
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map(item => sanitizeValueInner(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    const walletEvent = value.type === "tool_end"
      && ["prepare_wallet_transaction", "prepare_wallet_swap"].includes(value.name);
    for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
      const walletOutput = walletEvent && key === "output";
      const safeConfirmationToken = allowWalletConfirmationToken && key === "token"
        && typeof item === "string" && /^[a-f0-9]{48}$/i.test(item)
        && Number.isFinite(Number(value.expiresAt));
      const clean = isSecretField(key) && !safeConfirmationToken
        ? REDACTION
        : sanitizeValueInner(item, depth + 1, walletOutput);
      Object.defineProperty(output, key, { value: clean, enumerable: true, configurable: true, writable: true });
    }
    return output;
  }
  return String(value);
}

function sanitizeValue(value, depth = 0) {
  return sanitizeValueInner(value, depth, false);
}

function sanitizeToolOutput(name, output) {
  const clean = sanitizeValue(output);
  if (["prepare_wallet_transaction", "prepare_wallet_swap"].includes(String(name))
    && clean && typeof clean === "object" && output && typeof output === "object"
    && typeof output.token === "string" && /^[a-f0-9]{48}$/i.test(output.token)
    && Number.isFinite(Number(output.expiresAt))) {
    clean.token = output.token;
  }
  return clean;
}

function normalizeForComparison(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function containsPromptExcerpt(output, systemPrompt) {
  const candidate = normalizeForComparison(output);
  const source = normalizeForComparison(systemPrompt);
  if (!candidate || !source || candidate.length < 100) return false;
  // Find a meaningful 100-character run from the hidden prompt. This avoids
  // false positives for generic phrases such as "be helpful".
  const size = 100;
  for (let i = 0; i + size <= candidate.length; i += 25) {
    if (source.includes(candidate.slice(i, i + size))) return true;
  }
  return false;
}

function hasPseudoToolMarkup(output) {
  // Some weaker OpenAI-compatible models serialize a tool request as text
  // instead of using the structured tool_calls field. They also commonly
  // escape angle brackets/underscores, or put a friendly sentence before the
  // dump. Normalize those forms before checking; otherwise the text can be
  // shown as if an action ran. Ignore fenced and inline code examples so the
  // assistant can still explain this syntax when explicitly asked.
  const visible = String(output || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/\\([\\_*<>])/g, "$1")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'");
  const markup = /<\s*\/?\s*(?:tool\s*_?\s*call\b|function\s*(?:=|\b)|parameter\s*=|arguments\s*=)/i;
  const serializedCall = /["'](?:tool_call|tool_calls|function_call|tool_call_id)["']\s*:|["']function["']\s*:\s*\{\s*["']name["']\s*:/i;
  return markup.test(visible) || serializedCall.test(visible);
}

function sanitizeAssistantOutput(output, systemPrompt = "") {
  const raw = String(output || "");
  const explicitLeak = /(?:^|\n)\s*(?:system|developer|hidden)\s*(?:prompt|instructions?)\s*[:=-]/i.test(raw)
    || /(?:here(?:'s| is)|revealing|verbatim).{0,50}(?:system prompt|developer instructions)/i.test(raw);
  if (explicitLeak || containsPromptExcerpt(raw, systemPrompt)) {
    return "I can’t provide hidden instructions, internal configuration, or credentials. I can explain Sonderr’s public behavior and safety boundaries instead.";
  }
  if (hasPseudoToolMarkup(raw)) {
    return "I received tool-call-shaped text instead of a normal answer. That text alone is not evidence an action happened; I’ll report only results shown by actual tool activity.";
  }
  return redactText(raw);
}

function assessUserMessage(value) {
  const text = String(value || "").trim();
  const asksForHiddenPrompt = /\b(?:reveal|show|print|dump|repeat|export|tell me|display|ignore.{0,60}(?:rules|instructions))\b[\s\S]{0,100}\b(?:system prompt|developer message|hidden instructions?|internal prompt)\b/i.test(text)
    || /\b(?:system prompt|developer message|hidden instructions?)\b[\s\S]{0,100}\b(?:verbatim|full|exact|raw)\b/i.test(text);
  const asksForSecrets = /\b(?:api key|access token|secret key|private key|seed phrase|mnemonic|password)\b[\s\S]{0,100}\b(?:reveal|show|print|dump|export|give|tell)\b/i.test(text)
    || /\b(?:reveal|show|print|dump|export|give|tell)\b[\s\S]{0,100}\b(?:api key|access token|secret key|private key|seed phrase|mnemonic|password)\b/i.test(text);
  if (asksForHiddenPrompt || asksForSecrets) {
    return {
      blocked: true,
      message: "I can’t disclose hidden instructions, secrets, private keys, tokens, or credential files. I can help explain the public behavior or show how to rotate/configure a credential safely."
    };
  }
  return { blocked: false };
}

function hasMcpConfigurationIntent(value) {
  const text = String(value || "").toLowerCase();
  if (isNonExecutableActionQuestion(text)) return false;
  return hasAffirmativeMatch(text, /\b(?:add|connect|configure|install|set up|setup|enable)\b[\s\S]{0,90}\b(?:mcp|model context protocol)\b/i)
    || hasAffirmativeMatch(text, /\b(?:mcp|model context protocol)\b[\s\S]{0,90}\b(?:add|connect|configure|install|set up|setup|enable)\b/i);
}

function isNonExecutableActionQuestion(value) {
  const text = String(value || "").trim();
  return /^\s*(?:should\s+(?:i|we)|what\s+if|what\s+happens\s+if|how\s+(?:do\s+i|can\s+i|should\s+i)|is\s+it\s+(?:safe|possible|okay)\s+to)\b/i.test(text)
    || /^\s*(?:can|could|would)\s+you\s+(?:explain|tell\s+me|show\s+me|help\s+me\s+understand)\b/i.test(text);
}

function hasAffirmativeMatch(value, pattern) {
  const text = String(value || "");
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const matcher = new RegExp(pattern.source, flags);
  let match;
  while ((match = matcher.exec(text))) {
    const priorBoundary = Math.max(text.lastIndexOf(".", match.index), text.lastIndexOf("!", match.index), text.lastIndexOf("?", match.index), text.lastIndexOf(";", match.index), text.lastIndexOf("\n", match.index));
    const prefix = text.slice(priorBoundary + 1, match.index);
    if (!/\b(?:not|never|without|avoid|decline|refuse|don't|dont|do not|shouldn't|should not|must not|cannot|can't)\b(?:[^\w]{1,3}\w+){0,4}[^\w]*$/i.test(prefix)) return true;
    if (match[0].length === 0) matcher.lastIndex++;
  }
  return false;
}

function hasDirectIntent(value, pattern) {
  const text = String(value || "");
  return !isNonExecutableActionQuestion(text) && hasAffirmativeMatch(text, pattern);
}

function hasMcpCallIntent(value) {
  const text = String(value || "").toLowerCase();
  if (isNonExecutableActionQuestion(text)) return false;
  const namedConnector = /\b(?:mcp|notion|gmail|google drive|slack|linear)\b/.test(text);
  const explicitAction = hasAffirmativeMatch(text, /\b(?:call|run|invoke|read|open|fetch|search|find|query|get|retrieve|send|write|create|update|delete|archive|post|add|remove|use)\b/i);
  return namedConnector && explicitAction;
}

function hasMcpWriteIntent(value) {
  const text = String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^a-z0-9]+/gi, " ").toLowerCase();
  return /\b(?:create|write|update|edit|delete|remove|archive|send|post|publish|invite|submit|share|add|set|change|modify|save|move|transfer|insert|append|replace|rename|approve|purchase|pay|charge|close|complete|resolve)\b/.test(text);
}

function mcpMutationMatchesRequest(userText, toolName) {
  const normalize = value => String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^a-z0-9]+/gi, " ").toLowerCase();
  const groups = [
    /\b(?:create|add|insert|append|new)\b/,
    /\b(?:write|update|edit|change|modify|save|set|replace|rename)\b/,
    /\b(?:delete|remove|archive)\b/,
    /\b(?:send|post|publish|submit)\b/,
    /\b(?:share|invite)\b/,
    /\b(?:move|transfer)\b/,
    /\b(?:approve|purchase|pay|charge)\b/,
    /\b(?:close|complete|resolve)\b/
  ];
  const request = normalize(userText), tool = normalize(toolName);
  return groups.some(group => hasAffirmativeMatch(request, group) && group.test(tool));
}

function hasWorkspaceEditIntent(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (isNonExecutableActionQuestion(text)) return false;
  if (/^\s*(?:what|why|how|when|where|which)\b|^\s*(?:can|could|would)\s+you\s+(?:please\s+)?(?:explain|tell me|show me|help me understand)\b/i.test(text)) return false;
  const imperative = /^\s*(?:please\s+)?(?:implement|edit|change|fix|write|create|update|patch|replace|refactor|debug|repair|modify|improve|build|make(?!\s+sure)|remove|delete|rename)\b/i;
  const directRequest = /\b(?:(?:can|could|would)\s+you\s+(?:please\s+)?|i\s+(?:need|want)\s+you\s+to\s+|i['’]d\s+like\s+you\s+to\s+)(?:implement|edit|change|fix|write|create|update|patch|replace|refactor|debug|repair|modify|improve|build|make(?!\s+sure)|remove|delete|rename)\b/i;
  const helpRequest = /\b(?:help me|help us)\s+(?:to\s+)?(?:implement|edit|change|fix|write|create|update|patch|replace|refactor|debug|repair|modify|improve|build|make)\b|\b(?:can|could|would)\s+you\s+(?:please\s+)?help\s+(?:me|us)\s+(?:to\s+)?(?:implement|edit|change|fix|write|create|update|patch|replace|refactor|debug|repair|modify|improve|build|make)\b/i;
  const continuation = /\b(?:go ahead and|keep working|continue working|work more|work on|keep going|fix (?:it|this|that)|change (?:it|this|that)|edit (?:it|this|that)|improve (?:it|this|that)|polish (?:it|this|that)|do (?:it|that|this))\b/i;
  const shortConfirmation = /^\s*(?:yes|yeah|yep|okay|ok|sure)\s+(?:please\s+)?(?:do|make|build|create|fix|change|update|write)\s+(?:it|that|this)\b/i;
  return [imperative, directRequest, helpRequest, continuation, shortConfirmation].some(pattern => hasAffirmativeMatch(text, pattern));
}

function hasImageEditIntent(value) {
  const text = String(value || "").trim();
  if (!text || isNonExecutableActionQuestion(text)) return false;
  return hasAffirmativeMatch(text, /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+)?(?:please\s+)?(?:generate|create|make|draw|paint|illustrate|design|edit|modify|change|crop|resize|remove|replace|upscale)\b[\s\S]{0,80}\b(?:image|picture|photo|artwork|illustration|background|logo|poster|graphic)\b/i)
    || hasAffirmativeMatch(text, /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+)?(?:please\s+)?(?:edit|modify|change|crop|resize|remove|replace|upscale)\b/i);
}

function hasWalletWatchIntent(value) {
  const text = String(value || "").toLowerCase();
  if (isNonExecutableActionQuestion(text)) return false;
  return hasAffirmativeMatch(text, /\b(?:start|enable|turn on)\b[\s\S]{0,40}\b(?:watch(?:er|ing)?|monitor(?:ing)?|poll(?:ing)?|alert|notify)\b/i)
    || hasAffirmativeMatch(text, /\b(?:stop|disable|turn off)\b[\s\S]{0,40}\b(?:watch(?:er|ing)?|monitor(?:ing)?|poll(?:ing)?|alert|notify)\b/i)
    || hasAffirmativeMatch(text, /\b(?:watch(?:er|ing)?|monitor(?:ing)?|poll(?:ing)?|alert|notify)\b[\s\S]{0,30}\b(?:on|off|start|stop|enable|disable)\b/i);
}

function hasVerificationIntent(value) {
  const text = String(value || "").toLowerCase();
  if (isNonExecutableActionQuestion(text)) return false;
  if (/^\s*(?:what|why|how|when|where|which|should|would it|is it|are we)\b/i.test(text)) return false;
  return hasAffirmativeMatch(text, /\b(?:run|execute|perform|start)\b[\s\S]{0,70}\b(?:tests?|checks?|lint|typecheck|type-check|build)\b/i)
    || hasAffirmativeMatch(text, /\b(?:test|lint|typecheck|type-check|build|verify)\b\s+(?:this|the|my|our|it|project|app|codebase|workspace)\b/i)
    || hasAffirmativeMatch(text, /\b(?:check|make\s+sure)\b[\s\S]{0,50}\b(?:work(?:s|ing)?|run(?:s|ning)?|pass(?:es|ed)?|healthy|correct|successful)\b/i)
    || hasAffirmativeMatch(text, /\b(?:verify|verification|quality check)\b[\s\S]{0,70}\b(?:project|app|codebase|workspace)\b/i);
}

function hasTerminalExecutionIntent(value) {
  const text = String(value || "").replace(/[\x60"'“”‘’]/g, "").trim();
  if (!text || isNonExecutableActionQuestion(text)) return false;
  return hasAffirmativeMatch(text, /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+)?(?:please\s+)?(?:run|execute|start)\s+(?:(?:this|the|all|these|those|my|our|existing|project|provided|supplied|given|following|attached|specified|named)\s+){0,2}(?:terminal\s+|shell\s+)?(?:command\b|script\b|tests?\b|checks?\b|lint\b|type[ -]?check\b|build\b|git\b|npm\b|pnpm\b|yarn\b|node\b|python\b|curl\b|wget\b)/i)
    || hasAffirmativeMatch(text, /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+)?(?:please\s+)?(?:install|curl|wget)\b/i)
    || hasAffirmativeMatch(text, /^\s*go\s+ahead\s+and\s+run\s+(?:it|that|this)\b/i);
}

function hasWalletIntent(action, value) {
  const text = String(value || "").toLowerCase();
  const leadIn = String.raw`(?:(?:please\s+)?(?:(?:can|could|would)\s+you|i\s+(?:want|need)\s+you\s+to|i\s+want\s+to|i['’]d\s+like\s+you\s+to)\s+(?:please\s+)?|(?:please\s+)?)`;
  const asset = String.raw`(?:wallet|crypto|funds?|tokens?|coins?|eth(?:ereum)?|sol(?:ana)?|usdt|memecoin)`;
  if (action === "create") return new RegExp(String.raw`^\s*${leadIn}(?:create|make|generate|set\s*up)\b[\s\S]{0,50}\b(?:sonderr\s+)?wallet\b`).test(text);
  if (action === "send") return new RegExp(String.raw`^\s*${leadIn}(?:send|transfer|pay|withdraw)\b[\s\S]{0,120}\b${asset}\b`).test(text);
  if (action === "swap") return new RegExp(String.raw`^\s*${leadIn}(?:swap|exchange|convert|trade|quote)\b[\s\S]{0,120}\b${asset}\b`).test(text);
  return false;
}

function terminalPolicy(command) {
  const text = String(command || "").trim();
  if (!text) return { allowed: false, reason: "A terminal command is required." };
  const blocks = [
    [/\bcat\s+(?:[^\n]*\/)?\.env\b|\bprintenv\b|\benv\s*$/i, "Commands that print environment credentials are blocked."],
    [/(?:\.ssh\/|id_rsa|id_ed25519|credentials\.json|\.sonderr\/(?!uploads|generated))/, "Commands that access protected credentials or Sonderr control data are blocked."],
    [/\b(?:curl|wget|nc|ncat|scp|rsync)\b[\s\S]*(?:\.env|credentials|id_rsa|private[_ -]?key|secret|token)/i, "Commands that could transmit credentials are blocked."],
    [/\brm\s+(?:-[^\s]*r[^\s]*\s+)?(?:\/|~|\$HOME|\.|\.\.)\s*$/i, "Broad destructive delete commands are blocked."],
    [/\bgit\s+reset\s+--hard\b/i, "Destructive git reset commands are blocked."],
    [/\b(?:base64|xxd)\b[\s\S]*(?:\.env|credentials|id_rsa|private[_ -]?key)/i, "Commands that encode protected credentials are blocked."]
  ];
  for (const [pattern, reason] of blocks) if (pattern.test(text)) return { allowed: false, reason };
  return { allowed: true };
}

function toolPolicy(name, input) {
  const tool = String(name || "");
  const data = input && typeof input === "object" ? input : {};
  const pathFields = ["path", "source_path"];
  for (const field of pathFields) if (data[field]) assertSafeWorkspacePath(data[field]);
  if (tool === "run_terminal_command") return terminalPolicy(data.command);
  if (tool === "call_mcp_tool" && (!String(data.server_id || "").trim() || !String(data.tool_name || "").trim())) {
    return { allowed: false, reason: "MCP tool calls require a configured server_id and an exact tool_name." };
  }
  return { allowed: true };
}

function isTrustedLocalRequest(req) {
  const remote = String(req.socket?.remoteAddress || "");
  if (remote && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) return false;
  const host = String(req.headers?.host || "").split(",")[0].trim().toLowerCase();
  return /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host);
}

function hasTrustedOrigin(req) {
  const origin = String(req.headers?.origin || "").trim().toLowerCase();
  if (!origin) return true; // non-browser localhost clients; socket+Host are still checked.
  return /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(origin);
}

function hasTrustedBrowserOrigin(req) {
  return Boolean(String(req.headers?.origin || "").trim()) && hasTrustedOrigin(req);
}

module.exports = {
  REDACTION,
  isSensitiveWorkspacePath,
  assertSafeWorkspacePath,
  redactText,
  sanitizeValue,
  sanitizeToolOutput,
  isSecretField,
  hasPseudoToolMarkup,
  sanitizeAssistantOutput,
  assessUserMessage,
  hasMcpConfigurationIntent,
  hasMcpCallIntent,
  hasMcpWriteIntent,
  mcpMutationMatchesRequest,
  hasWorkspaceEditIntent,
  hasAffirmativeMatch,
  hasDirectIntent,
  hasImageEditIntent,
  hasWalletWatchIntent,
  hasVerificationIntent,
  hasTerminalExecutionIntent,
  hasWalletIntent,
  terminalPolicy,
  toolPolicy,
  isTrustedLocalRequest,
  hasTrustedOrigin,
  hasTrustedBrowserOrigin
};
