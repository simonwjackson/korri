---
title: Gamescope --backend auto fights outer wayland compositor (sway) for DRM master
date: 2026-05-27
category: runtime-errors
module: tools/device/game-stream-fullscreen + korri/shared/library/config
problem_type: runtime_error
component: tooling
symptoms:
  - "User-verbatim: \"I can hear the game running in the background. It's been running for many minutes, but I don't actually see it on the screen.\""
  - "Game audio reaches pipewire normally; no window ever appears on the panel"
  - "[Error] wlserver: [libseat] Could not make device fd drm master: Device or resource busy (looped dozens of times per second)"
  - "[Error] xwm: Failed to prepare 1-layer flip entirely: Invalid argument"
  - "Gamescope never registers as a wayland client of sway; surface-watcher times out with no matching node in swaymsg -t get_tree"
root_cause: config_error
resolution_type: code_fix
severity: critical
related_components: [gamescope, sway, libseat, drm-kms, wayland-nested-compositor]
tags: [gamescope, wayland, drm-master, nested-compositor, launch-policy, sobo-kiosk]
---

# Gamescope --backend auto fights outer wayland compositor (sway) for DRM master

## Problem

Gamescope launched under sway never advertised itself to the outer compositor: `--backend auto` defaulted to `drm`, which tried to take DRM master while sway already held it. The wrapped game ran (audio played) but no window ever appeared on the panel. This was the cause of every "I can hear it but can't see it" report on the Sobo kiosk for celeste-classic and other PICO-8 titles.

## Symptoms

- User-verbatim from the original handoff: **"I can hear the game running in the background. It's been running for many minutes, but I don't actually see it on the screen."**
- Audio from the wrapped RetroArch + fake-08 + PICO-8 child reached pipewire normally — the game process was healthy.
- `journalctl -u korri-sessiond -f` during a launch (with Bug #1's phantom-SIGTERM suppressed by `--synchronous-x11`) showed gamescope's compositor-init loop repeating dozens of times per second:

  ```
  [Error] wlserver: [libseat] Could not make device fd drm master: Device or resource busy
  [Error] drm: Immediate flips are not supported by the KMS driver
  [Error] xwm: Failed to prepare 1-layer flip entirely: Invalid argument
  [Info]  drm: selecting connector DSI-1
  [Info]  drm: selecting mode 1080x1920@120Hz
  ```

- Gamescope never registered as a wayland client of sway, so no `swaymsg -t get_tree` node ever appeared for the `gamescope` app-id and the surface-watcher timed out.
- This bug was masked for most of the investigation by Bug #1 (the SSE idleTimeout phantom-SIGTERM): the child was usually killed before anyone noticed the display loop. The `--synchronous-x11` diagnostic flag suppressed Bug #1's timing window long enough to expose Bug #2.

## What Didn't Work

- **Suspecting freedreno on SM8550 / Adreno 740 + Mesa 25.2.6.** The stack has known sharp edges; burned time trying to enable coredumps — `sysctl -w kernel.core_pattern` was denied because the RockNix kernel pinned `|/bin/false` via lockdown.
- **Generic "gamescope on Mali" GitHub issues.** None reproduced standalone; this was a nesting problem, not a GPU problem.
- **Reading `Immediate flips are not supported by the KMS driver` as a driver gap.** It was gamescope attempting KMS on a device whose KMS master was held by sway — the message is correct for the wrong reason.
- **Tuning gamescope output sizing.** Time spent on `-W` / `-H` / `--prefer-output`; irrelevant, gamescope never finished compositor init.
- **Blaming the fake-08 PICO-8 core.** A previous handoff suggested the core; swapping cores reproduced the same symptom.
- **The Qt thread warning in gamescope's stderr.** Benign noise, distracted from the real loop a few lines lower.

What surfaced the truth: a fresh `journalctl -u korri-sessiond -f` during a Bug-#1-suppressed launch showed the libseat / DRM-master failure repeating tightly; gamescope's man page and source confirmed `--backend auto` prefers `drm` and that `wayland` is the correct value when nested.

## Solution

Commit `0854900` elevated backend selection from gamescope's implicit auto-detect to first-class cascade policy. Four layers all in the same commit.

### 1. Schema gains `backend` and `exposeWayland`

`korri/shared/library/config/inheritable-fields.ts`:

```ts
export const GamescopeBackend = Schema.Literals([
  "auto",
  "drm",
  "sdl",
  "wayland",
  "headless",
])
export type GamescopeBackend = Schema.Schema.Type<typeof GamescopeBackend>

export const GamescopePolicy = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  command: Schema.optional(Schema.String),
  backend: Schema.optional(GamescopeBackend),
  exposeWayland: Schema.optional(Schema.Boolean),
  args: Schema.optional(Schema.Array(Schema.String)),
})

export const DEFAULT_GAMESCOPE_POLICY: GamescopePolicy = {
  enabled: true,
  backend: "wayland",
  exposeWayland: true,
}
```

The default is correct-by-default for nested deployments (sway kiosk, GNOME/KDE workstations). Standalone-DRM handhelds override per-game/launcher in YAML.

### 2. Cascade folds the new fields

`korri/shared/library/config/cascade-resolver.ts` — `foldGamescope` now propagates `backend` and `exposeWayland` through every inheritance layer with last-write-wins semantics. Without this, a layer setting `backend: "wayland"` would be silently dropped during the fold:

```ts
/** Deep-merge two gamescope policies; `args` concat, scalars last-win. */
const foldGamescope = (
  base: GamescopePolicy | undefined,
  extra: GamescopePolicy,
): GamescopePolicy => {
  const enabled = extra.enabled !== undefined ? extra.enabled : base?.enabled
  const command = extra.command !== undefined ? extra.command : base?.command
  const backend = extra.backend !== undefined ? extra.backend : base?.backend
  const exposeWayland =
    extra.exposeWayland !== undefined
      ? extra.exposeWayland
      : base?.exposeWayland
  const args =
    extra.args !== undefined
      ? [...(base?.args ?? []), ...extra.args]
      : base?.args
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(backend !== undefined ? { backend } : {}),
    ...(exposeWayland !== undefined ? { exposeWayland } : {}),
    ...(args !== undefined ? { args } : {}),
  }
}
```

### 3. Compose emits `--backend` (and `--expose-wayland`)

`tools/device/game-stream-fullscreen.ts`:

```ts
export interface GamescopeOptions {
  readonly enabled: boolean
  readonly command?: string
  readonly backend?: GamescopeBackend
  readonly exposeWayland?: boolean
  readonly args?: readonly string[]
}

export function composeGamescopeLaunchSpec(
  game: LaunchSpec,
  options: GamescopeOptions,
): LaunchSpec {
  if (!options.enabled) return game
  return {
    command: options.command ?? DEFAULT_GAMESCOPE_COMMAND,
    args: [
      ...(options.backend ? ["--backend", options.backend] : []),
      "-f",
      "-b",
      ...(options.exposeWayland ? ["--expose-wayland"] : []),
      ...(options.args ?? []),
      "--",
      game.command,
      ...game.args,
    ],
    env: game.env,
    cwd: game.cwd,
  }
}
```

The same commit also deleted the `launchesNativeWaylandChild` env-sniffing heuristic — `exposeWayland` is now an explicit policy field rather than inferred from the child command. See [design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27](../design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md) for the generalized pattern this exemplifies (third instance in Korri after input-bus source tagging and electrobun active-focus).

### 4. RPC wiring forwards the new fields

`korri/products/app/api/library/launch.rpc-handler.ts` threads `backend`, `exposeWayland`, and `command` from the resolved cascade into `composeGamescopeLaunchSpec` for both the local-source and Moonlight code paths, so the policy reaches the actual invocation instead of being recomputed (or silently dropped) at the seam.

## Why This Works

`gamescope --backend auto` is correct on bare metal: gamescope is the compositor, owns DRM master, and lights up the display directly. It is the wrong default the moment gamescope runs *inside* another wayland compositor — sway already holds DRM master, and `auto` resolves to `drm`, so gamescope deadlocks itself trying to acquire what it can never get. `--backend wayland` makes gamescope a wayland client of the outer compositor: it asks sway for a surface instead of asking the kernel for a card.

Making `backend` a cascade-folded field means deployment shape is policy, not code. The kiosk image and dev workstations get `wayland` from `DEFAULT_GAMESCOPE_POLICY`; a future handheld build overrides to `drm` (or `auto`) in its library YAML; per-game overrides for oddball cases (a SteamOS-style fullscreen exclusive, a headless capture rig) drop into the same cascade without touching `composeGamescopeLaunchSpec`. `exposeWayland` rides the same path so wayland-native children (e.g. RetroArch with `video_driver = "wayland"` in `retroarch.cfg`) can see the nested socket without a separate inference heuristic.

The empirical evidence is already in the corpus: the AKA x86 Steam launch path (see `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`) had independently arrived at `gamescope --backend wayland …` as the only invocation that works under sway. This fix bakes that empirically-correct value into the cascade default for every nested deployment.

## Prevention

Tests that ship with the fix:

- `tools/device/game-stream-fullscreen.test.ts` — **"prepends an explicit --backend flag when the policy selects one"**. Asserts the composed argv begins with `--backend wayland` before `-f -b`.
- `korri/shared/library/config/cascade-resolver.test.ts` — **"defaults Gamescope to enabled with kiosk-shaped backend when no layer has a Gamescope opinion"**. Pins the resolved default to `{ enabled: true, backend: "wayland", exposeWayland: true }` so a future refactor of the default policy can't silently drop the kiosk-correct fields.
- `korri/shared/library/config/cascade-resolver.test.ts` — **"folds backend and exposeWayland across cascade layers (last-write wins)"**. Verifies a game-level `backend: "wayland"` overrides a global `backend: "sdl"` while `exposeWayland: false` from the lower layer survives — the bare merge behavior the bug needed.

General principle: when you wrap a tool that has an `auto` / `detect` mode for its hardware backend (video sink, GPU, display, audio output), make the choice explicit in your policy rather than relying on the tool's default to be correct for your deployment. `auto` encodes the upstream author's mental model of "typical usage"; the moment you're nesting it, sandboxing it, or running it on hardware they didn't test, that model is wrong and the symptom is a tight retry loop with no actionable error.

Reviewer rule: any new invocation of `gamescope …`, `mpv --vo auto`, `ffmpeg -hwaccel auto`, `wlroots`-based compositor flags, or similar should pin the backend in policy. `auto` is the equivalent of saying "I don't care" — and a wrapper, a different host kernel, or a nested compositor can make that catastrophic. If a deployment legitimately wants `auto`, that's a deliberate value in the cascade, not a missing field.

## Related

- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` — **sibling. Bug #1 of the same trunk arc.** Masked this bug for most of the investigation; the SIGTERM-at-T+24s pattern hid the audio-without-video signature.
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — framing parent. Sessiond owns the launcher seam that calls `composeGamescopeLaunchSpec`; row #11 of its empirical-fixes table is this bug.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` — gamescope-as-policy framing. Its worked-example command shape predates the cascade default and shows the pre-fix invocation.
- `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md` — independent precedent. Every gamescope invocation in that doc is `gamescope --backend wayland …` on the AKA x86 path; this fix generalizes that pattern.
- `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md` — empirical backend matrix on the same hardware class. The manual-launch path concluded `--backend wayland | Aborted`; the in-tree path proves `--backend wayland` works on the same hardware when invoked through the resolved cascade rather than ad-hoc shell.
- `docs/solutions/runtime-errors/kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27.md` — cousin bug in the same Sobo trunk arc; different layer, same launcher seam.
