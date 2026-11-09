# security — person-profiles

Same owner can access all people; profile scope is a data-integrity boundary, not separate accounts. Reject wrong-profile ids and mixed batches; namespace export jobs/files; no filesystem paths from person names.


Review complete: no blocking findings within collection isolation scope. Same owner can intentionally access all profiles. See reviews/2026-11-09-person-profiles-security.md.
