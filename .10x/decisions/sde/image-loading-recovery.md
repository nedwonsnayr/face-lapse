# Image loading recovery — 2026-11-09

Production revision 3043fcb reports SQLAlchemy QueuePool timeouts in get_profile_id.
Person validation checked out a connection in a sync dependency and retained it
until the endpoint/response completed. Concurrent photo requests could fill the
worker pool with connection waiters, starving endpoints holding those connections.

Fix: close the validation read session before returning its scalar profile ID;
the shared Session remains reusable by the endpoint. Detach image metadata and
close the image read session before resize/file streaming. No pool-size increase,
permissions change, schema migration or file changes.

Regression: 80 concurrent requests against a two-connection pool. Original code
failed with HTTP 500; fixed code returns all 200. Final test mixes original/full,
original/thumb, aligned/thumb and aligned/frame requests. Backend 37 passed.
Production read-only file check: 1,045 records, zero missing originals or referenced
aligned files. All 53 Chromium tests passed (53.0s), including playback, library and person isolation. Fix ready for review; not deployed yet.
