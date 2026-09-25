"use strict";

const CATALOG = Object.freeze([
  Object.freeze({
    id: "sites",
    name: "Sites",
    version: "1.0.0",
    releaseDate: "2026-09-25",
    status: "Available",
    category: "Creation",
    summary: "Design and build polished, responsive websites with Sonderr AI.",
    details: "Use Sites to turn a rough idea, reference, or existing project into a complete website. Sonderr can plan the page structure, create or refine the UI and copy, make layouts responsive and accessible, and work with the project files in the active workspace. It uses the existing project stack when there is one and can run available checks after changes.",
    features: ["Landing pages and portfolios", "Responsive UI and page copy", "Work in the active workspace", "Iterate on existing sites"],
    examples: ["Build a clean portfolio for a photographer", "Make this landing page feel more premium", "Add a responsive pricing page to this project"],
    instructions: [
      "The user enabled the Sites plugin for this chat. Treat website design/build requests as the current focus.",
      "Use Build mode tools to inspect the active workspace before editing. If there is already an app, follow its framework, conventions, and visual language rather than scaffolding over it.",
      "If the user gave enough direction, start building with sensible, clearly stated defaults. Ask only essential questions when audience, purpose, or required content is genuinely ambiguous.",
      "Aim for a coherent, polished, responsive result: strong hierarchy, useful content, accessible controls, mobile layout, and working interactions. Avoid placeholder-heavy or generic templates.",
      "Run the relevant existing project checks when available and report exactly what passed. Do not claim that a site is hosted, published, or deployed; deployment is a separate step requiring the user's request."
    ].join("\n")
  })
]);

function publicPlugin(plugin) {
  if (!plugin) return null;
  const { instructions, ...visible } = plugin;
  return { ...visible, features: [...plugin.features], examples: [...plugin.examples] };
}

function listPlugins() { return CATALOG.map(publicPlugin); }
function getPlugin(id) { return CATALOG.find(plugin => plugin.id === String(id || "").trim()) || null; }
function pluginInstructions(id) { return getPlugin(id)?.instructions || ""; }

module.exports = { listPlugins, getPlugin, pluginInstructions };
