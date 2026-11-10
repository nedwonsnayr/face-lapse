# product-manager — archive experience

# Archive experience — approved direction, 2026-11-09

User approved all eight improvements in the preceding brainstorm ("i love all of the above. 10x-team it"). Preserve the existing personal app, person isolation, styling and hosting cost. Implement as cohesive modules on the deployed pool-starvation fix (PR23 merged, deploy successful).

1. Reliable images: bounded retry and visible retry action; player decodes before swapping, holds last good frame while buffering and limits retained/prefetched images. Initial library failures offer retry. Pause hidden playback.
2. Archive navigation: year/month and inclusive date filters; bounded window of mounted grid/list rows with overscan and full scroll extent. Disable drag while filtered and during virtual scrolling drag lock. Keep the playback sequence independent of library filters.
3. Capture: optional previous-selfie overlay, 0/3/5-second timer, cancel on close/person switch, saved-to-person confirmation. Overlay is a framing guide only, never burned into the photo.
4. Trash: soft deletion, restore and undo single/bulk trash. No automatic expiry. Explicit permanent-delete confirmation, scoped trash viewer. Original/aligned files retained until permanent deletion.
5. Compare: expandable then/now view, two photo selectors ordered chronologically, side-by-side and adjustable wipe, date labels. Person-bound sources only.
6. Exports: date range and all/day/week/month sampling, same preview selection and count, device-local named presets scoped to person. First chronological photo in each calendar bucket; Monday-based weeks. Existing default export unchanged.
7. Health: on-demand person-scoped inventory/file check; pending alignment/face review and trash counts. Last successful backup with current attempt status from atomic sidecar; never infer backup success from a healthy API. Unknown and overdue states explicit.
8. Transfer: select photos, move or independent copy to another person. Validate entire batch/target and duplicate conflicts before mutation. UUID copy filenames, independent aligned files/face choices. Clear result/error messages.

Acceptance: slow/failed images retain usable UI and recover; 1,000+ photos mount a bounded set; date navigation works on phone; timer cancels safely; trash never destroys files until explicit confirmation; batches and transfer remain person-scoped and atomic; export sampling/preview agree; backup status reports only recorded results. Existing regressions plus targeted backend/browser tests and desktop/mobile screenshots.

No new paid services, shared-person accounts, auto-deletion, biometric identity inference or production photo mutations during development. Release via reviewed PR and existing main deployment. Additive migration retains all fields; old application rollback may display trashed rows, so roll forward preferred.

