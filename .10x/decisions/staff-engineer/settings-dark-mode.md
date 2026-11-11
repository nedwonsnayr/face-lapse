# Staff Engineer: settings-dark-mode
- **Colors:** every UI color comes from tokens. Literal colors are allowed only for chrome drawn over photos or the mat: face boxes, countdown, frame-loading banner and "no photos" text on the mat. Those are the same in both themes.
- **Storage:** follow the existing `try/catch` around `localStorage`, as in `ImageLibrary.loadView` and `ExportSettings`.
- **Dialog:** reuse the dialog pattern from `PhotoDateEditor`: `showModal` on mount and focus restored on close.
- **Shared controls:** reuse `SpeedSlider` for the speed setting. Use radio groups styled as segmented controls for the theme, view and order, with the same `forms.module.css` vocabulary.
- **Test ids:** `settings-button`, `settings-dialog`, `theme-<value>`, `setting-autoplay`, `setting-show-date`, `setting-view-<v>`, `setting-order-<v>`.
