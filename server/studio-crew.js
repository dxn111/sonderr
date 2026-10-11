"use strict";

// Studio Crew — Sonderr Studios runs a two-specialist crew on every real
// build turn. Each track pairs two complementary specialists, and the lead
// hands each worker one specific task for what needs to happen right now.
// Workers are read-only researchers: they investigate, verify, and propose;
// the lead synthesizes their evidence and performs every edit itself.

const DUO_SIZE = 2;

const CREWS = {
  site: [
    {
      role: "Site Architect",
      focus: "structure, content, and working pages",
      assignment: "Map the pages, sections, content, and navigation the site needs, inspect what already exists in the workspace, and specify exactly what to build or fix first.",
      review: "Check the built pages for correct structure, working navigation, complete content, and honest next steps."
    },
    {
      role: "Interface Designer",
      focus: "visual design, polish, and responsiveness",
      assignment: "Define the visual direction — palette, typography, spacing, components — and specify the concrete polish that will make the pages feel finished and responsive.",
      review: "Check the built pages for visual consistency, spacing and type quality, responsive behavior, and accessibility basics."
    }
  ],
  app: [
    {
      role: "App Engineer",
      focus: "logic, data, and working flows",
      assignment: "Trace the app's core flow and data, inspect the existing code, and specify exactly what to implement or repair so the main flow actually works.",
      review: "Check the implementation for correctness, edge cases, broken flows, and honest verification results."
    },
    {
      role: "Experience Designer",
      focus: "flows, screens, and usability",
      assignment: "Map the user's journey screen by screen and specify the interactions, states, and usability fixes that make the app feel effortless.",
      review: "Check the implementation for confusing flows, missing states, unpolished screens, and accessibility gaps."
    }
  ],
  pdf: [
    {
      role: "Document Architect",
      focus: "outline, narrative, and evidence",
      assignment: "Shape the document's outline, narrative, and section content for the stated audience; inspect any source material in the workspace and specify what to draft first.",
      review: "Check the draft for complete structure, accurate content, consistent terminology, and honest gaps."
    },
    {
      role: "Page Designer",
      focus: "layout, typography, and print polish",
      assignment: "Define the page design system — grid, typography, color, headers, page breaks — and specify the concrete layout work that will make the document look professionally typeset.",
      review: "Check the draft for clean layout, readable typography, consistent styling, and print-ready output quality."
    }
  ],
  design: [
    {
      role: "Design Lead",
      focus: "concept, system, and direction",
      assignment: "Set the concept, audience, and visual direction; inspect existing brand or design material in the workspace and specify the core artifacts to create first.",
      review: "Check the artifacts for concept clarity, system consistency, and a direction worth continuing."
    },
    {
      role: "Craft Specialist",
      focus: "execution, detail, and finish",
      assignment: "Turn the direction into precise, production-quality artifacts — exact colors, aligned shapes, balanced composition, export-ready files — and specify the detail work required.",
      review: "Check the artifacts for alignment, spacing, color accuracy, export quality, and finishing details."
    }
  ],
  project: [
    {
      role: "Project Planner",
      focus: "scope, sequence, and risks",
      assignment: "Break the goal into concrete sequenced steps, inspect the current workspace state, and specify the first useful milestone with its risks and checks.",
      review: "Check progress for scope honesty, missed risks, and the most valuable next step."
    },
    {
      role: "Build Specialist",
      focus: "implementation and verification",
      assignment: "Work out how to implement the next milestone in this workspace — files, tools, checks — and specify exactly what to build and how to verify it.",
      review: "Check the build for completeness, working results, and verification that actually ran."
    }
  ],
  developer: [
    {
      role: "Code Researcher",
      focus: "codebase, conventions, and fit",
      assignment: "Study the codebase structure, conventions, and open areas, then specify the focused contribution that fits best and what it touches.",
      review: "Check the contribution plan against the real code for fit, collisions, and missing context."
    },
    {
      role: "Contribution Guide",
      focus: "process, quality, and handoff",
      assignment: "Map the project's contribution process — standards, tests, review expectations — and specify the steps for a clean, reviewable handoff.",
      review: "Check the handoff for complete tests, clear descriptions, and review-ready quality."
    }
  ],
  bounty: [
    {
      role: "Scope Analyst",
      focus: "targets, rules, and authorization",
      assignment: "Read the program scope and rules carefully and specify exactly what is in scope, what is forbidden, and what a safe authorized test plan may touch.",
      review: "Check the plan against the scope for any step that exceeds authorization or touches forbidden targets."
    },
    {
      role: "Safety Reviewer",
      focus: "harm avoidance and private reporting",
      assignment: "Review the planned testing approach for safety — no service disruption, no data exfiltration, no privacy violations — and specify the private reporting steps.",
      review: "Check the findings and report plan for responsible disclosure, redacted sensitive material, and safe handling."
    }
  ]
};

const TRACKS = Object.keys(CREWS);

function crewForTrack(track) {
  return CREWS[track] || CREWS.project;
}

function trackLabel(track) {
  const labels = {
    site: "Website Studio", app: "App Studio", pdf: "Document Studio",
    design: "Design Studio", project: "Project Studio",
    developer: "Developer Program", bounty: "Bounty Program"
  };
  return labels[track] || labels.project;
}

// The system-prompt block that turns a Studios session into a two-specialist
// crew run. Exactly two workers, each with one specific, current task.
function crewBrief(track, { title, goal, milestone } = {}) {
  const crew = crewForTrack(track);
  const label = trackLabel(track);
  const now = String(milestone || "").trim();
  const [first, second] = crew;
  const lines = [
    `# Studio Crew — two specialists on this ${label} project`,
    `Sonderr Studios pairs exactly two AI specialists on every real work turn for "${String(title || "this project").slice(0, 80)}". spawn_subagents is supplied for this request: when the turn is actual project work — planning a milestone, building, designing, drafting, reviewing, or fixing — call it with EXACTLY two tasks. Never one worker, never three or more. Do not field the crew for a trivial question; answer it directly.`,
    `Worker 1 — ${first.role} (${first.focus}). ${now ? `Current specific assignment: support the milestone "${now.slice(0, 120)}" — ` : ""}${first.assignment}`,
    `Worker 2 — ${second.role} (${second.focus}). ${now ? `Current specific assignment: support the milestone "${now.slice(0, 120)}" — ` : ""}${second.assignment}`,
    `Write each worker's task field as the specific thing that needs to happen right now (not a generic job title), name the concrete deliverable it should return, and give the crew a short neutral poll about the current direction. Workers are read-only: they investigate, verify, and propose; they cannot edit files or run commands.`,
    `After the crew returns: read both reports, resolve disagreements with your own verification, and publish the synthesis. ${first.role} covers ${first.focus}; ${second.role} covers ${second.focus} — use each report for its lens. In Build mode you then perform every edit and check yourself; workers never edit.`,
    `When reviewing finished work, use the crew's review lenses: ${first.role} — ${first.review} ${second.role} — ${second.review}`
  ];
  return lines.join("\n");
}

module.exports = { DUO_SIZE, CREWS, TRACKS, crewForTrack, trackLabel, crewBrief };
