# QA: playback-cadence
- **A/B on the real library**, 0.05 s set, 15 s each. `setTimeout(50)` in the test pane measured 50–52 ms, so the timers are trustworthy.
  - main: 18.5 fps, mean 54 ms per frame.
  - branch: 19.6 fps, mean 51 ms (min 49, max 59).
  - The first advance after resume came 54 ms later, a full duration, so no flash.
- **Tests:** 80 of 80 Playwright tests pass, including the new `playback-clock.spec.ts`. The build is clean.
- **Risk:** low. Slow-frame, retry and step tests are unchanged and passing.
