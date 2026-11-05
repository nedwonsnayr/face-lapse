# Face Lapse visual revamp: two-pane studio, light editorial look

## Context

I reviewed the running app in Chrome at localhost:5173 (1,020 aligned images) and read the frontend code. It feels dated for these reasons:

- **Generic template look.** Dark slate with an indigo `#6c63ff` accent, a centered "Face Lapse / Selfie timelapse generator" header, outlined pill buttons, and emoji icons (📷) or text glyphs (`+`, `▸`, `⏸`, `○`).
- **The layout buries the payoff.** Everything sits in one 960px column: a large upload box, then the library (collapsed by default), then the timelapse at the very bottom. On a wide screen most of the width is empty.
- **The library is cramped.** It's a nested 500px scroll box inside the page scroll. Cards are 140px, mostly black letterbox. The actions are cryptic: `In` / `○` / `Del`. The filename `1.jpg` is noise.
- **The player is plain.** It sits in a black box with a separate controls card underneath. The frame-duration slider is unlabeled beyond seconds, and the full-width purple "Download Video" bar dominates the controls.
- **Technical cause.** All styling is inline `style={{}}` objects (`*.styles.ts`). That rules out `:hover`, `:focus-visible`, `@media` and CSS transitions. `index.css` also sets `outline: none` on every button, which breaks keyboard focus. DatePicker fakes hover with `onMouseEnter` handlers. The page has no responsive behavior.

**What you chose:**
- **Layout:** two-pane studio.
- **Look:** light editorial (off-white paper, serif display type, a photo-journal feel).
- **Styling:** CSS Modules with design tokens.

**Out of scope:**
- No backend or API changes.
- No new features beyond the layout. The upload → stage → align → library → timelapse → export flow stays the same.
- Every `data-testid` stays. The 6 Playwright specs use 70 `getByTestId` calls.

**Known limitation.** The black fill around rotated aligned frames comes from backend alignment, so it isn't addressed here. Changing the fill color, or cropping it, is a possible follow-up.

## Step 1: Write the 10x state, spec and ADRs
- Create `.10x/` with the discovery notes, marked `[DISCOVERED]`: React 18 + Vite + TypeScript, FastAPI backend, Playwright e2e, and the inline-style pattern.
- Spec: `.10x/specs/2026-11-04-ui-revamp-design.md`, containing this plan's design.
- `ADR-001-css-modules-design-tokens.md`: CSS Modules over Tailwind or inline styles. Alternatives and consequences included.
- `ADR-002-two-pane-studio-layout.md`: two-pane studio over player-first or a reskin only.
- Write the `decisions/{cto,product-manager,architect,staff-engineer,engineering-manager,senior-engineer}` files, `status.md` and `handoff.md`, then commit with `state(design): …`.

## Step 2: Design tokens, fonts and global CSS
- Rewrite the `:root` tokens in [index.css](frontend/src/index.css):
  - Paper `#f6f3ee`, surface `#fffdf9`, ink `#1c1a17`, muted `#6f6a62`, hairline `#e4ded4`.
  - One accent, a deep ink-red `#a4372a`. Keep success and danger tones, made quieter.
  - Keep the existing token names where they map (`--bg`, `--surface`, `--text`, …) so stray references keep working.
- Type: a serif display face (Fraunces or Newsreader) for headings, dates and the wordmark, with Inter for the UI. Self-host both via `@fontsource/*` so the local app works offline, and drop the Google Fonts `<link>` from `index.html`.
- Add tokens for the spacing scale, radii (smaller and crisper, 4–8px), shadow and motion (`--ease`, 150–200ms).
- Remove the global `outline: none`. Add a `:focus-visible` ring and `prefers-reduced-motion` handling.

## Step 3: Shared UI primitives and an icon set
- Create `frontend/src/components/ui/` with `Button.tsx` (primary, secondary and ghost variants, plus sizes) and `IconButton.tsx` (requires `aria-label`, shows a tooltip via `title`), each with a `.module.css`.
- Add `Icon.tsx`: a handful of inline SVG icons (play, pause, plus, camera, eye or eye-off for include/exclude, rotate for realign, trash, download, grip, chevron, search, sort). This replaces the emoji and text glyphs, with no new icon dependency.
- Restyle native checkboxes and range inputs with `accent-color` and custom CSS for the range track and thumb, in a shared `forms.module.css`.

## Step 4: App shell and the two-pane layout
[App.tsx](frontend/src/App.tsx) and a new `App.module.css`:
- **Top bar.** A serif "Face Lapse" wordmark on the left. On the right: library stats ("1,020 photos · 2017–2024"), an **Add photos** button that triggers Upload's file input, and **Export**.
- **Main area.** A CSS grid with the library pane on the left (`minmax(0,1fr)`, scrolls on its own) and the studio pane on the right (~440–520px, `position: sticky`, full height). The studio pane holds the player and export settings.
- **Below ~1024px,** the panes stack: player on top, library below. Check this at phone width too.
- **Drop anywhere.** A full-window overlay appears while a file is being dragged over the page. Keep the existing `dropzone` element as the empty-state target so the tests still find it.

## Step 5: Upload flow restyle
[Upload.tsx](frontend/src/components/Upload.tsx), replacing `Upload.styles.ts` with `Upload.module.css`:
- **Empty library:** a large editorial empty state in the library pane ("Start your timelapse", drop target, Take photo).
- **Non-empty library:** upload collapses to the top-bar button plus drop-anywhere. Staging (the thumbnail tray, duplicate badges, Align) and alignment progress render as a tray at the top of the library pane.
- Restyle the webcam modal: paper surface, serif title, icon close button.
- Logic and state machine are unchanged. Rename only `style=` to `className=`.

## Step 6: Library pane restyle
[ImageLibrary.tsx](frontend/src/components/ImageLibrary.tsx), replacing `ImageLibrary.styles.ts`:
- Remove the nested `maxHeight: 500` scroll box so the pane itself scrolls. Open "Previously processed" by default, but keep its collapse button and test ID. The tests click it, so check whether any of them assume it starts collapsed and adjust the default only if they don't.
- **Section headers:** serif group titles with hairline rules. Search and sort become a slim toolbar.
- **Cards:**
  - Thumbnails sit on paper with a subtle print-style shadow and no heavy border.
  - The date replaces the filename as the primary label (filename moves to a tooltip).
  - Actions become icon buttons revealed on hover or focus (always visible on touch): include/exclude (eye), realign (rotate), delete (trash). The existing test IDs stay on the buttons.
  - Excluded cards are desaturated, with an "Excluded" tag.
- The no-face group becomes an amber-tinted callout instead of a bright yellow border. "Dismiss all" stays.
- Drag and drop (dnd-kit) is unchanged, with the grip handle styled to match.

## Step 7: Studio pane (player and export) restyle
[Timelapse.tsx](frontend/src/components/Timelapse.tsx) and [SpeedSlider.tsx](frontend/src/components/SpeedSlider.tsx), replacing their `.styles.ts` files:
- **Player.** The frame sits in a "mat": a dark frame inside a paper border, like a print. The date overlay becomes an editorial caption below the frame (large serif date, small-caps "Age 22") rather than white text over black. Keep the `timelapse-date-overlay` test ID on the caption.
- **Transport row.** Circular play/pause icon button, a thin scrubber, and a tabular-numerals frame counter.
- **Settings group,** with quiet labels:
  - Speed: frame duration, also shown as fps.
  - Show date and show age toggles, plus birthday (DatePicker).
  - Total duration.
- **Export.** "Download video" becomes a solid ink button with a download icon. Generation state and errors are styled to match.

## Step 8: DatePicker cleanup
[DatePicker.tsx](frontend/src/components/DatePicker.tsx): move its 19 inline styles and 5 `onMouseEnter`/`onMouseLeave` handlers to `DatePicker.module.css` using `:hover` and `:focus-visible`. Restyle the calendar in the editorial palette. Behavior is unchanged.

## Step 9: Verification and the 10x review records
- `cd frontend && npm run build` (tsc and the Vite build) must pass. Grep the source for leftover `style={{` and `*.styles.ts` imports. Dynamic values such as progress-bar width and the dnd transform may stay inline.
- Run the full Playwright suite in `e2e/`. All 6 specs must pass unchanged.
- Visual pass in Chrome at localhost:5173 with the real 1,020-image library:
  - Desktop width, a ~900px stacked layout and phone width.
  - Keyboard-only tab-through, checking focus rings.
  - Hover actions on cards, the drop-anywhere overlay, the staging tray and the webcam modal.
  - A before/after screenshot pair for each area.
- Write `.10x/decisions/{sde,qa,security}` and `.10x/reviews/2026-11-04-qa-report.md`. Security impact is minimal: no new inputs or endpoints, and fonts move from Google to self-hosted. Update `status.md` and commit.
