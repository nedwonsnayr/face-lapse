# styled-video-export — sre

All caption modes render one frame at a time and use a temporary sequence cleaned up on return/failure. Rendering failure is explicit; no silently mixed styles. Unique filenames prevent simultaneous jobs/options overwriting results. Existing in-memory job restart/concurrency behavior is unchanged. No new service, alerts or SLO; no hosted rollout performed.
