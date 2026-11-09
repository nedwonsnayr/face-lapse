# Crop-search fallback for distant faces

Approved on 2026-11-09: user said go ahead after recommendation for automatic crop search preserving the original photo. Supplied HEIC decodes normally but full-frame detection misses both foreground faces; a half-size center crop finds both.

Keep existing full-frame and downscaled detection first. Only if both return zero faces, search nine overlapping half-width/half-height crops (center first), each bounded to 1024 px maximum dimension. Map bounds and both eyes from tile coordinates into normalized coordinates of the EXIF-oriented original. Deduplicate overlapping detections using eye-center proximity or bounding-box overlap; cap returned candidates at the existing ten-face limit. Sort left-to-right for a stable picker. Continue the existing one-face automatic / multiple-face manual selection flow, including storing original-coordinate geometry for later re-alignment. Originals, storage schema, API shape, dependencies and existing face choices are unchanged.

Alternatives: center crop alone (misses off-center people), new detector/model (more dependencies and calibration), overlapping crops using existing model (selected). Search remains best-effort and bounded. Background people may be candidates if detected; user chooses the intended subject.

Validation: user's original HEIC locally only (not in repo or external uploads), public padded-face fixture for automated regression, correct coordinate remapping and overlap deduplication, no-face and close-up fast-path regressions, backend suite, browser suite, production build. No production photos are automatically reprocessed. User can re-align a failed photo to retry after installing the update.
