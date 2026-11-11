import { useEffect, useRef } from "react";
import { LibraryView, ThemeChoice, useSettings } from "../settings";
import SpeedSlider from "./SpeedSlider";
import { IconButton } from "./ui/Button";
import forms from "./ui/forms.module.css";
import s from "./SettingsDialog.module.css";

interface Option<T extends string> { value: T; label: string }

function Segmented<T extends string>({ name, legend, value, options, onChange, testId }: {
  name: string; legend: string; value: T; options: Option<T>[]; onChange: (v: T) => void; testId: string;
}) {
  return (
    <fieldset className={s.field}>
      <legend className={s.legend}>{legend}</legend>
      <div className={s.segmented}>
        {options.map(o => (
          <label key={o.value} className={s.segment}>
            <input type="radio" name={name} value={o.value} checked={value === o.value}
              onChange={() => onChange(o.value)} data-testid={`${testId}-${o.value}`} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const THEMES: Option<ThemeChoice>[] = [
  { value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" },
];
const VIEWS: Option<LibraryView>[] = [{ value: "grid", label: "Grid" }, { value: "list", label: "List" }];
const ORDERS: Option<"oldest" | "newest">[] = [
  { value: "oldest", label: "Oldest first" }, { value: "newest", label: "Newest first" },
];

/** Changes save as they're made, so there's only a Close button. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); opener?.focus(); };
  }, []);

  return (
    <dialog ref={dialog} className={s.dialog} aria-labelledby="settings-title" data-testid="settings-dialog"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === dialog.current) onClose(); }}>
      <div className={s.inner}>
        <header className={s.head}>
          <h2 id="settings-title">Settings</h2>
          <IconButton icon="close" label="Close settings" onClick={onClose} data-testid="settings-close" />
        </header>
        <p className={s.note}>Saved on this device. This is how the app starts each time you open it.</p>

        <section className={s.section} aria-labelledby="settings-appearance">
          <h3 id="settings-appearance" className={forms.eyebrow}>Appearance</h3>
          <Segmented name="theme" legend="Theme" value={settings.theme} options={THEMES} testId="theme"
            onChange={theme => update({ theme })} />
          {settings.theme === "system" && <p className={s.hint}>Follows this device’s light or dark setting.</p>}
        </section>

        <section className={s.section} aria-labelledby="settings-playback">
          <h3 id="settings-playback" className={forms.eyebrow}>Playback</h3>
          <SpeedSlider idPrefix="setting-speed" label="Default speed" value={settings.frameDuration}
            onChange={frameDuration => update({ frameDuration })} />
          <label className={forms.checkRow}>
            <input type="checkbox" className={forms.checkbox} checked={settings.autoplay} data-testid="setting-autoplay"
              onChange={e => update({ autoplay: e.target.checked })} />
            Autoplay when the app opens
          </label>
          <label className={forms.checkRow}>
            <input type="checkbox" className={forms.checkbox} checked={settings.showDate} data-testid="setting-show-date"
              onChange={e => update({ showDate: e.target.checked })} />
            Show date on the player
          </label>
          <p className={s.hint}>The player’s Show date also sets whether exported videos get a date.</p>
        </section>

        <section className={s.section} aria-labelledby="settings-library">
          <h3 id="settings-library" className={forms.eyebrow}>Library</h3>
          <Segmented name="library-view" legend="Default view" value={settings.libraryView} options={VIEWS}
            testId="setting-view" onChange={libraryView => update({ libraryView })} />
          <Segmented name="library-order" legend="Default order" value={settings.newestFirst ? "newest" : "oldest"}
            options={ORDERS} testId="setting-order" onChange={o => update({ newestFirst: o === "newest" })} />
        </section>
      </div>
    </dialog>
  );
}
