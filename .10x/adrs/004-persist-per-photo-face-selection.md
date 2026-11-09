# ADR-004: Persist per-photo face selection
Status: Accepted
Date: 2026-11-09
Feature: manual-face-selection

## Context
One timeline must follow the owner in group photos. Current detector caps faces at one and persists only eyes.

## Decision
Use existing MediaPipe multi-face landmarks. Persist bounded candidate lists with normalized eyes/bounds, selected index, explicit selection-needed flag and alignment version on Image. Unresolved images wait in review and cannot enter exports or no-face deletion. Reuse stored candidate geometry for re-alignment. A source-specific rendition cache and alignment version invalidate changed output. Preserve APIs and UI conventions.

## Alternatives
- Detect again and save only an index: less storage, but detection order can switch identities. Rejected.
- Face embeddings/person profiles: more automation, additional models/identity uncertainty. Deferred; user approved manual selection.

## Consequences
Small additive SQLite migration, no new runtime dependencies. Geometry assumes immutable originals (already the upload model). Detection can miss a face; review exposes detected candidates only. Existing images need explicit Change face to discover their candidates. No automatic rewrite of the existing library.
