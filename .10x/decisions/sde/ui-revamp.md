# ui-revamp — SDE
**Built (commit 25c6d10):**
- `index.css`: paper/ink token set (legacy names aliased), self-hosted Fraunces + Inter via @fontsource-variable, `:focus-visible` ring, reduced-motion.
- `components/ui/`: Button, IconButton (requires label), Icon (inline SVG set), cx, forms.module.css (range, checkbox, field, eyebrow).
- `App.tsx`: top bar (wordmark, photo count + year range, Add photos), two-pane grid, window-level drop overlay.
- `Upload.tsx`: forwardRef `UploadHandle { openFilePicker, addFiles }`. The single file input moved outside the dropzone. Hero empty state, or a compact strip when the library has photos. Staging tray; shutter-style webcam capture.
- `ImageLibrary.tsx`: a shared `CardBody` removes the duplicated sortable/static card markup. Hover actions, date-first labels, In/Out chip with eye icon, no nested scroll box. The main group is expanded by default and titled "All photos" when nothing was just uploaded.
- `Timelapse.tsx` / `SpeedSlider.tsx`: matted frame, editorial caption, transport row, settings panel, fps readout, export summary.
- `DatePicker.tsx` / `ErrorBoundary.tsx`: all inline styles and JS hover handlers moved to CSS.

**Deviations from spec:**
- No separate "Export" button in the top bar; Download stays in the studio pane only (avoids duplicate test IDs and logic).
- The library header keeps "(N images)" next to a group count; slightly redundant, left as is.

**Tech debt / follow-ups:**
- The backend bakes a black fill into rotated aligned frames, visible inside the mat.
- Rendering all ~1,000 sortable cards on load works, but virtualization would help as the library grows.
- `e2e/start-test-server.sh` probes 127.0.0.1, while Vite can bind IPv6 `localhost` only, so the manual run failed its readiness check (the Playwright run worked).
