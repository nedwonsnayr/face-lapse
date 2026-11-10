import { useEffect, useMemo, useState } from "react";
import { ImageRecord } from "../api";
import { ArchiveHealth, archiveRequest, TrashPhoto } from "../archiveApi";
import { useProfileApi } from "../ProfileContext";
import ResilientImage from "./ResilientImage";
import { Button } from "./ui/Button";
import forms from "./ui/forms.module.css";
import s from "./ArchiveTools.module.css";

function Compare({ images }: { images: ImageRecord[] }) {
  const { getAlignedImageUrl } = useProfileApi();
  const sorted = useMemo(() => [...images].filter(p => p.has_aligned).sort((a, b) =>
    (a.photo_taken_at ?? "").localeCompare(b.photo_taken_at ?? "") || a.id - b.id), [images]);
  const [firstId, setFirstId] = useState(0);
  const [lastId, setLastId] = useState(0);
  const [wipe, setWipe] = useState(false);
  const [position, setPosition] = useState(50);
  const first = sorted.find(p => p.id === firstId) ?? sorted[0];
  const last = sorted.find(p => p.id === lastId) ?? sorted[sorted.length - 1];
  const label = (p: ImageRecord) => `${p.photo_taken_at?.slice(0, 10) ?? "Undated"} · ${p.source_filename || p.original_filename}`;
  if (sorted.length < 2) return <p className={s.meta}>Add two aligned photos to compare dates.</p>;
  return <>
    <div className={s.controls}>
      <label>Then<select className={forms.field} aria-label="Then photo" value={first.id} onChange={e => setFirstId(Number(e.target.value))}>
        {sorted.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}
      </select></label>
      <label>Now<select className={forms.field} aria-label="Now photo" value={last.id} onChange={e => setLastId(Number(e.target.value))}>
        {sorted.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}
      </select></label>
    </div>
    <Button aria-pressed={wipe} onClick={() => setWipe(!wipe)}>{wipe ? "Show side by side" : "Show comparison slider"}</Button>
    <div className={wipe ? s.wipe : s.compare} data-testid="photo-comparison">
      <div className={s.comparePhoto}><ResilientImage src={getAlignedImageUrl(first.id, first.content_hash, "frame")} alt={`Then: ${label(first)}`} /></div>
      <div className={s.comparePhoto} style={wipe ? { clipPath: `inset(0 0 0 ${position}%)` } : undefined}>
        <ResilientImage src={getAlignedImageUrl(last.id, last.content_hash, "frame")} alt={`Now: ${label(last)}`} /></div>
      {wipe && <span className={s.wipeLine} style={{ left: `${position}%` }} />}
    </div>
    <p className={s.meta}>{first.photo_taken_at?.slice(0, 10)} → {last.photo_taken_at?.slice(0, 10)}</p>
    {wipe && <input className={forms.range} type="range" min="0" max="100" aria-label="Comparison position" value={position} onChange={e => setPosition(Number(e.target.value))} />}
  </>;
}

function Trash({ revision, onRefresh }: { revision: ImageRecord[]; onRefresh: () => void }) {
  const { profileId, getOriginalImageUrl } = useProfileApi();
  const [photos, setPhotos] = useState<TrashPhoto[]>([]);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    try { setPhotos(await archiveRequest(profileId, "trash")); setLoaded(true); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load Trash"); }
  };
  useEffect(() => { void load(); }, [revision]);
  const action = async (photo: TrashPhoto, permanent: boolean) => {
    if (permanent && !confirm(`Permanently delete ${photo.source_filename || photo.original_filename}? This cannot be undone in the app.`)) return;
    setBusy(true); setError("");
    try {
      await archiveRequest(profileId, permanent ? `trash/${photo.id}` : "restore", permanent ? "DELETE" : "POST", permanent ? undefined : { image_ids: [photo.id] });
      await load(); onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not complete action"); }
    finally { setBusy(false); }
  };
  return <>
    <p className={s.meta}>Photos stay here until you restore them or delete them permanently.</p>
    {error && <p role="alert" className={s.error}>{error} <Button onClick={load}>Retry</Button></p>}
    {!loaded && !error && <p role="status">Loading Trash…</p>}
    {loaded && !photos.length && <p>Trash is empty.</p>}
    {photos.slice(0, limit).map(p => <div className={s.trashRow} key={p.id}>
      <span style={{ position: "relative", width: 42, height: 56, flexShrink: 0 }}><ResilientImage src={getOriginalImageUrl(p.id, p.content_hash, "thumb")} alt="" loading="lazy" /></span>
      <span className={s.trashName}>{p.source_filename || p.original_filename}<br /><span className={s.meta}>Trashed {new Date(p.deleted_at).toLocaleDateString()}</span></span>
      <Button disabled={busy} onClick={() => action(p, false)}>Restore</Button>
      <Button disabled={busy} variant="ghost" onClick={() => action(p, true)}>Delete permanently</Button>
    </div>)}
    {limit < photos.length && <Button onClick={() => setLimit(n => n + 20)}>Show more ({photos.length - limit})</Button>}
  </>;
}

function Health() {
  const { profileId } = useProfileApi();
  const [health, setHealth] = useState<ArchiveHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setBusy(true); setError("");
    try { setHealth(await archiveRequest(profileId, "health")); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not check archive"); }
    finally { setBusy(false); }
  };
  const overdue = health?.backup.last_success && Date.now() - Date.parse(health.backup.last_success) > 36 * 3600 * 1000;
  return <>
    <p className={s.meta}>Check this person’s files and the backup status for the whole archive.</p>
    <Button onClick={load} disabled={busy}>{busy ? "Checking archive…" : "Check archive now"}</Button>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {health && <>
      <dl className={s.health}>
        {Object.entries({ "Photos": health.photos, "In Trash": health.trashed, "Awaiting alignment": health.pending,
          "Choose a face": health.needs_face_selection, "Missing originals": health.missing_originals, "Missing aligned files": health.missing_aligned }).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
      </dl>
      <p role="status">{health.backup.last_success
        ? `Last successful backup: ${new Date(health.backup.last_success).toLocaleString()}${overdue ? " — overdue" : ""}.`
        : "Backup status unknown — no successful run has been recorded by this version yet."}
        {health.backup.status === "failed" && " The latest backup attempt failed."}
        {health.backup.status === "running" && " A backup attempt was started; completion has not been recorded."}
      </p>
      <p className={s.meta}>Files checked {new Date(health.checked_at).toLocaleString()}. Includes photos in Trash. This checks file presence, not a full backup restore.</p>
    </>}
  </>;
}

export default function ArchiveTools({ images, onRefresh }: { images: ImageRecord[]; onRefresh: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return <div className={s.tools}>
    {(["Then & now", "Trash", "Archive health"] as const).map(title => <details className={s.panel} key={title}
      onToggle={e => { const expanded = e.currentTarget.open; setOpen(old => ({ ...old, [title]: expanded })); }}>
      <summary>{title}</summary>
      {open[title] && <div className={s.body}>{title === "Then & now" ? <Compare images={images} /> : title === "Trash" ? <Trash revision={images} onRefresh={onRefresh} /> : <Health />}</div>}
    </details>)}
  </div>;
}
