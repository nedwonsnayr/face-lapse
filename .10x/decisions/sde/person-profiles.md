# SDE — person profiles

Implemented migration 008/profiles CRUD, validated profile scope for every image read/mutation/batch, profile-only duplicate detection and date interpolation. Mixed batches fail before work starts. Scoped background export admission/reuse/polling and download filename ownership survive app restarts. Existing files remain Ryan's; new other-person exports use person-ID prefixes. SQLite FK enforcement enabled.

Frontend person tabs and add/edit dialog, server-saved birthday, person-bound API/context and ETag caches, keyed workspace, last-selected tab persistence, pending upload recovery, stale response suppression and late camera stream shutdown. Completed exports don't auto-download after leaving the person. No new dependencies. Personal live data untouched.

Testing/remaining: QA report records final counts; migration verified twice on a copy of 1,035 local rows, all original columns identical, integrity ok. UI reviewed in phone screenshot.
