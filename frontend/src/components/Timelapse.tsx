import React, { useCallback, useEffect, useRef, useState } from "react";
import { generateVideo, getAlignedImageUrl } from "../api";
import SpeedSlider from "./SpeedSlider";
import styles from "./Timelapse.styles";

interface TimelapseProps {
  /** IDs of included+aligned images, in display order */
  imageIds: number[];
}

export default function Timelapse({ imageIds }: TimelapseProps) {
  const [frameDuration, setFrameDuration] = useState(0.1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear and restart interval whenever frameDuration or isPlaying changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && imageIds.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % imageIds.length);
      }, frameDuration * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [frameDuration, isPlaying, imageIds.length]);

  // Reset index if imageIds change
  useEffect(() => {
    setCurrentIndex(0);
  }, [imageIds.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateVideo(frameDuration);
      // Trigger download via a temporary link
      const url = `/api/video/${res.video_filename}`;
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date()
        .toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        })
        .replace(/\//g, "-");
      a.download = `face-lapse-${dateStr}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [frameDuration]);

  if (imageIds.length === 0) {
    return (
      <div style={styles.section}>
        <h2 style={styles.heading}>Timelapse</h2>
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            No aligned images yet. Upload and align some selfies to see the
            timelapse.
          </p>
        </div>
      </div>
    );
  }

  const currentId = imageIds[currentIndex];

  return (
    <div style={styles.section}>
      <h2 style={styles.heading}>Timelapse</h2>

      {/* Slideshow */}
      <div style={styles.player}>
        <img
          src={getAlignedImageUrl(currentId)}
          alt={`Frame ${currentIndex + 1}`}
          style={styles.frame}
        />
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.scrubRow}>
          <button style={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={imageIds.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setCurrentIndex(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            style={styles.scrubber}
          />
          <span style={styles.scrubLabel}>
            {currentIndex + 1} / {imageIds.length}
          </span>
        </div>

        <SpeedSlider value={frameDuration} onChange={setFrameDuration} />

        <div style={styles.info}>
          <p style={styles.infoText}>
            Duration:{" "}
            <strong>
              {(imageIds.length * frameDuration).toFixed(1)}s
            </strong>{" "}
            ({imageIds.length} frames)
          </p>
        </div>

        <button
          style={{
            ...styles.downloadBtn,
            ...(isGenerating ? styles.downloadBtnDisabled : {}),
          }}
          onClick={handleDownload}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Download Video"}
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

