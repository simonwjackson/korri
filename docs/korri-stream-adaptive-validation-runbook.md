# Korri adaptive stream validation runbook

Created: 2026-07-06
Updated: 2026-07-07

This runbook gates adaptive stream-quality changes on SM8550 devices. It validates the continuous adaptive controller, conservative startup policy, preflight startup selection, and health-driven early downshift without relying on a physical walk or cellular network.

## Scope

- Keep `h264_vaapi` as the proven Sunshine path.
- Validate bitrate/FPS/resolution decisions from pure tests first.
- Validate the full Moonlight/Sunshine path with Linux `tc netem` shaping from the source/host side (aka), not Bandai.
- Treat real-device visual confirmation as the final human gate.
- Preserve the product rule: **playable first, pretty later**.

## Preflight cleanup gate

Before any device-backed run, prove there is no stale shaping or active stream residue:

```sh
ssh aka 'sudo tc qdisc del dev eno1 root 2>/dev/null || true; tc qdisc show dev eno1 | head -5'
korri stream show || true
```

If validating on Bandai, also confirm session state is sane:

```sh
korrid_query --host bandai --command session-status
```

## Pure test gate

Run the focused product slices before device validation:

```sh
bun test \
  product/platform/stream/stream-adaptive-boundaries.test.ts \
  product/platform/stream/stream-preflight.test.ts \
  product/platform/stream/stream-handoff-trigger.test.ts \
  product/platform/stream/stream-adaptive-controller.test.ts \
  product/platform/stream/stream-adaptive-runner.test.ts \
  product/surfaces/terminal/korri-cli/launch-command.test.ts \
  product/surfaces/terminal/korri-cli/stream-quality.test.ts \
  product/apps/portal/api/library/launch.rpc-handler.test.ts
```

Confirm coverage for:

- bitrate `floor..startup..ceiling` grammar;
- high ceiling with conservative startup;
- optional preflight filling missing startup;
- required preflight rejecting before remote prepare;
- health-primary early downshift;
- hint-only handoff signals ignored while health is good;
- boundary/startup and early-downshift event observability in `korri stream show`/JSON state.

## Safe high-envelope launch scenario

The high-ceiling validation profile is:

```text
resolution envelope: 640x360..1920x1080
fps envelope:        30..120
bitrate policy:      500k..6m..40m
```

Expected behavior:

- Moonlight launches at `1920x1080 / 120fps` so later recovery is not trapped by a low launch envelope.
- Moonlight launch bitrate is the startup value (`6000 kbps`), not the ceiling (`40000 kbps`).
- Adaptive boundaries still retain floor/startup/ceiling so the controller can shed to `500 kbps` and later grow toward the ceiling.

Example direct launch shape for RPC/manual validation:

```ts
override: {
  moonlight: {
    stream: {
      resolution: { width: 1920, height: 1080 },
      fps: 120,
      bitrateKbps: 40000,
      codec: "h264",
    },
  },
},
streamBoundaryArgs: [
  "bitrate=500k..6m..40m",
  "fps=30..120",
  "resolution=640x360..1920x1080",
]
```

Persisted stream defaults should use the unified Moonlight config surface, not
boundary-arg strings or a separate adaptive namespace:

```yaml
host:
  moonlight:
    stream:
      resolution:
        min: { width: 640, height: 360 }
        start: { width: 1280, height: 720 }
        max: { width: 1920, height: 1080 }
      fps: 120
      bitrateKbps:
        min: 500
        start: 6000
        max: 40000
```

`streamBoundaryArgs` remain a launch/RPC/manual validation override surface.
When both are present, explicit boundary args override configured defaults for
that launch.

## Preflight startup selection scenario

When a remote Moonlight launch has an explicit bitrate ceiling but no startup, optional preflight must fill a conservative startup before source prepare:

```text
input:  bitrate=500k..40m
output: bitrate=500..3000..40000 when v1 facts are unavailable
```

Expected behavior:

- Optional/auto mode warns but proceeds with the conservative startup.
- Required mode rejects before `app.server.stream.prepare`, so no stale source intent is left behind.
- Explicit startup remains authoritative: `bitrate=500k..6m..40m` is not silently lowered. If required mode decides it is unsafe, it rejects instead of rewriting policy.

## Full-stack netem gate

Shape from aka (`eno1` in current lab setup):

```sh
ssh aka 'sudo tc qdisc add dev eno1 root netem delay 55ms 15ms rate 6mbit loss 2%'
# ...run launch / observe...
ssh aka 'sudo tc qdisc del dev eno1 root 2>/dev/null || true'
```

Legacy helper scenarios remain useful:

```sh
DEVICE=aka IFACE=eno1 tools/testing/netem/stream-drive.sh slope
DEVICE=aka IFACE=eno1 tools/testing/netem/stream-drive.sh cliff
DEVICE=aka IFACE=eno1 TUNNEL_SECONDS=8 tools/testing/netem/stream-drive.sh tunnel
DEVICE=aka IFACE=eno1 tools/testing/netem/stream-drive.sh clear
```

Expected outcomes:

- startup-low/high-ceiling: no launch-time multi-second RTT flood before the first adaptive correction;
- startup-low/high-ceiling under shaping: after any healthy-link ramp, the shaped link must converge without manual intervention to the playable floor (`500 kbps / 30 fps / 640x360` for the profile above). Resolution-only rescue is a failure, even if RTT improves afterward;
- slope: bitrate/FPS adjust before resolution; no rapid resolution flap;
- cliff: large immediate shed with a visible but controlled quality drop;
- early downshift: rising RTT plus falling delivery triggers `early-downshift` before a full stale/cliff panic;
- tunnel/outage: hold/reconnect/resume path signals clearly; reconnect behaves like establishing/cold start;
- recovery: bitrate, FPS, and resolution climb gradually within explicit clamps.

Observe with:

```sh
korri stream show
korri stream --watch --json
```

Check these fields separately:

- applied stream state: current bitrate/FPS/resolution readback;
- policy: serialized boundaries, especially `bitrate=500..6000..40000`;
- event context: last adaptive event, including `early-downshift` reason/evidence and `shed-converging` unresolved levers when rescue has not fully reached the floor.

If the event context reports pending or failed commands, capture it as diagnostic evidence and treat the validation as incomplete until applied readback reaches the floor without manual intervention.

## Post-run cleanup gate

Always finish by clearing shaping and stopping the stream/session:

```sh
ssh aka 'sudo tc qdisc del dev eno1 root 2>/dev/null || true; tc qdisc show dev eno1 | head -5'
korri stream bitrate 500 || true
# stop via the active session-control surface for the target device, then verify home/idle
korrid_query --host bandai --command session-status
```

## Enablement rule

Do not default high `1080p120 / 40Mbps` ceilings without this slice enabled. A high-ceiling launch must start conservatively, preflight must fill or reject unsafe missing startup policy, and adaptive shed convergence must reach the playable floor before control commands are starved.
