import { useCallback, useEffect, useRef, useState } from "react";
import Upload, { UploadHandle } from "./components/Upload";
import ImageLibrary from "./components/ImageLibrary";
import Timelapse from "./components/Timelapse";
import ErrorBoundary from "./components/ErrorBoundary";
import { Button } from "./components/ui/Button";
import Icon from "./components/ui/Icon";
import { ImageRecord, listImages, AlignResponse } from "./api";
import s from "./App.module.css";

function yearRange(images: ImageRecord[]): string | null {
  const years = images
    .map((img) => (img.photo_taken_at ? new Date(img.photo_taken_at).getFullYear() : NaN))
    .filter((y) => !isNaN(y));
  if (years.length === 0) return null;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max}`;
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

const REFRESH_MS = 30_000;

export default function App() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentUploadIds, setRecentUploadIds] = useState<Set<number>>(new Set());
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const uploadRef = useRef<UploadHandle>(null);

  const fetchImages = useCallback(async () => {
    try {
      const data = await listImages();
      setImages(data);
    } catch (err) {
      console.error("Failed to fetch images:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Keep in step with other devices: re-check when the tab comes back into view
  // and every REFRESH_MS while it's visible. Cheap: unchanged lists come back as
  // 304 (ETag), and listImages() then returns the same array, so React skips
  // the re-render. Skipped mid-drag so a reorder isn't yanked out from under you.
  const draggingRef = useRef(false);
  const handleDraggingChange = useCallback((dragging: boolean) => {
    draggingRef.current = dragging;
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !draggingRef.current) fetchImages();
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchImages]);

  // Drop-anywhere: show an overlay while files are dragged over the window.
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setIsDraggingFiles(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFiles(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setIsDraggingFiles(false);
      // The dropzone handles its own drops; anything else lands here.
      if (!(e.target as HTMLElement).closest?.("[data-testid='dropzone']")) {
        uploadRef.current?.addFiles(Array.from(e.dataTransfer?.files ?? []));
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const handleAlignComplete = useCallback(
    (result: AlignResponse) => {
      setRecentUploadIds(new Set(result.results.map((r) => r.id)));
      fetchImages();
    },
    [fetchImages]
  );

  const handleDismissRecent = useCallback(() => {
    setRecentUploadIds(new Set());
  }, []);

  // Uploads waiting to be aligned (possibly staged on another device) belong to
  // the upload tray, not the library.
  const libraryImages = images.filter((img) => !img.pending);
  const includedImages = libraryImages.filter((img) => img.included_in_video && img.has_aligned);
  const range = yearRange(libraryImages);

  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.mark} aria-hidden="true">
            <Icon name="aperture" size={20} />
          </span>
          <h1 className={s.wordmark}>
            Face <em>Lapse</em>
          </h1>
        </div>
        <div className={s.topbarRight}>
          {libraryImages.length > 0 && (
            <p className={s.stats}>
              <span className={s.statNum}>{libraryImages.length.toLocaleString()}</span> photos
              {range && (
                <>
                  <span className={s.dot} aria-hidden="true">·</span>
                  {range}
                </>
              )}
            </p>
          )}
          <Button
            variant="primary"
            icon="plus"
            onClick={() => uploadRef.current?.openFilePicker()}
          >
            Add photos
          </Button>
        </div>
      </header>

      <main className={s.shell}>
        <section className={s.libraryPane} aria-label="Library">
          <ErrorBoundary section="Upload">
            <Upload
              ref={uploadRef}
              compact={!loading && libraryImages.length > 0}
              onAlignComplete={handleAlignComplete}
            />
          </ErrorBoundary>

          {loading ? (
            <p data-testid="loading-message" className={s.loading}>
              Loading library…
            </p>
          ) : (
            <ErrorBoundary section="Image Library">
              <ImageLibrary
                images={libraryImages}
                recentUploadIds={recentUploadIds}
                onRefresh={fetchImages}
                onDismissRecent={handleDismissRecent}
                onDraggingChange={handleDraggingChange}
              />
            </ErrorBoundary>
          )}
        </section>

        <aside className={s.studioPane} aria-label="Timelapse">
          {!loading && (
            <ErrorBoundary section="Timelapse">
              <Timelapse images={includedImages} />
            </ErrorBoundary>
          )}
        </aside>
      </main>

      {isDraggingFiles && (
        <div className={s.dropOverlay} aria-hidden="true">
          <div className={s.dropCard}>
            <Icon name="upload" size={28} />
            <p className={s.dropTitle}>Drop to add photos</p>
            <p className={s.dropHint}>JPG, PNG, WebP or HEIC</p>
          </div>
        </div>
      )}
    </div>
  );
}
