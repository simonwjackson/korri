---
title: RetroArch routes .png content to its built-in image-display core, overriding explicit -L when CLI is ambiguous
date: 2026-05-27
category: runtime-errors
module: PICO-8 launch path / RetroArch content routing
problem_type: runtime_error
component: tooling
symptoms:
  - "Launching a `.p8.png` PICO-8 cart shows a static image viewer / file listing instead of running the game"
  - "RetroArch's `--verbose` output reports loading the built-in `image display` core, not the libretro core named by `-L`"
  - "Symptom persists even after passing `-L /path/to/fake08_libretro.so` explicitly, when other CLI noise makes the request ambiguous"
  - "Renaming `.p8.png` → `.p8` makes the symptom go away even when the explicit `-L` is unchanged"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components: [retroarch, libretro-fake-08, pico-8, image-display-core, file-extension-routing]
tags: [retroarch, pico-8, content-routing, image-display, cli-ambiguity, extension-sniffing]
---

# RetroArch routes .png content to its built-in image-display core, overriding explicit -L when CLI is ambiguous

## Problem

RetroArch ships a built-in `image display` core that handles common image extensions (`.png`, `.jpg`, `.bmp`). When you invoke `retroarch <content>` with `.png` content, the content-extension router can outweigh an explicit `-L <libretro core>` flag if the CLI is ambiguous in any way (duplicate `-L`, a `-L` pointing at a directory, an `--appendconfig` chain that overrides the core selection). PICO-8 carts in the `.p8.png` format (raw cart payload embedded in a PNG header) get hijacked into the image viewer instead of running through `fake08_libretro.so`.

## Symptoms

- Pressing A on celeste-classic showed a static image viewer / cart listing rather than running the game.
- RetroArch's `--verbose` startup output reported it was loading `image display` as the core, regardless of what the launcher had requested via `-L fake08_libretro.so`.
- The symptom went away when the cart file was renamed from `.p8.png` to `.p8` (PICO-8's raw cart format), even though the launcher's `-L` argument was unchanged.
- Even after the wrapper-injection trap (commit `778845d`) was fixed and `-L` reached RA unmolested, this routing behavior persisted in some configurations where the rest of the argv hinted at content-driven routing.

## What Didn't Work

- **Assuming explicit `-L` always wins.** RetroArch's CLI surface treats `-L <core>` as advisory in some code paths; the content-extension router can win when `-L` is ambiguous (directory, duplicate, or missing). RA's docs don't enumerate the precedence rules cleanly.
- **Pinning the libretro core in `retroarch.cfg`.** Setting `libretro_path` or `core_options_path` in the config file did not stop the image-display fallback when the cart had a `.png` extension.
- **Passing `--core` instead of `-L`.** Equivalent at the argv layer; same routing fallback.
- **Disabling the image-display core at compile time.** Possible in theory; would require a custom RetroArch derivation. Disproportionate fix for a launcher-side problem.

## Solution

Two complementary mitigations, both shipped:

### 1. Eliminate the CLI ambiguity that triggers content-driven fallback

This is the primary fix (covered in detail by [runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27](retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md)). Once the nixpkgs `passthru.wrapper` is dropped in favor of `symlinkJoin`, RetroArch sees a single, unambiguous `-L <core.so>` from the launcher. With unambiguous CLI, RA correctly honors the explicit core and does not fall through to extension routing.

### 2. Symlink the cart to its raw extension

Belt-and-braces. Library content is placed at a path RA will not misroute even if a future CLI ambiguity reintroduces itself:

```sh
# /storage/roms/pico-8/celeste.p8 → /storage/roms/pico-8/celeste-classic.p8.png
ln -s celeste-classic.p8.png /storage/roms/pico-8/celeste.p8
```

The launcher YAML references `celeste.p8`; the underlying file remains a PNG-wrapped cart. RA's CLI parses `.p8` as a libretro-routed extension (no built-in image-display claim on it) and respects the `-L`.

Either mitigation alone would fix the symptom today; both together are robust against future RA upstream changes that could re-tighten extension-based routing or loosen `-L` precedence.

## Why This Works

RetroArch's CLI sits at a seam between two correct behaviors: launching content with an explicit libretro core, and launching content where the user wants RA to auto-pick a core based on file type. The two are reconciled by precedence rules that aren't fully documented and have shifted across versions. Empirically the rules are: **unambiguous `-L <core.so>` wins; ambiguous CLI (duplicate `-L`, directory-as-core, etc.) falls through to extension routing; extension routing claims `.png` / `.jpg` / `.bmp` for the built-in image-display core.**

Two corrective principles:

1. **Don't depend on hidden precedence rules.** If your launcher knows the core, make the CLI unambiguous. One `-L <core.so>`, no `--appendconfig` overrides, no helper wrappers prepending flags.
2. **Don't hand RetroArch an extension it will claim out from under you.** PICO-8 cart files in `.p8.png` format are a common trap because PNG is what you get when you download from BBS forums. Symlinking to `.p8` (or `.lua`, or any extension that doesn't collide with a built-in core's claim) is the safest content-layer defense.

This sits alongside three sibling lessons from the same investigation about not trusting helpful-by-default behavior:

- The nixpkgs wrapper trap (Trap A) — `passthru.wrapper` injecting `-L <coredir>`.
- The gamescope `--backend auto` trap — auto-detect picking `drm` on a nested compositor.
- The `launchesNativeWaylandChild` env-sniffing heuristic — composer guessing intent from incidental signals.

All four converge on: **when you have explicit intent, surface it explicitly; don't trust intermediaries to infer correctly.**

## Prevention

- **Library import normalization.** When ingesting PICO-8 carts, prefer storing them with `.p8` (raw) over `.p8.png` even when the download format is `.p8.png`. A symlink or a copy works; the symlink preserves the original.
- **Launcher YAML schema validation.** Library validation could warn (or fail) when a launcher targets fake-08 and the content path ends in `.png` — a hint that the cart should be symlinked or renamed.
- **Smoke test on the rendered argv.** On first launch in a build, log the exact argv handed to `retroarch` and verify RA's `--verbose` output names the core that was requested. Mismatch = content-routing trap regression.
- **Reviewer rule.** Be skeptical of any RetroArch invocation that includes both a `-L <core>` AND content with an extension claimed by a built-in core (`.png`, `.jpg`, `.bmp`). Either rename the content extension or be explicit about ignoring the built-in (`--features=-image-display`, when available in the build).

## Related

- [runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27](retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md) — Trap A. The CLI ambiguity that triggered this content-routing fallback in production. Both trapped together; both fixed in the same arc.
- [runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27](sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md) — sibling. Same investigation, same "helpful default silently broke a contract" shape.
- [runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md) — sibling. Same shape with gamescope `--backend auto` choosing the wrong backend.
- [design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27](../design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md) — generalized pattern. This trap is a fifth worked example: don't trust intermediaries to infer correctly when you can name the intent.
