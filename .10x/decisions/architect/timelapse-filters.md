# Architect: timelapse-filters (ADR-012)
## Components
- `frontend/src/filters/`:
  - `definition.ts`: types and validation
  - `builtins.json` / `builtins.ts`
  - `FilterRenderer.ts`: WebGL2
  - `FilterCanvas.tsx`
- `components/FilterPicker.tsx` and `components/FilterEditor.tsx`. Filter state is owned by `Timelapse`.
- `backend/app/services/filters.py`: `FilterDefinition`, `canonical_filter` and `apply_filter`.
- `models.FilterPreset`, `migrations/011`, `routers/filters.py` (`/api/filters`).
## Data flow
1. A chip or the editor sets the `filter` state in `Timelapse`.
2. `BufferedFrame` draws the decoded frame through `FilterCanvas`, using uniforms and the frame index.
3. On export, `generateVideo` POSTs the definition in the JSON body. The router validates it and adds it to the key, then the job thread calls `generate_video` → `render_video_frame(..., filter, index)` → `apply_filter`.
4. Presets go through the CRUD API to SQLite. They are listed once on mount and refetched after each change.
## Failure modes
- **No WebGL2 or context lost:** show the plain `<img>` with a note. The export still applies the filter.
- **Presets API down:** the built-ins still work, with a retry message.
- **Invalid definition:** 422.
- **Name taken or 50-preset cap:** 409, and the editor keeps the draft.
- **Selected preset deleted:** the filter stays applied as an unsaved copy.
