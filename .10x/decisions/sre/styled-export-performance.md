# Styled export performance — measured 2026-11-09

User asked why Download Video takes so long. Read-only production diagnostics at live revision f6f0318 showed one export starting 19:14:12 UTC for 1,043 photos at 0.05 s/photo (52.15 s playback), dates and age enabled. It completed at 19:18:37 UTC: **265.2 seconds (4m25s)**, output timelapse_3453c5014ff04bc4b636ce65fa7a69c6.mp4. Container utilization observed during generation: ~398% CPU, 666.5 MiB RAM. No export error in the selected logs. No production data changed by diagnostics.

Code path: every click starts a fresh job; every frame rebuilds the same paper/mat/shadow and loads fonts, resizes/pastes the photo, paints captions, and writes a quality-95 temporary JPEG. After preprocessing, FFmpeg encodes the sequence with libx264 preset medium. UI polls until completion, then initiates file transfer; it exposes only Generating, without phase/progress. Existing logs report only total duration, so relative render/encode costs were not profiled here.

Potential follow-up: measure phase costs; reuse the static layout/font setup, cache/reuse completed exports keyed by all library/options inputs, evaluate a faster encoding preset with quality/size measurements, and expose rendering/encoding progress. No optimization or deployment requested/performed in this diagnostic turn.
