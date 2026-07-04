# Runbook: `korri stream` live quality controls

Date: 2026-07-03
Status: active
Scope: operator/agent runbook for changing Moonlight/Sunshine stream quality
(bitrate, FPS, resolution) live, mid-session, on the validated Korri profile.

Governing contract: `docs/acceptance/runtime-settings-protocol-contract.md`.
This runbook is operational; it does not redefine the contract.

---

## What this does

`korri stream` connects to the **active Moonlight stream's local-control
connection point** and changes stream quality without reconnecting the stream,
restarting the encoder, or relaunching the game. It reads back the value the
host reports as *applied* so you can tell a real change from an accepted-but-not
-applied command.

- `korri stream show` — print session state, current stream quality, applied
  settings, and the last runtime command result.
- `korri stream bitrate <kbps>` — request a live bitrate change.
- `korri stream fps <n>` — request a live FPS change.
- `korri stream resolution <WIDTHxHEIGHT>` — request a live resolution change.
- `--socket <path>` — target an explicit control socket instead of discovery.

`show` is read-only (works with `observer` authority). The `set` commands
mutate the active stream and require `controller` authority (committed by
default on SM8550, see Preconditions).

---

## Preconditions (validated Korri profile)

Live quality controls are product-supported only on the validated profile.
Outside it, capability may be advertised for diagnostics but is not a support
claim.

Client (handheld running Moonlight):

- An **active Moonlight stream launched through Korri**, so the per-session
  control socket exists at
  `$XDG_RUNTIME_DIR/korri-moonlight/<sessionId>/control.sock`.
- Local control enabled with controller authority. SM8550 commits this by
  default: `host.moonlight.control = { enable = true; authority = "controller" }`
  and `host.moonlight.stream.codec = "h264"` (`rocknix-sm8550.nix`). H.264 is
  required because the runtime-settings apply path is validated on H.264 VAAPI
  only; `auto`/H.265 does not advertise the controls.

Host (machine running Sunshine):

- Patched `sunshine-korri` runtime-settings series on the validated
  `h264_vaapi` path, with the runtime-settings gate enabled
  (`SUNSHINE_LIVE_SETTINGS_MVP=1`).

---

## Local vs remote

`korri stream` targets a **locally reachable** control socket. To drive a
remote device, run it over SSH on that device:

```
# On the device itself:
korri stream show

# From your workstation, targeting a handheld:
ssh bandai korri stream show
ssh bandai korri stream bitrate 20000
```

Socket discovery picks the **newest** session socket under
`$XDG_RUNTIME_DIR/korri-moonlight/`, so a normal single active stream needs no
`--socket`. Pass `--socket <path>` only to disambiguate or when running outside
the stream's runtime environment.

---

## Procedure

1. **Confirm a stream is live and readable.**

   ```
   ssh bandai korri stream show
   ```

   Expect something like:

   ```
   session:      streaming (moonlight-<id>)
   stream now:   13388 kbps, 60 fps, 1920x1080
   applied:      13388 kbps, 60 fps, 1920x1080
   last change:  <command> -> <status>
   ```

   If you see `no running stream found`, there is no active stream (or no
   control socket); start a stream through Korri first.

2. **Request one change.** Change one setting at a time — the protocol
   serializes mutations through a single global queue.

   ```
   ssh bandai korri stream bitrate 20000
   ssh bandai korri stream fps 90
   ssh bandai korri stream resolution 1280x720
   ```

   Each `set` prints requested value, the now-applied readback, and what the
   device reports:

   ```
   requested:    20000 kbps
   now applied:  20000 kbps
   device says:  runtime.setBitrate -> applied
   was applied:  13388 kbps
   ```

3. **Read applied truth, not the request.** `accepted` is not success. A change
   is only real when the applied readback matches the request. If `now applied`
   does not match `requested`, or `device says` is not `applied`, treat it as
   not applied and inspect the status/reason.

---

## Interpreting results

`device says` maps to the caller-visible runtime-settings status:

| Status | Meaning |
|---|---|
| `applied` | Setting changed and the applied value matches the request. |
| `accepted` | Passed local validation / entered the queue; terminal result not yet observed. Re-run `show`. |
| `invalid` | Malformed or non-positive value. |
| `disabled` | Runtime-settings gate or active-session support is off. |
| `unsupported` | Not supported by this host/client/profile (e.g. wrong codec/encoder). |
| `timed-out` | No terminal host ack inside the bounded window. |
| `not-streaming` | No active stream can accept the command. |
| `unauthorized` | Control authority is `observer`, not `controller`. |
| `conflict` | Another mutation is in flight. |
| `failed` | Host attempted but could not apply, or reported success without observable applied truth. |

`unauthorized` on a `set` means the launch did not enable controller authority;
check `host.moonlight.control.authority` for that host/game in the config graph.

---

## Runtime recovery and headless adaptation

Korri-launched Moonlight sessions now start a session-scoped runtime supervisor
on the same per-session local-control socket used by `korri stream show`. The
supervisor subscribes once, starts the in-client health monitor, seeds
known-good runtime settings from applied state, and exposes the safe dispatch
path used by the adaptive controller. It closes with the managed Moonlight
session, so a later stream cannot accidentally reuse an old socket.

Automatic adaptation is **off by default** on SM8550 until device validation is
complete:

- `KORRI_STREAM_ADAPTIVE_ENABLED=0` (default/off)
- `KORRI_STREAM_ADAPTIVE_OBJECTIVE_BIAS=0.5` (0 = latency-biased, 1 = quality-biased)
- `KORRI_STREAM_ADAPTIVE_TICK_MS=5000`

When enabled for validation, the controller consumes fresh `quality.sample`
summaries and dispatches at most one setting family per tick through recovery:
bitrate first, FPS second, same-aspect resolution third. It pauses on stale or
missing samples, pending mutations, and non-live sessions. Adaptive and recovery
decisions are logged with `korri stream adaptive:` / `korri stream recovery:`
prefixes in the launching unit journal.

## Rollback / restore

For operator-driven CLI changes, restore remains a normal explicit command back
to the launch baseline. `korri stream show` reports current applied values; send
explicit `bitrate`/`fps`/`resolution` commands to return to the baseline the
stream launched with.

```
ssh bandai korri stream bitrate 13388
ssh bandai korri stream fps 60
ssh bandai korri stream resolution 1920x1080
```

---

## Device validation matrix for enabling adaptation

Keep `KORRI_STREAM_ADAPTIVE_ENABLED=0` until a human validates these on the
screen with the patched client and host builds:

1. **Fresh telemetry:** `korri stream show` displays fresh `quality.sample`
   values while a stream is live; samples go stale after stopping.
2. **Decode-stall/recovery:** a failed or timed-out adaptive resolution change
   emits a structured recovery event and returns to the last known-good setting.
3. **Never-stretch geometry:** same-aspect resolutions such as `854x480` and
   `1280x720` render without stretching; different-aspect requests remain
   rejected or coerced only when they preserve the fixed ratio.
4. **Bandwidth collapse/recovery:** constrained bandwidth lowers bitrate first
   and later raises it gradually when delivery recovers.
5. **Jitter/loss bursts:** transient RTT/loss spikes do not cause rapid
   oscillation; pending mutations pause later ticks.
6. **AP roam/link flap:** stale/no-data periods make the controller dormant;
   it resumes only after fresh samples return.
7. **Disconnect/reconnect:** old sessions close their runtime supervisor; the
   next launch owns a new active socket and fresh known-good baseline.

## Support boundary

- Product-supported: patched `sunshine-korri` + `moonlight-embedded-korri`
  series, H.264 VAAPI host path, validated Korri client/device profile.
- Automatic adaptation is validation-gated and off by default until the matrix
  above passes on target hardware.
- Other encoders, codecs, clients, host builds, and launch modes are not
  product-supported until separately validated. Diagnostic probes are labeled
  diagnostic, not support claims.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `product/surfaces/terminal/korri-cli/stream-quality.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/vendor/moonlight-embedded-korri/README.md`
- `product/vendor/sunshine-korri/README.md`
