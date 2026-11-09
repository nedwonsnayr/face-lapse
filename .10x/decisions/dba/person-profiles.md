# dba — person-profiles

Migration 008 creates Ryan (id 1, birthday 1995-10-06), profiles table and images.profile_id NOT NULL DEFAULT 1 with index/FK. Existing files unchanged. Test legacy/fresh/idempotence; rollback code ignores additive fields.


Migration 008 verified idempotent on legacy data and FK-enabled connection. Preserves all 1,035 local rows/old fields on copy. Temporarily disables foreign_keys only on startup migration connection for SQLite REFERENCES/default restriction, commits ALTER and restores enforcement, then checks references. No original files moved.
