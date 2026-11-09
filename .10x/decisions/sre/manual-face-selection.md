# manual-face-selection — sre

Local delivery only. Processed detections commit before progress is streamed, so a closed tab retains the face-choice queue. Original photos stay immutable; aligned writes use atomic replacement. Recover with Choose your face or Change face. Failed save keeps the dialog/choice for retry. Existing backups include SQLite candidate/selection columns without new exclusions. No new service, alerts or SLO; production health was not inspected. Existing runbook: docs/hosting.md.
