# com.korri.retroarch patches

Korri's Android emulation runtime is RetroArch v1.22.2 at pinned commit
`69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576` plus the ordered patches in this
directory. `runtimes/retroarch/fetch-upstream.sh` verifies that pin and requires
each patch to apply exactly, without fuzz.

This pin and patch series are the complete corresponding source changes for
Korri's GPL-3.0 RetroArch distribution. Upstream source remains available from
<https://github.com/libretro/RetroArch>.

The bundled mGBA libretro core is built from mGBA 0.10.5 at commit
`26b7884bc25a5933960f3cdcd98bac1ae14d42e2`. Its source is fetched from
<https://github.com/mgba-emu/mgba> and built reproducibly by
`runtimes/retroarch/cores/mgba/build.sh`; these files are the corresponding
source and build instructions for the bundled core.

## Series

Patches are applied in lexical order. Add one independently reviewable concern
per `NNNN-description.patch` and record its upstream-facing rationale here.

- `0001-korri-package-identity.patch` — gives the arm64 flavor the side-by-side
  `com.korri.retroarch` application id and “Korri RetroArch” label, removes all
  launcher categories while retaining the explicit gameplay activity, and
  limits the flavor to the one supported arm64 ABI.
- `0002-korri-default-config.patch` — makes Android first boot safe and invisible
  without an external config: GL instead of Vulkan, kiosk mode, no touch
  overlay, deterministic config ownership, close-content quit, and automatic
  save-state load/save defaults. External Korri config can still override them.
- `0003-bundle-korri-cores.patch` — atomically installs the APK's pinned mGBA
  asset into the app-private, executable `cores/` directory before native
  startup, preserving the last-known-good core until replacement. The core is
  built separately from mGBA 0.10.5 and remains at the stable path
  `/data/data/com.korri.retroarch/cores/mgba_libretro_android.so`.
- `0004-korri-control-channel.patch` — compiles RetroArch's existing command
  server into Android, enables its established UDP protocol on port 55355, and
  narrows the bind from all interfaces to `127.0.0.1`, and rejects every
  command outside an Android allowlist containing only upstream `GET_STATUS`
  and graceful `QUIT`.
- `0005-savestate-on-android-pause.patch` — synchronously writes and waits for
  the automatic savestate before acknowledging Android pause, so immediate
  suspension or process kill cannot race the state file.
- `0006-protect-korri-launch-surface.patch` — disables the upstream core-sideload
  activity and requires Korri's signature-level launch permission for explicit
  gameplay intents, preserving the signed LaunchSpec boundary.
- `0007-authenticate-korri-control.patch` — derives a per-korrid-server control
  token into the signed launch extras and requires it before the Android UDP
  server accepts either allowlisted command; missing or stale tokens fail
  closed.
