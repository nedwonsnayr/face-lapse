# Hosting Face Lapse

Face Lapse runs on an Oracle Cloud Always Free VM. You reach it at `https://facelapse.<your-domain>.com` through Cloudflare, which asks for an email code before anything loads. Photos are backed up every night, encrypted, to Backblaze B2.

```
phone / laptop ──HTTPS──▶ Cloudflare Access (email code)
                              │
                     Cloudflare Tunnel (outbound from the VM; no open ports)
                              │
          Oracle VM ─ docker compose: cloudflared ──▶ app:8000 (FastAPI + SPA)
                                                       └── ./data  ──nightly restic──▶ Backblaze B2
```

**Cost:** about $11/yr for the domain. Everything else stays within free tiers: Oracle Always Free, Cloudflare Zero Trust Free (up to 50 users), and B2's first 10 GB.

---

## 1. One-time account setup (about 45 minutes, in your browser)

### Oracle Cloud (the server)
1. Sign up at <https://signup.cloud.oracle.com>.
   - A card is needed for identity verification. Always Free resources aren't charged.
   - **Home region:** pick one close to you. It **can't be changed later**. A1 (ARM) capacity is easier to get in less popular regions, such as US West (San Jose) or US Midwest (Chicago) rather than Ashburn.
2. *(Recommended)* Billing → **Upgrade to Pay As You Go**. You still pay $0 within Always Free limits. It stops Oracle from reclaiming idle "free" VMs and makes A1 capacity much easier to get.
   - Then go to Billing → Budgets → create a **$1 budget alert**, so any accidental spend emails you.
3. Compute → Instances → **Create instance**:
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere → `VM.Standard.A1.Flex`, **4 OCPU / 24 GB**.
   - **Networking:** create a new VCN with a public subnet and assign a public IPv4 address.
   - **SSH keys:** paste `~/.ssh/id_ed25519.pub`. If you don't have one, run `ssh-keygen -t ed25519`.
   - **Boot volume:** 100 GB. Always Free allows 200 GB in total.
   - If you see **"Out of capacity"**, try another availability domain or retry later. This is common, and Pay As You Go helps.
4. Note the **public IP**. The login user is `ubuntu`.

### Cloudflare (domain, tunnel, login)
1. Sign up at <https://dash.cloudflare.com>. Go to Domain Registration → **Register domain** → pick a `.com` (about $10.44–11.15/yr, sold at cost).
2. Main dashboard → **Networking → Tunnels** → **Create Tunnel**. (Tunnels moved here in February 2026; the older Zero Trust → Networks → Connectors path still works.)
   - Name it `face-lapse`. When asked for the OS, pick **Docker**.
   - Copy the **token**: the long string after `--token` in the install command. → `TUNNEL_TOKEN`
   - Add a **published application** route:
     - **Hostname:** subdomain `facelapse`, domain `ryanmsnowden.com`
     - **Service URL:** `http://app:8000`
   - Cloudflare creates the DNS record for you.
3. Open **Zero Trust** (it may be labelled **Cloudflare One**) and choose the **Free** plan. It asks for a card but doesn't charge it.
4. Zero Trust → **Access controls → Applications** → **Add an application** → *Self-hosted*:
   - **Add public hostname:** subdomain `facelapse`, domain `ryanmsnowden.com`.
   - **Policy:** Action *Allow*, Include → *Emails* → your email address.
   - **Login method:** One-time PIN (the default).
   - After saving, open the app and copy the **Application Audience (AUD) tag**. → `CF_ACCESS_AUD`
5. Zero Trust → Settings → note your **team domain**, e.g. `yourteam.cloudflareaccess.com`. → `CF_ACCESS_TEAM_DOMAIN`

### Backblaze B2 (backups)
1. Sign up at <https://www.backblaze.com/sign-up/cloud-storage>. Buckets → **Create a bucket**: private, with a unique name such as `face-lapse-<random>`.
2. Application Keys → **Add a New Application Key**, restricted to that bucket with Read and Write access.
   - `keyID` → `B2_ACCOUNT_ID`
   - `applicationKey` → `B2_ACCOUNT_KEY`
3. Make a long random **restic password** (`openssl rand -base64 32`) and **save it in your password manager**. Without it the backups can't be decrypted, and nobody can recover it. → `RESTIC_PASSWORD`

### healthchecks.io (backup alerts, optional but recommended)
Create a free check with period **1 day** and grace **2 hours**, then copy its ping URL. → `HEALTHCHECK_URL`

---

## 2. First deploy (from the laptop)

```bash
export FACE_LAPSE_HOST=ubuntu@<server-ip>
```

```bash
./scripts/deploy.sh   # first run copies code; the build fails without .env, which is expected
```

```bash
ssh $FACE_LAPSE_HOST 'bash ~/face-lapse/scripts/server-setup.sh'
```

Create the secrets file **on the server**. It never goes in git.

```bash
ssh $FACE_LAPSE_HOST 'cp ~/face-lapse/.env.example ~/face-lapse/.env && chmod 600 ~/face-lapse/.env && nano ~/face-lapse/.env'
```

Copy the photos. Stop the local app first so the DB isn't mid-write. About 4.3 GB, and it resumes if interrupted.

```bash
rsync -avP --exclude videos data/ $FACE_LAPSE_HOST:face-lapse/data/
```

```bash
ssh $FACE_LAPSE_HOST 'sudo chown -R 1000:1000 ~/face-lapse/data'
```

```bash
./scripts/deploy.sh
```

On startup the app rewrites the image paths stored in the DB to the server's `/data` (migration 004). Then run the first backup by hand and confirm it:

```bash
ssh $FACE_LAPSE_HOST 'sudo ~/face-lapse/scripts/backup.sh && set -a && . ~/face-lapse/.env && restic snapshots'
```

Open `https://facelapse.<your-domain>.com`, enter the emailed code, and you should see your library. **Keep the laptop's `data/` folder** until you've confirmed the site and a backup. After that it's a free second copy.

---

## 3. Automatic deploys from GitHub (optional, after the first deploy)

`.github/workflows/deploy.yml` deploys every push to `main`. You can also run it by hand from the Actions tab (*Deploy → Run workflow*) for any branch or commit. Until the secrets below exist, it skips with a notice.

The workflow's SSH key is locked on the server to one command, `scripts/remote-deploy.sh`. That script only accepts `deploy <commit sha>` for a commit that exists on GitHub. A leaked key can't open a shell or read your photos; it can only redeploy code already in the repo.

1. Make a dedicated deploy key on the laptop:
   ```bash
   ssh-keygen -t ed25519 -N '' -C gh-deploy -f ~/.ssh/face-lapse-deploy
   ```
2. Install it on the server, pinned to the deploy script:
   ```bash
   ssh $FACE_LAPSE_HOST "echo 'command=\"/home/ubuntu/face-lapse/scripts/remote-deploy.sh\",restrict $(cat ~/.ssh/face-lapse-deploy.pub)' >> ~/.ssh/authorized_keys"
   ```
3. Check it. The key should deploy and can't do anything else:
   ```bash
   ssh -i ~/.ssh/face-lapse-deploy $FACE_LAPSE_HOST "deploy $(git rev-parse origin/main)"
   ```
   ```bash
   ssh -i ~/.ssh/face-lapse-deploy $FACE_LAPSE_HOST "ls"   # expect: usage: deploy <40-char commit sha>
   ```
4. Add the secrets to the `production` environment (GitHub → Settings → Environments → New environment `production`). Then, from the laptop:
   ```bash
   gh secret set DEPLOY_HOST --env production --body "$FACE_LAPSE_HOST"
   ```
   ```bash
   gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/face-lapse-deploy
   ```
   ```bash
   ssh-keyscan -t ed25519 <server-ip> | gh secret set DEPLOY_KNOWN_HOSTS --env production
   ```
5. *(Optional)* Under the environment, set **Deployment branches** to `main` only.

`./scripts/deploy.sh` still works for deploying uncommitted changes. The next GitHub deploy resets the server to the exact commit.

---

## 4. Day to day

| Task | Command |
|---|---|
| Deploy code changes | push to `main`, or `./scripts/deploy.sh` for local changes |
| Logs | `ssh $FACE_LAPSE_HOST 'cd face-lapse && docker compose logs -f --tail 100'` |
| Restart | `ssh $FACE_LAPSE_HOST 'cd face-lapse && docker compose restart'` |
| Roll back | `git checkout <good-commit> && ./scripts/deploy.sh` |
| Backup log | `ssh $FACE_LAPSE_HOST 'tail -20 /var/log/face-lapse-backup.log'` |

Upload limit: Cloudflare caps a single request at 100 MB. The app sends uploads in chunks of 80 MB or less, so this only matters for a single file over 100 MB.

---

## 5. Restore from backup (new server, or after data loss)

1. Set up a new VM: run section 1's Oracle steps, then section 2 up to and including writing `.env`.
2. Restore the backup into the data folder:
   ```bash
   ssh $FACE_LAPSE_HOST 'cd ~/face-lapse && set -a && . ./.env && set +a && restic snapshots && sudo -E restic restore latest --target /tmp/restore'
   ```
3. Move it into place. Restic restores full paths, so look under `/tmp/restore/home/ubuntu/face-lapse/data`:
   ```bash
   ssh $FACE_LAPSE_HOST 'R=/tmp/restore/home/ubuntu/face-lapse/data; sudo rsync -a $R/ ~/face-lapse/data/ && sudo cp $R/.backup/face_lapse.db ~/face-lapse/data/face_lapse.db && sudo chown -R 1000:1000 ~/face-lapse/data'
   ```
4. `./scripts/deploy.sh`. Paths are fixed up automatically, and videos can be regenerated from the app.

---

## 6. Troubleshooting

- **Cloudflare error 1033 / "tunnel not found":** the `cloudflared` container is down or `TUNNEL_TOKEN` is wrong. Check `docker compose logs cloudflared`.
- **Error 502:** the tunnel is up but the app isn't. Check `docker compose ps` and `docker compose logs app`.
- **403 "Invalid Cloudflare Access token":** `CF_ACCESS_AUD` or `CF_ACCESS_TEAM_DOMAIN` in `.env` doesn't match the Access application.
- **Slow Download Video:** generation runs as a background job. The UI shows preparing-photo counts, then encoding. Check app logs for `Export rendered`, `Export encoding finished`, and `Video ready` durations. Identical requests reuse a running/completed export while retained in the process-local 20-job registry; restart or eviction requires regeneration. A different export while one runs returns a retry message. Keep one application worker; the job registry is not shared across processes. Existing MP4s remain on disk with their original download URLs.
- **healthchecks.io email "backup is down":** check `/var/log/face-lapse-backup.log` and test the B2 keys with `restic snapshots`.
- **Oracle reclaimed or stopped the VM:** start it from the console. If it's gone, follow section 4.
- **Rotate the tunnel token:** Zero Trust → Tunnels → face-lapse → *Refresh token*, update `.env`, then `docker compose up -d`.

## Archive experience rollout (migration 009)

Migration 009 adds nullable `images.deleted_at` and a `(profile_id, deleted_at)` index; it does not move or rewrite photos. Trash is retained indefinitely and included in nightly backups. Only the explicit permanent-delete action removes original/aligned files. Copying between people uses independent UUID-named files, increasing disk usage accordingly.

The existing root cron invokes the checked-out `scripts/backup.sh`. It now records `data/backup-status.json` atomically via `scripts/backup-status.py` (Python 3, already installed on the host). The file contains only attempt/success times and state, is readable by the app container, and never contains credentials. Success is recorded only after backup, retention and the integrity check all complete. A failure preserves the previous success timestamp. An interrupted run remains an unfinished attempt; the UI reports this without claiming completion. The UI reports unknown until the first recorded attempt and overdue after 36 hours without success. Existing healthchecks.io alerts remain in place.

Roll forward for application issues where possible. Old code ignores `deleted_at` and would show trashed photos again; it also uses hard deletion. Do not drop the column or restore an older database over new uploads as an application rollback. Keep a pre-deploy database backup and the current originals/aligned files. Rollback of frontend-only issues should retain the new backend lifecycle semantics.

Verify after merging: active photos/timelapse load; Trash and Restore preserve a test photo; date/sample export count matches preview; new backups update Archive health. Inspect logs for pool timeouts or copy/backup errors. Run fixture-based checks without mutating the owner's real photos.
