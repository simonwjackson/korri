# Sunshine Korri runtime resolution evidence

## Summary

The runtime resolution spike extended the experimental Sunshine/Moonlight runtime-settings control path with operation `3` for explicit width/height requests.

This pass proves the patched server/client control contract and Sunshine-side `h264_vaapi` encoder-session replacement on the fake Moonlight platform. It does **not** prove SM8550/v4l2m2m decoder or renderer survival yet, so runtime resolution remains experimental and should not be claimed as a supported device feature.

U5 hardening keeps that boundary explicit: operation `3` may be Sunshine-applied, but it is not client-proven until same-session target-client decode/render evidence exists. Capability acks list operation `3` as proof-gated rather than generally supported.

## Scope exercised

- Host: `aka` / `100.117.97.45`
- Sunshine backend: `h264_vaapi` for applied case, `hevc_vaapi` for unsupported case
- Client: patched `moonlight-embedded-korri`, fake platform
- Request packet: `0x5504`
- Ack packet: `0x5505`
- Runtime operation: `3` = set stream resolution, proof-gated until same-session client proof exists
- Gate: `SUNSHINE_LIVE_SETTINGS_MVP=1`
- Launch dimensions: `1280x720`
- Applied request: `640x360`
- Current status contract: `0` applied, `1` failed/unsupported, `2` invalid, `3` disabled
- Current reason-bearing contract: operation `3` acks include a machine-readable reason and separate `server_applied` versus `client_proven` markers in Moonlight/Sunshine logs.

## Build/check evidence

The following checks/builds passed after adding operation `3`:

```text
nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link
nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-standard-native --no-link --print-build-logs
nix build .#sunshine-korri .#moonlight-embedded-korri --no-link --print-build-logs
```

The patch check now requires explicit width/height request and ack fields, operation `3`, resolution invalid-path coverage, no resolution adaptation envs, proof-gated operation `3` capability markers, and separate Sunshine-applied versus client-proven outcome markers.

## Runtime resolution applied on fake client

The live smoke logs below predate the additive reason field. Current hardened logs preserve the broad status and add `reason=0 server_applied=1 client_proven=0` for the same fake-client applied case.

Run directory:

```text
/tmp/korri-runtime-resolution-smoke-20260526-084645
```

Moonlight markers:

```text
live-settings-mvp: runtime settings request scheduled delay_s=5 operation=3 resolution=640x360
live-settings-mvp: sending runtime settings request request_id=1 operation=3 width=640 height=360
live-settings-mvp: runtime settings request sent request_id=1 operation=3 resolution=640x360 packet=0x5504
live-settings-mvp: runtime settings ack request_id=1 operation=3 status=0 applied_width=640 applied_height=360 packet=0x5505
```

Sunshine markers:

```text
Creating encoder [h264_vaapi]
Streaming bitrate is 5708000
live-settings-mvp: request_id=1 operation=3 requested_value=0 requested_width=640 requested_height=360 configured_bitrate_kbps=5708 configured_fps=60 configured_width=1280 configured_height=720 queued=1
Creating encoder [h264_vaapi]
Streaming bitrate is 5708000
live-settings-mvp: async encoder restarted for runtime resolution request_id=1 applied_width=640 applied_height=360
live-settings-mvp: capture_sync runtime resolution request_id=1 requested_width=640 requested_height=360 applied_width=640 applied_height=360 status=0
```

Interpretation: Sunshine accepted a valid downshift request, rebuilt the active `h264_vaapi` encoder session, and returned a structured operation `3` applied ack. This is Sunshine-applied/server-applied evidence only. Because the client was `-platform fake`, `client_proven` remains `0` and this does not prove decoder/render survival.

## Edge cases

Current reason-bearing equivalents preserve the same broad status while adding reasons: invalid bounds use `reason=2`, unsupported encoder uses `reason=4`, and disabled gate uses `reason=1`. In all three cases, current applied dimensions remain the launch dimensions.

### Invalid upshift

Run directory:

```text
/tmp/korri-runtime-resolution-smoke-20260526-084743-invalid-upshift
```

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=3 status=2 applied_width=1280 applied_height=720 packet=0x5505
```

Sunshine marker:

```text
live-settings-mvp: request_id=1 operation=3 requested_value=0 requested_width=1920 requested_height=1080 applied_value=5708 applied_width=1280 applied_height=720 status=2
```

### Unsupported HEVC path

Run directory:

```text
/tmp/korri-runtime-resolution-smoke-20260526-084758-unsupported-hevc
```

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=3 status=1 applied_width=1280 applied_height=720 packet=0x5505
```

Sunshine markers:

```text
live-settings-mvp: request_id=1 operation=3 requested_value=0 requested_width=640 requested_height=360 configured_bitrate_kbps=5708 configured_fps=60 configured_width=1280 configured_height=720 queued=1
live-settings-mvp: runtime resolution unsupported encoder request_id=1 encoder=vaapi codec=hevc_vaapi
live-settings-mvp: capture_sync runtime resolution request_id=1 requested_width=640 requested_height=360 applied_width=1280 applied_height=720 status=1
```

### Gate disabled

Run directory:

```text
/tmp/korri-runtime-resolution-smoke-20260526-084837-gate-disabled
```

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=3 status=3 applied_width=1280 applied_height=720 packet=0x5505
```

Sunshine marker:

```text
live-settings-mvp: request_id=1 operation=3 requested_value=0 requested_width=640 requested_height=360 applied_value=5708 applied_width=1280 applied_height=720 status=3
```

## Build/check evidence after mechanism hardening

The final hardened mechanism is covered by the source invariant/build check:

```text
nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link
```

That check requires stable packet/operation IDs, operation `0` capability query support, reason-bearing acks with legacy parsing, explicit launch baseline tracking, timeout/no-ack and conflict markers, disabled/invalid/unsupported reason mappings, and proof-gated runtime resolution markers. No new target-client resolution smoke was run for the documentation refresh, so runtime resolution remains unproven on Sobo/SM8550.

## Regression checks for existing operations

### Runtime FPS

Run directory:

```text
/tmp/korri-runtime-settings-regression-20260526-084946-fps-regression
```

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=0 applied_fps=30 packet=0x5505
```

Sunshine marker:

```text
live-settings-mvp: capture_sync runtime FPS request_id=1 requested_fps=30 applied_fps=30 status=0
```

### Runtime bitrate

Run directory:

```text
/tmp/korri-runtime-settings-regression-20260526-085000-bitrate-regression
```

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=12000 packet=0x5505
```

Sunshine markers:

```text
live-settings-mvp: async encoder restarted for runtime bitrate request_id=1 applied_kbps=12000
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=12000 applied_kbps=12000 status=0
```

## Interpretation

Operation `3` is wired end-to-end over the experimental control path and safely distinguishes applied, invalid, unsupported, and disabled outcomes. The hardened mechanism now also distinguishes Sunshine-applied from client-proven resolution outcomes so a server ack cannot be mistaken for target-client proof.

The only applied path proven here is server-side `h264_vaapi` encoder-session replacement with a fake Moonlight client. This is intentionally weaker than the bitrate/FPS evidence because live resolution also needs client decoder/render proof. A future SM8550/v4l2m2m run must prove same-session rendering at the new dimensions, for example through `SDL renderer: created NV12 texture 640x360`, before this can be called supported on Sobo.

## Package

The carried downstream patches live at:

```text
packages/sunshine-korri/patches/0001-runtime-bitrate-restart-mvp.patch
packages/moonlight-embedded-korri/patches/0005-add-sunshine-runtime-settings-mvp.patch
```
