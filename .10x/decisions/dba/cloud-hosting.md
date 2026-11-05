# DBA — cloud-hosting
- Migration 004 (`relocate_image_paths`) rewrites `images.original_path` / `aligned_path` to `<current dir>/<basename>` when the stored path isn't under the current data dir. It returns False on purpose, so it's never recorded and runs at every startup, which makes it safe after any future move.
- Backups use `sqlite3 .backup` to take a consistent snapshot before restic runs.
