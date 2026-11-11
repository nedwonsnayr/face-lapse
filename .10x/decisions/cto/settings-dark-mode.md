# CTO: settings-dark-mode
- **Verdict:** build. It's small, frontend-only, and has no running cost or deploy changes.
- **Build vs buy:** no library needed. CSS `light-dark()` plus a roughly 60-line settings module covers it.
- **Direction:** settings are device preferences, not account data. Revisit server sync only if the user asks for it.
