# Manual face selection — security review (2026-11-09)

Threat context: owner-controlled personal photo library with existing Cloudflare Access middleware in hosted mode. Review scope is this feature, not a fresh dependency/infra audit.

- New endpoints remain inside the existing authenticated `/api/images` boundary.
- Selection accepts only a strict nonnegative integer into the server's persisted candidate list. Out-of-range values return 400; negatives/non-integers return 422; unknown photo IDs return 404. Regression tests verify rejection without changing selection state.
- Clients cannot submit arbitrary geometry, file paths, model URLs, or executable arguments.
- Candidate geometry stays with the existing image metadata in SQLite; no new external service, face embeddings, or recognition dependency.
- Originals are preserved. Candidate discovery does not change an existing alignment; only explicit confirmation writes aligned output.
- Unresolved choices are excluded from export and protected from bulk no-face deletion. Individual removal retains the existing confirmation pattern.
- Cached original/aligned renditions are separated and fresh alignment versions prevent browser reuse after changing faces. Aligned images are atomically replaced.

No new blocking finding identified within this feature scope. Existing app-wide upload limits, optional auth configuration and export concurrency findings from the earlier analysis remain outside this change. Concurrent edits from two clients still use last-writer-wins for selection; persisted geometry always refers to one immutable photo.
