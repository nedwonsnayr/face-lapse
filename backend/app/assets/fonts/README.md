# Export fonts

Static Latin instances derived from the same Fontsource 5.3.0 packages used by the frontend:

- `Fraunces-Italic.ttf`: `@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2`, weight 400, optical size 72; remaining axes at their defaults.
- `Inter-SemiBold.ttf`: `@fontsource-variable/inter/files/inter-latin-wght-normal.woff2`, weight 600; remaining axes at their defaults.

Converted with FontTools' `TTFont` and `varLib.instancer.instantiateVariableFont`, then saved as uncompressed TrueType (`font.flavor = None`). Brotli is needed only when regenerating from WOFF2; neither helper is required by the export runtime. The committed font files work with Pillow on macOS and Linux.

Each font remains under the SIL Open Font License 1.1. The original copyright notices and full license text accompany these files in `fraunces-OFL.txt` and `inter-OFL.txt`.
