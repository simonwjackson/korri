---
title: "feat: Add launch.hooks before/after command primitives to the readable config"
type: feat
status: completed
date: 2026-07-12
verify_command: "just typecheck && just test-unit"
---

# feat: Add launch.hooks before/after command primitives to the readable config

## Summary

Add a `hooks` field to Korri's readable config cascade: user-authored `before`/`after` shell-command lists that run around game sessions with try/finally semantics. Hooks fold across the existing cascade like `patches`/`argsAppend`, resolve into a list that travels on the sessiond managed-launch request behind a new `capabilities.launchHooks` flag, and execute inside sessiond's existing prepare/teardown seams. Hooks run raw user-authored commands as the session user — no new helper binaries.

---

## Problem Frame

Per-game device tuning today is manual and volatile. The Bandai/Wonder recipe — CPU clocks capped to 672/1171/1248 MHz, GPU pinned to 220 MHz, display forced to 60 Hz, plus a game mod — produced ~3x battery life (8 W → 2.7 W) and ~35 °C cooler operation at a locked 30 FPS, but every piece was applied by hand over SSH and reverts on reboot. There is no declarative way to say "run these commands before this game starts, and undo them after it exits — even if it crashes." (See origin: `work/items/active/01KXA6XD911EDDGXEXY3C87D0C-launch-hooks-primitives/item.md`.)

---

## Requirements

- R1. `launch`-scoped `hooks` with `before`/`after` lists accepted across the readable config cascade — at minimum host, launcher/app, library-entry, and release layers.
- R2. `before` hooks run outermost-first (host → … → release); `after` hooks run in reverse order and **always run** — on normal exit, crash, kill, user stop, and before-hook abort.
- R3. `on-failure: abort | warn` supported on before-hooks (default `abort`); after-hooks never block teardown and do not accept `on-failure`.
- R4. Hook processes receive `KORRI_GAME_ID`, `KORRI_LAUNCH_ID`, and `KORRI_HOOK_PHASE` (`before` | `after`) in their environment.
- R5. Reusable named hook profiles are definable once and referenced via `hooks.use` from any layer.
- R6. Hooks execute raw user-authored commands as the session user, with multiline commands supported via standard YAML block scalars. No new helper binaries (user decision 2026-07-12).

---

## Scope Boundaries

- No helper binaries (`korri-perf`, `korri-fan`) — explicitly dropped. Users author raw commands (`sudo -n` where device sudoers allow, `swaymsg`, sysfs writes).
- No sandboxing or privilege framework beyond "runs as the session user."
- No portal/UI surface for authoring or editing hooks — YAML only.
- No argv-array `command:` form in v1 — `run:` (shell string) covers all cases; the array form is additive later if wanted.
- No per-hook RPC status surface in v1 — observability is logs, one new failure kind, and additive launch events.

### Deferred to Follow-Up Work

- Generic fan-curve NixOS module: separate backlog item `01KX9PC5N6A7XXY1GHFY5PGC6S`.
- Plugin-contributed hooks (plugins injecting hook entries): plugins already have their own lifecycle seam (`KorriSessionLifecycleHook`, pre-spawn gates); bridging authored hooks and plugin hooks is future work.
- Device-image sudoers/policy presets that make common privileged hook commands (clocks, fan) work out of the box: NixOS-side follow-up once the primitive exists.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/inheritable-fields.ts` — single source of truth for cascade-carried fields (`launch`, `env`, `argsAppend`, `patches`, …). `patches`/`argsAppend` are the exact precedent: list fields that concatenate in inheritance order.
- `product/platform/library/config/records/` — record schemas (`host.ts`, `global.ts`, `user.ts`, `app.ts`, `launcher.ts`, `runtime.ts`, `preset.ts`, `profile.ts`, `library-item.ts`) inline `InheritableLayer.fields.*`; strict decode (`onExcessProperty: "error"`).
- `product/platform/library/config/cascade-resolver.ts` — `ReadableLayerView`, `mergeReadableLayers`, per-layer `readableViewOfXxx` extractors, `inherit: false` truncation.
- `product/platform/library/config/resolved-launch-context.ts` — `ReadableResolvedLaunchContext` output shape.
- `product/platform/library/sessiond-managed-launch-protocol.ts` — `SessiondManagedLaunchCapabilities` (`launchFreeze` is the capability-flag precedent), `SessiondManagedLaunchStartRequest`, strict decode.
- `product/platform/library/sessiond-managed-launch-client.ts` and `product/platform/library/session-launcher.ts` — korrid-side dispatch of managed launches.
- `product/services/device/sessiond.ts` — managed-launch lifecycle: `role.beforeChildLaunch()` → pre-spawn gates → spawn → `child-running` → wait → cleanup (always runs) → restore.
- `product/services/device/sessiond-pre-spawn.ts` — `KorriSessiondPreSpawnGate` + `KorriSessiondPreSpawnFailure`: abortable pre-spawn work with structured failure kinds; the before-hook seam pattern.
- `product/platform/plugin/session-lifecycle.ts` + `product/plugins/gamescope/src/session/lifecycle-hook.ts` — `cleanup` always-runs pattern; the after-hook seam pattern.
- Fixtures/tests: `product/platform/library/config/fixtures/*.korri.yaml`, `product/platform/library/config/records/readable-schema.test.ts`, `product/platform/library/config/readable-cascade-resolver.test.ts`, `product/platform/library/config/authoring/examples.test.ts` (canonical example-YAML gate).

### Institutional Learnings

- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` — hooks must be an explicit cascade-folded field; the executor runs strictly from resolved policy, never sniffing.
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` — before-hooks belong to the `prepare` stage, after-hooks to `teardown` (not `restore`); advertise new daemon behavior via capability flags.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond is the single lifecycle authority; hooks execute inside its pipeline, never as a parallel supervisor.
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md` — hooks stay a generic platform concept; platform code never branches on plugin identity.
- `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md` — named profiles as an object-keyed map: the key is the id; payload-only bodies.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` — never infer hook-process state from side-channel liveness; exit events only.

---

## Key Technical Decisions

- **`hooks` is an `InheritableLayer` field, uniform across all record layers**: follows the `patches`/`argsAppend` pattern exactly. This satisfies R1's minimum layers (host, launcher, library-entry, release) and gives user/runtime/profile layers for free with one mechanism instead of four special cases.
- **Merge = fold semantics of nested try/finally**: `before` lists concatenate in inheritance order (outermost first); `after` lists concatenate in inheritance order and execute reversed (most-specific first, host last). `inherit: false` truncates hooks uniformly with every other inheritable field — documented, not special-cased.
- **Hook step schema**: `run` (required shell string; YAML `|` block scalars give multiline for free), `name` (optional; unnamed hooks get synthetic labels `before[N]`/`after[N]` in logs and events), `timeout` (optional, default 30s), `on-failure: abort | warn` on before-hooks only — enforced at decode time via distinct before/after step schemas so `on-failure` on an after-hook is a parse error, not a silent surprise. After-hook failures never fail the launch or prevent restore; a running after-hook may delay teardown only up to its timeout.
- **Timeout counts as hook failure and honors `on-failure`**: one failure model. A user who opted a hook into `warn` asked for "never block my launch on this hook," which includes hangs. Timed-out hooks are killed (SIGTERM, short grace, SIGKILL).
- **Named profiles live in a new top-level `hooks:` section** of the readable YAML (sibling to `library`/`launchers`), an object-keyed map where the key is the profile id and the body is `{ before?, after? }` (payload-only, per the ProseQL learning). A layer's `use: [ids]` is a sibling key of its inline lists; referenced profiles' lists expand **before** the layer's own inline entries, in reference order — one deterministic rule, no positional interleaving in v1. Unknown profile ids are resolve-time errors naming the layer and id. Profile bodies may not contain `use` (schema-rejected), so reference cycles are impossible by construction.
- **Executable hooks honor the config-graph trust boundary**: removable/untrusted config roots may contribute `library` entries today, and hooks are arbitrary shell. Hooks are therefore only honored from trusted (execution-privileged) config roots — the same class that owns `host`/`launchers`/`runtimes`; hook fields arriving from untrusted roots are stripped with a warning at snapshot load, and config-graph tests prove a removable card cannot introduce executable commands.
- **Resolved hooks travel as an optional top-level `hooks` field on `SessiondManagedLaunchStartRequest`** (sibling to `launchCompanions`/`launchMetadata`) — hooks are launch-context policy, not part of `LaunchSpec`. Schema ships to sessiond first; korrid only includes the field when `capabilities.launchHooks === true` (mirrors `launchFreeze`), so old strict-decoding daemons never see the unknown key.
- **Missing capability = warn + launch**: hooks are skipped with a warning log and a skip marker in the launch acceptance, matching existing capability degradation precedents. Blocking would brick configs on older images mid-rollout.
- **Execution seams inside sessiond**: before-hooks run after `role.beforeChildLaunch()` and after pre-spawn gates, immediately before spawn (stable environment for `swaymsg`/seat-dependent commands); a before-hook `abort` failure maps to the existing structured pre-spawn-failure path. After-hooks run in the teardown section that already always-runs (mirroring `cleanupLifecycleHooks`), **including when a before-hook aborted the launch** — partial state from earlier before-hooks (e.g., clocks already capped) must be undone.
- **Terminate during hooks**: the hook runner owns an abort controller wired into `terminateManagedLaunchById`; graceful stop = SIGTERM the running hook's process group, short grace, SIGKILL; force stop = immediate SIGKILL. Remaining before-hooks are skipped; after-hooks still run.
- **Hook process environment**: sessiond process env, overlaid with the resolved cascade `env` map, with `KORRI_GAME_ID` / `KORRI_LAUNCH_ID` / `KORRI_HOOK_PHASE` injected last. Phase values are exactly `before` and `after` — a stable external API for user shell scripts.
- **Output and observability**: hook stdout/stderr captured to the structured log with a bounded stderr tail retained for failure reporting; one new managed-launch failure kind for hook failures plus an additive `hook-failed` event carrying `{ name, phase }`. No RPC status surface in v1 (avoids the Effect v4 `Schema.Class` RPC pitfall entirely).

---

## Open Questions

### Resolved During Planning

- Where do resolved hooks ride korrid → sessiond? — Optional top-level field on the start request, capability-gated (see decisions).
- Do after-hooks run when a before-hook aborts? — Yes, always; required to undo partial device state.
- Does timeout override `on-failure`? — No; timeout is a failure like any other and honors the hook's policy.
- Where do named profiles live and how does `use` merge? — Top-level `hooks:` map; in-place expansion at the `use` declaration site.
- What does a hook subprocess inherit? — sessiond env + cascade `env` + KORRI_* vars last.
- Is `name` required? — Optional, with synthetic index labels for logs/events.

### Deferred to Implementation

- Exact tag names and any extra fields on the new failure kind and `hook-failed` event: settled against the live event union in `sessiond-managed-launch-protocol.ts` during U4. The event must at least carry `{ name, phase }`.
- Whether the hook runner reuses the existing shell-launcher helper or a leaner `Bun.spawn` wrapper: decided when reading the spawn utilities in U5.
- Precise grace period before SIGKILL on timeout/terminate: tuned during U5 against existing sessiond terminate timings.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Authoring shape (v1):

```yaml
hooks:                          # top-level: named profiles (key = profile id)
  battery-saver-30fps:
    before:
      - name: cap-clocks
        run: |
          echo 1171200 | sudo -n tee /sys/devices/system/cpu/cpufreq/policy3/scaling_max_freq
        on-failure: warn
    after:
      - name: restore-clocks
        run: echo 2803200 | sudo -n tee /sys/devices/system/cpu/cpufreq/policy3/scaling_max_freq

host:
  hooks:
    before: [{ name: display-60hz, run: "swaymsg output DSI-2 mode 1080x1920@60Hz" }]
    after:  [{ name: display-120hz, run: "swaymsg output DSI-2 mode 1080x1920@120Hz" }]

library:
  super-mario-bros-wonder-…:
    releases:
      - id: switch
        hooks:
          use: [battery-saver-30fps]     # profile steps run before this layer's inline steps
```

Flow:

```text
YAML (any layer) ──decode──▶ InheritableLayer.hooks
        │ use-expansion (top-level hooks map, unknown-id checked, trusted roots only)
        ▼
cascade fold: before ⊕ outermost-first / after ⊕ then reversed
        ▼
ReadableResolvedLaunchContext.hooks ──▶ SessiondManagedLaunchStartRequest.hooks
        │                                  (only if capabilities.launchHooks)
        ▼
sessiond:  gates ▶ [before-hooks] ▶ spawn ▶ … child exits/crashes/stopped …
                        │ abort ────────────────┐
                        ▼                        ▼
                  (skip spawn)          [after-hooks — always] ▶ restore
```

---

## Implementation Units

### U1. Hook vocabulary in the readable config schema

**Goal:** `hooks` decodes at every cascade layer with strict validation.

**Requirements:** R1, R3 (schema half), R5 (reference syntax), R6 (multiline via `run` string)

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Modify: `product/platform/library/config/records/host.ts`, `global.ts`, `user.ts`, `app.ts`, `launcher.ts`, `runtime.ts`, `preset.ts`, `profile.ts`, `library-item.ts` (item, contained playable, release payloads)
- Test: `product/platform/library/config/records/readable-schema.test.ts`

**Approach:**
- Define before-step and after-step schemas separately so `on-failure` is only legal on before-steps; both carry `run` (required), `name?`, `timeout?`.
- Layer payload: `{ before?, after?, use? }` added as `InheritableLayer.fields.hooks`, inlined into each record exactly like `patches`.
- Document the merge rule in the `inheritable-fields.ts` docblock alongside the existing field rules.

**Patterns to follow:** `patches` / `argsAppend` declaration + inlining; strict-decode test shape in `readable-schema.test.ts`.

**Test scenarios:**
- Happy path: host payload with `hooks.before[{name,run}]` and `hooks.after[{run}]` decodes on every record type that inlines the field.
- Happy path: multiline `run` (block scalar) round-trips intact.
- Edge case: empty `hooks: {}` and lists of zero entries decode.
- Error path: unknown key inside a hook step fails decode with the offending path.
- Error path: `on-failure` on an **after** step fails decode.
- Error path: `on-failure: retry` (invalid literal) fails decode.
- Error path: step missing `run` fails decode.

**Verification:** All record schemas accept/reject the shapes above; no other suites regress.

---

### U2. Named hook profiles and `use` expansion

**Goal:** Top-level `hooks:` section defines reusable profiles; `use:` references expand in place with cycle/unknown detection.

**Requirements:** R5

**Dependencies:** U1

**Files:**
- Create: `product/platform/library/config/records/hook-profile.ts`
- Create: `product/platform/library/config/hook-profile-expansion.ts` (+ colocated test)
- Modify: `product/platform/library/proseql/library-db-core.ts` (`collectionsSchema`, strict map payload schemas), `product/platform/library/proseql/library-repository.ts` (`loadReadableSnapshot`), `product/platform/library/proseql/config-graph-db.ts` (read-only wrapping + trust-boundary filtering)
- Test: `product/platform/library/config/hook-profile-expansion.test.ts`, config-graph trust tests alongside the existing graph tests

**Approach:**
- Object-keyed map, key = profile id, payload-only body `{ before?, after? }`. Profiles do not carry `use` (schema-rejected in v1) — the reference graph is one level deep, so cycles are impossible and no cycle detection is needed; only unknown-id validation.
- Wire `hooks` as a first-class top-level collection: `collectionsSchema`, strict payload validation, `KorriLibraryDb`, `ReadableConfigSnapshot`, and `loadReadableSnapshot` all learn the section (mirrors how `launchers`/`profiles` are wired).
- Trust boundary: hooks (profiles and per-layer hook fields) are only honored from execution-privileged config roots; untrusted/removable roots contributing hook content get it stripped with a warning at snapshot load.
- Expansion is a pre-pass on each layer's `hooks` value before the cascade fold: referenced profiles' lists expand **before** the layer's inline entries, in reference order.
- Unknown profile name → structured error naming the layer and the missing id.

**Patterns to follow:** ProseQL key-derived-id learning; existing top-level section wiring for `launchers`.

**Test scenarios:**
- Happy path: layer with only `use` gets the profile's before/after lists.
- Happy path: layer with inline entries + `use` → profile steps precede inline steps in both before and after lists.
- Happy path: two profiles referenced in order concatenate in reference order.
- Edge case: profile with only `before` (no `after`) expands cleanly.
- Error path: unknown profile id fails with the id and layer in the message.
- Error path (schema): profile body with `use` inside it is rejected in v1.
- Integration (trust boundary): a removable/untrusted root contributing a top-level `hooks` profile or per-entry hook fields has them stripped with a warning; the trusted root's hooks still resolve.

**Verification:** Expansion output feeds the fold as plain before/after lists; error messages are actionable.

---

### U3. Cascade fold and resolved launch context

**Goal:** Hooks fold across layers with the try/finally ordering and land on `ReadableResolvedLaunchContext`.

**Requirements:** R1, R2 (ordering half)

**Dependencies:** U1, U2

**Files:**
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Test: `product/platform/library/config/readable-cascade-resolver.test.ts`

**Approach:**
- Add `hooks` to `ReadableLayerView` and each `readableViewOfXxx` extractor; fold helper concatenates `before` in inheritance order and `after` in inheritance order (execution-time reversal happens in sessiond, keeping the resolved artifact declarative: `after` stored outermost-first, executed reversed — pick one representation and document it on the resolved schema).
- `inherit: false` truncates hooks with the same uniform semantics as other fields.
- Resolved shape carries fully-expanded steps only (no `use` remnants).

**Patterns to follow:** `foldXxx` helpers and threading for `patches`.

**Test scenarios:**
- Happy path: host + app + release before-hooks resolve in host→app→release order; after-hooks resolve with documented ordering such that execution runs release→app→host.
- Happy path: layers without hooks contribute nothing (no empty-list noise).
- Edge case: hooks only at host; hooks only at release.
- Edge case: `inherit: false` at the release layer drops host/app hook contributions.
- Integration: full YAML fixture through resolve produces expanded, ordered hooks on the resolved context.

**Verification:** Resolved context exposes deterministic, documented ordering; existing cascade tests unaffected.

---

### U4. Managed-launch protocol and korrid-side gating

**Goal:** Resolved hooks travel to sessiond safely across mixed versions.

**Requirements:** R2 (transport), R4 (contract fields), plus rollout safety

**Dependencies:** U3

**Files:**
- Modify: `product/platform/library/sessiond-managed-launch-protocol.ts`
- Modify: `product/platform/library/sessiond-managed-launch-client.ts`
- Modify: `product/platform/library/session-launcher.ts` (`LaunchExtras` + attach resolved hooks to the start request)
- Modify: the resolved-launch pipeline that feeds it: `product/platform/library/library-source.ts` / `product/platform/library/library-services.ts` (`ResolvedLaunch` output carries hooks), `product/platform/control/korri-control-live.ts` (`launchExtrasForResolvedLaunch`)
- Test: `product/platform/library/sessiond-managed-launch-protocol.test.ts`, `product/platform/library/sessiond-managed-launch-client.test.ts`

**Approach:**
- `ResolvedLaunchHooks` schema (before/after step lists, names, timeouts, on-failure) exported from the protocol module; optional top-level `hooks` on `SessiondManagedLaunchStartRequest`.
- `launchHooks: Schema.optional(Schema.Boolean)` on `SessiondManagedLaunchCapabilities`, following `launchFreeze` verbatim.
- Client omits `hooks` entirely unless the daemon reports the capability; when hooks exist but capability is absent, log a warning and surface a skipped marker on the accepted-launch result.
- Add the hook failure kind and additive `hook-failed` event type to the protocol unions.

**Patterns to follow:** `launchFreeze` capability plumbing end to end; protocol-evolution rules from the sessiond operator-model learning (optional fields, additive events, strict consumers).

**Test scenarios:**
- Happy path: start request with hooks encodes/decodes round-trip.
- Happy path: request without hooks is byte-identical to today's shape (no accidental required field).
- Edge case: capability absent → client sends no `hooks` key (old daemon strict-decode stays green) and reports the skip.
- Edge case: capability true, resolved hooks empty → field omitted.
- Error path: decoding a `hook-failed` event yields `{name, phase}`.

**Verification:** A simulated old-daemon decode of a new client request without capability never sees unknown keys; protocol tests cover both directions.

---

### U5. Sessiond hook execution

**Goal:** Before/after hooks actually run with abort, timeout, env, and always-runs semantics.

**Requirements:** R2, R3, R4, R6

**Dependencies:** U4

**Files:**
- Create: `product/services/device/sessiond-launch-hooks.ts` (hook runner: sequencing, timeout, abort controller, env assembly, output capture)
- Modify: `product/services/device/sessiond.ts` (invoke runner at the two seams; advertise `launchHooks` capability; wire terminate path)
- Test: `product/services/device/sessiond-launch-hooks.test.ts`, extend `product/services/device/sessiond.test.ts`

**Approach:**
- Before-hooks run after pre-spawn gates, immediately before spawn; `abort` failures map onto the structured pre-spawn-failure path so existing failure reporting applies; `warn` failures log with the hook label and continue.
- After-hooks run in the teardown section that already executes on every outcome (mirroring `cleanupLifecycleHooks`): each step wrapped so failures log-and-continue, never throw, never gate restore. After-hooks execute in reversed resolved order. They run even when before-hooks aborted or the spawn itself failed.
- Runner executes `run` strings via the shell, per-step timeout (default 30s) with SIGTERM→grace→SIGKILL on its process group; a launch-scoped abort controller ties into `terminateManagedLaunchById` alongside the existing pre-spawn abort.
- Env per decision: process env + cascade env + `KORRI_GAME_ID`/`KORRI_LAUNCH_ID`/`KORRI_HOOK_PHASE`.
- Wait on process exit events only — never infer completion from stream close (SSE learning).

**Execution note:** Test-first on the runner module — the ordering/abort/timeout matrix is the risk center of this feature.

**Patterns to follow:** `KorriSessiondPreSpawnGate` / `KorriSessiondPreSpawnFailure` for the before seam; `cleanupLifecycleHooks` always-runs shape for the after seam; existing shell-launcher spawn/terminate utilities.

**Test scenarios:**
- Happy path: before-hooks run in resolved order, then spawn; after-hooks run reversed after child exit; env vars present with phase values `before`/`after`.
- Happy path: multiline `run` executes as a single script.
- Error path: before-hook exits non-zero with default policy → launch aborts, remaining before-hooks skipped, after-hooks still run, failure kind identifies the hook by name/synthetic label.
- Error path: before-hook `on-failure: warn` exits non-zero → launch proceeds; warning logged.
- Error path: hook exceeds timeout → killed; treated per its `on-failure`; after-hook timeout never blocks teardown.
- Error path: after-hook fails → remaining after-hooks still run; restore proceeds; no launch failure.
- Integration: child crash (non-zero exit/signal) → after-hooks run.
- Integration: user stop during a running before-hook → hook process group terminated, spawn skipped, after-hooks run.
- Integration: launch without hooks behaves byte-for-byte as today (no runner invocation).
- Edge case: empty before with non-empty after (and vice versa).

**Verification:** The full matrix above green in unit tests; `sessiond.test.ts` lifecycle suites unaffected; capability advertised in status.

---

### U6. Authoring fixtures and example gate

**Goal:** The authored shape is documented, decodes, and is protected by the examples gate.

**Requirements:** R1, R5, R6 (authoring surface)

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `product/platform/library/config/fixtures/steam-full.korri.yaml` (or a new dedicated `hooks.korri.yaml` fixture — implementer's choice per fixture conventions)
- Test: `product/platform/library/config/authoring/examples.test.ts`

**Approach:**
- Fixture exercises: top-level `hooks:` profile, host-level inline hooks, release-level `use`, multiline `run`, `on-failure: warn`.
- Examples test asserts the fixture round-trips through the repository loader and the resolved context carries the expected ordered hooks.

**Patterns to follow:** Existing fixture style and `examples.test.ts` round-trip assertions.

**Test scenarios:**
- Happy path: fixture decodes and resolves end-to-end with expected hook ordering.
- Error path: retired-vocabulary guard does not flag `hooks` (regression guard on the forbidden list).

**Verification:** `examples.test.ts` green; fixture serves as the canonical authoring reference.

---

## System-Wide Impact

- **Interaction graph:** korrid cascade resolution → managed-launch client → sessiond lifecycle. Both direct-owner launches and stream-initiated launches that go through the managed-launch path pick hooks up for free; anything spawning outside sessiond's managed pipeline (by design, per the single-authority learning) never runs hooks.
- **Error propagation:** before-hook aborts reuse the structured pre-spawn failure path (existing observers keep working); a new failure kind + `hook-failed` event are additive; after-hook failures are logs only, never launch failures.
- **State lifecycle risks:** the central invariant is *after-hooks always run* — including before-hook abort, spawn failure, crash, and user stop — because hooks mutate device state (clocks, display). U5's test matrix is built around this invariant.
- **API surface parity:** new YAML vocabulary is uniform across all cascade layers (no layer-specific dialects); protocol changes are optional-field + additive-event only, gated by `capabilities.launchHooks`; `KORRI_HOOK_PHASE` values are a frozen external contract.
- **Integration coverage:** fixture round-trip (U6) plus the sessiond lifecycle matrix (U5) cover the cross-layer seams; protocol mixed-version tests (U4) cover rollout.
- **Unchanged invariants:** `LaunchSpec` shape, plugin lifecycle hooks, pre-spawn gates, and launch-companion (`launch.with`) semantics are untouched; launches with no hooks configured are behaviorally identical to today.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Old sessiond strict-decodes a request carrying `hooks` and rejects the launch | Field only sent when `capabilities.launchHooks === true`; schema lands daemon-side in the same unit as the client gating (U4); mixed-version decode test |
| Device left in tuned state (capped clocks) after crash/stop | After-hooks always-run invariant enforced at the teardown seam that already survives crashes; explicit tests for abort/crash/stop paths |
| Hook hangs stall launches indefinitely | Default 30s per-step timeout, SIGTERM→SIGKILL, and abort controller wired into terminate |
| Arbitrary user commands fail confusingly (permissions, missing env) | Bounded stderr tail in failure reporting, named/synthetic hook labels in logs and events, documented env contract |
| `use` reference errors surface late or cryptically | Expansion is a decode/resolve-time pre-pass with structured unknown-id errors; nesting disallowed in v1 so cycles are impossible |
| Removable-media config injects executable hooks | Trust-boundary decision: hooks honored only from execution-privileged config roots; untrusted contributions stripped with a warning; config-graph tests prove it (U2) |
| Scope creep toward a privilege/helper framework | Explicitly out of scope; hooks are dumb strings run as the session user |

---

## Sources & References

- **Origin item:** `work/items/active/01KXA6XD911EDDGXEXY3C87D0C-launch-hooks-primitives/item.md`
- Related backlog: `01KX9PC5N6A7XXY1GHFY5PGC6S` (fan-curve NixOS module — separate)
- Motivating session evidence: Bandai/Wonder tuning (8 W → 2.7 W, ~90 °C → ~54 °C at locked 30 FPS)
- Key code: `product/platform/library/config/inheritable-fields.ts`, `product/platform/library/config/cascade-resolver.ts`, `product/platform/library/sessiond-managed-launch-protocol.ts`, `product/services/device/sessiond.ts`
- Learnings: see Context & Research above
