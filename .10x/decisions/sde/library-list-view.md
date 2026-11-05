# SDE — library-list-view (2026-11-05)
- A Grid | List toggle in the library toolbar. The choice is remembered per device in `localStorage["face-lapse:library-view"]` (falls back to grid if storage is unavailable).
- List rows: drag handle, 42×56 thumb (`size=thumb`), full date ("Thu, Nov 5, 2026"), source filename, In/Out chip, and re-align/delete always visible.
- Applies to "Just uploaded" and "All photos"; the no-face group stays a grid. Drag-to-reorder uses `verticalListSortingStrategy` in list view.
- Refactor: `PhotoActions` and `IncludeChip` are extracted from `CardBody` and shared with `RowBody`. Test ids are unchanged.
- Deliberately not built: the "+N days" gap column (owner declined).
- e2e: `library-view.spec.ts` (toggle, actions, persistence, phone and desktop screenshots). 36/36 pass.

## Follow-up: toggle froze the timelapse (2026-11-05)
- Cause: switching views remounted every card (~1,000) in one task, about 350 ms on a laptop and about 950 ms on a 4×-throttled phone, so the player stalled.
- Fix in `ImageLibrary.tsx`:
  - After a switch, render 30 items, then 20 more per task as a React transition, so player updates can interrupt.
  - Card and row bodies are `memo`'d with stable handlers (`useStableCallback`), so each batch renders only new items.
  - The drag handle moved out of the bodies, because its listeners change on every render.
  - `SortableContext` gets all ids, so its value doesn't change between batches.
- Measured (longest gap between player frames while toggling):
  - Laptop: 346 → ~120 ms (normal playback is 50 ms).
  - 2×-throttled phone: 560 → ~150–190 ms.
  - 4×-throttled phone: 950 → ~350 ms.
- Known quirk (pre-existing): "All photos" is displayed by filename number, so a drag changes the saved/video order but the card doesn't move on screen.
