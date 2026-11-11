# DBA: settings-dark-mode
No database or API change. Settings live in each browser's `localStorage` under `face-lapse:settings` (ADR-011). The legacy key `face-lapse:library-view` is read once as a fallback and is no longer written.
