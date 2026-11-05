# ui-revamp — Security
- No new inputs, endpoints or data flows. The drop-anywhere overlay feeds the same `handleFiles` path, with the same `image/*` filter.
- Removed the runtime dependency on fonts.googleapis.com. Fonts are bundled, so there are no third-party requests on page load.
- New dependencies: `@fontsource-variable/fraunces` and `@fontsource-variable/inter` (font files and CSS only, no JS).
- Verdict: no security concerns.
