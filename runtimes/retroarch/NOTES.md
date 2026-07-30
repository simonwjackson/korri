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
- applicationId `com.retroarch.aarch64`, debug-key signed (RA's release
  config falls back to debug signing without `RELEASE_STORE_FILE`)

## Pin

- Upstream: `github.com/libretro/RetroArch` tag `v1.22.2` = commit `69a4f0e`
  — the exact commit the buildbot APK from the transport spike reports.
- `fetch-upstream.sh` shallow-fetches and verifies this exact commit into the
  gitignored, generated `upstream/` worktree, resets tracked files to the pin,
  and applies `patches/NNNN-*.patch` in lexical order with exact `git apply`
  checks. Ignored build outputs survive reset for incremental builds.

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
just ra-fetch  # verify the pin and apply the series
just ra-build  # fetch/apply, then build the arm64 release APK
just ra-check  # pipeline failure tests + complete build + artifact check
```

The source pin and published patch series are the corresponding-source form of
Korri's GPL-3.0 distribution. Do not edit `upstream/` directly; changes belong
in one numbered patch and its `patches/README.md` entry.

## Bundled mGBA core

`cores/mgba/build.sh` pins mGBA 0.10.5 at
`26b7884bc25a5933960f3cdcd98bac1ae14d42e2`, cross-compiles only the arm64
libretro core with the same NDK 22 toolchain, and stages the exact output as
`assets/cores/mgba_libretro_android.so`. Patch 0003 copies that immutable APK
asset synchronously before native startup to
`/data/data/com.korri.retroarch/cores/mgba_libretro_android.so`. APK validation
compares the bundled bytes with the build output. This avoids buildbot binary
debt and keeps the core's corresponding source pin reproducible.

## Caveats / next steps

- **No menu asset pack bundled**: buildbot's 184 MB APK includes RA's asset pack added
  during their packaging; our 14 MB APK is the bare frontend. RA can fetch
  assets at runtime; the fork decides whether to bundle (likely yes, alongside
  bundled cores — kiosk mode needs no menu assets at all).
- **Do not install this over the tablet's buildbot RA**: same applicationId,
  different signing key → requires uninstall, which deletes the mGBA core
  installed inside RA's private dir and breaks the local-play device state.
  First device install of our build happens when the fork renames the package
  to `com.korri.retroarch` (patch ~0002), which sidesteps the conflict entirely.
- `assembleAarch64Release` builds x86_64 too; the fork can drop it to halve
  native build time if we never target x86 Android.
