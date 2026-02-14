# Face Lapse

Align selfies by eye position and generate a timelapse video.

## Prerequisites

- Python 3.12+ (via miniforge3)
- Node.js 18+
- FFmpeg (`brew install ffmpeg`)

## Setup

```bash
make install
```

This creates a Python virtual environment, installs backend dependencies, and installs frontend packages.

## Running

```bash
make start        # Start both backend and frontend
make backend      # Start only the backend (port 8000)
make frontend     # Start only the frontend (port 5173)
```

Then open http://localhost:5173

## Usage

1. **Upload** — Drag and drop selfies (or click to browse). Files are automatically sorted by the numeric part of their filename (e.g. `IMG_0733` → `IMG_0744` → `IMG_0745`) and renamed to sequential integers (`1.heic`, `2.heic`, ...). No manual renaming needed.
2. **Review** — Check aligned images in the library. Toggle inclusion/exclusion for individual images, reorder with arrow buttons, or dismiss any "no face detected" images in bulk.
3. **Generate** — Adjust the speed slider and click Generate Video.
4. **Preview** — Watch and download your timelapse MP4. The most recent video loads automatically.

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
| `data/face_lapse.db` | SQLite database |

## How It Works

- **Face detection**: MediaPipe Face Mesh locates eye landmarks in each image.
- **Alignment**: An affine transform (rotate, scale, translate) maps each face so the eyes land at consistent positions across all images.
- **Video generation**: FFmpeg stitches the aligned images into an MP4 at the configured frame rate.
