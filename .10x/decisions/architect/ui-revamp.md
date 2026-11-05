# ui-revamp — Architect
- ADR-001: CSS Modules + tokens. ADR-002: two-pane studio.
- The shell (`App.tsx`) owns the layout grid; components own only their internals.
- Upload exposes an imperative `openFilePicker` (via ref) for the top-bar "Add photos" button, and accepts files from a window-level drop overlay. Its existing state machine is unchanged.
- No API or data-flow changes.
- Failure modes: unchanged; error boundaries stay per section.
