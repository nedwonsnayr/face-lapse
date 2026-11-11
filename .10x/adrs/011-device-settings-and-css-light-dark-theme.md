# ADR-011: Device-local settings and a CSS `light-dark()` theme

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** settings-dark-mode
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The user wants a Settings panel with Light / Dark / System themes, playback defaults and library defaults. Nearly all colors are already CSS custom properties in `src/index.css` (ADR-001); about a dozen hard-coded values remain. The app has one user on several devices. A phone and a laptop may reasonably want different themes.

## Decision
1. **Settings live in `localStorage`** under one validated JSON key, `face-lapse:settings`. A small `SettingsProvider` context in the frontend owns them. There is no server state.
2. **Theme tokens use CSS `light-dark()`**. Each color token is written once as `light-dark(light, dark)`. `<html data-theme>` sets `color-scheme` to `light`, `dark` or `light dark` (System).
3. **An inline pre-paint script** in `index.html` applies the saved theme before first paint. It is duplicated logic, kept to about 10 lines.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Duplicate token block under `[data-theme=dark]` and `@media (prefers-color-scheme: dark)` | Works in older browsers | Every dark value written twice; easy to drift | `light-dark()` is supported in all current evergreen browsers (Safari 17.5+), and this is a personal app on up-to-date devices |
| Server-stored settings in SQLite | Follows the user across devices | New endpoint and migration; theme is naturally per-device | Over-built for one user; System mode already follows each device |
| Theme only via OS `prefers-color-scheme`, no toggle | Zero UI | Doesn't meet the request | The user asked for explicit Light/Dark/System |

## Consequences
### Positive
- One source per color. Native controls theme themselves. System mode reacts live with no JavaScript listener.
- No backend, schema or deploy changes.
### Negative
- Browsers without `light-dark()` (Safari earlier than 17.5) ignore every color declaration that uses it. This is mitigated by a light-only fallback block before the `light-dark()` block.
- Settings don't follow the user between devices.
### Risks
- **Flash of the wrong theme.** Mitigated by the pre-paint script.
- **Low-contrast pairs in dark mode.** Mitigated by a scripted contrast check of every text, border and focus pair.

## Dependencies
- Builds on ADR-001 (CSS Modules + tokens). Future components must use tokens, not literal colors, or they won't theme.
