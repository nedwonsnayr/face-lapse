# QA report: timelapse-prefetch (2026-11-11)
- **Full Playwright suite:** 79 of 79 passed (2.2 min). That includes 4 new tests in `frame-prefetch.spec.ts` and the existing slow-frame, retry and playback-control tests.
- **Frontend production build:** clean. `tsc --noEmit` is clean.
- **A/B playback** on the real library behind a jittery latency proxy:
  - main: 11.4 fps, 16 stalls over 200 ms, max 443 ms
  - new: 16.6 fps, 0 stalls, max 63 ms
  - Full table in decisions/qa/timelapse-prefetch.md.
- **PR28 filters** were measured as not contributing (Original and Film give identical cadence).
- **Cleanup:** test servers (5111/8111) and the local proxy and dev servers are stopped.
