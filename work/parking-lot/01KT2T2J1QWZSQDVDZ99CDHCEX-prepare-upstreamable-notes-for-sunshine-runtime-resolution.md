---
id: 01KT2T2J1QWZSQDVDZ99CDHCEX
slug: prepare-upstreamable-notes-for-sunshine-runtime-resolution
title: Prepare upstreamable notes for Sunshine runtime resolution
origin: parked
legacy: task-094
status: To Do
priority: low
labels:
  - streaming
  - sunshine
  - upstream
  - documentation
created: 2026-06-02
source: user
---

# Prepare upstreamable notes for Sunshine runtime resolution

## Why it matters

The working fix changes subtle VAAPI/capture lifecycle behavior. Capturing the root cause and minimal patch will make future maintenance and possible upstream discussion easier.

## Acceptance Criteria

- [ ] Write a concise technical note or issue draft describing the stale-frame failure, reproduction, and final generation-boundary fix.
- [ ] Identify which parts are Korri-specific protocol work versus potentially upstream Sunshine lifecycle fixes.
- [ ] Include crash evidence from VAAPI destructor flush and why runtime-replaced sessions skip destructor drain.
- [ ] Attach physical validation evidence from bandai-visible downshift/upshift runs.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`
- `packages/sunshine-korri/patches/0013-request-async-capture-reinit-after-runtime-resolution.patch`
- `packages/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch`
- `docs/handoffs/live-runtime-resolution-journey.md`

## Notes

Do not create the note until explicitly picked up; user asked only to backlog follow-ups now.
