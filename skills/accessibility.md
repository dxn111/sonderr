---
id: accessibility
name: Accessibility (a11y)
category: Frontend
icon: ⊚
triggers: accessibility, a11y, wcag, screen reader, aria, keyboard navigation, focus, contrast, alt text, semantic html, tab order
summary: Make interfaces usable by everyone — semantic HTML, keyboard paths, visible focus, honest labels.
---
## When to use
- Building or reviewing UI that must be keyboard-navigable, screen-reader friendly, or WCAG-compliant.
- Click-only interfaces, missing focus states, divs pretending to be buttons.

## Approach
Semantic HTML is 80% of accessibility: the right element gives you keyboard behavior, roles, and announcement for free. ARIA patches what semantics cannot express — and wrong ARIA is worse than none. Every interactive element must be reachable, operable, and understandable without a mouse and without seeing the screen.

## Steps
1. Audit structure: one h1, logical heading order, landmarks (nav, main, aside) instead of div soup.
2. Replace fake buttons (`div` with onclick) with real `button`/`a` elements — native semantics beat ARIA.
3. Keyboard path: tab through the page — every control reachable in logical order, visible focus ring, Escape closes modals.
4. Label everything: `alt` for meaningful images (empty for decorative), `label for=` or `aria-label` for inputs.
5. Contrast ≥ 4.5:1 for text; never encode meaning in color alone.
6. Announce dynamic changes with `aria-live` (toasts, status updates) and manage focus on route/modal change.
7. Respect `prefers-reduced-motion` — disable nonessential animation.

## Pitfalls
- `tabindex` > 0 (breaks natural order); use 0 or -1 only.
- outlines removed without a replacement focus style.
- Icon-only buttons with no accessible name.

## Verify
- Unplug the mouse and complete the core flow; tab-order and focus visibility confirmed; contrast spot-checked.
