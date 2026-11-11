import { useState } from "react";
import { FrameSelection } from "../selection";
import { Button } from "./ui/Button";
import { FilterDefinition, validateFilter } from "../filters/definition";
import forms from "./ui/forms.module.css";
import s from "./ArchiveTools.module.css";

/** `filter` is a copy, so a preset keeps its look even after a saved filter is deleted. */
export interface ExportPreset extends FrameSelection { duration: number; dates: boolean; age: boolean; filter?: FilterDefinition }
interface SavedPreset extends ExportPreset { name: string }
export default function ExportSettings({ person, value, onChange }: { person: number; value: ExportPreset; onChange: (v: ExportPreset) => void }) {
  const storageKey = `face-lapse:export-presets:${person}`;
  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(stored) ? stored.filter(p => typeof p.name === "string" && p.name.length <= 40 &&
        ["all", "day", "week", "month"].includes(p.sampling) && typeof p.date_from === "string" && typeof p.date_to === "string" &&
        typeof p.duration === "number" && p.duration >= .05 && p.duration <= 1 && typeof p.dates === "boolean" && typeof p.age === "boolean")
        // Older presets have no filter (Original); a corrupt filter falls back to Original too.
        .map(p => ({ ...p, filter: p.filter === undefined ? undefined : validateFilter(p.filter) ?? undefined })).slice(0, 10) : [];
    } catch { return []; }
  });
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const persist = (next: SavedPreset[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPresets(next); setMessage("Presets saved on this device."); }
    catch { setMessage("This browser could not save the preset."); }
  };
  return <details className={s.panel}>
    <summary>Choose photos & export presets</summary>
    <div className={s.body}>
      <div className={s.controls}>
        <label>From<input className={forms.field} type="date" aria-label="Export start date" value={value.date_from} onChange={e => onChange({ ...value, date_from: e.target.value })} /></label>
        <label>To<input className={forms.field} type="date" aria-label="Export end date" value={value.date_to} onChange={e => onChange({ ...value, date_to: e.target.value })} /></label>
        <label>Photos<select className={forms.field} aria-label="Export sampling" value={value.sampling} onChange={e => onChange({ ...value, sampling: e.target.value as FrameSelection["sampling"] })}>
          <option value="all">Every photo</option><option value="day">One per day</option><option value="week">One per week</option><option value="month">One per month</option>
        </select></label>
      </div>
      <p className={s.meta}>Preview and download use the same selection. Sampling keeps the earliest photo per period; weeks start Monday.</p>
      <Button onClick={() => onChange({ ...value, date_from: "", date_to: "", sampling: "all" })}>Use all photos</Button>
      <div className={s.controls}>
        <label>Preset name<input className={forms.field} aria-label="Export preset name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. A photo a week" /></label>
        <Button disabled={!name.trim()} onClick={() => { persist([...presets.filter(p => p.name !== name.trim()), { ...value, name: name.trim() }].slice(-10)); setName(""); }}>Save preset</Button>
      </div>
      {presets.map(p => <div className={s.controls} key={p.name}>
        <Button onClick={() => onChange({ ...p, filter: p.filter })}>{p.name}</Button>
        <Button variant="ghost" aria-label={`Delete preset ${p.name}`} onClick={() => persist(presets.filter(v => v.name !== p.name))}>Remove</Button>
      </div>)}
      {message && <p role="status" className={s.meta}>{message}</p>}
    </div>
  </details>;
}
