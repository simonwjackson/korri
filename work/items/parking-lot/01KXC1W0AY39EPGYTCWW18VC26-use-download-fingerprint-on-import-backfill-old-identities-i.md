---
id: 01KXC1W0AY39EPGYTCWW18VC26
slug: use-download-fingerprint-on-import-backfill-old-identities-i
title: Use download fingerprint on import; backfill old identities in background
origin: parked
status: In Progress
priority: medium
labels:
  - acquisition
  - library
  - scout
  - performance
created: 2026-07-12
source: se-work
---

# Use download fingerprint on import; backfill old identities in background

## Why it matters

Acquire-time imports currently skip content identity entirely (identityPolicy "skip") because the configured scan's backfill fingerprints every identity-less claimed release — reading dozens of GB of existing Switch images off the SD card and stalling interactive Get for 30-60 minutes. But the staged artifact's sha256 is already computed during acquireArtifact (digests.sha256), so the newly imported entry can carry its identity for free. Separately, existing identity-less entries (45 on Bandai's card) should gain fingerprints via a non-blocking path (boot scan or background trickle), not during interactive operations. Without identities, hash-based dedupe and rename tracking silently degrade.

## Acceptance Criteria

- [ ] Newly acquired imports write identity (kind: hash, sha256 from the staged artifact digests) onto the merged release without hashing any other file
- [ ] Interactive Get latency stays in single-digit seconds on a card with identity-less multi-GB entries
- [ ] Existing identity-less entries get backfilled by a boot-time or background job, never during acquire
- [ ] Tests cover: import writes the staged digest as identity; acquire path never triggers resolveFreshFileHash on unrelated entries

## Related

- `product/apps/portal/api/acquisition/acquire-placement.ts`
- `product/platform/acquisition/artifact-acquisition.ts`
- `product/platform/library/discovery/release-candidate-scan.ts`

## Notes

The AcquiredArtifact already exposes digests.sha256 and the placement runner knows the merged entry's target (storage + path) — the identity write can piggyback on applyClaimMetadataToImport's existing config patch. Bandai context: no boot scout unit exists on this host, so the background backfill needs a home (boot unit enablement or an idle-time korrid task).
