# Photo date correction — implementation complete

Uploads no longer call interpolation. EXIF/filename/upload provenance is persisted by additive migration010; prior rows remain legacy. Browser timezone is validated before writes; full UTC camera filenames resolve to local calendar time. Scoped active-photo date editing supports manual and explicit upload fallback. Grid/list date buttons open a modal; staging and library label upload dates. Paused preview looks up current metadata by ID with a memoized map, preserving decoded bytes.

Initial verification: 50 backend tests and 2 new browser tests pass; mobile dialog visually inspected. Regression coverage includes archive gaps, UTC midnight/DST, EXIF priority, camera dates, malformed input, wrong person/trashed records, ETag changes, migration retention, file preservation, edit/reset/reload and failed-save retry. Full browser regression and final build remain. No production writes yet.
