# Photo date correction — QA

Passed: 50 backend integration/unit tests, 63 Playwright browser tests, production frontend build, and git diff --check. Only disposable test data used. Mobile editor screenshot reviewed at 390x844; controls fit, errors remain retryable, keyboard/native date input and dialog are usable.

New regressions cover metadata-free uploads after a large archive gap; November 9 local / November 10 UTC; DST; actual EXIF priority; complete webcam timestamps; older clients defaulting to UTC; timezone validation before writes; invalid calendar dates; wrong-person and trashed photo rejection; unchanged file bytes/cache identity; changed ETags; manual date, reset, reload, paused caption updates; failed-save retry. Additive migration tested twice against known legacy rows; all original columns unchanged. Existing export tests cover caption cache invalidation and real downloaded MP4 captions. Full browser regression passed in 1.2 minutes.
