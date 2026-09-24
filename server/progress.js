"use strict";

const crypto = require("node:crypto");

const OBSERVATION_TOOLS = new Set([
  "list_workspace_files", "read_workspace_file", "read_workspace_range", "search_workspace",
  "get_workspace_file_info", "analyze_workspace", "git_diff",
  "list_mcp_servers", "list_mcp_tools", "list_mcp_resources", "list_mcp_prompts",
  "read_mcp_resource", "get_mcp_prompt",
  "get_wallet_accounts", "get_wallet_status", "get_wallet_price", "get_wallet_portfolio",
  "get_wallet_token_info", "get_wallet_activity"
]);
const VERIFICATION_TOOLS = new Set(["run_project_checks", "run_terminal_command"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter(key => !["durationMs", "elapsedMs", "modifiedAt", "timestamp", "updatedAt"].includes(key))
    .map(key => [key, stable(value[key])]));
}

function isDurableAction(event) {
  const output = event.output || {};
  if (event.failed || output.error || output.approvalRequired) return false;
  if (["write_workspace_file", "patch_workspace_file"].includes(event.name)) return output.changed === true;
  if (event.name === "edit_image") return Boolean(output.path || output.name);
  return false;
}

function isVerification(event) {
  const output = event.output || {};
  if (event.failed || output.error || output.approvalRequired) return false;
  if (event.name === "run_project_checks") return (output.results || []).some(result => !result.skipped && typeof result.ok === "boolean");
  return event.name === "run_terminal_command" && /\b(?:test|tests|check|lint|typecheck|type-check|build|verify|verification)\b/i.test(String(event.input?.command || "")) && Number.isInteger(output.exitCode);
}

function evidenceKey(event) {
  const material = JSON.stringify(stable({ name: event.name, input: event.input, output: event.output }));
  return crypto.createHash("sha256").update(material).digest("hex");
}

function recordProgress(events, seenEvidence = new Set()) {
  let progressed = false;
  for (const event of Array.isArray(events) ? events : []) {
    if (event.type !== "tool_end" || event.failed) continue;
    if (isDurableAction(event)) {
      progressed = true;
      continue;
    }
    if ((!OBSERVATION_TOOLS.has(event.name) && !isVerification(event)) || event.output?.error) continue;
    const key = evidenceKey(event);
    if (seenEvidence.has(key)) continue;
    seenEvidence.add(key);
    progressed = true;
  }
  return progressed;
}

module.exports = { recordProgress, evidenceKey, isDurableAction, isVerification, OBSERVATION_TOOLS, VERIFICATION_TOOLS };
