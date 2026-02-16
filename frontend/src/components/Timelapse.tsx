import React, { useCallback, useEffect, useRef, useState } from "react";
import { generateVideo, getAlignedImageUrl, ImageRecord } from "../api";
import SpeedSlider from "./SpeedSlider";
import styles from "./Timelapse.styles";

interface TimelapseProps {
  /** Included+aligned images, in display order */
  images: ImageRecord[];
}

export default function Timelapse({ images }: TimelapseProps) {
  const [frameDuration, setFrameDuration] = useState(0.05);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDates, setShowDates] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear and restart interval whenever frameDuration or isPlaying changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && images.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }, frameDuration * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [frameDuration, isPlaying, images.length]);

  // Reset index if images change
  useEffect(() => {
    setCurrentIndex(0);
  }, [images.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateVideo(frameDuration, showDates);
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
  }, [frameDuration, showDates]);

  if (images.length === 0) {
    return (
      <div style={styles.section}>
        <h2 style={styles.heading}>Timelapse</h2>
        <div style={styles.empty}>
          <p data-testid="empty-timelapse-message" style={styles.emptyText}>
            No aligned images yet. Upload and align some selfies to see the
            timelapse.
          </p>
        </div>
      </div>
    );
  }

  const currentImage = images[currentIndex];
  const currentDate = currentImage?.photo_taken_at
    ? new Date(currentImage.photo_taken_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div style={styles.section}>
      <h2 style={styles.heading}>Timelapse</h2>

      {/* Slideshow */}
      <div data-testid="timelapse-player" style={styles.player}>
        <img
          data-testid="timelapse-frame"
          src={getAlignedImageUrl(currentImage.id)}
          alt={`Frame ${currentIndex + 1}`}
          style={styles.frame}
        />
        {showDates && currentDate && (
          <div data-testid="timelapse-date-overlay" style={styles.dateOverlay}>
            {currentDate}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.scrubRow}>
          <button data-testid="play-pause-button" style={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <input
            data-testid="timelapse-scrubber"
            type="range"
            min={0}
            max={images.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setCurrentIndex(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            style={styles.scrubber}
          />
          <span data-testid="frame-counter" style={styles.scrubLabel}>
            {currentIndex + 1} / {images.length}
          </span>
        </div>

        <SpeedSlider value={frameDuration} onChange={setFrameDuration} />

        <div style={styles.toggleRow}>
          <label style={styles.toggleLabel}>
            <input
              data-testid="show-dates-toggle"
              type="checkbox"
              checked={showDates}
              onChange={(e) => setShowDates(e.target.checked)}
              style={styles.toggleInput}
            />
            Show date in timelapse
          </label>
        </div>

        <div style={styles.info}>
          <p style={styles.infoText}>
            Duration:{" "}
            <strong>
              {(images.length * frameDuration).toFixed(1)}s
            </strong>{" "}
            ({images.length} frames)
          </p>
        </div>

        <button
          data-testid="download-video-button"
          style={{
            ...styles.downloadBtn,
            ...(isGenerating ? styles.downloadBtnDisabled : {}),
          }}
          onClick={handleDownload}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Download Video"}
        </button>

        {error && <p data-testid="timelapse-error" style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

