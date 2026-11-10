# ADR-009: Archive lifecycle and bounded media
Status: Accepted
Date: 2026-11-09
Feature: archive-experience

## Context
Personal archive exceeds 1,000 photos. Recent worker/connection starvation demonstrates the need for bounded media work. User approved resilient loading, archive navigation, capture aids, recoverable edits, comparisons, export controls, health and transfers.

## Decision
Keep FastAPI/SQLite and React. Add nullable indexed images.deleted_at; active operations explicitly exclude trash. Separate archive router owns lifecycle/batches/health. No scheduled purge. Copy files to UUID names, compensate created files on failure; move updates ownership transactionally. Files are immutable per copy. Read DB metadata then release sessions before filesystem work. Backup script writes atomic non-secret status file. Bound frontend decoded frame cache and mounted library rows; avoid a new service or virtualization dependency. Presets are local per-person convenience settings, not server-owned photo data.

## Alternatives
Hard-delete plus restore-from-backup is operationally costly and cannot offer reliable undo. Separate trash tables multiply schema/migration and query complexity. Full gallery rendering causes growing DOM costs; cursor pagination would require changing full-sequence/reordering contracts, so keep compact metadata and window only thumbnails. Store all decoded frames wastes memory; bounded lookahead/cache supports long archives.

## Consequences
Explicit filters required in active image/export/date queries. Trash consumes storage until owner permanently deletes it. Copy duplicates bytes intentionally for independent deletion/alignment. No background integrity scan; health checks are requested and status reports the time checked. Cloudflare auth and profile ownership validation remain in force. No production changes before review.
