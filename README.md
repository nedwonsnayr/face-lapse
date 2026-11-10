# Face Lapse

Align selfies by eye position and generate a timelapse video.

![Face Lapse demo](demo.gif)

[![E2E Tests](https://github.com/nedwonsnayr/face-lapse/actions/workflows/e2e-tests.yml/badge.svg)](https://github.com/nedwonsnayr/face-lapse/actions/workflows/e2e-tests.yml)

## Prerequisites

- Python 3.12+
- Node.js 18+
- FFmpeg
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg` (Ubuntu/Debian) or use your distribution's package manager

## Setup

```bash
make install
```

This creates a Python virtual environment, installs backend dependencies, and installs frontend packages.

## Running

**macOS Quick launch** — double-click `Face Lapse.command` in Finder. It starts both servers, opens your browser, and stops everything when you close the terminal window. Drag it to the Dock for a shortcut.

**Via Make (macOS & Linux):**

```bash
make start        # Start both backend and frontend
make backend      # Start only the backend (port 8000)
make frontend     # Start only the frontend (port 5173)
```

Then open http://localhost:5173

> **Note:** The `Face Lapse.command` file and `open` command used in startup scripts are macOS-specific. On Linux, use the `make` commands above.

## Hosting

To run it in the cloud and reach it from anywhere (Oracle Cloud free VM + Cloudflare login + nightly B2 backups, about $11/yr), see [docs/hosting.md](docs/hosting.md).

## Usage

1. **Upload** — Drag and drop selfies (or click to browse). Files are uploaded in batches and sorted by photo date (from EXIF or filename). Each image is auto-numbered sequentially. Supports JPG, PNG, WebP, and HEIC.
2. **Review** — Thumbnails of uploaded originals appear in a staging area. Remove any wrong ones before proceeding.
3. **Align** — Click "Align Images" to run face detection and alignment. A progress bar tracks each image.
4. **Choose your face** — When multiple faces are detected, the photo waits in **Choose your face**. Click the photo, select your numbered face outline, then **Align this face**. Your choice is saved for that photo and reused on re-alignment. The review queue survives reloads. Use **Change face** (the eye icon) on a library photo to pick again. Detection is best-effort; only detected faces can be selected.
5. **Library** — Browse aligned images. Toggle inclusion/exclusion, reorder with arrow buttons, or dismiss "no face detected" images in bulk.
6. **Timelapse** — A live slideshow plays through your aligned images. Adjust the speed slider in real-time and scrub to any frame.
7. **Download** — Click "Download Video" to generate a 1200×1800 MP4 with the same paper background, dark photo mat, italic date and red age caption as the preview. Date and age are independent: show either, both or neither. Age needs a birthday and a photo date, even when the date caption is hidden. Playback controls are not included in the video.

## Data Management

```bash
make reset-db     # Delete database, images, and videos (with confirmation)
```

All data is stored in the `data/` directory (git-ignored):

| Folder | Contents |
|---|---|
| `data/originals/` | Uploaded images named as sequential integers |
| `data/aligned/` | Face-aligned images (matching integer names) |
| `data/videos/` | Generated timelapse MP4s |
| `data/thumbs/` | Resized copies for the UI (made on demand; safe to delete) |
| `data/face_lapse.db` | SQLite database |

## How It Works

- **Face detection**: MediaPipe Face Mesh locates eye landmarks in each image. If whole-photo detection fails, a bounded search of overlapping crops helps find smaller, distant faces; detections are mapped back to the original and duplicates merged. HEIC support via pillow-heif. EXIF orientation is applied before detection to handle rotated iPhone photos.
- **Alignment**: An affine transform (rotate, scale, translate) maps each face so the eyes land at consistent positions across all images.
- **Sorting**: Images are sorted by photo date (EXIF `DateTimeOriginal`, then filename date parsing for AirDrop-style names), with numeric filename as a fallback.
- **Video generation**: FFmpeg stitches the aligned images into an MP4 at the configured frame rate.

## Tests

`make test-backend` runs the detector/API/migration regression tests with a temporary database. `make test-e2e` runs the browser suite with isolated data. `cd frontend && npm run build` checks TypeScript and the production bundle. `make install` includes test dependencies; the production Docker image uses only runtime requirements.

## People

Use **Add person** beside the person tabs to start another library. Each person has separate uploads, face choices, ordering, birthday and exports under your existing login. **Edit person** changes their name or optional birthday. The selected tab is remembered on each device; unfinished uploads return to that person's staging tray.

Existing photos stay in **Ryan** when migration 008 runs. The migration adds ownership in SQLite without moving photo files. Backups include every person's data automatically. Profiles are collections for the same owner, not separate user accounts.

### Working with a long archive

- **Library:** Jump to a year/month, filter dates, or search the original filename. Grid and list views render only nearby rows, keeping large archives responsive. Library filters do not change the timelapse.
- **Capture:** Use the previous selfie as a faint framing guide and choose an off/3/5-second timer. Closing the camera cancels the countdown. The guide is never included in the saved photo.
- **Trash:** Deleting or dismissing no-face photos moves them to Trash. Undo the latest trash action or open Trash to restore a photo. There is no automatic expiry; permanent deletion requires confirmation. Cancelled staged uploads also remain recoverable in Trash.
- **People:** Use Select photos to move or copy photos to another person. Copies have independent files and alignment choices. A destination duplicate stops the whole selection without changing anything.
- **Then & now:** Compare any two aligned photos side by side or with an adjustable slider.
- **Exports:** Expand Choose photos & export presets to select a date range or one photo per day/week/month. The preview and export use the same selection; sampling chooses the earliest dated photo in each period (weeks begin Monday). Presets remember selection, speed and caption choices on this device for this person.
- **Archive health:** Check file presence, pending alignment, face choices and Trash counts on demand. Backup status reports the last recorded successful run for the whole archive, and flags it overdue after 36 hours. Until the updated backup script runs, status is explicitly unknown. A file-presence check is not a backup restore test.
