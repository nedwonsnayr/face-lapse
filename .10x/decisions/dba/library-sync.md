# DBA — library-sync
- Migration 005 adds `images.align_attempted BOOLEAN NOT NULL DEFAULT 1`. Existing rows have all been aligned, so the backfill is the column default. New uploads set it False (model default plus `server_default "0"` for fresh DBs); align and realign set it True.
- Known: `images.id` has no AUTOINCREMENT, so SQLite reuses the max rowid after a delete. Left as is; URLs are keyed on the content hash instead.
