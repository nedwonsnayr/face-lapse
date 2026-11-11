import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** Device-local preferences (ADR-011). Values are starting points: the
 *  inline player and library controls still change things for one visit. */
export type ThemeChoice = "system" | "light" | "dark";
export type LibraryView = "grid" | "list";

export interface Settings {
  theme: ThemeChoice;
  /** Seconds per frame, same range as the player's speed slider. */
  frameDuration: number;
  autoplay: boolean;
  showDate: boolean;
  libraryView: LibraryView;
  newestFirst: boolean;
}

export const SETTINGS_KEY = "face-lapse:settings";
/** Where grid/list was remembered before Settings existed. */
const LEGACY_VIEW_KEY = "face-lapse:library-view";
export const MIN_FRAME_DURATION = 0.05;
export const MAX_FRAME_DURATION = 1.0;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  frameDuration: 0.05,
  autoplay: true,
  showDate: true,
  libraryView: "grid",
  newestFirst: false,
};

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Every field is checked on its own, so one bad value never resets the rest. */
export function parseSettings(raw: string | null, legacyView: string | null = null): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch { /* corrupt entry: defaults */ }
  const d = DEFAULT_SETTINGS;
  const pick = <T,>(value: unknown, ok: (v: unknown) => v is T, fallback: T): T => (ok(value) ? value : fallback);
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  const legacy: LibraryView = legacyView === "list" ? "list" : d.libraryView;
  return {
    theme: pick(stored.theme, (v): v is ThemeChoice => v === "system" || v === "light" || v === "dark", d.theme),
    frameDuration: pick(stored.frameDuration,
      (v): v is number => typeof v === "number" && v >= MIN_FRAME_DURATION && v <= MAX_FRAME_DURATION, d.frameDuration),
    autoplay: pick(stored.autoplay, isBool, d.autoplay),
    showDate: pick(stored.showDate, isBool, d.showDate),
    libraryView: pick(stored.libraryView, (v): v is LibraryView => v === "grid" || v === "list", legacy),
    newestFirst: pick(stored.newestFirst, isBool, d.newestFirst),
  };
}

export function loadSettings(): Settings {
  return parseSettings(read(SETTINGS_KEY), read(LEGACY_VIEW_KEY));
}

function saveSettings(settings: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* this visit only */ }
}

/** Mirrors the pre-paint script in index.html. */
export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Read the resolved page colour: the --paper property itself computes to
  // the unresolved "light-dark(…)" text, which theme-color can't use.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const paper = rgbToHex(getComputedStyle(document.body).backgroundColor);
  if (meta && paper) meta.content = paper;
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? "#" + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, "0")).join("") : null;
}

interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    // In System mode CSS follows the device by itself; only the browser
    // chrome colour (theme-color meta) needs a nudge when the device flips.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
