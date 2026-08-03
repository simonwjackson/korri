---
id: 01KYX3ARCEZXKX63PMABWBPJ5N
slug: decode-the-remaining-native-stream-bridge-results-at-the-por
title: Decode the remaining native stream bridge results at the portal seam
origin: parked
status: To Do
priority: medium
labels:
  - portal
  - bridge
  - contracts
  - reliability
created: 2026-07-31
source: se-code-review
---

# Decode the remaining native stream bridge results at the portal seam

## Why it matters

launchLocal, queryStreamHosts, queryStreamApps, and startStream still cast parsed JavaScriptInterface JSON directly to TypeScript unions. Semantically malformed but valid JSON can leak impossible states into the portal. Final review confirmed this is real but pre-existing on main rather than introduced by the Android session foundation branch, so it should not be folded into that atomic merge.

## Acceptance Criteria

- [ ] LaunchLocalResult, QueryStreamHostsResult, QueryStreamAppsResult, and StartStreamResult are decoded from unknown rather than asserted
- [ ] Wrong-tag and missing-required-field payloads map to conservative tagged failures
- [ ] Bridge seam tests cover valid and semantically malformed payloads

## Related

- `clients/portal/src/bridge/launcher-bridge.ts`
- `clients/portal/src/bridge/launcher-bridge.test.ts`
