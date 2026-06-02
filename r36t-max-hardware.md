# Research: R36T MAX (AISLPC) — Hardware Brief for KORRI

## Summary
The R36T MAX (also written **R36T Max**) is a 2026 budget retro handheld sold primarily by **AISLPC** (and a few rebadging shops such as RGameConsole), built on a **Rockchip RK3326** — the same low-end quad-Cortex-A35 / Mali-G31 SoC used across the R36S/R36 Plus family — paired with **1 GB RAM**, a distinctive **4" 720×720 square IPS panel** with a faux-CRT bubble cover, **2 analog sticks**, **single microSD** (no internal eMMC), **single USB-C**, **2.4 GHz Wi-Fi only (no Bluetooth, no HDMI out)**, and a **4000 mAh** battery. It is not a new platform; it is a cosmetically-redesigned RK3326 reference board (internal silkscreen reads "RG42T") and shares all platform constraints of the R36S generation. For KORRI (TypeScript/React/Effect/Bun/Electrobun + Gamescope + Moonlight) this device is **well below viable**: no Vulkan, no Wayland-class GPU performance budget, ~1 GB total RAM, and no video-out for docked use.

## Findings

### 1. SoC
**Rockchip RK3326**, quad-core ARM **Cortex-A35** (ARMv8-A) up to **1.5 GHz**, fabricated on **28 nm HKMG**. Includes Neon, ARM Cryptography Extensions, TrustZone. Memory controller supports DDR3/DDR3L/DDR4/LPDDR2/LPDDR3 (the newer RK3326-**S** variant adds LPDDR4 and 512 KB L2; nothing in retailer materials suggests the R36T MAX uses the -S variant).
- "Powered by the EmuELEC operating system and the reliable **RK3326 chipset**." — [rgameconsole.com](https://rgameconsole.com/products/r36t-max)
- "Equipped with the **RK3326 quad-core chip** and 1GB of RAM" — [pocketretrogaming.com](https://pocketretrogaming.com/en/anbernic/r36t-max/)
- "Rockchip RK3326: **quad-core Cortex-A35 up to 1.5GHz, Mali-G31**, 1080p60 decode/encode" — [mozelectronics.com](https://mozelectronics.com/parts/rockchip-rk3326-3318/)
- Datasheet: "**Quad-core ARM Cortex-A35 CPU** with ARMv8-A architecture, Neon, Cryptography Extensions, and TrustZone." — [rockchip.fr RK3326 v1.2](https://rockchip.fr/RK3326%20datasheet%20V1.2.pdf)

### 2. GPU
**ARM Mali-G31 MP2** (Bifrost). Open-source driver path is **Panfrost** in Mesa, conformant to **OpenGL ES 3.1** on Bifrost; **no Vulkan** for G31 (PanVK is conformant only on Mali-G610). A community correction on the retrohandhelds review explicitly flags this:
- "The rk3326 doesn't have a Mali g57 gpu, it's the **Mali g31**." — [retrohandhelds.gg review comments](https://retrohandhelds.gg/game-console-r36t-max-review/)
- "Panfrost now supports OpenGL ES 3.1 on Midgard (Mali T760 and newer) and **Bifrost (Mali G31, G52, G76)** GPUs" — [CNX Software](https://www.cnx-software.com/2021/06/14/panfrost-opengl-es-3-1-midgard-mali-t760-bifrost-mali-g31-g52-g76-gpu/)
- "PanVK… is currently conformant on Mali-G610, but **non-conformant on other GPUs**." — [Mesa docs: Panfrost](https://docs.mesa3d.org/drivers/panfrost.html)

### 3. RAM
**1 GB**, single channel. Type is not disclosed by retailers; the RK3326 (non-S) is wired for DDR3L/LPDDR3 on virtually every shipping handheld in this class, so **LPDDR3** is the safe assumption. No speed published.
- "**RAM: 1GB**" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)
- Same figure on [pocketretrogaming.com](https://pocketretrogaming.com/en/anbernic/r36t-max/).

### 4. Storage
**No internal eMMC.** The device boots from a microSD card containing EmuELEC; AISLPC sells it bundled as **"64 GB" or "128 GB"** which is the size of the included SD. **Single microSD slot** (this is a divergence from the R36S, which has two TF slots). Filesystem on the OS card is typical Rockchip-stack ext4 + FAT boot; the ROMs partition is FAT32/exFAT by default. No published max capacity beyond the 128 GB option ship.
- "Connectivity: USB-C (single), 3.5mm AUX Jack, **Micro-SD (single)**, Wi-Fi" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)
- "Bundle: **64G / 128G**" — [r36s.co.uk listing](https://r36s.co.uk/products/r36t-max)

### 5. Display
**4.0-inch IPS, 720×720 (square 1:1) resolution**, fixed orientation, with a clear "CRT bubble" cover plate. Refresh rate is not specified by either vendor or review; RK3326 LCD controller is limited to 60 Hz at this resolution, and no source claims otherwise.
- "**4″ 720×720 IPS Display** with CRT bubble cover" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)
- "**4-inch IPS screen… resolution of 720×720**" — [aislpc.com](https://aislpc.com/products/r36t-max)
- Note conflict: the older R36T (non-Max) used a 3.5" 640×480 panel; some early third-party R36T MAX descriptions confuse the two. The 720×720 figure is consistent across AISLPC and the hands-on review.

### 6. Input
- **D-pad**: single circular faux-channel-knob D-pad ("surprisingly serviceable" per review).
- **Face buttons**: A/B/X/Y.
- **Shoulders**: **L1/L2 + R1/R2**, all **digital buttons** (no analog/Hall-effect triggers — none of the materials describe trigger axes; pocketretrogaming explicitly calls them a "full set of rear triggers (R1, R2, L1, L2)" alongside buttons).
- **Analog sticks**: **2× RGB-lit potentiometer sticks**. **Not capacitive.** L3/R3 click is not documented; on RK3326 reference designs sticks are usually clickable, but treat as unconfirmed.
- **Touchscreen**: **No.**
- **Gyro / accelerometer**: **No** (not mentioned in any source; RK3326 handhelds do not include IMUs).
- **Rumble**: **No** (not mentioned; vendor pages emphasize battery & speaker only).
- "Classic Select and Start buttons are present, along with a menu button and a **full set of rear triggers (R1, R2, L1, L2)**… **two RGB-lit analog sticks**" — [pocketretrogaming.com](https://pocketretrogaming.com/en/anbernic/r36t-max/)

### 7. Battery
**4000 mAh** Li-ion, claimed **~6 hours** play.
- "**6-Hour 4000mAh Marathon Battery**" — [aislpc.com](https://aislpc.com/products/r36t-max)
- "Battery: **4000mAh (per listing)**" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)

### 8. Wireless
**Wi-Fi only**, **2.4 GHz** (single-band b/g/n). **No Bluetooth.** Chip not publicly disclosed; community evidence on the closely related R36 Max shows the stock dongle/module is single-band 2.4 G and that 5 GHz/BT dongles only work with specific Realtek chipsets (e.g., RTL8188EUS) — i.e., wireless is provided by a small USB-attached module on this class of board, not a SoC PCIe/SDIO radio.
- "**Built-in WiFi** for local multiplayer (no OTG needed)" — [rgameconsole.com](https://rgameconsole.com/product/r36t-max/)
- Stock module is 2.4 GHz; broader compatibility requires "**Realtek RTL8188EUS** chipset" dongles — [r/SBCGaming](https://www.reddit.com/r/SBCGaming/comments/1i75ut3/r36max/)

### 9. Connectivity
- **USB**: **1× USB-C** (charging + data + OTG; RK3326 board OTG is the typical implementation, used on this class to attach Wi-Fi/BT/USB-Ethernet dongles).
- **HDMI / video out**: **None.** No source lists HDMI; the chassis has no video-out port and the RK3326 retro-handheld reference design does not expose HDMI on the panel.
- **Audio**: **3.5 mm headphone jack**, **single front-firing mono speaker**.
- "Sound: **Single front-firing speaker** … **USB-C (single), 3.5mm AUX Jack, Micro-SD (single)**" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)

### 10. Dimensions and weight
**147.3 × 81.2 mm** (W × H; thickness not published), **~221 g**.
- "dimensions of **14.73 × 8.12 cm**" — [pocketretrogaming.com](https://pocketretrogaming.com/en/anbernic/r36t-max/)
- "Weight: **221 grams** (according to my kitchen scale)" — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)

### 11. FCC ID / certifications
**No FCC ID found** in any retailer listing, manual, or review. The user manual hosted at manuals.plus does not surface a certification block in indexed snippets. Devices in this class typically ship without US FCC registration and rely on the SoC + Wi-Fi module's separate certifications. Treat radio compliance as unverified.

### 12. Vendor / rebadge
- **Brand**: **AISLPC** (primary), resold by RGameConsole / r36s.co.uk and AliExpress sellers.
- **Internal board silkscreen**: **"RG42T"** — the same board family used across multiple AISLPC-branded R36-class handhelds. This is an RK3326 reference variant, not a custom design.
- "I'm always intrigued by what model the board inside will say — **RG42T here**." — [retrohandhelds.gg](https://retrohandhelds.gg/game-console-r36t-max-review/)
- "In an oversaturated market of identical **RK3326 devices**, the R36T Max stands out by prioritizing aesthetic and experience over raw performance." — [retrohandhelds.gg video post](https://retrohandhelds.gg/this-budget-handheld-feels-like-a-tiny-arcade-cabinet-r36t-max-video/)

### 13. Release date / price
Released early **2026** (AISLPC describes it as "2026 New Upgrade"). Street price varies by bundle:
- AISLPC direct / typical retail: bundle dependent.
- r36s.co.uk: **£59** sale (£66.80 regular) for base, up to **£120** for 128 GB bundle — [r36s.co.uk](https://r36s.co.uk/products/r36t-max)
- Typical AliExpress listings: **US$45–70** depending on storage/color.

## Flags (security, SKUs, siblings)

- **Secure boot / e-fuses**: RK3326 supports TrustZone and has eFuse bits for secure boot, but **no AISLPC R36T MAX source indicates fused/signed boot is enabled** — the standard recovery is **Rockchip Maskrom mode** over USB via `rkdeveloptool`, which is the same path used by ArkOS / EmuELEC / ArkOS4Clone flashers. Maskrom is automatically entered if the boot SD is absent/invalid. Treat the device as **fully reflashable**; community guides for ArkOS4Clone explicitly target it ([retrohandhelds.gg setup guide](https://retrohandhelds.gg/aisplc-r36t-and-r36t-max-setup-guide/)).
- **Silent SKUs**: AISLPC ships the R36T MAX in many color/finish variants (wood grain, carbon fiber, gray, white, black, red, blue) and as a "Special Edition" — these are cosmetic; no source indicates a SoC/RAM revision. The internal board ("RG42T") is consistent across reviews.
- **Sibling comparison**:
  - vs **R36S** (Anbernic-style clone, RK3326, 1 GB, 3.5" 640×480 4:3, **dual TF slot**, **no Wi-Fi by default**): R36T MAX trades the second SD slot for built-in Wi-Fi and a larger 720×720 square display; same SoC class.
  - vs **R36 Pro / R36 Ultra**: marketing implies a step up but the Ultra page on pocketretrogaming describes the same RK3326-tier capability ceiling (good through PS1/N64, marginal for PSP).
  - vs **R35S**: smaller 3.5" 640×480 panel, otherwise same RK3326 platform.
  - The R36T MAX is **not** related to the unrelated R36H/RG36H (different vendor lineage) or to the K36 (different SoC class).

## KORRI viability (quick read)
- **CPU**: 4× Cortex-A35 @ 1.5 GHz is roughly 1/4 the per-core throughput of a Steam Deck Zen 2 core. Bun + Electrobun + a React renderer + RPC + a Gamescope-equivalent compositor is **not a credible runtime budget**.
- **GPU**: Mali-G31 via Panfrost gives GLES 3.1 only; **no Vulkan** ⇒ Gamescope (which requires Vulkan) **will not run**. A pure GLES/X11 fallback would be required.
- **RAM**: 1 GB is below the floor for a Bun-hosted renderer + compositor + Moonlight client running concurrently.
- **Moonlight**: A native `moonlight-embedded` (no renderer) client targeting the 720×720 panel is plausible and is the only realistic KORRI surface here, but there is **no HDMI out**, so docked use is off the table.
- **Conclusion**: out-of-class for KORRI's primary runtime; only useful as a reference target for "what we explicitly don't support."

## Sources
- **Kept** — AISLPC R36T MAX Review, Retro Handhelds (https://retrohandhelds.gg/game-console-r36t-max-review/) — only hands-on teardown; confirms board silkscreen, RAM, screen, weight, connectors.
- **Kept** — AISLPC product page (https://aislpc.com/products/r36t-max) — first-party for screen size/res, battery, OS.
- **Kept** — Pocket Retro Gaming R36T Max (https://pocketretrogaming.com/en/anbernic/r36t-max/) — SoC + RAM + controls + dimensions.
- **Kept** — RGameConsole listing (https://rgameconsole.com/products/r36t-max) — confirms RK3326 + Wi-Fi.
- **Kept** — Rockchip RK3326 datasheet v1.2 (https://rockchip.fr/RK3326%20datasheet%20V1.2.pdf) — primary SoC reference.
- **Kept** — Mozelectronics RK3326 (https://mozelectronics.com/parts/rockchip-rk3326-3318/) — clock, GPU model, video decode.
- **Kept** — Mesa Panfrost docs (https://docs.mesa3d.org/drivers/panfrost.html) — Vulkan/GLES support matrix.
- **Kept** — CNX Software Panfrost GLES 3.1 (https://www.cnx-software.com/2021/06/14/panfrost-opengl-es-3-1-midgard-mali-t760-bifrost-mali-g31-g52-g76-gpu/) — G31 GLES 3.1 conformance.
- **Kept** — Retro Handhelds R36T/Max setup guide (https://retrohandhelds.gg/aisplc-r36t-and-r36t-max-setup-guide/) — confirms ArkOS4Clone reflash path (implies Maskrom).
- **Kept** — r/SBCGaming R36 Max thread (https://www.reddit.com/r/SBCGaming/comments/1i75ut3/r36max/) — Wi-Fi/BT dongle compatibility.
- **Dropped** — Wikipedia "List of Rockchip products" — only used for cross-check, not directly cited.
- **Dropped** — aislpc.com "Special Edition" — duplicate of base product page.
- **Dropped** — manuals.plus user manual entry — could not extract spec block from indexed snippet; not a richer source than retailer/review.
- **Dropped** — R36T (non-Max) review on pocketretrogaming — different device (3.5" 640×480), kept only as disambiguation reference.

## Gaps
- **Exact RAM type/speed** (LPDDR3 vs DDR3L) and **eFuse status** (whether AISLPC fuses any boot bits) — would require a teardown photo of the DRAM package and `rkdeveloptool` output. Suggested next step: ask in r/SBCGaming or check the ArkOS4Clone R36T MAX flashing thread for `rkdeveloptool rfi` output.
- **FCC ID** and any CE/UKCA certification numbers — not found; check inside-the-case labels in a higher-resolution teardown.
- **L3/R3 click presence**, **trigger analog axes**, **screen refresh rate**, and **panel vendor** — none called out by current sources; would require an `evtest` dump from a flashed unit.
- **microSD max capacity** — only the 128 GB ship bundle is confirmed; SDXC support on RK3326 is hardware-capable to 2 TB but kernel/driver caps in EmuELEC builds typically constrain practical use to 512 GB or 1 TB.
- **HDMI-out**: strongly implied absent but not explicitly stated by AISLPC. A photo of the top edge of the chassis would close this.
