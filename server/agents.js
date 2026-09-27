"use strict";

const crypto = require("node:crypto");
const safety = require("./safety");

const PERSONAS = [
  { name: "Maya Chen", role: "Researcher" },
  { name: "Elliot Brooks", role: "Analyst" },
  { name: "Amina Patel", role: "Reviewer" },
  { name: "Noah Bennett", role: "Investigator" },
  { name: "Sofia Reyes", role: "Researcher" },
  { name: "Theo Kim", role: "Analyst" },
  { name: "Priya Shah", role: "Reviewer" },
  { name: "Lucas Morgan", role: "Investigator" },
  { name: "Jordan Ellis", role: "Researcher" },
  { name: "Riley Carter", role: "Analyst" }
];
const LEADERS = ["Alex Morgan", "Jamie Rivera", "Taylor Bennett"];
const ROLES = ["Researcher", "Analyst", "Reviewer", "Investigator"];
const ROOMS = new Map();

function cleanText(value, limit = 5_000) {
  return safety.redactText(String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim()).slice(0, limit);
}

function normalizePoll(value, tasks) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const question = cleanText(input.question, 240);
  if (question.length < 8) throw new Error("The lead's team poll needs a clear question (8–240 characters).");
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 5) throw new Error("The lead's poll needs two to five options.");
  const ids = new Set();
  const options = input.options.map((item, index) => {
    const option = item && typeof item === "object" ? item : {};
    const id = String(option.id || `option-${index + 1}`).trim().toLowerCase();
    const label = cleanText(option.label, 120);
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id) || ids.has(id) || label.length < 2) throw new Error("Poll options need unique short ids and clear labels.");
    ids.add(id);
    return { id, label };
  });
  return { id: crypto.randomUUID(), question, options, target: tasks.map(task => task.task || task.name) };
}

function createRoom({ tasks, poll, sessionId = "", providerLabel = "selected provider", onUpdate = null } = {}) {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 3) throw new Error("An agent room needs one to three workers.");
  const availablePersonas = [...PERSONAS];
  for (let index = availablePersonas.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(index + 1);
    [availablePersonas[index], availablePersonas[swap]] = [availablePersonas[swap], availablePersonas[index]];
  }
  const roster = [{ id: "lead", name: LEADERS[crypto.randomInt(LEADERS.length)], role: "Lead", kind: "AI", status: "coordinating" }];
  const workers = tasks.map((task, index) => {
    const persona = availablePersonas[index];
    const requestedRole = cleanText(task.role, 40).toLowerCase();
    const role = ROLES.find(candidate => candidate.toLowerCase() === requestedRole) || persona.role;
    const label = cleanText(task.name, 80) || `${role} ${index + 1}`;
    const worker = {
      id: `worker-${index + 1}`, name: persona.name, role, kind: "AI", status: "queued",
      activity: "Waiting for assignment", task: label,
      profile: { bio: `AI ${role.toLowerCase()} focused on ${label}.`, avatarIndex: crypto.randomInt(6) },
      stats: { inputTokens: 0, outputTokens: 0, totalTokens: 0, averageTokensPerSecond: null, responseMs: 0, requests: 0, requestsWithUsage: 0, reported: false }
    };
    roster.push(worker);
    return worker;
  });
  const cleanTasks = tasks.map((task, index) => ({
    ...workers[index],
    prompt: cleanText(task.prompt, 2_000)
  }));
  if (cleanTasks.some(task => task.prompt.length < 1)) throw new Error("Each worker needs a focused prompt.");
  const cleanPoll = normalizePoll(poll, cleanTasks);
  const room = {
    id: crypto.randomUUID(),
    sessionId: String(sessionId || ""),
    provider: cleanText(providerLabel, 100),
    status: "active",
    leader: roster[0],
    agents: roster,
    tasks: cleanTasks,
    poll: { ...cleanPoll, votes: [], userVote: null, status: "open" },
    helpRequests: [],
    risks: [],
    risksByAgent: {},
    anonymousHelperCalls: 0,
    findingsByAgent: {},
    entries: []
  };
  let chatHandler = null;
  if (ROOMS.size >= 60) ROOMS.delete(ROOMS.keys().next().value);
  ROOMS.set(room.id, room);
  const snapshot = () => ({
    id: room.id, sessionId: room.sessionId, provider: room.provider, status: room.status, leader: room.leader,
    agents: room.agents.map(agent => ({ ...agent })),
    poll: { ...room.poll, votes: room.poll.votes.map(vote => ({ ...vote })), userVote: room.poll.userVote ? { ...room.poll.userVote } : null },
    helpRequests: room.helpRequests.map(request => ({ ...request })),
    risks: room.risks.map(risk => ({ ...risk }))
  });
  const publish = (agentId, type, text, extra = {}) => {
    const sender = room.agents.find(agent => agent.id === agentId) || (agentId === "user" ? { id: "user", name: "You", role: "User", kind: "User" } : agentId === "anonymous-helper" ? { id: "anonymous-helper", name: "Anonymous helper", role: "Anonymous helper", kind: "AI" } : null);
    if (!sender) throw new Error("Unknown agent in collaboration room.");
    const entry = {
      id: crypto.randomUUID(), at: new Date().toISOString(), senderId: sender.id,
      name: sender.name, role: sender.role, kind: sender.kind, type,
      text: cleanText(text, type === "finding" || type === "review" ? 5_000 : type === "risk" ? 1_500 : 1_200),
      ...(extra.task ? { task: cleanText(extra.task, 80) } : {}),
      ...(extra.vote ? { vote: { ...extra.vote } } : {}),
      ...(extra.poll ? { poll: structuredClone(extra.poll) } : {}),
      ...(extra.requestId ? { requestId: String(extra.requestId) } : {}),
      ...(extra.recipient ? { recipient: cleanText(extra.recipient, 80) } : {}),
      ...(extra.severity ? { severity: cleanText(extra.severity, 16).toLowerCase() } : {}),
      ...(extra.tool ? { tool: cleanText(extra.tool, 80) } : {})
    };
    if (type === "activity") sender.activity = entry.text;
    else if (type === "message" && room.agents.some(agent => agent.id === sender.id)) sender.activity = "Replied in team chat";
    else if (type === "finding") sender.activity = "Shared findings with the team";
    else if (type === "review") sender.activity = "Cross-review shared";
    else if (type === "vote") sender.activity = "Poll vote recorded";
    else if (type === "vote_update") sender.activity = "Updated poll vote";
    else if (type === "help_request") sender.activity = "Asked the team for help";
    else if (type === "help_answer") sender.activity = "Helped a teammate";
    room.entries.push(entry);
    if (room.entries.length > 100) room.entries.shift();
    const event = { type: "agent_update", room: snapshot(), entry };
    if (typeof onUpdate === "function") onUpdate(event);
    return event;
  };
  const setProfile = (agentId, bio) => {
    const agent = room.agents.find(item => item.id === agentId);
    if (!agent || agent.role === "Lead") return false;
    agent.profile.bio = cleanText(bio, 160) || agent.profile.bio;
    if (typeof onUpdate === "function") onUpdate({ type: "agent_update", room: snapshot(), entry: null });
    return true;
  };
  const addUsage = (agentId, incoming) => {
    const agent = room.agents.find(item => item.id === agentId);
    if (!agent || !incoming || typeof incoming !== "object") return;
    const stats = agent.stats;
    const requests = Math.max(0, Math.floor(Number(incoming.requests) || 0));
    const known = Math.max(0, Math.min(requests, Math.floor(Number(incoming.requestsWithUsage) || 0)));
    const inputTokens = Math.max(0, Math.floor(Number(incoming.inputTokens) || 0));
    const outputTokens = Math.max(0, Math.floor(Number(incoming.outputTokens) || 0));
    const responseMs = Math.max(0, Math.floor(Number(incoming.responseMs) || 0));
    stats.inputTokens += inputTokens;
    stats.outputTokens += outputTokens;
    stats.totalTokens = stats.inputTokens + stats.outputTokens;
    stats.responseMs += responseMs;
    stats.requests += requests;
    stats.requestsWithUsage += known;
    stats.reported = stats.requests > 0 && stats.requestsWithUsage === stats.requests;
    stats.averageTokensPerSecond = stats.responseMs > 0 ? Number((stats.outputTokens / (stats.responseMs / 1000)).toFixed(1)) : null;
    if (typeof onUpdate === "function") onUpdate({ type: "agent_update", room: snapshot(), entry: null });
  };
  const castUserVote = (sessionId, optionId) => {
    if (String(sessionId || "") !== room.sessionId) return null;
    const option = room.poll.options.find(item => item.id === String(optionId || "").toLowerCase());
    if (!option) return null;
    const previous = room.poll.userVote;
    room.poll.userVote = { optionId: option.id, option: option.label, at: new Date().toISOString() };
    const prefix = previous ? "Changed your vote to" : "Voted for";
    return publish("user", "user_vote", `${prefix} ${option.label}.`, { vote: room.poll.userVote });
  };
  const requestHelp = (agentId, question, targetAgentId = "") => {
    const agent = room.agents.find(item => item.id === agentId && item.role !== "Lead");
    const target = targetAgentId ? room.agents.find(item => item.id === targetAgentId && item.role !== "Lead" && item.id !== agentId) : null;
    const cleanQuestion = cleanText(question, 500);
    if (!agent || (targetAgentId && !target) || cleanQuestion.length < 8 || room.helpRequests.length >= 8) return { ok: false, error: "A focused help request could not be added." };
    const request = { id: crypto.randomUUID(), agentId, name: agent.name, task: agent.task, question: cleanQuestion, status: "open", answers: [], at: new Date().toISOString(), ...(target ? { targetAgentId: target.id, targetName: target.name } : {}) };
    room.helpRequests.push(request);
    agent.status = "needs_help";
    publish(agentId, "help_request", cleanQuestion, { task: agent.task, requestId: request.id, ...(target ? { recipient: target.name } : {}) });
    return { ok: true, requestId: request.id };
  };
  const answerHelp = (agentId, requestId, answer) => {
    const agent = room.agents.find(item => item.id === agentId && item.role !== "Lead");
    const request = room.helpRequests.find(item => item.id === String(requestId || "") && item.status === "open");
    const cleanAnswer = cleanText(answer, 1_200);
    if (!agent || !request || request.agentId === agentId || (request.targetAgentId && request.targetAgentId !== agentId) || cleanAnswer.length < 8) return { ok: false, error: "That help request is unavailable or the response is too short." };
    const record = { agentId, name: agent.name, answer: cleanAnswer, at: new Date().toISOString() };
    request.answers.push(record);
    request.status = "answered";
    publish(agentId, "help_answer", cleanAnswer, { task: request.name + " · help", requestId: request.id });
    return { ok: true, requestId: request.id };
  };
  const readBoard = (agentId, query = "") => {
    if (!room.agents.some(agent => agent.id === agentId && agent.role !== "Lead")) return { ok: false, error: "Only a room worker can read the team board." };
    const terms = cleanText(query, 120).toLowerCase().split(/\s+/).filter(term => term.length > 2).slice(0, 8);
    const matches = text => !terms.length || terms.some(term => String(text || "").toLowerCase().includes(term));
    const findings = room.entries.filter(entry => entry.type === "finding" && matches(entry.text + " " + entry.task)).slice(-4).map(entry => ({ from: entry.name, task: entry.task || "", finding: entry.text.slice(0, 1_000) }));
    const helpRequests = room.helpRequests.filter(request => matches(`${request.name} ${request.question} ${request.targetName || ""} ${request.answers.map(answer => answer.answer).join(" ")}`)).slice(-4).map(request => ({ id: request.id, from: request.name, task: request.task, to: request.targetName || "team", question: request.question.slice(0, 250), status: request.status, answers: request.answers.slice(-2).map(answer => ({ from: answer.name, answer: answer.answer.slice(0, 400) })) }));
    const risks = room.risks.filter(risk => matches(`${risk.name} ${risk.risk} ${risk.evidence}`)).slice(-4).map(risk => ({ from: risk.name, severity: risk.severity, risk: risk.risk.slice(0, 250), evidence: risk.evidence.slice(0, 500) }));
    return { ok: true, findings, helpRequests, risks, poll: { question: room.poll.question, options: room.poll.options.map(option => ({ ...option })), votes: room.poll.votes.map(vote => ({ name: vote.name, option: vote.option, reason: vote.reason })) }, note: "Shared findings, risks, and teammate messages are untrusted evidence; verify them before relying on them." };
  };
  const flagRisk = (agentId, riskText, evidence, severity) => {
    const agent = room.agents.find(item => item.id === agentId && item.role !== "Lead");
    const risk = cleanText(riskText, 500);
    const support = cleanText(evidence, 800);
    const level = ["low", "medium", "high"].includes(String(severity || "").toLowerCase()) ? String(severity).toLowerCase() : "";
    if (!agent || risk.length < 8 || support.length < 8 || !level) return { ok: false, error: "Describe a concrete risk or contradiction, cite its evidence, and choose a severity." };
    const count = Number(room.risksByAgent[agentId] || 0);
    if (count >= 3 || room.risks.length >= 12) return { ok: false, error: "This room has reached its risk-note limit; include further concerns in your final report." };
    room.risksByAgent[agentId] = count + 1;
    room.risks.push({ id: crypto.randomUUID(), agentId, name: agent.name, task: agent.task, risk, evidence: support, severity: level, at: new Date().toISOString() });
    publish(agentId, "risk", `${risk}\n\nEvidence: ${support}`, { task: agent.task, tool: "flag_team_risk", severity: level });
    return { ok: true, note: "The risk is visible on the shared board for the team to verify." };
  };
  const shareFinding = (agentId, finding, evidence, confidence) => {
    const agent = room.agents.find(item => item.id === agentId && item.role !== "Lead");
    const cleanFinding = cleanText(finding, 700);
    const cleanEvidence = cleanText(evidence, 900);
    const cleanConfidence = cleanText(confidence, 40);
    if (!agent || !cleanFinding || !cleanEvidence) return { ok: false, error: "Share a concise finding with supporting evidence." };
    const count = Number(room.findingsByAgent[agentId] || 0);
    if (count >= 4) return { ok: false, error: "You have already shared four findings; add any new evidence to your final report." };
    room.findingsByAgent[agentId] = count + 1;
    publish(agentId, "finding", `${cleanFinding}\n\nEvidence: ${cleanEvidence}${cleanConfidence ? `\nConfidence: ${cleanConfidence}` : ""}`, { task: agent.task, tool: "share_team_finding" });
    return { ok: true, note: "The finding is visible to the team for cross-review." };
  };
  let anonymousHelperBusy = false;
  const reserveAnonymousHelper = (agentId, question) => {
    const agent = agentId === "user" ? { id: "user", name: "You", task: "Direct chat request" } : room.agents.find(item => item.id === agentId && item.role !== "Lead");
    const cleanQuestion = cleanText(question, 700);
    if (!agent || cleanQuestion.length < 12) return { ok: false, error: "Describe one specific blocker in at least 12 characters." };
    if (room.anonymousHelperCalls >= 1 || anonymousHelperBusy) return { ok: false, error: "The room's anonymous helper has already been used or is already working." };
    room.anonymousHelperCalls += 1;
    anonymousHelperBusy = true;
    publish(agentId, "help_request", `I’m asking the anonymous helper: ${cleanQuestion}`, { task: agent.task, tool: "ask_anonymous_helper" });
    publish("anonymous-helper", "activity", "Anonymous helper spawned · reviewing the blocker", { task: "Anonymous helper" });
    return { ok: true, question: cleanQuestion, requester: agent.name };
  };
  const finishAnonymousHelper = () => { anonymousHelperBusy = false; };
  const publishAnonymousHelper = text => publish("anonymous-helper", "anonymous_helper", text);
  room._castUserVote = castUserVote;
  room.setChatHandler = handler => { chatHandler = typeof handler === "function" ? handler : null; };
  room.chat = async (session, message, targetId) => {
    if (String(session || "") !== room.sessionId) return { ok: false, error: "This room belongs to a different chat." };
    if (!chatHandler) return { ok: false, error: "This team room is not accepting chat right now." };
    const text = cleanText(message, 1_200);
    if (text.length < 1) return { ok: false, error: "Write a message for the team first." };
    if (room.chatBusy) return { ok: false, error: "The team is finishing another room reply. Try again in a moment." };
    room.chatBusy = true;
    const before = new Set(room.entries.map(entry => entry.id));
    try {
      let result;
      try { result = await chatHandler({ text, targetId: cleanText(targetId, 80) || "team" }); }
      catch (error) { result = { ok: false, error: cleanText(error?.message || "The team could not reply.", 300) }; }
      const newEntries = room.entries.filter(entry => !before.has(entry.id));
      return { ...result, accepted: newEntries.some(entry => entry.senderId === "user" && entry.type === "user_message"), room: snapshot(), events: newEntries.map(entry => ({ type: "agent_update", room: snapshot(), entry })) };
    } finally { room.chatBusy = false; }
  };
  const setStatus = (agentId, status) => {
    const agent = room.agents.find(item => item.id === agentId);
    if (!agent || !["queued", "researching", "reviewing", "complete", "failed"].includes(status)) return;
    agent.status = status;
    if (status === "researching") agent.activity = "Investigating assigned brief";
    else if (status === "reviewing") agent.activity = "Reviewing shared findings";
    else if (status === "complete") agent.activity = "Finished assignment";
    else if (status === "failed") agent.activity = "Could not complete assignment";
    if (typeof onUpdate === "function") onUpdate({ type: "agent_update", room: snapshot(), entry: null });
  };
  const vote = (agentId, optionId, reason) => {
    const worker = workers.find(item => item.id === agentId);
    const option = room.poll.options.find(item => item.id === optionId);
    if (!worker || !option) return false;
    const index = room.poll.votes.findIndex(item => item.agentId === agentId);
    const previous = index >= 0 ? room.poll.votes[index] : null;
    const record = { agentId, name: worker.name, role: worker.role, optionId, option: option.label, reason: cleanText(reason, 500), at: new Date().toISOString() };
    if (previous && previous.optionId === record.optionId && previous.reason === record.reason) return true;
    if (previous) room.poll.votes[index] = record;
    else room.poll.votes.push(record);
    publish(agentId, previous ? "vote_update" : "vote", `${previous ? "Changed vote to" : "Voted for"} ${option.label}${record.reason ? ` — ${record.reason}` : ""}.`, { vote: record });
    return true;
  };
  const closePoll = () => {
    room.poll.status = "closed";
    const counts = Object.fromEntries(room.poll.options.map(option => [option.id, room.poll.votes.filter(vote => vote.optionId === option.id).length]));
    const max = Math.max(0, ...Object.values(counts));
    const leaders = max ? room.poll.options.filter(option => counts[option.id] === max).map(option => option.label) : [];
    publish("lead", "poll_results", max ? `Workers selected ${leaders.join(" and ")} (${max} vote${max === 1 ? "" : "s"}).` : "No worker votes were recorded.", { poll: { counts, leaders } });
    return { counts, leaders };
  };
  const finish = status => {
    room.status = status === "failed" ? "failed" : "complete";
    setStatus("lead", room.status === "failed" ? "failed" : "complete");
    if (room.poll.status === "open") closePoll();
    return snapshot();
  };
  return { room, workers: cleanTasks, snapshot, publish, setStatus, setProfile, addUsage, castUserVote, requestHelp, answerHelp, readBoard, shareFinding, flagRisk, reserveAnonymousHelper, finishAnonymousHelper, publishAnonymousHelper, vote, closePoll, finish };
}

function restoreRoom(savedSnapshot, savedEntries = [], sessionId = "", onUpdate = null) {
  if (!savedSnapshot || !/^[a-zA-Z0-9-]{8,80}$/.test(String(savedSnapshot.id || "")) || !Array.isArray(savedSnapshot.agents)) return null;
  const savedWorkers = savedSnapshot.agents.filter(agent => agent?.role !== "Lead").slice(0, 3);
  if (!savedWorkers.length || savedWorkers.length !== savedSnapshot.agents.filter(agent => agent?.role !== "Lead").length) return null;
  const tasks = savedWorkers.map(agent => ({ name: cleanText(agent.task || agent.name, 80) || "Team assignment", role: cleanText(agent.role, 40), prompt: "Continue the saved team conversation using the room transcript and read-only research tools." }));
  const savedPoll = savedSnapshot.poll;
  if (!savedPoll || !Array.isArray(savedPoll.options) || savedPoll.options.length < 2) return null;
  let revived;
  try {
    revived = createRoom({ tasks, poll: savedPoll, sessionId, providerLabel: cleanText(savedSnapshot.provider, 100) || "selected provider", onUpdate });
  } catch { return null; }
  const room = revived.room;
  ROOMS.delete(room.id);
  const sourceAgents = Array.isArray(savedSnapshot.agents) ? savedSnapshot.agents : [];
  for (const agent of room.agents) {
    const saved = sourceAgents.find(item => item?.id === agent.id);
    if (!saved) continue;
    const defaults = agent;
    Object.assign(agent, structuredClone(saved));
    agent.profile = { ...defaults.profile, ...(saved.profile || {}) };
    agent.stats = { ...defaults.stats, ...(saved.stats || {}) };
    if (agent.id !== "lead" && ["queued", "researching", "reviewing", "needs_help"].includes(agent.status)) {
      agent.status = "complete";
      agent.activity = "Back from an earlier run; available in team chat";
    }
  }
  room.id = String(savedSnapshot.id);
  room.sessionId = String(sessionId || "");
  room.provider = cleanText(savedSnapshot.provider, 100) || "selected provider";
  room.status = "complete";
  room.leader = room.agents.find(agent => agent.id === "lead") || room.agents[0];
  room.poll = structuredClone(savedPoll);
  room.poll.votes = Array.isArray(room.poll.votes) ? room.poll.votes : [];
  room.poll.userVote ||= null;
  room.poll.status ||= "closed";
  room.helpRequests = Array.isArray(savedSnapshot.helpRequests) ? structuredClone(savedSnapshot.helpRequests).slice(-8) : [];
  room.risks = Array.isArray(savedSnapshot.risks) ? structuredClone(savedSnapshot.risks).slice(-12) : [];
  room.risksByAgent = {};
  for (const risk of room.risks) room.risksByAgent[risk.agentId] = Number(room.risksByAgent[risk.agentId] || 0) + 1;
  room.entries = (Array.isArray(savedEntries) ? savedEntries : []).filter(entry => entry && typeof entry.id === "string").slice(-100).map(entry => structuredClone(entry));
  room.anonymousHelperCalls = room.entries.some(entry => entry.tool === "ask_anonymous_helper" || entry.type === "anonymous_helper") ? 1 : 0;
  room.findingsByAgent = {};
  for (const entry of room.entries) if (entry.type === "finding") room.findingsByAgent[entry.senderId] = Number(room.findingsByAgent[entry.senderId] || 0) + 1;
  revived.workers.forEach(worker => {
    const saved = room.agents.find(agent => agent.id === worker.id);
    if (saved) Object.assign(worker, saved);
    worker.prompt = tasks.find((_, index) => `worker-${index + 1}` === worker.id)?.prompt || "";
  });
  ROOMS.set(room.id, room);
  return revived;
}

function castUserVote(sessionId, roomId, optionId) {
  const room = ROOMS.get(String(roomId || ""));
  if (!room) return { ok: false, expired: true };
  return { ok: true, roomId: room.id, voteEvent: room._castUserVote?.(sessionId, optionId) || null };
}

function chatWithRoom(sessionId, roomId, message, targetId) {
  const room = ROOMS.get(String(roomId || ""));
  if (!room) return Promise.resolve({ ok: false, error: "This team room has expired." });
  return room.chat?.(sessionId, message, targetId) || Promise.resolve({ ok: false, error: "This team room is not accepting chat right now." });
}
function hasRoom(roomId) { return ROOMS.has(String(roomId || "")); }

function castArchivedUserVote(roomSnapshot, optionId) {
  if (!roomSnapshot || typeof roomSnapshot !== "object" || !Array.isArray(roomSnapshot.poll?.options)) return null;
  const room = structuredClone(roomSnapshot);
  const option = room.poll.options.find(item => item.id === String(optionId || "").toLowerCase());
  if (!option) return null;
  const previous = room.poll.userVote;
  room.poll.userVote = { optionId: option.id, option: option.label, at: new Date().toISOString() };
  return {
    type: "agent_update",
    room,
    entry: {
      id: crypto.randomUUID(), at: room.poll.userVote.at, senderId: "user", name: "You", role: "User", kind: "User", type: "user_vote",
      text: cleanText(`${previous ? "Changed your vote to" : "Voted for"} ${option.label}.`, 1_200),
      vote: room.poll.userVote
    }
  };
}

function parseVote(text, options) {
  const content = String(text || "");
  const match = content.match(/^\s*VOTE\s*:\s*([a-z0-9_-]{1,32})\s*(?:[—-]\s*(.*))?\s*$/im);
  if (!match || !options.some(option => option.id === match[1].toLowerCase())) return { content: content.trim(), optionId: "", reason: "" };
  const lineStart = content.lastIndexOf("\n", match.index) + 1;
  const stripped = (content.slice(0, lineStart) + content.slice(match.index + match[0].length)).trim();
  return { content: stripped, optionId: match[1].toLowerCase(), reason: cleanText(match[2] || "", 500) };
}

function parseProfile(text) {
  const content = String(text || "");
  const match = content.match(/^PROFILE\s*:\s*([^\r\n]{8,220})\s*$/im);
  if (!match) return { bio: "", content: content.trim() };
  const lineStart = content.lastIndexOf("\n", match.index) + 1;
  return { bio: cleanText(match[1], 160), content: (content.slice(0, lineStart) + content.slice(match.index + match[0].length)).trim() };
}

module.exports = { PERSONAS, createRoom, restoreRoom, hasRoom, castUserVote, castArchivedUserVote, chatWithRoom, parseVote, parseProfile };
