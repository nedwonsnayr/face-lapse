# Storage limits plan: VM disk and B2 backups

**Date:** 2026-11-26 · **Status:** proposed, awaiting the owner's decision · **Related:** ADR-003, `docs/hosting.md`, `scripts/backup.sh`

Nothing in this plan has been applied. No changes were made to the VM, to B2 or to the backup setup. All measurements below were read-only.

## Context

Face Lapse stores everything on the Oracle Always Free VM's 100 GB boot volume. Always Free allows 200 GB of block storage in total. Every night `scripts/backup.sh` sends an encrypted restic snapshot of `data/` to Backblaze B2, whose first 10 GB is free. Exported videos and thumbnails are excluded from the backup because they can be regenerated.

**Short answer:**

- **B2's 10 GB free tier is the first limit, but not soon.** At the current pace it's about 10 years away. Two things would bring it much closer:
  - importing another person's archive, about 4 GB each;
  - a daily-selfie habit.
- **Going over B2's free tier costs very little:** a few cents a month at this scale. The real risk is being surprised, not the cost.
- **The VM disk is in no danger from photos.** Its one unbounded grower is exported videos: each export writes a new ~128 MB MP4 that is never deleted.
- **Recommendation:**
  - Let B2 run past 10 GB and pay the small bill.
  - Delete old exported videos automatically.
  - Add nightly storage numbers and an email alert, so neither limit arrives unannounced.

## Current usage (measured 2026-11-26)

### VM disk

The filesystem is 96 GB on the 100 GB boot volume. **19 GB is used (19%) and 78 GB is free.**

| What | Size | Notes |
|---|---|---|
| `data/originals` | 3.45 GB | 1,067 photos, 3.3 MB average, largest 28 MB |
| `data/videos` | 0.77 GB | 6 exported MP4s, about 128 MB each. Never deleted, not backed up |
| `data/aligned` | 0.60 GB | 1,062 aligned frames, about 0.57 MB each |
| `data/thumbs` | 0.16 GB | 4,211 thumbnails (several sizes per photo) |
| `data/face_lapse.db` | < 1 MB | SQLite |
| Docker (`/var/lib/containerd`) | 7.4 GB | App image 2.1 GB plus build cache. Docker reports 6.1 GB of the cache as reclaimable |
| OS (`/usr` and the rest) | about 3 GB | |
| Swapfile | 2 GB | |
| Logs (`/var/log`) | 0.2 GB | The journal is 145 MB and bounded by journald's defaults |

**Docker build cache isn't growing.** Almost all of it dates from the first builds on Nov 5. Later deploys add about 1–2 MB each. Docker 29.9 with BuildKit 0.34 also garbage-collects its build cache automatically, with no `daemon.json` override.

### B2 (restic repository)

| What | Value |
|---|---|
| Stored in B2 | 3.948 GiB (4.24 GB) |
| Snapshots | 10 (retention: 7 daily, 4 weekly, 6 monthly) |
| Backed-up set | 2,127 files, 3.955 GiB: originals, aligned frames, DB snapshot |
| Compression | 1.00×. JPEGs don't compress, so restic saves nothing here |
| Free-tier headroom | about 5.8 GB |
| Nightly integrity check | `restic check --read-data-subset=5%` downloads about 200 MB a night, around 6 GB a month. That's inside B2's free egress of 3× stored data |

## Growth so far

- **Backup set:** 3.927 GiB on Nov 6 (first logged run) → 3.955 GiB on Nov 26. That's +28 MiB in 20 days, **about 0.5 GB a year**.
- **Photos by date taken:**

  | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
  |---|---|---|---|---|---|---|---|---|---|
  | 68 | 281 | 145 | 104 | 99 | 75 | 70 | 62 | 61 | 99 |

  That's a steady 60–100 photos a year.
- **Uploads by month:**

  | Feb 2026 | Mar | Jun | Jul | Aug | Nov |
  |---|---|---|---|---|---|
  | 983 (initial bulk import) | 11 | 17 | 7 | 2 | 44 |

  The 47 photos uploaded in November so far average 1.7 MB.
- **Storage per new photo:**
  - B2: about 2.3–3.9 MB (the original plus its aligned frame).
  - Disk: the same, plus about 0.15 MB of thumbnails.
- **Videos:** 6 exports in the three weeks since the move is about 2 a week. Each is about 128 MB, and the size grows with the library.

## When each limit is reached

All B2 figures start at 4.24 GB stored. Alerts are proposed at 8 GB, 80% of the free tier.

| Scenario | B2 growth | B2 reaches 8 GB | B2 reaches 10 GB |
|---|---|---|---|
| Current pace (about 100 photos a year) | about 0.55 GB/yr | around 2033 | around 2037 |
| Daily selfie at full phone resolution | about 1.4 GB/yr | mid-2029 | early 2031 |
| Import one more ~1,000-photo archive (another person) | +3.9 GB at once | immediately (about 8.1 GB) | about 3.5 years later at current pace |
| Import two more archives | +7.8 GB at once | immediately | immediately (about 12 GB) |

**Deletes don't free B2 space right away.** Restic keeps monthly snapshots for 6 months, so deleted photos stay in B2 for up to half a year. A delete-and-reimport doubles their footprint for that time.

**VM disk:**

- **Without videos:** photo growth of about 0.6 GB a year never threatens the disk. It would take well over 50 years to reach 80%.
- **With videos at about 2 exports a week:** about 13 GB a year, rising as the library grows. 80% full (about 77 GB used) is around 2031, and the disk is full around 2032.
- **Each extra archive** adds about 4.2 GB on disk, with thumbnails.

## Options for B2

| Option | Cost | Tradeoffs | Verdict |
|---|---|---|---|
| **A. Stay on B2 and pay past 10 GB** | $6.95 per TB per month on stored data above 10 GB: 15 GB stored is about $0.42/yr, 20 GB about $0.83/yr, 50 GB about $3.34/yr. Uploads and reads are free API calls, and egress is free up to 3× stored. | Nothing changes in the setup. Needs a payment method on the B2 account. B2 charges without limit unless a cap is set, so set one. | **Recommended** |
| B. Stop backing up `data/aligned` | $0. Saves 0.6 GB now (15%) and about 0.57 MB per new photo. At current pace the 10 GB date moves from about 2037 to about 2040. | A restore must re-align about 1,060 photos, which is slower and depends on the alignment code giving the same results. Face choices are stored in the DB, so they survive. | Fallback only, if staying at $0 matters more than a simple restore |
| C. Tighter retention (e.g. 3 monthly instead of 6) | $0 | Saves almost nothing, because the archive mostly grows and rarely deletes. Fewer restore points. | Not recommended |
| D. Move to Cloudflare R2 | 10 GB free, then $0.015/GB-month (about 2.2× B2). Free egress. | Migration work (`restic copy`) for no saving. Useful only as a *second* off-site copy. | Not recommended as a replacement |
| E. Oracle Object Storage (Always Free, 20 GiB) | $0 up to 20 GiB | Same account and provider as the VM, so one account problem loses both copies. That defeats the point of an off-site backup. | Not recommended as the only backup |
| F. Re-compress originals | $0 | Permanent quality loss on the archive. | Rejected |

## Options for the VM disk

| Option | Cost | Tradeoffs | Verdict |
|---|---|---|---|
| **A. Delete exported videos after N days (e.g. 7)** | $0. Small app change. | Old download links stop working after N days, and videos are regenerated on demand. This removes the only unbounded grower. | **Recommended** |
| **B. Grow the boot volume from 100 GB to 200 GB** | $0 within Always Free (home region only) | Online resize in the console plus `growpart` / `resize2fs`. Uses the whole free block allowance. | **Recommended when the disk passes 70%** or before a big import |
| C. Attach a separate 100 GB block volume for `data/` | $0 within Always Free | Mount, fstab and compose path changes, plus a migration of `data/`. More moving parts than option B for the same space. | Not recommended |
| D. `docker builder prune` | $0 | Reclaims about 6 GB once. BuildKit's own garbage collection already bounds the cache. | Optional one-off, not needed |
| E. Paid Oracle block storage past 200 GB | Not checked: Oracle's pricing page didn't return its rate table | Only relevant decades out at current pace. | Revisit if ever needed |

## Monitoring and alerts

What exists today:

- healthchecks.io emails if a nightly backup fails or doesn't run.
- The app's Archive health panel shows when the last backup ran.
- The runbook recommends a $1 Oracle budget alert.

What to add:

1. **Nightly storage numbers.** `backup.sh` writes these into `data/backup-status.json` after each run:
   - B2 repository size (`restic stats --mode raw-data --json`);
   - backed-up set size;
   - disk used percentage and free bytes;
   - `data/videos` size.
2. **One email alert for both limits.** Add a second healthchecks.io check, `face-lapse-storage` (the free plan allows 20 checks).
   - The backup script pings it nightly while the B2 repository is under 8 GB and the disk is under 80%.
   - It pings `/fail` when either threshold is crossed.
   - It's separate from the backup check, so a storage warning never looks like a failed backup.
3. **Storage in the app.** Archive health shows, for example, "Backups: 4.2 of 10 GB free tier" and "Server disk: 19% used". It turns into a warning at the same thresholds. Glance at it before importing another person's archive.
4. **B2 Caps & Alerts.** In the B2 console, set a daily storage cap with email alerts. Caps are dollar amounts per day; B2 emails at 75% and 100% of the cap. Without caps, B2 charges are unlimited.
5. **Confirm the Oracle budget alert exists.** It catches the boot volume being resized outside the free allowance by mistake.

## Questions for the owner

- **Does the B2 account have a payment method?** Backblaze's docs don't say what happens to a free account at 10 GB. Without a card, backups might start failing at the limit, and the healthchecks alert would catch that.
- **Do you plan to import more people's archives, or take daily selfies?** Either one moves the B2 date by years.
- **How long should exported videos be kept?** 7 days is proposed.

## Step 1: Record storage usage in the nightly backup

- Extend `scripts/backup.sh` and `scripts/backup-status.py` to write `repo_bytes`, `backup_set_bytes`, `disk_used_pct`, `disk_free_bytes` and `videos_bytes` to `data/backup-status.json`.
- `restic stats` only reads the index, which is a free B2 call class.
- Keep writing the status atomically, and never record credentials.

## Step 2: Email alert at 8 GB in B2 or 80% disk

- The owner creates the healthchecks.io check `face-lapse-storage` and adds `STORAGE_HEALTHCHECK_URL` to the server `.env`.
- `backup.sh` pings it, or pings `/fail` when a threshold is crossed. Thresholds are environment variables with defaults of 8 GB and 80%.

## Step 3: Show storage in Archive health

- Read the new fields from `backup-status.json`, and show used versus free-tier space for B2 and the disk percentage.
- Show a warning style at or above the thresholds. Show "unknown" until the first run records the numbers.
- Add an e2e test using a fixture status file.

## Step 4: Delete exported videos after 7 days

- Add a startup and hourly sweep in the backend that removes `data/videos/*.mp4` files older than `VIDEO_RETENTION_DAYS` (default 7), skipping any video a running job still owns.
- Add a backend test.

## Step 5: B2 account settings (owner, in the B2 console)

- Confirm a payment method is on file.
- Set a daily storage cap with email alerts.
- Check that the Oracle $1 budget alert exists.

## When an alert fires

| Alert | Do this |
|---|---|
| B2 at or above 8 GB | If Step 5 is done, nothing urgent: past 10 GB costs cents a month. Check the bill trend once. If staying at $0 matters, apply B2 option B. |
| Disk at or above 80% | Check what grew (`du -sm ~/face-lapse/data/*`, `docker system df`). If it's videos, check the sweep. Otherwise grow the boot volume to 200 GB (disk option B). |
| Before a bulk import | Check Archive health headroom. Each ~1,000-photo archive needs about 3.9 GB in B2 and about 4.2 GB on disk. |

## Verification

- After Step 1, one nightly run fills in the new fields, and they match `restic stats` and `df` run by hand.
- After Step 2, temporarily set the B2 threshold below the current size. One run should send the healthchecks.io email, and resetting it clears the alert.
- After Step 4, an MP4 older than the retention period disappears within an hour, and new exports still download.

## Sources

- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing): $6.95/TB/month, first 10 GB free, free egress up to 3× stored, Class A–C calls free.
- [Backblaze B2 data caps and alerts](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts.md): caps are dollars per day, alerts at 75% and 100%, unlimited charges without caps.
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm): 200 GB combined boot and block volume in the home region, 20 GiB Object Storage.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/): 10 GB-month free, $0.015/GB-month after, no egress charge.
