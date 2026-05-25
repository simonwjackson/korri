# Adversarial review: default Gamescope foreground launch plan

Depth: Deep. The plan is large, cross-cutting, and touches config resolution, RPC prepare flows, foreground/session lifecycle, local process spawning, Sway repair, and Nix kiosk packaging. Because this is a plan with an origin requirements document, this review focuses on technical assumptions, decision stress, and architectural alternatives only.

## Findings

### P1 — Preset/profile opt-outs are not planned through the primary remote-local launch path

**Evidence:** Origin R5/AE3 require profile/preset opt-out: “Gamescope policy follows the existing broad-to-specific launch cascade…” and “Given a game inherits Gamescope enabled and a selected preset disables it… the preset opt-out wins.” The plan also carries R5/R6/AE3, but U4 keeps the desktop flow as “local input preflight, remote prepare, local foreground launch,” while the current server prepare contract only accepts `id` and `RemoteStreamControlClient.prepareGame` accepts only `gameId`. The plan defers “Broader profile/user UI for selecting presets or launch-time overrides from the desktop launch bridge” to follow-up.

**Failure mode:** A user can have a preset/profile opt-out in config, but the desktop bridge cannot send the selected preset/user/override to the remote host. The host prepares the default game launch, Gamescope remains enabled, and AE3 fails specifically on the path the plan says includes local Moonlight.

**Action:** Add an implementation unit or expand U2/U4 to carry `userId`, `presetId`, and launch-time override through the desktop bridge, remote client, server prepare RPC, and prepare handler. If UI selection is truly out of scope, explicitly limit acceptance to global/launcher/game opt-outs and remove AE3/preset coverage from this plan.

**Confidence:** 75

---

### P1 — The foreground owner cannot restore Korri unless it supervises the launched process after returning from the bridge

**Evidence:** Origin F1/F2 and R7 require restore behavior after the foreground session ends. U4 says to introduce a foreground-owner seam “without blocking the launch bridge until Moonlight exits.” Current `launchMoonlight` returns only `{ status: "started"; command }` or failure; its `CommandRunner` reports startup success/failure, not a process handle or exit promise.

**Failure mode:** If the local bridge returns as soon as Moonlight/Gamescope starts, the foreground owner has no durable child/session handle to know when to restore Korri. The implementation can accidentally either restore immediately after startup, never restore after exit, or rely on a fragile polling heuristic that was never designed into the plan.

**Action:** Make supervision a first-class plan decision: the foreground owner must own a managed child/session handle, a wait monitor, or an explicit compositor/session event subscription that defines “foreground app ended.” Update U3/U4 tests to assert restore happens only after the launched foreground session ends.

**Confidence:** 75

---

### P1 — The non-Gamescope opt-out path depends on an unresolved surface-identification strategy

**Evidence:** R7/AE4 require that disabling Gamescope does not disable foreground ownership. U4 says to “promote the launched surface whether Gamescope is enabled or disabled,” but the exact selector for non-Gamescope launches is deferred: “Exact foreground surface selector for non-Gamescope opt-out launches: Choose the smallest reliable surface-identification mechanism while implementing the foreground owner.”

**Failure mode:** The opt-out path is the compatibility escape hatch for broken apps, but it is also the hardest path to select generically because there is no `gamescope` app id/class to match. If implementation cannot reliably identify the raw launched surface, the narrow opt-out that should save an incompatible game still tiles beside Korri or foregrounds the wrong pre-existing window.

**Action:** Resolve the architecture in the plan instead of deferring it. Pick a generic strategy such as snapshot-before-launch plus “new surface” selection, launcher-provided window criteria, dedicated foreground workspace isolation, or a managed app wrapper that emits surface identity. Add U4 tests for multiple existing windows and raw opt-out launches.

**Confidence:** 75

---

### P1 — Local failure after remote prepare can leave stale launch intents that later start the wrong session

**Evidence:** U4 preserves the ordering “local input preflight, remote prepare, local foreground launch.” The plan also defers “Remote prepare cancellation after local launch failure,” allowing implementation to keep `prepared-no-moonlight` if existing intent expiry seems safe. Current prepare writes a one-shot launch intent before Moonlight is started locally.

**Failure mode:** Default-on Gamescope adds new local failure points after remote prepare: Gamescope missing, unsupported nested Wayland behavior, foreground owner unavailable, or wrapper startup failure. In those cases the remote host may still hold a valid pending launch intent. The next time the Sunshine/Korri stream app starts, it can consume a stale intent and launch a game the user believes failed or canceled.

**Action:** Make stale-intent handling part of the plan, not an implementation-time maybe. Either preflight all local wrapper/foreground prerequisites before remote prepare, add a cancel/quarantine RPC for prepared intents on local failure, or make prepare return a short-lived/session-bound token that the runner refuses once the local launch has failed.

**Confidence:** 75

---

### P2 — The plan assumes one minimal `gamescope -f -b -- child` wrapper works for arbitrary foreground apps, including native Wayland Moonlight

**Evidence:** U2 defines the default wrapper as “fullscreen/borderless Gamescope plus configured extra args only,” U3 applies it to local Moonlight, and `tools/device/game-stream-fullscreen.ts` currently composes only `-f`, `-b`, extra args, `--`, and the child command. The plan also says it must preserve Sobo Moonlight platform/input environment.

**Failure mode:** A minimal wrapper may not preserve the validated native Wayland/SDL Moonlight path. If a child expects a Wayland socket exposed by the nested compositor, or if Gamescope changes backend selection/input/windowing semantics, default-on can break the very local Moonlight path the plan explicitly includes. Opt-out exists, but that means the default path may fail on day one for a primary target.

**Action:** Add an explicit wrapper-compatibility decision and tests for native Wayland/SDL clients. The plan should say whether default Gamescope exposes Wayland to children, whether Moonlight is expected to run as X11/Xwayland under Gamescope, and what device validation proves before default-on ships.

**Confidence:** 75

---

### P2 — The declared verification gate cannot catch Nix/kiosk regressions introduced by U6

**Evidence:** The plan frontmatter sets `verify_command: "just test-unit && just typecheck"`, but U6 modifies `nix/modules/korri-kiosk.nix`, `nix/images/platforms/rocknix-sm8550.nix`, and `nix/images/platforms/x86.nix`, with test expectations around Nix evaluation and package availability.

**Failure mode:** A work loop can complete the plan with TypeScript tests passing while the kiosk image does not evaluate, Gamescope is missing from the kiosk environment, or platform Moonlight env is accidentally dropped. That directly undermines R1/R4 on real devices.

**Action:** Expand the verification gate or per-unit verification to include the repo’s current Nix evaluation/smoke target for kiosk modules. If full image validation is too expensive for the default gate, name the exact required Nix check as a mandatory U6/U7 verification step rather than relying on `just test-unit && just typecheck`.

**Confidence:** 100
