"use strict";

const CATALOG = Object.freeze([
  Object.freeze({
    id: "sites",
    name: "Sites",
    version: "1.2.0",
    releaseDate: "2026-09-25",
    status: "Available",
    category: "Creation",
    summary: "A full web-making workshop for distinctive websites and useful browser apps.",
    details: "Sites turns a product brief, reference, workflow, or existing repository into a polished responsive website or web app. It helps choose the interaction model and visual direction, builds real pages and behavior in the active workspace, previews the result in Sonderr Studios, and refines it against usability, accessibility, performance, and project checks. Sites follows the stack already in the project and keeps decisions and progress attached to the Studio project.",
    features: ["Distinct art direction", "Websites and interactive browser apps", "Real project files and working controls", "Desktop and mobile Studio preview", "Accessibility and quality review"],
    examples: ["Make me a warm, editorial portfolio with a real project gallery", "Build a small inventory app for my community workshop", "Turn this rough landing page into a memorable product site"],
    instructions: [
      "The user enabled the Sites plugin for this chat. Treat website and browser-app design/build requests as the current focus.",
      "First inspect the active workspace and identify its framework, entry page, run scripts, existing design system, and current diff. Keep all work inside the named workspace. Preserve unrelated changes and do not replace a working app with a generic starter.",
      "Treat the brief as a design problem, not a component checklist. For websites, infer a coherent visual concept from the audience and content; choose a strong type scale, color system, spacing rhythm, image treatment, and distinctive interaction details. For apps, map the primary user flow and data states before designing screens; make the main action obvious and give controls useful empty, loading, success, and failure states. If useful, propose two short creative directions before implementation; do not stall for approval when the brief is already clear.",
      "Build a complete page flow with realistic, specific copy and working controls. Avoid fake buttons, placeholder copy, default gradient hero templates, repeated cards, and excessive rounded panels. Use available project assets; do not hotlink stock imagery without a request. Create purposeful visual hierarchy and make the site feel made for this audience.",
      "Use semantic HTML, keyboard-operable controls, visible focus, suitable contrast, reduced-motion support, responsive layouts, and useful empty/error states. Check small and wide layouts. Respect the current framework, lint rules, and component patterns.",
      "In a Website or App Studio project, update the project brief and milestones when the user requests a plan change; use its Live Canvas to preview a workspace-relative HTML file and check desktop/mobile widths. A preview is sandboxed and offline, so never say external requests, forms, or deployment are verified there. Fix preview errors before claiming it works.",
      "Before finalizing, run the relevant project checks, inspect the actual diff, and review the rendered site for layout and interaction defects. Report what is implemented, the exact checks run, and any remaining limitation. Do not claim that a site is hosted, published, or deployed; deployment is separate and requires the user's request."
    ].join("\n")
  }),
  Object.freeze({
    id: "code-review",
    name: "Code Review",
    version: "1.0.0",
    releaseDate: "2026-09-25",
    status: "Available",
    category: "Engineering",
    summary: "Review a change for real defects, risks, and missing checks.",
    details: "Use this plugin to inspect a diff or a focused part of the workspace. Sonderr will prioritize actionable findings with file references, explain the user impact, and suggest a targeted fix or test. It distinguishes confirmed bugs from hypotheses and does not quietly rewrite code during a review.",
    features: ["Diff-first review", "Risk and regression checks", "Actionable file references", "Evidence before severity"],
    examples: ["Review my uncommitted changes", "Find bugs in this feature branch", "Check this auth flow for regressions"],
    instructions: [
      "The user enabled the Code Review plugin for this chat. Review the requested scope, not the whole repository by default.",
      "Inspect actual files and diffs before making findings. Prioritize correctness, security, data loss, and regressions; report concrete evidence and impact.",
      "Distinguish confirmed findings from possible risks. Avoid generic praise or speculative issue lists. Include a relevant file location and a practical fix or test for each finding.",
      "Do not modify files unless the user explicitly asks for a fix. Keep secrets and sensitive findings out of public channels."
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
