# dba — person-profiles

Migration 008 creates Ryan (id 1, birthday 1995-10-06), profiles table and images.profile_id NOT NULL DEFAULT 1 with index/FK. Existing files unchanged. Test legacy/fresh/idempotence; rollback code ignores additive fields.
