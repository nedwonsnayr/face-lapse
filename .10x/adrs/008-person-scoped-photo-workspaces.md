# ADR-008: Person-scoped photo workspaces
Status: Accepted
Date: 2026-11-09
Feature: person-profiles

One database, profiles table and indexed images.profile_id; shared physical directories with globally unique image filenames. Scope all API operations with validated profile_id, default 1 for old clients. Export jobs carry a profile id and completed files use persistent profile prefixes. Frontend context binds immutable profile id; keyed workspace prevents stale UI on switching.

Alternatives: separate databases/directories per person complicate backups and migrations; client-only filtering cannot isolate writes or exports.

Risk: missed scope could mix people; cover reads, writes, batching, duplicates, interpolation and export ownership in integration tests. Additive migration preserves current photos. Code rollback can ignore new fields; do not delete data to roll back.
