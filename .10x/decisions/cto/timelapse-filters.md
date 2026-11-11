# CTO: timelapse-filters
- **Verdict:** build. It runs on our existing stack (WebGL2 in the browser, numpy and Pillow on the server) with no new runtime dependencies and $0 upkeep.
- **Build vs buy:** none of the off-the-shelf options fit. CSSgram-style CSS can't do moving grain and won't match the export. LUT libraries are overkill for one owner.
- **Cost accepted:** filtered exports run about 50–100 ms per frame slower, and grain makes files about 2–3× larger. Unfiltered exports are unchanged.
- **Direction:** filter definitions are versioned data, so new controls can be added without breaking presets that were already saved.
