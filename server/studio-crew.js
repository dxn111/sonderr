"use strict";

// Studio Crew — Sonderr Studios runs a two-specialist crew on every real
// build turn. Each track pairs two complementary specialists, and the lead
// hands each worker one specific task for what needs to happen right now.
// The crew is phase-aware: plan, build, review, and advise turns hand each
// worker a different concrete task, so the duo always has current work.
// Workers are read-only researchers: they investigate, verify, and propose;
// the lead synthesizes their evidence and performs every edit itself.
// Each track also carries a craft playbook — the professional standard and
// a definition of done the lead holds every deliverable to.

const DUO_SIZE = 2;

const CREWS = {
  site: [
    {
      role: "Site Architect",
      focus: "structure, content, and working pages",
      assignment: "Map the pages, sections, content, and navigation the site needs, inspect what already exists in the workspace, and specify exactly what to build or fix first.",
      review: "Check the built pages for correct structure, working navigation, complete content, and honest next steps.",
      phases: {
        plan: "Map every page, section, and navigation path, and list the content each page needs before anything is built.",
        build: "Specify the exact pages and sections to create or fix in this pass, with the content and links each one needs.",
        review: "Walk the built pages end to end and list every broken link, missing section, or structural gap to repair.",
        advise: "Answer structure and content questions with specifics drawn from the actual pages, not generic advice."
      }
    },
    {
      role: "Interface Designer",
      focus: "visual design, polish, and responsiveness",
      assignment: "Define the visual direction — palette, typography, spacing, components — and specify the concrete polish that will make the pages feel finished and responsive.",
      review: "Check the built pages for visual consistency, spacing and type quality, responsive behavior, and accessibility basics.",
      phases: {
        plan: "Choose the palette, type scale, spacing system, and component styles; describe the feel the site should have.",
        build: "Specify the concrete styling work for this pass: layout fixes, responsive breakpoints, hover states, polish.",
        review: "Judge spacing, type, contrast, and responsive behavior at every screen size and list the visual defects.",
        advise: "Give concrete visual direction with real values — hex codes, sizes, spacing — never vague style words."
      }
    }
  ],
  app: [
    {
      role: "App Engineer",
      focus: "logic, data, and working flows",
      assignment: "Trace the app's core flow and data, inspect the existing code, and specify exactly what to implement or repair so the main flow actually works.",
      review: "Check the implementation for correctness, edge cases, broken flows, and honest verification results.",
      phases: {
        plan: "Trace the core flow through the real code and data; decide the smallest working slice to build first.",
        build: "Specify the exact functions, data changes, and checks for this pass so the main flow actually runs.",
        review: "Probe edge cases, error paths, and broken flows; list every defect with the failing input that triggers it.",
        advise: "Explain how the implementation actually works, citing the real functions and files in the workspace."
      }
    },
    {
      role: "Experience Designer",
      focus: "flows, screens, and usability",
      assignment: "Map the user's journey screen by screen and specify the interactions, states, and usability fixes that make the app feel effortless.",
      review: "Check the implementation for confusing flows, missing states, unpolished screens, and accessibility gaps.",
      phases: {
        plan: "Map the user's journey screen by screen and define the states each screen needs: empty, loading, error, success.",
        build: "Specify the interactions to wire in this pass: transitions, feedback, keyboard support, focus handling.",
        review: "Use the app like a first-time user and list every confusing moment, dead end, and missing state.",
        advise: "Answer usability questions with concrete interaction patterns the user can apply immediately."
      }
    }
  ],
  pdf: [
    {
      role: "Document Architect",
      focus: "outline, narrative, and evidence",
      assignment: "Shape the document's outline, narrative, and section content for the stated audience; inspect any source material in the workspace and specify what to draft first.",
      review: "Check the draft for complete structure, accurate content, consistent terminology, and honest gaps.",
      phases: {
        plan: "Shape the outline: audience, promise, sections, and the evidence each section must carry.",
        build: "Specify the sections to draft or expand in this pass, with the facts and examples each one needs.",
        review: "Read the draft for accuracy, consistency, and gaps; list every claim that needs support or correction.",
        advise: "Answer content and structure questions with a recommended outline the user can act on."
      }
    },
    {
      role: "Page Designer",
      focus: "layout, typography, and print polish",
      assignment: "Define the page design system — grid, typography, color, headers, page breaks — and specify the concrete layout work that will make the document look professionally typeset.",
      review: "Check the draft for clean layout, readable typography, consistent styling, and print-ready output quality.",
      phases: {
        plan: "Define the page system: grid, margins, type scale, headers, and where the page breaks should fall.",
        build: "Specify the layout work for this pass: typography, spacing, headers, table and figure styling.",
        review: "Check every page for orphaned lines, cramped spacing, broken breaks, and print-readiness.",
        advise: "Give concrete typesetting guidance — sizes, margins, hierarchy — for the document at hand."
      }
    }
  ],
  design: [
    {
      role: "Design Lead",
      focus: "concept, system, and direction",
      assignment: "Set the concept, audience, and visual direction; inspect existing brand or design material in the workspace and specify the core artifacts to create first.",
      review: "Check the artifacts for concept clarity, system consistency, and a direction worth continuing.",
      phases: {
        plan: "Set the concept, audience, and visual direction; choose the core artifacts that will carry the system.",
        build: "Specify which artifacts to create in this pass and the system rules each one must follow.",
        review: "Judge the work against the concept: is the system consistent, recognizable, and worth extending?",
        advise: "Give direction decisions — palette, mood, composition — with a clear rationale the user can reuse."
      }
    },
    {
      role: "Craft Specialist",
      focus: "execution, detail, and finish",
      assignment: "Turn the direction into precise, production-quality artifacts — exact colors, aligned shapes, balanced composition, export-ready files — and specify the detail work required.",
      review: "Check the artifacts for alignment, spacing, color accuracy, export quality, and finishing details.",
      phases: {
        plan: "Plan the production details: dimensions, export formats, exact color values, and the finishing steps.",
        build: "Give execution-level detail for this pass: exact colors, aligned shapes, balanced composition, export-ready files.",
        review: "Zoom in and list every misalignment, off-palette color, and rough edge that betrays unfinished work.",
        advise: "Answer how-to questions with concrete technique: tools, exact values, and order of operations."
      }
    }
  ],
  project: [
    {
      role: "Project Planner",
      focus: "scope, sequence, and risks",
      assignment: "Break the goal into concrete sequenced steps, inspect the current workspace state, and specify the first useful milestone with its risks and checks.",
      review: "Check progress for scope honesty, missed risks, and the most valuable next step.",
      phases: {
        plan: "Break the goal into sequenced milestones, name the risks for each, and define the first useful result.",
        build: "Confirm the current milestone is still the right one and specify what must be true to call it done.",
        review: "Check progress honestly: what slipped, what risks materialized, and what is the most valuable next step.",
        advise: "Answer planning questions with sequenced, sized steps and the trade-offs between them."
      }
    },
    {
      role: "Build Specialist",
      focus: "implementation and verification",
      assignment: "Work out how to implement the next milestone in this workspace — files, tools, checks — and specify exactly what to build and how to verify it.",
      review: "Check the build for completeness, working results, and verification that actually ran.",
      phases: {
        plan: "Work out how the first milestone gets built here: files, tools, checks, and the order of work.",
        build: "Specify exactly what to implement now, which checks prove it works, and what to leave untouched.",
        review: "Re-run the checks on the finished work and list anything unverified, broken, or left behind.",
        advise: "Explain how to build or verify something with steps that work in this exact workspace."
      }
    }
  ],
  developer: [
    {
      role: "Code Researcher",
      focus: "codebase, conventions, and fit",
      assignment: "Study the codebase structure, conventions, and open areas, then specify the focused contribution that fits best and what it touches.",
      review: "Check the contribution plan against the real code for fit, collisions, and missing context.",
      phases: {
        plan: "Study the codebase and pick the focused contribution that fits conventions and helps the most.",
        build: "Specify the files, functions, and patterns the change must follow to fit the existing code.",
        review: "Check the change against the real code for collisions, missed conventions, and regressions.",
        advise: "Answer codebase questions from the actual structure, files, and conventions in the workspace."
      }
    },
    {
      role: "Contribution Guide",
      focus: "process, quality, and handoff",
      assignment: "Map the project's contribution process — standards, tests, review expectations — and specify the steps for a clean, reviewable handoff.",
      review: "Check the handoff for complete tests, clear descriptions, and review-ready quality.",
      phases: {
        plan: "Map the project's contribution process: standards, tests, commit style, and review expectations.",
        build: "Specify the tests, docs, and changelog steps needed for a clean, reviewable handoff.",
        review: "Check the handoff end to end: tests pass, description accurate, everything review-ready.",
        advise: "Answer process questions with the project's real standards, not generic open-source advice."
      }
    }
  ],
  bounty: [
    {
      role: "Scope Analyst",
      focus: "targets, rules, and authorization",
      assignment: "Read the program scope and rules carefully and specify exactly what is in scope, what is forbidden, and what a safe authorized test plan may touch.",
      review: "Check the plan against the scope for any step that exceeds authorization or touches forbidden targets.",
      phases: {
        plan: "Read the scope and rules; list exactly which targets and methods are authorized and which are forbidden.",
        build: "Specify the authorized test steps for this pass, each tied to an in-scope target and rule.",
        review: "Re-read the scope against the findings; flag anything that touched or neared a forbidden edge.",
        advise: "Answer scope questions by quoting what the program rules actually allow and forbid."
      }
    },
    {
      role: "Safety Reviewer",
      focus: "harm avoidance and private reporting",
      assignment: "Review the planned testing approach for safety — no service disruption, no data exfiltration, no privacy violations — and specify the private reporting steps.",
      review: "Check the findings and report plan for responsible disclosure, redacted sensitive material, and safe handling.",
      phases: {
        plan: "Define the safety boundaries: no disruption, no exfiltration, no privacy violations, private reporting.",
        build: "Specify the safe way to run each planned step and the evidence to record while testing.",
        review: "Check the report plan: responsible disclosure, redacted sensitive data, no exploit details leaked.",
        advise: "Answer safety questions with the specific rule and the safer alternative to use."
      }
    }
  ]
};

// The professional standard each craft is held to: five working rules plus a
// definition of done. The lead applies them while working and as the final
// acceptance check; workers apply them to their evidence and proposals.
const PLAYBOOKS = {
  site: {
    rules: [
      "Mobile-first responsive: every layout must survive a 375px viewport.",
      "One clear visual system: palette, type scale, and spacing never drift.",
      "Real content on every page; no lorem ipsum, no placeholder stubs.",
      "Navigation, links, and buttons all go somewhere real.",
      "Accessibility basics: contrast, focus states, alt text, labeled inputs."
    ],
    done: "A visitor can arrive, understand the site, and complete the main action on a phone or a desktop."
  },
  app: {
    rules: [
      "The main flow works end to end before any extra features are added.",
      "Every state is designed: empty, loading, error, and success.",
      "Errors are specific and recoverable, never dead ends.",
      "The UI stays consistent: same components, spacing, and language.",
      "Behavior is verified by actually running it, never assumed."
    ],
    done: "The core flow runs cleanly and handles mistakes gracefully."
  },
  pdf: {
    rules: [
      "A single type system: one scale, consistent hierarchy, no drift.",
      "Generous margins and a grid; the content breathes on every page.",
      "No orphaned lines, broken page breaks, or cramped tables.",
      "Every claim carries its evidence; terminology never shifts.",
      "Print-ready: check the actual page output, not just the screen."
    ],
    done: "It reads like a professionally typeset document from cover to end."
  },
  design: {
    rules: [
      "One concept carries everything; decoration never replaces it.",
      "Exact values, not vibes: hex codes, sizes, and spacing written down.",
      "Optical alignment beats mechanical alignment; nudge until it looks right.",
      "Palette discipline: an off-palette color is a bug, not an accent.",
      "Exports are complete: correct dimensions, formats, and backgrounds."
    ],
    done: "A stranger could extend the design system without asking a single question."
  },
  project: {
    rules: [
      "Milestones are sized to finish, not to impress.",
      "Every milestone names what proves it done.",
      "Risks get owners and check dates, not just a mention.",
      "Progress updates state what actually changed, not just activity.",
      "Scope changes are written down before work follows them."
    ],
    done: "The stated result exists in the workspace and the checks actually ran."
  },
  developer: {
    rules: [
      "Fit the codebase's conventions before adding your own.",
      "The smallest change that does the job; no drive-by refactors.",
      "Tests cover the new behavior and the edge case you first got wrong.",
      "The description tells a reviewer what changed and why within minutes.",
      "Never claim tests pass that you did not run."
    ],
    done: "A maintainer can review and merge the handoff without follow-up questions."
  },
  bounty: {
    rules: [
      "Authorization first: if it is not clearly in scope, it does not happen.",
      "Gentle probes only: no disruption, no volume, no exfiltration.",
      "Record evidence as you test; findings without proof are rumors.",
      "Sensitive data is redacted everywhere it appears.",
      "Private disclosure, always; no public posting of details."
    ],
    done: "A safe, evidence-backed private report the program can act on."
  }
};

const TRACKS = Object.keys(CREWS);

const PHASES = {
  plan: { label: "PLAN PHASE", intent: "shape the approach before work starts" },
  build: { label: "BUILD PHASE", intent: "implement and verify the current milestone" },
  review: { label: "REVIEW PHASE", intent: "polish, check, and confirm the finished work" },
  advise: { label: "ADVISE PHASE", intent: "answer questions and coach without touching the board" }
};

// Which phase a turn is in. Build and plan modes map directly; ask mode
// defaults to advising, unless the user is clearly asking for a review.
function phaseFor(mode, content) {
  if (mode === "build") return "build";
  if (mode === "plan") return "plan";
  if (/\b(review|regression|polish|look for|before (we |you )?ship|final check|finish(ed)? up|what.*(wrong|missing))\b/i.test(String(content || ""))) return "review";
  return "advise";
}

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

function phaseTask(member, phase) {
  return (member.phases && member.phases[phase]) || member.assignment;
}

// The system-prompt block that turns a Studios session into a two-specialist
// crew run. Exactly two workers, each with one specific, current task that
// matches the phase the turn is in.
function crewBrief(track, { title, goal, milestone, phase } = {}) {
  const crew = crewForTrack(track);
  const label = trackLabel(track);
  const currentPhase = PHASES[phase] ? phase : "build";
  const phaseMeta = PHASES[currentPhase];
  const now = String(milestone || "").trim();
  const [first, second] = crew;
  const lines = [
    `# Studio Crew — two specialists on this ${label} project`,
    `Sonderr Studios pairs exactly two AI specialists on every real work turn for "${String(title || "this project").slice(0, 80)}". spawn_subagents is supplied for this request: when the turn is actual project work — planning a milestone, building, designing, drafting, reviewing, or fixing — call it with EXACTLY two tasks. Never one worker, never three or more. Do not field the crew for a trivial question; answer it directly.`,
    `This turn is in the ${phaseMeta.label} (${phaseMeta.intent}). Field the crew with one specific task each:`,
    `Worker 1 — ${first.role} (${first.focus}). Current specific task: ${now ? `support the milestone "${now.slice(0, 120)}" — ` : ""}${phaseTask(first, currentPhase)}`,
    `Worker 2 — ${second.role} (${second.focus}). Current specific task: ${now ? `support the milestone "${now.slice(0, 120)}" — ` : ""}${phaseTask(second, currentPhase)}`,
    `Write each worker's task field as the specific thing that needs to happen right now (you may sharpen it with details you can see in the workspace), name the concrete deliverable it should return, and give the crew a short neutral poll about the current direction. Workers are read-only: they investigate, verify, and propose; they cannot edit files or run commands.`,
    `After the crew returns: read both reports, resolve disagreements with your own verification, and publish the synthesis. ${first.role} covers ${first.focus}; ${second.role} covers ${second.focus} — use each report for its lens. In Build mode you then perform every edit and check yourself; workers never edit.`,
    `When the phase is review, use the crew's review lenses: ${first.role} — ${first.review} ${second.role} — ${second.review}`
  ];
  return lines.join("\n");
}

// The craft playbook block: the professional standard this track's
// deliverables are held to, plus a definition of done.
function craftBrief(track) {
  const playbook = PLAYBOOKS[track] || PLAYBOOKS.project;
  const label = trackLabel(track);
  const rules = playbook.rules.map(rule => `- ${rule}`).join("\n");
  return [
    `# Craft standard — ${label}`,
    `Every ${label} deliverable is held to this professional standard:`,
    rules,
    `Definition of done: ${playbook.done}`,
    `Apply these as working rules while you build and as the final acceptance check before you call work finished. If one cannot be met yet, say which one and what it would take.`
  ].join("\n");
}

module.exports = { DUO_SIZE, CREWS, PLAYBOOKS, TRACKS, PHASES, phaseFor, crewForTrack, trackLabel, phaseTask, crewBrief, craftBrief };
