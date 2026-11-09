import { useEffect, useRef, useState } from "react";
import { Profile, saveProfile } from "../api";
import { Button } from "./ui/Button";
import s from "./PersonTabs.module.css";

export default function PersonTabs({ profiles, current, onSelect, onSaved }: {
  profiles: Profile[]; current: Profile; onSelect: (id: number) => void; onSaved: (profile: Profile) => void;
}) {
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = () => { if (!busy) setEditing(null); };
  useEffect(() => {
    if (!editing) return;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); opener.current?.focus(); };
  }, [editing]);
  const open = (value: Profile | "new") => {
    opener.current = document.activeElement as HTMLElement;
    setName(value === "new" ? "" : value.name);
    setBirthday(value === "new" ? "" : value.birthday ?? "");
    setError(null);
    setEditing(value);
  };
  return (
    <div className={s.bar}>
      <div role="tablist" aria-label="People" className={s.tabs}>
        {profiles.map((p, i) => (
          <button key={p.id} role="tab" id={`person-tab-${p.id}`} aria-selected={current.id === p.id}
            aria-controls="person-workspace" tabIndex={current.id === p.id ? 0 : -1}
            onClick={() => onSelect(p.id)} className={s.tab}
            onKeyDown={(e) => {
              let next = i;
              if (e.key === "ArrowRight") next = (i + 1) % profiles.length;
              else if (e.key === "ArrowLeft") next = (i + profiles.length - 1) % profiles.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = profiles.length - 1;
              else return;
              e.preventDefault();
              onSelect(profiles[next].id);
            }}>{p.name}</button>
        ))}
      </div>
      <div className={s.actions}>
        <Button size="sm" variant="ghost" onClick={() => open(current)} aria-label={`Edit ${current.name}`}>Edit person</Button>
        <Button size="sm" icon="plus" onClick={() => open("new")}>Add person</Button>
      </div>
      {editing && (
        <dialog ref={dialog} className={s.dialog} aria-labelledby="person-form-title" onCancel={(e) => { e.preventDefault(); close(); }}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true); setError(null);
            try {
              const saved = await saveProfile({ name: name.trim(), birthday: birthday || null }, editing === "new" ? undefined : editing.id);
              onSaved(saved); setEditing(null);
            } catch (err) { setError(err instanceof Error ? err.message : "Could not save this person"); }
            finally { setBusy(false); }
          }}>
            <h2 id="person-form-title">{editing === "new" ? "Add a person" : "Edit person"}</h2>
            <p>Each person has their own photos and timelapse.</p>
            <label>Name<input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus disabled={busy} /></label>
            <label>Birthday <span>(optional)</span><input name="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} disabled={busy} /></label>
            <p className={s.hint}>Used for the age caption in this person’s timelapse.</p>
            {error && <p role="alert" className={s.error}>{error}</p>}
            <div className={s.formActions}>
              <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : editing === "new" ? "Create person" : "Save changes"}</Button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
