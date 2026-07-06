# Korri adaptive stream validation runbook

Created: 2026-07-06

This runbook gates enabling `KORRI_STREAM_ADAPTIVE_ENABLED=1` on SM8550 devices. It validates the continuous adaptive stream-quality controller without requiring a physical walk or cellular network.

## Scope

- Keep `h264_vaapi` as the proven Sunshine path.
- Validate bitrate/FPS/resolution decisions from the pure scenario harness first.
- Validate the full Moonlight/Sunshine path with Linux `tc netem` shaping.
- Treat real-device visual confirmation as the final human gate.

## Pure replay gate

Run the stream platform tests and confirm the scenario harness covers:

- gentle slope: small bitrate steps, no resolution flapping;
- cliff: immediate shed, `mode=shed`, fast-down/slow-up behavior;
- cold start: conservative opening then ramp on fresh samples;
- clamp/pin: pinned levers never move;
- outage: sustained zero throughput enters hold and re-establishes on return.

## Full-stack netem gate

Use `tools/testing/netem/stream-drive.sh` from a trusted operator shell. Example:

```sh
DEVICE=aka IFACE=<host-egress-iface> tools/testing/netem/stream-drive.sh slope
DEVICE=aka IFACE=<host-egress-iface> tools/testing/netem/stream-drive.sh cliff
DEVICE=aka IFACE=<host-egress-iface> TUNNEL_SECONDS=8 tools/testing/netem/stream-drive.sh tunnel
DEVICE=aka IFACE=<host-egress-iface> tools/testing/netem/stream-drive.sh clear
```

Observe from the device with the first-class surface available in the build (`korri stream show` today; `korri stream --watch` once U8 is wired). Expected outcomes:

- slope: bitrate/fps adjust before resolution; no rapid resolution flap;
- cliff: large immediate shed with a visible but controlled quality drop;
- tunnel: hold/reconnect/resume path signals clearly; reconnect behaves like cold-start;
- recovery: bitrate, FPS, and resolution all climb back within their clamps.

## Enablement rule

Do not flip `KORRI_STREAM_ADAPTIVE_ENABLED=1` until the pure replay gate and full-stack netem gate both pass on the target device profile. If the gate fails, leave the flag off and use the telemetry trace as the replay fixture for the next controller-tuning pass.
