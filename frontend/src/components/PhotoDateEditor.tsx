import { useEffect, useRef, useState } from "react";
import { ImageRecord } from "../api";
import { useProfileApi } from "../ProfileContext";
import { Button } from "./ui/Button";
import s from "./PhotoDateEditor.module.css";

const sources = {
  exif: "Date read from the photo’s metadata.",
  filename: "Date read from the photo’s filename.",
  upload: "Capture date unknown. Using the upload date.",
  manual: "Date set manually.",
  legacy: "The source of this older date wasn’t recorded. It may have been estimated.",
};

export default function PhotoDateEditor({ image, onClose, onSaved }: {
  image: ImageRecord; onClose: () => void; onSaved: () => void;
}) {
  const { updatePhotoDate } = useProfileApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(image.photo_taken_at?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); opener?.focus(); };
  }, []);
  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await updatePhotoDate(image.id, value); onSaved(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save date"); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="photo-date-title"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); void save(date); }}>
      <h2 id="photo-date-title">Photo date</h2>
      <p>{sources[image.date_source ?? "legacy"]}</p>
      <label>Date taken<input type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={busy} autoFocus /></label>
      <p className={s.hint}>Used for the library, timelapse and video captions.</p>
      <Button type="button" variant="ghost" className={s.fallback} disabled={busy || !image.created_at}
        onClick={() => void save(null)}>Use upload date</Button>
      <p>This fallback uses the original upload time in your device’s timezone. It doesn’t confirm when the photo was taken.</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.formActions}>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || !date}>{busy ? "Saving…" : "Save date"}</Button>
      </div>
    </form>
  </dialog>;
}
