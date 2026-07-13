---
id: 01KXCSYBBB18VAPVMV30M9V665
slug: verify-wowroms-self-managed-download-end-to-end-on-bandai-it
title: Verify wowroms self-managed download end-to-end on Bandai + itchio smoke
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - acquisition
  - bandai
  - verification
created: 2026-07-13
source: se-work
---

# Verify wowroms self-managed download end-to-end on Bandai + itchio smoke

## Why it matters

The unified plugin HTTP API (method/body, binary, status/headers, per-provider cookie jar, forwarded FinalDownload headers) landed on trunk and is proven by unit + integration tests and a full live-curl walkthrough of the real wowroms flow (game page → md5 token → signed link → POST form → 676KB PK zip). What remains is on-device confirmation: deploy trunk to Bandai, install the updated external wowroms .mjs (now registers artifact.acquire), and confirm a SNES Get completes end-to-end (staged→imported→launchable) or fails honestly. Also smoke itchio after its migration off the global-fetch bypass to confirm a real free-game acquire still works through the unified services.http. Blocked in-session by Bandai Wi-Fi instability and because the external bazzar-plugins folder is not committed.

## Acceptance Criteria

- [ ] Trunk deployed to Bandai with the capable services.http (commits 52f9d2b2..230aae1b)
- [ ] Updated wowroms/index.mjs (artifact.acquire handler) installed on Bandai
- [ ] A wowroms SNES Get completes end-to-end (staged, imported, launchable) OR fails with a clean honest message — no junk on the card, no Cause()/Fail() leak
- [ ] itchio real free-game acquire verified working through the unified services.http (no global fetch)

## Related

- `work/items/active/01KXCNWGSK3K34GT536PGPTX7R-finish-unified-plugin-api/plan.md`
- `work/items/parking-lot/01KXC8EAAD647X5PBTYMP06T6E-enable-rom-site-downloads-via-plugin-http-capability-additio.md`
