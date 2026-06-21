# Stargrove Scramble web-runtime spike handoff

Date: 2026-06-19

## Purpose

This report captures the web-runtime benchmark spike for **Stargrove Scramble** on the actual Sobo device so a future session can pick it up without replaying the full investigation.

The immediate question was: compared with the now-working Windows build path (`gamescope-korri + FEX + Proton-GE + DXVK`), how does the public itch.io HTML/web build perform in Chromium and any minimum viable browser available from `nixpkgs`?

## Important constraints and boundaries

- Device under test was verified as **Sobo**, not assumed from prior Bandai context.
- Public itch HTML embed was used for runtime benchmarking only:
  - `https://html-classic.itch.zone/html/4625085/index.html?v=1732313745`
- No auth/payment/entitlement bypass was used.
- The web spike does **not** replace the existing instruction that itch downloadable artifacts should be resolved through `@korri:itchio` when inspecting downloadable artifacts.
- The web version is useful as a runtime/productization candidate, but the acquisition/product packaging path still needs an explicit decision.

## Device baseline

Reachable SSH alias used during this spike:

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target
```

Verified identity after system update:

```text
hostname: sobo
machine-id: 1745631064f04442a1c6625023baaa8a
current system during spike: /nix/store/z8y09fng5w4n8hbvnvm5srwl20xgj9js-nixos-system-sobo-25.11pre-git
Sway socket: /run/user/2000/sway-ipc.2000.911.sock
Wayland display: wayland-1
XDG_RUNTIME_DIR: /run/user/2000
```

Korri home/sessiond was stopped/masked runtime-only during direct launch testing so screenshots contained only the benchmarked app windows. This masking is not durable across reboot/update.

## Preceding Windows/FEX breakthrough, for comparison

Before the web spike, the Windows build had finally been made playable.

### Windows build launch path

- Game payload: `/storage/korri-run-stargrove/game/Stargrove Scramble.exe`
- Runtime: `gamescope-korri + FEX + Proton-GE + DXVK`
- Critical fix: force native DXVK `dxgi` instead of Wine builtin `dxgi`:

```sh
WINEDLLOVERRIDES='ddraw,d3d8,d3d9=n,b;dxgi=n,b;d3d11=n,b'
```

Prior failing runs mixed DXVK `d3d11.dll` with Wine builtin `dxgi.dll`, causing `D3D11CreateDevice` / DXGI factory failure:

```text
HRESULT: 0x887a0004
Failed to create a DXGI factory
```

With native DXVK `dxgi`, the game reached title and gameplay. DXVK HUD showed Turnip Adreno 740 and ~60 FPS.

### Windows evidence

Local evidence copied during the session:

```text
/tmp/stargrove-dxvk-native-dxgi-latest.png    # title/menu
/tmp/stargrove-after-space.png                # gameplay
/tmp/stargrove-after-z.png                    # gameplay
/tmp/stargrove-memory-gameplay.tsv            # process-tree memory sample
/tmp/stargrove-gamescope-fex-dxvk-native-dxgi.sh
```

On-device evidence:

```text
/storage/korri-run-stargrove/evidence-dxvk-native-dxgi/
/storage/korri-run-stargrove/stargrove-gamescope-fex-dxvk-native-dxgi.sh
```

Windows gameplay memory sample:

```text
processes: 16
RSS: 1,233,508 KiB (~1205 MiB)
PSS: 1,032,503 KiB (~1008 MiB)
Private dirty: 891,032 KiB (~870 MiB)
```

## Web runtime candidates tested

### 1. Chromium from `nixpkgs#chromium` — successful and best web candidate

Chromium was launched through `nix shell` from `/tmp`, with DevTools enabled for click/start attempts and a requestAnimationFrame sample:

```sh
/run/current-system/sw/bin/nix shell nixpkgs#chromium -c chromium \
  --no-sandbox \
  --disable-gpu-sandbox \
  --ozone-platform=wayland \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/stargrove-chromium-profile \
  --app='https://html-classic.itch.zone/html/4625085/index.html?v=1732313745'
```

Chromium launched as an app window with Sway identity:

```text
name: Created with GameMaker Studio 2
app_id: chrome-html-classic.itch.zone__html_4625085_index.html-Default
```

Initial screenshot showed the GameMaker HTML focus gate:

```text
Click to focus!
```

After focusing the Sway window and using DevTools input, Chromium advanced into actual gameplay. Important detail: the successful visual advancement happened after the Sway window was explicitly focused; before that, DevTools could see the canvas and count rAF frames but the visible frame remained on the focus gate.

Useful focus command:

```sh
su -s /bin/sh korri -c \
  'XDG_RUNTIME_DIR=/run/user/2000 WAYLAND_DISPLAY=wayland-1 SWAYSOCK=/run/user/2000/sway-ipc.2000.911.sock \
   swaymsg "[app_id=\"chrome-html-classic.itch.zone__html_4625085_index.html-Default\"] focus"'
```

A local Python CDP helper was used from the workstation through an SSH tunnel:

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config -N \
  -L 127.0.0.1:9223:127.0.0.1:9222 \
  korri-goal-target
```

The CDP helper performed:

- `Runtime.enable`
- `Page.enable`
- `Performance.enable`
- found the `<canvas>` rect
- sent canvas click and keyboard start events
- measured `requestAnimationFrame` for 10 seconds
- collected Chrome `Performance.getMetrics`

Observed CDP sample after focus:

```json
{
  "frames": 1216,
  "ms": 10001.1,
  "fps": 121.5866,
  "title": "Created with GameMaker Studio 2",
  "canvases": 1
}
```

Caveat: this is **browser requestAnimationFrame cadence**, not guaranteed GameMaker simulation FPS. Treat it as a web rendering cadence signal only. Unlike the Windows build, Chromium did not have a game/runtime HUD equivalent to DXVK HUD.

Chromium page metrics sample:

```json
{
  "JSHeapUsedSize": 16925932,
  "JSHeapTotalSize": 29335552,
  "Nodes": 613,
  "LayoutCount": 0,
  "RecalcStyleCount": 1,
  "TaskDuration": 2.00799,
  "ScriptDuration": 1.40839
}
```

Chromium rendered actual gameplay in a **1008×720 canvas inside a 1920×1080 browser surface**, not fullscreen like the Windows/gamescope path.

Evidence:

```text
/tmp/stargrove-web-chromium-initial.png                 # focus gate
/tmp/stargrove-web-chromium-after-cdp-focused.png       # gameplay
/tmp/stargrove-web-chromium-gameplay.png                # gameplay copy
/tmp/stargrove-web-chromium-memory-gameplay.tsv         # memory sample
/tmp/stargrove-chromium-cdp.txt                         # first CDP sample
/tmp/stargrove-chromium-cdp-after-focus.txt             # successful focused sample
```

On-device evidence:

```text
/tmp/stargrove-web-chromium/
  chromium.log
  initial.png
  after-cdp-start.png
  after-cdp-focused.png
  gameplay.png
  memory.tsv
  memory-gameplay.tsv
  version.json
```

Chromium gameplay memory sample:

```text
processes: 10
RSS: 1,199,724 KiB (~1172 MiB)
PSS: 610,436 KiB (~596 MiB)
Private dirty: 260,544 KiB (~254 MiB)
```

Interpretation: Chromium's RSS is close to Windows/FEX, but PSS and private dirty are much lower. PSS/private dirty are the more useful numbers here because browser processes share a large amount of mapped code/data.

### 2. Firefox from `nixpkgs#firefox` — viable, but heavier than Chromium

Firefox was launched through `nix shell` with Wayland enabled:

```sh
/run/current-system/sw/bin/nix shell nixpkgs#firefox -c firefox \
  --profile /tmp/stargrove-firefox-profile \
  --no-remote \
  --kiosk 'https://html-classic.itch.zone/html/4625085/index.html?v=1732313745'
```

Environment used:

```sh
XDG_RUNTIME_DIR=/run/user/2000
WAYLAND_DISPLAY=wayland-1
SWAYSOCK=/run/user/2000/sway-ipc.2000.911.sock
MOZ_ENABLE_WAYLAND=1
```

Sway identity:

```text
name: Created with GameMaker Studio 2 — Mozilla Firefox
app_id: firefox
```

Firefox initially reached the same `Click to focus!` gate. A small Perl `/dev/uinput` helper was used to send a real pointer click, followed by Space/Enter keypresses through the previously created keyboard uinput helper. Firefox then advanced away from the focus gate into an in-game/intro visual scene.

Firefox logs included a shader warning:

```text
GetShaderInfoLog() ->
0:2(12): error: extension `GL_EXT_shader_texture_lod' unsupported in fragment shader
```

Despite the warning, it rendered the page and advanced visually.

Evidence:

```text
/tmp/stargrove-web-firefox-initial.png          # focus gate
/tmp/stargrove-web-firefox-gameplay.png         # advanced in-game/intro scene
/tmp/stargrove-web-firefox-memory-gameplay.tsv  # memory sample
```

On-device evidence:

```text
/tmp/stargrove-web-firefox/
  firefox.log
  initial.png
  gameplay.png
  memory-gameplay.tsv
```

Firefox memory sample:

```text
processes: 12
RSS: 1,578,096 KiB (~1541 MiB)
PSS: 912,023 KiB (~891 MiB)
Private dirty: 597,032 KiB (~583 MiB)
```

Interpretation: Firefox works, but it is significantly heavier than Chromium in PSS/private dirty for this workload. It is still a viable fallback if Chromium is undesirable for product reasons.

### 3. surf / WebKitGTK from `nixpkgs#surf` — failed in this session

Attempted command pattern:

```sh
/run/current-system/sw/bin/nix shell nixpkgs#surf -c surf \
  'https://html-classic.itch.zone/html/4625085/index.html?v=1732313745'
```

With attempted environment:

```sh
GDK_BACKEND=wayland
XDG_RUNTIME_DIR=/run/user/2000
WAYLAND_DISPLAY=wayland-1
SWAYSOCK=/run/user/2000/sway-ipc.2000.911.sock
```

Result:

```text
Can't open default display
```

No useful visual or memory benchmark was captured for surf. It appears to want a display path not present/exported in this bare Sway setup, likely X11/Xwayland-oriented behavior. It may be possible to revisit with an explicit Xwayland/display bridge, but it is not currently minimum viable compared with Chromium/Firefox.

Evidence:

```text
/tmp/stargrove-web-surf/surf.log
/tmp/stargrove-web-surf/initial.png  # just bare/empty Sway capture, not useful game render
```

## Benchmark table

| Runtime | Visual result | FPS / cadence signal | RSS | PSS | Private dirty |
|---|---:|---:|---:|---:|---:|
| Windows build: gamescope + FEX + Proton-GE + DXVK native dxgi | Fullscreen gameplay | ~60 FPS DXVK HUD | ~1205 MiB | ~1008 MiB | ~870 MiB |
| Web: Chromium | Gameplay in 1008×720 canvas | ~121–124 rAF fps, not game-FPS | ~1172 MiB | ~596 MiB | ~254 MiB |
| Web: Firefox Wayland | Runs/advanced into in-game intro scene | no reliable FPS signal | ~1541 MiB | ~891 MiB | ~583 MiB |
| Web: surf/WebKitGTK | Failed to open display | n/a | n/a | n/a | n/a |

## Takeaways

1. **Chromium is the best measured web runtime.**
   - Lowest PSS and private dirty memory of the successful browser paths.
   - Successfully reaches gameplay.
   - CDP gives useful automation hooks for focus/click/start and basic page metrics.

2. **Windows/FEX gives the best packaged-game presentation.**
   - Fullscreen through gamescope.
   - Reliable DXVK HUD FPS signal.
   - Higher PSS/private dirty than Chromium.

3. **Firefox is viable but not preferred.**
   - It renders and advances, but uses much more memory than Chromium.
   - No easy FPS signal was collected.

4. **surf was not viable in this Sobo/Sway test environment.**
   - It fetched successfully but failed with `Can't open default display`.

5. **The web version is not automatically fullscreen.**
   - Chromium/Firefox screenshots show the game canvas occupying part of the 1920×1080 browser surface.
   - Productization should include a wrapper that either sets the app viewport/canvas scale or uses browser flags/CSS injection where legally/technically appropriate.

6. **The earlier Chromium focus-gate issue was solvable.**
   - Need Sway-level window focus before CDP input reliably advances the visible game.
   - CDP alone can see and count frames even while visible content appears focus-gated.

## Reproduction notes for future sessions

### Recheck device identity first

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target '
  hostname
  cat /etc/machine-id
  readlink /run/current-system
  find /run/user/2000 -maxdepth 1 -name "sway-ipc.*.sock" -print 2>/dev/null
'
```

Expected identity from this spike:

```text
hostname: sobo
machine-id: 1745631064f04442a1c6625023baaa8a
```

### Launch Chromium web app

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target '
  sock=/run/user/2000/sway-ipc.2000.911.sock
  url="https://html-classic.itch.zone/html/4625085/index.html?v=1732313745"
  rm -rf /tmp/stargrove-chromium-profile /tmp/stargrove-web-chromium
  mkdir -p /tmp/stargrove-web-chromium
  chown -R korri:korri /tmp/stargrove-web-chromium
  su -s /bin/sh korri -c "XDG_RUNTIME_DIR=/run/user/2000 WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$sock nohup /run/current-system/sw/bin/nix shell nixpkgs#chromium -c chromium --no-sandbox --disable-gpu-sandbox --ozone-platform=wayland --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir=/tmp/stargrove-chromium-profile --app=$url > /tmp/stargrove-web-chromium/chromium.log 2>&1 &"
'
```

Then focus the Sway window:

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target '
  su -s /bin/sh korri -c "XDG_RUNTIME_DIR=/run/user/2000 WAYLAND_DISPLAY=wayland-1 SWAYSOCK=/run/user/2000/sway-ipc.2000.911.sock swaymsg \"[app_id=\\\"chrome-html-classic.itch.zone__html_4625085_index.html-Default\\\"] focus\""
'
```

### Capture screenshot

```sh
ssh -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target '
  su -s /bin/sh korri -c "XDG_RUNTIME_DIR=/run/user/2000 WAYLAND_DISPLAY=wayland-1 SWAYSOCK=/run/user/2000/sway-ipc.2000.911.sock grim -o DSI-1 /tmp/stargrove-web-chromium/screenshot.png"
'
scp -F /tmp/korri-hostkeymatched-ssh_config korri-goal-target:/tmp/stargrove-web-chromium/screenshot.png /tmp/
```

### Memory sampling method

The session used a process-tree sampler rooted at the browser's parent process. For Chromium:

```sh
/tmp/sample-browser-memory.sh chromium "chromium.*stargrove-chromium-profile" /tmp/stargrove-web-chromium/memory-gameplay.tsv
```

For Firefox:

```sh
/tmp/sample-browser-memory.sh firefox "firefox.*stargrove-firefox-profile" /tmp/stargrove-web-firefox/memory-gameplay.tsv
```

If the helper no longer exists, recreate it from the conversation history or use the same logic:

1. Find root PID by `pgrep -u korri -f <browser profile pattern>`.
2. Walk descendants by PPID.
3. Sum `/proc/<pid>/smaps_rollup` fields:
   - `Rss`
   - `Pss`
   - `Private_Dirty`

## Input helpers used

A Perl keyboard uinput helper existed at:

```text
/tmp/uinput-key.pl
```

A Perl absolute-mouse uinput helper was created at:

```text
/tmp/uinput-mouse-click.pl
```

The mouse helper successfully generated real OS-level click events through `/dev/uinput`, unlike `ydotoold`, which exited immediately on this image.

`ydotool` from `nixpkgs#ydotool` was attempted, but the daemon path failed:

```text
ydotoold exited with code 2 / no usable socket
```

Do not rely on ydotoold unless you first verify it stays alive and creates a socket.

## Productization implications

### If productizing the web path

Recommended first product path:

- Use Chromium app mode as the default web runtime for Stargrove-like itch HTML games.
- Provide a Korri browser-wrapper launch companion that:
  - launches Chromium with a clean per-game user-data-dir under `/storage` or managed runtime state;
  - sets `--ozone-platform=wayland`;
  - disables sandbox only if required by the target image/runtime constraints;
  - can focus the Sway/app window;
  - can optionally send a first-click/start sequence for GameMaker HTML exports;
  - captures browser process memory for observability;
  - considers viewport/canvas scaling so users get fullscreen or centered output.

Open issue: the current Chromium rendering is not fullscreen; it is a 1008×720 canvas in the upper-left portion of a 1920×1080 browser surface. Productization should solve this if the web path is chosen as the default.

### If productizing the Windows path

Keep the native DXVK `dxgi` fix. The prior blocker was not FEX thunks or stale FEXServer; it was the DXGI override mix.

Minimum important Windows env:

```sh
WINEDLLOVERRIDES='ddraw,d3d8,d3d9=n,b;dxgi=n,b;d3d11=n,b'
```

The Windows path is heavier, but it has the best out-of-the-box fullscreen/game presentation.

## Recommended next steps

1. Decide which Stargrove runtime should be default:
   - Chromium web path: much lower PSS/private dirty, easier public HTML availability, but needs fullscreen/input product polish.
   - Windows path: proven fullscreen gameplay and reliable 60 FPS HUD, but heavier and depends on FEX/Proton/DXVK.
2. Build a small Korri web-game launch wrapper prototype around Chromium.
3. Solve fullscreen/canvas scaling for Chromium app mode.
4. Add a first-click/start automation hook only if it is acceptable UX-wise; otherwise present a controller/mouse input overlay/instruction.
5. Re-run benchmarks after fullscreen/canvas scaling, because browser memory/FPS may change.
6. Re-evaluate `surf` only if a lightweight WebKit runtime is still strategically important; it was not minimum viable here.
7. Keep Firefox as a fallback, not the preferred runtime, unless Chromium policy/packaging makes it unsuitable.

## Final recommendation from this spike

Use **Chromium web runtime** as the preferred web implementation candidate for Stargrove Scramble, but do not declare it product-ready until fullscreen/canvas scaling and launch UX are solved.

For a shippable game-like experience today, the **Windows/FEX/Proton/DXVK path** is more polished visually. For memory efficiency and web-native packaging, **Chromium is the strongest candidate**.
