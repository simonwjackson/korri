---
title: Reverse SSH tunnel local Vite into Odin Chromium kiosk
date: 2026-05-03
category: integration-issues
module: Odin iterative validation loop
problem_type: integration_issue
component: tooling
symptoms:
  - Odin could ping the dev machine, but HTTP/TCP connections to Vite ports hung.
  - Chromium kiosk needed to load the renderer on the handheld screen, not just the dev-machine browser.
  - Direct LAN URLs such as http://192.168.1.243:3100 were unreliable from ROCKNIX.
root_cause: incomplete_setup
resolution_type: environment_setup
severity: medium
tags: [odin, rocknix, chromium, vite, ssh-tunnel, kiosk]
---

# Reverse SSH tunnel local Vite into Odin Chromium kiosk

## Problem

Korri's Level 2 Odin loop runs the renderer on the dev machine with Vite, but the developer wanted that renderer visible on the Odin's screen in Chromium kiosk. The Odin could reach the dev machine with ICMP ping, yet HTTP/TCP connections from ROCKNIX to the dev-machine Vite port hung, so opening a direct LAN URL in Chromium was not reliable.

## Symptoms

- `ping 192.168.1.243` from the Odin succeeded.
- `curl`, `wget`, and `nc` from the Odin to `192.168.1.243:3100` or `100.114.19.92:3100` hung or timed out.
- The local Vite server on the dev machine was healthy at `http://localhost:3100/`.
- Chromium kiosk could launch on the Odin, but needed a URL reachable from the Odin's own network namespace.

## What Didn't Work

- Using Vite's printed LAN URL (`http://192.168.1.243:3100/`) did not work from ROCKNIX even though ICMP worked.
- Trying the Tailscale address (`http://100.114.19.92:3100/`) had the same hanging behavior.
- Treating the issue as a Vite server problem was misleading: the dev machine could load Vite locally, and the Odin could reach localhost services once tunneled.

## Solution

Create a reverse SSH tunnel from the dev machine into the Odin. The Odin then loads `http://127.0.0.1:3100`, while SSH carries that traffic back to the dev-machine Vite server.

From the dev machine:

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -R 127.0.0.1:3100:127.0.0.1:3100 \
  root@192.168.1.104
```

Verify from the Odin before launching Chromium:

```bash
ssh root@192.168.1.104 '
  curl -sS -o /tmp/korri-index.html -w "HTTP %{http_code} size %{size_download}\n" \
    http://127.0.0.1:3100/
'
```

Expected result:

```text
HTTP 200 size 548
```

Then launch Chromium kiosk against the tunneled localhost URL using the harvested Wayland environment:

```bash
ssh root@192.168.1.104 'set -euo pipefail
pkill -f "[u]ngoogled-chromium/chrome" 2>/dev/null || true
setsid sh -c "
  set -a
  . /storage/korri/.env
  set +a
  exec /storage/bin/start-chromium-kiosk http://127.0.0.1:3100 \
    >> /storage/chromium-korri.log 2>&1 < /dev/null
" &
'
```

If screenshots are needed and `rocknix-screenshot` is disabled, use `grim` directly with the same Wayland environment:

```bash
ssh root@192.168.1.104 '
  set -a
  . /storage/korri/.env
  set +a
  grim /tmp/korri-device.png
'
scp root@192.168.1.104:/tmp/korri-device.png out/tmp/korri-device.png
```

## Why This Works

A reverse SSH tunnel inverts the direction of the problematic connection. The dev machine initiates SSH to the Odin, which already works for the iteration loop. SSH then binds `127.0.0.1:3100` on the Odin and forwards accepted connections back to the dev machine's `127.0.0.1:3100`.

That avoids relying on ROCKNIX-to-dev-machine LAN TCP reachability. Chromium sees a normal localhost URL, Vite still runs on the dev machine with HMR, and no ROCKNIX-owned files or firewall settings need to change.

## Prevention

- When opening dev-machine services on the Odin, test from the Odin first with `curl` or `nc`; do not assume Vite's LAN URL is reachable just because ping works.
- Prefer SSH reverse tunnels for device-kiosk validation when the device can SSH into or accept SSH from the dev machine but cannot reliably open arbitrary dev-machine TCP ports.
- Keep the renderer URL local to the device (`http://127.0.0.1:<port>`) once tunneled. This avoids mixed assumptions between browser origin, Vite proxying, and LAN routing.
- Use `-o ExitOnForwardFailure=yes` so the launch fails loudly if the remote port is already bound.
- Capture a screenshot with `grim` after launching Chromium to verify the handheld is showing the expected page.

## Related Issues

- `docs/development/odin-iterative-loop.md` — documents the Level 2 loop where the API runs on the Odin and Vite runs on the dev machine.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` — documents how to keep EmulationStation from competing with Chromium kiosk sessions.
- `docs/solutions/integration-issues/effect-rpc-json-dates-need-decodable-schemas-2026-05-03.md` — documents the separate browser-side RPC decode issue surfaced after Chromium successfully loaded the app shell.
