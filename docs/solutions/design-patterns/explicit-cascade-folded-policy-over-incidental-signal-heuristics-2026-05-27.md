---
title: Prefer explicit cascade-folded policy fields over wrapper-side env/argv sniffing heuristics
date: 2026-05-27
category: design-patterns
module: korri/shared/library/config + tools/device/game-stream-fullscreen
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A wrapper process (gamescope, firejail, bwrap, systemd-run) needs to know something about the child it launches"
  - "The child's effective config can live in places the wrapper cannot see (on-disk config files, dotfiles, registry, runtime probes)"
  - "Argv or env sniffing is being used to infer child intent (e.g. -platform wayland, SDL_VIDEODRIVER, WAYLAND_DISPLAY)"
  - "Per-deployment overrides (library YAML, system policy, launcher policy) need to influence wrapper flags"
  - "A cascade-folded policy layer (global → launcher → system → game → override) already exists or is cheap to add"
related_components: [tools/device/game-stream-fullscreen.ts, korri/shared/library/config/inheritable-fields.ts, korri/products/app/stream/moonlight-launcher.ts, korri/shared/input, GamescopePolicy]
tags: [cascade-policy, gamescope, wayland, policy-over-heuristics, explicit-intent, composer-pattern]
---

# Prefer explicit cascade-folded policy fields over wrapper-side env/argv sniffing heuristics

## Context

The Korri launcher subsystem resolves a `GamescopePolicy` by folding inheritable config layers — global → user → system → launcher → game → preset → ephemeral override — through `korri/shared/library/config/cascade-resolver.ts`. The fold's output is handed to `composeGamescopeLaunchSpec` in `tools/device/game-stream-fullscreen.ts`, which turns the resolved policy into a concrete `gamescope` argv. The seam is intentional: policy is declarative and layered; argv composition is mechanical and policy-driven.

This seam was previously corrupted by a heuristic inside the composer that tried to infer whether the wrapped child needed `--expose-wayland` by inspecting the child's argv and environment. The heuristic looked at `SDL_VIDEODRIVER`, `WAYLAND_DISPLAY`, and the presence of `-platform wayland` in argv. It silently failed in a real production path: RetroArch's wayland video driver is configured by `video_driver = "wayland"` in `retroarch.cfg` — a file the composer cannot read — so the heuristic returned `false`, gamescope was launched without `--expose-wayland`, and RetroArch fell back through XWayland → GLX → freedreno. No error, no warning, just a worse pipeline that contributed to the silent-off-screen failure documented in [runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](../runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md).

This was the third time this exact shape has bitten Korri. The first was input-bus action sourcing ([best-practices/pointer-aware-spatial-navigation-2026-05-01](../best-practices/pointer-aware-spatial-navigation-2026-05-01.md)), where consumers were inferring action source from event-timing heuristics until that broke under pointer/key interleaving and was replaced with an explicit `source` tag at emit time. The second was focus modeling ([ui-bugs/electrobun-spatial-focus-active-attribute-2026-05-06](../ui-bugs/electrobun-spatial-focus-active-attribute-2026-05-06)), where the browser's `:focus-visible` heuristic silently disagreed with the product's notion of "active focus" until that was replaced with an explicit `data-korri-active-focus` attribute mirrored from the navigation layer. This doc generalizes the pattern that all three fixes converged on.

## Guidance

- **Make intent explicit in cascade policy fields.** When a wrapper's or consumer's behavior depends on knowledge it doesn't own, add that knowledge as a named, cascade-folded field on the policy or the message envelope. `exposeWayland: boolean` on `GamescopePolicy` is the canonical example. The field has a single, documented meaning; it deep-merges through the cascade like every other field.
- **Let callers populate policy from their own knowledge.** The component that knows a fact about its own invocation is the component that records it in the policy. The `moonlight-launcher` knows when it passes `-platform wayland` to its own subprocess — it sets `exposeWayland: true` on the policy at construction time. The composer does not guess.
- **Let the composer emit strictly from policy.** Once policy is resolved, the composer maps fields to flags with no branching on incidental signals. `composeGamescopeLaunchSpec` emits `--expose-wayland` if and only if `policy.exposeWayland === true`. No env sniffing, no argv inspection, no peeking at child config files.
- **Provide a correct-for-typical-deployment default.** The floor of the cascade encodes the deployment shape that's correct in production. `DEFAULT_GAMESCOPE_POLICY` sets `enabled: true`, `backend: "wayland"`, `exposeWayland: true` because Korri runs gamescope nested under a parent Wayland compositor. Callers in atypical deployments override per-game/launcher in YAML; callers in the common case need not think about the field at all.
- **Delete the old heuristic when you ship the field.** Leaving a heuristic alongside a new explicit policy field creates a parallel universe where both can disagree and the loser is silent. Heuristics survive code review more easily than they should; if the field works, the heuristic must go.

## Why This Matters

- **Hidden inputs.** A child's real configuration often lives somewhere the wrapper cannot read. `retroarch.cfg` is the canonical example; `~/.config/mpv/mpv.conf`, `vlc-default.conf`, application-specific INIs, and OS registries are all the same shape. A heuristic that only sees argv and env is structurally blind to these.
- **CLI brittleness.** Sniffing argv couples the wrapper to the child's CLI surface. If upstream renames `-platform` to `--platform`, moves wayland-platform behind a different flag, or accepts the same intent via an env var, the heuristic breaks. Worse, it breaks silently: the wrapper still runs, the flag is just wrong.
- **No diagnostics.** When a heuristic guesses wrong there is no error path, no log line, no warning. The only signal is downstream symptoms — degraded performance, wrong renderer, missing socket — observed in production. Policy fields, by contrast, are inspectable, testable, and traceable to the layer that set them.
- **Blocks policy.** A heuristic in the composer cannot read library YAML. Per-game, per-system, or per-launcher overrides — the entire reason the cascade exists — cannot reach the wrapper. The heuristic effectively asserts that its guess outranks every layer of declared configuration.
- **Recurring drag.** The same shape has now bitten three different subsystems (input-bus source inference, focus-style inference, gamescope flag inference). The cost of writing the heuristic is small; the cost of debugging it later is large; the cost across multiple subsystems compounds. Naming the pattern stops the next one from being written.

## When to Apply

- When wrapping a tool whose behavior is governed by on-disk config, environment files, or registry state the wrapper cannot reliably introspect.
- When the wrapper's correctness depends on hardware or deployment topology (nested compositor vs. standalone DRM, GPU vendor, container boundary) that the caller knows but the composer does not.
- When per-deployment overrides should be possible through declarative config (YAML, JSON, TOML) without code changes to the wrapper.
- When the wrapper sits at a seam between a policy cascade and a transport — argv, environment, system call — and the seam already exists to translate intent to invocation.
- When a heuristic's failure mode is silent degradation rather than a loud error.

## Examples

### Example 1 — Gamescope launch flag (this fix, commit `0854900` + `5343ae4`)

**Before:** the composer guesses whether the child wants Wayland exposed by looking at argv and env.

```ts
// REMOVED from tools/device/game-stream-fullscreen.ts in commit 0854900
function launchesNativeWaylandChild(game: LaunchSpec): boolean {
  const env = game.env ?? {}
  if (env.SDL_VIDEODRIVER === "wayland") return true
  if (env.WAYLAND_DISPLAY) return true
  if (game.args?.includes("-platform") && game.args.includes("wayland")) return true
  return false
}
```

**After:** the caller (`moonlight-launcher`), which knows its own argv, sets the policy field. The composer emits the flag strictly from policy.

```ts
// korri/products/app/stream/moonlight-launcher.ts
function moonlightCommandSpec(
  command: string,
  args: readonly string[],
  gamescope: GamescopeOptions | undefined,
): { readonly command: string; readonly args: readonly string[] } {
  // When Moonlight is launched with `-platform wayland`, the gamescope
  // wrap needs to expose its wayland socket so the Moonlight client
  // can use the native Wayland backend instead of falling through to
  // XWayland. Set exposeWayland explicitly here when the caller did
  // not already opt in or out.
  const platformWayland = args.some(
    (arg, index, source) =>
      arg === "-platform" && source[index + 1] === "wayland",
  )
  const baseline: GamescopeOptions = gamescope ?? { enabled: true }
  const resolved: GamescopeOptions =
    platformWayland && baseline.exposeWayland === undefined
      ? { ...baseline, exposeWayland: true }
      : baseline
  return composeGamescopeLaunchSpec({ command, args }, resolved)
}
```

```ts
// tools/device/game-stream-fullscreen.ts — composer is now strictly policy-driven
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

The cascade default at the floor of `GamescopePolicy`:

```ts
// korri/shared/library/config/inheritable-fields.ts
export const DEFAULT_GAMESCOPE_POLICY: GamescopePolicy = {
  enabled: true,
  backend: "wayland",
  exposeWayland: true,
}
```

### Example 2 — Input-bus action source tagging (`pointer-aware-spatial-navigation`, May 2026)

Consumers of the input bus were inferring whether an action came from a pointer or a key by timing-window heuristics ("if a pointer event fired within 200ms of this action, it's a pointer action"). The heuristic was wrong under pointer/key interleaving and produced silently degraded focus behavior. Fix: tag every emitted action with an explicit `source` field at emit time. Consumers stopped inferring.

The principle is the same: **the emitter knows the fact; the consumer should not guess.**

### Example 3 — Electrobun active-focus attribute (`electrobun-spatial-focus-active-attribute`, May 2026)

The browser's `:focus-visible` heuristic silently disagreed with the product's notion of "which element is actively focused right now" — the heuristic considered pointer focus, the product wanted only keyboard-driven focus to count. Fix: an explicit `data-korri-active-focus` attribute mirrored from the navigation layer onto the focused element. CSS styles target the attribute. The browser heuristic is left out of the loop.

Same principle, different seam: **don't trust the platform's heuristic when the product has a clear opinion; encode the opinion explicitly and read from it.**

## Related

- [runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](../runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md) — the concrete bug whose fix introduced `exposeWayland` and deleted the `launchesNativeWaylandChild` heuristic. Worked example #1.
- [best-practices/pointer-aware-spatial-navigation-2026-05-01](../best-practices/pointer-aware-spatial-navigation-2026-05-01.md) — earlier statement of the same principle at the input-bus layer. Worked example #2.
- [ui-bugs/electrobun-spatial-focus-active-attribute-2026-05-06](../ui-bugs/electrobun-spatial-focus-active-attribute-2026-05-06.md) — same principle at the focus layer. Worked example #3.
- [runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27](../runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md) — sibling 2026-05-27 fix with a softer version of the pattern: name the timeout policy field instead of accepting `Bun.serve`'s implicit 10s default.
- [architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24](../architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md) — complementary policy-location decision on the same gamescope launch surface (where foreground/overlay policy lives).
- [design-patterns/constrained-llm-entrypoint-classification-2026-05-24](./constrained-llm-entrypoint-classification-2026-05-24.md) — category sibling. Adjacent shape: replace fuzzy LLM freeform output with a deterministic constrained contract.
