---
id: 01KX7PA4FAHDBZ9JTY1XQ2TN7S
slug: tolerate-unknown-keys-when-decoding-sessiond-peer-payloads
title: Tolerate unknown keys when decoding sessiond peer payloads
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - protocol
  - reliability
created: 2026-07-11
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Tolerate unknown keys when decoding sessiond peer payloads

## Why it matters

Deploying sessiond with the new launchFreeze capability broke aka's not-yet-restarted game-stream-runner in production: decodeSessiondManagedLaunchStatus uses STRICT_DECODE (onExcessProperty: error), so any additive capability/field kills every one-version-behind client with 'sessiond status payload invalid'. This contradicts the additive-only protocol evolution convention and will recur on the next capability we add during any mixed-version window (Sunshine app scripts, korrid probes, inputd session probes all decode this payload).

## Acceptance Criteria

- [ ] decodeSessiondManagedLaunchStatus and decodeSessiondManagedLaunchEvent ignore unknown object keys (excess-property-tolerant) while still validating known fields
- [ ] A test proves a status payload with a never-seen capability key decodes successfully on an older schema
- [ ] Audit other cross-daemon peer decodes (korri-control, overlay-remote-*) for the same strict-decode-on-peer-payload hazard
