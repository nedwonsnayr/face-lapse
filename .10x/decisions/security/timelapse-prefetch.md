# Security: timelapse-prefetch
- **Requests:** prefetch only fetches frame URLs the app already builds for the same origin, with `credentials: "same-origin"` (the Cloudflare Access cookie). There are no new endpoints, no user input and no cross-origin requests.
- **Caching:** responses are already `private, immutable`, so the cache scope and policy don't change.
- **Load:** up to 6 concurrent low-priority requests per viewer, aborted when they leave the window. That's comparable to the old preload.
- **Verdict:** no findings.
