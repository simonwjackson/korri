---
title: Runtime-mask essway to stop EmulationStation relaunching during Odin kiosk sessions
date: 2026-05-03
category: integration-issues
module: ROCKNIX Odin kiosk loop
problem_type: integration_issue
component: tooling
symptoms:
  - Killing emulationstation caused it to reappear a few seconds later.
  - Killing /usr/bin/start_es.sh also caused a fresh start_es.sh and emulationstation process to spawn.
  - Chromium kiosk could open, but EmulationStation still owned or competed for the handheld screen.
root_cause: config_error
resolution_type: environment_setup
severity: medium
tags: [rocknix, odin, emulationstation, essway, kiosk, systemd, chromium]
---

# Runtime-mask essway to stop EmulationStation relaunching during Odin kiosk sessions

## Problem

During the Odin iterative-validation loop, Korri needed to run in Chromium kiosk on the handheld screen without EmulationStation immediately reclaiming the session. Killing `emulationstation` directly did not work because ROCKNIX respawned it.

## Symptoms

- `pkill emulationstation` stopped the visible process briefly, then a new `emulationstation --log-path /var/log --no-splash` appeared.
- `pkill start_es.sh` also failed; both `/bin/bash /usr/bin/start_es.sh` and `emulationstation` came back.
- `systemctl stop emustation.service` was irrelevant because that unit was inactive; the live process was not in that unit.

## What Didn't Work

- Stopping or killing only `emulationstation`:

  ```bash
  pkill -f '^[e]mulationstation'
  ```

  This killed the child process, but `/usr/bin/start_es.sh` relaunched it.

- Killing only `start_es.sh`:

  ```bash
  pkill -f '^/bin/bash /usr/bin/start_es.sh'
  ```

  This killed the service main process, but systemd relaunched it because the owning unit had `Restart=always`.

- Looking at `emustation.service` first. It existed but was inactive, so it was not the live owner of the process tree.

## Solution

Inspect the process cgroup to find the real owner:

```bash
for p in $(pgrep -f '^/bin/bash /usr/bin/start_es.sh|^emulationstation'); do
  echo "PID=$p"
  cat /proc/$p/cgroup
done
```

The relevant cgroup was:

```text
/system.slice/essway.service
```

`essway.service` is the unit that runs `/usr/bin/start_es.sh` and has `Restart=always`:

```ini
[Service]
ExecStart=/usr/bin/start_es.sh
Restart=always
RestartSec=2
```

For a session-only kiosk run, runtime-mask and stop `essway.service` while leaving `sway.service` up:

```bash
ssh root@192.168.1.104 'set -euo pipefail
systemctl mask --runtime essway.service
systemctl stop essway.service || true
sleep 3
systemctl --no-pager --plain is-active essway.service || true
systemctl --no-pager --plain is-active sway.service || true
pgrep -af "^/bin/bash /usr/bin/start_es.sh" || echo start_es-stopped
pgrep -af "^[e]mulationstation" || echo emulationstation-stopped
'
```

Expected state:

```text
essway: inactive
sway: active
start_es: stopped
emulationstation: stopped
```

Then launch Chromium kiosk against Korri using the harvested Wayland env:

```bash
ssh root@192.168.1.104 'setsid sh -c "
  set -a
  . /storage/korri/.env
  set +a
  cd /storage/apps/chromium/squashfs-root
  exec ./AppRun \
    --enable-features=UseOzonePlatform \
    --ozone-platform=wayland \
    --user-data-dir=/storage/apps/chromium/profile \
    --no-sandbox \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9222 \
    --kiosk http://127.0.0.1:3100 \
    >> /storage/chromium-korri.log 2>&1 < /dev/null
" &'
```

Undo without rebooting:

```bash
ssh root@192.168.1.104 'systemctl unmask essway.service && systemctl start essway.service'
```

Rebooting also clears the runtime mask because it lives under `/run/systemd/system/`.

## Why This Works

The relaunch was not an EmulationStation behavior; it was systemd restart policy on `essway.service`. `essway.service` owns `/usr/bin/start_es.sh`, and `start_es.sh` execs `emulationstation`. Stopping children leaves systemd responsible for recreating the service main process.

Runtime-masking `essway.service` replaces the unit with `/dev/null` under `/run/systemd/system`, so systemd cannot restart it for the current boot. `sway.service` remains active, preserving the Wayland compositor Chromium needs.

## Prevention

- When a process respawns on ROCKNIX, inspect `/proc/<pid>/cgroup` before killing deeper children. The cgroup tells you which systemd unit owns the relaunch policy.
- Prefer runtime masks for temporary kiosk sessions. They are reversible and do not write persistent unit overrides into ROCKNIX's immutable system image.
- Keep Sway separate from EmulationStation in mental models: `essway.service` launches ES inside an already-running Sway session; stopping `essway` does not necessarily stop `sway.service`.
- Add a preflight to future Odin kiosk scripts that verifies:

  ```bash
  systemctl is-active sway.service
  ! systemctl is-active essway.service
  ! pgrep -f '^[e]mulationstation'
  ```

## Related Issues

- `docs/deployment/device-report.md` documents that ROCKNIX runs Sway/Wayland via `essway` and that rootfs changes under `/usr` are not persistent.
- `docs/development/odin-iterative-loop.md` documents the current Level 2 loop where the API runs on the Odin and the renderer runs on the dev machine.
