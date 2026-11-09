# Face Lapse analysis — 2026-11-09

Reviewed repository: `/Users/ryansnowden/src/face-lapse`, branch `timelapse-date-order`, commit `1498415`. Scope: source, existing 10x records, build, Chromium end-to-end tests, and isolated diagnostic probes. No application code changes. No production access, infrastructure inspection, dependency advisory audit, or new visual design review.

## Assessment

The app has a coherent upload → review → align → organize → preview → export workflow. React/TypeScript components, one API module, FastAPI routers/services, SQLite metadata, and filesystem media are understandable boundaries for the documented personal, single-user use. Existing work includes HEIC and EXIF handling, duplicate detection, shared ordering for library/player/export, responsive CSS Modules, image resizing, background video jobs, Cloudflare Access verification, encrypted backup scripts, and a hosting runbook.

The strongest immediate opportunity is correctness and recovery in the existing workflow. Passing happy-path browser tests currently leave meaningful gaps in media contents, output timing, interrupted uploads, and concurrent exports.

## Findings, ordered by impact

### 1. P1 — Original and aligned thumbnail caches collide (reproduced)

`backend/app/services/resize.py:30–35` keys cached JPEGs by image ID, original-file content hash, and requested size, without the source kind. Both original and aligned routes call the same function. Loading a staging original thumbnail can therefore populate the filename later returned for the aligned library thumbnail. The normal batch alignment path does not purge that cache.

Probe: created a red original and blue aligned source; requested each using the same ID, version, and `thumb` size. Both returned the same path, and the aligned response was red `(254, 0, 0)`. This can make alignment appear broken while the actual aligned file is correct. If an original `frame` rendition is requested first, the same collision can affect playback.

Recommendation: distinguish source kind and derived-output revision in disk and browser cache keys. Realigning also leaves the original-file content hash unchanged, despite responses being marked immutable for a year; disk purge alone does not invalidate browser copies.

### 2. P1 — Reloading strands staged uploads (source-confirmed)

`frontend/src/components/Upload.tsx:45–49` initializes stage and staged images in component memory. The component never reconstructs the tray from the API. `frontend/src/App.tsx:123` removes pending records from the library. After uploading and reloading before alignment, the originals and pending DB rows survive, but neither the library nor staging tray exposes them. Reuploading returns duplicate records, which `handleAlign` excludes.

The same recovery gap affects an earlier successful batch when a subsequent batch fails: `uploadImages` throws before returning accumulated successes. This is a UI recovery problem, not proof that original bytes are lost.

Recommendation: reconstruct pending uploads from server state and provide resume/discard actions. Verify reload and partial-batch failure behavior explicitly.

### 3. P1 — Export jobs share output files and have no running-job limit (source-confirmed)

`backend/app/services/video.py:123–126` derives the output name only from rounded frame duration and the dates flag. Different birthdays, library revisions, and jobs with the same options overwrite the same MP4. FFmpeg uses `-y` and writes directly to the final path. Two devices or tabs can start overlapping jobs and collide; a later job can also replace a completed job's downloadable result.

`backend/app/routers/video.py:62–70` removes only completed jobs. `_MAX_JOBS = 20` does not cap running jobs or FFmpeg processes.

Recommendation: immutable per-job output paths, atomic publication, and a bounded worker/queue or explicit single-export admission rule. Verify two overlapping exports and downloading an earlier result after a newer export.

### 4. P2 — MP4 timing does not match the requested speed (reproduced)

`backend/app/services/video.py:169–194` uses the concat demuxer with image inputs and no explicit input time base/output cadence. The final image is repeated. FFprobe of three synthetic frames produced:

| Seconds per photo | Expected total | Measured MP4 total |
|---|---:|---:|
| 0.01 | 0.03 s | 0.12 s |
| 0.05 | 0.15 s | 0.20 s |
| 0.10 | 0.30 s | 0.36 s |

Reported frame rate was 25 fps. These short probes establish a mismatch; they do not measure drift over the full personal library. Very fast settings can also be quantized into the image-input time base.

Recommendation: define supported export cadence explicitly and validate decoded frame order and duration at minimum/default/maximum speed, with a justified tolerance. Check actual media, not only that a download occurred.

### 5. P2 — Deployment does not wait for the test workflow (source-confirmed)

`.github/workflows/deploy.yml:3–5` starts deployment on every push to main. The E2E workflow runs on pull requests, schedule, and manual dispatch, with no dependency tying deployment to its result and no production-build step. Local branch protection settings were not inspected, so this is a missing workflow-level gate, not a claim that untested changes have been deployed.

Recommendation: gate automatic deployment on build and test success for the exact deployed commit. Keep manual overrides explicit.

### 6. P2 — Backend upload resource limits are absent (source-confirmed)

`backend/app/routers/images.py:81–90` reads a complete file into memory and saves it without an application byte, pixel, or batch-count limit or image-content validation. Unsupported extensions become `.jpg`. Frontend batching is not a backend enforcement boundary. Large or invalid files can consume memory/disk or remain in the workflow until decoding fails. The documented Cloudflare layer limits external request size, but does not address all per-file decoding costs or direct local calls.

Recommendation: enforce byte/count limits and decoded-image constraints at the API boundary, validate image content, and clean up failed uploads. Scope severity to the documented owner-only use; there is no evidence of anonymous access to production from this review.

### 7. P2 — Keyboard reordering is unavailable (source-confirmed)

`frontend/src/components/ImageLibrary.tsx:325–327` configures only `PointerSensor`. The drag handles receive focusable sortable attributes, but no keyboard sensor is registered. The README mentions arrow-button reordering, which is no longer present in the library.

Recommendation: support keyboard sorting and announcements, or provide explicit move controls. Verify focus and order persistence without a pointer.

### 8. P3 — AirDrop PM timestamps are parsed as AM (reproduced)

`backend/app/services/alignment.py` recognizes the AirDrop filename pattern, but ignores its AM/PM suffix. `2026-02-14 at 3.31.16 PM.jpg` parsed as `2026-02-14 03:31:16`. This can reverse same-day photo ordering; noon and midnight also need coverage.

Recommendation: parse the meridiem marker and test AM, PM, noon, and midnight.

## Additional observations

- Dates inferred from upload time/interpolation are stored in `photo_taken_at` without provenance. The UI/export cannot distinguish estimated dates from EXIF dates. This is relevant because chronology and age overlays are central to the app.
- `Timelapse.tsx` uses `new Date(birthday)` with local date getters, while the backend parses a calendar date. In time zones west of UTC, the frontend birthday becomes the previous local day, creating preview/export age disagreement around a birthday.
- Several mutation failures and initial library-fetch failures are only logged to the console. The user may see an apparently empty library or an action that silently did nothing.
- Authentication middleware is enabled only if both Cloudflare variables are set. A partial configuration does not fail startup. Production network/Access configuration was not checked, so no current exposure is asserted.
- Local development enables wildcard CORS without auth. Local-network binding and browser-origin policy deserve explicit treatment before broader use.
- Alignment keeps a DB transaction for a whole streamed batch; database/filesystem changes are not atomic. Crash, cancellation, and concurrent deletion paths need focused checks.
- The `.10x/status.md` and handoff still describe branches/secrets as pending even though current history contains merged work. Existing reports are useful historical evidence, but do not establish current deployment or backup health.

## Validation

- `npm run build`: passed (TypeScript and Vite production build).
- Existing Chromium Playwright suite: **38/38 passed in 25.9 seconds**.
- Thumbnail source-collision diagnostic: reproduced.
- Video generation plus FFprobe timing at 0.01, 0.05, and 0.10 seconds: reproduced mismatch.
- AirDrop PM filename diagnostic: reproduced.
- All runs used `/private/tmp/face-lapse-analysis-20261109` and throwaway data. The initial sandboxed server bind was denied; the test rerun with local-port permissions passed. No production photos or database were used.
- Existing browser coverage is strong on basic workflow, duplicate handling, ordering, view switching, and controls. It does not verify the media-content collision, resumed staging, export concurrency, or decoded MP4 timing. JWT and backup checks in earlier notes were ad hoc; no persistent automated suite for those controls was found.

## Suggested sequence

1. Correct cache identity and add pending-upload recovery.
2. Isolate and bound export jobs, then establish accurate export timing.
3. Add regression checks for those observed failures, plus authentication and upload limits.
4. Connect build/test success to deployment and refresh operational state from verified facts.
5. Address keyboard sorting, date provenance, calendar handling, and visible errors.

This review is complete. Remediation design and implementation have not been approved or performed. No architecture replacement or new feature expansion is needed to address the concrete findings.
