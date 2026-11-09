# Manual face selection — architect

ADR-004. Alignment service returns candidate geometry or transforms a stored candidate. Images router owns persistence, list state, face discovery and validated selection. App owns review/picker; library exposes Change face. Only successful selected images enter playback/export.
