---
title: nixpkgs retroarch-bare.passthru.wrapper silently injects -L coredir, breaking explicit-core launches
date: 2026-05-27
category: runtime-errors
module: nix/images/kiosk.nix
problem_type: runtime_error
component: tooling
symptoms:
  - "Pressing A on celeste-classic on Sobo opens RetroArch's cart browser instead of launching the game"
  - "Explicit `-L <core.so>` passed by the Korri launcher is silently ignored by RetroArch"
  - "`.p8.png` content routes to the built-in `image display` core regardless of the requested core"
  - "Actual argv seen by retroarch contains two `-L` flags: an injected coredir followed by the caller's core path"
  - "`cat $(which retroarch)` on the device reveals a shell script with hardcoded `-L <coredir> --appendconfig=<cfg>` injection"
root_cause: wrong_api
resolution_type: code_fix
severity: high
related_components: [retroarch-bare, libretro-fake-08, nixpkgs-passthru-wrapper, nix-symlinkJoin, korri-kiosk]
tags: [nix, retroarch, libretro, argv-injection, kiosk, packaging, symlinkjoin]
---

# nixpkgs retroarch-bare.passthru.wrapper silently injects -L coredir, breaking explicit-core launches

## Problem

`pkgs.retroarch-bare.passthru.wrapper { cores = ...; }` generates a shell wrapper that unconditionally prepends `-L <coredir> --appendconfig=<cfg>` to every `retroarch` invocation. When the Korri launcher passed its own `-L <core> <content>`, RetroArch saw two `-L` flags — the first one a directory, not a core file — its CLI parser failed to last-wins, and it fell back to extension-based content routing, picking the built-in `image display` core for `.png` cart files instead of the explicitly requested `fake08_libretro.so`.

## Symptoms

- **User-visible on Sobo (verbatim, commit `778845d`):** *"press A on celeste-classic shows a cart browser, not the game"*. RetroArch loaded its built-in `image display` core, which renders the `.p8.png` as an image with a file listing rather than running it through fake-08.
- **RetroArch verbose log:** RA's `--verbose` startup output reported it was loading `image display`, not `fake08_libretro.so`. RA was honestly reporting what it had been told; the lie lived one layer up in argv assembly.
- **Two `-L` flags in the effective argv:** `-L /nix/store/<hash>-retroarch-with-cores/lib/retroarch/cores` (injected by the wrapper, a directory) followed by `-L /nix/store/<hash>-libretro-fake-08/.../fake08_libretro.so` (from the launcher, a file).
- **`cat $(which retroarch)`** on-device revealed a shell script, not an ELF binary — the wrapper's `exec retroarch -L … --appendconfig=… "$@"` line was plainly visible.
- **Renaming `.p8.png` → `.p8` half-fixed the symptom.** It suppressed RA's extension-based image-display fallback but did not stop the wrapper's flag injection. The visible symptom moved while the underlying defect persisted.

## What Didn't Work

- **"Wrong core in library YAML."** Reviewed the launcher YAML; `core: fake08_libretro.so` was correct. Dead end.
- **"Core path resolution failure."** Stat'd the `.so` path on-device — file existed, executable, correct aarch64 ELF. Dead end.
- **"RetroArch verbose log is lying / RA bug."** RA was correctly reporting what it had been instructed to do; the deception lived one layer up in the wrapper shell script.
- **"Content extension mismatch."** Renamed `.p8.png` → `.p8` and the visible image-display fallback went away; but the underlying `-L <coredir>` injection was still happening. The symptom moved; the cause did not.
- **Reading the nixpkgs wrapper source wasn't done first.** The shell script was right there in `/nix/store` and would have surfaced the prepended flags immediately. Reading the binary you're invoking, before reading the binary's behavior, would have collapsed the investigation by hours.

## Solution

Commit `778845d`. Drop the nixpkgs `passthru.wrapper`, compose the package explicitly with `symlinkJoin`, and propagate `passthru.cores` + `passthru.unwrapped` so the kiosk closure-shape assertions keep matching.

`nix/images/kiosk.nix` (excerpted, with the inline rationale comment preserved):

```nix
# Minimal RetroArch closure for the kiosk: retroarch-bare (zero
# default cores) joined with exactly one libretro core
# (libretro-fake-08, PICO-8). We INTENTIONALLY do NOT use
# `pkgs.retroarch-bare.passthru.wrapper { cores = ...; }` here.
#
# That nixpkgs wrapper unconditionally prepends
#   -L <wrapper-out>/lib/retroarch/cores --appendconfig=<cfg>
# to every `retroarch` invocation. When our launcher then passes its
# own `-L <core> <content>`, RetroArch sees two `-L` flags AND the
# first one is a directory (not a core file). The CLI parser does
# not cleanly last-wins in that case: it routes by content extension
# and frequently picks the built-in `image display` core for `.png`
# files, ignoring the explicit `-L` we asked for. The user-visible
# symptom on Sobo was "press A on celeste-classic shows a cart
# browser, not the game".
#
# `symlinkJoin` exposes the bare retroarch binary AND the core .so on
# PATH / lib/retroarch/cores without injecting any flags. The
# closure-shape assertions in `nix/tests/korri-*-config-check.nix`
# match on `passthru.cores` + `passthru.unwrapped`, so we propagate
# both attributes here to keep the assertions valid.
#
# IMPORTANT: `cores` here intentionally contains exactly one entry.
# Korri ships RetroArch as a per-cart runtime, not as an emulator-
# of-everything; adding cores grows every kiosk image's closure for
# every user. New libretro cores should land as their own packages
# with their own kiosk opt-ins, not appended here. The closure-shape
# check guards this.
retroarchKiosk = pkgs.symlinkJoin {
  name = "korri-retroarch-fake-08";
  paths = [
    pkgs.retroarch-bare
    pkgs.libretro-fake-08
  ];
  passthru = {
    cores = [ pkgs.libretro-fake-08 ];
    unwrapped = pkgs.retroarch-bare;
  };
};
```

Paired with a stable, rebuild-safe absolute path so the launcher YAML doesn't bake a per-build nix-store hash into user data:

```nix
environment.etc."korri/cores/fake08_libretro.so".source =
  "${pkgs.libretro-fake-08}/lib/retroarch/cores/fake08_libretro.so";
```

`passthru.cores` + `passthru.unwrapped` are not decorative. `nix/tests/korri-rocknix-sm8550-config-check.nix` identifies the retroarch package on the compositor `PATH` by `builtins.hasAttr "cores" pt && builtins.hasAttr "unwrapped" pt` (matching on attrs rather than the pname, since nixpkgs pname carries version churn like `retroarch-with-cores-1.21.0`). The closure-shape assertions then check that there is exactly one retroarch wrapper, that `length wrapper.passthru.cores == 1`, and that `(head cores).core == "fake08"`. Propagating both attrs in the `symlinkJoin` keeps that guard intact under the new composition.

## Why This Works

nixpkgs's `retroarch-bare.passthru.wrapper` is the right entry point when you want curated cores baked in **and** auto-discovery driven by RA's own config — i.e. when the wrapper's injected `-L <coredir> --appendconfig=<cfg>` is part of the contract you want. It's the wrong entry point when your caller already names a core explicitly and expects an **unmodified argv contract** from `retroarch`. RA's CLI parser doesn't gracefully last-wins on duplicated `-L`; the wrapper's silent injection turns the launcher's explicit `-L <core.so>` into garbage.

`symlinkJoin` is the explicit-composition primitive: the output is exactly the union of two store paths' file trees, with no scripts spliced between the caller and the binary. The launcher's `retroarch -L <core> <content>` reaches RA's `main()` argv verbatim.

This is the third instance in the Korri codebase of the same shape: **don't accept a helpful-by-default wrapper when explicit composition is available.** See:
- The SSE idleTimeout fix ([runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27](sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md)) — same shape with `Bun.serve`'s implicit 10s `idleTimeout` default.
- The gamescope policy fix ([runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md)) — same shape with `--backend auto` choosing a backend you didn't ask for.
- The exposeWayland heuristic deletion ([design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27](../design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md)) — same shape with a composer-side heuristic sniffing child argv.

All four converge on: **helpers that inject implicit defaults are fine for opaque callers and wrong for explicit ones. When in doubt, compose, don't wrap.**

## Prevention

- **Closure-shape NixOS test (in place).** `nix/tests/korri-rocknix-sm8550-config-check.nix` already asserts the package shape on the compositor `PATH` via `passthru.cores` + `passthru.unwrapped`. Match on attributes, not pname — nixpkgs version suffixes drift.
- **Inline rationale in `nix/images/kiosk.nix`.** The comment block above is intentionally verbose so the next reader doesn't innocently switch back to `passthru.wrapper` for "simplicity." The trap is invisible without the comment.
- **Device-side smoke check.** Add a kiosk boot check (or one-shot systemd unit) that asserts `file $(realpath $(which retroarch))` does **not** report `shell script` — i.e. the on-PATH `retroarch` is an ELF, not a wrapper. Catches future regressions if someone reintroduces `passthru.wrapper` or swaps in a different cores helper.
- **Launcher-side argv assertion.** Have the launcher (or a tracer) log the exact argv it hands to `retroarch` and on first launch in a build verify RA's `--verbose` output names the core it was told to load. Mismatch = wrapper-trap regression.
- **Reviewer rule.** When nixpkgs exposes both `<pkg>` and `<pkg>.passthru.wrapper { ... }`, default to `<pkg>` plus explicit composition (`symlinkJoin`, `buildEnv`, a `wrapProgram` you wrote yourself). Reach for the upstream wrapper only when you actually want its injected flags, *or* when your caller is opaque enough that you can't pass `-L` yourself.

## Related

- [runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27](sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md) — sibling. Same investigation week, same "helper's implicit default silently broke a contract" shape.
- [runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md) — sibling. Same shape with gamescope `--backend auto` choosing the wrong backend.
- [design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27](../design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md) — generalized pattern. This trap is a fourth worked example.
- [runtime-errors/kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27](kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27.md) — Bug #0 of the same launch chain. The renderer wasn't even reaching sessiond; this trap was waiting one layer down once that was fixed.
- [tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27](../tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md) — channel-pin discipline. `passthru.wrapper` behavior is nixpkgs-version-coupled; we own this derivation rather than waiting for upstream.
- [architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27](../architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md) — integration point. `retroarchKiosk` is the package whose shape changed; `services.korri.sessiond.path` consumes it.
- `docs/plans/2026-05-26-010-feat-libretro-fake-08-derivation-plan.md` — original plan; its `passthru.wrapper` decision is superseded by this trap. See refresh annotation at the top of that plan.
