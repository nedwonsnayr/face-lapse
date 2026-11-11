# Timelapse filters: design

**Date:** 2026-11-10
**Status:** Approved by the user (brainstorm and plan approved 2026-11-10)
**Feature slug:** `timelapse-filters`
**ADR:** 012

## Goal
Add story-style filters to the timelapse:
- A chosen filter applies **immediately** to playback, including mid-play, and is applied to the **downloaded MP4**.
- Ten built-in presets, plus custom presets that anyone can create, edit, duplicate and delete. Every option can be tuned during creation.

## Decisions from brainstorming
- **Full look:** color adjustments, fade, tint with blend modes, vignette, and **moving film grain**.
- **Custom presets** are stored on the server and shared by every person's timelapse (no `profile_id`).
- **Built-in presets** are fixed and live in the frontend only. "Duplicate" copies one into the editor as a new custom preset.
- **One filter pipeline, implemented twice:** a WebGL2 shader for playback and numpy for export. CSS filters are not used.
- **Exports send the full filter definition**, which the server validates. Preset IDs are never sent to the export.
- **Preset names are our own.** We don't use Instagram's trademarks.
- **Out of scope:** a default filter in Settings, per-person presets, grain color or chroma, curves editors, and LUT import.

## Filter definition (version 1)
```json
{
  "version": 1,
  "brightness": 1, "contrast": 1, "saturation": 1,
  "grayscale": 0, "warmth": 0, "hue": 0,
  "fade": 0,
  "tint":     { "color": "#ffffff", "blend": "soft-light", "strength": 0 },
  "vignette": { "strength": 0, "size": 0.5 },
  "grain":    { "amount": 0, "size": 0.5 }
}
```
| Field | Range | Identity |
|---|---|---|
| brightness | 0.5–1.5 | 1 |
| contrast | 0.5–1.5 | 1 |
| saturation | 0–2 | 1 |
| grayscale | 0–1 | 0 |
| warmth | 0–1 | 0 |
| hue | −180–180 (degrees) | 0 |
| fade | 0–1 | 0 |
| tint.color | `#rrggbb` | (any) |
| tint.blend | soft-light, overlay, multiply, screen | (any) |
| tint.strength | 0–1 | 0 |
| vignette.strength / size | 0–1 / 0–1 | 0 / (any) |
| grain.amount / size | 0–1 / 0–1 | 0 / (any) |

- A definition is the **identity** when every color field is at its identity value and the tint, vignette and grain strength/amount are all 0.
- Unknown keys are rejected on the server. On the client, a stored definition with unknown keys or out-of-range values is discarded.

## Pipeline (normative; both implementations follow this exactly)
- **Working values:** sRGB values in [0, 1] (8-bit divided by 255). There is no linearization.
- **Clamping:** after every step, values are clamped to [0, 1].
- **Coordinates:** pixel `(x, y)` is an integer with origin at the **top-left**. `W` and `H` are the photo's pixel size and `u = (x+0.5)/W`, `v = (y+0.5)/H`.

1. **Brightness** `b`: `c = c·b`
2. **Contrast** `k`: `c = (c − 0.5)·k + 0.5`
3. **Saturation** `s` uses the Filter Effects `saturate` matrix:
   ```
   [.213+.787s  .715−.715s  .072−.072s]
   [.213−.213s  .715+.285s  .072−.072s]
   [.213−.213s  .715−.715s  .072+.928s]
   ```
4. **Grayscale** `g` uses the Filter Effects `grayscale` matrix, with `a = 1−g`:
   ```
   [.2126+.7874a  .7152−.7152a  .0722−.0722a]
   [.2126−.2126a  .7152+.2848a  .0722−.0722a]
   [.2126−.2126a  .7152−.7152a  .0722+.9278a]
   ```
5. **Warmth** `w` uses the Filter Effects `sepia` matrix, with `a = 1−w`:
   ```
   [.393+.607a  .769−.769a  .189−.189a]
   [.349−.349a  .686+.314a  .168−.168a]
   [.272−.272a  .534−.534a  .131+.869a]
   ```
6. **Hue** `h` (degrees) uses the Filter Effects `hue-rotate` matrix with `C = cos h`, `S = sin h`:
   ```
   [.213+.787C−.213S  .715−.715C−.715S  .072−.072C+.928S]
   [.213−.213C+.143S  .715+.285C+.140S  .072−.072C−.283S]
   [.213−.213C−.787S  .715−.715C+.715S  .072+.928C+.072S]
   ```
7. **Fade** `f`: `c = c·(1 − 0.35f) + 0.22f`. Blacks lift to 0.22 and whites fall to 0.87 at full fade.
8. **Tint** (color `t`, mode, strength `p`): `c = c + (B(c, t) − c)·p`, where `B` follows the W3C compositing formulas, with backdrop `c` and source `t`:
   - multiply: `c·t`
   - screen: `c + t − c·t`
   - overlay: `c ≤ .5 ? 2·c·t : 1 − 2·(1−c)·(1−t)`
   - soft-light:
     - if `t ≤ .5`: `c − (1−2t)·c·(1−c)`
     - otherwise: `c + (2t−1)·(D(c) − c)`, where `D(c) = c ≤ .25 ? ((16c−12)·c+4)·c : √c`
9. **Vignette** (strength `q`, size `z`):
   - `px = (2u−1)·A`, `py = 2v−1`, where `A = W/H`
   - `d = √(px²+py²) / √(A²+1)`, which is 1 at the corners
   - `inner = 0.8 − 0.6z`, `outer = inner + 0.5`
   - `e = smoothstep(inner, outer, d)`
   - `c = c·(1 − q·e)`
10. **Grain** (amount `m`, size `n`):
    - `cells = round(320 − 240n)`. These are grain cells across the width.
    - `cx = ⌊x·cells / W⌋`, `cy = ⌊y·cells / W⌋`, computed with integer arithmetic.
    - `seed = lowbias32(cx + lowbias32(cy + lowbias32(frame)))`. This is uint32 arithmetic that wraps, where `lowbias32(x)`:
      ```
      x ^= x>>16; x *= 0x7feb352d; x ^= x>>15; x *= 0x846ca68b; x ^= x>>16
      ```
    - `r = (seed >> 8) / 16777215 · 2 − 1`, in [−1, 1] and exact in float32.
    - `c = c + r·m·0.2`, the same value added to all three channels.
    - `frame` is the frame's 0-based position in the selected sequence, so preview and export use the same index for the same selection.
11. **Output:** `⌊c·255 + 0.5⌋`.

**Matching between implementations:** given the same input pixels, the WebGL and numpy outputs differ by at most 2/255 per channel.

## Built-in presets
All omitted fields are identity.

| Name | Settings |
|---|---|
| Original | identity |
| Mono | grayscale 1, contrast 1.1 |
| Noir | grayscale 1, contrast 1.4, brightness 0.92, vignette 0.5/0.5 |
| Vivid | contrast 1.15, saturation 1.4, brightness 1.03 |
| Warm | warmth 0.2, saturation 1.15, brightness 1.04, tint #ffb36b soft-light 0.25 |
| Faded | fade 0.5, saturation 0.8, contrast 0.95 |
| Vintage | warmth 0.45, contrast 1.05, fade 0.25, vignette 0.35/0.5, grain 0.25/0.3 |
| Cool | tint #4fa3ff soft-light 0.3, saturation 0.95, brightness 1.02 |
| Matte | fade 0.35, contrast 0.9, saturation 0.9, tint #2b3a55 screen 0.12 |
| Film | contrast 1.08, saturation 0.9, warmth 0.12, fade 0.15, grain 0.45/0.45, vignette 0.25/0.4 |

## Components
- **Frontend:**
  - `src/filters/definition.ts`: types, `IDENTITY`, `isIdentity`, `normalizeFilter` and `validateFilter`.
  - `src/filters/builtins.json` + `builtins.ts`: the presets. The JSON is also read by the matching-test reference script.
  - `src/filters/FilterRenderer.ts`: WebGL2. It uses `texelFetch` at native size, `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE`, `alpha:false` and `preserveDrawingBuffer:true`.
  - `src/filters/FilterCanvas.tsx`
- **Player:**
  - `BufferedFrame` keeps its `<img data-testid="timelapse-frame">`. For a non-identity filter it overlays a `<canvas data-testid="timelapse-filtered-frame">` drawn from the decoded cached image.
  - If WebGL2 is unavailable or the context is lost, it shows the plain `<img>` with a note ("Filter preview isn't available in this browser; the download will still use it").
- **Picker:** `FilterPicker` is a chip strip in *Playback & export*: Original, the built-ins, then custom presets, each with a thumbnail of the displayed frame. Thumbnails refresh on pause, on frame change while paused, and when presets change.
- **Editor:** `FilterEditor` is an inline panel with these sections:
  - Light & color
  - Fade
  - Tint (color, blend, strength)
  - Vignette
  - Grain
  
  It has a name field, a reset per control, Save, Cancel (restores the prior filter) and Delete (with confirmation) for custom presets. The player is the live preview and is sticky on narrow screens while the editor is open.
- **Backend:**
  - `services/filters.py`: `FilterDefinition` (Pydantic, `extra="forbid"`), `canonical_filter()` (identity becomes `None`, floats rounded to 4 places) and `apply_filter(photo, definition, frame_index)`.
  - `models.FilterPreset` (id, name unique 1–40, definition JSON, created_at, updated_at) and `migrations/011_add_filter_presets.py`.
  - `routers/filters.py` at `/api/filters`: GET (list, by name), POST (create), PUT `/{id}` (edit or rename) and DELETE `/{id}`. A duplicate name returns 409, and the 51st preset returns 409.
- **Export:**
  - `POST /api/video/generate` takes an optional JSON body `{"filter": FilterDefinition|null}`.
  - `render_video_frame` filters the resized photo before pasting it. Identity skips the step, so the output is byte-identical to today.
  - `_export_key` becomes `styled-export-v2` and includes the canonical filter.
- **Saved export presets** (localStorage) gain an optional `filter` copy. Old presets load as Original.

## Error handling
- **Invalid definition on export or save:** 422 with a readable message.
- **Name taken / cap reached:** 409. The editor shows the message and keeps the user's changes.
- **Presets list fails to load:** the built-ins still show, along with a retry message.
- **Deleting a preset while it's selected:** the playback filter stays selected as an unsaved copy.

## Testing
- **Backend unit tests:**
  - per-control values
  - clamping
  - identity no-op
  - grain determinism and per-frame change
  - validation
  - CRUD, duplicate names and the cap
  - migration idempotency and data retention
  - the export cache key includes the filter
  - a filtered frame changes only inside the photo area
- **Matching test (Playwright):** the fixture and a definitions matrix (every control at its extremes, every blend mode, all built-ins) are rendered through `FilterRenderer` and compared with `scripts/filter_reference.py` output. Each channel must be within 2/255.
- **Playwright end-to-end:**
  - a chip changes canvas pixels while playing
  - create, edit, duplicate and delete, and presets persist after a reload
  - an export preset keeps its filter
  - the export request carries the filter
  - the WebGL-unavailable fallback
- **Visual pass:** light and dark themes, desktop and 390 px wide, with the editor open.

## Costs
- **Export time:** about 50–100 ms per frame extra when filtered.
- **File size:** grain increases MP4 size by about 2–3×.
- **Unfiltered exports:** unchanged.
