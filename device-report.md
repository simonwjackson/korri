# Device Report: `root@192.168.1.104`

_Last verified: 2026-05-02_

## Identity

| Field | Value |
|---|---|
| Hostname | `SM8550` |
| Hardware | **AYN Odin 2 Portal** (`ayn,odin2portal`) |
| SoC | Qualcomm Snapdragon 8 Gen 2 (`qcom,sm8550` / `qcs8550`), 8 cores aarch64 |
| RAM | 7.3 GiB (+ 3.6 GiB swap) |
| OS | **ROCKNIX** nightly `20260428` (branch `next`, build `f1aec01...`) |
| Kernel | Linux 7.0.1 SMP PREEMPT, aarch64 |
| Network | `wlan0` 192.168.1.104/24, gateway 192.168.1.1, no Ethernet |

It's a handheld Android-class gaming device (Odin 2 Portal) reflashed with **ROCKNIX**, a JustEnoughOS-derived distribution forked from EmulationStation/RetroArch ecosystems (LibreELEC lineage). Companion source tree: `~/code/sandbox/rocknix` (branch `custom`).

## Access

```bash
ssh root@192.168.1.104     # Key-based auth, no password
```

- Single user: `root`. Public key already authorized in `/storage/.ssh/authorized_keys`.
- Open ports: `22` (sshd), `139`/`445` (smbd), `111` (rpcbind), `3702` (wsdd2), `5355` (LLMNR), `1234` (EmulationStation localhost only), `4713` (pipewire-pulse localhost only).

## Filesystem layout (read this first)

ROCKNIX is an **immutable squashfs** image. The rootfs is read-only — almost everything you care about lives under `/storage`.

| Path | Notes |
|---|---|
| `/` | `/dev/loop0` (1.8 G squashfs, **read-only**, 100 % full is normal) |
| `/flash` | `/dev/sda18` boot partition, 2 G (~93 % used; do not casually fill) |
| `/storage` | `/dev/sda19` — **94.5 G writable**, 55 % used. User home, configs, ROMs, logs |
| `/var`, `/tmp`, `/run` | tmpfs (lost on reboot) |

Useful `/storage` subdirs:
- `/storage/roms/` — per-system ROM folders (`gamecube/`, `dreamcast/`, `arcade/`, `bios/`, `bezels/`, `backups/`, …)
- `/storage/games-internal/`, `/storage/games-external/` — alt game roots
- `/storage/apps/`, `/storage/cores/` — addons / libretro cores
- `/storage/.cache/`, `/storage/backup/` — runtime + config backups
- `/storage/.ssh/authorized_keys` — SSH key store
- `/storage/*.log`, `/storage/*.sh` — ad-hoc launchers and logs the user has been dropping here

## Services worth knowing

Active and relevant: `sshd`, `bluetooth*`, `pipewire`, `pipewire-pulse`, `wireplumber`, `iwd` + `connman`, `sway` + `seatd` + `essway`, `emulationstation` (`autostart` / `automount`), `inputplumber`, `input`, `smbd` + `nmbd` + `wsdd2` (Samba), `avahi-daemon`, `rocknix-memory-manager`, `batteryledstatus`, `powerstate`.

Notable: `bluetooth.service` ships **disabled** by default (preset `disabled`). Enable with `systemctl enable --now bluetooth` if you want it persistent across reboots.

## ROCKNIX-specific tooling

All under `/usr/bin/`:

| Command | Purpose |
|---|---|
| `rocknix-info` | Device / OS / battery / build info. `--short` returns `Battery: NN% - HH:MM`. |
| `rocknix-config` | Central config editor (settings under `/storage/.config/`). |
| `rocknix-settings` | Settings glue used by EmulationStation. |
| `rocknix-systems` | Lists supported emulator systems. |
| `rocknix-bluetooth` | High-level BT wrapper (see below). Backs up / restores BT pairings to `/storage/roms/backups/bluetooth.tar`. |
| `rocknix-bluetooth-agent` | Pairing agent service (`bluetooth-agent.service`, `PartOf=bluetooth.service`). |
| `rocknix-screenshot` | Capture screen via `grim` (Wayland/Sway). |
| `rocknix-keyboard`, `rocknix-touchscreen-keyboard` | On-screen input. |
| `rocknix-update` | OTA-style update flow. |
| `rocknix-memory-manager` | Background swap/zram tuning service. |
| `rocknix-scraper`, `rocknix-es-thebezelproject`, `rocknix-retroachievements-info` | EmulationStation helpers. |
| `rocknix-fake-suspend` | Soft suspend (since real S3 is iffy on this SoC). |
| `rocknix-report-stats` | Telemetry dump. |
| `emulationstation`, `retroarch`, `retroarch32` | The frontends. |

Quirks system: `/usr/lib/autostart/quirks/platforms/SM8550/` and `/usr/lib/autostart/quirks/devices/AYN Odin 2 Portal/` are the per-device override hooks; check there before patching anything global.

## Bluetooth (verified working)

Use the wrapper for normal operations:

```bash
rocknix-bluetooth list
rocknix-bluetooth enable
rocknix-bluetooth connect    AA:BB:CC:DD:EE:FF
rocknix-bluetooth trust      AA:BB:CC:DD:EE:FF
rocknix-bluetooth disconnect AA:BB:CC:DD:EE:FF
rocknix-bluetooth remove     AA:BB:CC:DD:EE:FF
rocknix-bluetooth save       # snapshots pairings to /storage/roms/backups/bluetooth.tar
rocknix-bluetooth restore
```

For raw control, `bluetoothctl` works but **must be a single piped session** (each invocation is a fresh dbus session, so agent state does not persist between `bluetoothctl --` calls). The reliable pattern that worked for the Logitech mouse pairing:

```bash
systemctl start bluetooth   # service is disabled by default
(
  echo "agent KeyboardOnly"; sleep 1
  echo "default-agent";      sleep 1
  echo "scan on";            sleep 15
  echo "scan off";           sleep 1
  echo "trust  $MAC"
  echo "pair   $MAC"
  for _ in $(seq 1 15); do sleep 1; echo "yes"; done   # auto-accept authorization prompts
  echo "connect $MAC";       sleep 4
  echo "info $MAC"
  echo "quit"
) | bluetoothctl
```

Currently paired: `MX Anywhere 3S` at `D7:5B:66:11:CD:25` (Trusted, Bonded, Connected). Auto-reconnects on boot when `bluetooth.service` is up.

## Audio / Video / Input stack

- **Display server**: Sway (Wayland) via `seatd` + `essway` (ROCKNIX's auto-launcher).
- **Audio**: PipeWire + WirePlumber + `pipewire-pulse` shim. PulseAudio TCP listener on `127.0.0.1:4713`.
- **Controllers / gamepads**: `inputplumber` + `input` services, joypad configs at `/storage/joypads/`.
- **Screenshots**: `rocknix-screenshot` (uses `grim` under Sway). Headless captures referenced as `headless-sway-grim.err`, `headless-sdl-grim.err` in `/storage` logs.

## Networking

- Managed by **`iwd` + `connman`** (`connmanctl`, `iwctl`). `NetworkManager` is **not** present.
- Samba (`smbd`/`nmbd`/`wsdd2`) shares `/storage` on LAN.
- Avahi/mDNS available — should be reachable as `SM8550.local`.
- DNS via `systemd-resolved` (`127.0.0.53:53`).

## Power / battery

Read directly from sysfs (no `upower`):

```bash
cat /sys/class/power_supply/battery/uevent | grep -E 'STATUS|CAPACITY|VOLTAGE_NOW|CURRENT_NOW'
rocknix-info --short    # "Battery: 87% - 14:32"
```

Currently: Li-ion, charging, fast charge, 2 cycles, max 4.4 V. PMIC is `qcom,sm8550-pmic-glink`.

## Updating / rebuilding

The user maintains their own ROCKNIX fork at `~/code/sandbox/rocknix` (branch `custom`, remote `simonwjackson/rocknix`). Recent custom work focuses on:
- Nix integration layers (`NIX_INTEGRATION_SUPPORT=yes` default on `custom`)
- SM8550 / nspawn experiments
- CI workflow tweaks for fork-only builds

To push a new image: build from that tree (`PROJECT=Qualcomm DEVICE=SM8550 ARCH=aarch64 make image`), flash to internal storage. OTA path via `rocknix-update` is also available.

## Gotchas

1. **`/` is read-only**. Use `/storage` for any persistent change. Edits to `/etc/*` or `/usr/*` survive only until reboot (and often not even that).
2. **`bluetoothctl` interactive vs scripted**: see Bluetooth section. `bluetoothctl --` one-shots are essentially useless for pair/trust workflows because they don't share agent state.
3. **`bluetooth.service` is disabled by default** even though most ROCKNIX UIs assume it. Enable it if BT should auto-start.
4. **`/flash` is 93 % full** — do not write there casually; it'll brick the next update.
5. **No `apt`/`pacman`/`dnf`** — package additions require rebuilding the image. Runtime tooling: `busybox`, plus what's bundled.
6. **Hostname is literally `SM8550`** — nothing personalized; mDNS lookups need that name.
7. **`netstat`/`ss`** output suggests several services bind only to localhost (EmulationStation `:1234`, PulseAudio `:4713`) — tunnel via `ssh -L` if you want at them.

## Quick recipes

```bash
# Heartbeat
ssh root@192.168.1.104 'rocknix-info --short && uptime'

# Tail EmulationStation log
ssh root@192.168.1.104 'tail -f /storage/.config/emulationstation/es_log.txt'

# Browse ROMs over SMB
smbclient //SM8550/storage -U guest

# Push a file
scp foo.zip root@192.168.1.104:/storage/roms/arcade/

# Take and pull a screenshot
ssh root@192.168.1.104 'rocknix-screenshot /tmp/s.png' && \
  scp root@192.168.1.104:/tmp/s.png .

# Pair a BT device (interactive — see Bluetooth section for the scripted version)
ssh root@192.168.1.104 'systemctl start bluetooth && bluetoothctl'
```
