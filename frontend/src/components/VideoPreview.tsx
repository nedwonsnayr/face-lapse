import React, { useEffect, useState } from "react";
import {
  generateVideo,
  getLatestVideoUrl,
  checkVideoExists,
  GenerateResponse,
} from "../api";
import SpeedSlider from "./SpeedSlider";

interface VideoPreviewProps {
  imageCount: number;
}

export default function VideoPreview({ imageCount }: VideoPreviewProps) {
  const [frameDuration, setFrameDuration] = useState(0.1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState(0);
  const [hasExistingVideo, setHasExistingVideo] = useState(false);

  // On mount, check if a video already exists and auto-load it
  useEffect(() => {
    checkVideoExists().then((exists) => {
      if (exists) {
        setHasExistingVideo(true);
      }
    });
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await generateVideo(frameDuration);
      setResult(res);
      setHasExistingVideo(true);
      setVideoKey((k) => k + 1); // Force video element reload
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const showVideo = hasExistingVideo || result;

  return (
    <div style={styles.section}>
      <h2 style={styles.heading}>Generate Timelapse</h2>

      <div style={styles.controls}>
        <SpeedSlider value={frameDuration} onChange={setFrameDuration} />

        <div style={styles.info}>
          <p style={styles.infoText}>
            Estimated duration:{" "}
            <strong>{(imageCount * frameDuration).toFixed(1)}s</strong> (
            {imageCount} frames)
          </p>
        </div>

        <button
          style={{
            ...styles.generateBtn,
            ...(isGenerating || imageCount === 0
              ? styles.generateBtnDisabled
              : {}),
          }}
          onClick={handleGenerate}
          disabled={isGenerating || imageCount === 0}
        >
          {isGenerating ? "Generating..." : "Generate Video"}
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </div>

      {showVideo && (
        <div style={styles.videoContainer}>
          {result && (
            <div style={styles.resultInfo}>
              <span style={styles.resultSuccess}>
                Video created: {result.frame_count} frames,{" "}
                {result.total_duration.toFixed(1)}s
              </span>
            </div>
          )}
          {!result && hasExistingVideo && (
            <div style={styles.resultInfo}>
              <span style={styles.resultExisting}>
                Most recent video
              </span>
            </div>
          )}
          <video
            key={videoKey}
            controls
            autoPlay={!!result}
            loop
            style={styles.video}
            src={getLatestVideoUrl()}
          />
          <a
            href={getLatestVideoUrl()}
            download={`face-lapse-${new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-")}.mp4`}
            style={styles.downloadBtn}
          >
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: "var(--text)",
  },
  controls: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: 20,
  },
  info: {
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  generateBtn: {
    padding: "10px 28px",
    fontSize: 15,
    fontWeight: 600,
    borderRadius: "var(--radius-sm)",
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  generateBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  error: {
    marginTop: 12,
    fontSize: 14,
    color: "var(--danger)",
  },
  videoContainer: {
    marginTop: 20,
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    overflow: "hidden",
  },
  resultInfo: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  },
  resultSuccess: {
    fontSize: 13,
    color: "var(--success)",
  },
  resultExisting: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  video: {
    width: "100%",
    maxHeight: 600,
    display: "block",
    background: "#000",
  },
  downloadBtn: {
    display: "block",
    padding: "12px 16px",
    textAlign: "center",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--primary)",
    textDecoration: "none",
    borderTop: "1px solid var(--border)",
    transition: "background 0.15s",
  },
};
