---
id: 01KVEGET7NC5KTEV2VHTMNVRT9
slug: restore-fallow-duplication-and-tighter-health-gates
title: Restore Fallow duplication and tighter health gates
origin: parked
status: To Do
priority: medium
labels:
  - ci
  - fallow
  - tech-debt
created: 2026-06-18
source: se-work
---

# Restore Fallow duplication and tighter health gates

## Why it matters

The PR needs to keep moving, so the audit configuration now suppresses duplication checks and raises health thresholds for broad pre-existing branch work. Leaving that indefinitely reduces signal from CI and can let repeated code or complex functions creep in unnoticed.

## Acceptance Criteria

- [ ] Re-enable Fallow duplication analysis with an explicit baseline or targeted ignores instead of disabling it globally.
- [ ] Lower health thresholds or replace global raises with narrow thresholdOverrides / inline suppressions tied to named follow-up work.
- [ ] Run `just fallow-audit --base origin/trunk --format json --quiet` and confirm it stays green.

## Related

- `.fallowrc.json`
- `https://github.com/simonwjackson/korri/pull/24`
