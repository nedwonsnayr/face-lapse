# Crop-search fallback — security review (2026-11-09)

Targeted change to existing local image processing only. No new endpoints, models, dependencies, external services, file inputs or permissions. Crops are in-memory views/resized arrays; originals are not edited. Candidate geometry is remapped to the same EXIF-oriented original coordinate contract. Search cost bounded to nine extra model calls with 1024 px crop input and ten unique returned candidates. Existing candidate-index validation, authentication, exclusion from exports, selection persistence and original-image storage stay unchanged.

Supplied personal HEIC and temporary alignment renders were used locally only, excluded from git/public fixtures/cloud jobs. Public regression fixture derives from existing repository fixture photos. No new blocking security issue identified in this targeted scope; this is not a new dependency or infrastructure audit.
