# ui-revamp — PM
**Problem:** The app looks like a dated generic template, and the timelapse (the payoff) is buried under upload.
**Scope:** Visual and layout refresh only. The upload → stage → align → library → timelapse → export flow is unchanged. No backend changes.
**Chosen by user:** two-pane studio layout, light editorial look, CSS Modules.
**Success criteria:**
- The player is visible without scrolling on desktop while browsing the library.
- Card actions are understandable (icons with labels/tooltips, no `In`/`○`/`Del`).
- Keyboard focus is visible everywhere; the layout works down to phone width.
- All existing e2e specs pass unchanged.
**Non-goals:** changing the black fill of aligned frames (backend); new features.
