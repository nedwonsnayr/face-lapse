# ADR-013: Time-based network prefetch for timelapse playback

**Status:** Accepted
**Date:** 2026-11-11
**Feature:** timelapse-prefetch
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Since ADR-009 the player waits for each frame to be decoded before it advances, and it decodes only 4 frames ahead. At the default 0.05 s/frame that is 0.2 s of buffer. Production frame fetches (measured in Chrome on 2026-11-11, HTTP/3 via Cloudflare to the Oracle VM) are about 46 ms at p50, about 200 ms at p90 and up to about 500 ms at worst, mostly time to first byte. So playback ran at about half the set speed (100 ms p50 gaps against 50 ms set), and any fetch over 500 ms showed "Loading frame…". Locally, with or without the PR28 filters and even with 250 ms of added latency, playback was steady, so the WebGL filter path isn't the cause.

## Decision
Split lookahead into two tiers:
1. **Network prefetch** (`FramePrefetcher`): download the next `ceil(3 s / frameDuration)` frames, between 8 and 60 of them, into the browser HTTP cache. It runs nearest first, keeps at most 6 requests in flight, sends them at low priority and aborts requests that leave the window. Frame URLs are immutable (content hash, `max-age=1y, immutable`), so the later `<img>`/`Image()` request is a cache hit.
2. **Decode window** (`FrameCache`): fully decode the next 8 frames (up from 4). The cache cap rises from 12 to 16. Decoded memory stays at about 16 × 1.9 MB.

The playback contract stays the same: it still waits for a decoded frame and never shows a broken one.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Restore 8-frame lookahead | One line | 0.4 s buffer at default speed; still below measured worst case | Doesn't cover p99 latency |
| Decode the whole window (60 frames) | One mechanism | ~115 MB decoded memory; mobile Safari would evict or crash | Memory |
| Hold prefetched bytes as Blobs + object URLs | Independent of HTTP cache | Object-URL lifetime tied to the displayed `<img>`; more state | HTTP cache already does this for immutable URLs |

## Consequences
### Positive
- Buffer scales with speed: about 3 s regardless of the slider.
- Second and later loops are served from the HTTP cache.
### Negative
- Up to 60 × ~45 KB (≈2.7 MB) is fetched ahead of the playhead, including frames that are never watched if playback is paused.
- It relies on the browser HTTP cache honoring `immutable`. If the cache is evicted, behavior falls back to today's.
### Risks
- If a scrub or a selection change leaves stale prefetches running, they would compete with the needed frames. Mitigation: abort anything that leaves the window.

## Dependencies
- ADR-009 (bounded decoded frame cache), whose decode tier this keeps.
