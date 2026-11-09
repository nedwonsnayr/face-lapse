# ADR-006: Render paper-framed video captions
Status: Accepted
Date: 2026-11-09
Feature: styled-video-export

## Context
Preview captions are editorial and outside the photo; exported MP4 currently paints a black corner overlay and gates age on date.

## Decision
Compose every export frame in Pillow on a stable 1200x1800 paper artboard with dark mat and independent date/age captions. Bundle licensed static font instances matching the app. Propagate explicit independent flags to background generation. Feed the normalized frame sequence to FFmpeg at a rational frame rate and use unique export filenames. No schema change; existing download route remains.

## Alternatives
Headless-browser capture of preview: exact CSS but adds runtime/browser/per-frame overhead. Existing corner-overlay restyle: fewer changes but cannot reproduce outside-photo captions. Pillow composition matches the supplied visual with existing infrastructure and deterministic media tests.

## Consequences
All exports preprocess frames, including no-caption mode; bounded to one frame in memory plus temporary disk storage. Output is now 1200x1800, while aligned originals stay 1200x1600. Two small OFL font assets are bundled with licenses. Explicit show_age defaults false for API callers; UI always sends both flags. Failed rendering aborts rather than exporting mixed styles. Existing background job/polling flow stays.
