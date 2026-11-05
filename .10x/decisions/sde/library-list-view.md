# SDE — library-list-view (2026-11-05)
- A Grid | List toggle in the library toolbar. The choice is remembered per device in `localStorage["face-lapse:library-view"]` (falls back to grid if storage is unavailable).
- List rows: drag handle, 42×56 thumb (`size=thumb`), full date ("Thu, Nov 5, 2026"), source filename, In/Out chip, and re-align/delete always visible.
- Applies to "Just uploaded" and "All photos"; the no-face group stays a grid. Drag-to-reorder uses `verticalListSortingStrategy` in list view.
- Refactor: `PhotoActions` and `IncludeChip` are extracted from `CardBody` and shared with `RowBody`. Test ids are unchanged.
- Deliberately not built: the "+N days" gap column (owner declined).
- e2e: `library-view.spec.ts` (toggle, actions, persistence, phone and desktop screenshots). 36/36 pass.
