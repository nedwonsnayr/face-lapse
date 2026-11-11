# SRE: settings-dark-mode
- **Monitoring:** no new server work, endpoints or jobs, so the existing health check and backups cover it.
- **Smoke test after deploy:** open facelapse.ryanmsnowden.com on a phone in dark mode and check for no white flash. Open Settings and switch to Light, then reload and confirm Light stays.
- **If it looks wrong:** a wrong palette is a CSS issue in `frontend/src/index.css`. A wrong startup value comes from `face-lapse:settings` in that browser's storage. Clearing site data resets it.
