# R36T MAX — NixOS / mainline feasibility brief

Web research only. The R36T MAX is an AISLPC-branded budget vertical handheld in the R36-clone family (distinct from R36S, R36 Pro, RG36S, K36). Multiple listings agree on the same SoC and ~1 GB RAM class.

## 1. SoC identification

**Rockchip RK3326** — quad Cortex-A35 @ up to 1.5 GHz, Mali-G31 MP2 (Bifrost) GPU, 1080p H.264/H.265 decode via a VDPU2/Hantro-class video pipeline. RK3326 is the consumer cousin of the **PX30** industrial SoC; they share the same TRM and the same upstream support code (kernel uses `rockchip,rk3326`, U-Boot uses `ROCKCHIP_PX30=y`, TF-A uses `PLAT=px30`).

- Vendor listing names the chip explicitly: "RK3326 CPU · Professional Gaming Chip" ([AISLPC product page](https://aislpc.com/products/r36t-max-retro-handheld-game-console)).
- Manual confirms RK3326 + EmuELEC: "powerful RK3326 chip, and runs on the EmuELEC system" ([manuals.plus](https://manuals.plus/ae/1005010226069857)).
- SoC datasheet summary: quad A35, Mali-G31 MP2, 1080p60 dec/enc ([CNX Software](https://www.cnx-software.com/2018/07/23/rockchip-rk3308-rk3326-datasheet/)).

RAM is 1 GB LPDDR4 in this class of device (vendor doesn't always print it, but every R36-clone in this shell shape ships 1 GB). Treat the R36T MAX as **RK3326 + 1 GB + 4″ IPS panel + 2.4 GHz Wi-Fi**, i.e. essentially an RG351V/R36S derivative in a TV-shaped shell.

## 2. Mainline Linux kernel status

**Supported, with several in-tree sibling DTS files; no R36T-MAX-specific DTS.**

In `arch/arm64/boot/dts/rockchip/` on `torvalds/linux` master:

- `rk3326.dtsi` — SoC DTSI
- `rk3326-odroid-go.dtsi`, `rk3326-odroid-go2.dts`, `rk3326-odroid-go2-v11.dts`, `rk3326-odroid-go3.dts`
- `rk3326-anbernic-rg351m.dts/.dtsi`, `rk3326-anbernic-rg351v.dts`
- `rk3326-gameforce-chi.dts`

Refs: [rk3326-anbernic-rg351v.dts](https://github.com/torvalds/linux/blob/master/arch/arm64/boot/dts/rockchip/rk3326-anbernic-rg351v.dts), [rk3326-odroid-go2.dts](https://github.com/torvalds/linux/blob/master/arch/arm64/boot/dts/rockchip/rk3326-odroid-go2.dts). Anbernic RG351 family was upstreamed by Maya Matuszczyk (maccraft123) starting v6.2 ([patchwork v4 5/5](https://patchwork.kernel.org/project/linux-rockchip/patch/20221117215954.4114202-6-maccraft123mc@gmail.com/)).

For the R36T MAX you would **fork `rk3326-anbernic-rg351v.dts`** (or a future `rk3326-r36s.dts` if/when accepted) and adapt: ADC joystick channels, button GPIOs, LCD panel timing/controller, RGB LED PWM, charger IC, and Wi-Fi SDIO node. No new SoC enablement is required.

## 3. Mainline U-Boot status

**Mainline U-Boot supports RK3326 via the PX30 platform.** Existing in-tree defconfig: `configs/odroid-go2_defconfig` with `CONFIG_ROCKCHIP_PX30=y` and `CONFIG_DEFAULT_DEVICE_TREE="rk3326-odroid-go2"` ([u-boot tree](https://github.com/u-boot/u-boot/blob/master/configs/odroid-go2_defconfig)). U-Boot DTS mirrors the kernel's. DRAM init for PX30/RK3326 LPDDR3/LPDDR4 is upstream and known good (Odroid Go Advance has shipped on it for years; Theobroma's Ringneck PX30 board uses the same TPL/SPL path documented at [docs.u-boot.org](https://docs.u-boot.org/en/stable/board/theobroma-systems/ringneck_px30.html)).

Practically: build U-Boot with `odroid-go2_defconfig` as a starting point, swap the in-tree DTB reference once a board DTS is added.

## 4. ARM Trusted Firmware (TF-A)

**Upstream TF-A supports `PLAT=px30`** — covers all RK3326 boards. Build with `make CROSS_COMPILE=aarch64-linux-gnu- PLAT=px30 bl31` and feed `bl31.elf` to U-Boot via `BL31=`.

**Nixpkgs gap:** `pkgs/misc/arm-trusted-firmware/default.nix` currently ships `armTrustedFirmwareRK3328`, `armTrustedFirmwareRK3399`, `armTrustedFirmwareRK3588`, plus Allwinner variants — there is **no `armTrustedFirmwarePX30` (or RK3326) attribute** in nixpkgs as of late 2025 ([nixpkgs master](https://github.com/NixOS/nixpkgs/blob/master/pkgs/misc/arm-trusted-firmware/default.nix); see PR [#378215](https://github.com/NixOS/nixpkgs/pull/378215) for how new platforms get added). This is a ~5-line addition: `buildArmTrustedFirmware { platform = "px30"; … }`. Trivial PR, not a blocker — call it a one-evening packaging task.

## 5. GPU and video decode

- **GPU: Mali-G31 MP2 (Bifrost).** Fully supported by **Panfrost** since Mesa 21 (OpenGL ES 3.1 on Bifrost landed in 2021) ([Collabora blog](https://www.collabora.com/news-and-blog/blog/2021/06/11/open-source-opengl-es-3.1-on-mali-gpus-with-panfrost/), [Mesa docs](https://docs.mesa3d.org/drivers/panfrost.html)). Open driver, in nixpkgs `mesa` by default.
- **Display: Rockchip VOP** — mainline `rockchip_drm_vop`. Works fine on PX30/RK3326 (Odroid Go Advance, RG351V).
- **Video decode: Hantro VDPU2** — in-tree under `drivers/staging/media/hantro/` with explicit RK3326/PX30 support added by Paul Kocialkowski ([mail-archive thread](https://www.mail-archive.com/linux-kernel@vger.kernel.org/msg2433859.html)); H.264 stateless support landed via Jonas Karlman ([patchwork v2 06/10](https://patchwork.kernel.org/project/linux-rockchip/patch/20210628125410.9228-7-ezequiel@collabora.com/)). H.265 and VP9 are partial. Sufficient for retro-emulation use; not a bottleneck.

All four "upstream gifts" (DTS, U-Boot defconfig path, TF-A platform, open GPU) exist for RK3326. The TF-A nixpkgs attribute is missing but the source is upstream.

## 6. Mainline / NixOS precedents on RK3326

- **ROCKNIX** (formerly JELOS) ships **mainline 6.6** on RK3326 handhelds including R36S, RG351M/V/P/MP, Odroid Go Advance/Super ([Retro Game Corps PortMaster guide](https://retrogamecorps.com/2024/07/12/portmaster-starter-guide/)).
- **`AndreRenaud/buildroot-r36s`** — a minimal mainline-Linux Buildroot for the R36S; the R36S is the closest cousin device to the R36T MAX (same SoC, same RAM, similar 1:1 IPS panel) ([repo](https://github.com/AndreRenaud/buildroot-r36s), [Ignavus walkthrough](https://ignavus.net/r36s)).
- **r/kernel thread**: a developer reports booting 351droid on R36S and tracking ROCKNIX 6.6 as the launch point for Ubuntu 24.04 on mainline ([Reddit](https://www.reddit.com/r/kernel/comments/1ll6anv/)).
- **ArkOS / AmberELEC** also run on this SoC; their kernels are downstream-flavored but the RK3326 community has migrated most enablement upstream over 2022–2024.
- **NixOS specifically:** no direct port to any RK3326 handheld found. The nearest NixOS-on-RK3326 precedent is generic Rockchip aarch64 SD-image construction via `nixos-hardware` rockchip helpers + the standard `sdImage` module — no board-specific module today.

## 7. Closest device with proven *NixOS* support

There is no shipping NixOS port for any RK3326 handheld. The closest *NixOS-confirmed* Rockchip board is the **ROC-RK3328-CC (Renegade)** ([NixOS Wiki](https://wiki.nixos.org/wiki/NixOS_on_ARM/Libre_Computer_ROC-RK3328-CC)) — different SoC (RK3328, A53), but the same nixpkgs build pattern (U-Boot defconfig + `armTrustedFirmwareRK3328` BL31 + standard `sdImage`). For RK3326 specifically, the most Korri-relevant precedent is **ROCKNIX on R36S** (RK3326, 1 GB, Mali-G31, 4″ IPS) — same chip, same RAM, very similar shell ergonomics. Korri-relevant: ✅ for retro emulation and Moonlight client; ❌ for anything that wants ≥2 GB RAM or a modern GPU.

## 8. Verdict: H700-model or Brick-model?

**Strongly H700-model.** The four upstream gifts are present for RK3326:

| Gift | RG35XX-H (H700) | R36T MAX (RK3326) | TRIMUI Brick (A133P) |
|---|---|---|---|
| Mainline DTS | ✅ in-tree (siblings) | ✅ in-tree (siblings: RG351V, Odroid Go2/3, GameForce Chi) | ❌ none |
| Mainline U-Boot defconfig | ✅ sibling | ✅ `odroid-go2_defconfig` | ❌ |
| TF-A upstream + nixpkgs | ✅ `armTrustedFirmwareAllwinnerH616` | ⚠️ TF-A upstream `PLAT=px30`; **nixpkgs attribute missing** | ❌ |
| Open GPU driver | ✅ Mali-G31 / Panfrost | ✅ Mali-G31 / Panfrost | ❌ PowerVR GE8300, closed-blob only |

The R36T MAX is in the same category as the RG35XX-H from a NixOS-bringup standpoint, with **one small nixpkgs packaging task** (adding `armTrustedFirmwarePX30`) and **one DTS-fitting task** (cloning rk3326-anbernic-rg351v.dts and adapting joystick/LCD/Wi-Fi nodes to the R36T MAX board). Mainline kernel + U-Boot + Mesa already cover the SoC.

Realistic risks (none architectural):

- **LCD panel controller** — the exact controller IC behind the 4″ IPS panel may need a one-off `panel-simple` entry or a small DSI panel driver. RG351V's panel solution is upstream and is the most likely starting point.
- **Wi-Fi SDIO chip** — almost certainly a Realtek RTL8723BS / RTL8189FS / 8821CS clone. Drivers exist but quality varies; some require out-of-tree `rtl8723bs`-style modules. Treat Wi-Fi as "best-effort, may need a USB dongle".
- **Battery fuel gauge / charger IC** — R36-class boards use a Rockchip RK817 PMIC (mainline) or sometimes a generic CW2015/2017 (mainline). Acceptable.
- **No vendor schematic.** You're working from a sibling DTS and a multimeter, not from an upstream BSP — but you don't *need* the BSP, because RK3326 enablement is already complete in mainline.

## Maintainers / patchsets to watch

- **Heiko Stuebner** (Rockchip subsystem maintainer, `mmind` tree) — primary integrator for RK3326 DTS.
- **Maya Matuszczyk (maccraft123)** — upstreamed Odroid Go Super and Anbernic RG351M/V; the right precedent author for R36-clone DTS submissions.
- **Jonas Karlman** — Rockchip VPU/Hantro and U-Boot RK3326 SPI-flash boot work.
- **Paul Kocialkowski** (Bootlin / Collabora) — Hantro PX30 enablement.
- **Ryan Walklin** — listed by the user as the Allwinner H700 enabler; not RK3326-relevant, but the equivalent role on this SoC is shared by maccraft123 + Heiko.
- No open regressions blocking RK3326 found; the platform is stable and largely feature-complete (HDMI N/A on R36T MAX; LCD-only).

## Bottom line

The R36T MAX is **squarely in the H700 camp** for a clean NixOS aarch64 SD-image build. Expect: write/fork a DTS, build U-Boot from `odroid-go2_defconfig` with TPL/BL31 from PX30 TF-A, add `armTrustedFirmwarePX30` to nixpkgs, render with Panfrost. Two weekends of work for a competent NixOS-on-ARM contributor — not a gut-mode "vendor blob only" wall.

## Sources

- Kept:
  - [AISLPC R36T MAX product page](https://aislpc.com/products/r36t-max-retro-handheld-game-console) — SoC identification (RK3326)
  - [Manuals.plus R36T MAX user manual](https://manuals.plus/ae/1005010226069857) — SoC + EmuELEC base
  - [CNX Software RK3326 datasheet](https://www.cnx-software.com/2018/07/23/rockchip-rk3308-rk3326-datasheet/) — Mali-G31 MP2 confirmation
  - [torvalds/linux rk3326-anbernic-rg351v.dts](https://github.com/torvalds/linux/blob/master/arch/arm64/boot/dts/rockchip/rk3326-anbernic-rg351v.dts) — in-tree DTS sibling
  - [u-boot odroid-go2_defconfig](https://github.com/u-boot/u-boot/blob/master/configs/odroid-go2_defconfig) — mainline U-Boot for RK3326/PX30
  - [u-boot.org Ringneck PX30 docs](https://docs.u-boot.org/en/stable/board/theobroma-systems/ringneck_px30.html) — TF-A `PLAT=px30` build recipe
  - [nixpkgs arm-trusted-firmware/default.nix](https://github.com/NixOS/nixpkgs/blob/master/pkgs/misc/arm-trusted-firmware/default.nix) — confirms PX30 attribute absent
  - [Collabora Panfrost Bifrost blog](https://www.collabora.com/news-and-blog/blog/2021/06/11/open-source-opengl-es-3.1-on-mali-gpus-with-panfrost/) — open GPU driver
  - [patchwork Hantro PX30](https://patchwork.kernel.org/project/linux-rockchip/patch/20210628125410.9228-7-ezequiel@collabora.com/) — video decode upstream
  - [AndreRenaud/buildroot-r36s](https://github.com/AndreRenaud/buildroot-r36s) — mainline Linux on the closest cousin device
  - [Retro Game Corps PortMaster guide](https://retrogamecorps.com/2024/07/12/portmaster-starter-guide/) — ROCKNIX 6.6 on RK3326
  - [NixOS Wiki ROC-RK3328-CC](https://wiki.nixos.org/wiki/NixOS_on_ARM/Libre_Computer_ROC-RK3328-CC) — nearest NixOS-on-Rockchip pattern
- Dropped:
  - Generic "best retro handheld" review aggregators — opinion, no enablement signal.
  - 2019 Odroid forum thread claiming "no RK3326 in mainline" — stale; situation changed in 2020–2023.

## Gaps

- **Exact LCD panel controller** on the R36T MAX is not published. Need a teardown photo of the panel ribbon or an `lsmod`/dmesg pull from the stock EmuELEC OS to confirm whether the RG351V panel driver applies as-is.
- **Wi-Fi module part number** unverified; vendor only says "2.4 GHz". Likely Realtek SDIO; could be ESP-class UART-AT. Pull `lsmod` / `lsusb` / `dmesg` on stock firmware.
- **No published GPL kernel source from AISLPC.** Not a blocker (we have mainline), but it means board-specific quirks (button matrix, RGB LED routing) require trial-and-error against a sibling DTS.
- Suggested next steps: (a) buy a unit, dump stock SD card's DTB and `/proc/config.gz`; (b) cross-reference with `rk3326-anbernic-rg351v.dts`; (c) prepare a nixpkgs PR adding `armTrustedFirmwarePX30`; (d) build an `sdImage` against a forked DTS and test boot to UART console.
