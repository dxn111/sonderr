---
id: brand-system
name: Brand system
category: Product
icon: ◈
triggers: brand, branding, logo, identity, design system, palette, typography, style guide, colors, visual language, tone of voice
summary: Build a distinctive visual language — mark usage, color, type, motion — and apply it consistently everywhere.
---
## When to use
- Naming and styling a product's visual identity, or auditing an interface against an existing one.
- Inconsistent look across screens, settings, and empty states.

## Approach
A brand is a small set of strict rules applied everywhere, not a moodboard. Define few tokens; enforce them ruthlessly. Consistency is the entire trick.

## Steps
1. Fix the core tokens: 1 primary + 1 accent color with roles, 1-2 typefaces with a type scale, spacing scale, radius scale, and elevation model.
2. Define logo/mark rules: clear space, minimum size, allowed surfaces (light/dark), and what never happens (stretch, recolor, shadows).
3. Specify semantic colors (success, warning, danger, info) once and reuse; never hand-pick per screen.
4. Define motion: durations (120-250ms), easing, and what animates (state changes, entrances) vs what never does (data).
5. Audit the product surface by surface against the rules; list violations with file paths.
6. Encode the system as tokens/CSS variables so future work inherits it automatically.

## Pitfalls
- Twelve shades of the primary color because screens each picked their own.
- Logos stretched inside inflexible containers (the classic broken brand).
- Motion that plays on every render instead of on state transitions.

## Verify
- Every screen checked against the token list; zero hardcoded colors left in touched files.
- Mark renders correctly in header, favicon, and dark contexts if they exist.
