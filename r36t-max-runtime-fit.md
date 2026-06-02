# R36T MAX — KORRI runtime fit

## Hardware baseline (web-sourced)

The AISLPC R36T MAX (2026 refresh of the R36T "CRT" handheld; distinct from R36S, R36 Pro, R36 Max, K36, RG36S):

- **SoC:** Rockchip **RK3326** — quad-core Cortex-A35 @ ~1.3–1.5 GHz, **ARMv8.0-A** (no LSE atomics, no FP16), Mali-G31 MP2 (Bifrost). [CNX Software RK3326 datasheet](https://www.cnx-software.com/2018/07/23/rockchip-rk3308-rk3326-datasheet/), [System on Chips A35 analysis](https://www.systemonchips.com/arm-cortex-a35-armv8-x-revision-and-feature-compatibility-analysis/)
- **RAM:** **1 GB** LPDDR. [Pocket Retro Gaming R36T MAX](https://pocketretrogaming.com/en/anbernic/r36t-max/)
- **Display:** 4.0" IPS, **720×720 1:1**. [Retro Handhelds review](https://retrohandhelds.gg/game-console-r36t-max-review/), [AISLPC product page](https://aislpc.com/products/r36t-max)
- **Storage:** TF card (64 GB or 128 GB shipped image). Likely no eMMC. [RGameConsole listing](https://rgameconsole.com/product/r36t-max/)
- **Network:** vendors advertise "built-in Wi-Fi" on R36T MAX. Class-typical for this SoC tier is a 2.4 GHz-only RTL8723/RTL8188 SDIO module (assumed; no spec sheet confirms 5 GHz). [AISLPC](https://aislpc.com/products/r36t-max)
- **Controls:** dual analog sticks (RGB), full face buttons, L1/L2/R1/R2 shoulders. Triggers on this SoC class are generally **digital**, not analog Hall/axis; no gyro, no rumble in published specs. [AISLPC](https://aislpc.com/products/r36t-max)
- **Stock OS:** EmuELEC; **ROCKNIX RK3326** image covers the R35S/R36S family and almost certainly drops onto this device with a config tweak. [ROCKNIX R35S/R36S device page](https://rocknix.org/devices/unbranded/game-console-r35s-r36s/)

## 1. RAM headroom

**Not viable for KORRI as shipped.** With 1 GB total and ~100–150 MB consumed by kernel + DRM/GPU reservations + minimal systemd userspace, the practical ceiling is ~800 MB.

- **Electrobun (~250–400 MB RSS)** plus a Moonlight decoder pipeline (typically 80–150 MB with FFmpeg + SDL surfaces) plus Bun server (~80 MB idle) **breaches the ceiling under load** and leaves zero margin for the kernel page cache that KMS scanout, GPU command submission, and SD-card I/O actually need.
- **WPE+Cog (~180 MB)** brings the shell into a working envelope (~180 + 120 + 80 ≈ 380 MB), leaving ~400 MB headroom. This is the only realistic UI path. Brick-style "gut mode" trim is mandatory, not optional.
- Reference: R36S users routinely report OOM kills running anything more elaborate than RetroArch on top of EmuELEC's framebuffer EmulationStation.

## 2. Display path

Stock RK3326 handhelds run **bare DRM/KMS to a panel via the Rockchip VOP**; no compositor on EmuELEC. Mali-G31 has a libmali GBM/Wayland blob (used by ArkOS/ROCKNIX), and the panfrost open driver has matured. [Armbian forum thread](https://forum.armbian.com/topic/22508-rockchip-rk3326-mali-g31-gpu-image-or-build-instructions/)

- **Gamescope is overkill and will not earn its RAM cost** on a 1 GB / Mali-G31 device — it expects atomic KMS, decent GL throughput, and surplus VRAM-equivalent.
- The realistic target is **Cage on Wayland** (panfrost + GBM) or, for the foreground game session, **direct KMS scanout** from Moonlight's embedded build, bypassing the compositor for the streaming surface. Composition only when KORRI's chrome is up.

## 3. GPU + GL

Mali-G31 MP2 supports **OpenGL ES 1.1/2.0/3.2, Vulkan 1.0, OpenCL 2.0** per the SoC datasheet. [mozelectronics RK3326](https://mozelectronics.com/parts/rockchip-rk3326-3318/)

- **Panfrost** has full GLES 2.0 + most of 3.x on Bifrost-G31 in modern Mesa; GNOME + Wayland zero-copy has been demonstrated on this class of part. [CNX Software – GNOME on Mali-G31](https://www.cnx-software.com/2020/06/09/gnome-renders-on-arm-mali-g31-bifrost-gpu-with-fully-open-source-code/)
- **WebKitGTK GPU rendering does function** but Mali-G31 MP2 is the floor of WebKit's accelerated-compositing tier. Expect frame-rate compromise on animated UI; static lists fine. WPE+Cog with software fallback is a safer bet than counting on stable AC.

## 4. HW video decode (Moonlight)

RK3326 ships a **first-generation rkvdec** VPU. The vendor datasheet documents **H.264, H.265/HEVC, VP8, VC-1 decode up to 1080p60**, H.264 encode up to 1080p30. **No AV1.** [CNX Software datasheet](https://www.cnx-software.com/2018/07/23/rockchip-rk3308-rk3326-datasheet/)

- Linux story: **rkmpp / hantro V4L2 M2M** drivers expose H.264 and H.265 decode; rkvdec gen-1 has H.264 + VP9 in mainline, with HEVC patches floating. [PINE64 mainline decode wiki](https://wiki.pine64.org/wiki/Mainline_Hardware_Decoding)
- **Realistic Moonlight ceiling on the panel:** **720p60 H.265** (matches the 720×720 display perfectly) with rkmpp; 1080p60 decode works in theory but adds wasted scaling on a 720-line panel. SW fallback above 720p60 H.265 or any HEVC 10-bit / AV1 stream.
- Caveat: Moonlight-embedded usually targets **H.264** for safety on these decoders; H.265 path through rkmpp needs explicit wiring.

## 5. Input layout vs InputPlumber assumptions

Mapping is **mostly fine, with two gaps**:

- ✅ **Dual analog sticks**, A/B/X/Y, D-pad, L1/R1, Start/Select, L3/R3 stick-click (per AISLPC marketing copy).
- ⚠️ **Analog triggers**: budget RK3326 handhelds use **digital microswitch L2/R2**, reported as button presses, not axes. InputPlumber's defaults for `ABS_Z` / `ABS_RZ` will see no analog range — needs an R36T-specific profile that maps L2/R2 as buttons. Confirm on physical unit.
- ❌ **No gyro, no rumble** advertised. Gyro-driven aim mapping must degrade gracefully.
- ❌ No Steam-Controller-style trackpads / back paddles.
- Stock kernel exposes the gamepad via a Rockchip-specific `gpio-keys` + ADC node, not a USB HID. ROCKNIX already has a working evdev mapping that KORRI can crib from.

## 6. Bun on this CPU

**This is the showstopper line item.** Cortex-A35 is **ARMv8.0-A** — it has **no LSE atomics at all**. The Bun 1.3.9 fix mentioned in the goal targets the Cortex-A53 LSE-emulation regression; A53 is also v8.0 and exhibited the same class of bug. [GCC AArch64 options](https://gcc.gnu.org/onlinedocs/gcc/AArch64-Options.html), [openSUSE ARM support](https://en.opensuse.org/ARM_architecture_support)

- Bun's official aarch64 build still needs to be either compiled without `+lse` or runtime-dispatch outline-atomics-safe. **Verify Bun 1.3.9 actually launches on an A35 before any further work** — assume nothing.
- Even if Bun runs, single-thread throughput on A35 @1.5 GHz is **roughly half of the SM8550's Cortex-A510 little cores and an order of magnitude below the A715/X3 big cores**. Anything Effect-heavy on the hot path (RPC layer setup, atom graph evaluation) will be perceptible. Move work off Bun where possible; keep the server thin.

## 7. Network for Moonlight

Best-case is **2.4 GHz 802.11n single-stream (~50–80 Mbps real)**; vendor pages do not list 5 GHz / AC / AX.

- Practical Moonlight bitrate ceiling: **10–15 Mbps**, which corresponds to **720p60 acceptable, 1080p60 chunky / drop-prone**. Co-locate the host AP, prefer 40 MHz channel width, and accept that congested 2.4 GHz environments will kill streaming.
- USB-OTG tethering to a phone is a documented R36S workaround if onboard Wi-Fi is too flaky.

## 8. Storage layout

Single TF-card boot, no eMMC. The NixOS image must:

- Treat the SD card as the only writable medium.
- Keep `/nix/store` **read-only and aggressively pruned** (squashfs overlay if image size matters; 64 GB cards are common, so `/nix/store` <2 GB is reasonable).
- Profile state + saves on a separate ext4 partition that survives image reflashes (ROCKNIX uses this `STORAGE` partition convention — match it).
- No swap to SD card in normal operation (wear); a small zram swap is mandatory given 1 GB RAM.

## 9. What slims out (gut-mode trim list)

To make KORRI fit, in priority order:

1. **Drop Electrobun → WPE+Cog**. Non-negotiable at 1 GB.
2. **Drop Gamescope** in the streaming session; direct-KMS Moonlight surface.
3. **Replace Cage's full Wayland stack with the minimum** (only when chrome is visible).
4. **Strip Effect runtime cold-path features** the device will never reach (multi-server federation discovery polling, Storybook-related telemetry).
5. **Disable Bun JIT tier-up** if memory-pressured; use `--smol`.
6. **No HEVC 10-bit, no AV1, no 1080p stream targets** — UI never offers them.
7. **No InputPlumber gyro/rumble code paths** loaded.
8. **zram swap, no SD swap**.
9. **Pre-render heavy artwork server-side**; the device should never decode large WebP libraries client-side.

## Comparable-handheld reality check

- **R36S running Moonlight (same SoC family)**: community PortMaster build exists; users describe it as "definitely not a device for streaming" — fine for light/low-bitrate sessions, not a primary streaming workflow. [r/R36S Moonlight thread](https://www.reddit.com/r/R36S/comments/1pw6tli/streaming_from_my_steam_deck_to_my_r36s_moonlight/), [AlfaExploit ArkOS guide](https://alfaexploit.com/en/posts/r36s/)
- **Thermals**: passive cooling, no fan. RK3326 throttles under sustained 4-core load; sustained HW decode + Wi-Fi RX + UI redraws is exactly the workload that triggers it. Expect throttling within 10–15 min in a warm room.
- **Ergonomics for streaming-first**: 1:1 720×720 panel is a poor match for 16:9 game streams — either letterbox to ~720×405 (effective ~360-line vertical) or stretch. **This device is fundamentally a CRT-emulation showpiece, not a streaming form factor.** Even if the rest works, the panel aspect is the dealbreaker for a streaming-first workflow.

## Bottom line

KORRI **does not fit as-is**. With a heavy trim (WPE+Cog, no Gamescope, no Electrobun, 720p60 H.264 cap, zram swap, ROCKNIX-style storage layout) it can be made to **boot and stream at 720p60 over 2.4 GHz**, but the 1:1 panel, A35 CPU, 1 GB RAM, and lack of analog triggers/gyro make it the **worst** member of the cheap-RK3326 family for the streaming use case. If the goal is "prove KORRI runs on commodity RK3326 hardware," target the **R36S / RG353** instead — same SoC, 16:9 panel, mature ROCKNIX support, identical work, better fit. The R36T MAX adds nothing but a curved bezel.

---

### Sources kept
- [CNX Software – RK3308/RK3326 datasheets](https://www.cnx-software.com/2018/07/23/rockchip-rk3308-rk3326-datasheet/) — primary codec/CPU/GPU spec.
- [mozelectronics – RK3326 SoC page](https://mozelectronics.com/parts/rockchip-rk3326-3318/) — GLES/Vulkan support matrix.
- [System on Chips – Cortex-A35 ARMv8.x analysis](https://www.systemonchips.com/arm-cortex-a35-armv8-x-revision-and-feature-compatibility-analysis/) — confirms no LSE, no FP16.
- [Retro Handhelds – R36T MAX review](https://retrohandhelds.gg/game-console-r36t-max-review/) — panel size + resolution.
- [Pocket Retro Gaming – R36T MAX](https://pocketretrogaming.com/en/anbernic/r36t-max/) — SoC + RAM confirmation.
- [AISLPC – R36T MAX](https://aislpc.com/products/r36t-max) — vendor spec page (controls, Wi-Fi claim).
- [ROCKNIX R35S/R36S device page](https://rocknix.org/devices/unbranded/game-console-r35s-r36s/) — distro support baseline.
- [PINE64 mainline hardware decoding wiki](https://wiki.pine64.org/wiki/Mainline_Hardware_Decoding) — rkvdec gen-1 status.
- [r/R36S Moonlight thread](https://www.reddit.com/r/R36S/comments/1pw6tli/streaming_from_my_steam_deck_to_my_r36s_moonlight/) — field report.

### Sources dropped
- Random AliExpress / dropship "R36T MAX" listings — repeating vendor copy with no independent verification.
- TikTok "Moonlight on R36S" videos — no measurable latency/bitrate data.
- Generic "best Moonlight handheld 2025" listicles — no R36T-class device tested.

### Gaps
- **Cannot confirm whether R36T MAX onboard Wi-Fi is 5 GHz-capable** from web sources; all vendor pages say "built-in Wi-Fi" without a standard. Assume 2.4 GHz until measured.
- **Trigger analog vs digital not verified** for this specific revision; budget-class assumption is digital.
- **No first-hand Bun 1.3.9 launch report on Cortex-A35** found — must be validated on hardware.
- **No published RSS numbers for WPE+Cog or Electrobun on RK3326** specifically — figures used are cross-platform estimates and should be measured on-device before architecture commits.
