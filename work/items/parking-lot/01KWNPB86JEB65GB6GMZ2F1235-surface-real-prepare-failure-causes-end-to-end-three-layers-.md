---
id: 01KWNPB86JEB65GB6GMZ2F1235
slug: surface-real-prepare-failure-causes-end-to-end-three-layers-
title: Surface real prepare-failure causes end-to-end (three layers swallowed the rpcs3 schema error)
origin: parked
status: To Do
priority: high
labels:
  - diagnosability
  - stream
  - remote-source
  - korrid
  - device-evidence
created: 2026-07-04
source: se-debug
---

# Surface real prepare-failure causes end-to-end (three layers swallowed the rpcs3 schema error)

## Why it matters

Debugging the aka Skate 3 outage required manual RPC reproduction because every layer hid the actual error ("@korri:rpcs3 policy is invalid: Unexpected key command"): (1) bandai's launch handler logs only prepareResult.category, dropping prepareResult.message (launch.rpc-handler.ts:432-439); (2) aka's server prepare handler sanitizes DataError to a generic public message ("Korri stream preparation is unavailable", prepare.rpc-handler.ts publicDataErrorMessage) and logs nothing on failure; (3) remote-stream-client's failedFromUnknown buckets everything unmatched into the catch-all "prepare-failed" category. A config-schema bug looked identical to a network fault. Fix: log prepareResult.message on the caller, log the real error server-side before sanitizing, and keep the sanitized message only for the public response.

## Acceptance Criteria

- [ ] bandai-side 'peer prepare failed' log line includes the peer's failure message, not only the category.
- [ ] aka-side prepare failures log the underlying error (schema/materialization detail) at warn level before returning the sanitized public message.
- [ ] A reproduced materialization failure is diagnosable from journald on either host without manual RPC calls.

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/api/server/prepare.rpc-handler.ts`
- `product/apps/portal/stream/remote-stream-client.ts`
