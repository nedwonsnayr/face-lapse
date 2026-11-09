# Export performance — architect

ADR-007: cache static canvas/fonts; reuse completed or running job by ordered inputs, source revision/stat and visible caption values, duration and renderer version. Single active export; different concurrent requests get retryable 409. Cache limited to existing 20 job records, process lifetime only. No persistent cache or DB migration.
