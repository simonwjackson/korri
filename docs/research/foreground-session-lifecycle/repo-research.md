## Repository Research Summary

### Technology & Infrastructure
- Stack detected: TypeScript strict mode, React 19, Effect 4 beta / Effect RPC, `@effect/atom-react`, Hono, Vite, Tailwind 4, Bun, Biome, Fallow, Nix flakes, direnv. Evidence: `package.json`, `tsconfig.json`, `flake.nix`, `.fallowrc.json`, `biome.json`, `justfile`.
- Deployment model: product app plus desktop/kiosk packaging. Runtime app code is under `korri/products/app`; deploy/bootstrap code under `korri/deploy/{portal,desktop,storybook}`; reusable runtime code under `korri/shared`; device/Nix helpers under `tools` and `nix`.
- API style: Effect RPC over HTTP. App RPC group in `korri/products/app/api/app-rpc-group.ts`; server/source RPC group in `korri/products/app/api/server/rpc-group.ts`; desktop-local RPC currently in `korri/products/app/stream/local-stream-launch-rpc.ts` served by `korri/deploy/desktop/launch-bridge.ts`.
- Data/config layer: Proseql-backed YAML/library repository and cascade resolver. Gamescope policy defaults to enabled in `korri/shared/library/config/inheritable-fields.ts`; per-launch policy is resolved separately from `LaunchSpec` and carried beside launch intents.
- Relevant automation: `just test-unit`, `just typecheck`, `just lint`, `just desktop-smoke`; CI includes `.github/workflows/fallow.yml`, `desktop-stage1.yml`, and `desktop-stage2.yml`.
- Monorepo: no package workspace manifest. `old-ui/` is a separate historical package; active code follows repo-local layer directories and Fallow zones.

### Architecture & Structure
- Canonical project instructions are in `AGENTS.md`; `CLAUDE.md` only delegates to it. Key boundaries: `@app/*` product code, `@shared/*` reusable runtime code, deploy code may wire app/shared, shared must not import product/deploy/tools.
- Current desktop Moonlight path:
  1. UI uses `Launcher` service; desktop runtime selects `LauncherLayerBridge` in `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx`.
  2. `LauncherLayerBridge` calls the desktop-local client in `korri/products/app/stream/local-stream-launch-client.ts`.
  3. `korri/deploy/desktop/launch-bridge.ts` handles `app.desktop.launch`: get connection, input preflight, resolve local Moonlight Gamescope policy, prepare host stream, snapshot Sway surfaces, launch Moonlight, repair foreground surface.
  4. Host prepare is `app.server.stream.prepare` via `korri/products/app/stream/remote-stream-client.ts`; server writes a `GameStreamLaunchIntent` in `korri/products/app/api/stream/prepare.rpc-handler.ts` / `tools/device/game-stream-launch-intent.ts`.
  5. Local Moonlight spawn is `korri/products/app/stream/moonlight-launcher.ts`; it wraps in Gamescope by default via `tools/device/game-stream-fullscreen.ts`.
- Existing lifecycle precedents:
  - `tools/device/game-stream-state.ts` + `tools/device/game-stream-runner.ts`: pure state transitions, run lock, status file, managed child, Sway repair, and `already-running` rejection.
  - `tools/device/sessiond-state.ts` + `tools/device/sessiond.ts`: home/launching/game/restoring/recovering session owner, but docs explicitly note current desktop Moonlight bridge bypasses it.
- Current gap for Phase 1: `korri/deploy/desktop/main.ts` tracks `activeMoonlightChild`, but `diagnosticMoonlightRunner` calls `replaceActiveMoonlightChild()` before every spawn. Re-entry terminates/replaces instead of rejecting, and the bridge returns once Moonlight starts rather than keeping a generic foreground lifecycle non-idle until child/session exit.
- Gamescope must remain enabled/required for this validation path. Current defaults already help: `moonlightCommandSpec(..., gamescope ?? { enabled: true })` in `korri/products/app/stream/moonlight-launcher.ts`, and config cascade default `{ enabled: true }` in `korri/shared/library/config/inheritable-fields.ts`.

### Issue Conventions
- No issue templates or local issue conventions found. `gh issue list` produced no accessible issue data in this checkout.
- Use existing docs/plan style instead: dated markdown under `docs/brainstorms`, `docs/plans`, `docs/solutions`, `docs/acceptance`, with frontmatter and implementation-unit sections.

### Documentation Insights
- Required problem framing is `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`.
- Important supporting docs:
  - `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: foreground ownership belongs to the session, not Gamescope; current desktop launch bridge bypasses stronger lifecycle code.
  - `docs/briefs/2026-05-21-korri-config-cascade-brief.md`: gamescope policy rides the broad-to-specific cascade; do not replace cascade semantics.
  - `docs/plans/2026-05-26-003-feat-moonlight-local-control-protocol-plan.md`: Moonlight local control is adapter evidence, not the abstraction; do not make Phase 1 depend on it.
- Testing posture: Bun unit tests with real configurable implementations, no `Mock*`/`Stub*`/`Fake*`; Fallow boundary rules in `.fallowrc.json`; formatting/lint via Biome/Fallow.

### Templates Found
- No `.github/ISSUE_TEMPLATE`, PR template, RFC template, or contributing file found in the active repo.

### Implementation Patterns
- Contracts use Effect Schema discriminated unions/classes near the owning boundary: see `korri/products/app/stream/local-stream-launch-rpc.ts`, `korri/shared/input/desktop-bridge-wire.ts`, `korri/shared/stream/moonlight-control-protocol.ts`.
- Effect services use `Context.Service` + `Layer.succeed`/`Layer.effect`: see `korri/shared/library/library-services.ts` and `korri/products/app/features/home/launcher-layer-bridge.ts`.
- Pure state transitions are separated from I/O owners: `tools/device/game-stream-state.ts` and `tools/device/sessiond-state.ts`.
- Process seams use real configurable implementations: `ManagedChildSpawner` in `tools/device/game-stream-runner.ts` and controlled children in `tools/device/game-stream-runner.test.ts`.
- Current foreground repair is generic enough for Phase 1 reuse: `snapshotStreamSurfaceIds`, `repairStreamSurface`, and empty selector support in `tools/device/game-stream-fullscreen.ts` handle newly-created Gamescope/Sobo surfaces.

### Recommended Phase 1 Implementation Units / Tests

1. **Add a generic foreground/session lifecycle contract.**
   - Suggested files: `korri/shared/stream/foreground-session-lifecycle.ts`, `korri/shared/stream/foreground-session-lifecycle.test.ts`.
   - Include pure types/helpers for `IdleReady | Preparing | Spawning | Foregrounding | Running | Exiting | TearingDown | VerifyingReady | Failed | Recovering`, active session handle fields, terminal status, adapter evidence, and event records.
   - Add `canAcceptLaunch(state)` and a typed rejected result such as `reason: "not-idle-ready"` / `"session-busy"`.
   - Tests: every non-idle state rejects; accepted launch records request id; event/handle shapes preserve adapter-generic fields and optional Moonlight evidence.

2. **Add a desktop foreground session owner that serializes launch attempts.**
   - Suggested files: `korri/deploy/desktop/foreground-session-owner.ts`, `korri/deploy/desktop/foreground-session-owner.test.ts`.
   - Owner should accept a generic adapter function, transition through Phase 1 states, emit structured events, return quickly after local spawn/foregrounding, and keep the owner non-idle until the managed child/session `exited` promise resolves. Phase 1 `TearingDown`/`VerifyingReady` can be immediate; defer conservative readiness.
   - Tests: second launch while Preparing/Spawning/Foregrounding/Running/Exiting/TearingDown/VerifyingReady/Recovering returns busy and does not call adapter; owner returns to IdleReady only after terminal observation; adapter failure transitions to Failed/Recovering then IdleReady; events include accepted/rejected/transition/exit.

3. **Expose a managed local child/session handle from the Moonlight spawn seam.**
   - Suggested modifications: `korri/products/app/stream/moonlight-launcher.ts`, `tools/cli/moonlight-launcher.test.ts`, `korri/deploy/desktop/main.ts`.
   - Extend `CommandRunner`/`MoonlightLaunchResult` with an optional generic session handle (`pid`, `exited`, `terminate`) without making Moonlight the lifecycle abstraction. Have `diagnosticMoonlightRunner` return the handle instead of replacing an existing child. Shutdown can ask the owner to terminate the active session.
   - Tests: existing Gamescope defaults remain exact; explicit `gamescope: { enabled: false }` still unwraps only when explicitly provided; a managed handle is propagated when the runner supplies one; no re-entry code path kills/replaces the previous child.

4. **Route `app.desktop.launch` through the lifecycle owner before prepare/spawn side effects.**
   - Suggested modifications: `korri/deploy/desktop/launch-bridge.ts`, `korri/deploy/desktop/create-desktop-app.ts`, `korri/deploy/desktop/main.ts`.
   - Add `foregroundSessionOwner`/`launchLifecycle` dependency to `LaunchBridgeOptions`. The owner should wrap the current sequence: input preflight, `prepareGame`, Sway snapshot, `launchMoonlight`, foreground repair.
   - The busy check should happen before remote prepare and local spawn; keep Gamescope resolution/usage intact.
   - Tests in `korri/deploy/desktop/launch-bridge.test.ts`: busy response returns typed failure; `preflightMoonlightInput`, `prepareGame`, `launchMoonlight`, and foreground repair are not called on busy; successful launch records generic lifecycle request/session ids; rejection logs/emits observable event.

5. **Add a typed busy outcome to the desktop RPC and renderer bridge mapping.**
   - Suggested modifications: `korri/products/app/stream/local-stream-launch-rpc.ts`, `korri/products/app/features/home/launcher-layer-bridge.ts`, `korri/shared/library/launcher.ts`.
   - Add a failure category like `"session-busy"` or `"session-not-ready"` and map it to a stable `LaunchResult.failureKind`/exit code. No Phase 3 UI disabling yet; this is just a typed contract.
   - Tests: schema accepts the new category; `LauncherLayerBridge` maps it deterministically; existing failure categories remain unchanged.

6. **Keep host game-stream runner and conservative readiness out of Phase 1 except as references.**
   - Do not alter `tools/device/game-stream-runner.ts` readiness semantics for this slice unless needed for compile compatibility.
   - Do not add Moonlight local-control readiness gates yet; capture the handle/evidence fields so Phase 2 can attach them later.

### Recommendations
- Put the reusable lifecycle vocabulary in `@shared` only if it remains pure and product-agnostic; put the stateful desktop owner in `korri/deploy/desktop` because it wires desktop Bun, Sway repair, and Moonlight launch.
- Preserve the current Gamescope-required validation path: tests should assert Moonlight still launches through `gamescope -f -b -- ...` by default.
- Verify with `bun test korri/deploy/desktop/launch-bridge.test.ts korri/deploy/desktop/foreground-session-owner.test.ts tools/cli/moonlight-launcher.test.ts korri/products/app/features/home/launcher-layer-bridge.test.ts`, then `just typecheck`, `just lint`, and targeted `just desktop-smoke` if desktop composition changes.
