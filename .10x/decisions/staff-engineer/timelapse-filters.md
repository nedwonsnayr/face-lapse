# Staff Engineer: timelapse-filters
- **One spec, two implementations.** The formulas live in the spec. Each code file cites the step numbers, and any change needs both implementations and the matching test updated.
- **Grain is integer-only:** uint32 lowbias32 and integer cell math, with no float hashing.
- **Validation:** the backend uses a Pydantic `extra="forbid"` model with bounded fields. The frontend `validateFilter` guards localStorage and API data.
- **UI:**
  - Tokens only (ADR-001/011), CSS Modules, and the `forms.module.css` range and field styles.
  - The delete confirmation reuses the dialog pattern from `PhotoDateEditor`.
- **Keep the old contract:** `<img data-testid="timelapse-frame">` stays in the DOM. The canvas is an overlay.
- **Router style:** follow `profiles.py`, with Pydantic inputs and clean 409 and 422 details. The model goes in `models.py`, and the migration is idempotent.
- **Test ids:** `filter-picker`, `filter-chip-<slug>`, `filter-new`, `filter-editor`, `filter-name`, `filter-<control>`, `filter-save`, `filter-cancel`, `filter-delete`, `timelapse-filtered-frame`.
