# Manual face selection — dba

Migration 007 adds JSON face_candidates, nullable selected_face_index, selection-needed boolean default false and alignment-version string default empty. Existing images retain their output. Additive migration is idempotent. Rollback app code can ignore new columns; do not remove originals or backfill detection.
