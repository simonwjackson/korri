# Sunshine Korri NVENC physical acceptance — 2026-09-01

## Scope and identities

This record covers the NVIDIA streaming slice only. It does not claim the broader controller, persistence, rollback-reboot, or rebooted-candidate journey.

- Korri implementation commits: `cdafe4ea3bdb6ac4fff8abd9a78dfde6cc58c7af`, `9f7f237deb1fbf2b1172d7790a9a9150f602683c`
- Mountainous consumer commits: `9031c8c99e0615fed464167ef5b65a8b3f59a63b`, `8ee7f8b3f9e1880a09b4cd1ad425f3c81c56e9c1`
- Final candidate: `/nix/store/cv5jl9pgnyd806qbld4spb8wi7663l8j-nixos-system-zao-26.05.20260313.c06b4ae`
- Rollback: `/nix/store/ac46r72fh00p9g81z5hv45pw8zdsbpy4-nixos-system-zao-26.05.20260313.c06b4ae`
- Final ledger: `~/.local/state/korri-device-gate/zao-20260901-inputplumber-unified-v32-nvenc`
- Patch `0016` SHA-256: `686decb81379741e01e0b9b0e9105bbe23765a1bf728565767604383983a7074`
- Ordered eleven-patch digest: `68c6f746306b5361dc9c9ccb0e9d3fd034467b24733e1e0cca348ced4fd40914`
- Android ARM64 debug APK SHA-256: `c613014d8078fdee94939b2e238ec0ce99d13bcbe45262ae30a3f66810f9d9bb`
- GPU: NVIDIA GeForce RTX 3060 Laptop GPU
- Driver: `580.142`

The matching APK was installed byte-for-byte. Existing app data and Sunshine pairing were preserved.

## Superseded candidate finding

The first no-reboot candidate reached automated acceptance but exposed a host-policy defect: Sunshine received immutable `encoder=nvenc`, yet its service environment could not load `libcuda.so.1`, so upstream Sunshine fell back to VAAPI. No NVENC acceptance was claimed.

That candidate was inspected exactly. Its test session and raw udev mode were reconciled; rollback predicates matched. Its ledger is archived as:

`~/.local/state/korri-device-gate/.archive/zao-20260901-inputplumber-unified-v30-nvenc-inspected-superseded-missing-libcuda`

The fix:

- exposes `/run/opengl-driver/lib` only for explicit NVENC policy;
- uses a non-restarting systemd condition for `libcuda.so.1` and `libnvidia-encode.so.1`;
- enables strict encoder selection, rejecting stream setup instead of falling back;
- requires physical evidence from the current live Sunshine invocation and latest single H.264 session.

A separate v31 preflight found and safely reconciled stale completed-launch state before mutation. Its inspected ledger is archived as:

`~/.local/state/korri-device-gate/.archive/zao-20260901-inputplumber-unified-v31-nvenc-inspected-reconciled-stale-completed-launch`

## Automated candidate gate

V32 passed the automated candidate gates before physical testing:

- exact InputPlumber `0.75.2` source and normalized target;
- inputd `Ready`;
- system Korrid, X11, and Sunshine active;
- exact service credentials and group isolation;
- pairing present;
- `sunshine-korri` executable and eleven-patch provenance attested;
- protected Sunshine private-state digest;
- catalog healthy;
- exact physical controller at USB `3-4`.

Sunshine started with:

- `encoder=nvenc`;
- `SUNSHINE_STRICT_ENCODER=1`;
- `LD_LIBRARY_PATH=/run/opengl-driver/lib`;
- H.264 encoder `h264_nvenc`.

The strict physical gate returned:

`nvenc-stream-gate=pass encoder=h264_nvenc strict=yes invocation=current`

## Live runtime settings

All accepted mutations used the rendered Android Korri gameplay overlay and the native `0x5504`/`0x5505` path. No reconnect occurred during the primary session.

### Bitrate

- Launch: `7308` kbps
- Apply: `1000` kbps
- Restore: `7308` kbps
- Backend completion: `seamless_backend=nvenc`
- NVIDIA configuration: average/max bitrate changed exactly; one-frame VBV changed from `121800` to `16666` and restored.

Observed tailnet-interface transmit rate over bounded samples:

- launch: approximately `10249.9` kbps;
- 1000-kbps setting: approximately `2724.7` kbps;
- restored: approximately `10348.1` kbps.

Bandai's overlay simultaneously showed bandwidth falling from about `1.24M/s` to `319.53K/s`. These interface figures include incidental tailnet traffic, but the direction and recovery matched the client and driver-applied values.

### FPS

- `60 → 30 → 60`
- Sunshine acknowledged exact applied values.
- Bandai showed approximately `59.93` FPS before, `29.93` FPS after the downshift, and the restored model published `60`.
- Network frame loss remained `0.00%`.

### Resolution

- `1280×720 → 854×480 → 1280×720`
- Sunshine created fresh `h264_nvenc` sessions and requested asynchronous capture reinitialization.
- Android's decoder reported crop `854×480` with an aligned `864×480` output buffer, then returned to `1280×720`.
- Bitrate applied and restored successfully after the NVENC resolution replacement, proving the limiter/circuit state reset before capability republication.

### Soak

A 20-cycle same-session bitrate soak completed:

- every cycle applied `1000` and restored `7308`;
- total current-session NVENC reconfigurations: `44` including the earlier acceptance operations;
- conflicts: `0`;
- failed/slow-call circuit withdrawals: `0`;
- disconnects during the primary session: `0`;
- NVIDIA Xid errors: `0`.

## Restart and lifecycle

Only `sunshine.service` was restarted. `user@1000` was never stopped or restarted.

- Sunshine PID changed as expected.
- The private-state digest remained `f8979ccb7cee28a943cb3d0361da5af1ff80044c72140e88cd94594e85a750bd`.
- Pairing remained present.
- The new invocation selected and created NVENC again.
- A fresh H.264 stream published launch baselines `7308`, `60`, and `1280×720`.
- Post-restart bitrate apply and restore succeeded through NVENC.
- The current-invocation NVENC stream gate passed again.

An HEVC NVENC session created `hevc_nvenc` but published none of the six H.264 runtime controls, confirming conservative codec-specific capability behavior.

## Performance and contention

Baseline stream observations on Bandai:

- incoming frame rate around `60` FPS;
- network loss `0.00%`;
- network latency around `5–8 ms`;
- host processing average around `16–17 ms` at 60 FPS;
- decoder time around `2.8–3.4 ms`.

Zao already had approximately `961 MiB` NVIDIA memory in use from the existing voice workload. Sunshine raised this to about `1101 MiB`.

During a bounded concurrent 1080p60 H.264 NVENC encode:

- peak observed memory: `1269 MiB`;
- encoder utilization: approximately `18%`;
- the Sunshine stream remained around `60.19` FPS;
- network loss stayed `0.00%`;
- network latency stayed around `6 ms`;
- host processing average stayed around `16.5 ms`;
- no disconnect or Xid occurred.

## Artemis lifecycle authority

ADB gamepad-source injection held both modeled Start+Select+LB+RB and Start+Android-Back+LB+RB combinations on the installed device while streaming. The stream remained active, with no Sunshine disconnect. This was installed-device synthetic input rather than a manual physical chord press; the matching source contract independently confirms the old Activity-exit chord is absent. Korri remains lifecycle authority.

The normal overlay Disconnect action disconnected the client while intentionally leaving the host test session running. The exact private Korrid stop then stopped only that launch, removed the active game unit, and reported no active session.

## Cleanup

After evidence collection:

- Bandai resolution returned to `1280×720`;
- FPS returned to `60`;
- bitrate returned to `7308`;
- video-format preference returned to `auto`;
- performance-overlay preferences returned to their captured false values;
- accessibility services returned to the captured set;
- restricted-settings app-op returned to `default`;
- Sunshine private-state digest and pairing remained unchanged;
- the exact test session stopped;
- current and default Zao generations returned to the rollback generation;
- candidate services became inactive;
- marker and attempt lease became absent/inactive;
- raw controller mode returned to the rollback value;
- rollback predicates matched and the v32 ledger reconciled to baseline;
- no reboot occurred;
- `user@1000` retained invocation `31dfefc905ea49fd8ec0b05a4a0e53fd` and PID `363588`.

The v32 process intentionally did not consume the `normalized-gameplay` or any later controller HITL token. Streaming evidence must not be substituted for the unfinished broader device-gate journey.

Audio remained unavailable with the already known PulseAudio access and read-only runtime-symlink failures. Audio is outside this acceptance.

Nothing was pushed and no pull request was opened.
