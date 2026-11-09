# manual-face-selection — sre

Local delivery only. Processed detections commit before progress is streamed, so a closed tab retains the face-choice queue. Original photos stay immutable; aligned writes use atomic replacement. Recover with Choose your face or Change face. Failed save keeps the dialog/choice for retry. Existing backups include SQLite candidate/selection columns without new exclusions. No new service, alerts or SLO; production health was not inspected. Existing runbook: docs/hosting.md.

## Hosted deployment (2026-11-09)
Pre-deploy snapshot completed on server at /home/ubuntu/face-lapse-pre-deploy/before-face-selection-20261109.db, directory mode 700 and file mode 600. Integrity check ok; 1,041 image records. Fresh off-site backup command rejected by automatic review for sensitive egress/pruning; no off-site backup was run. Same-server metadata snapshot used instead. Originals are immutable and migration adds columns only. Verify 1,041 rows retained and all service containers healthy after deploy.

## Hosted delivery complete
PR #18 merged; automatic deploy 42666132640 succeeded at 55a137a. Live app healthy, migration applied, SQLite integrity ok, all 1,041 records preserved. Production ARM fixture detects two faces and aligns either. Auth protection preserved. See reviews/2026-11-09-face-selection-deployment.md. Deployment notes committed locally only; no extra docs-only deployment triggered.
