# Manual face selection

Approved workflow: user confirmed on 2026-11-09: “still one timelapse centered on me. go ahead”.

Keep one timelapse. Detect up to ten faces. Automatically align a single face. When multiple faces are detected and no choice exists, persist candidates and hold the image in a reload-safe Choose your face queue, excluded from exports and bulk no-face deletion. Show the oriented original with numbered, keyboard-accessible face outline buttons. The user selects a candidate and confirms alignment. Persist that exact candidate’s normalized eyes and bounds; subsequent realignment reuses the choice. Library Change face reopens the picker. A cancelled picker preserves prior alignment. Existing library images are unchanged until explicitly realigned or changed. No identity recognition or person profiles.

Candidates and selection live on the image in SQLite. Additive migration preserves originals and existing metadata. Existing REST/NDJSON boundaries and CSS Modules remain. Cache identity distinguishes original/aligned sources and changes after every alignment. Errors are visible and choices can be retried. Detection is best-effort: undetected faces cannot be selected in this version.

Validation: real composite two-face fixture, stored selection and realignment, unresolved export exclusion and deletion protection, reload recovery, invalid selection rejection, cache contents/versioning, migration idempotency, zero/one-face regression, keyboard/dialog behavior, full browser suite and production build.
