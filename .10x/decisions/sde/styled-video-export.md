# Styled video export — implementation

Pillow now composes every frame on a 1200x1800 paper artboard with dark mat, shadow, bundled Fraunces italic date and tracked red Inter age. Explicit independent show_dates/show_age reach preview, API, job and renderer. Age uses the photo date even when hidden; missing/invalid birthday fails clearly when age requested. Calendar-only birthday handling fixes timezone day shifts. Unique MP4 outputs and explicit rational sequence rate prevent options overwrites and timing quantization. Failed rendering fails export; no bare-frame fallback. Sources/metadata unchanged. Font licenses/provenance bundled; no new runtime dependency. Added renderer/encoded-media/API/browser four-mode tests and calendar regression. No schema or hosted-library changes.

Visual finish: date 56px and age 26px/3px tracking on the 1080px mat match the supplied screenshot caption-to-frame proportions more closely. Media caption checks retained.
