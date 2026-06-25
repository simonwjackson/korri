---
id: 01KVXQJ1TPKPMPVSJW30GQ3MSE
slug: fuzzy-similarity-matching-tier-for-library-folding-with-conf
title: Fuzzy/similarity matching tier for library folding with confidence scoring
origin: parked
status: To Do
priority: medium
labels:
  - federation
  - library
  - dedup
  - matching
created: 2026-06-24
source: se-challenge-plan
---

# Fuzzy/similarity matching tier for library folding with confidence scoring

## Why it matters

Exact-identifier folding (hash or native id) cannot match copies that lack a shared identifier — e.g. the same game dumped slightly differently, or named differently across hosts. A second matching tier is needed that uses system + title + available metadata as weighted evidence to produce a confidence score, auto-accepts merges above a high threshold, and surfaces lower-confidence candidates to the user for curation. This is the natural follow-on once exact-identity folding ships, and keeping it separate protects v1 from false-positive merges.

## Acceptance Criteria

- [ ] A scoring function combines system, title, and available metadata into a confidence score for two candidate releases
- [ ] Matches above a defined high-confidence threshold auto-fold without user action
- [ ] Matches in a middle band are surfaced non-intrusively for user accept/reject curation
- [ ] Matches below the band are left as separate items
- [ ] User curation decisions are durable and survive rescans and peer reconnections
- [ ] Exact-identifier folding (hash/native id) remains the first tier and is unaffected

## Related

- `work/items/active/01KVVMYE5SFC4H8X5H0EBY7WG3-federated-single-file-folding/plan.md`
- `docs/research/game-library-entity-resolution-deduplication.md`
