---
id: 01KSXN94148T4616TA79KHQD9T
legacy: task-067
title: "feat: Continuous adaptive stream-quality controller"
status: active
created: 2026-07-05
source: parking-lot
---

# feat: Continuous adaptive stream-quality controller

Graduated from parking-lot item `01KSXN94148T` (legacy task-067, originally "adaptive stream quality ladder"). Plan created from an extended in-session product-alignment interview (2026-07-05) that turned the north-star correction — a continuous, math-driven controller rather than a preset ladder — into a concrete product model, CLI, algorithm, reliability behaviors (cold-start, cliff, tunnel), and validation strategy.

Origin context: `item.md` (carried-forward acceptance criteria + the 2026-07-03 continuous-controller correction).

## Progress Log

- 2026-07-06: Landed adaptive platform foundation on trunk through `bc63d72d`: boundary parsing, controller, runner, telemetry/scenarios, outage/handoff helpers, netem drive script, and validation runbook. Targeted platform/CLI tests passed (`140 pass / 0 fail`); repo-wide typecheck still blocked by unrelated pre-existing errors.
- 2026-07-06: Added product/runtime wiring in `feat/adaptive-stream-product-wiring`: runtime adaptive control snapshots/set/dry-run, stream-control RPC state/action support, `korri stream --key=value`, `--dry-run`, `--watch`, `--json`, and launch-time `korri launch --key=value` boundary seeding.
- 2026-07-06: Wired outage supervision into stream runtime sessions and Moonlight startup env. Current architecture lacks a native re-establish/hold-last-frame hook; the runtime now fails loudly (`reconnect-failed`) when that hook is absent instead of silently pretending recovery.
- 2026-07-06 verification: `bun test product/platform/stream product/apps/portal/api/stream-control product/surfaces/terminal/korri-cli/stream-quality.test.ts product/surfaces/terminal/korri-cli/launch-command.test.ts product/surfaces/terminal/korri-cli/korri-cli.test.ts product/surfaces/terminal/korri-cli/moonlight-launcher.test.ts` → `216 pass / 0 fail`.
