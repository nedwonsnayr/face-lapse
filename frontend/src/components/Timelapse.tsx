import React, { useCallback, useEffect, useRef, useState } from "react";
import { generateVideo, getAlignedImageUrl, ImageRecord } from "../api";
import SpeedSlider from "./SpeedSlider";
import DatePicker from "./DatePicker";
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
  const [showAge, setShowAge] = useState(true);
  const [birthday, setBirthday] = useState("1995-10-06"); // Default to 10/06/1995
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear and restart interval whenever frameDuration or isPlaying changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && images.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % images.length;
          return next;
        });
      }, frameDuration * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [frameDuration, isPlaying, images.length]);

  // Reset index if images change or if currentIndex is out of bounds
  useEffect(() => {
    if (images.length > 0 && currentIndex >= images.length) {
      setCurrentIndex(0);
    } else if (images.length === 0) {
      setCurrentIndex(0);
    }
  }, [images.length, currentIndex]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateVideo(frameDuration, showDates, showAge ? birthday : null);
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
  }, [frameDuration, showDates, showAge, birthday]);

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

  // Ensure currentIndex is within bounds (useEffect will fix it if needed)
  const safeIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
  const currentImage = images[safeIndex];

  // Calculate age based on birthday and image date
  const calculateAge = (imageDate: string | null): number | null => {
    if (!imageDate || !birthday) return null;
    
    const birthDate = new Date(birthday);
    const photoDate = new Date(imageDate);
    
    if (isNaN(birthDate.getTime()) || isNaN(photoDate.getTime())) return null;
    
    let age = photoDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = photoDate.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && photoDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 0 ? age : null;
  };
  const currentDate = currentImage?.photo_taken_at
    ? new Date(currentImage.photo_taken_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const currentAge = showAge ? calculateAge(currentImage?.photo_taken_at || null) : null;

  return (
    <div style={styles.section}>
      <h2 style={styles.heading}>Timelapse</h2>

      {/* Slideshow */}
      <div data-testid="timelapse-player" style={styles.player}>
        {currentImage && (
          <img
            data-testid="timelapse-frame"
            src={getAlignedImageUrl(currentImage.id)}
            alt={`Frame ${safeIndex + 1}`}
            style={styles.frame}
          />
        )}
        {showDates && currentDate && (
          <div data-testid="timelapse-date-overlay" style={styles.dateOverlay}>
            <div>{currentDate}</div>
            {showAge && currentAge !== null && (
              <div style={styles.ageText}>Age: {currentAge}</div>
            )}
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
            value={safeIndex}
            onChange={(e) => {
              const newIndex = parseInt(e.target.value, 10);
              setCurrentIndex(Math.min(newIndex, images.length - 1));
              setIsPlaying(false);
            }}
            style={styles.scrubber}
          />
          <span data-testid="frame-counter" style={styles.scrubLabel}>
            {safeIndex + 1} / {images.length}
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
            Show date
          </label>
        </div>

        <div style={{
          ...styles.toggleRow,
          ...(!showDates ? styles.toggleRowDisabled : {}),
        }}>
          <label style={{
            ...styles.toggleLabel,
            ...(!showDates ? styles.toggleLabelDisabled : {}),
          }}>
            <input
              data-testid="show-age-toggle"
              type="checkbox"
              checked={showAge}
              onChange={(e) => setShowAge(e.target.checked)}
              disabled={!showDates}
              style={styles.toggleInput}
            />
            <span>Show age</span>
          </label>
          <div style={styles.birthdayContainer}>
            <label style={{
              ...styles.birthdayLabel,
              ...(!showDates ? styles.birthdayLabelDisabled : {}),
            }} htmlFor="birthday-input">
              Birthday:
            </label>
            <DatePicker
              id="birthday-input"
              data-testid="birthday-input"
              value={birthday}
              onChange={setBirthday}
              disabled={!showAge || !showDates}
            />
          </div>
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

