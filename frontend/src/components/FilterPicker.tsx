import { useEffect, useRef } from "react";
import { FilterDefinition } from "../filters/definition";
import { FilterRenderer, webgl2Supported } from "../filters/FilterRenderer";
import { Button } from "./ui/Button";
import cx from "./ui/cx";
import s from "./FilterPicker.module.css";

export interface FilterEntry {
  key: string;            // "builtin:<slug>" or "custom:<id>"
  testId: string;
  name: string;
  filter: FilterDefinition;
  custom?: { id: number };
}

const THUMB_W = 60, THUMB_H = 80;

/**
 * Chip strip of looks. Thumbnails are the current frame through each look,
 * drawn by one shared offscreen renderer — only when `thumb` changes (the
 * player refreshes it on pause), never on every playback tick.
 */
export default function FilterPicker({ entries, selectedKey, onSelect, thumb, onNew, onDuplicate, onEdit, disabled, loadError, onRetry }: {
  entries: FilterEntry[]; selectedKey: string | null; onSelect: (entry: FilterEntry) => void;
  thumb: { src: string; frameIndex: number } | null;
  onNew: () => void; onDuplicate: (entry: FilterEntry) => void; onEdit: (entry: FilterEntry) => void;
  disabled?: boolean; loadError?: string | null; onRetry: () => void;
}) {
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const renderer = useRef<FilterRenderer | null>(null);
  const selected = entries.find(e => e.key === selectedKey) ?? null;
  const entriesKey = entries.map(e => `${e.key}:${JSON.stringify(e.filter)}`).join("|");

  useEffect(() => () => { renderer.current?.dispose(); renderer.current = null; }, []);
  useEffect(() => {
    if (!thumb || !webgl2Supported()) return;
    let active = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => image.decode().then(() => {
      if (!active) return;
      try { renderer.current ??= new FilterRenderer(document.createElement("canvas")); }
      catch { return; }
      const r = renderer.current;
      if (r.gl.isContextLost()) { renderer.current = null; return; }
      r.setSource(image, image.naturalWidth, image.naturalHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      for (const entry of entries) {
        const target = canvases.current.get(entry.key);
        const ctx = target?.getContext("2d");
        if (!target || !ctx) continue;
        target.width = THUMB_W * ratio; target.height = THUMB_H * ratio;
        r.render(entry.filter, thumb.frameIndex);
        // Cover-fit the frame into the 3:4 chip.
        const scale = Math.max(target.width / image.naturalWidth, target.height / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        ctx.drawImage(r.canvas as HTMLCanvasElement, (target.width - w) / 2, (target.height - h) / 2, w, h);
      }
    }, () => {});
    image.src = thumb.src;
    return () => { active = false; };
    // entriesKey stands in for `entries` (a fresh array each render).
  }, [thumb?.src, thumb?.frameIndex, entriesKey]);

  return <div className={s.picker}>
    <div className={s.strip} role="radiogroup" aria-label="Filter" data-testid="filter-picker">
      {entries.map(entry => (
        <button key={entry.key} type="button" role="radio" aria-checked={entry.key === selectedKey}
          data-testid={entry.testId} className={cx(s.chip, entry.key === selectedKey && s.selected)}
          disabled={disabled} onClick={() => onSelect(entry)}>
          <canvas className={s.thumb} aria-hidden="true"
            ref={el => { if (el) canvases.current.set(entry.key, el); else canvases.current.delete(entry.key); }} />
          <span className={s.name}>{entry.name}</span>
        </button>
      ))}
    </div>
    <div className={s.actions}>
      <Button size="sm" icon="plus" data-testid="filter-new" disabled={disabled} onClick={onNew}>New filter</Button>
      {selected && selected.key !== "builtin:original" && (
        <Button size="sm" variant="ghost" data-testid="filter-duplicate" disabled={disabled} onClick={() => onDuplicate(selected)}>
          Duplicate
        </Button>
      )}
      {selected?.custom && (
        <Button size="sm" variant="ghost" data-testid="filter-edit" disabled={disabled} onClick={() => onEdit(selected)}>Edit</Button>
      )}
      {!selected && <span className={s.note} data-testid="filter-unsaved">Unsaved look</span>}
    </div>
    {loadError && <p role="alert" className={s.error}>
      {loadError} <Button size="sm" variant="ghost" onClick={onRetry}>Retry</Button>
    </p>}
  </div>;
}
