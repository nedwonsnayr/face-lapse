import { useEffect, useRef, useState } from "react";
import { deleteImage, discoverFaces, FaceChoices, getOriginalImageUrl, ImageRecord, selectFace } from "../api";
import { Button, IconButton } from "./ui/Button";
import s from "./FacePicker.module.css";

export function FaceReview({ images, onChoose, onRefresh }: {
  images: ImageRecord[]; onChoose: (id: number) => void; onRefresh: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remove = async (id: number) => {
    if (!confirm("Delete this image?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteImage(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setDeletingId(null);
    }
  };
  if (!images.length) return null;
  return (
    <section className={s.review} aria-labelledby="face-review-title" data-testid="face-review-queue">
      <h2 id="face-review-title">Choose your face <span>({images.length})</span></h2>
      <p>These photos have more than one face. Choose yours to add them to the timelapse.</p>
      <div className={s.queue}>
        {images.map((img) => (
          <div key={img.id} className={s.queueItem}>
            <button className={s.choose} onClick={() => onChoose(img.id)}
              data-testid={`choose-face-${img.id}`} disabled={deletingId === img.id}>
              <img src={getOriginalImageUrl(img.id, img.content_hash, "thumb")} alt="" loading="lazy" />
              <span>Choose your face</span>
              <small>{img.source_filename || img.original_filename}</small>
            </button>
            <Button variant="ghost" size="sm" icon="trash" onClick={() => remove(img.id)}
              disabled={deletingId === img.id} data-testid={`remove-face-review-${img.id}`}>
              {deletingId === img.id ? "Removing…" : "Remove"}
            </Button>
          </div>
        ))}
      </div>
      {error && <p role="alert" className={s.error}>{error}</p>}
    </section>
  );
}

export default function FacePicker({ imageId, onClose, onSaved }: {
  imageId: number; onClose: () => void; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<FaceChoices | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    discoverFaces(imageId).then((data) => {
      if (!active) return;
      setChoices(data);
      setSelected(data.selected_face_index);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [imageId, attempt]);

  const save = async () => {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    try {
      await selectFace(imageId, selected);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not align that face. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} className={s.dialog} aria-labelledby="face-picker-title"
      data-testid="face-picker" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <header className={s.header}>
        <div>
          <h2 id="face-picker-title">Which face is yours?</h2>
          <p>Select your face, then align this photo.</p>
        </div>
        <IconButton icon="close" label="Close face picker" onClick={onClose} disabled={saving} />
      </header>
      {!choices && !error && <p role="status">Finding faces…</p>}
      {choices && choices.faces.length === 0 && <p>No faces were detected in this photo. Try a clearer photo.</p>}
      {choices && choices.faces.length > 0 && (
        <div className={s.photo}>
          <img src={getOriginalImageUrl(imageId, choices.content_hash, "frame")}
            alt="Original photo. Select one of the numbered face outlines."
            onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setError("Could not load the photo. Close and try again."); }} />
          {loaded && choices.faces.map((face, index) => (
            <button key={index} type="button" className={s.face}
              aria-label={`Select face ${index + 1}`} aria-pressed={selected === index}
              data-testid={`face-option-${index}`} disabled={saving}
              onClick={() => setSelected(index)}
              style={{ left: `${face.bounds.x * 100}%`, top: `${face.bounds.y * 100}%`,
                width: `${face.bounds.width * 100}%`, height: `${face.bounds.height * 100}%` }}>
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className={s.error} role="alert">{error}</p>}
      {!choices && error && <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
      <footer className={s.footer}>
        <p>Your choice is saved for this photo and reused when you re-align it.</p>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={selected === null || saving || !loaded}
          data-testid="confirm-face-selection">{saving ? "Aligning…" : "Align this face"}</Button>
      </footer>
    </dialog>
  );
}
