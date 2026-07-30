# com.korri.retroarch patches

Korri's Android emulation runtime is RetroArch v1.22.2 at pinned commit
`69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576` plus the ordered patches in this
directory. `runtimes/retroarch/fetch-upstream.sh` verifies that pin and requires
each patch to apply exactly, without fuzz.

This pin and patch series are the complete corresponding source changes for
Korri's GPL-3.0 RetroArch distribution. Upstream source remains available from
<https://github.com/libretro/RetroArch>.

## Series

Patches are applied in lexical order. Add one independently reviewable concern
per `NNNN-description.patch` and record its upstream-facing rationale here.

- `0001-korri-package-identity.patch` — gives the arm64 flavor the side-by-side
  `com.korri.retroarch` application id and “Korri RetroArch” label, removes all
  launcher categories while retaining the exported explicit gameplay activity,
  and limits the flavor to the one supported arm64 ABI.
- `0002-korri-default-config.patch` — makes Android first boot safe and invisible
  without an external config: GL instead of Vulkan, kiosk mode, no touch
  overlay, deterministic config ownership, close-content quit, and automatic
  save-state load/save defaults. External Korri config can still override them.
- `0003-bundle-korri-cores.patch` — installs the APK's pinned mGBA asset into
  the app-private, executable `cores/` directory before native startup. The
  core is built separately from mGBA 0.10.5 and remains at the stable path
  `/data/data/com.korri.retroarch/cores/mgba_libretro_android.so`.
