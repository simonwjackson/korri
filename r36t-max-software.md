# R36T MAX — Software Ecosystem Brief

The AISLPC **R36T MAX** (sold as "R36T MAX" / "R36T-MAX", sometimes via re-sellers as "R36T Max Retro TV") is a 4" 720×720 1:1-screen handheld in the broader **R36S-clone / "EE-clone" / K36 family**. Disambiguation: it is **not** the Anbernic R36S, the R36 Pro, the R36 Max (different KinHank/no-brand 1:1 device), the R36H Pro Max (4" 1024×768 H700 device), nor the F1C200S-based "R36 Max" mini. The "T" line is AISLPC's CRT-styled variant; "MAX" denotes the 4" 720×720 model. ([retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/), [handhelds.wiki R36S Overview](https://handhelds.wiki/R36S_Overview))

## 1. Stock OS

- **OS**: EmuELEC (often relabeled "RetroMax OS" in AISLPC marketing copy). Confirmed by hands-on review and by every reseller listing. ([retrohandhelds.gg review](https://retrohandhelds.gg/game-console-r36t-max-review/), [rgameconsole](https://rgameconsole.com/product/r36t-max/))
- **Base**: EmuELEC is a fork of CoreELEC, which itself forks LibreELEC — a Buildroot-style **JeOS** (read-only `/usr` squashfs + writable `/storage`). ([EmuELEC GitHub](https://github.com/EmuELEC/EmuELEC))
- **Kernel**: Rockchip BSP Linux. EmuELEC's RK3326 target tracks the Rockchip 4.4 / 5.10 vendor branches (the K36-clone stock builds in the wild ship a 5.10-line kernel; one teardown explicitly notes "linux kernel 5.10" on a closely-related K36 stock image). ([EmuELEC OdroidGoAdvance config](https://github.com/EmuELEC/EmuELEC/blob/master/projects/Rockchip/devices/OdroidGoAdvance/options), [R36S-K36-DTB-PATCH README](https://github.com/immo2n/R36S-K36-DTB-PATCH))
- **libc**: glibc (LibreELEC/CoreELEC lineage; not musl).
- **Init**: systemd (inherited from LibreELEC).
- **Package manager**: none in the conventional sense — system partition is read-only squashfs; only `/storage` is writable. Add-ons are LibreELEC-style.

## 2. SoC and hardware

- **SoC**: Rockchip **RK3326** (quad Cortex-A35 @ ~1.3–1.5 GHz, Mali-G31 MP2 Bifrost). The retrohandhelds review lists RK3326, 1 GB RAM, 4" 720×720 IPS, 4000 mAh, USB-C, micro-SD. ([retrohandhelds.gg review](https://retrohandhelds.gg/game-console-r36t-max-review/))
- **RAM**: 1 GB LPDDR3/LPDDR4 (single chip; same RAM class as K36/R36Max clones). ([handhelds.wiki R36S Clones](https://handhelds.wiki/R36S_Clones))
- **Wi-Fi**: Realtek RK915 module (per ArkOS4Clone release notes that fixed sleep/wake on the R36T MAX). ([arkos4clone release notes](https://github.com/lcdyk0517/arkos4clone/releases))
- **Storage**: 8 GB eMMC (internal) + dual micro-SD (TF1 OS slot / TF2 ROMs slot).
- Source conflict: a few resellers and the AliExpress wiki copy describe the device as a "K36 clone" implying H700; this is wrong — the K36 itself is RK3326, and every hands-on review confirms RK3326 on the R36T MAX. ([retrocatalog K36](https://retrocatalog.com/retro-handhelds/k36), [retrohandhelds review](https://retrohandhelds.gg/game-console-r36t-max-review/))

## 3. GPL source publication

- **No manufacturer GPL release.** AISLPC publishes no kernel, U-Boot, or DTS sources. Their product pages only invoke "open-source architecture" as marketing. ([aislpc.com](https://aislpc.com/products/r36t-max))
- The community treats stock-firmware DTBs as the only manufacturer artefact and patches them by hand. The DTB-collection repo [Vi-K36/EE-Clones-DTB](https://github.com/Vi-K36/EE-Clones-DTB) is the de-facto upstream substitute; ROCKNIX even ships a browser tool (`rocknix.gosk.in/dtbo`) to convert stock DTB into a ROCKNIX overlay.
- For everything else, CFWs reuse the upstream **Rockchip RK3326 BSP** kernel (well supported via JELOS/EmuELEC/ArkOS forks of [rockchip-linux/kernel](https://github.com/rockchip-linux/kernel)). The "Hacking a Clone R36S" write-up describes exactly this workflow: pull `/proc/config.gz` and DTB from the device, then rebuild against the community RK3326 kernel. ([therad.ninja](https://therad.ninja/hacking-a-clone-r36s-from-retro-handheld-to-hyper-mobile-compute-node/))

## 4. Boot chain

- **Bootloader**: Rockchip **U-Boot** (BSP fork). Public reference: [AndreRenaud/u-boot-r36s](https://github.com/AndreRenaud/u-boot-r36s). RK3326 boot sequence is BootROM → idbloader (SPL) → trust.img → U-Boot → kernel+DTB+initrd from FAT BOOT partition.
- **Partition layout** on the OS micro-SD: MBR table with idbloader/u-boot at fixed sector offsets (LBA 64 / LBA 16384), a small FAT32 **BOOT** partition (kernel image, `dtb`, `boot.ini`), and an ext4 system + ext4/exFAT ROMS partition. ([lumerk SD setup guide](https://www.lumerk.com.au/blogs/lumerktech/the-complete-r36s-sd-card-setup-and-format-guide-everything-retro-gamers-need-to-know), [joeysretrohandhelds R35S/R36S guide](https://www.joeysretrohandhelds.com/guides/r35s-r36s-setup-guide/))
- **No A/B slots.** Recovery is purely "re-flash the TF1 (OS) micro-SD". The 8 GB internal eMMC normally just holds a copy of the same EmuELEC image used as fallback. ([handhelds.wiki R36S Problems](https://handhelds.wiki/R36S_Problems_and_Troubleshooting))
- The device cannot brick itself from software in any practical sense — pop a fresh SD card and it boots. The eMMC can be re-flashed from a live SD by writing to `/dev/mmcblkN`.

## 5. CFW landscape

| Project | Status (May 2026) | Base | Kernel | URL |
|---|---|---|---|---|
| **ArkOS4Clone** (lcdyk0517) | **Most active** for this exact device. README banner reads "Stop updating" yet releases continue (latest tag 20260430, ~507★/42 forks). Explicit R36T / R36TMAX support, sleep/wake fixes for RK915 Wi-Fi. | Ubuntu/Debian rootfs (ArkOS lineage) + ArkOS-K36 kernel | RK3326 BSP, 4.4-line patched | [github.com/lcdyk0517/arkos4clone](https://github.com/lcdyk0517/arkos4clone) |
| **ArkOS-K36** (AeolusUX) | **Archived** 2025-08-25; superseded by ArkOS4Clone. Historical kernel/DTB source for K36-family. | Ubuntu 19.10 + ArkOS overlay | RK3326 BSP | [github.com/AeolusUX/ArkOS-K36](https://github.com/AeolusUX/ArkOS-K36) |
| **ROCKNIX** | **Active**, generic K36/R36Max/EE-clone image works on R36T MAX with a custom DTB overlay generated via [rocknix.gosk.in/dtbo](https://rocknix.gosk.in/dtbo). Use the `RK3326.aarch64` "B" image. | JELOS fork → LibreELEC (Buildroot, systemd) | RK3326 BSP, recent 5.10/6.x line per JELOS | [rocknix.org/devices/unbranded/EE-clones](https://rocknix.org/devices/unbranded/EE-clones/), [github.com/ROCKNIX/distribution](https://github.com/ROCKNIX/distribution) |
| **EmuELEC** (stock + community rebuilds) | **Active** upstream; the AISLPC stock image is a vendor fork. [gamely-code](https://github.com/gamely-code) maintains updated EE-clone EmuELEC builds. | CoreELEC / LibreELEC (Buildroot) | Rockchip BSP | [github.com/EmuELEC/EmuELEC](https://github.com/EmuELEC/EmuELEC) |
| **UnofficialOS (uOS)** | **Active** but lower priority; community overlay registry at [overlays.unofficialos.org](https://overlays.unofficialos.org). RGB20S image + clone DTB. | JELOS-derived, Buildroot | RK3326 BSP | linked from Vi-K36 README |
| **dArkOS / ArkOS R3XS** | Active for original R36S (RK3326) but **does not target the R36T MAX directly**; ArkOS4Clone is the supported path. | Debian (dArkOS) / Ubuntu (R3XS) | RK3326 BSP | [github.com/christianhaitian/dArkOS](https://github.com/christianhaitian/dArkOS) |
| muOS / MinUI / CrossMix / Knulli / Batocera / AmberELEC | **No targeted port** for the R36T MAX. muOS / CrossMix target Anbernic H700 hardware; Batocera/Knulli target stronger SoCs; MinUI ports are device-specific and the R36T MAX is not on the list. | — | — | — |

**What works on CFW (ArkOS4Clone / ROCKNIX) on R36T MAX:** GBA, SNES, MD, PS1, DC up to typical RK3326 limits; Wi-Fi after sleep/wake fix; audio; D-pad; both joysticks. **What's broken / weak:** PSP and N64 are hardware-limited; Vulkan is not viable on Mali-G31 with Panfrost at this kernel age; HDMI/TV-out is absent on the device. ([retrohandhelds review](https://retrohandhelds.gg/game-console-r36t-max-review/))

## 6. Community size and activity

- **ArkOS4Clone**: ~507★ / 42 forks; ~monthly releases through April 2026 with explicit R36T MAX changelog entries. Coordinated via the **RetroHandhelds Discord**. ([github.com/lcdyk0517/arkos4clone/releases](https://github.com/lcdyk0517/arkos4clone/releases))
- **ROCKNIX**: very active; multi-handheld scope; major distribution repo with continuous nightly builds. ([github.com/ROCKNIX/distribution](https://github.com/ROCKNIX/distribution))
- **Subreddits**: r/R36S (primary), r/SBCGaming (broader). Handhelds.wiki and r36s.org are the documentation hubs. ([handhelds.wiki](https://handhelds.wiki/R36S_Clones), [r36s.org](https://r36s.org/articles/guide-clone-detection))
- AISLPC has no developer-facing community of its own; everything happens in the broader R36S-clone scene.

## 7. Shell access / dev tooling

- **SSH on stock EmuELEC**: enabled, user `root` / password `emuelec`. Wi-Fi config via `/storage/.config/wifi_supplicant.conf`. ([EmuELEC v2.5 release notes](https://newreleases.io/project/github/EmuELEC/EmuELEC/release/emuELECv2.5))
- **SSH on ArkOS4Clone / ROCKNIX**: enabled out of the box; ArkOS default `ark` / `ark`, ROCKNIX `root` / `rocknix`.
- **Serial console**: UART pads are on the PCB (same family as R36S/K36 boards); not documented officially for R36T MAX, but accessible per the "Hacking a Clone R36S" teardown which booted with serial debug enabled. ([therad.ninja](https://therad.ninja/hacking-a-clone-r36s-from-retro-handheld-to-hyper-mobile-compute-node/))
- **Telnet**: not enabled by default in modern EmuELEC.
- **Dev-mode builds**: there is no signed/locked boot — any image flashed to TF1 boots. Effectively always "dev mode".

## 8. Firmware quirks and bricking risks

- **TF1 / TF2 SD reliability**: stock SD cards bundled with the device are widely reported as low-quality "Unload these ASAP — they will die." ([retrohandhelds R36S setup](https://retrohandhelds.gg/r36s-setup-guide/))
- **Speaker overvolt bug**: ArkOS4Clone on certain clone PCB revisions (R36S V20-family) can drive the speaker above rating and damage it. Verify panel/board variant before flashing. The R36T MAX has not been individually reported but shares the same RK817 audio path. ([handhelds.miraheze R36S Clones](https://handhelds.miraheze.org/wiki/R36S_Clones))
- **DTB mismatch = no boot / wrong panel colours / no Wi-Fi**: every CFW install requires picking the correct DTB. ArkOS4Clone ships `dtb_selector_win32`; ROCKNIX provides a browser-based overlay generator. ([Vi-K36 EE-Clones-DTB](https://github.com/Vi-K36/EE-Clones-DTB))
- **Partition caveats**: BOOT partition is FAT32 (required for U-Boot reads); ROMS partition is most reliable as **ext4** on Linux; exFAT works but reduces battery life and is fragile across Win/macOS mounts.
- **OTA**: stock EmuELEC has no OTA. ROCKNIX and ArkOS4Clone update via SD reflash or in-place package replacement.
- **eMMC**: 8 GB internal — small enough that some users wipe it; remember the device may still boot from eMMC if no SD is present, so a clean wipe can soft-brick the "no SD" fallback path until reflashed.

## 9. Stock launcher / UI

- **Frontend**: EmulationStation (the EmuELEC fork), themed by AISLPC.
- **Replaceable?** Yes, trivially — every CFW above replaces the entire userspace, not just the launcher. There is no signed launcher, no Play-Store-style lock-in, and the system partition is just an EXT4 + squashfs SD layout.

## 10. Closed-source / blob dependencies to flag for KORRI

- **Mali-G31 userspace**: every shipping CFW uses **closed Mali Bifrost blobs** (`libmali` for r9p0/r14p0) against the Rockchip BSP kernel module. **Panfrost** + Mesa is technically supported for Mali-G31 (Bifrost) since Mesa 19.2 + kernel 5.2 ([opensuse wiki](https://en.opensuse.org/ARM_Mali_GPU)), and is the path you'd want for a NixOS-on-Gamescope target, but it is materially slower than libmali for many emulators on RK3326 — this matters for KORRI if Gamescope expects KMS+GBM+GLES through Mesa.
- **Wi-Fi firmware**: Realtek **RK915** firmware blob (proprietary, redistributable). Same blob shipped by ArkOS4Clone.
- **RK817 PMIC, video decode (RKVDEC), and ISP**: only fully functional through Rockchip BSP modules; mainline Linux support for RK3326 is partial.
- **Implication for KORRI / NixOS + Gamescope + Moonlight**: feasible in principle (RK3326 has mainline support and Panfrost works), but expect to (a) build/ship libmali if you want max GPU throughput, (b) carry the RK915 firmware blob, (c) source U-Boot + BSP kernel from the Rockchip 5.10-rk fork rather than mainline, and (d) generate the device DTB from a stock dump (no official DTS upstream).

## 11. Upstream contributions from the community

- **DTS / DTB**: [Vi-K36/EE-Clones-DTB](https://github.com/Vi-K36/EE-Clones-DTB) is the canonical store of stock + modified DTBs for every known board revision in this family; ROCKNIX's overlay tool consumes them. There are no DTS submissions in mainline Linux for these clone boards.
- **U-Boot**: [AndreRenaud/u-boot-r36s](https://github.com/AndreRenaud/u-boot-r36s) is the closest community U-Boot port for the family (originally targets R36S, adaptable to clones). Not upstream.
- **Kernel patches**: live in JELOS/ROCKNIX, EmuELEC, and ArkOS forks of `rockchip-linux/kernel`. No mainline-bound effort specifically for R36T MAX.

## 12. Reputable hands-on sources

- [Retro Handhelds — AISLPC R36T MAX Review](https://retrohandhelds.gg/game-console-r36t-max-review/) — primary review, specs, board photo.
- [Retro Handhelds — AISPLC R36T / R36T Max ArkOS4Clone Setup Guide](https://retrohandhelds.gg/aisplc-r36t-and-r36t-max-setup-guide/) — concrete install steps.
- [Pocket Retro Gaming — R36T Review](https://pocketretrogaming.com/en/anbernic/r36t/) — independent specs confirmation.
- [handhelds.wiki R36S Overview / R36S Clones](https://handhelds.wiki/R36S_Overview) — family taxonomy.
- [therad.ninja — Hacking a Clone R36S](https://therad.ninja/hacking-a-clone-r36s-from-retro-handheld-to-hyper-mobile-compute-node/) — hands-on Linux dev workflow on identical SoC.

## Sources

- Kept: retrohandhelds.gg R36T MAX review — only published hands-on with spec list and PCB photo.
- Kept: github.com/lcdyk0517/arkos4clone — primary CFW, explicit R36TMAX support.
- Kept: handhelds.wiki R36S Overview + R36S Clones — definitive family disambiguation.
- Kept: rocknix.org/devices/unbranded/EE-clones — official CFW support entry.
- Kept: github.com/EmuELEC/EmuELEC — stock OS upstream, license + base distro provenance.
- Kept: github.com/AndreRenaud/u-boot-r36s — closest community U-Boot reference.
- Kept: github.com/Vi-K36/EE-Clones-DTB — DTB source-of-truth substitute.
- Kept: therad.ninja R36S hacking write-up — hands-on RK3326 dev workflow.
- Dropped: aislpc.com product pages — marketing-only, no useful technical detail beyond OS name.
- Dropped: rgameconsole.com product page — duplicates AISLPC copy; no original info.
- Dropped: aliexpress wiki-ssr article — SEO-generated, misclassified the device as "K36 clone with H700".
- Dropped: notebookcheck K36 article — K36 not R36T MAX, kept only for SoC cross-check.

## Gaps

- **No first-hand kernel `uname -a` posted publicly for the R36T MAX stock image.** Inferred 5.10 from immediate K36 sibling; could be 4.4 on older stock builds. Next step: pull `/proc/version` from a live device or stock image.
- **No public AISLPC GPL request response** — worth filing a written GPL source request to AISLPC support before committing to a NixOS port, in case they will hand over their kernel tree.
- **U-Boot for R36T MAX specifically** is not published; AndreRenaud's R36S port is the starting point but the panel + Wi-Fi pin map likely differ.
- **Panfrost performance numbers on RK3326 under recent Mesa** for the emulators KORRI cares about (and for Gamescope's compositor) — no current benchmark found; needs testing in-house.
- **No reports of Moonlight or Gamescope running on this device family.** Closest precedent is JELOS/ROCKNIX on R36S, which does not ship Gamescope.
