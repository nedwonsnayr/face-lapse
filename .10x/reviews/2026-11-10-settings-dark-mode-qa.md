# QA report: settings-dark-mode (2026-11-10)
- **Result:** pass. 69/69 e2e tests, including the 5 new settings tests. TypeScript check and production build clean.
- **Scope:** theme switching and persistence, the pre-paint theme, `theme-color`, validation of corrupt values, startup defaults, legacy key migration, and a visual pass at desktop and phone widths in both themes.
- **Defects:** 2 found and fixed before the PR: `theme-color` was set to an unresolved `light-dark()` value, and the dark segmented selection was too faint.
- **Residual risk:** not tested on real iOS Safari. Older browsers get the Light palette.
