# ADR-005: Bounded overlapping crop search
Status: Accepted
Date: 2026-11-09
Feature: crop-search-fallback

## Context
Full-body photos can contain faces too small for the existing full-frame model. The supplied example fails full-frame detection but succeeds on a central half-size crop.

## Decision
After existing detection yields zero faces, search a fixed 3x3 grid of 50%-sized overlapping crops using existing Face Mesh at at most 1024 px per crop. Remap geometry to the oriented original, deduplicate the same physical face, return at most ten candidates. Preserve one-face automation and manual selection semantics. No schema/API changes.

## Alternatives
Center-only crop: cheaper but misses people near frame edges. New face-recognition/detector stack: more dependencies, calibration and operational risk. Unbounded recursive tiles: unpredictable latency/false positives. Fixed grid gives bounded cost and adequate enlargement for the observed example.

## Consequences
At most nine extra model calls when the original search fails; successful single/group photos keep their current speed. Some very small/obscured faces may still be missed. Overlapping crops require careful coordinate mapping and duplicate suppression, covered by real and synthetic regressions. User's photo remains local and excluded from git/test artifacts uploaded externally.
