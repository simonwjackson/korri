# sunshine-korri physical runtime-settings acceptance — 2026-09-01

## Result

The exercised positive and capability-negative paths are physically accepted for the reviewed H.264 VAAPI profile.

Bandai launched the Korrid-owned `Input gate` route over Tailscale, received moving video from Zao, and exercised capability query, bitrate, FPS, resolution, restore, encoder replacement, capture reinitialization, Android-injected touch remapping, restart, disabled-gate, unsupported-encoder, and long-cycle teardown behavior.

Server-side invalid bounds, rapid competing requests, disconnect during an in-flight mutation, and deliberately delayed acknowledgements remain automated-only checks and are not claimed as physical evidence here.

Audio was not part of this acceptance. The observed failure was PulseAudio access denial plus failure to create Sunshine's Pulse runtime symlink under the read-only home sandbox. This report does not establish the correct audio fix.

## Exact artifacts

- Korri commit: `f44c8f361f0ab75a480f6beb6fe24ede15762dca`
- Device-gate control-peer fix: `deec4a7dd26b8889d0b34d5b2930dd38a44a8f37`
- Intel VAAPI host fix: `a1651bd827d8deeac9653ca07ab65f6b29cc7209`
- Mountainous commit: `fdbc8b655f525b44d3d1b2fd3e70806588eba08e`
- Candidate: `/nix/store/2mw5qb8dlwhxqz4sgav89wsw8izf5i0w-nixos-system-zao-26.05.20260313.c06b4ae`
- Rollback: `/nix/store/ac46r72fh00p9g81z5hv45pw8zdsbpy4-nixos-system-zao-26.05.20260313.c06b4ae`
- Sunshine executable: `/nix/store/x22ww5fh9km64bms2vrd6sad56nahap7-sunshine-korri-2025.924.154138-korri/bin/sunshine-2025.924.154138-korri`
- Approved patch-set SHA-256: `e96a0fbdfe8441b6bea9207fa2349ab7e80c726ccc022273770bad3d7aa1076a`
- Patch `0005` SHA-256: `a14ca9d556728ca1a4fcb14ae338a6275c9b28c52598a82a4e4f424956154d53`
- Installed Android APK SHA-256: `dd794fc2c4a402953ae84655b69adf1a61cb4077291e38b59080c6117e097ab2`
- Sunshine private-state digest before and after final testing: `f8979ccb7cee28a943cb3d0361da5af1ff80044c72140e88cd94594e85a750bd`

Nothing was pushed and no PR was opened.

## Hardware prerequisite

Zao's Intel Tiger Lake render node is `/dev/dri/renderD128`. The Korri host module now supplies `intel-media-driver-26.1.2`.

`vainfo` reported the Intel iHD driver and H.264 encode entrypoints. A direct VA query established the reason the original physical bitrate test failed:

| H.264 entrypoint | Rate-control mask | Result |
|---|---:|---|
| `VAEntrypointEncSliceLP` | `0x10` | CQP only |
| `VAEntrypointEncSlice` | `0xcde` | CQP, CBR, VBR and AVBR |

With `SUNSHINE_LIVE_SETTINGS_MVP=1`, the final package selected normal H.264 encoding and logged `Using VBR with single frame VBV size`. Other codecs retained Sunshine's upstream low-power preference.

`intel_gpu_top` sampled nonzero Intel `Video` engine activity between approximately 1.9% and 3.4% while the moving stream and resolution cycle were active.

## Client and route

- Client: Bandai, Odin2 Portal, Android 13
- Package: `com.simonwjackson.korri.debug`
- Route: Korrid-owned `Input gate`
- Network path: Bandai-to-Zao Tailscale route
- Codec: H.264 using `c2.qti.avc.decoder.low_latency`
- Launch baseline: 1280×720, 60 FPS, 7308 kbps

The accessibility overlay and performance overlay were enabled only for the test. Bandai was restored afterward to its captured accessibility-service list, codec preference, and performance-overlay preference. The restricted-settings app-op ended at `default`; no pre-test baseline for that app-op was captured.

## Patch-by-patch evidence

### `0001` and `0002` — protocol surface and control plane

A fresh H.264 session issued capability request `1`. The product overlay exposed all six mutation/restore controls with host-applied values:

- bitrate: 7308, range 500–150000 kbps;
- FPS: 60, range 1–60;
- width: 1280, even step, maximum 1280;
- bitrate, FPS and resolution restore commands enabled.

The installed Android client and Sunshine package were the exact builds covered by the automated `0x5504`/`0x5505` golden checks. Encrypted packet bodies were not packet-inspected.

### `0003` — runtime FPS

The same session changed 60→30 FPS and restored 30→60 without reconnect or Sunshine PID replacement.

Bandai's physical performance overlay measured:

| State | Video stream | Incoming from network | Rendering | Network drops |
|---|---:|---:|---:|---:|
| launch | 60.10 FPS | 60.10 FPS | 52.71 FPS | 0.00% |
| requested 30 | 29.97 FPS | 29.97 FPS | 26.10 FPS | 0.00% |

Sunshine reported applied status `0`, reason `0` for both mutation and restore.

### `0004` — proof-gated resolution and touch mapping

The same session changed 1280×720→854×480 and restored 854×480→1280×720.

Sunshine reported:

- exact applied width and height;
- `server_applied=1`;
- fresh H.264 VAAPI encoder creation;
- asynchronous capture reinitialization;
- no client disconnect.

Android reported a decoder output crop of 854×480 (`crop-right=853`, `crop-bottom=479`).

Touch coordinates were sampled through Sunshine's protected virtual touch target before and after downshift using `adb shell input tap` on Bandai:

| Android-injected Bandai tap | Launch mapping | 854×480 mapping |
|---|---:|---:|
| near top-left | 1000,1000 | 993,1000 |
| center | 9600,5400 | 9600,5400 |
| near bottom-right | 18200,9800 | 18207,9800 |

The small seven-unit X delta is the expected even-resolution rounding. Mapping remained anchored to the 19200×10800 virtual display range rather than becoming stale or stretched.

### `0005` — seamless VAAPI bitrate

The first v28 physical attempt discovered that Intel's low-power entrypoint exposed only CQP. Operation 1 was advertised but failed its private-state guard, correctly leaving the stream unchanged. This produced the final fix:

- query actual entrypoint rate-control attributes;
- prefer normal before low-power only when it advertises CBR/VBR/AVBR;
- publish bitrate support from the active encoder session separately from FPS/resolution support;
- clear and republish support across replacement and teardown lifecycles;
- suppress operation 1 and bitrate bounds on non-mutable sessions;
- enforce the same 500–150000 bounds before queueing.

On v29, 7308→1000 kbps applied with:

- status `0`, reason `0`;
- `seamless_vaapi=1`;
- `rc_mode=VBR`;
- one forced IDR;
- unchanged Sunshine PID `1933462`;
- no disconnect or encoder restart.

Tailscale UDP payload measurements over 12-second moving-video windows were:

| State | Payload rate |
|---|---:|
| launch | 2744.5 kbps |
| requested 1000 | 1484.0 kbps |
| restored 7308 | 2658.5 kbps |

VBR content did not consume the configured ceiling, but the same-session bandwidth decreased materially and recovered after explicit restore.

Bitrate also applied successfully after a runtime resolution replacement, proving that capability and private state were republished for the new encoder generation.

### `0010`, `0012` and `0013` — fresh frames, persisted config and async reinit

Every resolution leg logged, in order:

1. encoder creation;
2. `requesting async capture reinit`;
3. applied resolution acknowledgement;
4. `async capture runtime reinit complete`;
5. replacement encoder creation.

After 854×480 applied, the overlay simultaneously reported width 854 and FPS 30. A subsequent bitrate mutation applied to the replacement session, demonstrating that current resolution/FPS state and active bitrate capability survived capture reinitialization. Explicit restores returned all values to the launch baseline.

### `0014` — narrow VAAPI destructor-flush exception

Twenty full 1280×720→854×480→1280×720 cycles ran on the final normal/VBR H.264 path.

- 40 resolution mutations applied;
- 40 async capture reinitializations completed;
- Sunshine PID remained `1933462`;
- client disconnect count remained zero;
- no FFmpeg, VAAPI, assertion or teardown fault occurred;
- cgroup memory stayed bounded between 272,887,808 and 274,907,136 bytes;
- final memory was 273,850,368 bytes;
- final width returned to 1280.

### `0015` — input-seat mirror

This patch remains intentionally inert. No receiver socket, launch sidecar or mirror token authority was enabled. It is not part of the variable-streaming acceptance.

## Negative and lifecycle evidence

### Unsupported encoder

A v28 HEVC VAAPI stream completed the capability query while the live-settings gate was enabled. Runtime bitrate, FPS and resolution controls were absent. The stream remained usable. This physically covers conservative unsupported-encoder publication; automated tests cover the exact reason and payload fields.

### Gate disabled

The exact final Sunshine executable and runtime sandbox settings were launched from a temporary `/run/systemd/system` copy of the candidate unit. The only runtime service-setting change was removal of `SUNSHINE_LIVE_SETTINGS_MVP`; the temporary copy also used a test description and omitted its unused `[Install]` section.

- H.264 followed Sunshine's upstream low-power/CQP path;
- capability request `1` logged `enabled=false`;
- all runtime mutation and restore controls were absent;
- normal video remained available;
- the temporary unit was removed;
- the candidate `sunshine.service` with exact gate value `1` was restored;
- private digest remained unchanged.

### Sunshine restart and session epoch

After targeted Sunshine replacement, Bandai reconnected without pairing. A fresh capability query returned the launch baseline 7308 kbps, 60 FPS and 1280 width. No value from the previous session crossed the epoch. The Sunshine private digest remained unchanged.

### Pairing and private state

The complete descriptor-bound Sunshine private-state digest remained unchanged throughout v29, including:

- bitrate, FPS and resolution mutations;
- 20 resolution cycles;
- temporary gate-disabled Sunshine;
- Sunshine restart;
- Bandai reconnect.

No credential or pairing-state content was inspected.

## Device-gate recovery proof

V28 exposed a cleanup defect: the root helper could not query the private Korrid control socket because its exact peer policy accepts the `korri-inputd` identity. A completed host session then prevented automatic rollback. Commit `deec4a7d` routes the read-only status query through the exact peer without weakening socket permissions. Its reconciled superseded ledger is archived at `~/.local/state/korri-device-gate/.archive/zao-20260901-inputplumber-unified-v28-inspected-superseded-cqp-bitrate-and-control-peer` and must not be retried.

V29 ended with a completed Korrid-owned stream and was interrupted at the unrelated `normalized-gameplay` prompt. Cleanup reported `rollback=true`, restored the exact rollback generation, removed the root marker and lease, and the ledger reconciled to baseline.

Final host state:

- current generation equals rollback;
- default generation equals rollback;
- Korri candidate services inactive;
- no active game unit;
- no attempt marker;
- no rollback lease;
- no transient disabled-gate service;
- moving-video fixture inactive.

## Automated verification

The final source and package passed:

- exact ordered patch application through `0015`;
- `sunshine-korri-runtime-settings` package/build/provenance check;
- per-patch source invariants without evaluator stack overflow;
- full `services/inputd/check-in-shell.sh` suite;
- Zao consumer check;
- final code review with no findings.

## Remaining work outside this acceptance

- Zao audio still fails with the observed PulseAudio access and read-only runtime-symlink errors; the correct host/session fix remains unverified.
- The controller and remaining seven-stage device-gate journey were deliberately not claimed by this streaming-focused run.
- Persistent installation, reboot verification, publication and PR creation remain separate and require their existing authorization/gates.
