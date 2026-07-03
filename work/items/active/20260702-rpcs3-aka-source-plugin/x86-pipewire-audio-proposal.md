# Korri x86 PipeWire/PulseAudio proposal

Date: 2026-07-02
Status: Option A selected

## Trigger

Skate 3 via RPCS3 on Aka reached the post-preload/game phase, then RPCS3 emitted a top-left crash warning. The fresh RPCS3 log repeated:

```text
cellAudio: Backend stopped unexpectedly (likely device change). Attempting to recover...
Cubeb: Pause() called uninitialized
```

The user journal for the Korri-launched RPCS3 process also showed:

```text
Failed to connect to pipewire instance "Host is down"
PulseAudioService: pa_context_connect() failed
```

## Observed facts

- Aka's host PipeWire stack is configured by Mountainous host config, not Korri:
  - `services.pulseaudio.enable = false`
  - `services.pipewire.enable = true`
  - `services.pipewire.alsa.enable = true`
  - `services.pipewire.alsa.support32Bit = true`
  - `services.pipewire.pulse.enable = true`
  - `services.pipewire.jack.enable = true`
  - `services.pipewire.wireplumber.enable = true`
  - `security.rtkit.enable = true`
- Aka's user PipeWire services are healthy:
  - `pipewire.service`: active
  - `pipewire-pulse.service`: active
  - `wireplumber.service`: active
  - Pulse socket: `/run/user/1000/pulse/native`
  - PipeWire socket: `/run/user/1000/pipewire-0`
- Korri source-machine currently gives compositor/session children a private runtime directory:
  - `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor`
- Korri-launched RPCS3 inherited that private runtime directory and no audio socket overrides:
  - `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor`
  - no `PULSE_SERVER`
  - no `PIPEWIRE_RUNTIME_DIR`
- With that environment, Pulse/PipeWire clients search under the private runtime directory instead of the normal user runtime.
- Direct verification on Aka:
  - `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor pactl info` fails.
  - `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor PULSE_SERVER=unix:/run/user/1000/pulse/native pactl info` succeeds.
  - `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor PIPEWIRE_RUNTIME_DIR=/run/user/1000 pw-cli info 0` succeeds.

## Decision

Use **Option A** for x86 source machines: keep the normal logind user runtime as the process `XDG_RUNTIME_DIR`.

```text
XDG_RUNTIME_DIR=/run/user/<uid>
```

Korri-owned sockets/state should live in explicit subdirectories under that runtime, not by replacing the entire runtime root.

This makes PipeWire, PulseAudio-compatible clients, D-Bus, portals, and other freedesktop services discoverable by their normal rules. It also removes the need to repeat explicit audio variables everywhere for the normal source-machine case.

Scope this to x86 source-machine posture first. Do not globally change the base compositor/kiosk/ROCKNIX runtime contract until those paths are evaluated separately.

## Proposal

### 1. Source-machine compositor uses canonical runtime root

In `product/systems/nixos/images/source-machine.nix`, set:

```nix
services.korri.compositor.runtimeDir = lib.mkDefault "%t";
```

The base compositor module can keep its current default:

```nix
services.korri.compositor.runtimeDir = "%t/korri-compositor";
```

That keeps Option A local to source-machine composition.

### 2. Keep Korri-specific paths explicit

Continue using explicit Korri-owned subdirectories:

```text
%t/korri/sessiond.sock
%t/korri-game-stream/status.json
%t/korri-game-stream/next-launch.json
%t/sway-ipc.sock
```

`korri-compositor.nix` already publishes a stable Sway IPC symlink at:

```text
$XDG_RUNTIME_DIR/sway-ipc.sock
```

With source-machine `XDG_RUNTIME_DIR=%t`, peer units can naturally use:

```text
/run/user/<uid>/sway-ipc.sock
```

### 3. Add first-party x86 source-machine PipeWire defaults

Add a source-machine-owned audio posture, either inside `source-machine.nix` initially or as a separate module such as:

```text
product/systems/nixos/modules/korri-x86-audio.nix
```

When enabled on x86 source machines, default:

```nix
services.pulseaudio.enable = lib.mkDefault false;
services.pipewire.enable = lib.mkDefault true;
services.pipewire.alsa.enable = lib.mkDefault true;
services.pipewire.alsa.support32Bit = lib.mkDefault true;
services.pipewire.pulse.enable = lib.mkDefault true;
services.pipewire.jack.enable = lib.mkDefault true;
services.pipewire.wireplumber.enable = lib.mkDefault true;
security.rtkit.enable = lib.mkDefault true;
```

Use `mkDefault` so hosts with intentional audio topology can override without fighting Korri.

### 4. Avoid default audio escape-hatch vars

Under Option A, do **not** set these by default:

```text
PULSE_SERVER
PIPEWIRE_RUNTIME_DIR
```

Keep them available as host/plugin escape hatches for unusual topologies, but the normal source-machine contract should not need them.

### 5. Optional audio readiness gate

Add a lightweight source-machine audio readiness check only if launch races persist:

- Wait for `%t/pulse/native`.
- Wait for `%t/pipewire-0`.
- Run `pactl info`.
- Run `pw-cli info 0`.

Order source-machine services after it if needed:

- `korri-compositor.service`
- `korri-sessiond.service`
- `korri-sunshine.service`

This should be a readiness/order guard, not a socket-path override mechanism.

## Aka-specific immediate fix

For Aka, the preferred minimal fix is the source-machine runtime change:

```nix
services.korri.compositor.runtimeDir = lib.mkDefault "%t";
```

Because `source-machine.nix` derives sessiond environment values from `compositorCfg.runtimeDir`, this should change launched RPCS3/Gamescope children from:

```text
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor
```

to:

```text
XDG_RUNTIME_DIR=/run/user/1000
```

Then normal discovery should find:

```text
/run/user/1000/pulse/native
/run/user/1000/pipewire-0
/run/user/1000/bus
```

without explicit audio variables.

## Validation plan

- Nix/module checks:
  - Prove source-machine sets `services.korri.compositor.runtimeDir = "%t"` by default.
  - Prove source-machine PipeWire defaults are enabled on x86.
  - Prove the base compositor module still defaults to `%t/korri-compositor` outside source-machine.
- Aka live validation:
  - Deploy with the source-machine runtime change.
  - Confirm `systemctl --user show korri-sessiond.service -p Environment` has `XDG_RUNTIME_DIR=/run/user/1000`.
  - Confirm a Korri-launched RPCS3 process has `XDG_RUNTIME_DIR=/run/user/1000`.
  - Confirm RPCS3 log no longer shows `Failed to connect to pipewire instance` or `PulseAudioService: pa_context_connect() failed` at launch.
  - Confirm Sunshine no longer logs `Couldn't connect to pulseaudio: Access denied` and stream audio is present.
  - Launch Skate 3 through Korri and verify it gets beyond the prior Cubeb failure point.

## Risks and mitigations

- Risk: if a source-machine host uses the same Unix user for a normal desktop and Korri at the same time, sharing `%t` can make compositor socket names collide or become ambiguous.
  - Mitigation: source-machine should normally be an appliance session. Hosts that intentionally co-run a desktop can override `services.korri.compositor.runtimeDir` or socket/display naming.
- Risk: moving Sway from `%t/korri-compositor` to `%t` exposes more runtime sockets to launched games.
  - Mitigation: this is the standard logind user-session contract and matches what desktop game launchers expect. Korri-specific control sockets still stay in explicit protected subdirectories.
- Risk: ROCKNIX/kiosk assumptions differ.
  - Mitigation: keep the change in source-machine composition only.

## Non-goals

- Do not make this part of the RPCS3 plugin; audio substrate is source-machine platform policy.
- Do not change ROCKNIX audio routing.
- Do not globally remove the base compositor module's private runtime default.
- Do not encode Aka's USB/SPDIF sink as a Korri default. Sink choice remains host/device policy; Korri only guarantees a standard reachable audio runtime by default on x86 source machines.
