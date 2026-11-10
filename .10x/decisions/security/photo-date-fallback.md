# Photo date correction — security review

Reviewed scoped active-image lookup before mutation; invalid date/timezone inputs return 422; unknown/cross-person/trashed rows return 404. Timezone is resolved by ZoneInfo, not a user-controlled arbitrary file read; absolute/traversal names reject before upload files are written. PATCH changes only photo_taken_at/date_source and normal updated_at. Original bytes and cache identity preserved. Existing Access protection remains in force. No new dependencies, credentials or external services. No fuzzy duplicate deletion.

Production correction separately guarded ID, person, filename, hash prefix, exact prior date, created_at, updated_at and active status under BEGIN IMMEDIATE. Mode600 audit saved and fsynced before changing date; only date/updated_at changed and original SHA256 verified unchanged. No new schema installed manually. No unresolved blocker found in this scoped review; not a whole-app audit.
