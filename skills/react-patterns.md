---
id: react-patterns
name: React & frontend patterns
category: Frontend
icon: ⚛
triggers: react, component, hooks, usestate, useeffect, redux, next.js, jsx, rerender, context, props, frontend framework, vue, svelte
summary: Structure components and state so features stay fast and debuggable as they grow.
---
## When to use
- Building or refactoring React (or similar) components, hooks, and state.
- Mystery rerenders, prop-drilling nightmares, effects that fire wrong.

## Approach
State lives as close as possible to where it's used; it moves up only when sharing demands it. Effects synchronize with external systems — they are not lifecycle hooks for deriving data. When something is slow or buggy, measure and trace the actual render flow before restructuring.

## Steps
1. Map the data flow: what state exists, who owns it, who reads it — before adding any new state.
2. Derive, don't duplicate: computed values come from existing state (useMemo only when profiling says so).
3. Keep effects minimal and honest: complete dependency arrays, cleanup for subscriptions/timers, no effects for pure derivations.
4. Split components by responsibility (display vs container vs hook logic); extract custom hooks when logic is reused.
5. Lift state only as high as the widest consumer requires; consider context or a store only when prop-drilling is proven painful.
6. Keys must be stable identity, never array index for reorderable lists.
7. Handle the async trinity in UI: loading, error, and empty states — not just the happy path.

## Pitfalls
- Effects that fetch without cleanup or cancellation (setState-after-unmount).
- Copying props into state; giant components doing five jobs.
- Optimizing with memo/useCallback before measuring.

## Verify
- Interact with the feature: correct behavior on mount, update, error, and unmount; no console warnings; rerenders traced where suspected.
