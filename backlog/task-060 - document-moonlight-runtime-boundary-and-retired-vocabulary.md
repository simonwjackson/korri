---
id: task-060
title: Document Moonlight runtime boundary and retired vocabulary
status: In Progress
priority: medium
labels:
  - moonlight
  - docs
  - runtime-control
  - retired-vocabulary
created: 2026-06-08
source: se-plan
context:
  cwd: .
  branch: trunk
  commit: eabfc08
  repo: simonwjackson/korri
  invoked_by: user
---

# Document Moonlight runtime boundary and retired vocabulary

## Why it matters

Chunk D protects the launch-policy migration from leaking into runtime-control protocol semantics and makes the new contract durable for future agents. It can run after the implementation slices to lock in examples, docs, and retired-vocabulary checks.

## Acceptance Criteria

- [ ] `product/vendor/moonlight-embedded-korri/README.md` clearly distinguishes Moonlight launch policy, local-control socket env, runtime command protocol, and experimental runtime-settings env hooks.
- [ ] Active acceptance docs are updated only where typed launch policy changes operator configuration; accepted-vs-applied and capability-gated runtime semantics remain intact.
- [ ] `moonlight-control-protocol` and `moonlight-control-client` tests continue to prove command capabilities come from runtime protocol state, not readable `MoonlightPolicy`.
- [ ] Protocol/client implementation files do not import or depend on `MoonlightPolicy` unless a real contract bug requires a separately justified change.
- [ ] `korri-catalog-display-metadata.example.yaml` and `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml` show sibling `host.moonlight` and `host.gamescope` policy, not nested wrapper confusion.
- [ ] Retired-vocabulary tests reject old or excluded Moonlight policy fields: `KORRI_MOONLIGHT_*`, `moonlight.action`, `moonlight.app`, `moonlight.config`, `moonlight.stream.resolution.preset`, `moonlight.platform.source`, `moonlight.input.requireInputPlumber`, `moonlight.control.commands`, and `moonlight.runtimeSettings.adaptationSpike`.
- [ ] Exact-argv tests are updated to use typed policy inputs rather than mutating process env.

## Related

- `docs/plans/2026-06-08-002-feat-typed-moonlight-policy-api-plan.md`
- `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml`
- `korri-catalog-display-metadata.example.yaml`
- `product/vendor/moonlight-embedded-korri/README.md`
- `product/platform/stream/moonlight-control-protocol.ts`
- `product/platform/stream/moonlight-control-client.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/acceptance/moonlight-live-settings-validation-sobo-2026-05-25.md`

## Notes

Agentic Chunk D from the plan. Covers U6 and U7. This is primarily boundary/docs/tests work: do not modify local-control protocol/client implementations to import policy unless implementation uncovers an actual protocol bug. Command availability is runtime-advertised by Moonlight `protocol.hello`/`state.snapshot`; readable launch policy may enable the socket and authority but must not configure command capabilities.
