# Manual face selection — dba

Migration 007 adds JSON face_candidates, nullable selected_face_index, selection-needed boolean default false and alignment-version string default empty. Existing images retain their output. Additive migration is idempotent. Rollback app code can ignore new columns; do not remove originals or backfill detection.

Implemented in `007_add_face_selection.py` and models.py. No existing library data rewritten. Test checks migration twice on a legacy-schema DB.
