# ADR-007: Export work reuse

Status: Accepted
Date: 2026-11-09

## Context
1,043-frame export takes 265.2 seconds; identical art is rebuilt every frame and every request starts encoding again. Single-process, single-user service.

## Decision
Memoize immutable background/font resources. Reuse bounded in-memory completed/running jobs by ordered source metadata, source stat/revision, visible captions, duration and renderer version. Allow one distinct active export; report 409 for competing settings. Recheck signature before retaining reuse eligibility. Extend polling with phase/count and log phase timings. Preserve encoding settings and output retention.

## Alternatives
Faster preset: potential quality/size trade-off; defer. Persistent cache/queue: restart reuse and scheduling, but extra retention/invalidation/operations complexity.

## Consequences
Pixel-identical rendering with less CPU work; repeated exports immediate while job retained. Restart or eviction requires regeneration. Existing MP4 disk retention remains unchanged. Input mutation during export may affect that export as before, but cannot make a stale result reusable. No schema or runtime dependencies.
