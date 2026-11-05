# SDE — library-sync (2026-11-05)

**Trigger:** the owner reported that a photo added on the phone didn't appear in the laptop's library (no auto-refresh), and on the phone itself it showed only under "Just uploaded", not in the main list.

## Built
- **Library:** the main list ("All photos") always contains every photo, and new uploads *also* appear in "Just uploaded". Previously new uploads were kept out of the main list.
- **Auto-refresh (`App.tsx`):** re-fetches on `focus`/`visibilitychange` and every 30 s while visible, skipped during drag-to-reorder. Unchanged lists cost a 304.
- **Weak ETag:** `/api/images` compares `If-None-Match` ignoring `W/`, because Cloudflare weakens ETags when it compresses.
- **`align_attempted` column (migration 005, backfilled to 1):** the list returns `pending`; the UI hides pending uploads from the library and stats.
  - `DELETE /no-face` now only deletes attempted images. **Bug fixed:** before this, "Dismiss All" deleted uploads staged on another device.
- **Image URL cache key = content hash** (`content_hash`, the first 12 hex chars of `file_hash`) instead of `id-filename`. SQLite reuses the highest rowid after a delete, so a reused ID used to serve the old cached photo. Seen live: id 1038 was reused on the phone. `Cache-Control` changed from `public` to `private`.

## Tests
- New `e2e/tests/library-sync.spec.ts` (5 tests). Two face-detected tests updated for cards that now appear twice.
- 32/32 pass. Migration 005 verified on a copy of the live DB.
