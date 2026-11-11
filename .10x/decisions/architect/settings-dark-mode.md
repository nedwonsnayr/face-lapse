# Architect: settings-dark-mode (ADR-011)
## Components
- `src/settings.ts`:
  - `Settings` type, `DEFAULTS`, `loadSettings()` (validates each field and honours the legacy `face-lapse:library-view` key), `saveSettings()`, `applyTheme()`.
  - `SettingsProvider` and `useSettings()` context.
- `index.html`: an inline pre-paint script sets `<html data-theme>` from storage.
- `index.css`:
  - Tokens become `light-dark(light, dark)`, with a light-only fallback block before them.
  - `html[data-theme=light|dark]` forces `color-scheme`.
  - New tokens: `--surface-veil`, `--paper-veil`, `--scrim`.
- `components/SettingsDialog.tsx` (+ module CSS): a modal opened from a top-bar gear button in `App.tsx`.
- Consumers read defaults once, on mount:
  - `Timelapse`: `frameDuration`, `isPlaying`, `showDates`.
  - `ImageLibrary`: `view`, `sortAscending`.
## Data flow
The dialog calls `update(patch)`, which updates the context state, saves to `localStorage` and applies the theme to `<html>`. Nothing else re-renders on settings changes, because consumers only take initial values.
## Failure modes
- **Storage unavailable:** the defaults apply and settings are kept in memory for the visit.
- **Corrupt JSON:** the defaults apply.
- **Old browser without `light-dark()`:** the light palette applies.
