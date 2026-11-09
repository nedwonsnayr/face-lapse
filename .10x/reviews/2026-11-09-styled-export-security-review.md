# Styled video export — security review (2026-11-09)

No new endpoint or external rendering service. New show_age is a validated boolean; birthday is required and parsed as a calendar date only when age is enabled. Bad/missing birthday receives 422; internal validation does not print the supplied birthday. Existing authentication and path-traversal-protected download route remain.

Two static font assets originate from existing Fontsource dependencies and retain copyright/OFL notices. No new runtime package, font download or remote call. Source images and input metadata are not overwritten. Temporary frames clean up on success/failure; unique server-generated UUID filenames isolate export options/jobs. Rendering errors abort export instead of returning an unstyled or partly styled video; product error remains generic and diagnostics stay in server logs.

No new blocking issue found in this scope. Existing in-process job concurrency/CPU admission concerns from the earlier analysis are unchanged. This is not a fresh dependency advisory or infrastructure audit.
