# Export performance — sre

Render/encode timing and cache reuse logs added. One active job; matching requests attach/reuse. Process restart clears reuse and in-flight jobs. Cache limited to 20 retained records; missing MP4 regenerates. Existing export disk retention unchanged. Investigate slow export by phase logs; no invented ETA. ARM public-fixture check confirms 46.7% less full-export time.
