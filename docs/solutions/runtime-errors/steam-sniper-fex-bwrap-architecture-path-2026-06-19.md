---
title: Steam Sniper FEX bwrap must use the x86 rootfs and host PATH
date: 2026-06-19
category: runtime-errors
module: Steam plugin
problem_type: runtime_error
component: tooling
symptoms:
  - "Steam AppID launches reached Proton/Sniper but exited before a playable game window"
  - "pressure-vessel-wrap failed with srt-bwrap: /usr/bin/bwrap: cannot execute binary file: Exec format error"
  - "After direct-FEXing bwrap, pressure-vessel-wrap failed with bwrap: execvp true: Exec format error"
  - "Direct hand-started Steam over SSH produced socket(): Too many open files and std::bad_alloc"
  - "Steam prompts and windows were hidden by the Sway scratchpad policy during debugging"
root_cause: config_error
resolution_type: code_fix
severity: high
tags: [steam, fex, proton, sniper, bubblewrap, pressure-vessel, rocknix, sm8550]
---

# Steam Sniper FEX bwrap must use the x86 rootfs and host PATH

## Problem

Steam-owned Windows game launches on Bandai reached the correct AppID and Proton 10/Sniper path, but 30XX would exit before a stable playable window. The failure looked like a Steam or Proton problem, but the actual issue was that the Steam Runtime helper wrapper was resolving binaries across the wrong architecture boundary.

## Symptoms

- Steam produced real AppID launch transitions for `1029210`, including `GameAction [AppID 1029210]` and `SteamLaunch AppId=1029210`, but the game exited quickly.
- The original generated `srt-bwrap` trampoline was effectively:

  ```sh
  #!/bin/sh
  exec bwrap "$@"
  ```

  Under the ARM64 guest this resolved to the host `/usr/bin/bwrap`, producing:

  ```text
  /usr/bin/bwrap: cannot execute binary file: Exec format error
  ```

- After changing `srt-bwrap` to run the x86_64 rootfs `bwrap` through FEX, the failure moved deeper:

  ```text
  pressure-vessel-wrap[...] E: Child process exited with code 1:
  bwrap: execvp true: Exec format error
  ```

- Starting Steam directly over SSH instead of through `korri-steam.service` created false failures because the process did not inherit the service envelope. One direct hand-start had a low soft `NOFILE` limit and logged:

  ```text
  socket(): Too many open files
  shared memfd open() failed: Too many open files
  terminate called after throwing an instance of 'std::bad_alloc'
  ```

- Steam Big Picture was being scratchpadded by the Sway hide policy, hiding prompts and making visibility/focus debugging misleading.

## What Didn't Work

- **Treating this as a generic Proton or game bug.** Proton was invoked correctly, but Sniper failed before the game could stabilize because its helper wrapper crossed architectures incorrectly.
- **Running `30XX.exe` directly.** Direct game binary launches are useful diagnostics only; they bypass Steam ownership, Steam Input, install authority, and AppID lifecycle, so they do not prove the product path.
- **Launching Steam ad hoc over SSH.** The service supplies the correct environment and limits. Direct starts can produce unrelated resource-limit and IPC failures.
- **Assuming `steamid=0` meant Steam could not launch.** The useful signal was whether Steam accepted `-applaunch` and emitted `GameAction`/`SteamLaunch` lines, not the helper process `steamid=0` display alone.
- **Debugging with Steam hidden.** The scratchpad policy concealed prompts and made it difficult to tell whether the app was actually visible.

## Solution

Generate `srt-bwrap` as an explicit architecture-aware wrapper in `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep`.

The wrapper must:

1. Require `FEX_ROOTFS`.
2. Resolve `bwrap` from the x86_64 FEX rootfs.
3. Prepend `/run/current-system/sw/bin` so bwrap child sanity commands like `true` resolve to a host-executable binary.
4. Run the x86_64 rootfs `bwrap` through explicit FEX, not through host PATH or binfmt assumptions.

Working generated shape:

```sh
#!/bin/sh
set -eu
: "${FEX_ROOTFS:?FEX_ROOTFS must be set by the guest adapter before running wrapped Steam Runtime helpers}"
bwrap_bin="${FEX_ROOTFS%/}/usr/bin/bwrap"
if [ ! -x "$bwrap_bin" ]; then
  echo "srt-bwrap: missing executable x86_64 bwrap at $bwrap_bin" >&2
  exit 127
fi
PATH="/run/current-system/sw/bin:${PATH:-}"
export PATH FEX_ROOTFS
exec /usr/bin/FEX "$bwrap_bin" "$@"
```

The smoke test in `product/plugins/steam/packages/steam-korri/tests/steam-guest-runtime-prep-smoke.sh` should assert all three durable properties:

```sh
grep -q 'bwrap_bin="${FEX_ROOTFS%/}/usr/bin/bwrap"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should resolve bwrap from the FEX rootfs"
grep -q 'PATH="/run/current-system/sw/bin:${PATH:-}"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should expose NixOS host tools for bwrap child sanity execs"
grep -q 'exec /usr/bin/FEX "$bwrap_bin" "$@"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should direct-FEX the x86_64 rootfs bwrap"
```

On-device verification after runtime prep:

```sh
SRT=/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/srt-bwrap
HOME=/home/korri \
FEX_ROOTFS=/var/lib/korri/steam/fex-rootfs \
"$SRT" --version

HOME=/home/korri \
FEX_ROOTFS=/var/lib/korri/steam/fex-rootfs \
"$SRT" --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp true
```

Use `korri-steam.service` as the Steam startup envelope for proof and product launches. It provides the intended `HOME`, `STEAM_HOME`, `XDG_RUNTIME_DIR`, DBus/Wayland display variables, `FEX_ROOTFS`, group access, and `LimitNOFILE`.

During debugging, keep Steam visible through an explicit dev option or temporary no-hide launcher. Do not permanently hide prompts while proving AppID launches.

## Why This Works

Steam on Bandai is an ARM64 frontend, but Proton 10 and SteamLinuxRuntime Sniper run x86_64 Windows game support through FEX. `srt-bwrap` sits on that architecture boundary. If it resolves `bwrap` from the ARM64 host, x86 runtime setup fails with `Exec format error`. If it uses x86_64 `bwrap` but leaves PATH pointing only at x86/guest locations for child sanity execs, `bwrap ... true` can fail with `execvp true: Exec format error`.

The fixed wrapper makes each side explicit:

- `bwrap` comes from the x86_64 FEX rootfs.
- FEX executes that x86_64 binary deliberately.
- `/run/current-system/sw/bin` gives bwrap child probes a host-executable `true` and other basic tools.
- Steam itself still starts through the service envelope, so the launcher does not accidentally lose resource limits or session state.

The verified proof run showed the intended full stack:

```text
Steam -applaunch 1029210
SteamLaunch AppId=1029210
SteamLinuxRuntime_sniper/_v2-entry-point
Proton 10.0/proton waitforexitandrun
/usr/bin/FEX ... wine64-preloader ... 30XX.exe
```

The game remained alive for more than 60 seconds and produced a visible fullscreen window:

```text
name: 30XX 1.4.0
class: steam_app_1029210
visible: true
```

GPU evidence from the same run included `/dev/dri/renderD128`, `libvulkan_freedreno.so`, and shader cache entries for `Turnip Adreno (TM) 740`. A non-black screenshot was captured at:

```text
/tmp/bandai-steam-debug/30xx-visible-20260619185501.png
```

## Prevention

- Keep `srt-bwrap` generation covered by smoke tests that assert the FEX rootfs `bwrap`, host PATH prefix, and explicit `/usr/bin/FEX` invocation.
- Treat `korri-steam.service` as the authoritative Steam startup envelope; do not use ad hoc SSH Steam starts as product proof.
- For Steam-owned proof, require AppID launch evidence, a live `SteamLaunch AppId=<id>` process, a visible `steam_app_<id>` window, render-node/GPU evidence, and input confirmation.
- Keep Steam visibility as an explicit dev/proof option. Production may hide Steam later, but debugging needs prompts and windows visible.
- Preserve the separation between ARM64 Steam frontend and x86 Windows Proton/FEX runtime; do not rely on transparent binfmt or host PATH ambiguity at the runtime boundary.

## Related Issues

- Related architecture note: `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`
- Proof artifact: `/tmp/bandai-steam-debug/30xx-visible-20260619185501.png`
