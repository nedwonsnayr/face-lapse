# SDE: settings-dark-mode (built)
## Files
- `frontend/src/settings.tsx`:
  - Defines the `Settings` type and defaults.
  - `parseSettings` checks each field on its own and falls back to the legacy `face-lapse:library-view` key.
  - `SettingsProvider` and `useSettings`.
  - `applyTheme` sets `<html data-theme>` and sets `theme-color` from the resolved body colour.
- `frontend/index.html`: pre-paint inline script.
- `frontend/src/index.css`:
  - A light-only palette block, followed by an `@supports (color: light-dark(...))` block holding the dual values.
  - `color-scheme` rules per `data-theme`.
  - New tokens: `--surface-veil`, `--paper-veil`, `--scrim`, `--scrim-strong`, `--shadow-ink`, `--shadow-ink-deep`.
- `components/SettingsDialog.tsx` and its module CSS: segmented radio groups, the reused `SpeedSlider`, and checkboxes.
- `SpeedSlider`: new `idPrefix` and `label` props. Its min/max now come from `settings.tsx`.
- `App.tsx`: top-bar `IconButton` (`settings`) plus dialog state. The `settings` icon (sliders) is added to `Icon.tsx`.
- `Timelapse`: initial `frameDuration`, `isPlaying` and `showDates` come from settings. The panel heading is renamed "Settings" → "Playback & export" to avoid two things called Settings.
- `ImageLibrary`: initial `view` and `sortAscending` come from settings.
- Hard-coded colours were replaced in PhotoDateEditor, PersonTabs, FacePicker, Upload, ImageLibrary, Button, ArchiveTools and App CSS.
## Deviations
- **The grid/list toggle still remembers its choice.** It now writes to Settings → Default view instead of the legacy key. The approved design said controls keep working "as they do now", and this one already persisted. Spec updated.
- **`theme-color` comes from `body` background, not the `--paper` property.** Custom properties compute to the unresolved `light-dark()` text. The e2e test caught this.
## Left as is (on-photo chrome, same in both themes)
- White face boxes in FacePicker.
- The camera countdown.
- `#000` behind the camera video.
- The BufferedFrame loading banner.
- The "No photos match" text on the mat.
## Tech debt
- The pre-paint script duplicates the theme parsing in `settings.tsx`. It's about 10 lines, and comments point each copy at the other.
