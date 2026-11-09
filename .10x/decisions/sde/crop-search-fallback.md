# Crop-search fallback — implemented

Existing full-frame search remains first. Added nine bounded half-frame crops, normalized geometry remapping and overlap/eye-based duplicate suppression. Each crop is at most 1024 px and the result is capped at ten faces. Existing selections, API/schema and original pixels remain unchanged. Public distant-face fixture and six backend/one browser regressions added. Supplied HEIC tested locally: two distinct foreground faces found in ~0.5 s. No private photo added to repo.
