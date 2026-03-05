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

## Usage

1. **Upload** — Drag and drop selfies (or click to browse). Files are uploaded in batches and sorted by photo date (from EXIF or filename). Each image is auto-numbered sequentially. Supports JPG, PNG, WebP, and HEIC.
2. **Review** — Thumbnails of uploaded originals appear in a staging area. Remove any wrong ones before proceeding.
3. **Align** — Click "Align Images" to run face detection and alignment. A progress bar tracks each image.
4. **Library** — Browse aligned images. Toggle inclusion/exclusion, reorder with arrow buttons, or dismiss "no face detected" images in bulk.
5. **Timelapse** — A live slideshow plays through your aligned images. Adjust the speed slider in real-time and scrub to any frame.
6. **Download** — Click "Download Video" to generate and download an MP4.

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

- **Face detection**: MediaPipe Face Mesh locates eye landmarks in each image. HEIC support via pillow-heif. EXIF orientation is applied before detection to handle rotated iPhone photos.
- **Alignment**: An affine transform (rotate, scale, translate) maps each face so the eyes land at consistent positions across all images.
- **Sorting**: Images are sorted by photo date (EXIF `DateTimeOriginal`, then filename date parsing for AirDrop-style names), with numeric filename as a fallback.
- **Video generation**: FFmpeg stitches the aligned images into an MP4 at the configured frame rate.

## Deployment

### GitHub Pages (Frontend)

The frontend can be deployed to GitHub Pages. See `.github/workflows/deploy-pages.yml` for the deployment workflow.

**Setup:**
1. Enable GitHub Pages in your repository settings
2. Set GitHub Actions secrets:
   - `VITE_API_BASE`: Your backend API URL (e.g., `https://your-backend.railway.app/api`)
   - `VITE_REQUIRE_AUTH`: Set to `true` for production

### Backend Deployment

The backend can be deployed to Railway, Render, or any platform that supports Docker/Python.

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string (or leave unset for SQLite in local dev)
- `REQUIRE_AUTH`: Set to `true` in production
- `USE_CLOUD_STORAGE`: Set to `true` in production
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`: Cloudflare R2 credentials
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: GitHub OAuth app credentials
- `JWT_SECRET_KEY`: Secret key for JWT tokens (use a strong random string)
- `CORS_ORIGINS`: Comma-separated list of allowed origins (your GitHub Pages URL)

See `backend/.env.example` for all available environment variables.

**Local Development:**
- Authentication is disabled by default (`REQUIRE_AUTH=false`)
- Uses SQLite database and local file storage
- No login required for testing

**Production:**
- Authentication required via GitHub OAuth
- Uses PostgreSQL database and cloud storage (R2)
- Users must sign in to access their images
