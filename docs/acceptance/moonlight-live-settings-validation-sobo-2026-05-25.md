# Moonlight live-settings validation — Sobo

## Status

Host-side implementation and dry-run harness validation are complete. Real Sobo streaming evidence is still pending.

This acceptance record is intentionally split so we do not confuse local harness proof with device proof:

- **Completed:** patch stack applies, Moonlight builds, validation harness syntax/static checks pass, local dry-run produces evidence directories.
- **Pending:** active Sobo stream with an unmodified Sunshine host, v4l2m2m decode, IDR validation request, unsupported live-bitrate log, and launch-time bitrate comparison.

---

## Scope

This validation covers the Moonlight-only boundary before Sunshine protocol work:

1. Invoke the existing `LiRequestIdrFrame()` active-session API from patched Moonlight.
2. Log live bitrate mutation as explicitly unsupported without sending custom Sunshine packets or reconnecting.
3. Capture launch-time bitrate evidence through the existing `MOONLIGHT_BITRATE_KBPS` path.

It does **not** validate true live bitrate mutation, live resolution/FPS changes, Sunshine ack/error packets, or encoder reconfiguration.

---

## Build / host-side checks

Branch: `explore/sunshine-live-settings-validation`

Build output:

```text
/nix/store/8yxj5gj6cnpcxrwrnbwibjqzwpkkcyws-moonlight-embedded-2.7.1-sm8550-v4l2m2m
```

Commands run:

```sh
scripts/verify-moonlight-live-settings-validation-patch
nix eval --impure --expr '(import packages/moonlight-embedded/manifest.nix).version'
guest/scripts/static-checks.sh
nix build .#moonlight-embedded --print-build-logs
```

Results:

| Check | Result |
|---|---|
| Patch verification | passed |
| Manifest eval | passed: `"2.7.1-sm8550-v4l2m2m"` |
| Static checks | passed |
| Moonlight package build | passed |

---

## Local dry-run harness proof

Dry-run command shape:

```sh
tmp=$(mktemp -d)
mkdir -p "$tmp/keydir"
MOONLIGHT_RUNS_DIR="$tmp/runs" \
MOONLIGHT_BIN=/run/current-system/sw/bin/true \
MOONLIGHT_GAMESCOPE_BIN=/run/current-system/sw/bin/true \
MOONLIGHT_KEYDIR="$tmp/keydir" \
MOONLIGHT_AUDIO_GATE=0 \
MOONLIGHT_DURATION_S=1 \
guest/launchers/remote-moonlight-live-settings-validation.sh dryhost Desktop
```

Representative local evidence root:

```text
/tmp/tmp.ac5M7HoN9l/runs/20260525-190536-live-settings-validation-v4l2m2m-Desktop
```

What this proves:

- The temporary spike harness runs all four scenarios.
- Child evidence directories are unique per scenario.
- `env.txt`, `launch.log`, `signals.txt`, `telemetry-summary.txt`, and `network-summary.txt` are produced by each child run.
- The harness defaults primary validation to `MOONLIGHT_PLATFORM=v4l2m2m`.

What this does **not** prove:

- Sobo can stream with these hooks enabled.
- Sunshine receives or honors the IDR request.
- Bitrate changes live during an active session.

---

## Pending Sobo validation command

Use the built Moonlight closure from the successful Nix build, paired keydir, and an unmodified Sunshine host:

```sh
MOONLIGHT_BIN=/nix/store/8yxj5gj6cnpcxrwrnbwibjqzwpkkcyws-moonlight-embedded-2.7.1-sm8550-v4l2m2m/bin/moonlight \
MOONLIGHT_KEYDIR=/storage/.cache/moonlight \
MOONLIGHT_PLATFORM=v4l2m2m \
MOONLIGHT_DURATION_S=30 \
MOONLIGHT_AUDIO_GATE=0 \
MOONLIGHT_VALIDATE_IDR_AFTER_S=5 \
guest/launchers/remote-moonlight-live-settings-validation.sh <sunshine-host> Desktop
```

If audio is part of the run, remove `MOONLIGHT_AUDIO_GATE=0` and verify PipeWire/WirePlumber first.

---

## Device evidence fields to fill

| Field | Value |
|---|---|
| Device | Sobo |
| Sunshine host | pending |
| Sunshine app | pending |
| Moonlight closure | `/nix/store/8yxj5gj6cnpcxrwrnbwibjqzwpkkcyws-moonlight-embedded-2.7.1-sm8550-v4l2m2m` |
| Parent evidence dir | pending |
| IDR scenario dir | pending |
| Unsupported bitrate scenario dir | pending |
| Launch-time low bitrate dir | pending |
| Launch-time high bitrate dir | pending |

---

## Acceptance interpretation

### Proven now

- The downstream Moonlight package has default-off validation hooks.
- The hooks are documented and manifest-listed.
- The package builds with the hooks.
- The remote runner captures the new validation env, network summary, and signal patterns.
- The temporary spike harness can orchestrate the validation scenarios without Sunshine changes.

### Requires Sobo run

- Same-session active-stream IDR request proof.
- Post-request IDR observation, if the host emits one in the evidence window.
- Unsupported live-bitrate log during an actual stream.
- Launch-time bitrate comparison on the real network path.

### Explicitly not proven

- Sunshine runtime-settings protocol support.
- Structured Sunshine ack/error response.
- Active encoder bitrate reconfiguration.
- Live resolution/FPS/HDR/codec changes.
