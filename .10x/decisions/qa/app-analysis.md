# App analysis — qa — 2026-11-09

Production TypeScript/Vite build passed. Existing Chromium suite: 38/38 passed in 25.9 s in an isolated temporary checkout. Separate throwaway probes reproduced thumbnail content collision, MP4 duration mismatches, and AM/PM parsing. Coverage gaps include staging recovery, media-content assertions, export concurrency/timing, and persistent JWT regression tests. No production verification performed.

Report: `../../reviews/2026-11-09-app-analysis.md`. Analysis complete; remediation not started.
