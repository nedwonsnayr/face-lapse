import React, { useCallback, useEffect, useRef, useState } from "react";
import { generateVideo, getAlignedImageUrl, ImageRecord } from "../api";
import SpeedSlider from "./SpeedSlider";
import DatePicker from "./DatePicker";
import { Button, IconButton } from "./ui/Button";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./Timelapse.module.css";

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
      <div className={s.section}>
        <div className={s.header}>
          <p className={forms.eyebrow}>Timelapse</p>
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

  const scrubFill = images.length > 1 ? (safeIndex / (images.length - 1)) * 100 : 0;
  const totalSeconds = images.length * frameDuration;

  return (
    <div className={s.section}>
      <div className={s.header}>
        <p className={forms.eyebrow}>Timelapse</p>
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
              src={getAlignedImageUrl(currentImage.id)}
              alt={`Frame ${safeIndex + 1}`}
              className={s.frame}
            />
          )}
        </div>
        <figcaption className={s.caption}>
          {showDates && currentDate ? (
            <div data-testid="timelapse-date-overlay" className={s.captionInner}>
              <span className={s.captionDate}>{currentDate}</span>
              {showAge && currentAge !== null && (
                <span className={s.captionAge}>Age {currentAge}</span>
              )}
            </div>
          ) : (
            <span className={s.captionPlaceholder} aria-hidden="true" />
          )}
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
        />
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
            <label className={forms.checkRow} data-disabled={!showDates}>
              <input
                data-testid="show-age-toggle"
                type="checkbox"
                checked={showAge}
                onChange={(e) => setShowAge(e.target.checked)}
                disabled={!showDates}
                className={forms.checkbox}
              />
              <span>Show age</span>
            </label>
            <div className={s.birthday}>
              <label
                className={cx(s.birthdayLabel, !showDates && s.birthdayLabelDisabled)}
                htmlFor="birthday-input"
              >
                Birthday
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

        {error && (
          <p data-testid="timelapse-error" className={s.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
