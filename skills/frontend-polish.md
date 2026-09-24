---
id: frontend-polish
name: Frontend polish
category: Product
icon: ✦
triggers: frontend, ui, ux, css, layout, responsive, component, page, screen, interface, dashboard, website, web app, mobile, design, html
summary: Turn rough screens into a clear, consistent interface — hierarchy, spacing, states, and responsive behavior.
---
## When to use
- Building or improving any user-facing screen, component, or page.
- "It looks off" feedback without a more specific complaint.

## Approach
Visual quality is mostly decisions in priority order: hierarchy first (what is the one primary action?), then spacing rhythm, then type scale, then color, then decoration. Never start with decoration.

## Steps
1. Read the current markup and styles for the screen; render it mentally (or actually) before proposing changes.
2. Fix hierarchy: one primary action per view, clear reading order, grouped related controls.
3. Normalize spacing to a consistent scale (4/8-based) and one type scale; kill arbitrary px soup.
4. Cover the full state matrix: empty, loading, error, success, disabled, long content, no-data mobile width.
5. Verify responsive behavior at narrow width: no horizontal scroll, no clipped text, tap targets >= 40px.
6. Ensure interaction feedback everywhere: hover/focus/active states, focus-visible for keyboards, aria labels on icon-only controls.
7. Keep the design system coherent — reuse existing tokens and components before inventing new ones.

## Pitfalls
- Centering everything instead of aligning to a grid.
- Pretty desktop screenshot that breaks at 375px.
- Icon-only buttons with no accessible name.

## Verify
- The changed screen was actually rendered and inspected at desktop and mobile widths.
- Keyboard-only pass: every control reachable and focus visible.
