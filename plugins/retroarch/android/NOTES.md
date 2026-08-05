# RetroArch Nix build spike — proven 2026-07-29

Goal: prove we can build upstream RetroArch's Android APK from a Nix devshell,
as the foundation for the `com.korri.retroarch` patch series (legacy
`packages/<upstream>-korri/patches/NNNN-*.patch` model).

## Result

`./gradlew assembleAarch64Release` from `nix develop` → **BUILD SUCCESSFUL in
7m42s cold** (includes SDK/NDK download, Gradle 6.7.1 wrapper fetch, and the
full native build for two ABIs). Incremental rebuilds are minutes or less.

Artifact: `upstream/pkg/android/phoenix/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk`
- 14 MB, 21 files
- `lib/arm64-v8a/libretroarch-activity.so` (20.8 MB uncompressed) + `lib/x86_64/`
- applicationId `com.korri.retroarch`, arm64-v8a only, debug-key signed (RA's
  release config falls back to debug signing without `RELEASE_STORE_FILE`)

## Pin

- Upstream: `github.com/libretro/RetroArch` tag `v1.22.2` = commit `69a4f0e`
  — the exact commit the buildbot APK from the transport spike reports.
- `fetch-upstream.sh` shallow-fetches and verifies this exact commit into the
  gitignored, generated `upstream/` worktree, resets tracked files to the pin,
  and applies `patches/NNNN-*.patch` in lexical order with exact `git apply`
  checks. `build.sh` deletes the prior APK and core outputs before rebuilding,
  so a failed invocation cannot leave a stale artifact eligible for deployment.

## Toolchain facts (why devshell.nix looks like this)

- RA 1.22.2 phoenix pins: AGP 4.2.0, Gradle 6.7.1 (wrapper), compileSdk 30,
  buildTools 30.0.3, NDK `22.0.7026061` (ndk-build, `phoenix-common/jni/Android.mk`),
  minSdk 16 / targetSdk 28.
- JDK 11 required (17 breaks AGP 4.2 / Gradle 6.7.1). nixpkgs Gradle 8 can't
  drive AGP 4.2 — the shell ships no gradle and lets the wrapper fetch 6.7.1.
- `aapt2FromMavenOverride` → Nix build-tools aapt2 (NixOS can't exec Gradle's
  downloaded dynamic binary; same pattern as clients/android).
- androidenv exposes the NDK as `ndk-bundle`; AGP wants `sdk/ndk/<version>` —
  the shellHook symlinks it. (Inner `ndk-bundle` self-link fails read-only;
  harmless.)
- `jcenter()` in RA's buildscript: deprecation warning only, resolution still
  succeeds. If it ever dies, a repo swap becomes patch 0000 of the series.
- Flavor `aarch64` uses `play-core-stub` — no Play Services dependency.

## Repeatable build

From the repository root:

```sh
nix run .#ra-fetch
nix run .#ra-build
nix run .#ra-check
nix run .#ra-deploy -- <adb-serial>
nix run .#ra-accept -- <adb-serial>
```

`ra-accept` additionally launches Wario through the Korri portal, verifies the
private launch-bound control authority is absent from the serialized LaunchSpec,
rejects missing/malformed/stale-looking UDP authority, drives the Korri overlay
to open and return from the native RGUI menu, proves HOME synchronously refreshes
a non-empty auto-state, invokes acknowledged graceful Quit through the overlay,
and checks that stock RetroArch stayed installed and stopped. The earlier
pre-U7 gate on device `100.65.66.40:39991` wiped fork-private state,
re-extracted the bundled core, reported
`GET_STATUS PLAYING mGBA,wl4,crc32=d6141609`, wrote a non-empty pause state,
logged a successful auto-state load on relaunch, refreshed the state again on
graceful `QUIT`, returned to Korri on display 0, and preserved
`com.retroarch.aarch64`.

The source pin and published patch series are the corresponding-source form of
Korri's GPL-3.0 distribution. Do not edit `upstream/` directly; changes belong
in one numbered patch and its `patches/README.md` entry.

## Temporary mGBA packaging bridge

The independent `@korri:mgba` plugin's `plugins/mgba/android/build.sh` pins
mGBA 0.10.5 at `26b7884bc25a5933960f3cdcd98bac1ae14d42e2`, cross-compiles only the
arm64 libretro core with the same NDK 22 toolchain, and stages the exact output
as `assets/cores/mgba_libretro_android.so`. Patch 0003 copies that immutable
APK asset synchronously before native startup to
`/data/data/com.korri.retroarch/cores/mgba_libretro_android.so`. APK validation
compares the bundled bytes with the mGBA plugin output. The APK carriage is
temporary and does not transfer plugin ownership to `@korri:retroarch`.

## Command-opened menu source proof

The pinned v1.22.2 Android build already compiles `HAVE_MENU` and `HAVE_RGUI`
in `pkg/android/phoenix-common/jni/Android.mk`. Its `command_event()` handles
`CMD_EVENT_MENU_TOGGLE`, and RGUI is compiled from `menu/drivers/rgui.c` through
the Android Griffin build. RGUI is the smallest usable built-in driver for the
14 MB APK because its default font, layout, and color themes are compiled in;
it does not require the buildbot asset pack used by XMB/Ozone/MaterialUI.
Korri's generated Wario config therefore selects `menu_driver = "rgui"` while
retaining `kiosk_mode_enable = "true"`, `input_menu_toggle_gamepad_combo = "0"`,
and `input_menu_toggle = "nul"`. This enables only the authenticated ensure-open
command; it does not generally restore RetroArch settings or hardware UI access.
Menu rendering, z-order, controller usability, return to gameplay, and graceful
Quit remain device-only U8 evidence until an approved device run records them.

## Caveats

- **No menu asset pack bundled**: buildbot's 184 MB APK includes an asset pack
  added during packaging; the 14 MB Korri APK is the bare frontend. The selected
  RGUI path is source-grounded specifically because it is usable without that
  pack. Optional asset-driven menu presentation remains unavailable.
- The fork is intentionally installed beside the stock buildbot package. Do
  not repoint Korri launch metadata to `com.retroarch.aarch64`; that package
  remains user-owned stock RetroArch.
