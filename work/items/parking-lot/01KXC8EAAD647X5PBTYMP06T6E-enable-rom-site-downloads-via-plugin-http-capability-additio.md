---
id: 01KXC8EAAD647X5PBTYMP06T6E
slug: enable-rom-site-downloads-via-plugin-http-capability-additio
title: Enable ROM-site downloads via plugin HTTP capability additions
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - acquisition
  - api
  - bazzar
created: 2026-07-12
source: se-work
---

# Enable ROM-site downloads via plugin HTTP capability additions

## Why it matters

Live HTML inspection proved the three ROM-site plugins' searches are now correct, but their downloads are blocked by concrete plugin-API gaps, not scraping bugs: (1) wowroms serves the file only via a POST form after a JS countdown — the plugin http service has no POST/body; (2) romhustler guest pages are account-gated ("Can Download: No" since the 2021 backend overhaul) — needs a session cookie jar; (3) coolrom exposes the real dl.coolrom.com URL in static HTML (now extracted) but it is a time-scoped signed token behind Cloudflare Rocket Loader, and the files are .7z which our cart discovery does not import (only .zip). retrostic remains the only end-to-end source. Adding these capabilities would unblock real downloads and matches the framework-docs audit.

## Acceptance Criteria

- [ ] PluginHttpRequestOptions supports method + body (POST) so wowroms can submit its download form
- [ ] Per-provider cookie jar persists Set-Cookie across plugin http calls and into the daemon's final byte-fetch (romhustler session, coolrom CF)
- [ ] FinalDownload can carry request headers (Referer/Cookie) the daemon forwards when fetching bytes
- [ ] HTTP status visibility so plugins can distinguish a real page from a 403/404/challenge instead of scraping the error page
- [ ] Cart discovery imports .7z (or placement extracts single-ROM .7z) so coolrom downloads land in the Library
- [ ] At least one of wowroms/coolrom verified downloading end-to-end on Bandai after the additions

## Related

- `product/platform/plugin/services.ts`
- `product/platform/acquisition/artifact-acquisition.ts`
- `product/platform/protocol/acquisition/download-resolution.ts`
- `/home/simonwjackson/code/sandbox/bazzar-plugins/`

## Notes

Also worth adopting the yt-dlp maintenance pattern surfaced by the best-practices research: per-plugin recorded-HTML fixture tests (added a first cut in bazzar-plugins/tests/parsers.test.mjs) plus a provider health/_WORKING surface so broken sources say so instead of returning junk. romhustler is currently disabled on Bandai via plugins.json (@local:romhustler {enabled:false}); its corrected search ships for when account/premium support lands.
