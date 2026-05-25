# Feasibility review: default Gamescope foreground launch plan

Document type reviewed: plan

## Findings

### P1 — Local Moonlight has no source for the resolved Gamescope policy

**Confidence: 100**

The plan requires local Moonlight to honor the same default/opt-out cascade as other foreground launches, but the current desktop stream path has no data path that can carry that policy to the local launcher. `korri/deploy/desktop/launch-bridge.ts` calls `prepareGame(controlUrl, id)` and then calls `launchMoonlight({ host })`; the launch function receives only a host. The remote prepare contracts also do not return policy: `korri/products/app/api/server/prepare.rpc.ts` returns only `status`, `gameId`, and `sessionId`, while legacy `korri/products/app/api/stream/prepare.rpc.ts` returns only `status`, `gameId`, and `intentPath`.

This means per-game/preset opt-out can be applied to the remote runner intent, but local Moonlight will not know whether the same launch opted out. The implementer would have to choose an architecture the plan should choose: extend prepare responses with client-side launch policy, re-resolve policy locally, or define local Moonlight as host-global-only.

**Action:** Add an implementation unit that defines the policy source for local Moonlight and updates the RPC/client contracts if remote prepare is the source. Include `korri/products/app/api/server/prepare.rpc.ts`, `korri/products/app/api/stream/prepare.rpc.ts`, `korri/products/app/stream/remote-stream-client.ts`, and launch-bridge tests in that unit.

---

### P1 — The local foreground owner cannot restore Korri with the current Moonlight process contract

**Confidence: 100**

U4 says local Moonlight should become a foreground session that promotes the surface and restores Korri after exit, without blocking the launch bridge until Moonlight exits. The current launcher contract cannot support that lifecycle: `korri/products/app/stream/moonlight-launcher.ts` returns only `{ status: "started"; command }` or failure, and its `spawnRunner` calls `child.unref?.()` before returning. No PID, child handle, or exit promise survives for a foreground owner to monitor.

Existing `tools/device/sessiond.ts` is also not a direct fit: `/launch` runs a `LaunchSpec`, waits for `launcher.run(spec)` to finish, and only then restores the renderer. That works for blocking shell-launched games, not for the current detached Moonlight launcher.

**Action:** Add a unit before U4 to introduce a managed foreground-app process contract for local launches, or change U3/U4 so Moonlight returns a supervised child handle. The plan should explicitly decide where the long-lived monitor lives and how it restores Korri when Moonlight exits or fails early.

---

### P1 — Direct sessiond launches cannot carry Gamescope policy as planned

**Confidence: 100**

U5 says direct library launch should be policy-aware and that “sessiond or an equivalent foreground launcher receives enough policy.” The existing sessiond launch contract cannot do that: `korri/shared/library/session-launcher.ts` POSTs `JSON.stringify({ spec })` to `/launch`, and `tools/device/sessiond.ts` reads only `{ spec?: LaunchSpec }`. `LaunchSpec` does not contain Gamescope policy; current sessiond then runs that raw spec via `launcher.run(spec)`.

U5 lists `korri/shared/library/session-launcher.ts` but does not list `tools/device/sessiond.ts`, sessiond tests, or a shared policy-bearing launch request type. An implementer would have to decide whether to wrap before sessiond, extend the `/launch` payload, or create a new foreground-launch endpoint.

**Action:** Expand U5 to include the sessiond contract and tests, or explicitly route direct library foreground launch through the new foreground-owner abstraction from U4. The plan must name where Gamescope policy is applied for sessiond-launched apps.

---

### P1 — Gamescope opt-out disables remote stream foreground repair today

**Confidence: 100**

R7/AE4 require disabling Gamescope not to disable foreground ownership. The current runner only enables Sway repair when Gamescope is enabled: `tools/device/game-stream-runner.ts` sets `fullscreen` only when `gamescopeEnabled` is true, and `tools/device/game-stream-fullscreen.ts` discovers surfaces using the Gamescope selector (`appIds/titles/classes` for `gamescope`). U2’s disabled-policy test scenario says raw child spawn “does not require Gamescope-specific repair prerequisites,” but it does not replace that repair with a generic opt-out foreground path.

The plan defers “exact foreground surface selector for non-Gamescope opt-out launches” to implementation, but that selector/ownership strategy is the architecture needed to satisfy R7 for opt-out stream launches.

**Action:** Add a U2/U4 dependency that generalizes foreground surface discovery/repair for non-Gamescope launches, or narrow R7 so remote runner opt-outs are explicitly not guaranteed foreground repair. Do not leave this as an implementation-time selector choice.

---

### P1 — The CLI stream-launch path still drops Gamescope policy and is not in scope

**Confidence: 100**

`tools/cli/stream-launch.ts` is a user-facing stream preparation path and currently uses `librarySource.launchSpecFor(options.game.id)` followed by `createLaunchIntent(options.spec)`. That drops `gamescope` exactly like the direct library launch path. The plan covers RPC prepare handlers and direct library launch, but not this CLI path.

Because the origin requires default-on foreground app launches and the existing workflow docs identify the CLI as the human-facing controller for known library games, leaving this path unchanged would create a visible default-off launcher after the plan lands.

**Action:** Add `tools/cli/stream-launch.ts` and its tests to U2 or U5. It should use `resolveLaunchForGame` and write the normalized Gamescope policy into the launch intent.

---

### P2 — Minimal Gamescope args conflict with Sobo’s validated Wayland Moonlight path

**Confidence: 75**

The plan’s default wrapper is `gamescope -f -b -- <child>`, inherited from `tools/device/game-stream-fullscreen.ts`. Sobo’s committed platform env sets `KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"` and `SDL_VIDEODRIVER = "wayland"` in `nix/images/platforms/rocknix-sm8550.nix`. External Gamescope docs note that native Wayland clients require `--expose-wayland` (ArchWiki: “Gamescope does not support Wayland clients by default. To enable support for Wayland clients, add the --expose-wayland flag”).

The plan includes Sobo validation as a mitigation, but it does not make a plan-time decision about whether the minimal default wrapper must expose Wayland for Wayland-configured children, especially local Moonlight. Without that decision, implementation may produce a default that immediately breaks the known Sobo Moonlight path or silently forces a different backend.

**Action:** Add a planning decision/test case for Wayland child support under Gamescope. Either include `--expose-wayland` as part of the minimal wrapper when the child is Wayland-configured, or explicitly require Sobo Moonlight to ship an opt-out/default override before default-on is enabled there.
