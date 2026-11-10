# Archive experience — security review, 2026-11-09

No blocking findings within the existing single-owner access model. Cloudflare Access JWT middleware remains unchanged and covers new archive routes. Every archive operation validates the person; batches validate every image before mutation, reject absent targets, reject duplicates and cap 1,000 IDs. Active mutations/alignment/export exclude trash; original/thumbnail reads permit scoped trash previews. Permanent removal requires a trashed record, with explicit UI confirmation. No new sharing/auth modes.

Copy destinations use server UUID filenames and configured directories, never user-provided paths; copies are physically independent. Exceptions roll back DB writes and remove created copies. A process crash during copying can leave unreferenced files, but cannot overwrite source files. Move updates ownership transactionally; duplicate conflicts leave the source unchanged.

Health exposes counts and an allowlist of parsed backup timestamps/status, never paths or secrets. Backup status writes atomically with mode0644 and contains no credentials; reporting failure must not block the actual backup. Status timestamps are not evidence of a successful restore, and the UI says so. Date inputs are server-validated; sampling enum is bounded. React escapes preset/person filenames; no HTML injection sinks added.

Residual operational scope: old application revisions ignore trash and hard-delete; roll forward preferred. Backup/retention behavior unchanged. Copying uses additional storage; Trash is not auto-purged. Existing one-owner authentication intentionally allows switching all people.
