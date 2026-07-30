---
id: 01KYTEC4TMC4ES3QQPQ4ZHVMGX
slug: spike-plugin-containment-execution-and-memory-limits-for-the
title: "Spike plugin containment: execution and memory limits for the TS/JS runtime"
origin: parked
status: To Do
priority: high
labels:
  - korrid
  - plugins
  - security
  - spike
created: 2026-07-30
source: se-work
---

# Spike plugin containment: execution and memory limits for the TS/JS runtime

## Why it matters

korrid can now transpile and evaluate TypeScript plugins at runtime, but the sandbox has no execution limits at all. An infinite loop in a plugin hangs the calling thread, and there is no memory cap — so a single malformed or hostile plugin can take down the brain on any device. The empty sandbox already blocks I/O, but it does nothing about resource exhaustion. This becomes urgent the moment a plugin comes from anywhere other than our own tree, which is exactly what the capability-routes slice enables. Cheap to answer now, expensive to retrofit after plugins are load-bearing.

## Acceptance Criteria

- [ ] Determine whether rquickjs usefully exposes QuickJS interrupt handlers and memory limits
- [ ] A runaway plugin (infinite loop) is terminated cleanly and reported as a tagged failure rather than hanging the caller
- [ ] A memory-hungry plugin hits a cap and fails cleanly
- [ ] Behaviour of a half-evaluated declaration on timeout is known and documented (partial result must never be treated as a valid declaration)
- [ ] Findings and chosen limits recorded in services/korrid/SCRIPTING.md, replacing the current open question

## Related

- `services/korrid/SCRIPTING.md`
- `services/korrid/src/script.rs`

## Notes

Currently recorded only as prose under 'Open questions' in SCRIPTING.md. Blocks any plugin arriving from off-device. Sequencing: should land with or before the capability-routes slice, since that slice is what gives plugins a real consumer.
