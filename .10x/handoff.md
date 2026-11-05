# Handoff → user (account setup) → DevOps (go-live)
The code is done and tested locally on branch `cloud-hosting` (not pushed).
Next: the user follows `docs/hosting.md` §1 (Oracle, Cloudflare domain/tunnel/Access, B2, healthchecks) and shares the server IP and team domain, but no secrets.
Then do task 9: `deploy.sh`, `server-setup.sh`, the user writes `.env`, rsync the data, first backup, time video generation (decides whether it needs a background job), optionally set up the GH deploy (§3).
