---
title: "feat: Vendor SDL2-korri with Batocera mali video driver patch"
type: feat
status: superseded
superseded_by: docs/solutions/integration-issues/moonlight-first-light-on-trimui-brick-knulli-needs-vendor-egl-gles-shim-over-libglvnd-2026-05-29.md
date: 2026-05-28
verify_command: "nix build --no-link .#packages.x86_64-linux.SDL2-korri .#packages.x86_64-linux.moonlight-embedded-korri && nix build --no-link .#checks.x86_64-linux.korri-package-outputs .#checks.x86_64-linux.korri-moonlight-control-protocol-patch"
related_plans:
  - docs/plans/2026-05-28-002-spike-trimui-brick-bringup-plan.md
related_docs:
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md
  - docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md
  - docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md
related_handoffs:
  - /tmp/handoff-ca3WlA.md     # original Brick-bringup focus
  - /tmp/handoff-MbYw5O.md     # parallel closure-hygiene work, separate session
---

# feat: Vendor SDL2-korri with Batocera mali video driver patch

> **Status: superseded.** Spike on 2026-05-29 against the TRIMUI Brick produced a clean
> visible Moonlight stream on the Brick panel (first light) using **stock Knulli
> `/usr/bin/moonlight` 2.7.0**, not anything we vendored. The right recipe is: stop
> EmulationStation before launch (so moonlight owns `/dev/fb0` alone; the earlier
> "garbled" image was actually ES + moonlight ping-ponging the FB at ~2 Hz),
> `SDL_AUDIODRIVER=dummy` (to bypass the ALSA->pipewire init failure that otherwise
> tears the whole stream down), and a Knulli-shaped config at `1280x720@60 sops=true`.
>
> The four SDL2-korri commits on `perf/moonlight-closure` (a) do not actually deliver a
> mali video driver (the Batocera patch we copied is only the configure / macro / EGL-init
> slice; the real driver source files are multi-file and were not included), and (b) are
> not needed for first light — Knulli's stock `/usr/lib/libSDL2-2.0.so.0` is what does the
> work. They are left on the branch as portable-parity dead code per the spike outcome.
>
> Our own `moonlight-embedded-korri` 2.7.1 build *also* produces first light on the
> Brick once the vendor PowerVR `libEGL.so.1` / `libGLESv2.so.2` (from Knulli's
> `/usr/lib/`) are shimmed onto the dynamic linker path ahead of `nixpkgs libglvnd`. The
> earlier framing of a "moonlight 2.7.0 -> 2.7.1 SDL window-create regression" was
> wrong: upstream `src/video/sdl.c` is byte-identical between v2.7.0 and v2.7.1, none of
> our patches touch it, and the `SDL: could not create window - exiting` failure was
> entirely caused by `nix's libglvnd` shadowing the vendor EGL/GLES driver stack. See
> the linked solution doc for the verified recipe and the full evidence.

## Summary

Add a Korri-downstream `SDL2-korri` derivation (real SDL2 from `libsdl-org/SDL` tag `release-2.32.8` with the Batocera mali video driver patch applied additively on top of the standard wayland / x11 / kmsdrm / vulkan driver set), wire it through the Korri overlay as the `SDL2` argument to `moonlight-embedded-korri`, and prove a Sunshine→Brick stream end-to-end via `-platform sdl`. The patch reaches every Korri moonlight consumer (x86 kiosk, SM8550 Thor / Sobo / Odin2, TRIMUI Brick) as a single binary that picks the right driver at runtime per host.

---

## Problem Frame

The TRIMUI Brick Path A spike (see related spike plan U4–U5) shipped the moonlight-embedded-korri closure to the device and proved every layer of the binary works end-to-end against aka Sunshine — except `SDL_CreateWindow`. The closure binary runs `-platform fake` to "Received first video packet" cleanly; `-platform sdl` fails immediately at `SDL: could not create window - exiting`.

Root cause discovered mid-spike: `nixpkgs.SDL2` is now an alias for `sdl2-compat-2.32.60` (an SDL2-on-SDL3 shim) which ships only `wayland / kmsdrm / opengles` video drivers. The Brick (PowerVR GE8300 + Allwinner H700) has **no KMS connectors at all** — `pvrsrvkm` exposes `/dev/dri/card0` as a render-only node and the actual display is `dc_sunxi` → `/dev/fb0`. None of sdl2-compat's drivers can create a window on this hardware. The previous `pkgs.SDL2_classic` real-SDL2 attribute was removed from nixpkgs in 2025-05.

Stock Knulli ships a real SDL2 `release-2.32.8` from `libsdl-org/SDL` with the Batocera `sdl2_add_video_mali_gles2.patch` applied — that's what their `/usr/bin/moonlight` uses to draw to fbdev. We need a Nix-tracked equivalent so the Brick's **Nix closure** stops depending on Knulli's vendored userspace at build time and Korri owns the patch lineage. The runtime environment still resolves `libEGL` / `libGLES` against Knulli's `/usr/lib` blobs via `LD_LIBRARY_PATH=/tmp/mali-shim` — full Korri-tracked PowerVR userspace is a follow-up package (see Deferred to Follow-Up Work).

A secondary frame: the user's stated preference is to maximize the patches that are processor-independent so every client receives every customization benefit. The broad-driver build (one SDL2 binary with mali additive on top of the standard driver set) cleanly satisfies that intent — x86 kiosk and SM8550 keep using kmsdrm at runtime; the Brick picks mali; all three are the same binary.

---

## Requirements

- R1. Build a real (non-`sdl2-compat`) SDL2 at the exact commit Knulli ships (`libsdl-org/SDL` tag `release-2.32.8`, commit `98d1f3a45`) with the Batocera mali video driver patch applied. The build must succeed on `x86_64-linux` and `aarch64-linux`.
- R2. The compiled SDL2 must register `mali` as a video driver alongside `wayland`, `x11`, `kmsdrm`, and `vulkan`. The configure summary must list `wayland x11 kmsdrm vulkan mali opengl_es1 opengl_es2 dummy offscreen`. The installed `SDL_config.h` must define `SDL_VIDEO_DRIVER_MALI`, `SDL_VIDEO_DRIVER_KMSDRM`, `SDL_VIDEO_DRIVER_WAYLAND`, and `SDL_VIDEO_DRIVER_X11`.
- R3. The Korri overlay at `nix/overlays/korri-packages.nix` must point `moonlight-embedded`'s `SDL2` argument at `SDL2-korri`. `pkgs.SDL2` (the global alias) must continue to resolve to upstream `sdl2-compat` for unrelated nixpkgs consumers. The new derivation must be exposed as a top-level Korri flake package output (`packages.<system>.SDL2-korri`).
- R4. After the swap, the moonlight-embedded-korri closure must reference `SDL2-korri-*` and must contain no reference to `sdl2-compat-*`. Other Korri packages (`sunshine-korri`, `korri-desktop` variants, `libretro-fake-08`) keep their existing SDL2 resolution unchanged.
- R5. The aarch64-linux closure must build on fuji (the project's aarch64 builder), be chunked-shipped to the Brick using the existing recipe, and produce a visible stream from aka Sunshine (`192.168.1.117`) under `moonlight stream <aka-ip> -platform sdl -app "Desktop"` for at least 30 s. "Visible" means any picture on `/dev/fb0` — garbled is acceptable (pixel-format/stride correction is out of scope; stock Knulli moonlight exhibits the same garble).
- R6. A Brick-delta learning doc captures the SDL2-korri shape and the broad-build rationale as a sibling to the existing moonlight-bringup pattern, not a rewrite.

---

## Scope Boundaries

- The patch only modifies SDL2 source code (`src/video/SDL_egl.c`, `src/video/kmsdrm/SDL_kmsdrmopengles.c`, `include/SDL_config.h.in`, `configure` / `configure.ac`). No moonlight-embedded-korri source change.
- The moonlight overlay swap is narrow: `moonlight-embedded.SDL2 = SDL2-korri`. `pkgs.SDL2` stays as upstream `sdl2-compat`.
- No on-device retest of x86 kiosk or SM8550 (Thor / Sobo / Odin2) moonlight in this plan. The overlay change reaches them; verification stops at the x86 build evidence (configure summary, library presence, closure references).
- Brick verification uses the **existing** chunked-transfer + busybox-tar-symlink-replay recipes. No new shipping mechanism in this plan.
- "Success" on the Brick is "any picture appears" — driver activation proof, not pixel-correctness proof.

### Deferred to Follow-Up Work

- **Step 7 / global `pkgs.SDL2` substitution.** Replacing the upstream `sdl2-compat` shim with `SDL2-korri` for every Korri overlay consumer (sunshine-korri, korri-desktop, libretro cores). This is a strict superset opportunity but a wider blast radius; separate decision after R5 proves the narrow swap works on the Brick.
- **moonlight-embedded-korri closure hygiene** (drop `CMakeCache.txt` from `$out`, switch to `ffmpeg-headless`, investigate the duplicate ffmpeg). Handed off to a parallel session via `/tmp/handoff-MbYw5O.md`. Independent of this plan; either lands first without conflicts.
- **Vendoring PowerVR GE8300 userspace blobs** as `packages/powervr-ge8300-userspace/`. Today SDL2-korri's `libEGL` resolution falls through to whatever the device's `/usr/lib/libEGL.so` exposes; that's Knulli's vendored blob. A Korri-tracked userspace lives behind this plan.
- **Pixel-format / stride garble** that stock Knulli moonlight exhibits. Downstream of SDL2; separate spike.
- **Hardware-accelerated decode on the Brick** (cedrus v4l2m2m → DMABUF → fb0). Separate plan / Path C per the original handoff.
- **Brick `/nix` bind-mount persistence service** and **`system.es.atstartup=1` restoration after spike**. Owned by `docs/plans/2026-05-28-002-spike-trimui-brick-bringup-plan.md`, not this SDL2 vendoring plan.

---

## Context & Research

### Relevant Code and Patterns

- `packages/libretro-fake-08/package.nix` — closest precedent for a Korri-vendored library derivation with a manifest-bearing `postInstall`. Same shape we extend for SDL2-korri.
- `packages/moonlight-embedded-korri/package.nix` — the consumer being rewired; takes `SDL2` as a callPackage argument (line 23). The overlay swap intercepts that arg.
- `nix/overlays/korri-packages.nix` — the single seam where Korri-downstream substitutions live (currently handles `moonlight-embedded`, `sunshine`, `libretro-fake-08`).
- `flake.nix` — `sdl2MaliFbdev` / `SDL2-mali-fbdev` already wired through `commonPackages`/`packages` from the in-session prototype build; rename to `sdl2Korri` / `SDL2-korri`.
- `nix/tests/korri-package-outputs-check.nix` — asserts each Korri-vendored package exposes its expected outputs. SDL2-korri needs an entry (assert `lib/libSDL2-2.0.so.0`).

### Institutional Learnings

- `docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md` — the R36T MAX origin pattern; the Brick learning doc R6 produces is a sibling delta, not a rewrite.
- `docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md` — the chunked-ship recipe U4 invokes verbatim. Has an outstanding edit pending about `tar -h` symlink dereferencing (flagged in `/tmp/handoff-ca3WlA.md`); not this plan's job to fix.
- `docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md` — the symlink-replay step that mandatorily follows chunked extract on Knulli's busybox tar.
- `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` — the Path-A staging frame this plan lives inside.

### External References

- Batocera mali patch (canonical): `https://github.com/batocera-linux/batocera.linux/blob/master/board/batocera/patches/sdl2/sdl2_add_video_mali_gles2.patch` — 115 lines, additive only. Already saved at `/tmp/batocera-sdl2/sdl2_add_video_mali_gles2.patch` and copied to `packages/SDL2-mali-fbdev/patches/` from the in-session prototype.
- `libsdl-org/SDL` tag `release-2.32.8` — confirmed on-device by reading `SDL-release-2.32.8-0-g98d1f3a45` out of Knulli's `/usr/lib/libSDL2-2.0.so.0` build-id strings.

---

## Key Technical Decisions

- **Patch lives in SDL2, not moonlight.** The patch modifies SDL2 source files (`src/video/SDL_egl.c`, `src/video/kmsdrm/SDL_kmsdrmopengles.c`). No moonlight code path could add a video driver to SDL2. Cross-package patching is also an anti-pattern (you'd have to vendor SDL2 source into moonlight's tree).
- **Broad driver build, narrow overlay swap.** One SDL2 with wayland + x11 + kmsdrm + vulkan + mali compiled in (`--enable-*-shared` so unused backends dlopen lazily). The overlay only swaps SDL2 for moonlight-embedded; `pkgs.SDL2` stays as upstream `sdl2-compat` so Sunshine / desktop / libretro cores keep their existing resolution. Reasoning: the mali patch is additive (one `#define`, two `#ifdef` branches, doesn't subtract drivers); breaking the upstream alias for every consumer is a wider blast radius than the Brick alone justifies (see Deferred for step 7).
- **Source pin: `libsdl-org/SDL` tag `release-2.32.8`.** Matches Knulli's exact commit `98d1f3a45`. Use `fetchFromGitHub` with SRI hash; no flake input needed since the tag is immutable.
- **Build system: autotools, not CMake.** The Batocera patch modifies the generated `configure` script directly (alongside `configure.ac`). Running `autoreconf` would strip the configure-level mali hunks. Use the shipped `configure` as-is.
- **Drop `-DEGL_API_FB` from CFLAGS.** Cosmetic-only when SDL2 builds against `libglvnd` headers — libglvnd's EGL.h doesn't react to it. The vendor PowerVR `libEGL` on the Brick was already built with the define on the device side; SDL2 doesn't need to know.
- **On-disk rename `packages/SDL2-mali-fbdev/` → `packages/SDL2-korri/`.** "mali-fbdev" was correct for the narrow prototype but misleading for the broad build. Korri downstream conventions match `moonlight-embedded-korri` / `sunshine-korri` / `libretro-fake-08`.
- **Verification posture: x86 build evidence is sufficient before the aarch64 ship.** The configure summary + library presence + closure-references check catch every plan-time risk. SM8550 / x86 kiosk get no separate device retest in this plan — the overlay change reaches them but they were already using `sdl2-compat` which is a strict subset.

---

## Open Questions

### Resolved During Planning

- **Patch in moonlight or SDL2?** SDL2 — moonlight has no code path that adds a video driver.
- **Narrow (mali-only) vs broad (mali + standard drivers) build?** Broad — patches are additive; one binary across the fleet.
- **Global `pkgs.SDL2` swap (step 7)?** Deferred — separate decision after the narrow swap proves on the Brick.
- **`fetchFromGitHub` SRI hash for `release-2.32.8`:** `sha256-GKJxA6P1bMCn8hW6kSIkGLOslnKmrr/0MbFA9UQk6LA=` (recorded from the in-session x86 build).
- **Build system:** autotools (Batocera patch targets the generated `configure`).

### Deferred to Implementation

- **Whether any `configure.ac` mali hunk needs adjustment for 2.32.x.** The in-session x86 build at narrow scope succeeded with the patch as-shipped; broad-build should behave the same, but the wayland/x11 hunks in `CheckKMSDRM`'s neighborhood are the most likely place for fuzz. Decision deferred to U1's build phase — if `patch` reports fuzz, hand-adapt the hunks.
- **`configureFlags` for the broad build's exact wayland / x11 / vulkan options.** Mirror nixpkgs `SDL2_classic`'s pre-removal flag set as the reference; adjust to drop anything the Brick provably doesn't need. Decision deferred to U1.
- **Which `-platform` does `korri-desktop-x86-kiosk` invoke for moonlight?** If `-platform sdl`, the patched SDL2 paths (GLES2 forcing in `SDL_kmsdrmopengles.c` and the modified EGL display init in `SDL_egl.c`) are reached on x86 with Mesa+kmsdrm, and SM8550's v4l2m2m-bypass argument does not transfer. If `-platform ffmpeg_drm` (or other non-SDL), the broad-build patched paths are bypassed on x86 as well and the SDL2 broad-build is essentially invisible to x86 kiosk at runtime. Resolve before U4. Source of truth: the kiosk command-line in `korri-desktop-x86-kiosk` / its launcher script.

---

## Implementation Units

### U1. Rename and broaden the SDL2-korri derivation

**Goal:** Replace the narrow `packages/SDL2-mali-fbdev/` prototype with a `packages/SDL2-korri/` derivation that builds a real SDL2 `release-2.32.8` with the Batocera mali patch additively on top of wayland + x11 + kmsdrm + vulkan + opengles drivers. Single binary across the fleet.

**Requirements:** R1, R2

**Dependencies:** none (in-session prototype already proved the narrow build path; this unit broadens it)

**Files:**
- Move: `packages/SDL2-mali-fbdev/` → `packages/SDL2-korri/`
- Modify: `packages/SDL2-korri/package.nix`
- Keep as-is: `packages/SDL2-korri/patches/sdl2_add_video_mali_gles2.patch`

**Approach:**
- Rename `pname` to `SDL2-korri`. Keep `version` aligned to the upstream tag (`2.32.8-korri` or similar — pick a scheme consistent with other Korri-suffixed packages).
- Enable `--enable-video-wayland`, `--enable-video-x11`, `--enable-video-vulkan` alongside the already-enabled `--enable-video-mali`, `--enable-video-kmsdrm`, `--enable-video-opengles`, `--enable-video-opengles2`. Use `--enable-wayland-shared`, `--enable-x11-shared`, `--enable-kmsdrm-shared` so unused backends dlopen at runtime, not link-time.
- Add wayland and X11 buildInputs (`wayland`, `wayland-protocols`, `libxkbcommon`, `xorg.libX11`, `xorg.libXext`, `xorg.libXcursor`, `xorg.libXi`, `xorg.libXrandr`, `xorg.libXScrnSaver`, `xorg.libXxf86vm`, `xorg.xorgproto`, `vulkan-loader`, plus the existing alsa-lib / libpulseaudio / libdrm / libevdev / libglvnd / systemdMinimal / dbus set). `wayland-scanner` in `nativeBuildInputs`.
- Drop `-DEGL_API_FB` from `NIX_CFLAGS_COMPILE` — cosmetic against libglvnd headers.
- Keep the verbose top-of-file comment explaining why this derivation exists, the patch lineage, and the broad-driver build rationale. Update it to reflect the rename and the dropped EGL_API_FB note.
- Keep the `postInstall` provenance manifest (`$out/nix-support/SDL2-korri/manifest.txt`) recording `upstream-tag`, `upstream-rev` (`98d1f3a45`), and `mali-patch` source.

**Patterns to follow:**
- `packages/libretro-fake-08/package.nix` — provenance manifest shape and `strictDeps` posture.
- `packages/moonlight-embedded-korri/package.nix` — the verbose top-of-file comment style explaining Korri-downstream rationale.

**Test scenarios:**
- *Happy path:* `nix build .#packages.x86_64-linux.SDL2-korri` succeeds; build log shows `SDL2 Configure Summary: Video drivers : dummy offscreen wayland x11 kmsdrm vulkan mali opengl_es1 opengl_es2`.
- *Happy path:* `$out/include/SDL2/SDL_config.h` defines `SDL_VIDEO_DRIVER_MALI`, `SDL_VIDEO_DRIVER_KMSDRM`, `SDL_VIDEO_DRIVER_WAYLAND`, and `SDL_VIDEO_DRIVER_X11`.
- *Happy path:* `$out/lib/libSDL2-2.0.so.0` exists; `$out/nix-support/SDL2-korri/manifest.txt` records the upstream-tag and mali-patch.
- *Edge:* the patch applies without fuzz on `release-2.32.8` source (build log shows `applying patch ... patching file src/video/SDL_egl.c` with no `Hunk #N FAILED` lines). If fuzz appears, hand-adapt the offending hunk.
- *Edge:* `nm -D $out/lib/libSDL2-2.0.so.0 | grep -iE 'wayland|x11|kmsdrm'` returns symbols (proves the additional drivers compiled in, not just listed by configure).

**Verification:**
- `nix build --no-link .#packages.x86_64-linux.SDL2-korri` completes successfully.
- Configure summary lists every expected video driver.
- The four `SDL_VIDEO_DRIVER_*` defines are set in the installed `SDL_config.h`.

---

### U2. Wire SDL2-korri through the overlay and expose the flake output

**Goal:** Update `nix/overlays/korri-packages.nix` and `flake.nix` to expose `SDL2-korri` as a Korri-overlay attribute and as a top-level flake package, and route `moonlight-embedded`'s `SDL2` argument to it. Keep `pkgs.SDL2` unchanged (still resolves to upstream `sdl2-compat`).

**Requirements:** R3, R4

**Dependencies:** U1

**Files:**
- Modify: `nix/overlays/korri-packages.nix` (rename `SDL2-mali-fbdev` attribute → `SDL2-korri`, update the moonlight `SDL2` arg to `final.SDL2-korri`, update the inline comment explaining the seam)
- Modify: `flake.nix` (rename `sdl2MaliFbdev` / `SDL2-mali-fbdev` package output → `sdl2Korri` / `SDL2-korri`)

**Approach:**
- The narrow swap stays where the in-session prototype put it: at the `SDL2` callPackage argument to `moonlight-embedded` only. `pkgs.SDL2` is not redefined.
- Document the seam in `nix/overlays/korri-packages.nix` with the same depth as the existing `sunshine` / `libretro-fake-08` comments: why we narrow-swap, why we don't touch `pkgs.SDL2` (yet), what changing the surface would imply (step 7 deferred).
- The flake package output gives anyone running `nix build .#SDL2-korri` access to the standalone derivation for verification and ad-hoc inspection.

**Patterns to follow:**
- `nix/overlays/korri-packages.nix` existing `moonlight-embedded` / `sunshine` / `libretro-fake-08` block.
- `flake.nix` existing `moonlightEmbeddedKorri` / `sunshineKorri` / `libretroFake08` output shape.

**Test scenarios:**
- *Happy path:* `nix eval --raw .#packages.x86_64-linux.SDL2-korri.drvPath` returns a drv path (output exists).
- *Happy path:* `nix eval --raw .#packages.x86_64-linux.moonlight-embedded-korri.buildInputs --apply 'inputs: builtins.concatStringsSep " " (map (i: i.name or "?") inputs)'` lists `SDL2-korri-*` (not `sdl2-compat-*`).
- *Edge:* `nix eval --raw '(import (builtins.getFlake (toString ./.)).inputs.nixpkgs { system = "x86_64-linux"; overlays = [ (import (toString ./.) + "/nix/overlays/korri-packages.nix") { inherit (... ) nix-on-rocks fake-08-src; } ]; }).SDL2.pname'` returns `sdl2-compat` (proves `pkgs.SDL2` is NOT redefined by the overlay).
- *Integration:* `nix build --no-link .#packages.x86_64-linux.moonlight-embedded-korri` succeeds and `nix-store -q --references "$out" | grep -E 'SDL2'` shows only `SDL2-korri-*` (no `sdl2-compat-*`).

**Verification:**
- `moonlight-embedded-korri`'s closure references `SDL2-korri-*` and does not reference `sdl2-compat-*`.
- `pkgs.SDL2` (read through a synthesized `pkgs` import) still resolves to `sdl2-compat`.

---

### U3. Extend the package-outputs check with file-presence AND closure-reference assertions for SDL2-korri

**Goal:** Extend `nix/tests/korri-package-outputs-check.nix` with two new assertions so the SDL2-korri shape AND R4's closure-reference invariant are gated automatically. Also extend `nix/tests/korri-moonlight-closure-hygiene-check.nix` (added by the parallel `perf/moonlight-closure` session) with the forbid-patterns that the SDL2 swap unlocks. Confirm the existing patch-presence checks (`korri-sunshine-runtime-bitrate-patch`, `korri-moonlight-control-protocol-patch`) still pass against the new moonlight closure.

**Requirements:** R3, R4

**Dependencies:** U2; also depends on `perf/moonlight-closure` having merged to `trunk` so the `korri-moonlight-closure-hygiene-check.nix` file exists — if the branch is unmerged at U3 time, rebase first or carry the closure-hygiene file forward into the SDL2 work.

**Files:**
- Modify: `nix/tests/korri-package-outputs-check.nix` (two new `check` entries described below).
- Modify: `nix/tests/korri-moonlight-closure-hygiene-check.nix` (extend the forbid-pattern list).

**Approach:**
- **File-presence assertion** (mirrors existing pattern): assert `lib/libSDL2-2.0.so.0` exists in `packages.SDL2-korri`. Same `builtins.pathExists` shape as the existing `korri-portal` / `korri-inputd` entries.
- **Closure-reference assertion** (new shape for this check file): assert that `moonlight-embedded-korri`'s runtime closure references an `SDL2-korri-*` path and does NOT reference any `sdl2-compat-*` path. The check derivation runs `nix-store -q --references` against the moonlight-embedded-korri output path and grep-asserts both invariants. This closes the gap where R4 would otherwise be gated only by a manual one-liner in U2's test scenarios.
- The closure-reference assertion runs against the moonlight package output path, not the moonlight derivation — the check file already takes `packages` as an argument, so the same `packagePath "moonlight-embedded-korri"` accessor works.
- **Closure-hygiene check extension**: `nix/tests/korri-moonlight-closure-hygiene-check.nix` already forbids gcc / cmake / binutils / maximalist-ffmpeg from the moonlight closure (added by the `perf/moonlight-closure` parallel session). The SDL2 swap unlocks eviction of the entire `sdl2-compat` → gst-plugins-bad → gtk / flite / freepats / gstreamer chain. Extend the forbid-pattern list with the patterns the closure-hygiene handoff specified: `-flite-[0-9]`, `-freepats-[0-9]`, `-gtk\+3-[0-9]`, `-gtk4-[0-9]`, `-libadwaita-[0-9]`, `-zenity-[0-9]`, `-gstreamer-[0-9]`, `-gst-plugins-(base|bad|good)-[0-9]`, `-python3-[0-9][0-9.]*$`. The trailing `$` on the python3 pattern is intentional — it scopes the forbid to bare `python3-3.13.12` and not to legitimate `python3-tkinter` or similar that might appear in future closures.
- The other check derivations should pass unchanged. If they fail, debug there before continuing.

**Patterns to follow:**
- `nix/tests/korri-package-outputs-check.nix` existing assertion shape for file-presence (`builtins.pathExists`).
- `nix/tests/korri-moonlight-control-protocol-patch-check.nix` for an example of a check derivation that inspects package contents via a `runCommand` derivation rather than a pure assertion list — the closure-reference assertion may need this richer shape because `nix-store -q --references` is a runtime command, not a pure Nix expression.

**Test scenarios:**
- *Happy path:* `nix build --no-link .#checks.x86_64-linux.korri-package-outputs` succeeds.
- *Happy path:* `nix build --no-link .#checks.x86_64-linux.korri-moonlight-control-protocol-patch` succeeds (binary still ships, patches still apply, manifest intact).
- *Happy path:* `nix build --no-link .#checks.x86_64-linux.korri-sunshine-runtime-bitrate-patch` succeeds.
- *Error path:* deliberately renaming the SDL2-korri output path (e.g. `lib/libSDL2-2.0.so.0` → `lib/missing.so`) makes the package-outputs check fail with the new SDL2-korri file-presence assertion message (proves the new check is wired).
- *Error path:* deliberately reverting U2's overlay swap (so moonlight links against upstream `pkgs.SDL2` again) makes the package-outputs check fail with the closure-reference assertion message (`sdl2-compat-*` reference detected; expected `SDL2-korri-*`). This proves the R4 gate actually catches the regression it's meant to catch.
- *Integration:* if a future buildInput transitively pulls `sdl2-compat` back into the moonlight closure, the closure-reference assertion fails at `just test-nix` time, not at the next on-device test.
- *Integration:* if any of the sdl2-compat → gst-plugins-bad chain (flite, freepats, gtk+3, gtk4, gstreamer, python3, etc.) reappears in the moonlight closure via a future buildInput, `korri-moonlight-closure-hygiene-check` fails with the offending pattern named, proving the closure-hygiene gate caught the regression at check time.

**Verification:**
- `just test-nix` (or the underlying `nix build .#checks.x86_64-linux.korri-standard-native` aggregate) passes.
- The closure-reference assertion's failure-mode test (revert U2 → expect failure) confirms R4 is now gated automatically rather than relying on the U2 manual one-liner.

---

### U4. Build aarch64 SDL2-korri + moonlight on fuji and chunked-ship to the Brick

**Goal:** Run the aarch64 build on fuji, regenerate the chunked-transfer manifest against the new closure, ship to the Brick at `192.168.1.167`, and re-bind `/nix` → `/userdata/nix` (lost on the Brick's reboot since the in-session prototype run).

**Requirements:** R5

**Dependencies:** U1, U2, U3 (must be on `trunk` or fuji-reachable branch)

**Files:**
- No repo changes in this unit — it's a deploy step against the artifacts U1/U2 produce.
- Reuses scripts and one-liners captured in `docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md` and `docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md`.

**Approach:**
- On fuji: `cd /tmp/korri-m1/src && git pull && nix build --no-link --print-out-paths .#packages.aarch64-linux.moonlight-embedded-korri`.
- Recompute closure paths and the symlink manifest from the new outPath.
- Re-bind `/nix` → `/userdata/nix` on the Brick if `mountpoint /nix` reports it's unmounted (it was after the last reboot per session findings).
- Ship the new chunks (delta from previously shipped: roughly +5–10 MB for the additional video driver code; most of the closure remains identical).
- Replay symlinks per the busybox-tar-replay recipe.

**Patterns to follow:**
- `docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md` — 40-path chunks, fresh SSH per chunk.
- `docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md` — symlink-replay step.

**Test scenarios:**
- *Happy path:* fuji aarch64 build emits a new outPath under `/nix/store/...-moonlight-embedded-korri-*`.
- *Happy path:* `ssh root@192.168.1.167 'find /userdata/nix/store -name "libSDL2-2.0.so.0*" -ls'` shows the SDL2-korri-aarch64 library landed.
- *Happy path:* `ssh root@192.168.1.167 'find /userdata/nix/store -type l | wc -l'` matches builder count within ±2% (busybox-tar-replay invariant).
- *Edge:* if the WiFi association flakes mid-chunk, the chunked-transfer recipe's resume logic handles it; do not improvise a new shipping mechanism here.
- *Error path:* if `/nix` bind-mount restoration is forgotten, the binary will fail to resolve ld-linux at runtime in U5 — the U5 launcher output will say "no such file or directory" pointing at a `/nix/store/...` path. Re-bind and retry.

**Verification:**
- Closure shipped, symlink count matches, no missing-path warnings.
- `ssh root@192.168.1.167 '<store-path-to>/bin/moonlight --help'` produces a clean usage banner (proves ld-linux + LD_LIBRARY_PATH still resolve).

---

### U5. Brick on-device stream test against aka Sunshine

**Goal:** Drive the new SDL2-korri-linked moonlight binary on the Brick against aka Sunshine and observe any picture on the Brick's display. "Any picture" is the success bar — garbled is fine and is the same downstream issue stock Knulli moonlight exhibits.

**Requirements:** R5

**Dependencies:** U4

**Files:**
- No repo changes.
- May produce `out/tmp/brick-ssh/stream-<timestamp>.log` for the session's own records.

**Approach:**
- Verify `system.es.atstartup=0` is still set (it was made persistent in the prior session; sanity-check, don't change).
- Verify `/nix` is bind-mounted to `/userdata/nix`.
- Create (or recreate) the `/tmp/mali-shim/` symlink set. The shim is needed because the SDL2-korri binary uses `dlopen` for libEGL / libGLES and needs them resolvable on `LD_LIBRARY_PATH`; the only place those PowerVR blobs exist on the Brick is Knulli's `/usr/lib`. The shim is recreated each run from the device's current `/usr/lib` so it tolerates Knulli updates:

  ```bash
  ssh root@192.168.1.167 'mkdir -p /tmp/mali-shim && \
    for lib in $(ls /usr/lib | grep -iE "^lib(EGL|GLES|pvr|srv).*\.so(\.[0-9]+)*$"); do \
      ln -sf /usr/lib/$lib /tmp/mali-shim/$lib; \
    done && ls /tmp/mali-shim/'
  ```

  The regex pattern targets the four library families that matter: `libEGL.*`, `libGLES.*`, `libpvr*` (PowerVR userspace), and `libsrv*` (PowerVR services glue). Adjust the pattern only if a future Knulli release renames blobs out of those prefixes. **This one-liner is the durable source of truth for the mali-shim procedure** — U6's learning doc will lift it verbatim rather than reinvent it.
- Run: `nohup env SDL_VIDEODRIVER=mali LD_LIBRARY_PATH=/tmp/mali-shim:/lib /userdata/nix/store/<new-moonlight-outpath>/bin/moonlight stream -app Desktop -platform sdl -verbose 192.168.1.117 > /tmp/stream.log 2>&1 &`.
- Observe the Brick's display for any picture.

**Patterns to follow:**
- The launcher script template documented in `docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md`.
- The prior session's mali-shim setup notes carried in handoff `/tmp/handoff-ca3WlA.md`.

**Test scenarios:**
- *Happy path:* `/tmp/stream.log` shows "Connection established" and "Received first video packet" with no SDL window-create error; the Brick's LCD shows the Sunshine desktop (garbled is acceptable).
- *Happy path:* the SDL2-korri binary picks `mali` as its video driver (`/tmp/stream.log` `-verbose` output mentions `SDL_VIDEODRIVER=mali` or `SDL initialized using driver "mali"`).
- *Edge:* if the stream connects but no picture appears for >15 s, capture `dmesg | tail -50`, `cat /tmp/stream.log`, and the `find /sys/devices/.../drm* -name "name" -exec cat {} +` snapshot before iterating. Do not escalate to `-platform ffmpeg_drm` here — that's outside this plan's scope.
- *Edge:* if the binary picks `dummy` or `offscreen` instead of `mali`, the mali driver wasn't selected as a fallback target — set `SDL_VIDEODRIVER=mali` explicitly (the env var override forces the choice).
- *Error path:* if `SDL_CreateWindow` still fails ("could not create window"), the mali code path didn't activate. Compare `nm -D <outpath>/lib/libSDL2-2.0.so.0` for the mali-related symbols; if missing, U1's broad build silently dropped the mali driver — return to U1 and audit configure flags.

**Verification:**
- Brick LCD shows a Sunshine desktop frame, even garbled, for at least 30 s.
- `moonlight` exits 0 on disconnect, log file contains no SDL error lines.

---

### U6. Capture a Brick-delta learning doc

**Goal:** Sibling solution doc under `docs/solutions/best-practices/` recording the SDL2-korri shape, the broad-build rationale, and the Brick-specific deltas vs the R36T MAX moonlight bringup. Avoid duplicating content already in the R36T MAX doc — focus on what's new.

**Requirements:** R6

**Dependencies:** U5 (success or documented failure)

**Files:**
- Create: `docs/solutions/best-practices/moonlight-embedded-on-powervr-ge8300-handheld-via-sdl2-korri-2026-05-XX.md` (final date fixed at write time)

**Approach:**
- Mirror the YAML frontmatter shape of the related-doc set (`title`, `date`, `category`, `module`, `problem_type`, `component`, `severity`, `applies_when`, `tags`, `related_components`).
- Body topics:
  - Why `nixpkgs.SDL2` (sdl2-compat) cannot create a window on fbdev-only handhelds.
  - The Batocera mali patch's mechanism in one paragraph (the additive-define + EGL platform-display path + GLES2 forcing in the kmsdrm code).
  - Why broad-build (every driver compiled, mali on top) is the right shape vs narrow build (mali-only).
  - The overlay seam choice (moonlight-only swap, not `pkgs.SDL2` global).
  - The `/tmp/mali-shim/` requirement and what it points at on the Brick.
- Cross-link the existing four learning docs in `related_components`.
- Use the `se-compound` Lightweight mode framing — don't rewrite, augment.

**Patterns to follow:**
- Frontmatter shape of `docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md`.
- Sibling-doc precedent: `docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md` is a sibling to its R36T MAX origin in the same way.

**Test scenarios:**
- Test expectation: none — documentation-only unit, no behavior change. Quality bar is the doc passes `se-doc-review` if invoked.

**Verification:**
- Doc exists, frontmatter validates, content does not duplicate the R36T MAX doc verbatim.
- The four cross-links resolve.

---

## System-Wide Impact

- **Interaction graph:** Every consumer of `pkgs.moonlight-embedded` gets the new binary — x86 kiosk (`korri-desktop-x86-kiosk`), SM8550 Thor / Sobo / Odin2 (`nixosConfigurations.korri-rocknix-kiosk-*`), and Brick deploys. The aarch64 SM8550 closures will rebuild on next `nix build`; cache hit rate drops once for these targets.
- **Error propagation:** SDL2-korri broadens the driver set; at runtime SDL still falls back through its standard probe order. If a host has neither wayland nor x11 nor kmsdrm nor mali available, SDL falls back to `dummy` and `SDL_CreateWindow` fails — same as today, no new failure mode introduced.
- **State lifecycle risks:** None — pure derivation graph change. No persistent state, no migrations.
- **API surface parity:** None — `libSDL2-2.0.so.0` ABI is unchanged; only the set of compiled video drivers expands.
- **Integration coverage:** The existing `korri-package-outputs` and `korri-moonlight-control-protocol-patch` checks gate the moonlight closure shape; U3 extends the former with both a file-presence assertion (SDL2-korri output ships `lib/libSDL2-2.0.so.0`) and a closure-reference assertion (moonlight-embedded-korri's closure contains an `SDL2-korri-*` reference and no `sdl2-compat-*` reference), so R4's invariant is gated automatically rather than relying on U2's manual `nix-store -q --references` step.
- **Unchanged invariants:** `pkgs.SDL2` (global) still resolves to upstream `sdl2-compat`. `sunshine-korri`, `korri-desktop` host / device / x86-kiosk variants, `libretro-fake-08`, and any other Korri package not in `moonlight-embedded`'s call graph keep their current SDL2 resolution. No moonlight source code change; the patch series under `packages/moonlight-embedded-korri/patches/` is untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Batocera patch fuzz on `release-2.32.8` source (configure / configure.ac / SDL_egl.c / SDL_kmsdrmopengles.c) | In-session narrow build already applied cleanly on the same source. If the broad build introduces fuzz (unlikely — the patch hunks don't touch wayland / x11 code), hand-adapt at U1 build time. |
| Broad build picks `mali` on the Brick but a non-mali driver elsewhere has subtle regression vs `sdl2-compat` | The mali patch's runtime effect on non-mali hosts is two narrow changes (EGL platform-display shortcut + GLES2 profile forcing in kmsdrm). Both behave correctly on Mesa per the patch analysis. If a regression surfaces on a non-mali host, revert U2 (restore the moonlight overlay `SDL2` argument to upstream `pkgs.SDL2` / sdl2-compat) until the root cause is identified. The global `pkgs.SDL2` swap (deferred follow-up work) is orthogonal — it would broaden the change rather than roll it back. |
| aarch64 fuji builder offline or `/tmp/korri-m1/src` stale | U4 starts with `git pull`; if the checkout is gone, re-clone before building. The previous session shipped 1.6 GB closure to the Brick this way; recipe is well-trodden. |
| Brick `/nix` bind-mount not persistent (already known, called out in `/tmp/handoff-ca3WlA.md`) | U4 explicitly re-binds before attempting U5. Persistent service for this is owned by the spike plan, not this plan. |
| Closure size *change* from the SDL2 swap | Net **win**, not regression. The parallel `perf/moonlight-closure` branch (commits `481e3ee` drop CMakeCache.txt, `568d608` ffmpeg → ffmpeg-headless) already cut moonlight closure 1.4 GiB → 992 MiB. Tracing the remaining 800+ MB shows it is almost entirely the `sdl2-compat` → gst-plugins-bad transitive chain (flite, freepats, gtk+3, gtk4, libadwaita, zenity, gstreamer, python3). The SDL2-korri swap evicts that whole chain. Projected moonlight closure post-merge: ~150 MiB, an 800+ MB drop. The +5–10 MB of wayland/X11 buildInputs we add is noise inside that. Verify with `nix path-info -Sh .#packages.x86_64-linux.moonlight-embedded-korri` after U2 lands. |
| Stream connects but mali driver renders garbage (Knulli stock moonlight also exhibits this) | Out of scope per Scope Boundaries; "any picture" is the success bar. Capture the garble shape in the U6 learning doc for follow-up. |

---

## Documentation / Operational Notes

- The chunked-transfer doc has an outstanding edit pending about `tar -h` symlink dereferencing (flagged in `/tmp/handoff-ca3WlA.md`). Not this plan's job; the handoff captures it.
- After U5 succeeds and U6 lands, the spike plan `docs/plans/2026-05-28-002-spike-trimui-brick-bringup-plan.md` can mark U5 (Moonlight first light) as complete and the spike as ready to wind down.
- Step 7 (global `pkgs.SDL2` swap) should be filed as a follow-up plan when revisited — suggested filename `docs/plans/YYYY-MM-DD-NNN-feat-global-sdl2-korri-substitution-plan.md`.

---

## Sources & References

- **In-session prototype work:** the in-tree `packages/SDL2-mali-fbdev/` directory and the overlay/flake wiring already committed represent the narrow-build prototype this plan broadens. U1 is the rename + flag broadening; U2 is the overlay rewording.
- **Predecessor handoff:** `/tmp/handoff-ca3WlA.md` (TRIMUI Brick bringup focus, Path A definition).
- **Parallel handoff (outbound):** `/tmp/handoff-MbYw5O.md` (closure hygiene scope hand-off written from this session).
- **Parallel handoff (inbound):** `/tmp/handoff-gXd3Hp.md` from the `perf/moonlight-closure` branch. Reports that commits `481e3ee` (drop CMakeCache.txt) and `568d608` (ffmpeg → ffmpeg-headless) landed on `perf/moonlight-closure`, cutting moonlight closure 1.4 GiB → 992 MiB. Identifies `sdl2-compat` as the source of the remaining 800+ MB and notes that the SDL2-korri swap unlocks the rest of the drop. Adds `nix/tests/korri-moonlight-closure-hygiene-check.nix` as a forbid-pattern check derivation with an explicit hook for our SDL2 work to extend (U3 covers this).
- **Spike plan:** `docs/plans/2026-05-28-002-spike-trimui-brick-bringup-plan.md` (this plan's R5 closes the spike's U5 gap).
- **Batocera patch:** `https://github.com/batocera-linux/batocera.linux/blob/master/board/batocera/patches/sdl2/sdl2_add_video_mali_gles2.patch`.
- **Upstream SDL2 source:** `https://github.com/libsdl-org/SDL/tree/release-2.32.8`.
- **nixpkgs SDL2 alias rejection:** `pkgs/top-level/aliases.nix` (`SDL2_classic = throw "...removed..."`, `SDL2 = sdl2-compat`).
