# Runtime-session contract — validation

Date: 2026-07-02
Branch: `refactor/korri-runtime-session-contract` (off `trunk`)

## CI / Nix eval checks (done)

Run from the worktree:

```
nix build .#checks.x86_64-linux.korri-source-machine-module \
          .#checks.x86_64-linux.korri-source-machine-image \
          .#checks.x86_64-linux.korri-rk3326-kiosk-config --no-link
```

- `korri-source-machine-module`: PASS — asserts `compositor.runtimeDir == "%t"`, existing user bus `unix:path=%t/bus` on the compositor + sessiond units, and x86 PipeWire/Pulse/WirePlumber/ALSA-32bit/JACK/RTKit defaults.
- `korri-source-machine-image`: PASS — same contract on the full source-machine system, plus `sessiondEnv.XDG_RUNTIME_DIR == "%t"` and `SWAYSOCK == "%t/sway-ipc.sock"`.
- `korri-rk3326-kiosk-config`: PASS — characterizes RK3326's canonical `%t` runtime, substrate-audio remap into the Korri runtime user, disabled per-user PipeWire graph, and preserved sessiond/inputd Pulse bridge envs.

`korri-sm8550-kiosk-config` and `korri-rk3566-kiosk-config` evaluate green (assertions pass; `nix eval .drvPath` resolves). Their final rendered-YAML step builds aarch64 target artifacts, which only complete on a CI host with an aarch64 builder/substituter — not on this x86 dev host.

RED-first evidence: the three new source-machine assertions failed before the module change landed (`- source-machine compositor uses the canonical logind runtime root`, `- source-machine shares the existing user session bus`, `- source-machine provides x86 PipeWire audio defaults`).

Known pre-existing failure (not from this work): `korri-compositor-module` fails on clean trunk with `compositor+kiosk: gamescope is on the session PATH`. Captured in backlog `01KWJGP6JA917PWN6TQAGRMJP6`.

## Aka device validation (pending — requires deploy)

This is the real proof of the sound fix. It requires deploying the Korri source-machine system to Aka with this branch as the Korri input (Mountainous host config enables `services.korri.rpcs3`). Device deploy mutates a live host and has a known unrelated bootloader recursion issue, so run it deliberately.

Checks to run on Aka after deploy:

- `systemctl --user show korri-sessiond.service -p Environment` includes:
  - `XDG_RUNTIME_DIR=/run/user/1000`
  - `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`
  - `SWAYSOCK=/run/user/1000/sway-ipc.sock`
- `systemctl --user show korri-sunshine.service -p Environment` shows `XDG_RUNTIME_DIR=/run/user/1000` (not `/run/user/1000/korri-compositor`).
- A Korri-launched RPCS3 process: `tr '\0' '\n' < /proc/$(pgrep -n rpcs3)/environ | grep -E 'XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS'` shows the canonical values.
- Audio sockets reachable in the session: `pactl info` and `pw-cli info 0` succeed with default env.
- Fresh RPCS3 log (`~/.config/rpcs3/RPCS3.log`) no longer shows `Failed to connect to pipewire instance` or `PulseAudioService: pa_context_connect() failed` at launch.
- Sunshine log no longer shows `Couldn't connect to pulseaudio: Access denied`; a Moonlight stream carries audio.
- Launch Skate 3 through Korri and confirm it gets past the prior Cubeb `Pause() called uninitialized` failure with audio.

Expected healthy signal: RPCS3/Sunshine connect to `/run/user/1000/pulse/native` and `/run/user/1000/pipewire-0` with no explicit `PULSE_SERVER`.

Rollback: revert the source-machine `runtimeDir`/`sessionBus` defaults (or override `services.korri.compositor.runtimeDir` back to `%t/korri-compositor` with `lib.mkForce`) — but that reinstates the audio regression, so prefer fixing forward.
