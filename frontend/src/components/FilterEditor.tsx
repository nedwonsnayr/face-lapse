import React, { useEffect, useRef, useState } from "react";
import { BLEND_MODES, BlendMode, FilterDefinition, IDENTITY, RANGES } from "../filters/definition";
import { Button } from "./ui/Button";
import forms from "./ui/forms.module.css";
import dialogStyles from "./PhotoDateEditor.module.css";
import s from "./FilterEditor.module.css";

type RangeKey = keyof typeof RANGES;
type Format = "percent" | "amount" | "degrees";

const CONTROLS: { section: string; items: { key: RangeKey; label: string; format: Format; step: number }[] }[] = [
  { section: "Light & color", items: [
    { key: "brightness", label: "Brightness", format: "percent", step: 0.01 },
    { key: "contrast", label: "Contrast", format: "percent", step: 0.01 },
    { key: "saturation", label: "Saturation", format: "percent", step: 0.01 },
    { key: "grayscale", label: "Black & white", format: "amount", step: 0.01 },
    { key: "warmth", label: "Warmth", format: "amount", step: 0.01 },
    { key: "hue", label: "Hue shift", format: "degrees", step: 1 },
  ] },
  { section: "Fade", items: [{ key: "fade", label: "Fade", format: "amount", step: 0.01 }] },
  { section: "Tint", items: [{ key: "tint.strength", label: "Strength", format: "amount", step: 0.01 }] },
  { section: "Vignette", items: [
    { key: "vignette.strength", label: "Strength", format: "amount", step: 0.01 },
    { key: "vignette.size", label: "Size", format: "amount", step: 0.01 },
  ] },
  { section: "Grain", items: [
    { key: "grain.amount", label: "Amount", format: "amount", step: 0.01 },
    { key: "grain.size", label: "Size", format: "amount", step: 0.01 },
  ] },
];

const BLEND_LABELS: Record<BlendMode, string> = { "soft-light": "Soft light", overlay: "Overlay", multiply: "Multiply", screen: "Screen" };

function read(f: FilterDefinition, key: RangeKey): number {
  const [group, field] = key.split(".");
  return field ? (f[group as "tint" | "vignette" | "grain"] as unknown as Record<string, number>)[field] : f[key as "fade"];
}
function write(f: FilterDefinition, key: RangeKey, value: number): FilterDefinition {
  const [group, field] = key.split(".");
  if (!field) return { ...f, [key]: value };
  const g = group as "tint" | "vignette" | "grain";
  return { ...f, [g]: { ...f[g], [field]: value } };
}
const show = (value: number, format: Format) =>
  format === "percent" ? `${Math.round(value * 100)}%` : format === "degrees" ? `${Math.round(value)}°` : `${Math.round(value * 100)}`;
const testId = (key: RangeKey) => `filter-${key.replace(".", "-")}`;

/**
 * Inline editor. Every change goes straight to `onChange`, so the player above
 * is the live preview. Saving, deleting and cancelling are the parent's job.
 */
export default function FilterEditor({ title, value, onChange, name, onNameChange, onSave, onCancel, onDelete, busy, error }: {
  title: string; value: FilterDefinition; onChange: (f: FilterDefinition) => void;
  name: string; onNameChange: (name: string) => void;
  onSave: () => void; onCancel: () => void; onDelete?: () => Promise<boolean>;
  busy: boolean; error: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => { nameField.current?.focus({ preventScroll: true }); }, []);

  return <section className={s.editor} data-testid="filter-editor" aria-labelledby="filter-editor-title">
    <div className={s.head}>
      <h3 id="filter-editor-title" className={forms.eyebrow}>{title}</h3>
      <Button size="sm" variant="ghost" data-testid="filter-reset-all" disabled={busy}
        onClick={() => onChange(IDENTITY)}>Reset all</Button>
    </div>
    <form className={s.form} onSubmit={e => { e.preventDefault(); if (!busy) onSave(); }}>
      {/* Locked while saving: edits made mid-request would be dropped when the save returns. */}
      <fieldset className={s.controls} disabled={busy} data-testid="filter-controls">
        <label className={s.nameRow}>
          <span className={s.label}>Name</span>
          <input ref={nameField} className={forms.field} data-testid="filter-name" value={name} maxLength={40}
            onChange={e => onNameChange(e.target.value)} placeholder="e.g. Golden hour" required />
        </label>

        {CONTROLS.map(group => (
          <fieldset key={group.section} className={s.group}>
            <legend className={forms.eyebrow}>{group.section}</legend>
            {group.section === "Tint" && <div className={s.tintRow}>
              <label className={s.inline}>
                <span className={s.label}>Color</span>
                <input type="color" className={s.color} data-testid="filter-tint-color" value={value.tint.color}
                  onChange={e => onChange({ ...value, tint: { ...value.tint, color: e.target.value.toLowerCase() } })} />
              </label>
              <label className={s.inline}>
                <span className={s.label}>Blend</span>
                <select className={forms.field} data-testid="filter-tint-blend" value={value.tint.blend}
                  onChange={e => onChange({ ...value, tint: { ...value.tint, blend: e.target.value as BlendMode } })}>
                  {BLEND_MODES.map(mode => <option key={mode} value={mode}>{BLEND_LABELS[mode]}</option>)}
                </select>
              </label>
            </div>}
            {group.items.map(item => {
              const [lo, hi] = RANGES[item.key];
              const current = read(value, item.key);
              const initial = read(IDENTITY, item.key);
              const id = testId(item.key);
              // "Strength" appears in two sections, so name controls by section where needed.
              const fullName = group.section === "Light & color" || group.section === item.label
                ? item.label : `${group.section} ${item.label.toLowerCase()}`;
              return <div key={item.key} className={s.control}>
                <label htmlFor={id} className={s.label}>{item.label}</label>
                <output htmlFor={id} className={s.readout} data-testid={`${id}-value`}>{show(current, item.format)}</output>
                <button type="button" className={s.reset} data-testid={`${id}-reset`} disabled={busy || current === initial}
                  aria-label={`Reset ${fullName.toLowerCase()}`}
                  onClick={() => onChange(write(value, item.key, initial))}>Reset</button>
                <input id={id} data-testid={id} type="range" min={lo} max={hi} step={item.step} value={current} aria-label={fullName}
                  className={`${forms.range} ${s.range}`}
                  style={{ "--fill": `${((current - lo) / (hi - lo)) * 100}%` } as React.CSSProperties}
                  onChange={e => onChange(write(value, item.key, Number(e.target.value)))} />
              </div>;
            })}
          </fieldset>
        ))}
      </fieldset>

      {error && <p role="alert" className={s.error} data-testid="filter-error">{error}</p>}
      <div className={s.actions}>
        {onDelete && <Button variant="danger" size="sm" data-testid="filter-delete" disabled={busy}
          onClick={() => setConfirming(true)}>Delete</Button>}
        <span className={s.spacer} />
        <Button size="sm" data-testid="filter-cancel" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" data-testid="filter-save" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save filter"}
        </Button>
      </div>
    </form>
    {confirming && onDelete && <ConfirmDelete name={name} onCancel={() => setConfirming(false)}
      onConfirm={async () => { if (!(await onDelete())) setConfirming(false); }} />}
  </section>;
}

function ConfirmDelete({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className={dialogStyles.dialog} data-testid="filter-delete-dialog" aria-labelledby="filter-delete-title"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="filter-delete-title">Delete filter?</h2>
    <p>“{name}” will be removed for everyone. Videos you already downloaded keep their look.</p>
    <div className={dialogStyles.formActions}>
      <Button disabled={busy} onClick={onCancel}>Keep it</Button>
      <Button variant="danger" data-testid="filter-delete-confirm" disabled={busy}
        onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>Delete</Button>
    </div>
  </dialog>;
}
