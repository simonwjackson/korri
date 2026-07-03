# Feasibility review: RPCS3 settings surface plan

## Verdict

The plan is mostly buildable against the current branch. The load-bearing claims checked out: `LaunchOverrides` exists on `ReleaseLaunch` but is not folded into readable launch resolution; RPCS3 policy reaches the materializer through `context.plugin[pluginId]`; readable materializers receive only `options.env`; and the RPCS3 materializer/launch-spec are small enough to extend as U4/U5 describe.

## Findings

### P1 — Do not expose raw `LaunchOverrides` through runtime/ephemeral overrides without a security redesign

U1 says to fold `LaunchOverrides` from “the ephemeral override layer” into `ReadableResolvedLaunchContext` (`plan.md:300-301`). That conflicts with the current runtime override boundary: `ResolveLaunchOptions.override` is an `EphemeralOverride`, and its schema explicitly says runtime overrides are narrower because `app.library.launch` is unauthenticated on trusted-LAN deployments and “must not expose command/env/raw-argv/key storage/path process surfaces” (`product/platform/library/config/ephemeral-override.ts:161-165`). `LaunchOverrides` is exactly raw argv/config text (`product/platform/library/config/records/library-item.ts:118-132`).

**Fix:** keep U1 limited to persisted `release.launch.overrides`, or add a separate authenticated/allowlisted runtime override design before folding `overrides` from `EphemeralOverride`.

### P2 — Release-scoped RPCS3 policy needs the missing allowlist before adding `state.root`

The origin proposal explicitly requires release-layer safety: releases may set semantic `settings.plugin.*` and `overrides.*`, but not `command`, `state.root`, or `env`, and says to enforce an allowlist in `readableViewOfRelease` (`rpcs3-settings-maximalist-proposal.md:484-487`). The actual resolver currently passes `release.launch.settings.plugin` through `pluginPolicyFromSettings` with only `content.path` stripped (`product/platform/library/config/cascade-resolver.ts:720-733`, `:736-750`, `:957-967`). Since the plan keeps `state`/`firmware` under `settings.plugin` (`plan.md:543-548`), a release-level settings block can redirect the operator-owned RPCS3 state root unless the plan adds that allowlist.

**Fix:** add a U1/U2 step that filters release-scoped `@korri:rpcs3` settings to user-tuning keys only, and source `state.root`/firmware from app/runtime/operator layers.

### P2 — `state.root` → `XDG_CONFIG_HOME`/`HOME` derivation is underspecified and can point RPCS3 at the wrong state directory

The plan says to derive `XDG_CONFIG_HOME`/`HOME` from `state.root` (`plan.md:529-530`, `:546-548`), but the origin states RPCS3’s emulator config dir is `$XDG_CONFIG_HOME/rpcs3` (`rpcs3-settings-maximalist-proposal.md:129-131`). Current code treats `state.root` as the actual RPCS3 config directory: default is `/var/lib/korri/rpcs3` (`product/plugins/rpcs3/src/ids.ts:24-27`) and firmware is validated at `join(stateRoot, sentinel)` (`product/plugins/rpcs3/src/materializer.ts:75-80`, `:141-146`). If implementation sets `XDG_CONFIG_HOME=stateRoot` literally, RPCS3 will look under `<stateRoot>/rpcs3`, while Korri validated/wrote under `<stateRoot>`.

**Fix:** make the contract explicit, e.g. `state.root` is the RPCS3 config dir and env sets `XDG_CONFIG_HOME=dirname(state.root)` (with a guard that basename is `rpcs3`), or change the state-root contract and all firmware/config paths together.
