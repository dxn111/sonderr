const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const safety = require("./safety");
const secrets = require("./secrets");
const webResearch = require("./web");
const APP_VERSION = require("../package.json").version;
const MAX_MCP_RESPONSE_BYTES = 2_000_000;
const MAX_MCP_FRAME_BYTES = 2_000_000;
const RESERVED_MCP_ENV = new Set([
  "PATH", "HOME", "LANG", "IFS", "ENV", "BASH_ENV", "SHELLOPTS",
  "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS", "NODE_PATH", "PYTHONHOME", "PYTHONPATH"
]);

const CONFIG_DIR = path.join(process.cwd(), ".sonderr");
const CONFIG_FILE = path.join(CONFIG_DIR, "mcp.json");
const runtimes = new Map();

function ensureConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const directoryInfo = fs.lstatSync(CONFIG_DIR);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("Sonderr's MCP config directory must be a real directory, not a symlink.");
  try { fs.chmodSync(CONFIG_DIR, 0o700); } catch {}
  let configInfo;
  try { configInfo = fs.lstatSync(CONFIG_FILE); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(CONFIG_FILE, flags, 0o600);
    try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify({ version: 1, servers: [] }, null, 2)); }
    finally { fs.closeSync(fd); }
    configInfo = fs.lstatSync(CONFIG_FILE);
  }
  if (!configInfo.isFile() || configInfo.isSymbolicLink()) throw new Error("Sonderr's MCP config must be a regular file, not a symlink.");
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
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
  const temp = CONFIG_FILE + ".tmp-" + crypto.randomUUID();
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(temp, flags, 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify(data, null, 2)); }
  catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, CONFIG_FILE); }
  catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
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
    url: safety.redactText(server.url || ""),
    command: safety.redactText(server.command || ""),
    args: (server.args || []).map(arg => safety.redactText(arg)),
    tokenConfigured: Boolean(server.tokenEnv && process.env[server.tokenEnv]),
    connected,
    serverInfo: runtime?.serverInfo || null,
    capabilities: runtime?.capabilities || {},
    tools: runtime?.tools || [],
    resources: runtime?.resources || [],
    prompts: runtime?.prompts || [],
    error: safety.redactText(runtime?.error || "")
  };
}

function listServers() { return readConfig().servers.map(publicServer); }

function addServer(input) {
  const name = String(input?.name || "").trim().slice(0, 80);
  const command = String(input?.command || "").trim();
  const url = String(input?.url || "").trim();
  const id = safeId(input?.id || name);
  if (!id || !name || (!command && !url)) throw new Error("MCP server name and command or URL are required");
  if (command.length > 512 || command.includes("\0") || /[\r\n]/.test(command)) throw new Error("MCP command must be a short, single-line executable path");
  if (url.length > 2048) throw new Error("MCP URL is too long");
  if (url) {
    let parsed; try { parsed = new URL(url); } catch { throw new Error("MCP URL is invalid"); }
    if (!["https:", "http:"].includes(parsed.protocol) || (parsed.protocol === "http:" && !["127.0.0.1", "localhost"].includes(parsed.hostname))) throw new Error("Remote MCP URLs must use HTTPS");
    if (parsed.username || parsed.password || parsed.hash) throw new Error("MCP URLs cannot contain embedded credentials or fragments");
    if ([...parsed.searchParams.keys()].some(key => /(?:api.?key|access.?token|refresh.?token|auth|secret|password|signature|(?:^|_)(?:token|key)$)/i.test(key))) throw new Error("MCP URLs cannot carry credentials in query parameters; use the credential setting instead");
  }
  const args = Array.isArray(input?.args) ? input.args.map(value => String(value)).slice(0, 32) : [];
  if (args.some(arg => arg.length > 4096 || arg.includes("\0"))) throw new Error("MCP arguments must be under 4 KB each and cannot contain null bytes");
  const commandLine = [command, ...args].join(" ");
  if (/(?:^|\s)--?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth(?:orization)?|bearer|secret|password)(?:\s+|=)(?:bearer\s+)?[^\s]+/i.test(commandLine)
    || safety.redactText(commandLine) !== commandLine) {
    throw new Error("Do not put credentials in an MCP command or argument; store the value in Sonderr's local secret store and reference its environment-variable name.");
  }
  const tokenEnv = String(input?.tokenEnv || "").trim();
  if (tokenEnv && (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv) || RESERVED_MCP_ENV.has(tokenEnv))) throw new Error("Token environment variable is invalid or reserved by Sonderr");
  const env = input?.env && typeof input.env === "object" && !Array.isArray(input.env)
    ? Object.fromEntries(Object.entries(input.env).filter(([key, value]) => /^[A-Z_][A-Z0-9_]*$/.test(key) && !RESERVED_MCP_ENV.has(key) && typeof value === "string" && value.length <= 4096).slice(0, 32))
    : {};
  if (Object.entries(env).some(([key, value]) => safety.isSecretField(key) || /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY)(?:_|$)/i.test(key) || safety.redactText(value) !== value)) {
    throw new Error("Do not save credential values in MCP environment settings; use token_env to reference a value from Sonderr's local secret store.");
  }
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
      if (marker < 0) {
        if (buffer.length > 16_384) {
          runtime.error = "MCP server sent an invalid or oversized protocol header.";
          buffer = Buffer.alloc(0);
          runtime.child.kill();
        }
        return;
      }
      const header = buffer.subarray(0, marker).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) { buffer = buffer.subarray(marker + 4); continue; }
      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MCP_FRAME_BYTES) {
        runtime.error = "MCP server response exceeded Sonderr's protocol frame limit.";
        buffer = Buffer.alloc(0);
        runtime.child.kill();
        return;
      }
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

function mcpHttpHeaders(runtime, method) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2024-11-05", "Mcp-Method": method, "Mcp-Name": "Sonderr" };
  if (runtime.sessionId) headers["Mcp-Session-Id"] = runtime.sessionId;
  const token = runtime.server.tokenEnv ? secrets.get(runtime.server.tokenEnv) : "";
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

async function sendHttp(runtime, method, payload, timeoutMs = 20000, maxBytes = MAX_MCP_RESPONSE_BYTES) {
  const rawBody = JSON.stringify(payload);
  const url = new URL(runtime.server.url);
  if (url.protocol === "https:") {
    // Validate every DNS answer, then pin the socket to that validated address.
    // Redirects are deliberately handled as errors so credentials cannot be
    // forwarded to a different host.
    const target = await webResearch.resolvePublicHttps(url.toString(), { allowNonStandardPort: true });
    const response = await webResearch.requestPinnedHttps(target, maxBytes, {
      timeoutMs,
      method: "POST",
      headers: mcpHttpHeaders(runtime, method),
      body: rawBody
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("MCP server redirects are blocked for security.");
    const sessionId = response.headers?.["mcp-session-id"];
    if (sessionId) runtime.sessionId = String(sessionId);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, raw: response.text };
  }
  // Revalidate persisted configuration at use time too: config files can be
  // edited outside addServer, so plain HTTP is strictly loopback-only here.
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname.toLowerCase())
    || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some(key => /(?:api.?key|access.?token|refresh.?token|auth|secret|password|signature|(?:^|_)(?:token|key)$)/i.test(key))) {
    throw new Error("Plain HTTP MCP connections are limited to credential-free localhost URLs.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", headers: mcpHttpHeaders(runtime, method), body: rawBody, signal: controller.signal, redirect: "error" });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) runtime.sessionId = sessionId;
    const announced = Number(response.headers.get("content-length"));
    if (Number.isFinite(announced) && announced > maxBytes) {
      await response.body?.cancel();
      throw new Error("MCP response exceeded Sonderr's size limit.");
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error("MCP response exceeded Sonderr's size limit.");
          }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock?.(); }
    }
    return { ok: response.ok, status: response.status, raw: Buffer.concat(chunks, size).toString("utf8") };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("MCP request timed out");
    throw error;
  } finally { clearTimeout(timer); }
}

async function requestHttp(runtime, method, params, timeoutMs = 20000) {
  const id = runtime.nextId++;
  const response = await sendHttp(runtime, method, { jsonrpc: "2.0", id, method, params }, timeoutMs);
  if (!response.ok) throw new Error("MCP server returned HTTP " + response.status + ". Check the server connection and authentication settings.");
  let payload;
  try { payload = JSON.parse(response.raw); } catch {
    const event = response.raw.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean).pop();
    payload = event ? JSON.parse(event) : null;
  }
  if (!payload) throw new Error("MCP server returned an unreadable response");
  if (payload.error) throw new Error(payload.error.message || "MCP request failed");
  return safety.sanitizeValue(payload.result);
}

async function notifyHttp(runtime, method, params) {
  const response = await sendHttp(runtime, method, { jsonrpc: "2.0", method, params }, 12000, 64_000);
  if (!response.ok) throw new Error("MCP server returned HTTP " + response.status + " while acknowledging initialization.");
}

async function connectServer(id) {
  const server = findServer(id);
  const existing = runtimes.get(server.id);
  if (existing && (existing.transport === "http" || !existing.child.killed)) return publicServer(server);
  if (server.transport === "http" || server.url) {
    const runtime = { transport: "http", server, nextId: 1, pending: new Map(), tools: [], error: "" };
    runtimes.set(server.id, runtime);
    try {
      const initialized = await request(runtime, "initialize", { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: false }, sampling: {} }, clientInfo: { name: "Sonderr", version: APP_VERSION } });
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
  const serverEnv = server.env && typeof server.env === "object" && !Array.isArray(server.env)
    ? Object.fromEntries(Object.entries(server.env).filter(([key, value]) => /^[A-Z_][A-Z0-9_]*$/.test(key) && !RESERVED_MCP_ENV.has(key) && typeof value === "string" && value.length <= 4096 && !safety.isSecretField(key) && safety.redactText(value) === value).slice(0, 32))
    : {};
  const safeEnv = { ...serverEnv, PATH: process.env.PATH || "", HOME: isolatedHome, LANG: process.env.LANG || "" };
  if (server.tokenEnv) {
    const tokenValue = secrets.get(server.tokenEnv);
    if (tokenValue && /^[A-Z_][A-Z0-9_]*$/.test(server.tokenEnv) && !RESERVED_MCP_ENV.has(server.tokenEnv)) safeEnv[server.tokenEnv] = tokenValue;
  }
  const child = spawn(server.command, server.args || [], { cwd: process.cwd(), env: safeEnv, stdio: ["pipe", "pipe", "pipe"] });
  const runtime = { child, nextId: 1, pending: new Map(), tools: [], error: "" };
  runtimes.set(server.id, runtime);
  attachParser(runtime);
  child.stderr.on("data", chunk => { runtime.error = safety.redactText(String(chunk).trim()).slice(-1000); });
  child.once("error", error => { runtime.error = safety.redactText(error.message); });
  child.once("exit", () => { for (const pending of runtime.pending.values()) pending.reject(new Error("MCP server exited")); runtime.pending.clear(); });
  try {
    const initialized = await request(runtime, "initialize", { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: false }, sampling: {} }, clientInfo: { name: "Sonderr", version: APP_VERSION } });
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
