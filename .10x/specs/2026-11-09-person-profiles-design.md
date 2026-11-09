# Person profiles — approved design

Owner approved named person tabs under the current login. Each owns its library, camera/uploads, face selection, order, birthday, player and exports. Existing images belong to Ryan. Add and rename people; birthday is optional. Person deletion and moving photos are outside this change.

Use one SQLite database and additive migration 008. Profiles have id, name, birthday; images gain indexed non-null profile_id default 1. Preserve every original, selection, alignment and order. API accepts validated profile_id (defaults to Ryan for compatibility), checks membership before image reads/mutations, and prevalidates batches atomically. Duplicate detection and date interpolation are scoped. Exports carry profile ownership and persistent scoped filenames.

Frontend mounts a keyed person workspace with a bound API context. No global mutable selected-person variable; asynchronous operations retain the person they began with. Per-person ETags and per-profile birthday persisted to server. Last selected tab remembered per device. Tabs refresh on focus/30 seconds.

Verification: migration twice on legacy copy; two profiles sharing a source but differing face choices; cross-profile batches and image/job/file requests rejected; exports filtered; birthday persistence; tab switching with slow requests; camera closure; full backend and browser suites. No real library writes during tests. Existing single-process export admission retained.
