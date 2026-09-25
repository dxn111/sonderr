const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const safety = require("./safety");

const CONFIG_DIR = path.join(process.cwd(), ".sonderr");
const CONFIG_FILE = path.join(CONFIG_DIR, "mcp.json");
const runtimes = new Map();

function ensureConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ version: 1, servers: [] }, null, 2));
}

function readConfig() {
  ensureConfig();
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return { version: 1, servers: Array.isArray(data.servers) ? data.servers : [] };
  } catch { return { version: 1, servers: [] }; }
}

function writeConfig(data) {
  ensureConfig();
  const temp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, CONFIG_FILE);
  return data;
}

function safeId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function publicServer(server) {
  const runtime = runtimes.get(server.id);
  const connected = Boolean(runtime && (runtime.transport === "http" || !runtime.child.killed));
  return {
    id: server.id,
    name: server.name,
    transport: server.transport || (server.url ? "http" : "stdio"),
    url: server.url || "",
    command: server.command,
    args: server.args || [],
    tokenConfigured: Boolean(server.tokenEnv && process.env[server.tokenEnv]),
    connected,
    serverInfo: runtime?.serverInfo || null,
    capabilities: runtime?.capabilities || {},
    tools: runtime?.tools || [],
    resources: runtime?.resources || [],
    prompts: runtime?.prompts || [],
    error: runtime?.error || ""
  };
}

function listServers() { return readConfig().servers.map(publicServer); }

function addServer(input) {
  const name = String(input?.name || "").trim().slice(0, 80);
  const command = String(input?.command || "").trim();
  const url = String(input?.url || "").trim();
  const id = safeId(input?.id || name);
  if (!id || !name || (!command && !url)) throw new Error("MCP server name and command or URL are required");
  if (/[\r\n]/.test(command)) throw new Error("MCP command must be a single line");
  if (url) {
    let parsed; try { parsed = new URL(url); } catch { throw new Error("MCP URL is invalid"); }
    if (!["https:", "http:"].includes(parsed.protocol) || (parsed.protocol === "http:" && !["127.0.0.1", "localhost"].includes(parsed.hostname))) throw new Error("Remote MCP URLs must use HTTPS");
    if (parsed.username || parsed.password || parsed.hash) throw new Error("MCP URLs cannot contain embedded credentials or fragments");
  }
  const args = Array.isArray(input?.args) ? input.args.map(String).slice(0, 32) : [];
  const tokenEnv = String(input?.tokenEnv || "").trim();
  if (tokenEnv && !/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw new Error("Token environment variable is invalid");
  const env = input?.env && typeof input.env === "object" && !Array.isArray(input.env)
    ? Object.fromEntries(Object.entries(input.env).filter(([key, value]) => /^[A-Z_][A-Z0-9_]*$/.test(key) && typeof value === "string").slice(0, 32))
    : {};
  const data = readConfig();
  const next = { id, name, command, url, transport: url ? "http" : "stdio", tokenEnv, args, env };
  const index = data.servers.findIndex(server => server.id === id);
  if (index >= 0) data.servers[index] = next; else data.servers.push(next);
  writeConfig(data);
  return publicServer(next);
}

async function removeServer(id) {
  await disconnectServer(id);
  const data = readConfig();
  data.servers = data.servers.filter(server => server.id !== id);
  writeConfig(data);
  return { removed: id };
}

function findServer(id) {
  const server = readConfig().servers.find(item => item.id === String(id));
  if (!server) throw new Error("MCP server is not configured: " + id);
  return server;
}

function writeMessage(runtime, message) {
  const payload = Buffer.from(JSON.stringify(message));
  runtime.child.stdin.write("Content-Length: " + payload.length + "\r\n\r\n");
  runtime.child.stdin.write(payload);
}

function attachParser(runtime) {
  let buffer = Buffer.alloc(0);
  runtime.child.stdout.on("data", chunk => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (true) {
      const marker = buffer.indexOf(Buffer.from("\r\n\r\n"));
      if (marker < 0) return;
      const header = buffer.subarray(0, marker).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) { buffer = buffer.subarray(marker + 4); continue; }
      const length = Number(match[1]);
      const start = marker + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      try {
        const message = JSON.parse(body);
        if (message.id !== undefined && runtime.pending.has(message.id)) {
          const pending = runtime.pending.get(message.id);
          runtime.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || "MCP request failed"));
          else pending.resolve(message.result);
        }
      } catch {}
    }
  });
}

function request(runtime, method, params, timeoutMs = 12000) {
  if (runtime.transport === "http") return requestHttp(runtime, method, params, timeoutMs);
  const id = runtime.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { runtime.pending.delete(id); reject(new Error("MCP request timed out")); }, timeoutMs);
    runtime.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    try { writeMessage(runtime, { jsonrpc: "2.0", id, method, params }); }
    catch (error) { clearTimeout(timer); runtime.pending.delete(id); reject(error); }
  });
}

async function requestHttp(runtime, method, params, timeoutMs = 20000) {
  const id = runtime.nextId++;
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2024-11-05", "Mcp-Method": method, "Mcp-Name": "Sonderr" };
  if (runtime.sessionId) headers["Mcp-Session-Id"] = runtime.sessionId;
  const token = runtime.server.tokenEnv ? process.env[runtime.server.tokenEnv] : "";
  if (token) headers.Authorization = "Bearer " + token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(runtime.server.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: controller.signal, redirect: "error" });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) runtime.sessionId = sessionId;
    const raw = await response.text();
    if (!response.ok) throw new Error("MCP server returned HTTP " + response.status + (raw ? ": " + raw.slice(0, 240) : ""));
    let payload;
    try { payload = JSON.parse(raw); } catch {
      const event = raw.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean).pop();
      payload = event ? JSON.parse(event) : null;
    }
    if (!payload) throw new Error("MCP server returned an unreadable response");
    if (payload.error) throw new Error(payload.error.message || "MCP request failed");
    return safety.sanitizeValue(payload.result);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("MCP request timed out");
    throw error;
  } finally { clearTimeout(timer); }
}

async function notifyHttp(runtime, method, params) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2024-11-05", "Mcp-Method": method, "Mcp-Name": "Sonderr" };
  if (runtime.sessionId) headers["Mcp-Session-Id"] = runtime.sessionId;
  const token = runtime.server.tokenEnv ? process.env[runtime.server.tokenEnv] : "";
  if (token) headers.Authorization = "Bearer " + token;
  await fetch(runtime.server.url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method, params }), redirect: "error" });
}

async function connectServer(id) {
  const server = findServer(id);
  const existing = runtimes.get(server.id);
  if (existing && (existing.transport === "http" || !existing.child.killed)) return publicServer(server);
  if (server.transport === "http" || server.url) {
    const runtime = { transport: "http", server, nextId: 1, pending: new Map(), tools: [], error: "" };
    runtimes.set(server.id, runtime);
    try {
      const initialized = await request(runtime, "initialize", { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: false }, sampling: {} }, clientInfo: { name: "Sonderr", version: "1.5.5" } });
      runtime.serverInfo = initialized?.serverInfo || null;
      runtime.capabilities = initialized?.capabilities || {};
      await notifyHttp(runtime, "notifications/initialized", {});
      const result = await request(runtime, "tools/list", {});
      runtime.tools = Array.isArray(result?.tools) ? result.tools.slice(0, 100).map(tool => ({ name: tool.name, description: tool.description || "", inputSchema: tool.inputSchema || { type: "object" } })) : [];
      if (runtime.capabilities.resources) runtime.resources = await listResourcesRuntime(runtime);
      if (runtime.capabilities.prompts) runtime.prompts = await listPromptsRuntime(runtime);
      return publicServer(server);
    } catch (error) {
      runtime.error = error.message;
      runtimes.delete(server.id);
      throw error;
    }
  }
  const isolatedHome = path.join(CONFIG_DIR, "mcp-runtime", server.id);
  fs.mkdirSync(isolatedHome, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(isolatedHome, 0o700); } catch {}
  const safeEnv = { PATH: process.env.PATH || "", HOME: isolatedHome, LANG: process.env.LANG || "", ...server.env };
  const child = spawn(server.command, server.args || [], { cwd: process.cwd(), env: safeEnv, stdio: ["pipe", "pipe", "pipe"] });
  const runtime = { child, nextId: 1, pending: new Map(), tools: [], error: "" };
  runtimes.set(server.id, runtime);
  attachParser(runtime);
  child.stderr.on("data", chunk => { runtime.error = String(chunk).trim().slice(-1000); });
  child.once("error", error => { runtime.error = error.message; });
  child.once("exit", () => { for (const pending of runtime.pending.values()) pending.reject(new Error("MCP server exited")); runtime.pending.clear(); });
  try {
    const initialized = await request(runtime, "initialize", { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: false }, sampling: {} }, clientInfo: { name: "Sonderr", version: "1.5.5" } });
    runtime.serverInfo = initialized?.serverInfo || null;
    runtime.capabilities = initialized?.capabilities || {};
    writeMessage(runtime, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const result = await request(runtime, "tools/list", {});
    runtime.tools = Array.isArray(result?.tools) ? result.tools.slice(0, 100).map(tool => ({ name: tool.name, description: tool.description || "", inputSchema: tool.inputSchema || { type: "object" } })) : [];
    if (runtime.capabilities.resources) runtime.resources = await listResourcesRuntime(runtime);
    if (runtime.capabilities.prompts) runtime.prompts = await listPromptsRuntime(runtime);
    return publicServer(server);
  } catch (error) {
    runtime.error = error.message;
    await disconnectServer(server.id);
    throw error;
  }
}

async function disconnectServer(id) {
  const runtime = runtimes.get(String(id));
  if (!runtime) return { disconnected: String(id) };
  runtimes.delete(String(id));
  for (const pending of runtime.pending.values()) pending.reject(new Error("MCP server disconnected"));
  runtime.pending.clear();
  try { if (runtime.child) runtime.child.kill(); } catch {}
  return { disconnected: String(id) };
}

async function listTools(id) {
  const server = await connectServer(id);
  return { server: server.id, tools: server.tools || [] };
}

async function listResourcesRuntime(runtime) {
  const result = await request(runtime, "resources/list", {});
  return Array.isArray(result?.resources) ? result.resources.slice(0, 200).map(resource => ({
    uri: String(resource.uri || ""), name: String(resource.name || resource.uri || ""), description: resource.description || "", mimeType: resource.mimeType || ""
  })) : [];
}

async function listPromptsRuntime(runtime) {
  const result = await request(runtime, "prompts/list", {});
  return Array.isArray(result?.prompts) ? result.prompts.slice(0, 100).map(prompt => ({
    name: String(prompt.name || ""), description: prompt.description || "", arguments: Array.isArray(prompt.arguments) ? prompt.arguments : []
  })) : [];
}

async function listResources(id) {
  const server = await connectServer(id);
  const runtime = runtimes.get(server.id);
  if (!runtime) throw new Error("MCP server is not connected");
  return { server: server.id, resources: await listResourcesRuntime(runtime) };
}

async function listPrompts(id) {
  const server = await connectServer(id);
  const runtime = runtimes.get(server.id);
  if (!runtime) throw new Error("MCP server is not connected");
  return { server: server.id, prompts: await listPromptsRuntime(runtime) };
}

async function readResource(id, uri) {
  const server = await connectServer(id);
  const runtime = runtimes.get(server.id);
  if (!runtime) throw new Error("MCP server is not connected");
  if (!String(uri || "")) throw new Error("uri is required");
  return request(runtime, "resources/read", { uri: String(uri) });
}

async function getPrompt(id, name, args = {}) {
  const server = await connectServer(id);
  const runtime = runtimes.get(server.id);
  if (!runtime) throw new Error("MCP server is not connected");
  if (!String(name || "")) throw new Error("name is required");
  return request(runtime, "prompts/get", { name: String(name), arguments: args && typeof args === "object" ? args : {} });
}

async function callTool(id, name, argumentsValue = {}) {
  const server = findServer(id);
  const runtime = runtimes.get(server.id) || (await connectServer(server.id), runtimes.get(server.id));
  if (!runtime) throw new Error("MCP server is not connected");
  const known = runtime.tools.find(tool => tool.name === String(name));
  if (!known) throw new Error("MCP tool is not available: " + name);
  const args = argumentsValue && typeof argumentsValue === "object" ? argumentsValue : {};
  if (JSON.stringify(args).length > 250_000) throw new Error("MCP tool arguments exceed the 250 KB safety limit");
  return safety.sanitizeValue(await request(runtime, "tools/call", { name: known.name, arguments: args }));
}

module.exports = { CONFIG_FILE, listServers, addServer, removeServer, connectServer, disconnectServer, listTools, listResources, listPrompts, readResource, getPrompt, callTool };
