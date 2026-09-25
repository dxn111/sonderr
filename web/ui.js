/* Sonderr 1.5 — web workspace logic (Claude × harness) */
"use strict";

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rel = (iso) => {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const days = Math.floor(h / 24); if (days < 7) return days + "d ago";
  return new Date(iso).toLocaleDateString();
};
const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : n > 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";
async function api(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed (" + r.status + ")");
  return data;
}
let toastTimer = null;
let walletWatchPollTimer = null;
const seenWalletWatchEvents = new Set();
const dismissedResumePrompts = new Set();
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- state ---------- */
const state = {
  settings: null, providers: {}, models: [], modelsLoading: false, modelsError: "",
  sessions: [], session: null, mode: "ask", contextFiles: [], files: [], images: [], lastGeneralModel: "",
  sending: false, apiConfigured: false, workspace: "", nodeVersion: "", onboarding: null
};

/* ---------- markdown (safe, offline) ---------- */
function renderMarkdown(src) {
  const blocks = [];
  let text = esc(String(src ?? ""));
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.push({ lang: lang || "code", code: code.replace(/\n$/, "") }) - 1;
    return "\u0000B" + i + "\u0000";
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>").replace(/^##\s+(.+)$/gm, "<h2>$1</h2>").replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  text = text.replace(/^\s*(?:---|\*\*\*)\s*$/gm, "<hr>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = text.split("\n"); let html = "", list = null, para = [];
  const flushPara = () => { if (para.length) { html += "<p>" + para.join("<br>") + "</p>"; para = []; } };
  const closeList = () => { if (list) { html += "</" + list + ">"; list = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (/^<h[123]>/.test(t) || t === "<hr>" || t.startsWith("\u0000B")) { flushPara(); closeList(); html += t; continue; }
    let m;
    if ((m = t.match(/^[-*]\s+(.+)/))) { flushPara(); if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += "<li>" + m[1] + "</li>"; continue; }
    if ((m = t.match(/^\d+[.)]\s+(.+)/))) { flushPara(); if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += "<li>" + m[1] + "</li>"; continue; }
    if ((m = t.match(/^&gt;\s?(.*)/))) { flushPara(); closeList(); html += "<blockquote><p>" + m[1] + "</p></blockquote>"; continue; }
    if (!t) { flushPara(); closeList(); continue; }
    closeList(); para.push(t);
  }
  flushPara(); closeList();
  html = html.replace(/\u0000B(\d+)\u0000/g, (_, i) => {
    const b = blocks[Number(i)];
    return '<div class="codeblock"><div class="codeblock-head"><span>' + esc(b.lang) + '</span><button class="copy" data-code="' + esc(b.code) + '">Copy</button></div><pre><code>' + b.code + "</code></pre></div>";
  });
  return html;
}

/* ---------- greeting ---------- */
function renderGreeting(name = "") {
  const h = new Date().getHours();
  const word = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  $("greeting").innerHTML = esc(word) + ", <em>" + esc(name || "engineer") + "</em>";
}

/* ---------- runtime / boot ---------- */
async function boot() {
  renderGreeting();
  loadSessions();
  try {
    const [health, workspace, settings, onboarding] = await Promise.all([
      fetch("/api/health").then(r => r.json()),
      fetch("/api/workspace").then(r => r.json()).catch(() => null),
      api("/api/settings"),
      api("/api/onboarding")
    ]);
    state.apiConfigured = Boolean(health.provider === "configured" || settings.apiConfigured);
    state.settings = settings; state.providers = settings.providers || {};
    state.onboarding = onboarding.onboarding || { completed: false };
    renderGreeting(state.onboarding.name || "");
    fetch("/api/skills").then(r => r.json()).then(d => { state.skillsCount = (d.skills || []).length; }).catch(() => {});
    const rs = $("runtimeStatus");
    rs.className = "runtime ok"; rs.querySelector(".runtime-label").textContent = "Local runtime · online";
    if (workspace) {
      state.workspace = workspace.path || "";
      state.nodeVersion = workspace.node || "";
      const chip = $("workspaceChip");
      chip.textContent = workspace.path; chip.hidden = false; chip.title = workspace.path;
    }
    renderModelBtn();
    if (state.apiConfigured) loadModels(true);
    loadFiles();
    if (!state.onboarding.completed) openOnboarding();
  } catch {
    const rs = $("runtimeStatus");
    rs.className = "runtime bad"; rs.querySelector(".runtime-label").textContent = "Runtime unreachable";
  }
}

function openOnboarding() {
  const modal = $("onboardingModal");
  if (!modal) return;
  modal.hidden = false;
  const emailOpt = $("onboardingEmailOpt");
  const emailWrap = $("onboardingEmailWrap");
  const autoEmailWrap = $("onboardingAutoEmailWrap");
  const emailHint = $("onboardingEmailHint");
  const gmailButton = $("onboardingGmailBtn");
  const refreshEmailHint = async () => {
    if (!emailOpt.checked) { emailHint.hidden = true; gmailButton.hidden = true; return; }
    emailHint.hidden = false; emailHint.textContent = "Checking Gmail connection…";
    try {
      const data = await api("/api/gmail/status");
      if (data.gmail?.connected) { emailHint.textContent = "Gmail connected" + (data.gmail.account ? " · " + data.gmail.account : "") + ". Automatic welcome is ready."; emailHint.className = "onboarding-note ok"; gmailButton.hidden = true; }
      else if (data.gmail?.configured) { emailHint.textContent = "Gmail OAuth is ready but not connected. Connect it in Settings for automatic sending."; emailHint.className = "onboarding-note"; gmailButton.hidden = false; }
      else { emailHint.textContent = "Connect Gmail in Settings for automatic sending, or configure SMTP later."; emailHint.className = "onboarding-note"; gmailButton.hidden = false; }
    } catch { emailHint.textContent = "Email connection status is unavailable. You can continue and configure it later."; gmailButton.hidden = false; }
  };
  emailOpt.onchange = () => { emailWrap.hidden = !emailOpt.checked; autoEmailWrap.hidden = !emailOpt.checked; $("onboardingEmail").required = emailOpt.checked; if (!emailOpt.checked) $("onboardingAutoEmail").checked = false; refreshEmailHint(); };
  gmailButton.onclick = () => openSettings("email");
  if (!window.__sonderrGmailListener) { window.__sonderrGmailListener = true; window.addEventListener("message", event => { if (event.origin === window.location.origin && event.data?.type === "sonderr-gmail-connected") refreshEmailHint(); }); }
  $("onboardingForm").onsubmit = async (event) => {
    event.preventDefault();
    const status = $("onboardingStatus");
    const submit = document.querySelector(".onboarding-submit");
    submit.disabled = true; status.textContent = "Saving your preferences…"; status.className = "statusline";
    try {
      const data = await api("/api/onboarding", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
        name: $("onboardingName").value.trim(), wantsWallet: $("onboardingWallet").checked,
        wantsEmail: emailOpt.checked, email: $("onboardingEmail").value.trim(), autoWelcomeEmail: $("onboardingAutoEmail").checked
      }) });
      state.onboarding = data.onboarding || { completed:true };
      renderGreeting(state.onboarding.name || "");
      status.textContent = "Welcome, " + (state.onboarding.name || "friend") + " — your local profile is ready."; status.className = "statusline ok";
      if (data.welcomeSent) {
        modal.hidden = true;
        toast("One welcome email was sent to " + state.onboarding.email);
      } else if (data.welcomeDraft) {
        $("onboardingWelcome").innerHTML = '<p class="onboarding-lead" style="margin-top:18px"><strong>Your welcome email is ready.</strong> Review the sender and recipient, then choose Send email.</p>';
        $("onboardingWelcome").appendChild(renderEmailConfirmation(data.welcomeDraft));
        submit.hidden = true; $("onboardingForm").querySelectorAll("input,.onboarding-check,.onboarding-note").forEach(el => { el.disabled = true; });
      } else {
        modal.hidden = true;
        if (data.nextSettings) openSettings(data.nextSettings);
        if (data.emailSetupRequired) toast("Welcome email saved as a preference — connect Gmail or configure SMTP to send it");
        if (data.welcomeSendError) toast("Welcome email was not sent: " + data.welcomeSendError);
        else if (data.walletCreated) toast("Local Base wallet created — back it up in Settings → Wallet before funding");
        else if (data.onboarding?.wantsWallet) toast("Wallet preference saved — open Settings → Wallet to manage the local wallet");
      }
    } catch (error) {
      status.textContent = error.message; status.className = "statusline bad"; submit.disabled = false;
    }
  };
}

/* ---------- models (automated discovery) ---------- */
function renderModelBtn() {
  const label = $("modelBtnLabel");
  if (state.modelsLoading) { label.textContent = "Discovering…"; return; }
  if (!state.apiConfigured) { label.textContent = "Add API key"; return; }
  const active = state.settings?.model;
  const found = active && state.models.find(m => m.id === active);
  label.textContent = found ? found.label : (active || (state.models[0]?.id ? state.models[0].label : "Model"));
}
async function loadModels(silent) {
  if (!state.apiConfigured) return;
  state.modelsLoading = true; state.modelsError = ""; renderModelBtn(); renderModelMenu();
  try {
    const data = await api("/api/models");
    state.models = data.models || [];
    state.apiConfigured = true;
    if (data.active && state.settings) state.settings.model = data.active;
    if (!state.settings?.model && state.models.length) await chooseModel(state.models[0].id, true);
  } catch (e) {
    state.models = []; state.modelsError = e.message;
    if (!silent) toast(e.message);
  } finally {
    state.modelsLoading = false; renderModelBtn(); renderModelMenu();
  }
}
async function chooseModel(id, silent) {
  try {
    await saveSettings({ model: id }, silent);
    if (!silent) toast("Model set to " + id);
  } catch (e) { if (!silent) toast(e.message); }
  renderModelBtn(); renderModelMenu(); renderSettingsModels?.();
}
function renderModelMenu() {
  const list = $("modelMenuList"), foot = $("modelMenuFoot");
  if (state.modelsLoading) {
    list.innerHTML = '<div class="model-empty">Discovering models from your provider…</div>';
    foot.textContent = "Fetching /models"; return;
  }
  if (!state.apiConfigured) {
    list.innerHTML = '<div class="model-empty"><strong>No provider yet.</strong><br>Add your API key in Settings — Sonderr discovers the available models automatically and sorts them for you.</div>';
    foot.textContent = "Open Settings to connect"; return;
  }
  if (state.modelsError) {
    list.innerHTML = '<div class="model-empty"><strong>Could not load models.</strong><br>' + esc(state.modelsError) + "</div>";
    foot.textContent = "Try the refresh button"; return;
  }
  const active = state.settings?.model;
  const year = new Date().getFullYear();
  const pool = state.mode === "vision" ? state.models.filter(m => m.vision) : state.models;
  list.innerHTML = pool.map(m => {
    const badges = [];
    if (m.snapshot && Number(m.snapshot.slice(0, 4)) >= year) badges.push('<span class="mi-badge new">new</span>');
    if (m.small) badges.push('<span class="mi-badge small">small</span>');
    if (state.mode !== "vision" && m.vision) badges.push('<span class="mi-badge vision">vision</span>');
    return '<button class="model-item' + (m.id === active ? " selected" : "") + '" role="option" aria-selected="' + (m.id === active) + '" data-id="' + esc(m.id) + '">' +
      '<span class="mi-copy"><span class="mi-label">' + esc(m.label) + "</span><span class='mi-sub'>" + esc(m.id) + (m.snapshot ? " · " + m.snapshot : "") + "</span></span>" +
      badges.join("") + (m.id === active ? '<svg class="mi-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : "") +
      "</button>";
  }).join("") || '<div class="model-empty">' + (state.mode === "vision"
    ? "No vision-capable models found on this endpoint. Vision mode needs a model with image input (GPT-4o / 4.1, Claude, Gemini, LLaVA…)."
    : "No models were returned by the provider.") + "</div>";
  foot.textContent = state.modelsLoading ? "Fetching /models"
    : state.mode === "vision"
      ? pool.length + " vision model" + (pool.length === 1 ? "" : "s") + " · image input required"
      : state.models.length + " model" + (state.models.length === 1 ? "" : "s") + " · best & newest first";
}

/* ---------- sessions ---------- */
async function loadSessions() {
  try {
    const data = await api("/api/sessions");
    state.sessions = data.sessions || [];
    const list = $("sessionList");
    list.innerHTML = state.sessions.length ? "" : '<div class="empty-side">Your recent tasks will appear here.</div>';
    for (const s of state.sessions) {
      const el = document.createElement("button");
      el.className = "session" + (state.session?.id === s.id ? " active" : "");
      const resumeHint = s.taskCheckpoint?.interruptedAt ? " · Stopped · Resume?"
        : s.taskCheckpoint?.status === "active" ? " · Running locally"
          : s.taskCheckpoint?.status === "paused" ? " · Resume ready" : "";
      el.innerHTML = "<strong>" + esc(s.title) + "</strong><small>" + esc(rel(s.updatedAt)) + " · " + s.messageCount + " msgs" + resumeHint + "</small>";
      el.onclick = () => { openSession(s.id); closeMobileNav(); };
      list.appendChild(el);
    }
    const interrupted = state.sessions.find(session => session.taskCheckpoint?.interruptedAt && !dismissedResumePrompts.has(session.id));
    if (interrupted && state.session?.id !== interrupted.id) showInterruptedTaskPrompt(interrupted);
  } catch { /* keep old list */ }
}
function showInterruptedTaskPrompt(session) {
  if (document.querySelector(".task-resume-prompt")) return;
  const overlay = document.createElement("div");
  overlay.className = "task-resume-prompt";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "taskResumeTitle");
  overlay.innerHTML = '<section class="task-resume-dialog"><span class="task-resume-eyebrow">TASK RECOVERY</span><h2 id="taskResumeTitle">Sonderr stopped during this task</h2><p><strong>' + esc(session.taskCheckpoint.goal || session.title) + '</strong></p><p>Your local workspace may contain partial progress. Sonderr will review the saved checkpoint and actual files before continuing.</p><div class="task-resume-actions"><button class="btn ghost task-resume-later">Not now</button><button class="btn primary task-resume-now">Resume task</button></div></section>';
  const dismiss = () => { dismissedResumePrompts.add(session.id); overlay.remove(); };
  overlay.querySelector(".task-resume-later").onclick = dismiss;
  overlay.querySelector(".task-resume-now").onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true; button.textContent = "Opening task…";
    dismissedResumePrompts.add(session.id); overlay.remove();
    if (!await openSession(session.id)) return;
    setMode("build");
    $("input").value = "Continue from checkpoint";
    await send();
  };
  overlay.addEventListener("click", event => { if (event.target === overlay) dismiss(); });
  document.body.appendChild(overlay);
}
async function openSession(id) {
  try {
    const data = await api("/api/sessions/" + id);
    state.session = data.session;
    $("welcome").hidden = true;
    const box = $("messages");
    box.hidden = false; box.innerHTML = "";
    for (const m of state.session.messages) {
      if (m.role === "user") addUserMessage(m.content, (m.images || []).map(p => ({ path: p, name: String(p).split("/").pop() })));
      else addAgentMessage(m.content, m.events || []);
    }
    const latestCheckpoint = state.session.taskCheckpoint;
    if (latestCheckpoint) {
      const represented = [...box.querySelectorAll(".task-checkpoint-card")].find(card => card.dataset.checkpointUpdatedAt === latestCheckpoint.updatedAt);
      if (represented) {
        const currentCard = renderTaskCheckpointCard(latestCheckpoint, { actionable: true });
        currentCard.dataset.sessionLatest = "true";
        represented.replaceWith(currentCard);
      }
      else {
        const card = renderTaskCheckpointCard(latestCheckpoint, { actionable: true });
        card.dataset.sessionLatest = "true";
        box.appendChild(card);
      }
    }
    $("topbarTitle").textContent = state.session.title;
    markActiveSession(); scrollBottom(true);
    return true;
  } catch { toast("Could not open this session"); return false; }
}
function markActiveSession() {
  document.querySelectorAll(".session").forEach(el => el.classList.remove("active"));
  const idx = state.sessions.findIndex(s => s.id === state.session?.id);
  if (idx >= 0) document.querySelectorAll(".session")[idx]?.classList.add("active");
}
function newTask() {
  state.session = null;
  $("messages").hidden = true; $("messages").innerHTML = "";
  $("welcome").hidden = false;
  $("topbarTitle").textContent = "New task";
  markActiveSession(); closeMobileNav();
  $("input").focus();
}

/* ---------- message rendering ---------- */
function addUserMessage(content, images) {
  const el = document.createElement("div");
  el.className = "msg-user";
  const imgs = (images || []).length
    ? '<span class="bubble-imgs">' + images.map(im => '<img src="/api/download?path=' + encodeURIComponent(im.path || im) + '&inline=1" alt="" loading="lazy">').join("") + "</span>"
    : "";
  el.innerHTML = '<div class="bubble">' + (content ? esc(content) : "") + imgs + "</div>";
  $("messages").appendChild(el); scrollBottom();
}
function addAgentMessage(content, events) {
  const el = document.createElement("div");
  el.className = "msg-agent";
  el.innerHTML = '<span class="avatar"><img src="/assets/sonderr-mark-64.png" alt=""></span><div class="body"></div>';
  const body = el.querySelector(".body");
  const todoEv = lastTodoEvent(events);
  if (todoEv) body.appendChild(renderTodoCard(todoEv.todos));
  const checkpointEv = lastTaskCheckpointEvent(events);
  if (checkpointEv) body.appendChild(renderTaskCheckpointCard(checkpointEv.checkpoint));
  if (events && events.length) body.appendChild(buildToolBlocks(events));
  const md = document.createElement("div");
  md.className = "md"; md.innerHTML = renderMarkdown(content);
  body.appendChild(md);
  $("messages").appendChild(el); scrollBottom();
  return md;
}
function addErrorCard(message) {
  const el = document.createElement("div");
  el.className = "msg-agent";
  el.innerHTML = '<span class="avatar"><img src="/assets/sonderr-mark-64.png" alt=""></span><div class="body"><div class="tool" style="border-color:#f3cfcf;background:#fff7f7"><div class="tool-head" style="cursor:default"><span class="tool-ico" style="color:var(--bad);border-color:#f3cfcf">!</span><span class="tool-name">Request failed</span><span class="tool-state err">✕</span></div><div class="tool-body" style="display:block"><div class="tool-section"><pre>' + esc(message) + "</pre></div></div></div></div>";
  $("messages").appendChild(el); scrollBottom();
}
let chatPinnedToBottom = true;
let chatFollowFrame = 0;
function scrollBottom(force = false) {
  const sc = $("chatScroll");
  if (!sc || (!force && !chatPinnedToBottom)) return;
  if (chatFollowFrame) cancelAnimationFrame(chatFollowFrame);
  chatFollowFrame = requestAnimationFrame(() => {
    chatFollowFrame = 0;
    sc.scrollTop = sc.scrollHeight;
    chatPinnedToBottom = true;
  });
}
$("chatScroll").addEventListener("scroll", () => {
  const sc = $("chatScroll");
  chatPinnedToBottom = sc.scrollHeight - sc.clientHeight - sc.scrollTop <= 120;
}, { passive: true });

/* ---------- tool blocks (Claude-style, collapsed, live) ---------- */
const TOOL_ICONS = {
  list_workspace_files: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  read_workspace_file: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  write_workspace_file: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  search_workspace: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  run_terminal_command: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-5-6-5"/><path d="M12 19h8"/></svg>',
  load_skill: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2 6.2 6.5.1-5.2 3.9 1.9 6.2L12 15.6 6.8 19.4l1.9-6.2L3.5 9.3 10 9.2z"/></svg>',
  todo_write: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.6 1.6L8.2 4"/><path d="M3.5 12.5l1.6 1.6L8.2 11"/><path d="M3.5 19.5l1.6 1.6L8.2 18"/><path d="M12 5.5h9"/><path d="M12 12.5h9"/><path d="M12 19.5h9"/></svg>',
  todo_read: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.6 1.6L8.2 4"/><path d="M3.5 12.5l1.6 1.6L8.2 11"/><path d="M12 5.5h9"/><path d="M12 12.5h9"/><circle cx="13" cy="19" r="3.5"/></svg>',
  task_checkpoint_read: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  task_checkpoint_write: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 20h14"/></svg>',
  present_file: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  edit_image: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
  ,add_mcp_server: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="12" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9.7 10.7l4.6-2.4M9.7 13.3l4.6 2.4"/></svg>'
  ,list_mcp_servers: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="15" width="16" height="5" rx="1"/><path d="M8 6.5h.01M8 17.5h.01"/></svg>'
  ,list_mcp_tools: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3v7M3 7h6M18 14v7M15 18h6M6 10a6 6 0 0 0 6 6h3M18 14a6 6 0 0 0-6-6H9"/></svg>'
  ,call_mcp_tool: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  ,list_mcp_resources: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h16v14H4zM8 9h8M8 13h6"/></svg>'
  ,list_mcp_prompts: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>'
  ,read_mcp_resource: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>'
  ,get_mcp_prompt: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>'
  ,get_workspace_file_info: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h4"/></svg>'
  ,git_diff: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v16M7 8h7a3 3 0 0 1 0 6H7M17 16v4"/></svg>'
  ,quality_checkpoint: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  ,task_memory_list: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="5" rx="2"/><path d="M7 12h10M7 16h7"/></svg>'
  ,get_wallet_status: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h14a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5v1"/></svg>'
  ,get_wallet_price: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17 9 11l4 4 7-8"/><path d="M16 7h4v4"/></svg>'
  ,get_wallet_portfolio: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/></svg>'
  ,create_wallet: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>'
  ,prepare_wallet_transaction: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="m8 13 3 3 5-6"/></svg>'
  ,prepare_wallet_swap: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3M18 7a6 6 0 0 1 0 10M6 17A6 6 0 0 1 6 7"/></svg>'
  ,send_email: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 16 8-16 8 3-8-3-8zM7 12h13"/></svg>'
};
const TOOL_TITLES = {
  list_workspace_files: "List files",
  read_workspace_file: "Read file",
  write_workspace_file: "Save file",
  search_workspace: "Search code",
  run_terminal_command: "Terminal",
  load_skill: "Load skill",
  todo_write: "Update tasks",
  todo_read: "Read tasks",
  task_checkpoint_read: "Read resume point",
  task_checkpoint_write: "Save resume point", task_memory_list: "List task notes", task_memory_read: "Read task note", task_memory_write: "Save task note",
  present_file: "Present file",
  edit_image: "Edit image", add_mcp_server: "Add MCP server", list_mcp_servers: "List MCP servers", list_mcp_tools: "List MCP tools", list_mcp_resources: "List MCP resources", list_mcp_prompts: "List MCP prompts", read_mcp_resource: "Read MCP resource", get_mcp_prompt: "Get MCP prompt", call_mcp_tool: "Call MCP tool", get_workspace_file_info: "Inspect file", git_diff: "Review diff", quality_checkpoint: "Quality checkpoint", create_wallet: "Create local wallet", get_wallet_accounts: "Wallet addresses", get_wallet_status: "Wallet status", get_wallet_price: "Wallet price", get_wallet_market_snapshot: "Token market snapshot", get_wallet_token_allowance: "Inspect token allowance", get_wallet_portfolio: "Wallet portfolio", get_wallet_token_info: "Inspect token", get_wallet_activity: "Wallet activity", get_wallet_watch: "Wallet watch status", set_wallet_watch: "Update wallet watch", prepare_wallet_transaction: "Prepare wallet transaction", prepare_wallet_swap: "Get swap quote", send_email: "Prepare email"
};
function toolTitle(name) { return TOOL_TITLES[name] || name; }
function toolIcon(name) { return TOOL_ICONS[name] || (String(name).startsWith("task_memory_") ? TOOL_ICONS.task_memory_list : TOOL_ICONS.load_skill); }

function toolSummary(name, input = {}) {
  let s = "";
  if (name === "todo_write" && Array.isArray(input?.todos)) {
    const done = input.todos.filter(t => t?.status === "completed").length;
    const prog = input.todos.filter(t => t?.status === "in_progress").length;
    s = input.todos.length + " tasks" + (done ? " · " + done + " done" : "") + (prog ? " · 1 active" : "");
  }
  else if (name === "task_checkpoint_write" && input.status) s = "Save " + input.status + " resume point";
  else if (name === "edit_image" && input.prompt) s = "“" + String(input.prompt).replace(/\s+/g, " ").trim().slice(0, 60) + "”";
  else if (["get_wallet_market_snapshot", "get_wallet_token_allowance"].includes(name) && input.tokenAddress) s = String(input.network || "") + " · " + String(input.tokenAddress).slice(0, 14) + "…";
  else if (input.path) s = String(input.path);
  else if (input.command) s = String(input.command).replace(/\s+/g, " ").trim();
  else if (input.query) s = "“" + String(input.query).replace(/\s+/g, " ").trim() + "”";
  else if (input.name) s = String(input.name);
  else if (input.id) s = String(input.id);
  return s.length > 64 ? s.slice(0, 64) + "…" : s;
}
function toolResultSummary(name, output = {}) {
  if (output.error) return output.approvalRequired ? "Approval needed" : "Failed";
  switch (name) {
    case "list_workspace_files": return (output.count ?? "…") + " files";
    case "read_workspace_file": return (output.path || "file") + (output.truncated ? " · truncated" : "");
    case "write_workspace_file": return (output.created ? "Created " : "Updated ") + (output.path || "file") + (output.bytes != null ? " · " + fmtSize(output.bytes) : "");
    case "search_workspace": return (output.matches ?? "…") + " matches";
    case "run_terminal_command": return "Exit " + (output.exitCode ?? "?");
    case "load_skill": return output.name ? output.name + " loaded" : "Loaded";
    case "todo_write": return output.total != null ? output.completed + "/" + output.total + " done" + (output.current ? " · now: " + output.current : "") : "Task list updated";
    case "todo_read": return output.total != null ? output.total + " tasks · " + output.completed + " done" : "Read";
    case "task_checkpoint_read": return output.checkpoint ? output.checkpoint.status + " resume point" : "No saved resume point";
    case "task_checkpoint_write": return output.checkpoint ? "Saved · " + output.checkpoint.status : "Saved";
    case "task_memory_list": return (output.notes || []).length + " private notes";
    case "task_memory_read": return output.name || "Read note";
    case "task_memory_write": return (output.updated ? "Updated " : "Saved ") + (output.name || "private note");
    case "present_file": return "Ready to download";
    case "edit_image": return (output.edited ? "Edited " : "Generated ") + (output.name || "image") + (output.size != null ? " · " + fmtSize(output.size) : "");
    case "get_workspace_file_info": return (output.path || "file") + (output.bytes != null ? " · " + fmtSize(output.bytes) : "");
    case "git_diff": return output.changed ? "Changes found" : "Clean";
    case "quality_checkpoint": return output.tier ? (output.tier + (output.ready ? " · ready" : " · " + (output.remainingMinutes ?? "?") + "m left")) : "Checked";
    case "get_wallet_status": return output.balanceNative != null ? output.balanceNative + " native" : "Read-only status";
    case "get_wallet_price": return output.priceUsd != null ? "$" + output.priceUsd : "Price unavailable";
    case "get_wallet_market_snapshot": return (output.pairCount ?? output.pairs?.length ?? 0) + " pool(s) · " + (output.network || "market data");
    case "get_wallet_token_allowance": return output.allowance != null ? output.allowance + (output.symbol ? " " + output.symbol : "") + (output.unlimited ? " · unlimited" : "") : "Allowance read";
    case "get_wallet_portfolio": return output.totalUsd != null ? "$" + output.totalUsd + " total" : "Portfolio read";
    case "get_wallet_watch": return output.enabled ? "Watching · best effort" : "Watch is off";
    case "set_wallet_watch": return output.enabled ? "Watching while Sonderr runs" : "Watch stopped";
    case "prepare_wallet_transaction": return output.to ? "Review " + output.to.slice(0, 10) + "…" : "Review required";
    case "create_wallet": return output.address ? "Created " + output.address.slice(0, 10) + "…" : "Local wallet";
    case "prepare_wallet_swap": return output.sellToken ? "Review swap" : "Review required";
    default: return "";
  }
}
function toolOutputText(output) {
  if (output == null) return "";
  if (typeof output === "string") return output;
  if (output.note && output.listStatuses) {
    return "Task list updated — " + (output.completed ?? 0) + "/" + (output.total ?? 0) + " completed\n" +
      (output.listStatuses || []).map(s => "  " + s).join("\n") +
      "\n\n" + (output.note || "");
  }
  if (output.content != null) {
    const c = String(output.content);
    return c.slice(0, 2600) + (c.length > 2600 ? "\n… [" + c.length + " chars total, truncated]" : "");
  }
  if (output.stdout != null || output.stderr != null) {
    return "$ " + (output.command || "") + (output.exitCode != null ? "  → exit " + output.exitCode : "") +
      (output.stdout ? "\n\n[stdout]\n" + output.stdout : "") +
      (output.stderr ? "\n\n[stderr]\n" + output.stderr : "");
  }
  if (output.instructions) return "# " + (output.name || "skill") + "\n" + String(output.instructions).slice(0, 2400);
  try { return JSON.stringify(output, null, 2); } catch { return String(output); }
}

function createToolBlock(name, input) {
  const el = document.createElement("div");
  el.className = "tool";
  const summary = toolSummary(name, input);
  let inputPretty = ""; try { inputPretty = JSON.stringify(input, null, 2); } catch { inputPretty = String(input ?? ""); }
  el.innerHTML =
    '<button class="tool-head" aria-expanded="false">' +
      '<svg class="tool-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' +
      '<span class="tool-ico">' + toolIcon(name) + "</span>" +
      '<span class="tool-name">' + esc(toolTitle(name)) + (summary ? "<small>" + esc(summary) + "</small>" : "") + "</span>" +
      '<span class="tool-state wait"><span class="spin"></span><span class="tool-wait-label">Running</span></span>' +
    "</button>" +
    '<div class="tool-body"><div class="tool-section"><div class="tool-label">Input</div><pre>' + esc(inputPretty) + "</pre></div></div>";
  el.querySelector(".tool-head").onclick = () => {
    const open = el.classList.toggle("open");
    el.querySelector(".tool-head").setAttribute("aria-expanded", String(open));
  };
  return el;
}

function completeToolBlock(el, ev) {
  const stateEl = el.querySelector(".tool-state");
  const output = ev.output ?? {};
  const failed = Boolean(ev.failed) || Boolean(output.error);
  if (failed) {
    stateEl.className = "tool-state " + (output.approvalRequired ? "approval" : "err");
    stateEl.textContent = output.approvalRequired ? "Approval needed" : "Failed";
  } else {
    stateEl.className = "tool-state done";
    stateEl.innerHTML = "Done <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6L9 17l-5-5'/></svg>";
  }
  const rs = failed
    ? (output.approvalRequired ? "Needs approval" : String(output.error || "Tool failed").replace(/\s+/g, " ").slice(0, 72))
    : toolResultSummary(ev.name, output);
  if (rs) el.querySelector(".tool-name").innerHTML = esc(toolTitle(ev.name)) + '<small' + (failed ? ' class="tool-error"' : "") + ">" + esc(rs) + "</small>";
  el.querySelector(".tool-body").insertAdjacentHTML("beforeend",
    '<div class="tool-section"><div class="tool-label">Output</div><pre>' + esc(toolOutputText(output)) + "</pre></div>");
}

function buildToolBlocks(events) {
  const wrap = document.createElement("div");
  wrap.className = "tools";
  const byId = new Map();
  for (const ev of events || []) {
    if (ev.type === "todo_update") continue; // rendered once by addAgentMessage from the last state
    if (ev.type === "task_checkpoint_update") continue; // rendered as a dedicated resume card
    if (ev.type === "present") { wrap.appendChild(renderPresentCard(ev)); continue; }
    if (ev.type === "email_confirmation") { wrap.appendChild(renderEmailConfirmation(ev)); continue; }
    if (ev.type === "wallet_confirmation") { wrap.appendChild(renderWalletConfirmation(ev)); continue; }
    if (ev.type === "wallet_created") { wrap.appendChild(renderWalletCreated(ev)); continue; }
    if (ev.type === "wallet_accounts") { wrap.appendChild(renderWalletAccounts(ev)); continue; }
    if (ev.type === "wallet_status") { wrap.appendChild(renderWalletStatus(ev)); continue; }
    if (ev.type === "wallet_price") { wrap.appendChild(renderWalletPrice(ev)); continue; }
    if (ev.type === "wallet_market_snapshot") { wrap.appendChild(renderWalletMarketSnapshot(ev)); continue; }
    if (ev.type === "wallet_token_allowance") { wrap.appendChild(renderWalletTokenAllowance(ev)); continue; }
    if (ev.type === "wallet_market_snapshot") { wrap.appendChild(renderWalletMarketSnapshot(ev)); continue; }
    if (ev.type === "wallet_token_allowance") { wrap.appendChild(renderWalletTokenAllowance(ev)); continue; }
    if (ev.type === "wallet_portfolio") { wrap.appendChild(renderWalletPortfolio(ev)); continue; }
    if (ev.type === "wallet_token_info") { wrap.appendChild(renderWalletTokenInfo(ev)); continue; }
    if (ev.type === "wallet_activity") { wrap.appendChild(renderWalletActivity(ev)); continue; }
    if (ev.type === "wallet_watch") { wrap.appendChild(renderWalletWatch(ev)); continue; }
    if (ev.type === "tool_start") {
      if (ev.name === "present_file") continue; // the present card IS the UI for this tool
      const el = createToolBlock(ev.name, ev.input);
      byId.set(ev.id, el);
      wrap.appendChild(el);
    } else if (ev.type === "tool_end") {
      const el = byId.get(ev.id);
      if (el) completeToolBlock(el, ev);
    }
  }
  // any tool left "running" (no end event) → mark interrupted
  for (const el of byId.values()) {
    const s = el.querySelector(".tool-state");
    if (s?.classList.contains("wait")) { s.className = "tool-state err"; s.textContent = "Interrupted"; }
  }
  return wrap;
}

/* ---------- v1.8 · Claude-style artifact cards + preview panel ---------- */
const KIND_LABEL = {
  image: "Image", markdown: "Markdown", pdf: "PDF document", csv: "CSV data",
  json: "JSON", text: "Text file", archive: "Archive", file: "File"
};
const ICONS = {
  doc: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
  code: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>',
  img: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  table: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
  braces: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>',
  box: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
  dl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  chevR: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
};
const TEXT_KINDS = new Set(["markdown", "text", "json", "csv"]);
const TEXT_EXT = /^(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|css|html|htm|xml|yml|yaml|csv|tsv|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|cs|php|sh|bash|zsh|sql|toml|ini|cfg|conf|log|svg|gitignore|dockerfile|makefile)$/;

function fileKind(mime, name) {
  const n = String(name || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  const ext = n.includes(".") ? n.split(".").pop() : n.replace(/[^\w]/g, "");
  if (/^image\//.test(m) || /^(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(ext)) return "image";
  if (/^(md|markdown)$/.test(ext) || /markdown/.test(m)) return "markdown";
  if (ext === "pdf" || /pdf/.test(m)) return "pdf";
  if (/^(csv|tsv)$/.test(ext)) return "csv";
  if (ext === "json" || /json/.test(m)) return "json";
  if (TEXT_EXT.test(ext) || /^text\//.test(m)) return "text";
  if (/^(zip|tar|gz|tgz|rar|7z)$/.test(ext)) return "archive";
  return "file";
}
function kindIcon(kind) {
  if (kind === "image") return ICONS.img;
  if (kind === "markdown") return ICONS.doc;
  if (kind === "csv") return ICONS.table;
  if (kind === "json") return ICONS.braces;
  if (kind === "archive") return ICONS.box;
  if (kind === "text" || kind === "pdf") return ICONS.doc;
  return ICONS.doc;
}
function isTextFile(name) { return TEXT_KINDS.has(fileKind("", name)); }
const dlHref = (p) => "/api/download?path=" + encodeURIComponent(p || "");
const inlineHref = (p) => dlHref(p) + "&inline=1";

async function fetchFileText(p) {
  const r = await fetch("/api/file?path=" + encodeURIComponent(p));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "Could not read file"); e.status = r.status; throw e; }
  return String(d.content ?? "");
}

function renderPresentCard(p) {
  const el = document.createElement("div");
  el.className = "artifact-card";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-label", "Open file preview: " + (p.title || p.name || "file"));
  const kind = fileKind(p.mime, p.name);
  const thumb = kind === "image"
    ? '<img class="ac-thumb" src="' + inlineHref(p.path) + '" alt="" loading="lazy">'
    : '<span class="ac-ico">' + kindIcon(kind) + "</span>";
  const meta = (KIND_LABEL[kind] || "File") + (p.size != null ? " · " + fmtSize(p.size) : "");
  el.innerHTML =
    thumb +
    '<span class="ac-copy"><strong>' + esc(p.title || p.name || "File") + "</strong><small>" + esc(meta) + "</small></span>" +
    '<span class="ac-actions"><a class="ac-btn" data-act="download" title="Download" aria-label="Download file" href="' + dlHref(p.path) + '" download="' + esc(p.name || "file") + '">' + ICONS.dl + "</a></span>" +
    ICONS.chevR.replace("<svg", '<svg class="ac-chev"');
  el.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="download"]')) return; // the anchor handles it
    openArtifact(p);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest('[data-act="download"]')) return;
    e.preventDefault(); openArtifact(p);
  });
  el.querySelector('[data-act="download"]').addEventListener("click", (e) => e.stopPropagation());
  return el;
}

/* ---------- artifact side panel ---------- */
function artifactBodyHtml(kind, p) {
  const body = $("apBody");
  if (kind === "image") {
    body.innerHTML = '<div class="ap-imgwrap"><img src="' + inlineHref(p.path) + '" alt="' + esc(p.name || "") + '"></div>';
    return;
  }
  if (!TEXT_KINDS.has(kind)) {
    body.innerHTML =
      '<div class="ap-empty"><span class="ap-eico">' + kindIcon(kind) + "</span>" +
      "<strong>No inline preview</strong>" +
      "<small>" + esc(KIND_LABEL[kind] || "This file type") + " can't be previewed here — download it to open on your machine.</small>" +
      '<a class="ap-act primary" href="' + dlHref(p.path) + '" download="' + esc(p.name || "file") + '">' + ICONS.dl + " Download file</a></div>";
    return;
  }
  body.innerHTML = '<div class="ap-loading"><span class="spin"></span>Loading preview…</div>';
  fetchFileText(p.path).then((text) => {
    state.artifactText = text;
    if (kind === "markdown") {
      body.innerHTML = '<div class="ap-md md">' + renderMarkdown(text) + "</div>";
    } else if (kind === "json") {
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not valid json, show raw */ }
      body.innerHTML = '<pre class="ap-code">' + esc(pretty) + "</pre>";
    } else if (kind === "csv") {
      const sep = p.name.toLowerCase().endsWith(".tsv") ? "\t" : ",";
      const rows = text.split(/\r?\n/).filter((l) => l.length).slice(0, 101)
        .map((line) => line.split(sep).map((c) => c.replace(/^"|"$/g, "").slice(0, 120)));
      if (!rows.length) { body.innerHTML = '<pre class="ap-code"></pre>'; return; }
      const head = rows[0], rest = rows.slice(1, 101);
      body.innerHTML =
        '<div class="ap-tablewrap"><table class="ap-table"><thead><tr>' +
        head.map((c) => "<th>" + esc(c) + "</th>").join("") +
        "</tr></thead><tbody>" +
        rest.map((r) => "<tr>" + head.map((_, i) => "<td>" + esc(r[i] ?? "") + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>" +
        (text.split(/\r?\n/).length > 100 ? '<div class="hint" style="margin-top:8px">Showing first 100 rows — download for the full file.</div>' : "") +
        "</div>";
    } else {
      body.innerHTML = '<pre class="ap-code">' + esc(text) + "</pre>";
    }
  }).catch((e) => {
    state.artifactText = "";
    body.innerHTML =
      '<div class="ap-empty"><span class="ap-eico">' + kindIcon(kind) + "</span>" +
      "<strong>" + (e.status === 413 ? "File is too large to preview" : "Preview unavailable") + "</strong>" +
      "<small>" + esc(e.message) + " — download it to view the full content.</small>" +
      '<a class="ap-act primary" href="' + dlHref(p.path) + '" download="' + esc(p.name || "file") + '">' + ICONS.dl + " Download file</a></div>";
  });
}

function openArtifact(p) {
  const kind = fileKind(p.mime, p.name);
  state.artifact = p;
  state.artifactText = "";
  $("artifactPanel").hidden = false;
  document.querySelector(".app").classList.add("artifact-open");
  $("apName").textContent = p.title || p.name || "File";
  $("apMeta").textContent = (KIND_LABEL[kind] || "File") + (p.size != null ? " · " + fmtSize(p.size) : "");
  const head = document.querySelector(".ap-head");
  head.querySelector(".ap-ico, .ap-thumb")?.remove();
  if (kind === "image") {
    const img = document.createElement("img");
    img.className = "ap-thumb"; img.alt = ""; img.src = inlineHref(p.path);
    head.insertBefore(img, head.firstChild);
  } else {
    const ico = document.createElement("span");
    ico.className = "ap-ico"; ico.innerHTML = kindIcon(kind);
    head.insertBefore(ico, head.firstChild);
  }
  const dl = $("apDownload");
  dl.href = dlHref(p.path);
  dl.setAttribute("download", p.name || "file");
  $("apCopy").hidden = !TEXT_KINDS.has(kind);
  artifactBodyHtml(kind, p);
}
function closeArtifact() {
  $("artifactPanel").hidden = true;
  document.querySelector(".app").classList.remove("artifact-open");
}

/* ---------- z.ai-style live task list (todo card) ---------- */
const TODO_STATUS_ICON = {
  completed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  in_progress: '<span class="todo-activespin"></span>',
  pending: '<span class="todo-ring"></span>'
};
function todoProgress(todos) {
  const total = (todos || []).length;
  const done = (todos || []).filter(t => t.status === "completed").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function renderTodoCard(todos, opts = {}) {
  const { total, done, pct } = todoProgress(todos);
  const el = document.createElement("div");
  el.className = "todo-card" + (opts.live ? " live" : "") + (pct === 100 ? " alldone" : "");
  const items = (todos || []).map(t =>
    '<li class="todo-item st-' + esc(t.status) + '">' +
      '<span class="todo-mark">' + (TODO_STATUS_ICON[t.status] || TODO_STATUS_ICON.pending) + "</span>" +
      '<span class="todo-text">' + esc(t.content) + (t.priority === "high" && t.status !== "completed" ? '<i class="todo-prio">high</i>' : "") + "</span>" +
    "</li>"
  ).join("");
  el.innerHTML =
    '<div class="todo-head">' +
      '<span class="todo-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.6 1.6L8.2 4"/><path d="M3.5 12.5l1.6 1.6L8.2 11"/><path d="M3.5 19.5l1.6 1.6L8.2 18"/><path d="M12 5.5h9"/><path d="M12 12.5h9"/><path d="M12 19.5h9"/></svg>Task list</span>' +
      '<span class="todo-count">' + done + "/" + total + "</span>" +
    "</div>" +
    '<div class="todo-bar"><span style="width:' + pct + '%"></span></div>' +
    '<ul class="todo-list">' + items + "</ul>";
  return el;
}
function lastTodoEvent(events) {
  let last = null;
  for (const ev of events || []) if (ev.type === "todo_update" && Array.isArray(ev.todos)) last = ev;
  return last;
}
function lastTaskCheckpointEvent(events) {
  let last = null;
  for (const event of events || []) if (event.type === "task_checkpoint_update" && event.checkpoint) last = event;
  return last;
}
function renderTaskCheckpointCard(checkpoint, opts = {}) {
  const el = document.createElement("section");
  const status = ["active", "paused", "completed"].includes(checkpoint?.status) ? checkpoint.status : "paused";
  const interrupted = Boolean(checkpoint?.interruptedAt);
  const statusLabel = interrupted ? "stopped · resume?" : status === "active" ? "running locally" : status;
  el.className = "task-checkpoint-card cp-" + status;
  el.dataset.checkpointUpdatedAt = checkpoint?.updatedAt || "";
  const list = items => Array.isArray(items) && items.length
    ? "<ul>" + items.map(item => "<li>" + esc(item) + "</li>").join("") + "</ul>"
    : "";
  el.innerHTML = '<div class="task-checkpoint-head"><strong>Resume point</strong><span>' + esc(statusLabel) + "</span></div>" +
    '<p class="task-checkpoint-goal">' + esc(checkpoint?.goal || "Multi-step task") + "</p>" +
    (interrupted ? '<div class="task-checkpoint-interrupted">Sonderr stopped while this task was running. Review the checkpoint, then choose whether to resume.</div>' : "") +
    (checkpoint?.currentMilestone ? '<div class="task-checkpoint-field"><small>Current milestone</small><div>' + esc(checkpoint.currentMilestone) + "</div></div>" : "") +
    (checkpoint?.verified?.length ? '<div class="task-checkpoint-field"><small>Verified so far</small>' + list(checkpoint.verified) + "</div>" : "") +
    (checkpoint?.decisions?.length ? '<div class="task-checkpoint-field"><small>Keep in mind</small>' + list(checkpoint.decisions) + "</div>" : "") +
    (checkpoint?.nextAction ? '<div class="task-checkpoint-next"><small>Next action</small><div>' + esc(checkpoint.nextAction) + "</div></div>" : "");
  if (opts.actionable && status === "paused" && checkpoint?.nextAction) {
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "task-checkpoint-resume";
    resume.textContent = interrupted ? "Resume interrupted task" : "Continue in Build";
    resume.onclick = () => {
      if (state.sending) return;
      setMode("build");
      $("input").value = "Continue from checkpoint";
      send();
    };
    el.appendChild(resume);
  }
  if (opts.actionable && status === "active" && !interrupted && state.session?.id) {
    const pause = document.createElement("button");
    pause.type = "button";
    pause.className = "task-checkpoint-pause";
    pause.textContent = "Pause local run";
    pause.onclick = async () => {
      pause.disabled = true;
      pause.textContent = "Pause requested…";
      try {
        await api("/api/sessions/" + encodeURIComponent(state.session.id) + "/pause", { method: "POST" });
        toast("Sonderr will pause after its current safe operation");
      } catch (error) {
        pause.disabled = false;
        pause.textContent = "Pause local run";
        toast(error.message || "Could not pause this run");
      }
    };
    el.appendChild(pause);
  }
  return el;
}
async function refreshOpenTaskProgress() {
  if (!state.session?.id || state.sending) return;
  await loadSessions();
  if (state.session.taskCheckpoint && state.session.taskCheckpoint.status !== "active") return;
  try {
    const data = await api("/api/sessions/" + encodeURIComponent(state.session.id));
    const nextSession = data.session;
    const nextCheckpoint = nextSession?.taskCheckpoint;
    if (!nextCheckpoint || nextCheckpoint.updatedAt === state.session.taskCheckpoint?.updatedAt) return;
    state.session = nextSession;
    const card = document.querySelector('#messages .task-checkpoint-card[data-session-latest="true"]');
    if (card) {
      const replacement = renderTaskCheckpointCard(nextCheckpoint, { actionable: true });
      replacement.dataset.sessionLatest = "true";
      card.replaceWith(replacement);
    } else {
      const latestCard = renderTaskCheckpointCard(nextCheckpoint, { actionable: true });
      latestCard.dataset.sessionLatest = "true";
      $("messages").appendChild(latestCard);
    }
    markActiveSession();
  } catch { /* task progress is local; retry on the next poll */ }
}

function connectorLogo(id) {
  const logos = {
    gmail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M3 5.2v13.6c0 .7.5 1.2 1.2 1.2h2.6V9.4L12 13.3l5.2-3.9V20h2.6c.7 0 1.2-.5 1.2-1.2V5.2L12 11.5 3 5.2z"/><path fill="#4285F4" d="M3 5.2 12 11.5l9-6.3c-.2-.7-.8-1.2-1.6-1.2H4.6c-.8 0-1.4.5-1.6 1.2z"/></svg>',
    notion: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#111"/><path d="M7 17V7h2.1l5.9 6.2V7H17v10h-2.1L9 10.8V17H7z" fill="#fff"/></svg>',
    slack: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#36C5F0" d="M9.1 3.2a2.4 2.4 0 1 0 0 4.8h2.4V5.6a2.4 2.4 0 0 0-2.4-2.4zM3.2 9.1a2.4 2.4 0 1 0 4.8 0V6.7H5.6a2.4 2.4 0 0 0-2.4 2.4z"/><path fill="#2EB67D" d="M20.8 9.1a2.4 2.4 0 1 0-4.8 0v2.4h2.4a2.4 2.4 0 0 0 2.4-2.4zM14.9 20.8a2.4 2.4 0 1 0 0-4.8h-2.4v2.4a2.4 2.4 0 0 0 2.4 2.4z"/><path fill="#ECB22E" d="M14.9 3.2a2.4 2.4 0 1 0-2.4 2.4V8h2.4a2.4 2.4 0 0 0 0-4.8zM9.1 20.8a2.4 2.4 0 1 0 2.4-2.4V16H9.1a2.4 2.4 0 0 0 0 4.8z"/><path fill="#E01E5A" d="M20.8 14.9a2.4 2.4 0 1 0-2.4-2.4H16v2.4a2.4 2.4 0 0 0 4.8 0zM3.2 14.9a2.4 2.4 0 1 0 2.4-2.4H8v2.4a2.4 2.4 0 0 0-4.8 0z"/></svg>',
    "google-drive": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="m8.1 3 4.1 7.1H20L15.9 3H8.1z"/><path fill="#4285F4" d="m4 10.1 4.1 7.1h8.2l4.1-7.1h-8.2L8.1 3 4 10.1z"/><path fill="#F4B400" d="M4 10.1 2.2 13.2l4.1 7.1h8.2l1.8-3.1H8.1L4 10.1z"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#24292f" d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.3-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.7-4.5 4.9.4.3.7 1 .7 2v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2z"/></svg>',
    linear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5E6AD2" d="M19.8 13.8a8.1 8.1 0 0 1-9.6 5.9 8.2 8.2 0 0 1-5.9-9.6 8.1 8.1 0 0 1 9.6-5.9 8.2 8.2 0 0 1 5.9 9.6z"/><path fill="#fff" d="m7 7.2 9.8 9.8M9.1 6.5l8.4 8.4M6.5 9.1l8.4 8.4" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>'
  };
  return logos[id] || '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm1 14h-2v-2h2v2zm1.2-6.3-.9.8c-.8.7-1.3 1.2-1.3 2.5h-2c0-1.8.7-2.7 1.8-3.6l.7-.6c.4-.3.7-.7.7-1.2 0-.8-.7-1.4-1.7-1.4-1 0-1.7.6-1.8 1.6H8.6c.1-2 1.6-3.4 3.9-3.4 2.2 0 3.6 1.3 3.6 3.1 0 .9-.4 1.6-1.9 2.7z"/></svg>';
}
function renderConnectorCard(connector) {
  const el = document.createElement("div");
  el.className = "connector-card";
  const configured = Boolean(connector.configured);
  el.innerHTML = '<div class="connector-card-icon connector-brand-' + esc(connector.logo || connector.id || "generic") + '">' + connectorLogo(connector.logo || connector.id) + '</div><div class="connector-card-copy"><div class="connector-card-title"><strong>Connect ' + esc(connector.name || "connector") + '</strong><span class="connector-status">' + (configured ? "Ready to connect" : "Not connected") + '</span></div><span>' + esc(connector.description || "Connect this account before Sonderr can use it.") + '</span><small class="connector-card-note">You choose what to share. Sonderr asks before account actions.</small></div><button class="btn primary connector-open">' + (configured ? "Connect" : "Set up") + '</button>';
  el.querySelector(".connector-open").onclick = async () => {
    if (!configured) return openSettings("connectors");
    const button = el.querySelector(".connector-open");
    button.disabled = true; button.textContent = "Connecting…";
    try { await api("/api/mcp/" + encodeURIComponent(connector.id) + "/connect", { method: "POST" }); button.textContent = "Connected"; toast(connector.name + " connected"); }
    catch (e) { button.disabled = false; button.textContent = "Try again"; toast(e.message); }
  };
  return el;
}
function renderEmailConfirmation(draft) {
  const el = document.createElement("div");
  el.className = "email-confirmation";
  const to = [...(draft.to?.to || []), ...(draft.to?.cc || []).map(x => "CC: " + x), ...(draft.to?.bcc || []).map(x => "BCC: " + x)];
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">✉</span><div><strong>Ready to send email</strong><small>Review every recipient before it leaves Sonderr</small></div></div><div class="email-confirm-meta"><div><b>From</b><span>' + esc(draft.from || "") + '</span></div><div><b>To</b><span>' + to.map(esc).join(", ") + '</span></div><div><b>Subject</b><span>' + esc(draft.subject || "") + '</span></div></div><pre class="email-preview">' + esc(draft.bodyPreview || "") + (String(draft.bodyPreview || "").length >= 1000 ? "\n…" : "") + '</pre><div class="email-confirm-warning">This sends externally. Limits: 1 message/second, 10 recipients/message, 100/hour.</div><div class="email-confirm-actions"><button class="btn primary email-send-confirm">Send email</button><button class="btn ghost email-cancel-confirm">Cancel</button><span class="email-confirm-status"></span></div>';
  const sendButton = el.querySelector(".email-send-confirm");
  const status = el.querySelector(".email-confirm-status");
  sendButton.onclick = async () => {
    sendButton.disabled = true; el.querySelector(".email-cancel-confirm").disabled = true; sendButton.textContent = "Sending…";
    try {
      const result = await api(draft.gmail ? "/api/gmail/confirm" : "/api/email/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: draft.token }) });
      sendButton.textContent = "Sent"; status.textContent = result.messageId ? "Message accepted" : "Message accepted"; status.className = "email-confirm-status ok";
    } catch (e) { sendButton.disabled = false; el.querySelector(".email-cancel-confirm").disabled = false; sendButton.textContent = "Try again"; status.textContent = e.message; status.className = "email-confirm-status bad"; }
  };
  el.querySelector(".email-cancel-confirm").onclick = () => { el.classList.add("cancelled"); sendButton.disabled = true; status.textContent = "Cancelled"; status.className = "email-confirm-status"; };
  return el;
}
function renderWalletConfirmation(draft) {
  const el = document.createElement("div");
  el.className = "email-confirmation wallet-confirmation";
  const swap = ["swap", "swap_quote", "swap_approval"].includes(draft.kind);
  const quoteOnly = draft.kind === "swap_quote";
  const approvalOnly = draft.kind === "swap_approval";
  const fee = draft.chain === "solana" ? (draft.estimatedFeeNative ? draft.estimatedFeeNative + " SOL (" + (draft.estimatedFeeLamports || "0") + " lamports)" : "Unavailable") : (draft.estimatedFeeNative ? draft.estimatedFeeNative + " ETH (" + (draft.estimatedFeeWei || "0") + " wei)" : "Unavailable");
  const field = (label, value) => '<div><b>' + esc(label) + '</b><span>' + esc(String(value ?? "Unavailable")) + '</span></div>';
  const details = swap
    ? [
      field("Sell", (draft.sellAmountFormatted || draft.amount || "Unavailable") + " " + (draft.sellAsset?.symbol || "")),
      field("Sell amount (base units)", draft.amount), field("Sell contract", draft.sellToken),
      field("Estimated buy", (draft.estimatedBuyAmountFormatted || draft.estimatedBuyAmount || "Unavailable") + " " + (draft.buyAsset?.symbol || "")),
      field("Buy contract", draft.buyToken),
      ...(approvalOnly ? [] : [
        field("Sell token research", (draft.research?.sellToken?.name || "Unknown token") + " · " + (draft.research?.sellToken?.decimals ?? "?") + " decimals · wallet balance " + (draft.research?.sellToken?.walletBalance ?? "Unavailable")),
        field("Buy token research", (draft.research?.buyToken?.name || "Unknown token") + " · " + (draft.research?.buyToken?.decimals ?? "?") + " decimals · reported owner " + (draft.research?.buyToken?.owner || "Not reported")),
        ...(draft.research?.sellToken?.owner ? [field("Sell token reported owner", draft.research.sellToken.owner)] : [])
      ]),
      ...(approvalOnly ? [
        field("Approval only", "No swap will happen from this action"),
        field("Exact approval amount", (draft.approvalAmountFormatted || "Unavailable") + " " + (draft.sellAsset?.symbol || "")),
        field("Token contract", draft.sellToken), field("Spender allowed", draft.approvalSpender),
        field("Estimated network fee", draft.estimatedFeeNative ? draft.estimatedFeeNative + " ETH · " + (draft.estimatedFeeWei || "") + " wei" : "Unavailable"),
        field("Gas limit", draft.gasLimit), field("Approval calldata", String(draft.approvalData || "").slice(0, 18) + "…"),
        field("Review expires", draft.expiresAt ? new Date(draft.expiresAt).toLocaleTimeString() : "Soon")
      ] : quoteOnly ? [
        field("Minimum output", (draft.minimumBuyAmountFormatted || draft.minimumBuyAmount || "Unavailable") + " " + (draft.buyAsset?.symbol || "")),
        field("Minimum output (base units)", draft.minimumBuyAmount), field("Route", draft.route || "Unknown"),
        field("Slippage", (Number(draft.slippageBps) / 100).toFixed(2) + "%"),
        field("Approval spender", draft.approvalSpender || "Not required/returned"), field("Router target", draft.transactionTarget),
        field("Router call", String(draft.transactionDataBytes || 0) + " bytes · SHA-256 " + (draft.transactionDataSha256 || "")),
        field("Estimated route fees", (draft.feeCosts || []).map(f => f.name + ": " + f.amount + " " + f.token + (f.amountUsd ? " ($" + f.amountUsd + ")" : "")).join(" · ") || "None reported"),
        field("Estimated network costs", (draft.gasCosts || []).map(f => f.amount + " " + f.token + (f.amountUsd ? " ($" + f.amountUsd + ")" : "")).join(" · ") || "Not returned"),
        field("Quote time", draft.quoteFetchedAt || "Unknown")
      ] : [
        field("Slippage limit", (Number(draft.slippageBps) / 100).toFixed(2) + "%"),
        field("Estimated pool price impact", draft.priceImpactBps == null ? "Unavailable" : (Number(draft.priceImpactBps) / 100).toFixed(2) + "%"),
        field("Uniswap V3 pool fee", draft.poolFee == null ? "Unavailable" : (Number(draft.poolFee) / 10000).toFixed(2) + "%"),
        field("Approval spender", draft.approvalSpender || "Not needed (native input)"),
        field("Router target", draft.transactionTarget),
        field("Router call", String(draft.transactionDataBytes || 0) + " bytes · SHA-256 " + (draft.transactionDataSha256 || "")),
        field("Estimated network fee cap", draft.estimatedFeeNative ? draft.estimatedFeeNative + " ETH · " + (draft.estimatedFeeWei || "") + " wei" : "Unavailable"),
        field("Gas limit", draft.gasLimit),
        field("Estimated route fees", (draft.feeCosts || []).map(f => f.name + ": " + f.amount + " " + f.token + (f.amountUsd ? " ($" + f.amountUsd + ")" : "")).join(" · ") || "None reported"),
        field("Estimated network costs", (draft.gasCosts || []).map(f => f.amount + " " + f.token + (f.amountUsd ? " ($" + f.amountUsd + ")" : "")).join(" · ") || "See estimated network fee cap"),
        field("Research timestamp", draft.research?.fetchedAt || "Unavailable"),
        field("Direct on-chain pools checked", (draft.research?.pools || []).map(p => (Number(p.fee) / 10000).toFixed(2) + "% fee · liquidity " + p.liquidity + " · output " + (p.quotedOutput || "?")).join("; ") || "No direct Uniswap V3 pools found"),
        field("Quote expires", draft.expiresAt ? new Date(draft.expiresAt).toLocaleTimeString() : "Soon")
      ])
    ].join("")
    : [
      field("Wallet address", draft.from), field("Recipient", draft.to),
      field("Asset", (draft.asset?.amountFormatted || draft.asset?.amountBaseUnits || draft.amountBaseUnits || draft.value || "0") + " " + (draft.asset?.symbol || draft.asset?.kind || "native")),
      ...(draft.asset?.amountFormatted ? [field("Amount (base units)", draft.asset.amountBaseUnits || draft.amountBaseUnits)] : []),
      ...(draft.asset?.tokenAddress ? [field("Token contract/mint", draft.asset.tokenAddress)] : []),
      ...(draft.asset?.sourceAta ? [field("Source token account", draft.asset.sourceAta), field("Destination token account", draft.asset.destinationAta)] : []),
      field("Estimated gas/fee", fee), ...(draft.gasLimit ? [field("Gas limit", draft.gasLimit)] : []),
      ...(draft.maxFeePerGasWei ? [field("Max fee / priority", draft.maxFeePerGasWei + " / " + (draft.maxPriorityFeePerGasWei || "0") + " wei")] : []),
      field("Data", draft.data || (draft.instructionCount ? draft.instructionCount + " Solana instruction(s)" : "0x")),
      field("Review expires", draft.expiresAt ? new Date(draft.expiresAt).toLocaleTimeString() : "When this card expires")
    ].join("");
  const action = quoteOnly ? '<button class="btn ghost wallet-cancel-confirm">Dismiss</button>' : '<button class="btn primary wallet-send-confirm">' + (approvalOnly ? 'Accept exact approval' : swap ? 'Accept &amp; swap' : 'Accept &amp; send') + '</button><button class="btn ghost wallet-cancel-confirm">Decline</button><span class="wallet-confirm-status"></span>';
  const title = approvalOnly ? "Token approval · exact amount only" : quoteOnly ? "Live swap quote · execution off" : swap ? "Review spot swap" : "Wallet transaction prepared";
  const subtitle = approvalOnly ? "Approval only · a new quote and separate confirmation will still be required" : quoteOnly ? "Quote only · no approval, signing, or broadcast" : swap ? "Same-chain spot swap · research is not a profit prediction" : "Review the exact network and transaction before accepting";
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>' + title + '</strong><small>' + subtitle + '</small></div></div><div class="email-confirm-meta"><div><b>Chain</b><span>' + esc((draft.chain || "").toUpperCase()) + ' · ' + esc(draft.network || "Unknown") + (draft.testnet ? ' · TESTNET' : '') + '</span></div>' + details + '</div><div class="email-confirm-warning">' + esc(draft.note || "Sonderr only prepared this payload. Signing and broadcasting are intentionally unavailable.") + '</div><div class="email-confirm-actions">' + action + '</div>';
  const cancel = el.querySelector(".wallet-cancel-confirm");
  cancel.onclick = async () => {
    if (quoteOnly) { el.classList.add("cancelled"); cancel.disabled = true; return; }
    const send = el.querySelector(".wallet-send-confirm"), status = el.querySelector(".wallet-confirm-status");
    cancel.disabled = true; send.disabled = true; cancel.textContent = "Declining…";
    try {
      await api("/api/wallet/decline", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token:draft.token}) });
      el.classList.add("cancelled"); cancel.textContent = "Declined"; status.textContent = "Declined · no transaction was sent"; status.className = "wallet-confirm-status";
    } catch (e) { cancel.disabled = false; send.disabled = false; cancel.textContent = "Decline"; status.textContent = e.message; status.className = "wallet-confirm-status bad"; }
  };
  const send = el.querySelector(".wallet-send-confirm");
  if (send) send.onclick = async () => { const status = el.querySelector(".wallet-confirm-status"), label = approvalOnly ? "Accept exact approval" : swap ? "Accept & swap" : "Accept & send"; send.disabled = true; cancel.disabled = true; send.textContent = "Checking…"; try { const result = await api(swap ? "/api/wallet/swap/confirm" : "/api/wallet/confirm", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token:draft.token}) }); send.textContent = "Broadcast"; status.textContent = (result.action === "approval" ? "Approval broadcast: " : swap ? "Swap broadcast: " : "Transaction broadcast: ") + (result.transactionHash || "hash unavailable"); status.className = "wallet-confirm-status ok"; } catch (e) { send.disabled = false; cancel.disabled = false; send.textContent = label; status.textContent = e.message; status.className = "wallet-confirm-status bad"; } };
  return el;
}
function renderWalletStatus(status) {
  const el = document.createElement("div");
  el.className = "email-confirmation wallet-status-card";
  const native = status.balanceNative != null ? String(status.balanceNative) : "Unavailable";
  const symbol = status.nativeSymbol || (status.chain === "solana" ? "SOL" : "ETH");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Sonderr Wallet</strong><small>Read-only balance · no transaction was signed</small></div></div><div class="email-confirm-meta"><div><b>Chain</b><span>' + esc(String(status.chain || "").toUpperCase()) + ' · ' + esc(status.network || "Unknown") + '</span></div><div><b>Public address</b><span class="wallet-address-value">' + esc(status.address || "") + '</span></div><div><b>Native balance</b><span class="wallet-balance-value">' + esc(native + " " + symbol) + '</span></div>' + (status.blockNumber != null ? '<div><b>Block</b><span>' + esc(String(status.blockNumber)) + '</span></div>' : '') + (status.slot != null ? '<div><b>Slot</b><span>' + esc(String(status.slot)) + '</span></div>' : '') + '</div><div class="email-confirm-actions"><button class="btn ghost wallet-copy-address">Copy address</button><span class="wallet-confirm-status"></span></div>';
  const copy = el.querySelector(".wallet-copy-address");
  const note = el.querySelector(".wallet-confirm-status");
  copy.onclick = async () => { try { await navigator.clipboard.writeText(String(status.address || "")); copy.textContent = "Copied"; note.textContent = "Address copied"; note.className = "wallet-confirm-status ok"; setTimeout(() => { copy.textContent = "Copy address"; }, 1400); } catch { note.textContent = "Copy unavailable"; note.className = "wallet-confirm-status bad"; } };
  return el;
}
function renderWalletPrice(price) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card";
  const amount = price.priceUsd == null ? "Unavailable" : "$" + Number(price.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 8 });
  const change = price.change24h == null ? "" : '<div><b>24h</b><span class="' + (price.change24h >= 0 ? "wallet-up" : "wallet-down") + '">' + (price.change24h >= 0 ? "+" : "") + esc(Number(price.change24h).toFixed(2)) + '%</span></div>';
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>' + esc(price.symbol || "Token") + ' price</strong><small>Read-only market data · ' + esc(price.source || "price service") + '</small></div></div><div class="email-confirm-meta"><div><b>Price</b><span class="wallet-balance-value">' + esc(amount) + '</span></div>' + change + (price.tokenAddress ? '<div><b>Contract/mint</b><span class="wallet-address-value">' + esc(price.tokenAddress) + '</span></div>' : '') + '</div>';
  return el;
}
function renderWalletMarketSnapshot(market) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card wallet-portfolio-card";
  const usd = value => value == null ? "Unavailable" : "$" + Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const pairs = (market.pairs || []).map(pair => {
    const base = pair.baseToken || {}, quote = pair.quoteToken || {}, change = pair.priceChangePct?.h24;
    return '<div class="wallet-asset-row"><span><b>' + esc((base.symbol || "Token") + " / " + (quote.symbol || "quote") + " · " + (pair.dex || "DEX")) + '</b><small>Liquidity ' + esc(usd(pair.liquidityUsd)) + ' · 24h volume ' + esc(usd(pair.volume24hUsd)) + '</small><small>Market cap ' + esc(usd(pair.marketCapUsd)) + ' · FDV ' + esc(usd(pair.fdvUsd)) + '</small><small>Spot ' + esc(pair.assetPriceUsd == null ? "Not safely inferred for this pool" : usd(pair.assetPriceUsd)) + (change == null ? "" : " · 24h " + (change >= 0 ? "+" : "") + esc(Number(change).toFixed(2)) + "%") + '</small></span>' + (pair.url ? '<a href="' + esc(pair.url) + '" target="_blank" rel="noopener noreferrer">Pool</a>' : '') + '</div>';
  }).join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Token market snapshot</strong><small>' + esc(market.network || "Unknown network") + ' · ' + esc(market.source || "public market data") + ' · ' + esc(market.fetchedAt || "") + '</small></div></div><div class="email-confirm-meta"><div><b>Exact token</b><span class="wallet-address-value">' + esc(market.tokenAddress || "") + '</span></div><div><b>Pools</b><span>' + esc(String(market.pairCount ?? market.pairs?.length ?? 0)) + ' matching pool(s)</span></div></div><div class="wallet-asset-list">' + (pairs || '<div class="wallet-asset-row"><span>No matching mainnet pools returned.</span></div>') + '</div><div class="email-confirm-warning">' + esc(market.unavailableReason || market.note || "Public DEX data can be stale or manipulated; it is not a trade recommendation or proof of liquidity.") + '</div>';
  return el;
}
function renderWalletTokenAllowance(allowance) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card";
  const rows = [["Network", allowance.network], ["Token", allowance.symbol || "ERC-20"], ["Contract", allowance.tokenAddress], ["Owner", allowance.owner], ["Approved spender", allowance.spender], ["Allowance", allowance.allowance == null ? allowance.allowanceBaseUnits : allowance.allowance + (allowance.symbol ? " " + allowance.symbol : "")], ["Base units", allowance.allowanceBaseUnits], ["Unlimited approval", allowance.unlimited ? "Yes · elevated risk" : "No"]].filter(([, value]) => value != null).map(([label, value]) => '<div><b>' + esc(label) + '</b><span class="wallet-address-value">' + esc(String(value)) + '</span></div>').join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Token allowance · read-only</strong><small>' + esc(allowance.fetchedAt || "") + '</small></div></div><div class="email-confirm-meta">' + rows + '</div><div class="email-confirm-warning">' + esc(allowance.note || "This lookup does not change or revoke approval.") + '</div>';
  return el;
}
function renderWalletPortfolio(portfolio) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card wallet-portfolio-card";
  const total = portfolio.totalUsd == null ? "Unavailable" : "$" + Number(portfolio.totalUsd).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const delta = portfolio.changeSinceLastUsd == null ? "No previous snapshot" : (portfolio.changeSinceLastUsd >= 0 ? "+$" : "-$") + Math.abs(Number(portfolio.changeSinceLastUsd)).toFixed(2) + " since last check";
  const deltaClass = portfolio.changeSinceLastUsd == null ? "" : (portfolio.changeSinceLastUsd >= 0 ? "wallet-up" : "wallet-down");
  const rows = (portfolio.assets || []).slice(0, 16).map(asset => '<div class="wallet-asset-row"><span><b>' + esc(asset.symbol || asset.kind || "Asset") + '</b><small>' + esc(asset.tokenAddress || asset.tokenAccount || asset.kind || "native") + '</small></span><span>' + esc(asset.amount == null ? "Unavailable" : asset.amount) + (asset.valueUsd != null ? '<small>$' + Number(asset.valueUsd).toFixed(2) + '</small>' : '') + '</span></div>').join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Wallet portfolio</strong><small>Read-only balances · ' + esc(portfolio.network || "Unknown") + '</small></div></div><div class="email-confirm-meta"><div><b>Total value</b><span class="wallet-balance-value">' + esc(total) + '</span></div><div><b>Coverage</b><span>' + esc(String(portfolio.pricedAssets ?? "?") + ' of ' + String(portfolio.assetCount ?? "?") + ' assets priced') + '</span></div><div><b>Change</b><span class="' + deltaClass + '">' + esc(delta) + '</span></div><div><b>Address</b><span class="wallet-address-value">' + esc(portfolio.address || "") + '</span></div></div><div class="wallet-asset-list">' + (rows || '<div class="wallet-asset-row"><span>No balances returned</span></div>') + '</div><div class="email-confirm-warning">' + esc(portfolio.note || "Portfolio discovery and prices may be incomplete.") + '</div>';
  return el;
}
function renderWalletAccounts(result) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card";
  const rows = (result.accounts || []).map(account => '<div class="wallet-asset-row"><span><b>' + esc(account.network || account.chain) + ' · ' + esc(account.nativeSymbol || (account.chain === "solana" ? "SOL" : "ETH")) + '</b><small class="wallet-address-value">' + esc(account.address || "Unavailable") + '</small>' + (account.unavailableReason ? '<small>' + esc(account.unavailableReason) + '</small>' : '<small>Balance: ' + esc(account.balanceNative || "0") + ' ' + esc(account.nativeSymbol || "") + '</small>') + '</span>' + (account.address ? '<button class="btn ghost wallet-copy-address" data-address="' + esc(account.address) + '">Copy</button>' : '') + '</div>').join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Sonderr Wallet addresses</strong><small>Public addresses and native balances · ' + esc(result.fetchedAt || "") + '</small></div></div><div class="wallet-asset-list">' + (rows || '<div class="wallet-asset-row"><span>No local wallet created yet. Opt in at onboarding or create one in Settings → Wallet.</span></div>') + '</div><div class="email-confirm-warning">' + esc(result.note || "One address model per chain family.") + '</div>';
  el.querySelectorAll(".wallet-copy-address").forEach(button => { button.onclick = async () => { try { await navigator.clipboard.writeText(button.dataset.address || ""); button.textContent = "Copied"; setTimeout(() => { button.textContent = "Copy"; }, 1200); } catch { button.textContent = "Unavailable"; } }; });
  return el;
}
function renderWalletTokenInfo(info) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card";
  const rows = [
    ["Token", (info.name || "Unknown token") + (info.symbol ? " (" + info.symbol + ")" : "")], ["Address / mint", info.tokenAddress],
    ["Decimals", info.decimals], ["Total supply", info.totalSupply ?? info.supplyBaseUnits], ["Wallet balance", info.walletBalance],
    ["Mint authority", info.mintAuthority], ["Freeze authority", info.freezeAuthority], ["Owner", info.owner]
  ].filter(([, value]) => value != null).map(([key, value]) => '<div><b>' + esc(key) + '</b><span class="wallet-address-value">' + esc(String(value)) + '</span></div>').join("");
  const accounts = Array.isArray(info.walletTokenAccounts) ? info.walletTokenAccounts.map(item => '<div><b>SPL balance</b><span>' + esc(String(item.amount ?? "Unavailable")) + ' · ' + esc(String(item.address)) + '</span></div>').join("") : "";
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>On-chain token details</strong><small>Read-only metadata · ' + esc(info.network || "Unknown") + '</small></div></div><div class="email-confirm-meta">' + rows + accounts + '</div><div class="email-confirm-warning">' + esc(info.note || "Metadata is not a safety certification.") + '</div>';
  return el;
}
function renderWalletActivity(activity) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card wallet-portfolio-card";
  const rows = (activity.transactions || []).map(item => '<div class="wallet-asset-row"><span><b>' + esc(item.status || "reported") + ' · ' + esc((item.hash || item.signature || "").slice(0, 18)) + '…</b><small>' + esc(item.timestamp || item.blockTime || (item.slot != null ? "slot " + item.slot : "")) + ' · ' + esc((item.from || "").slice(0, 10)) + (item.to ? ' → ' + esc(item.to.slice(0, 10)) : "") + '</small></span><a href="' + esc(item.explorerUrl || "#") + '" target="_blank" rel="noopener noreferrer">Explorer</a></div>').join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Recent wallet activity</strong><small>' + esc(activity.source || "Public chain data") + ' · ' + esc(activity.network || "Unknown") + '</small></div></div><div class="wallet-asset-list">' + (rows || '<div class="wallet-asset-row"><span>No recent transactions returned</span></div>') + '</div><div class="email-confirm-warning">' + esc(activity.note || "Explorer data can lag.") + '</div>';
  return el;
}
function renderWalletWatch(watch) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card wallet-portfolio-card";
  const rows = (watch.events || []).slice(0, 8).map(item => '<div class="wallet-asset-row"><span><b>+' + esc(item.amount || "?") + ' ' + esc(item.symbol || "token") + ' · ' + esc(item.network || item.chain || "network") + '</b><small>' + esc(item.tokenAddress || "Native balance") + ' · ' + esc(item.receivedAt || "") + '</small></span></div>').join("");
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Wallet watch ' + (watch.enabled ? "on" : "off") + '</strong><small>' + (watch.enabled ? "Local polling · every " + esc(String(watch.intervalSeconds || 60)) + "s" : "Not currently polling") + '</small></div></div><div class="wallet-asset-list">' + (rows || '<div class="wallet-asset-row"><span>No observed balance increases yet.</span></div>') + '</div><div class="email-confirm-warning">' + esc(watch.lastError || watch.note || "Best-effort balance polling; verify important deposits on-chain.") + '</div>';
  return el;
}
function renderWalletCreated(wallet) {
  const el = document.createElement("div"); el.className = "email-confirmation wallet-status-card";
  el.innerHTML = '<div class="email-confirm-head"><span class="email-icon">◈</span><div><strong>Local Sonderr Wallet created</strong><small>' + esc(wallet.network || "") + ' · no external wallet connected</small></div></div><div class="email-confirm-meta"><div><b>Public receive address</b><span class="wallet-address-value">' + esc(wallet.address || "") + '</span></div></div><div class="email-confirm-warning">Back up this wallet in Settings → Wallet before funding. The private key is never shown to the AI. For tokens, verify the exact chain and contract/mint; many coins intentionally share one wallet address.</div><div class="email-confirm-actions"><button class="btn ghost wallet-copy-address">Copy address</button><span class="wallet-confirm-status"></span></div>';
  el.querySelector(".wallet-copy-address").onclick = async () => { const button = el.querySelector(".wallet-copy-address"), status = el.querySelector(".wallet-confirm-status"); try { await navigator.clipboard.writeText(String(wallet.address || "")); button.textContent = "Copied"; status.textContent = "Address copied"; status.className = "wallet-confirm-status ok"; } catch { status.textContent = "Copy unavailable"; status.className = "wallet-confirm-status bad"; } };
  return el;
}

/* ---------- live agent row (SSE streaming) ---------- */
function createAgentRow() {
  const el = document.createElement("div");
  el.className = "msg-agent";
  el.innerHTML = '<span class="avatar"><img src="/assets/sonderr-mark-64.png" alt=""></span>' +
    '<div class="body"><div class="agent-status"><span class="spin"></span><span class="agent-status-text">Thinking…</span></div><div class="todo-slot"></div><div class="checkpoint-slot"></div><div class="tools"></div><div class="md"></div></div>';
  $("messages").appendChild(el); scrollBottom(true);
  const live = new Map();
  let todoCard = null;
  const statusText = () => el.querySelector(".agent-status-text");
  return {
    el,
    setStatus(text) { const s = statusText(); if (s && text) { s.textContent = text; scrollBottom(); } },
    hideStatus() { el.querySelector(".agent-status")?.remove(); },
    updateTodos(todos) {
      if (!Array.isArray(todos) || !todos.length) return;
      const slot = el.querySelector(".todo-slot");
      const next = renderTodoCard(todos, { live: true });
      if (todoCard) { todoCard.replaceWith(next); } else { slot.appendChild(next); }
      todoCard = next;
      const prog = todoProgress(todos);
      const current = todos.find(t => t.status === "in_progress");
      this.setStatus(prog.done < prog.total && current ? "Working on: " + current.content : (prog.done === prog.total ? "Task list complete" : "Working…"));
      scrollBottom();
    },
    updateCheckpoint(checkpoint) {
      const slot = el.querySelector(".checkpoint-slot");
      slot.replaceChildren(renderTaskCheckpointCard(checkpoint, { actionable: true }));
      const status = checkpoint?.status === "completed" ? "Task checkpoint complete" : checkpoint?.status === "paused" ? "Resume point saved" : "Task progress saved";
      this.setStatus(status);
      scrollBottom();
    },
    addTool(ev) {
      if (ev.name === "present_file") {
        live.set(ev.id, null); // no tool row — the present card is the UI
        this.setStatus("Presenting " + (ev.input?.path || "file") + "…");
        scrollBottom();
        return null;
      }
      const block = createToolBlock(ev.name, ev.input);
      live.set(ev.id, block);
      el.querySelector(".tools").appendChild(block);
      this.setStatus(toolTitle(ev.name) + (toolSummary(ev.name, ev.input) ? " · " + toolSummary(ev.name, ev.input) : "") + "…");
      scrollBottom();
      return block;
    },
    addPresent(p) {
      el.querySelector(".tools").appendChild(renderPresentCard(p));
      this.setStatus("Presented " + (p.name || "file"));
      scrollBottom();
    },
    addEmailConfirmation(draft) {
      el.querySelector(".tools").appendChild(renderEmailConfirmation(draft));
      this.setStatus("Waiting for email confirmation");
      scrollBottom();
    },
    addWalletConfirmation(draft) {
      el.querySelector(".tools").appendChild(renderWalletConfirmation(draft));
      this.setStatus("Wallet transaction ready for review");
      scrollBottom();
    },
    addWalletStatus(status) {
      el.querySelector(".tools").appendChild(renderWalletStatus(status));
      this.setStatus("Wallet balance checked");
      scrollBottom();
    },
    addWalletPrice(price) {
      el.querySelector(".tools").appendChild(renderWalletPrice(price));
      this.setStatus("Wallet price checked");
      scrollBottom();
    },
    addWalletPortfolio(portfolio) {
      el.querySelector(".tools").appendChild(renderWalletPortfolio(portfolio));
      this.setStatus("Wallet portfolio checked");
      scrollBottom();
    },
    completeTool(ev) {
      const block = live.get(ev.id);
      if (block && block.querySelector(".tool-state")?.classList.contains("wait")) completeToolBlock(block, ev);
      this.setStatus("Thinking…");
    },
    finish(message, connector) {
      this.hideStatus();
      el.querySelector(".md").innerHTML = renderMarkdown(message || "");
      if (connector) el.querySelector(".body").appendChild(renderConnectorCard(connector));
      scrollBottom();
    },
    fail(message) {
      this.hideStatus();
      for (const block of live.values()) {
        const s = block.querySelector(".tool-state");
        if (s?.classList.contains("wait")) { s.className = "tool-state err"; s.textContent = "Interrupted"; }
      }
      el.querySelector(".body").insertAdjacentHTML("beforeend",
        '<div class="tool" style="border-color:#f3cfcf;background:#fff7f7"><div class="tool-head" style="cursor:default"><span class="tool-ico" style="color:var(--bad);border-color:#f3cfcf">!</span><span class="tool-name">Request failed</span><span class="tool-state err">✕</span></div><div class="tool-body" style="display:block"><div class="tool-section"><pre>' + esc(message) + "</pre></div></div></div>");
      scrollBottom();
    }
  };
}

/* ---------- send ---------- */
function setSending(on) {
  state.sending = on;
  $("sendBtn").disabled = on;
  $("sendBtn").classList.toggle("pending", on);
  $("input").disabled = on;
}
async function send() {
  const input = $("input");
  const value = input.value.trim();
  if ((!value && !state.images.length) || state.sending) return;
  if (state.mode === "vision" && !state.images.length && !state.session) {
    toast("Attach an image with + to start Vision mode");
  }
  setSending(true);
  input.value = ""; autosize();
  await attachMentionedFiles(value);
  closeMentionMenu();
  $("welcome").hidden = true;
  $("messages").hidden = false;
  const sentImages = state.images.slice();
  addUserMessage(value, sentImages);
  const context = state.contextFiles.slice();
  let row = null, finished = false;
  try {
    if (!state.session) {
      const created = await api("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: (value || sentImages[0]?.name || "New task").slice(0, 120) }) });
      state.session = created.session;
    }
    row = createAgentRow();
    const res = await fetch("/api/sessions/" + state.session.id, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value, mode: state.mode, context, images: sentImages.map(i => i.path) })
    });
    const isStream = res.body && (res.headers.get("content-type") || "").includes("text/event-stream");
    if (!res.ok || !isStream) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Request failed (" + res.status + ")");
    }
    const handle = (evt) => {
      switch (evt.event) {
        case "tool_start": row.addTool(evt); break;
        case "tool_end": row.completeTool(evt); break;
        case "todo_update": row.updateTodos(evt.todos); break;
        case "task_checkpoint_update": row.updateCheckpoint(evt.checkpoint); break;
        case "present": row.addPresent(evt); break;
        case "email_confirmation": row.addEmailConfirmation(evt); break;
        case "wallet_confirmation": row.addWalletConfirmation(evt); break;
        case "wallet_created": row.el.querySelector(".tools").appendChild(renderWalletCreated(evt)); break;
        case "wallet_accounts": row.el.querySelector(".tools").appendChild(renderWalletAccounts(evt)); break;
        case "wallet_status": row.addWalletStatus(evt); break;
        case "wallet_price": row.addWalletPrice(evt); break;
        case "wallet_market_snapshot": row.el.querySelector(".tools").appendChild(renderWalletMarketSnapshot(evt)); break;
        case "wallet_token_allowance": row.el.querySelector(".tools").appendChild(renderWalletTokenAllowance(evt)); break;
        case "wallet_portfolio": row.addWalletPortfolio(evt); break;
        case "wallet_token_info": row.el.querySelector(".tools").appendChild(renderWalletTokenInfo(evt)); break;
        case "wallet_activity": row.el.querySelector(".tools").appendChild(renderWalletActivity(evt)); break;
        case "wallet_watch": row.el.querySelector(".tools").appendChild(renderWalletWatch(evt)); break;
        case "quality_update": row.setStatus("Quality " + evt.tier + (evt.ready ? " ready" : " · " + (evt.remainingMinutes ?? "?") + "m remaining")); break;
        case "round_start": row.setStatus("Working…"); break;
        case "status": if (evt.text) row.setStatus(evt.text); break;
        case "final":
          finished = true;
          state.session = evt.session || state.session;
          $("topbarTitle").textContent = state.session?.title || "New task";
          row.finish(evt.message || "", evt.connectorRequired || null);
          loadSessions();
          break;
        case "error": throw new Error(evt.error || "Provider request failed");
      }
    };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      buf += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          let evt; try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          handle(evt);
        }
      }
    }
    if (!finished) throw new Error("Connection closed before Sonderr finished responding.");
  } catch (e) {
    if (row && !finished) row.fail(e.message);
    else addErrorCard(e.message);
    if (state.session) loadSessions();
  } finally {
    setSending(false);
    state.images = [];
    renderContext();
    $("input").focus();
  }
}

/* ---------- workspace files / @mentions ---------- */
const mentionState = { open: false, start: -1, query: "", items: [], index: 0 };
const COMMANDS = [
  { id: "audit", icon: "◎", label: "Audit workspace", detail: "Map architecture, runtime, data flow, and risks.", prompt: "Audit this workspace: map the architecture, runtime, data flow, entry points, and the highest-priority risks." },
  { id: "health", icon: "◌", label: "Project health", detail: "Inspect manifests, scripts, tests, docs, and Git state.", prompt: "Analyze this workspace and give me a project-health report: manifests, scripts, tests, documentation, Git state, and actionable risks." },
  { id: "plan", icon: "◫", label: "Plan a feature", detail: "Create an evidence-based implementation plan.", prompt: "Plan this feature end-to-end. Inspect the relevant files first, then give affected files, ordered steps, risks, and verification." },
  { id: "verify", icon: "✓", label: "Verify project", detail: "Run existing checks and tests after approval.", prompt: "Verify this project by running the available check and test scripts, then report the exact results and failures." },
  { id: "security", icon: "⛨", label: "Security review", detail: "Review trust boundaries, secrets, and risky flows.", prompt: "Perform a focused security review of this workspace. Inspect trust boundaries, secrets handling, permissions, external calls, and practical fixes." },
  { id: "docs", icon: "▤", label: "Update docs", detail: "Bring public docs in line with verified behavior.", prompt: "Review the public documentation against the implementation, identify drift, and update only the pages that need correction." }
];
const commandState = { open: false, items: [], index: 0 };
function closeCommandMenu() {
  commandState.open = false; commandState.items = []; commandState.index = 0;
  const menu = $("commandMenu"); if (menu) { menu.hidden = true; menu.innerHTML = ""; }
}
function renderCommandMenu() {
  const menu = $("commandMenu"); if (!menu) return;
  const query = $("input").value.trim().slice(1).toLowerCase();
  commandState.items = COMMANDS.filter(item => !query || (item.label + " " + item.detail + " " + item.id).toLowerCase().includes(query));
  commandState.index = Math.min(commandState.index, Math.max(0, commandState.items.length - 1));
  menu.innerHTML = '<div class="command-head">Commands</div>' + (commandState.items.length
    ? commandState.items.map((item, index) => '<button class="command-item' + (index === commandState.index ? ' active' : '') + '" role="option" aria-selected="' + (index === commandState.index) + '" data-command-index="' + index + '"><span class="command-icon">' + item.icon + '</span><span class="command-copy"><strong>/' + esc(item.id) + ' · ' + esc(item.label) + '</strong><small>' + esc(item.detail) + '</small></span></button>').join("")
    : '<div class="mention-empty">No command found</div>');
  menu.hidden = false; commandState.open = true;
  menu.querySelectorAll(".command-item").forEach(button => {
    button.onmousedown = e => { e.preventDefault(); chooseCommand(Number(button.dataset.commandIndex)); };
  });
}
function updateCommandMenu() {
  if ($("input").value.trimStart().startsWith("/")) { closeMentionMenu(); renderCommandMenu(); }
  else closeCommandMenu();
}
function chooseCommand(index) {
  const item = commandState.items[index];
  if (!item) return closeCommandMenu();
  $("input").value = item.prompt;
  closeCommandMenu(); autosize(); $("input").focus();
}
function closeMentionMenu() {
  mentionState.open = false; mentionState.start = -1; mentionState.query = ""; mentionState.items = []; mentionState.index = 0;
  const menu = $("mentionMenu"); if (menu) { menu.hidden = true; menu.innerHTML = ""; }
}
function mentionCandidates(query) {
  const q = String(query || "").toLowerCase();
  return flattenFiles(state.files).filter(file => !q || file.path.toLowerCase().includes(q)).slice(0, 8);
}
function renderMentionMenu() {
  const menu = $("mentionMenu");
  if (!menu) return;
  const files = mentionState.items;
  if (!files.length) {
    menu.innerHTML = '<div class="mention-head">Workspace files</div><div class="mention-empty">No matching files</div>';
    menu.hidden = false; mentionState.open = true; return;
  }
  menu.innerHTML = '<div class="mention-head">Mention a workspace file</div>' + files.map((file, i) =>
    '<button class="mention-item' + (i === mentionState.index ? " active" : "") + '" role="option" aria-selected="' + (i === mentionState.index) + '" data-mention-index="' + i + '"><span class="mention-file-icon">⌁</span><span class="mention-copy"><strong>' + esc(file.path) + '</strong><small>' + fmtSize(file.size) + '</small></span></button>'
  ).join("");
  menu.hidden = false; mentionState.open = true;
  menu.querySelectorAll(".mention-item").forEach(button => {
    button.onmousedown = e => { e.preventDefault(); chooseMention(Number(button.dataset.mentionIndex)); };
  });
}
async function updateMentionMenu() {
  const input = $("input");
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const match = before.match(/(?:^|\s)@\(?([^()\s]*)$/);
  if (!match) { closeMentionMenu(); return; }
  mentionState.start = before.lastIndexOf("@");
  mentionState.query = match[1] || "";
  if (!state.files.length) await loadFiles();
  mentionState.items = mentionCandidates(mentionState.query);
  mentionState.index = Math.min(mentionState.index, Math.max(0, mentionState.items.length - 1));
  renderMentionMenu();
}
async function attachWorkspaceFile(file, silent = false) {
  const p = typeof file === "string" ? file : file.path;
  if (!p || state.contextFiles.some(item => item.path === p)) return;
  try {
    const data = await api("/api/file?path=" + encodeURIComponent(p));
    state.contextFiles.push({ path: data.path || p, content: String(data.content || "").slice(0, 12000) });
  } catch {
    state.contextFiles.push({ path: p, content: "(binary or large file attached — use workspace tools to inspect it)" });
  }
  renderContext(); if (!silent) toast("Attached " + p);
}
function chooseMention(index) {
  const file = mentionState.items[index];
  const input = $("input");
  if (!file || mentionState.start < 0) return closeMentionMenu();
  const caret = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, mentionState.start) + "@(" + file.path + ") " + input.value.slice(caret);
  const nextCaret = mentionState.start + file.path.length + 4;
  input.setSelectionRange(nextCaret, nextCaret);
  closeMentionMenu(); autosize(); input.focus();
  attachWorkspaceFile(file);
}
async function attachMentionedFiles(text) {
  if (!/@(?:\([^\)]+\)|[^\s]+)/.test(String(text || ""))) return;
  if (!state.files.length) await loadFiles();
  const found = [];
  const pattern = /(?:^|\s)@(?:\(([^)]+)\)|([^\s]+))/g;
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    const candidate = String(match[1] || match[2] || "").replace(/[.,!?;:]+$/, "");
    const file = flattenFiles(state.files).find(item => item.path === candidate) || flattenFiles(state.files).find(item => item.path.split("/").pop() === candidate);
    if (file && !found.some(item => item.path === file.path)) found.push(file);
  }
  for (const file of found) await attachWorkspaceFile(file, true);
}

/* ---------- workspace files / context ---------- */
async function loadFiles() {
  try {
    const data = await api("/api/files");
    state.files = data.files || [];
    renderFileTree();
  } catch { $("fileTree").innerHTML = '<div class="tree-empty">Could not load workspace files.</div>'; }
}
function flattenFiles(nodes, out = []) {
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) flattenFiles(n.children, out);
  }
  return out;
}
function renderFileTree() {
  const q = ($("fileSearch").value || "").toLowerCase();
  const files = flattenFiles(state.files).filter(f => !q || f.path.toLowerCase().includes(q)).slice(0, 120);
  $("fileTree").innerHTML = files.length
    ? files.map(f => '<button class="tree-item" data-path="' + esc(f.path) + '"><span class="t-path">' + esc(f.path) + '</span><span class="t-size">' + fmtSize(f.size) + "</span></button>").join("")
    : '<div class="tree-empty">No matching files.</div>';
  $("fileTree").querySelectorAll(".tree-item").forEach(btn => {
    btn.onclick = async () => {
      const p = btn.dataset.path;
      if (state.contextFiles.some(f => f.path === p)) { toast("Already in context"); return; }
      await attachWorkspaceFile(p);
    };
  });
}
function renderContext() {
  const box = $("contextChips");
  const has = state.contextFiles.length || state.images.length;
  box.hidden = !has;
  box.innerHTML =
    state.images.map((im, i) =>
      '<span class="chip img-chip"><img src="/api/download?path=' + encodeURIComponent(im.path) + '&inline=1" alt=""><span>' + esc(im.name) + '</span><button data-img="' + i + '" aria-label="Remove ' + esc(im.name) + '"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>'
    ).join("") +
    state.contextFiles.map((f, i) =>
      '<span class="chip"><span>' + esc(f.path) + '</span><button data-i="' + i + '" aria-label="Remove ' + esc(f.path) + '"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>'
    ).join("");
  box.querySelectorAll("button[data-i]").forEach(b => {
    b.onclick = () => { state.contextFiles.splice(Number(b.dataset.i), 1); renderContext(); };
  });
  box.querySelectorAll("button[data-img]").forEach(b => {
    b.onclick = () => { state.images.splice(Number(b.dataset.img), 1); renderContext(); };
  });
}

/* ---------- device upload ---------- */
async function uploadFile(file) {
  if (file.size > 20 * 1024 * 1024) { toast("Too large — max 20 MB"); return; }
  toast("Uploading " + file.name + "…");
  const b64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
  const data = await api("/api/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, dataBase64: b64, sessionId: state.session?.id })
  });
  if (data.kind === "image") {
    if (state.mode !== "vision") { setMode("vision"); toast("Switched to Vision mode for image work"); }
    if (!state.images.some(i => i.path === data.path)) state.images.push({ path: data.path, name: data.name });
    renderContext();
  } else if (isTextFile(data.name)) {
    try {
      const fd = await api("/api/file?path=" + encodeURIComponent(data.path));
      state.contextFiles.push({ path: fd.path || data.path, content: String(fd.content || "").slice(0, 12000) });
    } catch {
      state.contextFiles.push({ path: data.path, content: "" });
    }
    renderContext();
    toast("Uploaded " + data.name + " — added to context");
  } else {
    // binary file: keep the path reference, the model can still read it with tools
    state.contextFiles.push({ path: data.path, content: "(binary file uploaded — mention it and Sonderr's tools can read or send it back)" });
    renderContext();
    toast("Uploaded " + data.name + " — attached as a file");
  }
}
async function handleIncomingFiles(files) {
  for (const f of [...(files || [])].slice(0, 4)) {
    try { await uploadFile(f); } catch (err) { toast(err.message || "Upload failed"); }
  }
}

/* ---------- modes ---------- */
function updateComposerForMode() {
  const input = $("input");
  input.placeholder = state.mode === "vision" ? "Ask about the image — or describe an edit…"
    : state.mode === "build" ? "Describe what to build…"
    : state.mode === "plan" ? "What should we plan?"
    : "How can Sonderr help you today?";
}
function setMode(m) {
  if (state.mode === m) { updateComposerForMode(); return; }
  if (m === "vision" && state.apiConfigured && state.models.length) {
    const active = state.settings?.model;
    const activeVision = state.models.find(x => x.id === active)?.vision;
    if (!activeVision) {
      const best = state.models.find(x => x.vision);
      if (best) {
        state.lastGeneralModel = active || "";
        chooseModel(best.id, true);
        toast("Vision needs image input — switched to " + best.label);
      }
    }
  } else if (state.mode === "vision" && m !== "vision" && state.lastGeneralModel) {
    const restore = state.lastGeneralModel;
    state.lastGeneralModel = "";
    if (state.models.some(x => x.id === restore) && state.settings?.model !== restore) chooseModel(restore, true);
  }
  state.mode = m;
  $("modeSeg").querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  renderModelMenu();
  updateComposerForMode();
}

/* ---------- settings modal ---------- */
let settingsTab = "api";
function openSettings(tab) {
  settingsTab = tab || "api";
  $("settingsModal").hidden = false;
  renderSettings();
}
function closeSettings() { $("settingsModal").hidden = true; }
function renderSettings() {
  clearInterval(walletWatchPollTimer);
  walletWatchPollTimer = null;
  document.querySelectorAll(".rail-item").forEach(b => b.classList.toggle("active", b.dataset.tab === settingsTab));
  const body = $("settingsBody");
  const s = state.settings || {};
  if (settingsTab === "api") {
    body.innerHTML = `
      <div class="panel active" id="panelApi">
        <h2>API &amp; Models</h2>
        <p class="panel-sub">Add your API key once — Sonderr discovers every model your provider offers and ranks them automatically.</p>
        <div class="field">
          <label>Provider</label>
          <select id="setProvider">${Object.values(state.providers).filter(p => p.id !== "local").map(p => '<option value="' + esc(p.id) + '"' + (s.provider === p.id ? " selected" : "") + ">" + esc(p.label) + "</option>").join("")}</select>
          <div class="hint">OpenAI-compatible endpoints are all supported — including local runtimes like Ollama.</div>
        </div>
        <div class="field" id="baseURLField">
          <label>Endpoint</label>
          <input type="text" id="setBaseURL" value="${esc(s.baseURL || "")}" placeholder="https://api.example.com/v1" spellcheck="false">
        </div>
        <div class="field">
          <label>API key</label>
          <div class="field-row">
            <input type="password" id="setApiKey" placeholder="${state.apiConfigured ? "Key saved locally — leave blank to keep" : "Paste your API key"}" autocomplete="off" spellcheck="false">
            <button class="btn primary" id="saveKeyBtn">Save key</button>
          </div>
          <div class="hint">Stored only on this machine (<span style="font-family:var(--mono)">~/.sonderr/credentials.json</span>, mode 600) and sent solely to your provider endpoint.</div>
          <div style="margin-top:10px">${state.apiConfigured ? '<span class="pill ok"><span class="dot"></span>Connected</span>' : '<span class="pill bad"><span class="dot"></span>Not configured</span>'}</div>
          <div class="statusline" id="apiKeyStatus"></div>
        </div>
        <div class="model-manage">
          <div class="model-manage-head">
            <span>Available models ${state.models.length ? "· " + state.models.length : ""}</span>
            <button class="mini-btn" id="setRefreshModels" title="Re-discover models"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg></button>
          </div>
          <div class="model-manage-list" id="settingsModelList"></div>
        </div>
        <div class="hint" style="margin-top:8px">Sorted strongest / newest → oldest / lightest. Picking one sets it for all new messages.</div>
        <details class="advanced">
          <summary>Advanced generation</summary>
          <div class="adv-body">
            <div class="field"><label>Temperature</label><input type="number" id="setTemp" min="0" max="2" step="0.1" value="${esc(s.temperature ?? 0.2)}"></div>
            <div class="field"><label>Max tokens</label><input type="number" id="setMaxTokens" min="256" max="32768" step="256" value="${esc(s.maxTokens ?? 8192)}"></div>
            <button class="btn ghost" id="saveAdvBtn">Save advanced</button>
            <div class="statusline" id="advStatus"></div>
          </div>
        </details>
      </div>`;
    $("saveKeyBtn").onclick = saveKeyFromSettings;
    $("setProvider").onchange = async () => {
      const p = state.providers[$("setProvider").value];
      $("setBaseURL").value = p?.baseURL || "";
      await saveSettings({ provider: $("setProvider").value, baseURL: $("setBaseURL").value.trim(), model: "" }, true);
      state.apiConfigured = Boolean(providerHasKey() || $("setProvider").value === "ollama");
      if (state.apiConfigured) await loadModels(true);
      renderSettings();
    };
    $("setRefreshModels").onclick = async () => {
      if (!state.apiConfigured) { toast("Add your API key first"); return; }
      await loadModels(false); renderSettings();
    };
    $("saveAdvBtn").onclick = async () => {
      try {
        await saveSettings({ temperature: Number($("setTemp").value), maxTokens: Number($("setMaxTokens").value) }, true);
        $("advStatus").textContent = "Saved"; $("advStatus").className = "statusline ok";
      } catch (e) { $("advStatus").textContent = e.message; $("advStatus").className = "statusline bad"; }
    };
    renderSettingsModels();
  } else if (settingsTab === "tools") {
    const modes = [
      ["ask", "Ask before tools", "Every tool run needs your approval."],
      ["auto", "Auto-approve", "Reads and file writes run freely; terminal still asks."],
      ["full", "Full workspace access", "All workspace tools run without approval."],
      ["full_pc", "Full PC access", "Terminal commands run on your machine."]
    ];
    body.innerHTML = `
      <div class="panel active">
        <h2>Tools &amp; Access</h2>
        <p class="panel-sub">Control how much of your machine Sonderr may use when the model calls tools.</p>
        <div class="seg-grid">${modes.map(([id, t, d]) => '<button class="seg-card' + (s.approvalMode === id ? " active" : "") + '" data-mode="' + id + '"><strong>' + t + "</strong><small>" + d + "</small></button>").join("")}</div>
        <div class="hint" style="margin-top:14px">Skills are part of the backend, not a setting: relevant playbooks attach to each task automatically, and the model can pull any of them with its <span style="font-family:var(--mono)">load_skill</span> tool.</div>
        <div class="field" style="margin-top:16px">
          <label>Environment path</label>
          <input type="text" id="setEnvPath" value="${esc(s.environmentPath || ".sonderr/environment")}" spellcheck="false">
          <div class="hint">Workspace-relative folder used for generated artifacts.</div>
        </div>
        <div class="statusline" id="toolsStatus"></div>
      </div>`;
    body.querySelectorAll(".seg-card").forEach(card => {
      card.onclick = async () => {
        try {
          await saveSettings({ approvalMode: card.dataset.mode }, true);
          renderSettings(); toast("Access mode: " + card.querySelector("strong").textContent);
        } catch (e) { $("toolsStatus").textContent = e.message; $("toolsStatus").className = "statusline bad"; }
      };
    });
    $("setEnvPath").onchange = async () => {
      try { await saveSettings({ environmentPath: $("setEnvPath").value.trim() || ".sonderr/environment" }, true); toast("Environment path saved"); }
      catch (e) { $("toolsStatus").textContent = e.message; $("toolsStatus").className = "statusline bad"; }
    };
  } else if (settingsTab === "connectors") {
    body.innerHTML = `
      <div class="panel active">
        <h2>Connectors</h2>
        <p class="panel-sub">Connect an MCP server you control. Sonderr only uses a connector after it is configured, connected, and permitted by your access mode.</p>
        <div id="connectorList"><div class="model-empty">Loading connectors…</div></div>
        <details class="advanced" open>
          <summary>Add MCP server</summary>
          <div class="adv-body">
            <div class="field"><label>Name</label><input id="mcpName" placeholder="Gmail, Notion, Roblox Studio" autocomplete="off"></div>
            <div class="field"><label>Server id</label><input id="mcpId" placeholder="gmail" autocomplete="off" spellcheck="false"><div class="hint">Use a stable id such as <span style="font-family:var(--mono)">gmail</span> or <span style="font-family:var(--mono)">notion</span> so chat can recognize the connector.</div></div>
            <div class="field"><label>Transport</label><select id="mcpTransport"><option value="http">Remote HTTP</option><option value="stdio">Local stdio</option></select></div>
            <div class="field" id="mcpUrlField"><label>Remote MCP URL</label><input id="mcpUrl" placeholder="https://example.com/mcp" autocomplete="off" spellcheck="false"><div class="hint">HTTPS is required for remote servers. Localhost HTTP is allowed for local development.</div></div>
            <div class="field" id="mcpCommandField" hidden><label>Local command</label><input id="mcpCommand" placeholder="npx" autocomplete="off" spellcheck="false"><input id="mcpArgs" style="margin-top:7px" placeholder="Arguments, separated by spaces" autocomplete="off" spellcheck="false"><div class="hint">Sonderr starts this process locally and speaks MCP over stdin/stdout.</div></div>
            <div class="field"><label>Token environment variable <span class="muted">(optional)</span></label><input id="mcpTokenEnv" placeholder="GMAIL_MCP_TOKEN" autocomplete="off" spellcheck="false"></div>
            <button class="btn primary" id="mcpAddBtn">Save connector</button><div class="statusline" id="mcpStatus"></div>
          </div>
        </details>
      </div>`;
    const list = $("connectorList");
    const loadConnectors = async () => {
      try {
        const data = await api("/api/connectors");
        const mcpData = await api("/api/mcp");
        const cards = (data.connectors || []).map(c => '<div class="connector-row"><div><strong>' + esc(c.name) + '</strong><small>' + esc(c.description) + '</small></div><span class="pill ' + (c.connected ? "ok" : c.configured ? "" : "bad") + '">' + (c.connected ? "Connected" : c.configured ? "Configured" : "Not configured") + '</span></div>');
        const servers = (mcpData.servers || []).map(s => '<div class="connector-row"><div><strong>' + esc(s.name || s.id) + '</strong><small>' + esc(s.transport + " · " + s.id) + (s.error ? " · " + s.error : "") + '</small></div><span class="pill ' + (s.connected ? "ok" : "") + '">' + (s.connected ? "Connected" : "Saved") + '</span></div>');
        list.innerHTML = cards.concat(servers).join("") || '<div class="model-empty">No connectors configured yet.</div>';
      } catch (e) { list.innerHTML = '<div class="model-empty">' + esc(e.message) + '</div>'; }
    };
    loadConnectors();
    $("mcpTransport").onchange = () => {
      const local = $("mcpTransport").value === "stdio";
      $("mcpUrlField").hidden = local; $("mcpCommandField").hidden = !local;
    };
    $("mcpAddBtn").onclick = async () => {
      const status = $("mcpStatus");
      try {
        status.textContent = "Saving…"; status.className = "statusline";
        const name = $("mcpName").value.trim(), id = $("mcpId").value.trim(), local = $("mcpTransport").value === "stdio", url = $("mcpUrl").value.trim(), command = $("mcpCommand").value.trim();
        if (!name || !id || (local ? !command : !url)) throw new Error(local ? "Name, id, and local command are required" : "Name, id, and remote MCP URL are required");
        const args = local ? $("mcpArgs").value.trim().split(/\s+/).filter(Boolean) : [];
        await api("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, id, url: local ? "" : url, command: local ? command : "", args, tokenEnv: $("mcpTokenEnv").value.trim() }) });
        status.textContent = "Saved. The assistant can connect it when you approve the request."; status.className = "statusline ok";
        loadConnectors();
      } catch (e) { status.textContent = e.message; status.className = "statusline bad"; }
    };
  } else if (settingsTab === "email") {
    body.innerHTML = `
      <div class="panel active">
        <h2>Direct email</h2>
        <p class="panel-sub">Connect an SMTP mailbox without MCP. Sonderr prepares a draft first; nothing is sent until you press Send on the confirmation card.</p>
        <div id="emailConfigStatus" class="statusline">Loading email settings…</div>
        <div class="panel" style="margin:14px 0;padding:16px;background:var(--surface-soft,#f7f9fc)">
          <h3 style="margin:0 0 6px">Gmail OAuth</h3>
          <p class="panel-sub" style="margin-bottom:10px">Connect Gmail once in a Google consent window. Sonderr stores the refresh token locally and can send the onboarding welcome through Gmail. Use a Google <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Desktop OAuth client</a>; only the client ID is required for most desktop clients.</p>
          <div id="gmailStatus" class="statusline">Checking Gmail…</div>
          <div class="field"><label>Google OAuth desktop client ID</label><input id="gmailClientId" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false"></div>
          <div class="field"><label>Client secret (optional for desktop clients)</label><input id="gmailClientSecret" type="password" placeholder="Leave blank if not required" autocomplete="new-password"></div>
          <button class="btn ghost" id="gmailSaveBtn">Save Google client</button>
          <button class="btn primary" id="gmailConnectBtn" style="margin-left:8px">Connect Gmail</button>
          <button class="btn ghost" id="gmailDisconnectBtn" style="margin-left:8px" hidden>Disconnect</button>
        </div>
        <div class="field"><label>Provider preset</label><select id="emailProvider"><option value="">Custom SMTP</option></select><div class="hint">Presets fill connection details only. You still need a verified sender and the provider credential. Headless setup can use <span style="font-family:var(--mono)">SONDERR_EMAIL_PROVIDER</span>, <span style="font-family:var(--mono)">SONDERR_EMAIL_USERNAME</span>, <span style="font-family:var(--mono)">SONDERR_EMAIL_FROM</span>, and protected <span style="font-family:var(--mono)">SONDERR_EMAIL_PASSWORD</span>.</div></div>
        <div class="field"><label>SMTP host</label><input id="emailHost" placeholder="smtp.gmail.com" autocomplete="off" spellcheck="false"></div>
        <div class="field"><label>SMTP port</label><input id="emailPort" type="number" min="1" max="65535" value="587"></div>
        <div class="field"><label>Username / mailbox</label><input id="emailUsername" type="text" placeholder="you@example.com (SendGrid: apikey)" autocomplete="off"></div>
        <div class="field"><label>From address</label><input id="emailFrom" type="email" placeholder="you@example.com" autocomplete="off"><div class="hint">Use the mailbox address or an alias your SMTP provider explicitly allows.</div></div>
        <div class="field"><label>Password or app password</label><input id="emailPassword" type="password" placeholder="Leave blank to keep the saved credential" autocomplete="new-password"><div class="hint">Stored only as <span style="font-family:var(--mono)">SONDERR_EMAIL_PASSWORD</span> in protected <span style="font-family:var(--mono)">~/.sonderr/.env</span>. Never sent to the model.</div></div>
        <label class="check-row"><input id="emailSecure" type="checkbox"><span>Use implicit TLS (usually port 465)</span></label>
        <button class="btn primary" id="emailSaveBtn">Save email access</button>
        <div class="hint" style="margin-top:14px">Safety limits: 1 message/second, 10 recipients/message, 100 messages/hour. Every send requires a visible confirmation.</div>
      </div>`;
    const status = $("emailConfigStatus");
    api("/api/email").then(data => {
      const e = data.email || {};
      const g = data.gmail || {};
      const gmailStatus = $("gmailStatus");
      const gmailConnect = $("gmailConnectBtn");
      const gmailDisconnect = $("gmailDisconnectBtn");
      gmailStatus.textContent = g.connected ? "Connected" + (g.account ? " · " + g.account : "") : (g.configured ? "OAuth client ready · not connected" : "Add a Google OAuth desktop client ID first");
      gmailStatus.className = "statusline " + (g.connected ? "ok" : "bad");
      gmailConnect.disabled = !g.configured;
      gmailDisconnect.hidden = !g.connected;
      gmailConnect.onclick = async () => { try { gmailConnect.disabled = true; gmailConnect.textContent = "Opening Google…"; const auth = await api("/api/gmail/connect"); window.open(auth.url, "sonderr-gmail-oauth", "popup,width=520,height=720"); const started = Date.now(); const poll = setInterval(async () => { try { const result = await api("/api/gmail/status"); if (result.gmail?.connected || Date.now() - started > 120000) { clearInterval(poll); gmailConnect.disabled = false; gmailConnect.textContent = "Connect Gmail"; if (result.gmail?.connected) { gmailStatus.textContent = "Connected" + (result.gmail.account ? " · " + result.gmail.account : ""); gmailStatus.className = "statusline ok"; gmailDisconnect.hidden = false; toast("Gmail connected"); } } } catch {} }, 1500); } catch (err) { gmailConnect.disabled = false; gmailConnect.textContent = "Connect Gmail"; gmailStatus.textContent = err.message; gmailStatus.className = "statusline bad"; } };
      gmailDisconnect.onclick = async () => { try { const result = await api("/api/gmail/disconnect", { method:"POST" }); gmailStatus.textContent = result.gmail?.configured ? "OAuth client ready · not connected" : "Disconnected"; gmailStatus.className = "statusline bad"; gmailDisconnect.hidden = true; toast("Gmail disconnected"); } catch (err) { toast(err.message); } };
      $("gmailSaveBtn").onclick = async () => { try { const result = await api("/api/gmail/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ clientId:$("gmailClientId").value.trim(), clientSecret:$("gmailClientSecret").value }) }); gmailStatus.textContent = result.gmail?.connected ? "Connected" : "OAuth client saved · ready to connect"; gmailStatus.className = "statusline " + (result.gmail?.connected ? "ok" : "bad"); gmailConnect.disabled = false; $("gmailClientSecret").value = ""; toast("Google OAuth client saved locally"); } catch (err) { gmailStatus.textContent = err.message; gmailStatus.className = "statusline bad"; } };
      const presets = Array.isArray(data.providers) ? data.providers : [];
      $("emailProvider").innerHTML = '<option value="">Custom SMTP</option>' + presets.map(p => '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>').join("");
      const matched = presets.find(p => p.host === e.host && Number(p.port) === Number(e.port));
      if (matched) $("emailProvider").value = matched.id;
      $("emailProvider").onchange = () => { const p = presets.find(item => item.id === $("emailProvider").value); if (!p) return; $("emailHost").value = p.host; $("emailPort").value = p.port; $("emailSecure").checked = Boolean(p.secure); };
      $("emailHost").value = e.host || ""; $("emailPort").value = e.port || 587; $("emailUsername").value = e.username || ""; $("emailFrom").value = e.from || ""; $("emailSecure").checked = Boolean(e.secure);
      status.textContent = e.configured ? "SMTP configured · password saved locally" : "Not configured"; status.className = "statusline " + (e.configured ? "ok" : "bad");
    }).catch(e => { status.textContent = e.message; status.className = "statusline bad"; });
    $("emailSaveBtn").onclick = async () => {
      try {
        const payload = { host: $("emailHost").value.trim(), port: Number($("emailPort").value), username: $("emailUsername").value.trim(), from: $("emailFrom").value.trim(), secure: $("emailSecure").checked };
        const password = $("emailPassword").value; if (password) payload.password = password;
        const data = await api("/api/email/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        status.textContent = data.email?.configured ? "Saved · email drafts are ready for confirmation" : "Saved, but a password is still required"; status.className = "statusline " + (data.email?.configured ? "ok" : "bad"); $("emailPassword").value = "";
      } catch (e) { status.textContent = e.message; status.className = "statusline bad"; }
    };
  } else if (settingsTab === "wallet") {
    body.innerHTML = `
      <div class="panel active">
        <h2>Sonderr Wallet</h2>
        <p class="panel-sub">Sonderr generates and protects its own wallets. No external wallet, WalletConnect, RPC URL, or API key is needed. The local runtime connects to public chain RPCs to read balances and broadcast only confirmed transactions.</p>
        <div id="walletConfigStatus" class="statusline">Loading wallet settings…</div>
        <div id="walletAccountRows" class="wallet-asset-list"></div>
        <div class="field wallet-watch-setting"><label><input id="walletWatchEnabled" type="checkbox"> Watch for incoming funds while Sonderr is running</label><div class="hint">Checks public chain balances about once a minute. No API key or external wallet is needed. This is best-effort polling, not a guaranteed alert service.</div><div id="walletWatchStatus" class="statusline">Loading watch status…</div><div id="walletWatchEvents" class="wallet-asset-list"></div></div>
        <div class="field"><label for="walletEvmNetwork">EVM network</label><select id="walletEvmNetwork"><option value="base-mainnet">Base Mainnet</option><option value="ethereum-mainnet">Ethereum Mainnet</option><option value="base-sepolia">Base Sepolia · testnet</option><option value="sepolia">Ethereum Sepolia · testnet</option></select><div class="hint">One EVM address works across these networks. Testnet assets have no real-world value.</div></div>
        <div class="field"><label for="walletSolanaNetwork">Solana cluster</label><select id="walletSolanaNetwork"><option value="solana-mainnet">Solana Mainnet</option><option value="solana-devnet">Solana Devnet · test tokens</option><option value="solana-testnet">Solana Testnet · validator testing</option></select><div class="hint">One Solana address is reused across clusters. Devnet and testnet balances are separate and valueless.</div></div>
        <div class="field"><label>Wallets</label><p class="hint">EVM: ETH and ERC-20/memecoins share one 0x address; the selected network has its own balance. Solana: one separate address for SOL and derived SPL token accounts per mint.</p></div>
        <button class="btn primary" id="walletCreateEvmBtn">Create EVM wallet</button>
        <button class="btn ghost" id="walletCreateSolBtn" style="margin-left:8px">Create Solana wallet</button>
        <div class="field" style="margin-top:14px"><label>Encrypted backup</label><select id="walletBackupChain"><option value="evm">EVM wallet</option><option value="solana">Solana wallet</option></select><button class="btn ghost" id="walletBackupBtn" style="margin-top:8px">Download encrypted backup</button><div class="hint">Back up each wallet before funding it. The backup password is used only for this download and is never stored.</div></div>
        <div class="hint" style="margin-top:14px">The wallet runtime uses public blockchain endpoints to read and broadcast. The AI sees only tool results, never key material. Every send needs your confirmation on the complete transaction card. Sonderr is experimental; keep no more than €100 equivalent and do not use it as your primary wallet.</div>
      </div>`;
    const status = $("walletConfigStatus");
    const networkSelects = { evm: $("walletEvmNetwork"), solana: $("walletSolanaNetwork") };
    const watchStatus = $("walletWatchStatus"), watchToggle = $("walletWatchEnabled"), watchEvents = $("walletWatchEvents");
    const renderWalletWatch = watch => {
      watchToggle.checked = Boolean(watch.enabled); watchToggle.disabled = false;
      watchStatus.textContent = watch.enabled ? (!watch.walletConfigured ? "Enabled · create a local wallet to begin watching" : watch.lastError ? "Watching · latest check had an endpoint issue: " + watch.lastError : "Watching while the Sonderr process is running · last check " + (watch.lastPolledAt ? rel(watch.lastPolledAt) : "starting")) : "Not watching";
      watchStatus.className = "statusline " + (watch.enabled ? (watch.lastError ? "bad" : "ok") : "");
      const rows = (watch.events || []).slice(0, 10);
      watchEvents.innerHTML = rows.map(event => '<div class="wallet-asset-row"><span><b>Balance increase · +' + esc(event.amount || "?") + ' ' + esc(event.symbol || "token") + '</b><small>' + esc(event.network || event.chain || "Network") + (event.tokenAddress ? ' · ' + esc(event.tokenAddress) : '') + '</small><small>' + esc(rel(event.receivedAt)) + ' · observed net change</small></span></div>').join("") || '<div class="wallet-asset-row"><span>No incoming balance changes observed yet.</span></div>';
      for (const event of rows) if (!seenWalletWatchEvents.has(event.id)) {
        seenWalletWatchEvents.add(event.id);
      }
    };
    const refreshWalletWatch = () => api("/api/wallet/watch").then(data => renderWalletWatch(data.watch || {})).catch(error => { watchStatus.textContent = error.message; watchStatus.className = "statusline bad"; });
    refreshWalletWatch();
    watchToggle.onchange = async () => {
      watchToggle.disabled = true;
      try { const data = await api("/api/wallet/watch", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ enabled:watchToggle.checked }) }); renderWalletWatch(data.watch || {}); }
      catch (error) { watchToggle.checked = !watchToggle.checked; watchToggle.disabled = false; watchStatus.textContent = error.message; watchStatus.className = "statusline bad"; }
    };
    walletWatchPollTimer = setInterval(refreshWalletWatch, 30_000);
    api("/api/wallet").then(data => {
      const w = data.wallet || {};
      const accounts = Array.isArray(w.accounts) ? w.accounts : [], hasEvm = accounts.some(a => a.chain === "evm"), hasSolana = accounts.some(a => a.chain === "solana");
      for (const chain of ["evm", "solana"]) if (w.activeNetworks?.[chain]) networkSelects[chain].value = w.activeNetworks[chain];
      status.textContent = accounts.length ? (hasEvm ? "EVM wallet ready" : "") + (hasEvm && hasSolana ? " · " : "") + (hasSolana ? "Solana wallet ready" : "") + " · network-specific addresses and balances available in chat" : "No local wallet yet · choose networks before creating your wallets";
      status.className = "statusline " + (accounts.length ? "ok" : "bad");
      $("walletAccountRows").innerHTML = accounts.map(a => '<div class="wallet-asset-row"><span><b>' + esc(a.network) + (a.testnet ? ' <i>TESTNET</i>' : '') + '</b><small class="wallet-address-value">' + esc(a.address) + '</small></span></div>').join("");
      $("walletCreateEvmBtn").disabled = hasEvm; $("walletCreateSolBtn").disabled = hasSolana;
      $("walletBackupChain").innerHTML = (hasEvm ? '<option value="evm">EVM wallet</option>' : '') + (hasSolana ? '<option value="solana">Solana wallet</option>' : '');
      $("walletBackupBtn").disabled = !accounts.length;
    }).catch(e => { status.textContent = e.message; status.className = "statusline bad"; });
    for (const [chain, select] of Object.entries(networkSelects)) select.onchange = async () => {
      select.disabled = true;
      try {
        const data = await api("/api/wallet/network", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({chain,network:select.value}) });
        const active = data.wallet?.activeNetworks?.[chain]; if (active) select.value = active;
        status.textContent = "Selected " + select.options[select.selectedIndex].text + " · balances and sends stay isolated to this network"; status.className = "statusline ok";
      } catch (e) { status.textContent = e.message; status.className = "statusline bad"; }
      finally { select.disabled = false; }
    };
    const createLocalWallet = async (chain) => {
      try {
        const network = networkSelects[chain].value;
        await api("/api/wallet/create", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ chain, network }) });
        renderSettings(); toast("Local " + (chain === "solana" ? "Solana" : "EVM") + " wallet created · download its backup before funding");
      } catch (e) { status.textContent = e.message; status.className = "statusline bad"; }
    };
    $("walletCreateEvmBtn").onclick = () => createLocalWallet("evm");
    $("walletCreateSolBtn").onclick = () => createLocalWallet("solana");
    $("walletBackupBtn").onclick = async () => {
      const password = window.prompt("Create a backup password (12+ characters). Sonderr will never store it:");
      if (!password) return;
      try { const response = await fetch("/api/wallet/export", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password, chain:$("walletBackupChain").value}) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Backup failed"); const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"}); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "sonderr-wallet-" + data.chain + "-backup.json"; link.click(); URL.revokeObjectURL(link.href); toast("Encrypted wallet backup downloaded"); } catch (e) { status.textContent = e.message; status.className = "statusline bad"; }
    };
  } else {
    body.innerHTML = `
      <div class="panel active">
        <h2>About</h2>
        <p class="panel-sub">Sonderr is a privacy-first local AI workspace with optional Web3 capabilities. The terminal only launches it — the browser is the product.</p>
        <div class="about-rows">
          <div class="about-row"><span>Version</span><b>1.5.4</b></div>
          <div class="about-row"><span>Workspace</span><b title="${esc(state.workspace)}">${esc(state.workspace || "—")}</b></div>
          <div class="about-row"><span>Runtime</span><b>Node ${esc(state.nodeVersion || "")} · localhost</b></div>
          <div class="about-row"><span>API status</span><b>${state.apiConfigured ? "Connected" : "Not configured"}</b></div>
          <div class="about-row"><span>Models discovered</span><b>${state.models.length || "—"}</b></div>
          <div class="about-row"><span>Skills</span><b>${state.skillsCount != null ? state.skillsCount + " playbooks · auto-loaded per task" : "—"}</b></div>
          <div class="about-row"><span>Data folder</span><b style="font-family:var(--mono)">~/.sonderr</b></div>
        </div>
        <div class="links" style="margin-top:16px"><a class="btn ghost" href="/docs" target="_blank" rel="noopener">Open docs &amp; safety handbook</a><a class="btn ghost" href="/docs/bounty" target="_blank" rel="noopener">Bounty program</a><a class="btn ghost" href="/docs/developer" target="_blank" rel="noopener">Developer program</a></div>
        <div class="brand-note"><img src="/assets/sonderr-mark-128.png" alt=""><p><strong>Sonderr blue &amp; white.</strong> Privacy-first local AI for building, with Web3 when you choose it. Keys stay on your machine.</p></div>
      </div>`;
  }
}
function renderSettingsModels() {
  const box = $("settingsModelList");
  if (!box) return;
  if (state.modelsLoading) { box.innerHTML = '<div class="model-empty">Discovering models…</div>'; return; }
  if (!state.apiConfigured) { box.innerHTML = '<div class="model-empty">Add your API key above — models appear here automatically.</div>'; return; }
  if (state.modelsError) { box.innerHTML = '<div class="model-empty">' + esc(state.modelsError) + "</div>"; return; }
  const active = state.settings?.model;
  box.innerHTML = state.models.slice(0, 40).map(m =>
    '<button class="mm-item' + (m.id === active ? " selected" : "") + '" data-id="' + esc(m.id) + '"><span class="radio"></span><span class="mi-copy"><span class="mi-label">' + esc(m.label) + "</span><span class='mi-sub'>" + esc(m.id) + (m.snapshot ? " · " + m.snapshot : "") + "</span></span>" + (m.small ? '<span class="mi-badge small">small</span>' : "") + "</button>"
  ).join("") || '<div class="model-empty">No models returned.</div>';
  box.querySelectorAll(".mm-item").forEach(item => {
    item.onclick = () => chooseModel(item.dataset.id);
  });
}
function providerHasKey() { return state.apiConfigured; }
async function saveKeyFromSettings() {
  const status = $("apiKeyStatus"), key = $("setApiKey").value.trim();
  if (!key) { status.textContent = "Paste a key first (or leave blank to keep the saved one)."; status.className = "statusline bad"; return; }
  status.textContent = "Saving & discovering models…"; status.className = "statusline";
  $("saveKeyBtn").disabled = true;
  try {
    await saveSettings({
      apiKey: key,
      provider: $("setProvider").value,
      baseURL: $("setBaseURL").value.trim(),
      model: state.settings?.model || ""
    }, true);
    state.apiConfigured = true;
    status.textContent = "Key saved — discovering models…"; status.className = "statusline ok";
    await loadModels(true);
    status.textContent = "Connected · " + state.models.length + " models discovered automatically";
    status.className = "statusline ok";
    $("setApiKey").value = "";
    renderSettings(); renderModelBtn(); renderModelMenu();
    toast("API connected — models loaded automatically");
  } catch (e) {
    status.textContent = e.message; status.className = "statusline bad";
  } finally { $("saveKeyBtn").disabled = false; }
}
async function saveSettings(patch, silent) {
  const s = state.settings || {};
  const payload = {
    provider: patch.provider || s.provider || "openai",
    baseURL: patch.baseURL ?? s.baseURL ?? "",
    model: patch.model ?? s.model ?? "",
    temperature: patch.temperature ?? s.temperature ?? 0.2,
    maxTokens: patch.maxTokens ?? s.maxTokens ?? 8192,
    approvalMode: patch.approvalMode ?? s.approvalMode ?? "ask",
    environmentPath: patch.environmentPath ?? s.environmentPath ?? ".sonderr/environment"
  };
  if (patch.apiKey) payload.apiKey = patch.apiKey;
  const data = await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  state.settings = data.settings || { ...s, ...payload };
  if (Object.prototype.hasOwnProperty.call(data, "apiConfigured")) state.apiConfigured = data.apiConfigured;
  if (!silent) toast("Settings saved");
  renderModelBtn();
  return data;
}

/* ---------- popover / event wiring ---------- */
function closePopovers() {
  $("modelMenu").hidden = true; $("attachMenu").hidden = true;
  $("modelBtn").setAttribute("aria-expanded", "false");
  closeMentionMenu();
  closeCommandMenu();
}
function closeMobileNav() { $("sidebar").classList.remove("open"); $("scrim").hidden = true; }
function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 180) + "px";
}
function wire() {
  $("newTaskBtn").onclick = newTask;
  $("settingsBtn").onclick = () => { openSettings("api"); closeMobileNav(); };
  $("settingsClose").onclick = closeSettings;
  $("settingsModal").addEventListener("click", e => { if (e.target === $("settingsModal")) closeSettings(); });
  document.querySelectorAll(".rail-item").forEach(b => b.onclick = () => { settingsTab = b.dataset.tab; renderSettings(); });

  $("modelBtn").onclick = e => {
    e.stopPropagation();
    const menu = $("modelMenu");
    const willOpen = menu.hidden;
    closePopovers();
    if (willOpen) {
      if (!state.apiConfigured) { openSettings("api"); return; }
      menu.hidden = false; $("modelBtn").setAttribute("aria-expanded", "true");
      $("modelMenuList").querySelectorAll(".model-item").forEach(item => item.onclick = () => { chooseModel(item.dataset.id); closePopovers(); });
    }
  };
  $("modelRefreshBtn").onclick = async e => {
    e.stopPropagation();
    $("modelRefreshBtn").classList.add("spin");
    await loadModels(false);
    $("modelRefreshBtn").classList.remove("spin");
  };

  $("attachBtn").onclick = e => {
    e.stopPropagation();
    const menu = $("attachMenu");
    const willOpen = menu.hidden;
    closePopovers();
    if (willOpen) { menu.hidden = false; $("fileSearch").focus(); }
  };
  $("fileSearch").oninput = renderFileTree;

  document.addEventListener("click", e => {
    if (!e.target.closest(".model-picker") && !e.target.closest(".attach-menu")) closePopovers();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closePopovers(); closeSettings(); closeMobileNav(); closeArtifact(); }
  });

  $("modeSeg").querySelectorAll(".mode-btn").forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
  });

  $("uploadBtn").onclick = () => $("fileInput").click();
  $("fileInput").onchange = async (e) => {
    const files = [...(e.target.files || [])];
    closePopovers();
    await handleIncomingFiles(files);
    e.target.value = "";
  };

  // paste images/files straight into the composer (Claude-style)
  window.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    handleIncomingFiles(files);
  });

  // drag & drop files anywhere in the window
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    dragDepth++;
    $("dropZone").hidden = false;
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $("dropZone").hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    $("dropZone").hidden = true;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handleIncomingFiles(files);
  });

  // artifact panel controls
  $("apClose").onclick = closeArtifact;
  $("apCopy").onclick = async () => {
    const p = state.artifact;
    if (!p) return;
    try {
      const text = state.artifactText || await fetchFileText(p.path);
      await navigator.clipboard.writeText(text);
      toast("Copied file content");
    } catch (e) { toast("Copy failed — use Download instead"); }
  };

  $("sendBtn").onclick = send;
  $("input").addEventListener("input", e => {
    autosize(); updateCommandMenu();
    if (!commandState.open) updateMentionMenu();
  });
  $("input").addEventListener("keydown", e => {
    if (commandState.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (commandState.items.length) {
        commandState.index = (commandState.index + (e.key === "ArrowDown" ? 1 : -1) + commandState.items.length) % commandState.items.length;
        renderCommandMenu();
      }
      return;
    }
    if (commandState.open && (e.key === "Enter" || e.key === "Tab") && commandState.items.length) {
      e.preventDefault(); chooseCommand(commandState.index); return;
    }
    if (commandState.open && e.key === "Escape") { e.preventDefault(); closeCommandMenu(); return; }
    if (mentionState.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (mentionState.items.length) {
        mentionState.index = (mentionState.index + (e.key === "ArrowDown" ? 1 : -1) + mentionState.items.length) % mentionState.items.length;
        renderMentionMenu();
      }
      return;
    }
    if (mentionState.open && (e.key === "Enter" || e.key === "Tab") && mentionState.items.length) {
      e.preventDefault(); chooseMention(mentionState.index); return;
    }
    if (mentionState.open && e.key === "Escape") { e.preventDefault(); closeMentionMenu(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  $("menuBtn").onclick = () => {
    const open = !$("sidebar").classList.contains("open");
    $("sidebar").classList.toggle("open", open); $("scrim").hidden = !open;
  };
  $("scrim").onclick = closeMobileNav;

  document.addEventListener("click", e => {
    const btn = e.target.closest(".copy");
    if (!btn) return;
    navigator.clipboard.writeText(btn.dataset.code || "").then(() => {
      btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy"; }, 1400);
    }).catch(() => toast("Copy failed"));
  });

  document.querySelectorAll(".suggestion").forEach(chip => {
    chip.onclick = () => {
      if (chip.dataset.vision) {
        setMode("vision");
        toast("Vision mode — attach an image with + and ask away");
        $("input").focus();
        return;
      }
      $("input").value = chip.dataset.prompt; autosize(); $("input").focus();
    };
  });
}

wire();
boot();
setInterval(refreshOpenTaskProgress, 8000);
let walletWatchNoticeInitialized = false;
async function refreshWalletWatchNotices() {
  try {
    const { watch } = await api("/api/wallet/watch");
    for (const event of watch?.events || []) {
      if (seenWalletWatchEvents.has(event.id)) continue;
      seenWalletWatchEvents.add(event.id);
      if (walletWatchNoticeInitialized && watch.enabled) toast("Wallet observed +" + String(event.amount || "") + " " + String(event.symbol || "token"));
    }
    walletWatchNoticeInitialized = true;
  } catch {}
}
setInterval(refreshWalletWatchNotices, 30_000);
