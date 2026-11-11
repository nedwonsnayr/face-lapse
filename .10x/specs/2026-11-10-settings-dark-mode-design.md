# Settings panel and dark mode — design

**Feature slug:** `settings-dark-mode` · **Date:** 2026-11-10 · **Status:** approved by the user ("Looks good, build it")

## Goal
Add a Settings button with a Light / Dark / System theme choice. Dark mode must look like Face Lapse rather than a generic dark UI. The user also picked playback defaults, library defaults and the player date overlay. Once built, add the dark theme to the "Face Lapse" design system artifact.

## Settings button and panel
- A gear icon button in the top bar, left of **Add photos**, labelled "Settings".
- It opens a modal `<dialog>` in the same style as the photo date editor. Esc and the Close button dismiss it. Changes apply immediately, so there is no Save button.

| Section | Setting | Options | Default |
|---|---|---|---|
| Appearance | Theme | Light · Dark · System | System |
| Playback | Default speed | 0.05–1.00 s per frame (same slider as the player) | 0.05 s |
| | Autoplay when the app opens | on/off | on |
| | Show date on the player | on/off | on |
| Library | Default view | Grid · List | Grid (or the view the user already saved) |
| | Default order | Oldest first · Newest first | Oldest first |

**Semantics.** Settings are starting values. The grid/list toggle is the one exception. It already remembered its choice per device before this change, so it keeps doing that by updating "Default view" (as the design said, the controls "work as they do now"). The other inline controls (player speed, play/pause, Show date, sort button) work as before and change things for the current visit only. Settings are read when the app opens and when a person tab mounts. The theme applies live.

**Show date** on the player also controls the date caption on exports, as it does today. The setting is that toggle's starting value. An export preset can still override it, as today.

## Where settings are saved
- Each browser saves its own settings, in one JSON entry in `localStorage` (`face-lapse:settings`). Nothing is stored on the server.
- Every field is validated on read, and an invalid field falls back to its default.
- The legacy `face-lapse:library-view` key is used as the default view when no settings exist yet. This keeps today's remembered grid/list choice.
- If storage is unavailable (private mode), the defaults apply and changes last only for that visit.

## Dark mode
- Every palette token in `index.css` becomes `light-dark(<light>, <dark>)`.
  - `color-scheme` on `<html>` picks which value applies: `light dark` for System, `light` or `dark` when forced, set through `data-theme`.
  - Native controls (date inputs, scrollbars, dialogs) follow automatically.
  - System mode follows OS changes live with no JavaScript.
- A "darkroom" palette: warm charcoal paper, cream ink, and a lifted brick accent. The mat, photos and on-photo chrome (face boxes, countdown, frame loading banner) are the same in both themes.
- The hard-coded translucent surfaces and scrims move to new tokens: `--surface-veil`, `--paper-veil` and `--scrim`. The remaining `#a22` fallback is removed.
- **No flash on load:** a small inline script in `index.html` reads the saved theme and sets `data-theme` before any CSS paints. The `theme-color` meta follows the active paper color.
- **Contrast:** text pairs must reach 4.5:1 in both themes, and control borders and focus rings 3:1. This is checked with a script.

## Design system artifact
- `tokens.json` gains a `dark` theme value for every color token, plus the new veil and scrim tokens.
- The README gets a "Themes" section covering the darkroom palette, the System default, what stays the same in both themes, and the contrast rules.

## Testing
- **Automated (new e2e spec):**
  - Each theme choice sets the expected `--paper` color.
  - The choice survives a reload.
  - System follows emulated `prefers-color-scheme`.
  - Speed, autoplay, date, view and order defaults apply after a reload.
  - Inline changes don't overwrite the saved defaults.
  - The legacy view key is honoured.
- **Manual:** screenshots of the library, player, Settings and date dialog in dark mode at desktop and 390 px widths.

## Out of scope
- Syncing settings to the server or between devices.
- Per-person settings.
- Changing export styling. Exported videos stay "paper framed" in both themes.
