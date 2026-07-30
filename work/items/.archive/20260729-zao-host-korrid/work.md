# zao host korrid — smallest Rust host slice

- id: 20260729-zao-host-korrid
- status: completed
- created: 2026-07-29
- completed: 2026-07-29
- plan: plan.md
- host: zao (NixOS x86_64; LAN `192.168.1.243`; Tailscale `100.114.19.92`)
- deployment stance: nix profile + systemd user services; NO NixOS host-config changes

## Provisioning ledger

### Capture session and Sunshine

- The first headless gamescope attempt was rejected after the device gate: Sunshine's X11 capture saw gamescope's blank Xwayland root rather than its compositor output.
- The working capture session is an enabled systemd user unit at `~/.config/systemd/user/x11-headless.service`. It runs profile-installed Xorg Server 21.1.21 as:
  - `~/.nix-profile/bin/Xvfb :0 -screen 0 1920x1080x24 -nolisten tcp -noreset`
- Sunshine `2025.924.154138-korri` runs as the enabled user unit `~/.config/systemd/user/sunshine.service`, ordered after and requiring `x11-headless.service`.
  - `ExecStartPre=%h/.local/libexec/wait-for-x11` waits for `/tmp/.X11-unix/X0`.
  - `Environment=DISPLAY=:0` and `ExecStart=/run/current-system/sw/bin/sunshine %h/.config/sunshine/sunshine.conf`.
  - NVENC and VAAPI probes fail against the headless output; Sunshine selects `libx264` and reports `Streaming display: screen with res 1920x1080`.
- Mutable Sunshine config lives under `~/.config/sunshine/`; `apps.json` contains the stable `Korri Stream` app.
- The tablet was paired manually. `sunshine_state.json` remains present across Sunshine service restarts.
- Tablet exit gate: selecting `Neverball (zao)` started a zao Neverball process, Sunshine logged `CLIENT CONNECTED`, and the game was visible and playable in the tablet stream.
- Pointer input does not yet reach the Xvfb-hosted game. This is outside the gamepad-oriented stream-visibility gate and is parked as backlog item `01KYRM9JYT8PE3J7N9RW78HG7G`.

### korrid host

- The flake package is installed through `nix profile`; the enabled user unit is `~/.config/systemd/user/korrid.service`.
- The unit runs `%h/.local/state/korrid/current/bin/korrid`. The atomic deployment pointer currently resolves to `/nix/store/gmmbrdk5qjykhpba4s7yl5l9l9ppzbh4-korrid-0.0.0/bin/korrid`.
- Host mode binds `0.0.0.0:43117` and reads `~/.config/korrid/host.toml`.
- Host config label: `zao`; game: `neverball`; display: `:0`; command: `~/.nix-profile/bin/neverball`; catalog title: `Neverball (zao)`.
- Native catalog and prepare probes succeeded. Repeated prepare is idempotent while the child lives, immediate exits are failures, and finished children are reaped.
- Canonical deployment command:
  - `nix develop .#korrid --command just --justfile services/korrid/justfile push-zao`
- The final warm build/copy/profile-switch/restart/health loop completed in 14 seconds (13 seconds measured inside the deploy script), below R7's one-minute limit.
- Deployment handoff uses a private remote temporary directory. A deliberately invalid candidate was rejected and automatically restored the previous binary pointer, host config, systemd unit, revision record, and healthy service.

### Android brain configuration

- Per-host configuration is read from `/sdcard/korri-retro/upstreams.json` by the embedded brain.
- Ordered entries on the tablet:
  1. legacy aka at `http://192.168.1.117:3001`
  2. native zao at `http://100.114.19.92:43117`
- zao uses Tailscale because the tablet could not reach zao's LAN address directly.
- A cold Android process can briefly see the external-storage config as missing. The registry now defers and retries a missing file-backed configuration at operation time; an on-device force-stop/start retained the merged catalog.

## Exit gates

- R1: `korrid.service` is enabled and active as a user service; no NixOS host configuration was changed.
- R2: zao serves the hand-written Neverball catalog over native tagged `/rpc`.
- R3: prepare launches Neverball on `DISPLAY=:0`; the game is visible in zao's stream.
- R4: the tablet's merged catalog contains aka through the legacy wire and zao through the native wire.
- R5: the labelled zao game attached to zao's paired `Korri Stream`, confirmed visually and by zao's Sunshine logs.
- R6: the ordinary aka Neverball entry still prepared and streamed successfully after the zao journey.
- R7: the scripted final warm deployment loop completed in 14 seconds.

## Validation record

- `./services/korrid/check.sh`: passed, including 56 Rust library tests, 2 binary tests, Typeshare generation checks, TypeScript checking, host HTTP smoke, portal production build, four Android Rust targets, and debug APK assembly.
- `nix develop .#korrid --command just portal-check`: passed.
- `nix build path:.#korrid --no-link`: passed.
- `./services/korrid/android-smoke.sh`: passed with the merged aka + zao catalog.
- Forced Android cold restart + live catalog probe: passed with `Neverball (zao)` retained.
- Deliberately invalid zao deployment: rejected; automatic rollback restored binary, config, unit, revision, and service health.
- Manual tablet journeys: zao visible/playable and aka regression both passed.
