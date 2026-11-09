import React, { useCallback, useEffect, useRef, useState } from "react";
import { generateVideo, getAlignedImageUrl, ImageRecord, VideoJob } from "../api";
import SpeedSlider from "./SpeedSlider";
import DatePicker from "./DatePicker";
import { Button, IconButton } from "./ui/Button";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./Timelapse.module.css";

// Frames to load ahead of the playhead.
const PRELOAD_AHEAD = 8;

interface TimelapseProps {
  /** Included+aligned images, in display order */
  images: ImageRecord[];
}

export default function Timelapse({ images }: TimelapseProps) {
  const [frameDuration, setFrameDuration] = useState(0.05);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [exportProgress, setExportProgress] = useState<VideoJob | null>(null);
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

  // Warm the browser cache with the next few frames so playback doesn't stall
  // waiting on the network. Keeps references until the next index change.
  useEffect(() => {
    if (images.length === 0) return;
    const start = Math.min(currentIndex, images.length - 1);
    const ahead: HTMLImageElement[] = [];
    for (let i = 1; i <= PRELOAD_AHEAD && i < images.length; i++) {
      const img = images[(start + i) % images.length];
      const el = new Image();
      el.decoding = "async";
      el.src = getAlignedImageUrl(img.id, img.content_hash, "frame");
      ahead.push(el);
    }
    return () => {
      ahead.length = 0;
    };
  }, [currentIndex, images]);

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

  const stepBackward = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => Math.min(images.length - 1, prev + 1));
  }, [images.length]);

  useEffect(() => {
    if (images.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPlaying) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        return;
      }

      const index = Math.min(currentIndex, Math.max(0, images.length - 1));

      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        stepBackward();
      } else if (event.key === "ArrowRight" && index < images.length - 1) {
        event.preventDefault();
        stepForward();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPlaying,
    currentIndex,
    images.length,
    stepBackward,
    stepForward,
  ]);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setExportProgress(null);
    setError(null);
    try {
      const res = await generateVideo(frameDuration, showDates, showAge ? birthday : null, showAge, setExportProgress);
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
      <div className={s.section}>
        <div className={s.header}>
          <h2 className={forms.eyebrow}>Timelapse</h2>
        </div>
        <div className={s.emptyMat}>
          <p data-testid="empty-timelapse-message" className={s.emptyText}>
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
    
    const birthDate = new Date(`${birthday}T00:00:00`);
    const photoDate = new Date(`${imageDate.slice(0, 10)}T00:00:00`);
    
    if (isNaN(birthDate.getTime()) || isNaN(photoDate.getTime())) return null;
    
    let age = photoDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = photoDate.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && photoDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 0 ? age : null;
  };
  const currentDate = currentImage?.photo_taken_at
    ? new Date(`${currentImage.photo_taken_at.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const currentAge = showAge ? calculateAge(currentImage?.photo_taken_at || null) : null;
  const canStepBackward = !isPlaying && safeIndex > 0;
  const canStepForward = !isPlaying && safeIndex < images.length - 1;

  const scrubFill = images.length > 1 ? (safeIndex / (images.length - 1)) * 100 : 0;
  const totalSeconds = images.length * frameDuration;

  return (
    <div className={s.section}>
      <div className={s.header}>
        <h2 className={forms.eyebrow}>Timelapse</h2>
        <span data-testid="frame-counter" className={s.counter}>
          {safeIndex + 1} / {images.length}
        </span>
      </div>

      {/* Player: the frame sits in a dark mat, like a print */}
      <figure className={s.figure}>
        <div data-testid="timelapse-player" className={s.mat}>
          {currentImage && (
            <img
              data-testid="timelapse-frame"
              src={getAlignedImageUrl(currentImage.id, currentImage.content_hash, "frame")}
              alt={`Frame ${safeIndex + 1}`}
              className={s.frame}
            />
          )}
        </div>
        <figcaption className={s.caption}>
          <div className={s.captionInner}>
            {showDates && currentDate && (
              <span data-testid="timelapse-date-overlay" className={s.captionDate}>{currentDate}</span>
            )}
            {showAge && currentAge !== null && (
              <span data-testid="timelapse-age-overlay" className={s.captionAge}>Age {currentAge}</span>
            )}
          </div>
        </figcaption>
      </figure>

      {/* Transport */}
      <div className={s.transport}>
        <IconButton
          data-testid="play-pause-button"
          icon={isPlaying ? "pause" : "play"}
          label={isPlaying ? "Pause" : "Play"}
          variant="solid"
          size="lg"
          onClick={togglePlay}
        >
          {/* Glyph kept in the DOM (visually hidden) as the button's stable text contract */}
          <span className={s.glyph} aria-hidden="true">
            {isPlaying ? "⏸" : "▶"}
          </span>
        </IconButton>
        <input
          data-testid="timelapse-scrubber"
          type="range"
          aria-label="Scrub frames"
          min={0}
          max={images.length - 1}
          value={safeIndex}
          onChange={(e) => {
            const newIndex = parseInt(e.target.value, 10);
            setCurrentIndex(Math.min(newIndex, images.length - 1));
            setIsPlaying(false);
          }}
          className={forms.range}
          style={{ "--fill": `${scrubFill}%` } as React.CSSProperties}
        />
        <div className={s.stepGroup}>
          <IconButton
            data-testid="step-backward-button"
            icon="chevronLeft"
            label="Previous frame"
            size="sm"
            onClick={stepBackward}
            disabled={!canStepBackward}
          />
          <IconButton
            data-testid="step-forward-button"
            icon="chevronRight"
            label="Next frame"
            size="sm"
            onClick={stepForward}
            disabled={!canStepForward}
          />
        </div>
      </div>

      {/* Settings */}
      <div className={s.panel}>
        <p className={cx(forms.eyebrow, s.panelTitle)}>Settings</p>

        <SpeedSlider value={frameDuration} onChange={setFrameDuration} />

        <div className={s.toggles}>
          <label className={forms.checkRow}>
            <input
              data-testid="show-dates-toggle"
              type="checkbox"
              checked={showDates}
              onChange={(e) => setShowDates(e.target.checked)}
              className={forms.checkbox}
            />
            Show date
          </label>

          <div className={s.ageRow}>
            <label className={forms.checkRow}>
              <input
                data-testid="show-age-toggle"
                type="checkbox"
                checked={showAge}
                onChange={(e) => setShowAge(e.target.checked)}
                className={forms.checkbox}
              />
              <span>Show age</span>
            </label>
            <div className={s.birthday}>
              <label
                className={cx(s.birthdayLabel, !showAge && s.birthdayLabelDisabled)}
                htmlFor="birthday-input"
              >
                Birthday
              </label>
              <DatePicker
                id="birthday-input"
                data-testid="birthday-input"
                value={birthday}
                onChange={setBirthday}
                disabled={!showAge}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Export */}
      <div className={s.export}>
        <dl className={s.summary}>
          <div>
            <dt>Length</dt>
            <dd>{totalSeconds.toFixed(1)}s</dd>
          </div>
          <div>
            <dt>Frames</dt>
            <dd>{images.length.toLocaleString()}</dd>
          </div>
        </dl>
        <Button
          data-testid="download-video-button"
          variant="primary"
          size="lg"
          icon="download"
          block
          onClick={handleDownload}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Download Video"}
        </Button>
        {isGenerating && <p role="status" data-testid="export-progress">
          {exportProgress?.phase === "encoding"
            ? "Encoding video…"
            : exportProgress?.phase === "rendering"
              ? `Preparing photos ${exportProgress.completed_frames ?? 0} of ${exportProgress.frame_count}…`
              : "Starting export…"}
        </p>}

        {error && (
          <p data-testid="timelapse-error" className={s.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
