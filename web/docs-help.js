"use strict";

(() => {
  const page = document.body.dataset.programAssistant;
  if (!new Set(["bounty", "developer"]).has(page)) return;
  const title = page === "bounty" ? "Bounty Program Guide" : "Developer Program Guide";
  const key = `sonderr.docs-helper.${page}.session`;
  const starters = page === "bounty"
    ? ["What's in scope?", "How do I report privately?", "How long does triage take?"]
    : ["How do I make my first contribution?", "What can I work on?", "Are contributions paid?"];
  let sessionId = "";
  let busy = false;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const root = make("div", "docs-helper-root");
  const launch = make("button", "docs-helper-launch");
  launch.type = "button";
  launch.setAttribute("aria-expanded", "false");
  launch.setAttribute("aria-label", `Open ${title}`);
  launch.append(make("span", "docs-helper-avatar", "◈"), make("span", "", "Ask Sonderr"));
  const panel = make("section", "docs-helper-panel");
  panel.hidden = true;
  panel.setAttribute("aria-label", title);
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("role", "dialog");
  const head = make("header", "docs-helper-head");
  head.append(make("span", "docs-helper-avatar", "◈"));
  const heading = make("div", "docs-helper-title");
  heading.append(make("strong", "", title), make("span", "", "Local program help · AI assistant"));
  const close = make("button", "docs-helper-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close help assistant");
  head.append(heading, close);
  const warning = make("div", "docs-helper-warning", page === "bounty"
    ? "Please don’t paste secrets, personal data, exploit steps, or private proof-of-concept details here. Use the private reporting contact on this page."
    : "This helper explains the contribution program. It can’t approve work, promise review, or offer payment.");
  const messages = make("div", "docs-helper-messages");
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");
  const status = make("div", "docs-helper-status");
  status.setAttribute("aria-live", "polite");
  const chips = make("div", "docs-helper-starters");
  for (const prompt of starters) {
    const chip = make("button", "", prompt);
    chip.type = "button";
    chip.addEventListener("click", () => send(prompt));
    chips.append(chip);
  }
  const form = make("form", "docs-helper-form");
  const input = make("textarea");
  input.rows = 1;
  input.maxLength = 2500;
  input.setAttribute("aria-label", "Ask a question about this program");
  input.placeholder = page === "bounty" ? "Ask about scope or reporting…" : "Ask about contributing…";
  const sendButton = make("button", "", "↑");
  sendButton.type = "submit";
  sendButton.setAttribute("aria-label", "Send question");
  form.append(input, sendButton);
  const foot = make("div", "docs-helper-foot");
  foot.append(document.createTextNode("Your chat is saved locally and sent to the AI provider configured in Sonderr. "));
  if (page === "bounty") {
    const link = make("a", "", "Private report contacts");
    link.href = "/docs/bounty#report";
    foot.append(link);
  } else {
    const link = make("a", "", "Ask the community");
    link.href = "https://discord.gg/wEz5j8VC";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    foot.append(link);
  }
  panel.append(head, warning, messages, status, chips, form, foot);
  root.append(panel, launch);
  document.body.append(root);

  function addMessage(text, role, pending = false) {
    const bubble = make("div", `docs-helper-message ${role}${pending ? " pending" : ""}`, text);
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function setOpen(open) {
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", String(open));
    if (open) input.focus(); else launch.focus();
  }
  launch.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
  form.addEventListener("submit", event => { event.preventDefault(); send(input.value); });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });

  async function ensureSession() {
    if (sessionId) return sessionId;
    try { sessionId = localStorage.getItem(key) || ""; } catch {}
    if (sessionId) {
      const check = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { headers: { Accept: "application/json" } });
      if (check.ok) {
        const data = await check.json();
        for (const message of data.session?.messages || []) {
          if (["user", "assistant"].includes(message.role)) addMessage(message.content || "", message.role);
        }
        return sessionId;
      }
      sessionId = "";
    }
    const response = await fetch("/api/sessions", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: `${title} · ${new Date().toLocaleDateString()}` })
    });
    if (!response.ok) throw new Error("Could not start the local help chat. Please try again.");
    const data = await response.json();
    sessionId = data.session?.id || "";
    if (!sessionId) throw new Error("The local help chat did not start correctly.");
    try { localStorage.setItem(key, sessionId); } catch {}
    addMessage(page === "bounty"
      ? "Hi, I can explain the published scope, process, and target timelines. Please keep sensitive report details out of this chat."
      : "Hi, I can help you find a contribution path and understand the published review process. What are you hoping to work on?", "assistant");
    return sessionId;
  }

  async function send(raw) {
    const text = String(raw || "").trim();
    if (!text || busy) return;
    busy = true;
    input.value = "";
    sendButton.disabled = true;
    chips.hidden = true;
    status.textContent = "Checking the program guide…";
    let pending = null;
    try {
      const id = await ensureSession();
      addMessage(text, "user");
      pending = addMessage("Looking through the current program docs…", "assistant", true);
      const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ content: text, mode: "ask", docsAssistant: page })
      });
      const rawEvents = await response.text();
      if (!response.ok) throw new Error("The help agent could not answer in this build. Check that Sonderr has an AI provider configured, then retry.");
      let answer = "";
      for (const line of rawEvents.split(/\r?\n/)) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.event === "final") answer = event.message || "I couldn't find that in the program docs. Try asking about a specific section.";
          else if (event.event === "error") answer = event.message || "The local help agent hit an error.";
        } catch {}
      }
      pending.remove();
      addMessage(answer || "I couldn't find a grounded answer in the current program docs. The page links show the published contact and contribution paths.", "assistant");
      status.textContent = "Answers are based on the local program docs.";
    } catch (error) {
      pending?.remove();
      addMessage(error.message || "The local help agent is temporarily unavailable.", "assistant");
      status.textContent = "Try again in a moment.";
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  }
})();
