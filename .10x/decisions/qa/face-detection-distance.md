# Face detection at a distance — diagnosis (2026-11-09)

User supplied IMG_2280.HEIC to explain a detection failure. Local-only diagnostics; original file unchanged and not copied into the repository or uploaded.

- HEIF decoding succeeds: 3213 x 5712 RGB, EXIF orientation 1.
- Exact current app pipeline: zero faces.
- Full-frame Face Mesh at maximum dimensions 2048, 1280, 1024, 768 and 512, threshold 0.2: zero faces at each size.
- Standalone short/full-range face detectors at threshold 0.3 also find zero on the full frame.
- An oriented crop around both foreground faces (x=15–85%, y=35–65%) yields two Face Mesh detections using the same app service.

Conclusion: observed scale/composition sensitivity of detection, not a failed HEIC decode. The new picker cannot help until candidates are detected. Potential follow-up: overlapping crop/tile fallback with coordinates mapped back to the original; keep the original image intact. No implementation, deployment or identity matching performed.
