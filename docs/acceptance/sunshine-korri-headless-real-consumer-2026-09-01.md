# Zao headless Korri consumer acceptance — 2026-09-01

## Scope

This follow-up closes two gaps in the earlier NVENC record:

1. Zao had been returned to its rollback generation rather than left as a persistent Korri consumer.
2. The earlier visual workload was effectively static.

This run intentionally excludes audio and local physical-controller HITL. It evaluates the headless streaming host, real moving content, Android stream lifecycle, and persistent NixOS consumption.

## Identities

- Korri moving-video gate: `164aca6e5a42cd38c53ed3ba04b1f17924d474f6`
- Android disconnect fix: `47475cfdedfade95d8b41927ea33e4c3a260a977`
- Lower-overhead validation playback: `f6582bcf69d0387ce811f1d9fad7836a60f9eecf`
- Mountainous persistent consumer: `bbd5b68023e84cd937f7ad54b89f4e6fc6470cd2`
- Persistent Zao generation: `/nix/store/1mcr6ss9qailqcmnfrfw8vv8b0rmxsr5-nixos-system-zao-26.05.20260313.c06b4ae`
- Fixed Android ARM64 APK SHA-256: `c4be4ad5b0baf86539223fde91b2105881c9b8b7a9aa800ba00c5c88fdb41b77`
- Final evidence ledger: `~/.local/state/korri-device-gate/zao-20260901-inputplumber-unified-v34-real-consumer`

Mountainous imports `inputs.korri-input-host.nixosModules.korri-linux-host` for Zao. The host supplies identity, tailnet firewall interface, gameplay identity, and `sunshine.encoder = "nvenc"`; Korri owns the streaming, input, Korrid, package, service, and validation policy.

## Headless moving-content gate

The old validation command was an inert `sleep 600`. Korri now supplies a bounded ten-minute moving-content gate:

- Big Buck Bunny, Blender Foundation 2008, CC BY 3.0;
- fixed-output 30-second 1920×1080 60 FPS H.264 source;
- attribution stored beside the media in the Nix closure;
- looped through `mpv` on Zao's headless Xvfb display;
- safe copy-back hardware decode, selecting NVDEC on explicit NVENC hosts;
- 120-frame presentation cadence for high-rate capture testing;
- immutable argv and exact Korrid-owned game scope;
- NVIDIA runtime library exposure only under explicit NVENC policy;
- automatic ten-minute timeout and exact Korrid stop.

The Nix module check verifies media metadata and attribution, evaluates and inspects both ordinary and explicit-NVENC generated device configurations, starts Xvfb, observes the real mpv window, and verifies bounded process liveness.

## 1080p60 result

A real moving H.264 stream launched at `1920×1080@60` using strict `h264_nvenc`.

Representative accepted samples:

- incoming stream: `60.14` FPS with `0.00%` network loss;
- moving-content bitrate downshift to `1000` kbps: `59.55` incoming FPS, `55.09` rendered FPS, `0.00%` network loss, approximately `308.06K/s` client bandwidth;
- host processing average during that low-bitrate sample: `16.8 ms`;
- decoder: `c2.qti.avc.decoder.low_latency`;
- average decode time: approximately `4.56 ms`.

The server reported exact NVENC driver completion for `14988→1000→14988` kbps without encoder replacement or reconnect.

This is a transport and runtime-control acceptance result, not a subjective gameplay-latency claim.

## 1080p120 finding

Bandai supports and was explicitly switched to its 120 Hz display mode. The Android client requested `1920×1080@120`; Sunshine published launch FPS `120`, created `h264_nvenc`, and the moving-content gate presented frames at 120 cadence.

Three bounded moving-content samples reported incoming rates of:

- `43.01` FPS;
- `63.21` FPS;
- `73.45` FPS.

Rendering rates were lower. Network frame loss remained `0.00%`, so this is not a packet-loss finding. The current headless Xvfb capture/processing path does not sustain 1080p120 and **120 FPS is not accepted**.

The source video itself is native 60 FPS; the 120-cadence player duplicates frames. Even allowing for that limitation, the stream transport failed to approach 120 FPS. Follow-up backlog item `01M1F9ADZFCSJA7G1Z7FDV6JN1` requires either a sustainable headless 120 FPS path or an honest fail-closed host cap.

## Android stop crash

The previously observed `MoonBridge_stopConnection+24` failure was not intermittent.

Before the fix, normal Korri-overlay Disconnect reproduced `3/3` times:

- `SIGABRT`;
- `cleanupPlatform()` assertion `activeMutexes == 0`;
- stack through `LiStopConnection()` and `MoonBridge_stopConnection+24`.

The runtime-settings mutex was created once and never retired before Moonlight platform cleanup. The fix:

- publishes runtime-settings availability atomically;
- retains and releases concurrent request/snapshot readers;
- records session end;
- unpublishes the dispatch;
- drains retained readers;
- deletes the runtime-settings mutex before the ENet mutex and platform cleanup;
- safely recreates it for the next session.

After installing the fixed APK:

- three repeated normal Disconnect cycles completed with zero crash lines;
- the Android process retained the same PID across all three cycles;
- final H.264 and HEVC normal disconnects were clean;
- exact Korrid stop removed each host game scope.

## Persistent consumer result

The final candidate was switched persistently without reboot.

After the persistent switch:

- `/run/current-system` equals the final Korri candidate;
- `/nix/var/nix/profiles/system` equals the same candidate;
- InputPlumber, inputd, Korrid, headless X11, and Sunshine are active;
- automated gates pass;
- strict NVENC starts and finds `h264_nvenc`;
- pairing remains present;
- Sunshine private-state digest remains `f8979ccb7cee28a943cb3d0361da5af1ff80044c72140e88cd94594e85a750bd`;
- a targeted Sunshine restart preserves that digest and pairing;
- an actual moving HEVC NVENC stream also succeeds after restart;
- no active game scope, attempt marker, or attempt lease remains after teardown;
- the boot ID is unchanged;
- `user@1000` retains invocation `31dfefc905ea49fd8ec0b05a4a0e53fd` and PID `363588`.

Bandai was restored to its captured baseline:

- `1280×720`;
- `60` FPS;
- codec `auto`;
- unlock-FPS false;
- performance overlay false;
- display refresh limits `60/60`;
- Korri accessibility service absent;
- restricted-settings app-op `default`.

Audio was not investigated because it did not block video, lifecycle, persistence, or runtime-control testing. No local physical-controller HITL was performed.

Nothing was pushed and no pull request was opened.
