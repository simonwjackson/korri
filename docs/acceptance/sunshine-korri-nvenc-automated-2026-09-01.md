# Sunshine Korri NVENC automated acceptance — 2026-09-01

## Scope

This record covers the eleven-patch `sunshine-korri` package and matching Android/portal runtime-settings client before physical NVIDIA acceptance. It does not claim a deployed or physically accepted Zao session.

## Reviewed identities

- Sunshine package: `sunshine-korri`
- Approved patch count: `11`
- Patch `0016` SHA-256: `686decb81379741e01e0b9b0e9105bbe23765a1bf728565767604383983a7074`
- Ordered patch-set SHA-256: `68c6f746306b5361dc9c9ccb0e9d3fd034467b24733e1e0cca348ced4fd40914`
- Reviewed FFmpeg commit: `61c50407fd429a5e2ec616e2e846c3fe3743879a`
- Reviewed FFmpeg source hash: `sha256-LKQUfHb9/Z4uvPx4vrtAOPL95Un9/C26lvCbQZ51avk=`
- Reviewed libavcodec version: `62.11.100`
- Reviewed NVENC API: `12.0`

## Implemented behavior

- H.264 NVENC publishes live bitrate support only for an active mutable NVENC encoder session.
- Bitrate changes copy the active NVIDIA configuration, call `NvEncReconfigureEncoder()` synchronously, and commit FFmpeg/Sunshine applied state only after `NV_ENC_SUCCESS`.
- NVENC bitrate attempts are limited to one per 500 ms from driver-call completion.
- A failed call or a returned call exceeding 100 ms withdraws bitrate support for that encoder session. FPS, resolution, and the existing stream remain available. A successful encoder replacement may republish bitrate support.
- Release-capable Android and keyboard range gestures carry opaque process-local gesture identities. Shift commits only the newest matching source/gesture release; stale, unrelated, ignored, and cross-source release edges cannot commit another gesture.
- Artemis no longer owns the Start+Back+LB+RB Activity-exit chord. Korri remains lifecycle authority.
- The Linux host module supports immutable `auto`, `vaapi`, and `nvenc` encoder selection. Explicit NVENC selection adds only `/run/opengl-driver/lib` to the service library path, uses a non-restarting systemd condition for the CUDA/NVENC driver libraries, and enables strict encoder selection so later backend initialization failures reject streaming rather than falling back to VAAPI. The live-settings environment gate remains controlled only by its explicit Nix option.

## Automated gates

The following completed successfully from the Korri feature worktree:

- `nix build --no-link .#checks.x86_64-linux.sunshine-korri-runtime-settings`
- `nix build --no-link .#checks.x86_64-linux.korri-linux-host-module`
- `nix run .#inputd-check`
- `nix run .#portal-check`
- `nix run .#shift-check`
- `nix run .#android-jvm-check`

The runtime package gate builds the fully patched Sunshine source and checks the exact ordered manifest, provenance schema, FFmpeg source identity, libavcodec identity, NVENC API identity, private-layout compile assertions, capability lifecycle, attempt limiting, failed/slow-call circuit breaker, and no steady-state capability probing.

The device-gate model rejects invalid `reviewed_ffmpeg_commit`, `reviewed_ffmpeg_source_hash`, `reviewed_libavcodec_version`, and `reviewed_nvenc_api` provenance fields.

## Remaining physical gate

Automated acceptance does not prove NVIDIA driver-call latency, frame pacing, bandwidth response, gaming-load contention, teardown, memory behavior, or client-visible no-reconnect operation. Those require the matching Artemis APK and a no-reboot Zao candidate using the RTX 3060 Laptop GPU. Physical evidence must be recorded separately before NVENC acceptance is complete.
