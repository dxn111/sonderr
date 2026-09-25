"use strict";

// Security boundaries that do not depend on the model following instructions.
// This module is deliberately conservative around credentials and control-plane
// data, while leaving ordinary programming, research, and file work alone.

const path = require("node:path");

const REDACTION = "[redacted by Sonderr safety]";
const MAX_DEPTH = 10;
const MAX_KEYS = 250;

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
  // Common provider and service credential formats.
  text = text.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, REDACTION);
  text = text.replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/gi, REDACTION);
  text = text.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, REDACTION);
  text = text.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTION);
  text = text.replace(/\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g, REDACTION);
  text = text.replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, REDACTION);
  // Only redact values when they are explicitly labelled as credentials. This
  // avoids damaging normal source code, hashes, and public wallet addresses.
  text = text.replace(/\b(authorization\s*:\s*bearer\s+)[^\s,;"']+/gi, "$1" + REDACTION);
  text = text.replace(/\b((?:api[_ -]?key|access[_ -]?token|secret|password|private[_ -]?key)\s*(?:=|:|is)\s*["']?)[^\s,;"']+/gi, "$1" + REDACTION);
  text = text.replace(/\b(mnemonic|seed phrase)\s*(?:=|:|is)\s*["']?[^\n"']+/gi, "$1: " + REDACTION);
  return text;
}

function sanitizeValue(value, depth = 0) {
  if (depth > MAX_DEPTH) return "[truncated by Sonderr safety]";
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map(item => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (/(password|secret|token|api.?key|private.?key|mnemonic|seed)/i.test(key)) output[key] = REDACTION;
      else output[key] = sanitizeValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
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
    .replace(/&gt;/gi, ">");
  const markup = /<\s*\/?\s*(?:tool\s*_?\s*call\b|function\s*=|parameter\s*=|arguments\s*=)/i;
  const serializedCall = /"(?:tool_call|tool_calls|function_call)"\s*:/i;
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
  return /\b(?:add|connect|configure|install|set up|setup|enable)\b[\s\S]{0,90}\b(?:mcp|model context protocol)\b/.test(text)
    || /\b(?:mcp|model context protocol)\b[\s\S]{0,90}\b(?:add|connect|configure|install|set up|setup|enable)\b/.test(text);
}

function hasVerificationIntent(value) {
  const text = String(value || "").toLowerCase();
  return /\b(?:run|execute|perform|start)\b[\s\S]{0,70}\b(?:tests?|checks?|lint|typecheck|type-check|build)\b/.test(text)
    || /\b(?:test|lint|typecheck|type-check|build|verify)\b\s+(?:this|the|my|our|it|project|app|codebase|workspace)\b/.test(text)
    || /\b(?:verify|verification|quality check)\b[\s\S]{0,70}\b(?:project|app|codebase|workspace)\b/.test(text);
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
  hasPseudoToolMarkup,
  sanitizeAssistantOutput,
  assessUserMessage,
  hasMcpConfigurationIntent,
  hasVerificationIntent,
  hasWalletIntent,
  terminalPolicy,
  toolPolicy,
  isTrustedLocalRequest,
  hasTrustedOrigin,
  hasTrustedBrowserOrigin
};
