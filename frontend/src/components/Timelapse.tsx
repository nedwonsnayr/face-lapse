import { useProfileApi } from "../ProfileContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageRecord, VideoJob } from "../api";
import ExportSettings from "./ExportSettings";
import { ALL_FRAMES, FrameSelection, selectFrames } from "../selection";
import BufferedFrame from "./BufferedFrame";
import SpeedSlider from "./SpeedSlider";
import DatePicker from "./DatePicker";
import { Button, IconButton } from "./ui/Button";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./Timelapse.module.css";

// Frames to load ahead of the playhead.
const PRELOAD_AHEAD = 4;

interface TimelapseProps {
  /** Included+aligned images, in display order */
  images: ImageRecord[];
  initialBirthday?: string | null;
  onBirthdayChange?: (birthday: string) => Promise<void>;
}

export default function Timelapse({ images: allImages, initialBirthday, onBirthdayChange }: TimelapseProps) {
  const { profileId, generateVideo, getAlignedImageUrl, getVideoUrl } = useProfileApi();
  const [selection, setSelection] = useState<FrameSelection>(ALL_FRAMES);
  const images = useMemo(() => selectFrames(allImages, selection), [allImages, selection]);
  const [frameDuration, setFrameDuration] = useState(0.05);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [exportProgress, setExportProgress] = useState<VideoJob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDates, setShowDates] = useState(true);
  const [showAge, setShowAge] = useState(!!initialBirthday);
  const [birthday, setBirthday] = useState(initialBirthday ?? "");
  const [savingBirthday, setSavingBirthday] = useState(false);
  const mounted = useRef(true);
  const birthdayRequest = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => setBirthday(initialBirthday ?? ""), [initialBirthday]);
  const changeBirthday = async (value: string) => {
    setBirthday(value);
    if (!onBirthdayChange) return;
    const request = ++birthdayRequest.current;
    setSavingBirthday(true);
    try { await onBirthdayChange(value); }
    catch { if (mounted.current) setError("Could not save the birthday. Please try again."); }
    finally { if (mounted.current && request === birthdayRequest.current) setSavingBirthday(false); }
  };
  const [displayedImage, setDisplayedImage] = useState<ImageRecord | null>(null);
  const [readySrc, setReadySrc] = useState("");
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const requestedImage = images[Math.min(currentIndex, Math.max(0, images.length - 1))];
  const requestedSrc = requestedImage ? getAlignedImageUrl(requestedImage.id, requestedImage.content_hash, "frame") : "";
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear and restart interval whenever frameDuration or isPlaying changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && visible && images.length > 0 && readySrc === requestedSrc) {
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
  }, [frameDuration, isPlaying, images.length, readySrc, requestedSrc, visible]);

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
      const res = await generateVideo(frameDuration, showDates, showAge ? birthday : null, showAge, setExportProgress, selection);
      if (!mounted.current) return;
      // Trigger download via a temporary link
      const url = getVideoUrl(res.video_filename);
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
  }, [frameDuration, showDates, showAge, birthday, selection]);

  if (allImages.length === 0) {
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
  const captionImage = displayedImage ?? currentImage;
  const currentDate = captionImage?.photo_taken_at
    ? new Date(`${captionImage.photo_taken_at.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const currentAge = showAge ? calculateAge(captionImage?.photo_taken_at || null) : null;
  const canStepBackward = !isPlaying && safeIndex > 0;
  const canStepForward = !isPlaying && safeIndex < images.length - 1;

  const scrubFill = images.length > 1 ? (safeIndex / (images.length - 1)) * 100 : 0;
  const totalSeconds = images.length * frameDuration;

  return (
    <div className={s.section}>
      <div className={s.header}>
        <h2 className={forms.eyebrow}>Timelapse</h2>
        <span data-testid="frame-counter" className={s.counter}>
          {images.length ? safeIndex + 1 : 0} / {images.length}
        </span>
      </div>

      {/* Player: the frame sits in a dark mat, like a print */}
      <figure className={s.figure}>
        <div data-testid="timelapse-player" className={s.mat}>
          {!images.length && <p style={{ color: "white", padding: 12 }}>No photos match this selection.</p>}
          {currentImage && (
            <BufferedFrame
              src={requestedSrc}
              ahead={Array.from({ length: Math.min(PRELOAD_AHEAD, images.length - 1) }, (_, n) => {
                const img = images[(safeIndex + n + 1) % images.length];
                return getAlignedImageUrl(img.id, img.content_hash, "frame");
              })}
              alt={`Frame ${safeIndex + 1}`} className={s.frame} onReady={url => { setReadySrc(url); setDisplayedImage(currentImage); }}
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
          max={Math.max(0, images.length - 1)}
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
                onChange={changeBirthday}
                disabled={!showAge || savingBirthday}
              />
            </div>
          </div>
        </div>
      </div>

      <ExportSettings person={profileId} value={{ ...selection, duration: frameDuration, dates: showDates, age: showAge }}
        onChange={value => { setSelection({ date_from: value.date_from, date_to: value.date_to, sampling: value.sampling });
          setFrameDuration(value.duration); setShowDates(value.dates); setShowAge(value.age); setCurrentIndex(0); }} />
      {selection.date_from && selection.date_to && selection.date_from > selection.date_to && <p role="alert">Start date must be before the end date.</p>}
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
          disabled={!images.length || isGenerating || savingBirthday || (showAge && !birthday)}
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
