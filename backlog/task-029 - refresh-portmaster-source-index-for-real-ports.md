---
id: task-029
title: Refresh PortMaster source index for real ports
status: To Do
priority: medium
labels:
  - acquisition
  - bazzar
  - portmaster
  - follow-up
created: 2026-06-04
source: manual-test
---

# Refresh PortMaster source index for real ports

## Why it matters

Manual Bazzar search for Spelunky returned no results even though PortMaster has a live `detail.html?name=spelunky` page; direct details/resolve failed with `Unknown portmaster candidate: spelunky.zip`, so users cannot acquire known PortMaster ports through Korri.

## Acceptance Criteria

- [ ] `korri bazzar search spelunky --sources portmaster --format json` returns the PortMaster Spelunky candidate.
- [ ] `korri bazzar details https://portmaster.games/detail.html?name=spelunky --format json` resolves the candidate details.
- [ ] `korri bazzar resolve-download portmaster https://portmaster.games/detail.html?name=spelunky --title Spelunky` returns a final or accurately gated artifact outcome instead of `Unknown portmaster candidate`.

## Related

- `product/platform/acquisition/plugins/approved-fixtures.ts`
- `product/platform/acquisition/plugins/registry.ts`
- `product/apps/cli/bazzar/bazzar-command.test.ts`

## Notes

Observed on trunk after task-024: all-source search also trips Level Share Square HTTP 400 for `spelunky`; constrained PortMaster/HomebrewHub/non-LSS searches returned no results. Web search found https://portmaster.games/detail.html?name=spelunky.
