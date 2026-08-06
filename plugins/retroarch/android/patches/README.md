# com.korri.retroarch patches

Korri's Android emulation runtime is RetroArch v1.22.2 at pinned commit
`69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576` plus the ordered patches in this
directory. `plugins/retroarch/android/fetch-upstream.sh` verifies that pin and requires
each patch to apply exactly, without fuzz.

This pin and patch series are the complete corresponding source changes for
Korri's GPL-3.0 RetroArch distribution. Upstream source remains available from
<https://github.com/libretro/RetroArch>.

The bundled mGBA libretro core is built from mGBA 0.10.5 at commit
`26b7884bc25a5933960f3cdcd98bac1ae14d42e2`. Its source is fetched from
<https://github.com/mgba-emu/mgba> and built by the independent
`@korri:mgba` plugin at `plugins/mgba/android/build.sh`. The resulting core is
temporarily carried in the RetroArch APK as an Android packaging bridge.

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
  server into Android, enables its established UDP protocol, narrows the bind
  from all interfaces to `127.0.0.1`, and rejects every
  command outside an Android allowlist containing only upstream `GET_STATUS`
  and graceful `QUIT`.
- `0005-savestate-on-android-pause.patch` — synchronously writes and waits for
  the automatic savestate before acknowledging Android pause, so immediate
  suspension or process kill cannot race the state file.
- `0006-protect-korri-launch-surface.patch` — disables the upstream core-sideload
  activity and requires Korri's signature-level launch permission for explicit
  gameplay intents, preserving the signed LaunchSpec boundary.
- `0007-authenticate-korri-control.patch` — consumes the launch-bound control
  token attached natively to the gameplay intent and authenticates before the
  Android UDP allowlist or dispatch; missing, malformed, or stale tokens fail
  closed. The token is retained privately by korrid and is absent from the
  serialized LaunchSpec, JavaScript, and logs. JNI necessarily creates a
  transient Java String while attaching it to the trusted cross-process
  gameplay Intent; RetroArch copies it into native memory during startup.
- `0008-korri-session-control-acknowledgements.patch` — adds only `SHOW_MENU`
  to the authenticated Android allowlist, ensures the menu is alive instead of
  blindly toggling it closed, and returns exact `SHOW_MENU OK`/`SHOW_MENU ERROR`
  and `QUIT OK` acknowledgements. `GET_STATUS` remains upstream's established
  reply. Authentication still precedes allowlist selection and dispatch.
- `0009-hmac-korri-control-protocol.patch` — replaces the bearer UDP payload
  with a fixed 66-byte version/nonce/command/MAC request and strictly framed
  nonce/command/result/MAC replies. It implements HMAC-SHA256 from the pinned
  source's `sha256_hash`, compares MACs in constant time, wipes all 65 bytes of
  transient native token storage, and retains loopback binding. Each LaunchSpec
  config selects a launch-derived high port; prebinding that endpoint can deny
  service but cannot capture authority or forge an acknowledged command.
- `0010-clear-control-intent-bootstrap.patch` — removes the unavoidable
  cross-process token extra from RetroArch's Activity Intent immediately after
  native code copies it, limiting the Java String to bootstrap lifetime.
- `0011-fail-closed-control-dispatch.patch` — authenticates a command tag before
  selecting from the allowlist and drops oversized authenticated results rather
  than ever falling through to RetroArch's plaintext reply path.
- `0012-reject-replayed-controls-and-report-menu-state.patch` — rejects duplicate
  authenticated nonces through a fixed 32-entry ring that resets with launch
  authority, then extends MAC-covered `GET_STATUS` with an exact 8-hex content
  CRC32 plus menu-alive and selection-index telemetry. Replay insertion occurs
  after MAC validation and before allowlist dispatch, so duplicate status,
  menu, and quit datagrams receive neither an effect nor a usable response.
- `0013-secret-free-control-diagnostics.patch` — records only whether the
  loopback listener retained launch authority plus accepted command tags and
  attempted/sent reply tags and lengths. It never logs a token, nonce, frame,
  payload, capability, path, or port.
- `0014-report-full-content-leaf.patch` — reports the full content leaf name,
  including its extension, from `RARCH_PATH_CONTENT` so authenticated status
  matches the launch-bound ROM identity. Empty, dot, nested, delimiter-bearing,
  or line-breaking leaves fail closed as `CONTENTLESS`; no directory or full
  path enters the reply.
