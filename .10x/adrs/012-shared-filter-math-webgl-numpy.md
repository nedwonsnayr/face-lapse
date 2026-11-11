# ADR-012: Shared filter math in WebGL and numpy

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** timelapse-filters
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Timelapse filters must apply instantly to playback and identically to the downloaded MP4. Playback shows decoded `<img>` frames (the `frame` variant, at most 600×800). Export composes each frame in Pillow at 1024×1384 inside the paper artboard (ADR-006). The filter includes:
- color adjustments
- fade
- tint with blend modes
- vignette
- grain that changes every frame

Custom presets are shared across people and devices.

## Decision
1. **Write the pipeline ourselves.** The spec `specs/2026-11-10-timelapse-filters-design.md` pins it down exactly: fixed order, explicit matrices and blend formulas, integer grain hashing. It is implemented twice:
   - **WebGL2 fragment shader** for playback: `texelFetch` at native resolution, with no color-space conversion on upload.
   - **numpy** for export, applied to the resized photo before it's pasted.
   
   A Playwright matching test holds the two within 2/255 per channel.
2. **The client sends the full validated definition** with each export, not a preset ID. The canonical definition is part of the export cache key (`styled-export-v2`).
3. **Custom presets go in a new, unscoped `filter_presets` SQLite table** behind `/api/filters`. Built-ins live in the frontend only.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| CSS `filter` + `mix-blend-mode` overlays for preview, Pillow mimic for export | Least frontend code; no WebGL | No CSS primitive for fade or moving grain; browser blend math, color space and rounding aren't ours to match; parity would be approximate | User wants the full look and an identical download |
| Server renders filtered preview frames | Exact parity, one implementation | Not instant (refetch every frame on each slider move), CPU load on the free VM, breaks frame caching | Fails "immediately apply" |
| Canvas 2D per-pixel JS | No GPU dependency | ~2M pixels per frame on the main thread; too slow for playback at 0.05 s per frame | Performance |
| Send preset ID to export | Smaller request | Export depends on preset lifecycle; built-ins would need a backend copy; editor drafts can't be exported unsaved | Definition is small and self-contained |

## Consequences
### Positive
- Instant preview: uniforms update on the next animation frame.
- An identical look, and identical grain, in the download.
- Unfiltered exports stay byte-identical, because identity skips the step.
- Built-ins can change without a backend deploy.
### Negative
- Two implementations of the same math must stay in step. This is mitigated by the normative spec and the matching test in CI.
- Adds a WebGL2 dependency to the preview, with a plain-image fallback and a note.
- Export is about 50–100 ms per frame slower when filtered, and grain makes MP4s about 2–3× larger.
### Risks
- **GPU float precision or driver rounding drift.** Mitigated by the 2/255 tolerance and integer-only grain math.
- **WebGL context loss on mobile.** Fall back to `<img>` and recreate on restore.
- **Preview frames (600×800) and export photos (1024×1384) come from different resamplings.** The match is defined on equal input, and the visual difference is resampling only.

## Dependencies
- Builds on ADR-006 (Pillow composition) and ADR-007 (export cache key), and adds migration 011.
- Constrains future filter features: a new control needs a spec formula, both implementations and test cases. Filter definitions carry a `version` for later changes.
