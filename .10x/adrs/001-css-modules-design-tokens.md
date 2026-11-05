# ADR-001: CSS Modules with design tokens for frontend styling

**Status:** Accepted
**Date:** 2026-11-04
**Feature:** ui-revamp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Every component is styled with inline React style objects (`*.styles.ts`). Inline styles can't express `:hover`, `:focus-visible`, `@media` or CSS transitions. As a result the app has no responsive layout and no real hover states (DatePicker fakes them with `onMouseEnter`). A global `outline: none` also removes keyboard focus. A visual revamp needs all of these.

## Decision
Use Vite's built-in CSS Modules (`Component.module.css`) for component styles. Global design tokens (color, type, spacing, radii, shadow, motion) live as CSS custom properties in `src/index.css`. Inline `style` stays only for genuinely dynamic values: progress widths, dnd-kit transforms and frame aspect ratio.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Tailwind CSS v4 | Fast iteration, consistent scale | New dependency and build config; every className rewritten; long class strings in JSX | More churn than a ~3k-line frontend needs |
| Keep inline styles | Smallest diff | Hover, focus and responsive stay hacky or impossible | Doesn't solve the root cause |
| CSS-in-JS (styled-components, vanilla-extract) | Typed, co-located | Runtime cost or extra build plugin | No benefit over CSS Modules here |

## Consequences
### Positive
- Real pseudo-classes, media queries and transitions; scoped class names; zero new dependencies.
- `data-testid` attributes are unaffected, so the e2e suite stays valid.
### Negative
- Class names aren't type-checked; a typo fails silently.
### Risks
- Visual regressions aren't covered by e2e. Mitigation: a manual visual pass in Chrome at three widths.

## Dependencies
- Constrains future components to the `.module.css` plus token convention.
