# ADR-002: Two-pane studio layout

**Status:** Accepted
**Date:** 2026-11-04
**Feature:** ui-revamp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The UI is a single 960px column: upload → library → timelapse. With a real library (1,020 images), the timelapse sits at the bottom of a long page. The library is trapped in a nested 500px scroll box, and wide screens are mostly empty.

## Decision
Use an app shell with a top bar (wordmark, stats, Add photos) and a two-column grid:
- Left: the library pane, which scrolls naturally and holds the upload/staging tray at its top.
- Right: a sticky studio pane with the player and export settings.

Below 1024px the panes stack, with the player first. Upload becomes a top-bar action plus a drop-anywhere overlay once the library has images; the large dropzone remains as the empty state.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Player-first single column | Strong hero, simple | Library still a long scroll below; editing and previewing can't happen side by side | User preferred the studio |
| Reskin only | Lowest risk | Layout problems remain | Doesn't fix the core UX complaints |

## Consequences
### Positive
- Curating frames (include/exclude/reorder) and previewing the result happen side by side.
### Negative
- Upload state now renders in two places (top-bar trigger, tray in the library pane), so the component needs a split API.
### Risks
- Sticky panes on small laptop heights: the studio pane scrolls internally if it's taller than the viewport.
