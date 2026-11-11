import { useProfileApi } from "../ProfileContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filtersApi, ImageRecord, VideoJob } from "../api";
import ExportSettings from "./ExportSettings";
import { ALL_FRAMES, FrameSelection, selectFrames } from "../selection";
import BufferedFrame from "./BufferedFrame";
import { FramePrefetcher, prefetchCount } from "../framePrefetch";
import SpeedSlider from "./SpeedSlider";
import DatePicker from "./DatePicker";
import { useSettings } from "../settings";
import { FilterDefinition, IDENTITY, isIdentity, sameFilter, validateFilter } from "../filters/definition";
import { BUILTIN_FILTERS } from "../filters/builtins";
import FilterPicker, { FilterEntry } from "./FilterPicker";
import FilterEditor from "./FilterEditor";
import { Button, IconButton } from "./ui/Button";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./Timelapse.module.css";

// Frames kept decoded ahead of the playhead. Further frames are only
// downloaded (FramePrefetcher, ~3 s ahead) so memory stays small. ADR-013.
const DECODE_AHEAD = 8;

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
  const imagesById = useMemo(() => new Map(allImages.map(image => [image.id, image])), [allImages]);
  // Settings are starting values only: read once, then the controls below own them.
  const { settings } = useSettings();
  const [frameDuration, setFrameDuration] = useState(settings.frameDuration);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(settings.autoplay);
  const [exportProgress, setExportProgress] = useState<VideoJob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDates, setShowDates] = useState(settings.showDate);
  const [filter, setFilter] = useState<FilterDefinition>(IDENTITY);
  // Which chip the current look came from; null for an unsaved look (editor draft, deleted preset).
  const [filterKey, setFilterKey] = useState<string | null>("builtin:original");
  const [savedFilters, setSavedFilters] = useState<{ id: number; name: string; filter: FilterDefinition }[]>([]);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: "new" | "edit"; id?: number; name: string; prior: { filter: FilterDefinition; key: string | null } } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
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
  const loadSavedFilters = useCallback(async () => {
    try {
      const list = await filtersApi.list();
      const valid = list.flatMap(p => { const f = validateFilter(p.definition); return f ? [{ id: p.id, name: p.name, filter: f }] : []; });
      if (!mounted.current) return valid;
      setSavedFilters(valid);
      setFiltersError(null);
      return valid;
    } catch {
      if (mounted.current) setFiltersError("Couldn’t load saved filters.");
      return null;
    }
  }, []);
  useEffect(() => { void loadSavedFilters(); }, [loadSavedFilters]);
  const filterEntries = useMemo<FilterEntry[]>(() => [
    ...BUILTIN_FILTERS.map(b => ({ key: `builtin:${b.slug}`, testId: `filter-chip-${b.slug}`, name: b.name, filter: b.filter })),
    ...savedFilters.map(p => ({ key: `custom:${p.id}`, testId: `filter-chip-custom-${p.id}`, name: p.name, filter: p.filter, custom: { id: p.id } })),
  ], [savedFilters]);
  // A saved filter that disappears (deleted elsewhere) leaves its look applied, unsaved.
  useEffect(() => {
    if (filterKey?.startsWith("custom:") && !filterEntries.some(e => e.key === filterKey)) setFilterKey(null);
  }, [filterEntries, filterKey]);
  const applyLook = (next: FilterDefinition) => {
    setFilter(next);
    setFilterKey(filterEntries.find(e => sameFilter(e.filter, next))?.key ?? null);
  };
  const openEditor = (mode: "new" | "edit", start: FilterDefinition, name: string, id?: number) => {
    setEditor({ mode, id, name, prior: { filter, key: filterKey } });
    setEditorError(null);
    setFilter(start);
    if (mode === "new") setFilterKey(null);
  };
  const closeEditor = (restore: boolean) => {
    if (restore && editor) { setFilter(editor.prior.filter); setFilterKey(editor.prior.key); }
    setEditor(null);
    setEditorError(null);
  };
  const saveEditor = async () => {
    if (!editor) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const saved = editor.mode === "edit" && editor.id !== undefined
        ? await filtersApi.update(editor.id, editor.name.trim(), filter)
        : await filtersApi.create(editor.name.trim(), filter);
      await loadSavedFilters();
      if (!mounted.current) return;
      setFilter(validateFilter(saved.definition) ?? filter);
      setFilterKey(`custom:${saved.id}`);
      setEditor(null);
    } catch (err) {
      if (mounted.current) setEditorError(err instanceof Error ? err.message : "Could not save the filter");
    } finally {
      if (mounted.current) setEditorBusy(false);
    }
  };
  const deleteEdited = async () => {
    if (editor?.id === undefined) return false;
    setEditorBusy(true);
    try {
      await filtersApi.remove(editor.id);
      await loadSavedFilters();
      if (!mounted.current) return true;
      // The look stays on the player as an unsaved copy.
      setFilterKey(null);
      setEditor(null);
      return true;
    } catch (err) {
      if (mounted.current) setEditorError(err instanceof Error ? err.message : "Could not delete the filter");
      return false;
    } finally {
      if (mounted.current) setEditorBusy(false);
    }
  };
  const [displayedImage, setDisplayedImage] = useState<ImageRecord | null>(null);
  // Chip thumbnails show the displayed frame; refresh while paused (and once at start), never per tick.
  const [thumb, setThumb] = useState<{ src: string; frameIndex: number } | null>(null);
  const [readySrc, setReadySrc] = useState("");
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const requestedImage = images[Math.min(currentIndex, Math.max(0, images.length - 1))];
  const requestedSrc = requestedImage ? getAlignedImageUrl(requestedImage.id, requestedImage.content_hash, "frame") : "";
  // Upcoming frames, nearest first: the first DECODE_AHEAD are decoded, the rest only downloaded.
  const playhead = Math.min(currentIndex, Math.max(0, images.length - 1));
  const upcoming = useMemo(() => Array.from({ length: Math.max(0, Math.min(prefetchCount(frameDuration), images.length - 1)) }, (_, n) => {
    const img = images[(playhead + n + 1) % images.length];
    return getAlignedImageUrl(img.id, img.content_hash, "frame");
  }), [images, playhead, frameDuration, getAlignedImageUrl]);
  const decodeAhead = useMemo(() => upcoming.slice(0, DECODE_AHEAD), [upcoming]);
  const prefetcher = useRef<FramePrefetcher | null>(null);
  useEffect(() => {
    const p = new FramePrefetcher();
    prefetcher.current = p;
    return () => { p.dispose(); prefetcher.current = null; };
  }, []);
  const prefetchKey = upcoming.slice(DECODE_AHEAD).join("\n");
  useEffect(() => { prefetcher.current?.want(prefetchKey ? prefetchKey.split("\n") : []); }, [prefetchKey]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!displayedImage || (isPlaying && thumb)) return;
    const index = Math.max(0, images.findIndex(i => i.id === displayedImage.id));
    setThumb({ src: getAlignedImageUrl(displayedImage.id, displayedImage.content_hash, "thumb"), frameIndex: index });
  }, [displayedImage, isPlaying]);

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
      const res = await generateVideo(frameDuration, showDates, showAge ? birthday : null, showAge, setExportProgress, selection,
        isIdentity(filter) ? null : filter);
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
  }, [frameDuration, showDates, showAge, birthday, selection, filter]);

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
  // The decoded frame may keep its URL while its date metadata is edited.
  const captionImage = currentImage
    ? (displayedImage && imagesById.get(displayedImage.id)) ?? displayedImage ?? currentImage
    : undefined;
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

      {/* Player: the frame sits in a dark mat, like a print. Pinned while editing a filter. */}
      <figure className={cx(s.figure, editor && s.pinned)}>
        <div data-testid="timelapse-player" className={s.mat}>
          {!images.length && <p style={{ color: "white", padding: 12 }}>No photos match this selection.</p>}
          {currentImage && (
            <BufferedFrame
              src={requestedSrc}
              ahead={decodeAhead}
              alt={`Frame ${safeIndex + 1}`} className={s.frame} filter={filter} frameIndex={safeIndex} onReady={url => { if (url === requestedSrc) { setReadySrc(url); setDisplayedImage(currentImage); } }}
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
        <p className={cx(forms.eyebrow, s.panelTitle)}>Playback &amp; export</p>

        <div className={s.filterBlock}>
          <span className={s.filterLabel}>Filter</span>
          <FilterPicker entries={filterEntries} selectedKey={filterKey} thumb={thumb} disabled={!!editor}
            loadError={filtersError} onRetry={() => void loadSavedFilters()}
            onSelect={entry => { setFilter(entry.filter); setFilterKey(entry.key); }}
            onNew={() => openEditor("new", IDENTITY, "")}
            onDuplicate={entry => openEditor("new", entry.filter, `${entry.name} copy`.slice(0, 40))}
            onEdit={entry => openEditor("edit", entry.filter, entry.name, entry.custom?.id)} />
          {editor && <FilterEditor title={editor.mode === "edit" ? "Edit filter" : "New filter"}
            value={filter} onChange={setFilter} name={editor.name}
            onNameChange={name => setEditor(e => e && { ...e, name })}
            onSave={() => void saveEditor()} onCancel={() => closeEditor(true)}
            onDelete={editor.mode === "edit" ? deleteEdited : undefined}
            busy={editorBusy} error={editorError} />}
        </div>

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

      <ExportSettings person={profileId} value={{ ...selection, duration: frameDuration, dates: showDates, age: showAge, filter }}
        onChange={value => { setSelection({ date_from: value.date_from, date_to: value.date_to, sampling: value.sampling });
          setFrameDuration(value.duration); setShowDates(value.dates); setShowAge(value.age); if (!editor) applyLook(value.filter ?? IDENTITY); setCurrentIndex(0); }} />
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
