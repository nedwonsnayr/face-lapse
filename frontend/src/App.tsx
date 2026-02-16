import { useCallback, useEffect, useState } from "react";
import Upload from "./components/Upload";
import ImageLibrary from "./components/ImageLibrary";
import Timelapse from "./components/Timelapse";
import ErrorBoundary from "./components/ErrorBoundary";
import { ImageRecord, listImages, AlignResponse } from "./api";

export default function App() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentUploadIds, setRecentUploadIds] = useState<Set<number>>(
    new Set()
  );

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

  const includedImages = images
    .filter((img) => img.included_in_video && img.has_aligned);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Face Lapse</h1>
        <p style={styles.subtitle}>Selfie timelapse generator</p>
      </header>

      <main style={styles.main}>
        <ErrorBoundary section="Upload">
          <Upload onAlignComplete={handleAlignComplete} />
        </ErrorBoundary>

        {loading ? (
          <p data-testid="loading-message" style={styles.loading}>Loading library...</p>
        ) : (
          <>
            <ErrorBoundary section="Image Library">
              <ImageLibrary
                images={images}
                recentUploadIds={recentUploadIds}
                onRefresh={fetchImages}
                onDismissRecent={handleDismissRecent}
              />
            </ErrorBoundary>
            <ErrorBoundary section="Timelapse">
              <Timelapse images={includedImages} />
            </ErrorBoundary>
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "24px 20px 64px",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
    paddingTop: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  subtitle: {
    fontSize: 15,
    color: "var(--text-muted)",
    marginTop: 4,
  },
  main: {},
  loading: {
    textAlign: "center",
    color: "var(--text-muted)",
    padding: 40,
  },
};
