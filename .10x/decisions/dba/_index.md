# DBA — index
- [DISCOVERED] SQLite via `backend/app/database.py`, with SQL migrations in `migrations/`.
- ui-revamp: no schema or query changes.
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)
- library-sync: migration 005, see [library-sync](library-sync.md)

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.

- export-performance: No schema or database writes. Cache signature uses ordered query results, alignment revision and source filesystem stats. Cache remains process-local and bounded to 20 job records.

- person-profiles: see [person-profiles](person-profiles.md).

- archive-experience: approved eight-part upgrade; ADR-009.
