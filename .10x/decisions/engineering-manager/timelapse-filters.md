# Engineering Manager: timelapse-filters
Single PR on `timelapse-filters`, about 4 days.
1. Definition, validation and built-ins (frontend and backend).
2. numpy engine and unit tests, wired into `render_video_frame`.
3. WebGL2 renderer, `FilterCanvas`, and integration into `BufferedFrame`.
4. Matching harness: reference script plus Playwright spec.
5. `FilterPreset` table, migration 011, `/api/filters` and tests.
6. Export body and cache key; filter copy in saved export presets.
7. `FilterPicker` chips and thumbnails.
8. `FilterEditor` (create, duplicate, edit, delete).
9. QA and security, visual pass, PR, design system and ops notes.

Risks:
- WebGL behavior in headless Chromium (SwiftShader) for the matching test.
- Export slowdown on the ARM VM, to be measured in QA.
