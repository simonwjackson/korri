---
title: Non-destructive stock OS recon via EmulationStation launchers on R36T MAX
date: 2026-05-27
category: workflow-issues
module: r36t-max-stock-retromax-emuelec-recon
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - "Reconnoitering stock RetroMax or EmuELEC handhelds with no SSH, telnet, or web access"
  - "A handheld boots from internal eMMC while the removable SD card is ROM/data-only"
  - "The only safe writable surface is an SD card that EmulationStation can scan"
  - "Vendor menu entries are theme-dependent or hidden behind custom launcher scripts"
  - "Hardware facts are needed before attempting NixOS, CFW, or KORRI runtime work"
symptoms:
  - "Device responds to ping but remote shell and web service ports are closed"
  - "The SD card has an EEROMS-style ROM tree but no boot or rootfs partition"
  - "Dropping a shell script into applyCenter does not create a visible launch tile"
  - "Online docs name user-facing tiles that are absent from the actual stock menu"
related_components:
  - "docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md"
  - "docs/solutions/best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md"
  - "docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md"
  - "docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md"
tags: [r36t-max, rk3326, emuelec, retromax, emulationstation, reconnaissance, handheld, nixos, ssh, dropbear, suspend, nix-portable, mali-g31]
---

# Non-destructive stock OS recon via EmulationStation launchers on R36T MAX

> _2026-05-27 extension_: this doc was expanded from a pure pre-shell recon writeup
> into the full stock-OS bringup recipe for the R36T MAX. The original recon section is unchanged;
> a new “Beyond recon” section captures the post-shell techniques (persistent SSH, suspend defeat,
> Nix on stock EmuELEC, vendor Mali ABI probe). If you only need pre-shell recon, stop after the
> “Confirmed R36T MAX facts” table.

## Context

The AISLPC R36T MAX looked, from web research, like a normal RK3326 handheld: 1 GB RAM, a 720×720 panel, EmuELEC/RetroMax stock OS, and a likely Rockchip mainline path. But two facts needed live confirmation before making any NixOS or KORRI plan:

1. **Where does it actually boot from?** Some sources implied a single SD-card device; the unit booted without the SD card installed.
2. **How do we get facts from the stock OS?** The device was reachable by ping (`192.168.1.200`, later `192.168.1.227`) but all normal remote entry points were closed: SSH, telnet, web UI, and common alternate ports.

Mounting the SD card on `yuki` showed a single removable partition:

```text
/dev/sdb1  58.4G  vfat  EEROMS
```

It contained ROM folders, artwork, and a few shell scripts, but no boot partition and no root filesystem. That means the R36T MAX is an **eMMC-boot handheld with SD ROM/data storage**, not an SD-boot handheld.

The first attempt to add a diagnostic script under `applyCenter/` did not work. Existing files such as `Downloader.sh` and `Friendly Reminder.sh` were not generic launcher entries; they were thin wrappers that call binaries and assets living on internal eMMC under `/storage/.config/emulationstation/...`. Online reviews mentioned tiles such as “Help Line” and “Downloader,” but the actual stock menu only showed console systems, All Games, and Favorites. The route to a shell was therefore not network access or one named menu tile — it was EmulationStation’s script-launching conventions.

## Guidance

### 1. Classify the storage shape first

Do not assume “has an SD card” means “boots from the SD card.” On a host, start with the removable partition table:

```sh
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT,TYPE,RM
blkid /dev/sdX1
```

If the card is a single FAT/VFAT volume with folders such as `gba/`, `snes/`, `psx/`, `ports/`, `manual/`, `tools/`, `applyCenter/`, or `downloads/`, and the device boots without that card, treat it as:

```text
internal eMMC: boot + root + writable storage
external SD:   ROMs, themes, update/drop-in surface
```

That changes the work plan:

- Reflashing the SD will not replace the stock OS.
- The SD is still a safe injection surface because the stock frontend scans parts of it.
- Hardware facts must be captured from inside the running stock OS before touching boot media.
- Internal eMMC becomes rollback/fallback state; do not mutate it during recon.

### 2. When SSH is absent, use a launcher payload rather than fighting the network

For the R36T MAX, network reachability was a false lead:

```text
ping: works
22/tcp ssh: closed
23/tcp telnet: closed
80/tcp http: closed
common alternate ports: closed
```

The successful path was to place a reusable recon runner on the SD and expose it through as many EmulationStation-visible launcher surfaces as possible.

The final structure was deliberately broad:

```text
/storage/roms/
  .r36t-recon-runner.sh
  ports/R36T Recon.sh
  tools/R36T Recon.sh
  manual/R36T Recon.sh
  applyCenter/R36T Recon.sh
  downloads/R36T Recon.sh
  ports_scripts/R36T Recon.sh
  tic-80/R36T Recon.sh
```

Each launcher was tiny:

```sh
#!/bin/sh
for CAND in /storage/roms /roms /var/media/EEROMS /media/EEROMS /run/media/EEROMS; do
  if [ -x "$CAND/.r36t-recon-runner.sh" ]; then
    sh "$CAND/.r36t-recon-runner.sh"
    sync
    exit 0
  fi
done
exit 1
```

The runner wrote only to the SD card:

```text
/storage/roms/r36t-max-recon.txt
/storage/roms/R36T-RECON-COMPLETE.flag
```

### 3. Prefer broad, reversible visibility over one guessed menu name

The R36T MAX stock UI did not expose the expected “Help Line” tile. The fix was not to keep guessing labels; it was to maximize safe launch opportunities:

- Add a top-level `ports/R36T Recon.sh` launcher.
- Add a `gamelist.xml` entry for `ports/` so EmulationStation has metadata.
- Add the same launcher to `tools/`, `manual/`, `applyCenter/`, `downloads/`, `ports_scripts/`, and one already-visible lightweight system (`tic-80/`).
- Patch existing SD-side scripts (`Downloader.sh`, `Friendly Reminder.sh`, `User Manual.sh`, `PortMaster.sh`) to call the runner first.
- Preserve every original as `*.aislpc-original` before changing it.

That turns a theme-dependent UI problem into a deterministic recovery surface: if any one of the common launcher systems appears, recon can run.

### 4. Keep recon non-destructive and idempotent

The recon runner should not install services, remount `/flash`, edit eMMC, or modify system config. It should collect facts and leave a flag.

Minimum useful probes:

```sh
uname -a
cat /etc/os-release
cat /proc/cpuinfo
cat /proc/meminfo
cat /proc/cmdline
cat /sys/firmware/devicetree/base/compatible | tr '\0' '\n'
cat /sys/firmware/devicetree/base/model
zcat /proc/config.gz | grep -E 'CONFIG_(USER_NS|CGROUP|SUSPEND|MALI|DRM_PANEL|RKVDEC|HANTRO|WLAN|RTL|BRCM)'
lsmod
find /lib/firmware -maxdepth 3 -type f
lsblk
cat /proc/mounts
ip addr
cat /sys/power/state
cat /sys/power/mem_sleep
ls /sys/class/drm
ls -la /dev/video* /dev/media* 2>/dev/null
find / -xdev \( -name 'libmali*' -o -name 'libGLESv2*.so*' -o -name 'libEGL*.so*' \)
dmesg | grep -iE 'panel|drm|rockchip|rkvdec|mali|wlan|sdio|battery|hantro|vop|mmc|emmc'
```

On removable FAT cards, also expect dirty-bit churn if the handheld is powered off abruptly. Before editing from the host, run a repair pass and unmount cleanly:

```sh
sudo fsck.vfat -a /dev/sdX1
sudo mount -o rw,noatime /dev/sdX1 /tmp/r36t
# edit
sync
sudo umount /tmp/r36t
```

## Why This Matters

The recon changed the R36T MAX assessment from “web-researched RK3326 guess” to verified bringup evidence.

### Confirmed R36T MAX facts

| Area | Confirmed value | Implication |
|---|---|---|
| Stock OS | `EmuELEC 4.7-Nexus_nightly_20250927` | Normal EmuELEC/OGA lineage, not Android or TinaLinux |
| Kernel | `5.10.160-g24206f9ea74c-dirty` | Modern enough for namespaces/cgroups experiments; not Brick-like 4.9 |
| Build target | `OdroidGoAdvance.aarch64` | R36T MAX inherits RK3326 handheld conventions |
| CPU | 4× Cortex-A35, no LSE flag | Bun and native aarch64 binaries must be tested for ARMv8.0/no-LSE behavior |
| RAM | `993980 kB` | KORRI needs a slim runtime; no full desktop assumptions |
| Device tree | `rockchip,rk3326-evb-lp3-v12-linux`, `rockchip,rk3326` | Stock DTS is generic EVB-derived; mainline board DTS work remains |
| Internal storage | `mmcblk0`, 7.28 GiB eMMC | Stock OS and rollback live internally |
| External storage | `mmcblk1p1`, 58.4 GiB vfat at `/storage/roms` | SD is ROM/data/drop-in surface |
| Display | Rockchip DRM DSI, 720×720 ~61 Hz, `fbcon=rotate:3` | Square-panel UI constraints are real and measurable |
| GPU | ARM Mali Bifrost vendor blob, `libmali`, DDK `g18p0-01eac0` | Stock graphics is vendor-blob; NixOS/Panfrost is a separate path |
| Wi-Fi | `rk915_sdio`, SDIO `c00v0296d5348` | Do not assume common Realtek upstream modules |
| Suspend | `freeze mem`, `s2idle [deep]` | Stock kernel has meaningful suspend hooks |
| Video decode | RKVDEC/MPP probes, no `/dev/video*` or `/dev/media*` | Stock Moonlight decode likely needs Rockchip MPP, not generic V4L2 |
| Remote shell | no `sshd`/`dropbear`; only `127.0.0.1:1234` listener | SD launcher recon is necessary on stock |

This puts the R36T MAX in a different category from the TRIMUI Brick. The Brick is blocked by a vendor 4.9 PowerVR world; the R36T MAX is a known RK3326/PX30-shaped Linux handheld with a plausible mainline path. But it is still a constrained KORRI target: 1 GB RAM, Cortex-A35, no LSE, a square 720×720 panel, vendor `libmali` on stock, and Rockchip MPP-shaped decode.

The durable lesson is not “patch every launcher forever.” The durable lesson is: **before planning an OS replacement, earn the right to plan by extracting facts from the stock environment through the least-destructive execution path available.**

## Beyond recon: full stock-OS bringup on R36T MAX (EmuELEC)

The recon section ends when a one-shot script can run on the device. The rest of this section captures the next four layers of the same staged-adoption ladder, all applied in one session against the same R36T MAX without modifying `/flash` or any squashfs root.

The ladder, ordered:

1. **B−1 — launcher recon** (above): write hardware facts to the SD card.
2. **B0a — persistent SSH** via a custom `systemd` unit in `/storage/.config/system.d/`.
3. **B0b — stay-awake** by masking suspend targets and disabling the ES PowerSaver.
4. **B0c — Nix on the device** via `nix-portable` with the `proot` runtime.
5. **B0d — vendor Mali ABI probe** via a Nix-built `dlopen` binary cross-compiled on a sibling aarch64 host.

Each step is reversible. Each step ends with the device usable on its own.

### B0a — Persistent SSH on an EmuELEC/LibreELEC-derivative

The device root is a squashfs (`/dev/loop0`), so userspace cannot be modified. The writable surface is `/storage` (ext4 on eMMC) plus `/storage/roms` (vfat on SD). Two surprises:

- `/storage/.config/custom_start.sh` looks like the right hook but is **dead code** in this EmuELEC build: every call site in `/usr/bin/emuelec_autostart.sh` is commented out. Editing it has no effect.
- The real LibreELEC-style writable systemd unit path is **`/storage/.config/system.d/`**, which is present in `systemctl show --property=UnitPath`.

Minimal persistent SSH recipe:

1. Cross-build a static aarch64 dropbear with Nix on a host:

   ```sh
   nix build --no-link --print-out-paths \
     nixpkgs#pkgsCross.aarch64-multiplatform.pkgsStatic.dropbear
   ```

2. Generate a host key and a dedicated client key locally:

   ```sh
   ssh-keygen -t ed25519 -N '' -f ./id_ed25519
   nix shell nixpkgs#dropbear -c \
     dropbearkey -t ed25519 -f ./dropbear_ed25519_host_key
   ```

3. Copy the three files to `/storage/.ssh/` on the device (use ssh + `cat` because
   stock EmuELEC busybox has no `scp` and no sftp-server).

4. Install a small systemd unit in the writable unit path:

   ```ini
   # /storage/.config/system.d/korri-ssh.service
   [Unit]
   Description=korri persistent Dropbear SSH (port 2222)
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   ExecStart=/storage/.ssh/dropbear -E -s -F -p 0.0.0.0:2222 \
     -r /storage/.ssh/dropbear_ed25519_host_key -D /storage/.ssh
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

5. `systemctl daemon-reload && systemctl enable korri-ssh.service`. Survives reboot; binds port `2222`; key-only; mirror of binary and host key on eMMC so it works after SD removal.

The `-F` flag is required so dropbear stays foreground for `Type=simple`. Without it, systemd treats the immediate fork as the service exiting.

One race to anticipate: handing off from a launcher-bootstrapped SSH (running outside any unit) to the systemd-managed one. BusyBox `pkill -f` did not match the SD-side `dropbear` reliably; using the PID file (`kill $(cat /storage/roms/.ssh/dropbear.pid)`) is more reliable. The cleanest approach is to skip the swap, install the unit, and let the next reboot transition.

### B0b — Defeat suspend so the device stays reachable

Symptom: device responds to ping but TCP to 2222 returns `Connection refused` every ≈90 seconds.

Diagnostic confirms it is the kernel suspending (deep idle), not Wi-Fi power-save:

```sh
iw dev wlan0 get power_save   # Power save: off
journalctl -k | grep "PM: suspend" | tail
#   PM: suspend entry (deep)
#   PM: suspend exit
#   PM: suspend entry (deep)
#   PM: suspend exit
```

There are two cooperating triggers:

- EmulationStation `PowerSaverMode="instant"` plus `ScreenSaverBehavior="suspend"` (in `/storage/.config/emulationstation/es_settings.cfg`)
- The systemd `suspend.target` chain, reachable from logind / ES idle / power key

Apply both fixes:

```sh
# 1. Calm ES down.
sed -i 's|PowerSaverMode" value="[^"]*"|PowerSaverMode" value="disabled"|' \
  /storage/.config/emulationstation/es_settings.cfg
sed -i 's|ScreenSaverBehavior" value="[^"]*"|ScreenSaverBehavior" value="dim"|' \
  /storage/.config/emulationstation/es_settings.cfg
systemctl restart emustation.service

# 2. Mask the systemd suspend chain in the writable unit path.
mkdir -p /storage/.config/system.d
for u in suspend.target sleep.target hybrid-sleep.target hibernate.target; do
  ln -sf /dev/null /storage/.config/system.d/"$u"
done
systemctl daemon-reload
```

After applying both, `journalctl -k | grep "PM: suspend"` stops accumulating new entries and the device stays online indefinitely on idle Wi-Fi. Backup the ES settings as `es_settings.cfg.korri-original` so the change is one-line reversible.

### B0c — Nix on stock EmuELEC via nix-portable

Goal: prove arbitrary nixpkgs derivations can execute on the device without modifying boot, root, or kernel.

Three real obstacles on a stock EmuELEC userland:

1. **No `base64` standalone binary.** nix-portable v012 is a self-extracting bash script that decodes embedded busybox via `base64 -d`. BusyBox on this image does not include the `base64` applet. The device does have `python3` (3.11). A six-line shim covers it:

   ```sh
   # /storage/bin/base64
   #!/bin/sh
   mode=encode
   for a in "$@"; do case "$a" in -d|-D|--decode) mode=decode;; esac; done
   if [ "$mode" = decode ]; then
     exec python3 -c 'import sys, base64; sys.stdout.buffer.write(base64.b64decode(sys.stdin.buffer.read()))'
   else
     exec python3 -c 'import sys, base64; sys.stdout.buffer.write(base64.b64encode(sys.stdin.buffer.read()))'
   fi
   ```

2. **Default runtime hits `/proc/self/setgroups` write error.** nix-portable’s auto-detection picks the embedded `nix` runtime, which fails with `Operation not permitted` while setting up user namespaces. Force `NP_RUNTIME=proot` instead.

3. **eMMC space.** `/storage` has only ≈3.3 GB free after stock. A first `nix run nixpkgs#hello` uses about 1 GB. Keep `NP_LOCATION` pointed at `/storage`, not `/tmp` (which is tmpfs).

Full invocation that works:

```sh
mkdir -p /storage/nix-portable /storage/nix-portable-root
curl -sL https://github.com/DavHau/nix-portable/releases/download/v012/nix-portable-aarch64 \
  -o /storage/nix-portable/nix-portable
chmod +x /storage/nix-portable/nix-portable

NP_LOCATION=/storage/nix-portable-root \
  PATH=/storage/bin:$PATH \
  NP_RUNTIME=proot \
  /storage/nix-portable/nix-portable nix run nixpkgs#hello
# Hello, world!
```

First run is ≈2 minutes (cache.nixos.org fetch); subsequent runs are seconds. This is B0 of the staged-adoption ladder — Nix as a guest, no kernel/userspace changes, fully removable by deleting `/storage/nix-portable*`.

### B0d — Probing the vendor Mali blob with Nix-built userspace

Goal: prove a Nix-built aarch64 binary can `dlopen` the host’s `/usr/lib/libmali.so` and call into EGL/GBM, without on-device compilation.

The Mali blob identifies itself in its own strings:

```text
allocator=drm_dumb cl=1 floatabi=hard gpu=g31 hwver=r0p0
winsys=gbm winsys_dma_buf=1 vulkan=1 wayland_server=0
profile=bx301a01b-release
```

Mali-G31 r0p0, GBM windowing, Vulkan-capable, built against the Linaro GCC 4.9.4 toolchain. Client EGL extensions advertise `EGL_KHR_platform_gbm` and `EGL_EXT_platform_base`.

Build the probe on a native aarch64 NixOS sibling (in this case a host named `fuji`), then transport. Cross-compilation works too but native build is simpler.

Four transport details turn out to matter:

- A Nix-built binary has `PT_INTERP` pointing at a `/nix/store/...glibc/lib/ld-linux-aarch64.so.1` that does not exist on the device. Use `patchelf --set-interpreter /lib/ld-linux-aarch64.so.1 --set-rpath /usr/lib` on the build host.
- Glibc backward compat works: Nix glibc 2.42 binaries run against host glibc 2.36 as long as the program does not call functions added after 2.36.
- `scp` is missing on stock EmuELEC busybox. Use `ssh device 'cat > /target/path' < binary` instead.
- Use `dlopen("/usr/lib/libmali.so", RTLD_NOW | RTLD_GLOBAL)` plus `dlsym` for every EGL/GBM/GLES function, so the binary has zero compile-time link deps on Mesa/EGL libraries and only needs `glibc + libdl` from the host.

Example probe behavior on R36T MAX:

```text
[probe] dlopen libmali             OK
[probe] open /dev/dri/renderD128   OK
[probe] gbm_create_device          OK (backend=armsoc)
[probe] eglGetDisplay(gbm)         NULL
[probe] eglGetPlatformDisplay(GBM) hangs forever in kernel drm_setversion
```

Kernel stack of the hung process (uninterruptible D state):

```text
drm_setversion -> drm_ioctl_kernel -> drm_ioctl -> __arm64_sys_ioctl
```

Meaning: the Mali GBM implementation issues `DRM_IOCTL_SET_VERSION` (a DRM master operation) even when only the render node was opened. While stock EmulationStation owns DRM master on `card0`, that ioctl blocks indefinitely. `kill -9` cannot reap the probe because it is in `D` state on a kernel mutex.

This is the architectural punchline: **the vendor Mali blob is exclusive-use on this device.** KORRI-slim cannot coexist with stock ES on the same display — it must replace the display owner. Confirms the abstract claim in [`staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md`](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md) empirically.

Do the real EGL test only after stopping ES:

```sh
systemctl stop emustation.service
/storage/bin/egl-probe
systemctl start emustation.service
```

Keep the stop window short. The device’s framebuffer console will take over the panel during the gap.

### Where this leaves R36T MAX as a KORRI target

After B−1 through B0d, the constraints are concrete:

| Capability | Status | Constraint for KORRI |
|---|---|---|
| Root shell, persistent | ✅ SSH on 2222, systemd unit | Stable hacking surface |
| Stay-awake | ✅ suspend targets masked | Idle device stays reachable |
| Nix on device | ✅ `nix run` works via proot | B0 substrate validated |
| Cross-compiled Nix binary | ✅ patchelf + ssh-cat transport | Build off-device, run on-device |
| Vendor Mali blob ABI | ✅ GBM + EGL_KHR_platform_gbm | Mali-G31, gbm winsys, no surfaceless coexist |
| Coexistence with stock ES | ❌ blocked at `drm_setversion` | KORRI-slim must replace ES, not run alongside |
| Hardware decode | ⚠️ no `/dev/video*`/`/dev/media*` | Likely Rockchip MPP, not generic V4L2 |
| Square 720×720 panel | ⚠️ confirmed | UI must be square-first or letterboxed |

## When to Apply

Use this pattern when all or most of these are true:

- The device boots from internal eMMC or NAND and uses SD as ROM/data storage.
- The stock OS is Linux/EmuELEC/RetroArch/EmulationStation-like but ships without SSH.
- The SD card contains user-visible script folders or launcher-adjacent folders.
- You need kernel, device tree, storage, display, GPU, Wi-Fi, suspend, or decode facts before flashing anything.
- A wrong flash or wrong DTB could break display/audio/input but the stock OS still works.

Do **not** use this as product architecture. It is a reconnaissance tactic. Once facts are captured, move to a proper CFW/NixOS image, a documented bootstrap path, or a clean device-specific module.

## Examples

### Example 1: Storage shape decides the strategy

Before live recon, the R36T MAX storage model was ambiguous. The user’s “it boots without the SD card” observation plus host-side SD inspection changed the model:

```text
Host sees: /dev/sdb1 vfat EEROMS, 58.4G, ROM folders only
Device boots without SD: yes
Conclusion: OS is internal, SD is data-only
```

After launcher recon, the exact runtime layout was known:

```text
/dev/mmcblk0p3  /flash          vfat  ro
/dev/mmcblk0p5  /storage        ext4  rw
/dev/mmcblk0p6  /var/media/EEROMS ext4 rw
/dev/mmcblk1p1  /storage/roms   vfat  rw
```

That is a different bringup problem from writing a normal SD boot image.

### Example 2: One guessed script path is fragile

This did not work:

```text
applyCenter/R36T-Recon.sh
```

Reason: `applyCenter` was not a generic shell-runner on this image. Its existing scripts called eMMC-side binaries:

```sh
cd /storage/.config/emulationstation/applyCenter/sdl_client/
/storage/.config/emulationstation/applyCenter/sdl_client/client &
```

The working approach used multiple known EmulationStation scan surfaces and metadata:

```text
ports/R36T Recon.sh
ports/gamelist.xml
tools/R36T Recon.sh
manual/R36T Recon.sh
applyCenter/R36T Recon.sh
```

The user ultimately ran the **Ports** entry successfully.

### Example 3: Recon output turns KORRI planning from vibes into constraints

Before recon, “RK3326 handheld” implied a broad class. After recon, the KORRI constraints were specific:

- Bun must be tested on Cortex-A35 without LSE.
- Full Electrobun/Gamescope assumptions are too heavy for 1 GB.
- A 720×720 panel needs square-first UI handling.
- Stock hardware decode is not exposed through mainline `/dev/video*`/`/dev/media*` nodes.
- Wi-Fi is `rk915_sdio`, not a generic Realtek path.
- eMMC fallback means SD experimentation can be staged safely, but OS replacement is not “just rewrite the ROM card.”

Those facts make the next plan sharper and safer.

## Related

- [`architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md`](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md) — the Brick/R36T contrast. Brick needs gut-mode around an immovable vendor stack; R36T MAX has a cleaner RK3326 substrate but still needs pre-shell recon and a slim KORRI runtime.
- [`best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md`](../best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md) — adjacent EmulationStation ownership rule. Temporary diagnostic `gamelist.xml` entries are acceptable as recon tools; do not turn them into product metadata architecture.
- [`integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`](../integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md) — same reversible-session principle in a ROCKNIX/systemd context.
- [`integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`](../integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md) — prior warning that vendor GPU userspace and Nix-built renderers need explicit ABI/runtime inventory before integration.
