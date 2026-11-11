# SRE: timelapse-prefetch
- **Load:** per viewer, playback now keeps up to 6 low-priority frame GETs in flight, about 3 s ahead (≤60 × ~45 KB). Frames are pre-resized on disk, so server cost is file serving.
- **Health check:** from Chrome DevTools on the live site, in Resource timing for `size=frame`:
  - The second loop should be all cache hits (transferSize 0).
  - Cadence should hold about 60 ms per frame at 0.05 s.
- **If it regresses:** check frame TTFB (Cloudflare → VM). A p90 TTFB well over 1 s would outrun a 3 s window only with sustained slowness, so look at VM load, for example during a filtered export.
