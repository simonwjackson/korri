# Adversarial deep doc review — default Gamescope foreground launch plan

Plan: `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`  
Origin: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`

## Findings

### P1 — Remote prepared intents remain launchable after local foreground launch failure

**Evidence:** The plan explicitly defers active cancellation: “active cancellation is deferred; implementation should rely on existing intent expiry and make the partial failure visible.” It also says local launch can fail after remote prepare: “remote prepare succeeds but local launch fails; expiry/partial-failure behavior is reported visibly.” The current intent store uses a default freshness window of `5 * 60 * 1000` in `tools/device/game-stream-launch-intent.ts`.

**Why this may fail:** A remote intent is a one-shot command to launch the game runner. If the local Moonlight/Gamescope foreground launch fails after prepare, the remote host still has a valid pending intent for up to five minutes. A later manual Moonlight connection, retry, or accidental Sunshine app launch can consume the stale intent and start the wrong game/session. “Visible partial failure” does not prevent the stale side effect.

**Suggested fix:** Make stale-intent prevention part of the active plan, not deferred implementation judgment. Add a unit or U5 requirement for one of:
- a session-id-bound cancel/quarantine RPC after local launch failure,
- a prepare/claim handshake that only activates the remote intent after local client preflight succeeds,
- or a much narrower retry-scoped intent lifetime with tests proving stale intents cannot be consumed after local failure.

**Confidence:** 75

---

### P1 — The local Moonlight policy resolver has no concrete source of local config

**Evidence:** The plan decides “local Moonlight policy comes from a local foreground-client policy resolver over the local host’s global policy, the named foreground client/launcher policy, and any local launch override” and U5 says the resolver “does not require a game id or synthetic library game.” But U5’s file list only adds `cascade-resolver.ts`, `resolved-launch-context.ts`, desktop bridge/main, CLI remote launch, and Sway/fullscreen helpers; it does not name the repository/source layer that will load the local host’s global and launcher policy for this non-game resolver.

**Why this may fail:** The existing resolver is game-centered: it requires `gameId`, finds a game, resolves that game’s `system`, then finds a launcher. A policy-only local Moonlight resolver needs a config snapshot and a way to name/load the local foreground client policy. Without an explicit data-source boundary, implementation may either invent a synthetic game, read env vars ad hoc, or accidentally use the remote host’s policy again — each violates a plan decision.

**Suggested fix:** Add an implementation unit or expand U5 to define the local policy source boundary. Name the files that expose/load the local config snapshot for desktop/CLI local foreground clients, and add tests for:
- local global default applied with no game id,
- named Moonlight/foreground-client policy overriding local global,
- local override overriding both,
- no fallback to remote runner policy.

**Confidence:** 75

---

### P1 — Native Wayland pass-through is treated as “minimal,” but the plan does not specify the falsification test or trigger

**Evidence:** The plan says, “Support native Wayland children as minimal pass-through compatibility: When a child launch is configured for Wayland, expose Wayland through Gamescope as part of the wrapper baseline,” and U3/U4 add tests that a “Wayland-configured child receives the minimal Wayland exposure.” Current `composeGamescopeLaunchSpec` only emits `gamescope -f -b ... -- child`, and the policy schema cited by the plan only contains `enabled` and `args`.

**Why this may fail:** The validated Sobo path is Moonlight `v4l2m2m + SDL/Wayland`; default-wrapping it is the riskiest part of the plan. If the wrapper does not reliably expose a nested Wayland socket and propagate the right environment, Moonlight may fail to start or silently fall back to an unintended backend. The plan says this is minimal pass-through but does not state whether it is always enabled, inferred from child env/platform, or user-specified through args. That leaves a load-bearing compatibility decision to implementation.

**Suggested fix:** Make the Wayland compatibility rule explicit in the plan before implementation:
- either “always include the Gamescope Wayland exposure mode in the default minimal wrapper,”
- or “enable it when the resolved launch env/platform indicates a Wayland child,” with a named test fixture.

Also add a Sobo validation criterion that verifies the wrapped Moonlight process still uses the intended `v4l2m2m + SDL/Wayland` path, not merely that a window appears.

**Confidence:** 75

---

### P2 — New-surface selection is load-bearing but underspecified for multi-window and delayed-window apps

**Evidence:** The plan chooses “snapshot-before-launch plus new-surface selection as the generic foreground repair strategy,” with Gamescope selectors as a fast path. U5 says the foreground owner should “Promote the launched surface whether Gamescope is enabled or disabled, using snapshot-before-launch plus new-surface selection.” Current helper selection defaults to matching selector results and then choosing focused or lowest id.

**Why this may fail:** Arbitrary foreground apps often create helper windows, splash windows, delayed main windows, or multiple surfaces. A snapshot diff can pick the wrong new surface, repair a launcher/splash window, and then miss the real game window that appears later. This is especially likely for non-Gamescope opt-out launches — exactly the path where the plan removes the known `gamescope` selector.

**Suggested fix:** Strengthen U3/U5 with an explicit selection contract and tests for multi-window launches:
- launcher/splash appears before main game window,
- two new windows appear and only one should be foregrounded,
- the first new window exits before the main window appears,
- no stable selector is available.

Consider an architectural alternative for raw opt-out launches: require or infer a launcher-provided selector/app-id when disabling Gamescope, rather than relying purely on generic new-surface diffing.

**Confidence:** 75

---

### P2 — The plan assumes the desktop-originated foreground owner can restore Korri without defining process ownership

**Evidence:** The plan says the local foreground owner “is not required to reuse `sessiond`’s current synchronous renderer-stop `/launch` contract directly” and U5 requires the bridge to avoid “blocking the launch bridge until Moonlight exits.” It also requires “restore happens after the managed foreground session ends, not immediately after startup.”

**Why this may fail:** The launch request originates inside the desktop runtime that is also the Korri UI surface. If the foreground owner runs too close to that renderer/process, it may either keep Korri alive and let Sway tile/focus-fight, or stop/replace Korri and kill the process responsible for restoring it. The plan names the behavior but does not force an ownership boundary that survives renderer stop/restart.

**Suggested fix:** Add a plan decision that the foreground owner must live outside the renderer webview and must have an independent lifecycle long enough to supervise the child and restore Korri. Add tests/validation for:
- bridge response returns while supervisor continues,
- Korri surface can be hidden/stopped without killing the supervisor,
- child exit triggers restore even if the renderer was relaunched during the session.

**Confidence:** 75
