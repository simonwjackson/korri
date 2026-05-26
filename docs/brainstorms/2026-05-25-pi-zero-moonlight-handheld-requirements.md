---
date: 2026-05-25
topic: pi-zero-moonlight-handheld
---

# Pi Zero Moonlight Handheld — Custom DIY Device

## Summary

A pocket-sized DIY handheld that is **not** powerful enough to emulate modern systems, but powerful enough to (a) decode a Moonlight stream from a remote host (e.g., `fuji` running Sunshine + RetroArch), (b) play Pico-8 cartridges natively, and (c) function as a media player. Goal is "feels like a product I built" — premium DIY industrial design, not a breadboarded prototype. Companion device to the upstream `fuji` ephemeral stream stack proved out earlier in the session (see `docs/solutions/architecture-patterns/headless-arm-cloud-feasibility-for-sunshine-emulator-stack-2026-05-25.md`).

---

## Problem Frame

The `fuji` validation answered "can a free ARM cloud box host an emulator stream stack?" — yes for 2D, blocked for 3D. The natural next question is "what's the cheapest dedicated device that can be the *client* for that stream stack on the go?" Off-the-shelf options (Anbernic RG28XX at $50, Retroid Pocket Mini at $170, Sony NW-A306 + 8BitDo at $370) all solve the spec. The DIY justification is **aesthetic and craft, not cost or capability** — the object itself is the deliverable.

The conversation deliberately pivoted from "Moonlight thin client" to a **dual-purpose object**: a modern Game Boy that also streams. That framing matters because:

- Local emulation on a phone beats local emulation on a Pi Zero on every axis (latency, battery, screen quality).
- Streaming on a phone-plus-controller beats this DIY device on every axis.
- The unique value is **(persistent session continuity across devices) + (an object you can hold that feels designed-on-purpose, not generic) + (offline-capable Pico-8 native play)**.

---

## Decided Requirements

| # | Requirement | Status |
|---|---|---|
| R1 | Full-color OLED screen (not LCD, not monochrome) | Decided |
| R2 | Squarish-to-landscape aspect ratio (no tall narrow Walkman) | Decided |
| R3 | Edge-to-edge screen feel (~75%+ screen-to-body) | Decided |
| R4 | Horizontal handheld layout: `[D-pad][screen][buttons]` | Decided |
| R5 | Built-in speaker (game audio + MP3 playback) | Decided |
| R6 | Side/shoulder buttons for media control (vol, skip, play/pause) | Decided |
| R7 | "Ultra small" — pocketable, Game Boy Micro-sized or smaller | Decided |
| R8 | "Full day" battery — ~12+ hours mixed use | Decided |
| R9 | WiFi connectivity | Decided |
| R10 | Cloud save sync (when on WiFi, not over cellular) | Decided |
| R11 | Premium "product-grade" finish — not breadboard aesthetic | Decided |

## Rejected / Dropped Requirements

| # | Was | Why dropped |
|---|---|---|
| X1 | SIM card / cellular connectivity | Power budget conflict: cellular modem (~50-400mA continuous) + ultra-small + all-day battery is physically impossible on Pi Zero ecosystem. WiFi-only is acceptable since cloud save sync is intermittent. |
| X2 | "Tall narrow Walkman" form factor | Pivoted to horizontal Game Boy Micro layout per R4. |
| X3 | 1.69″ AMOLED panel (initial recommendation) | Doesn't actually exist in the bare-panel market — every "1.69 AMOLED" listing is an LCD with ST7789V2 controller. |

## Hardware Decisions

| Component | Choice | Rationale |
|---|---|---|
| **Compute** | Raspberry Pi Zero 2 W | H.264 hardware decode for Moonlight; quad-core ARM A53 sufficient for Pico-8 and 2D emulation; tiny footprint; mainline Linux + Moonlight Embedded support |
| **Display** | 1.8″ AMOLED 368×448, SH8601 driver, QSPI interface | Best squarish-rectangular AMOLED with mature ecosystem (Waveshare wiki + libraries + sample code). Rotated to landscape (448×368) = 1.22:1 aspect, close to 4:3 with minor letterboxing for retro content. 165K pixels at ~258 PPI. ~$25-40 bare panel from Aliexpress, or $43-55 as Waveshare ESP32-S3-Touch-AMOLED-1.8 dev board (useful as proof-of-concept first) |
| **Power** | Custom: 4000mAh thin LiPo + Adafruit PowerBoost 1000C | PiSugar 3's 1200mAh insufficient for full-day target. Custom LiPo lets us shape the battery to fit the case |
| **Audio out** | I2S amp (MAX98357A) + small 4Ω speaker | Built-in speaker per R5; bypasses Pi Zero's lack of analog audio |
| **Input — face buttons** | Custom 6mm tactile switches with PBT keycaps, wired to Pi Zero GPIO (matrix or direct) | Custom built-in buttons per R11's "product feel" goal — adding an 8BitDo Zero 2 over Bluetooth would be easier but breaks the "object I built" framing |
| **Input — media buttons** | Top-edge shoulder buttons (vol-, vol+, skip-back, skip-forward) | Per R6. Top edge means index fingers reach naturally while holding horizontally |
| **Storage** | microSD 32GB (SanDisk High Endurance) | OS + Pico-8 cartridges + music library + cloud save sync |
| **Connectivity** | Pi Zero 2 W onboard WiFi | Sufficient per R9 |
| **Enclosure** | 3D-printed (Etsy maker premium SLA print, OR donor handheld gut, OR custom design) | Three paths still open. Etsy premium SLA is the lowest-effort "product feel" path |

## Aspect Ratio Mapping (1.8″ in landscape, 448×368, 1:1.22)

| Source | Native aspect | Fit on 448×368 |
|---|---|---|
| SNES / Genesis | 1.33:1 | Small letterbox top/bottom — good |
| NES | 1.07:1 | Small pillarbox left/right — good |
| GBA | 1.5:1 | Moderate letterbox top/bottom — acceptable |
| Game Boy / GBC | 1.11:1 | Pillarbox — fine |
| Pico-8 | 1:1 | Pillarbox; at 3× integer scale (384×384) fills cleanly |
| Moonlight at 16:9 | 1.78:1 | Significant letterbox — content scaled down |

The 1.8″ panel's slightly-portrait aspect is a deliberate compromise that handles classic retro content cleanly but accepts letterboxing for modern 16:9 streamed content.

## Final Dimensions (Estimated)

**~95 × 50 × 20 mm, ~125 g**

| Reference | Dimensions | vs this device |
|---|---|---|
| Game Boy Micro | 102 × 50 × 17 mm, 80 g | Almost identical footprint, 3 mm thicker, 45 g heavier |
| Anbernic RG28XX | 100 × 50 × 19 mm, ~150 g | Same form factor, slightly smaller and lighter |
| Game Boy Pocket | 127 × 77 × 25 mm | This device is much smaller |
| iPhone SE 3 | 138 × 67 × 7.6 mm | This device is ~70% the volume |

Headline: **Game Boy Micro–sized.**

## Power Budget

Approximate measured/spec'd draws at 1.8″ panel:

| Component | Idle | Active |
|---|---|---|
| Pi Zero 2 W | 150 mA | 400 mA (Moonlight decode) |
| 1.8″ AMOLED | 30 mA | 80 mA |
| I2S amp + speaker | 5 mA | 150 mA |
| Total | ~185 mA | ~630 mA |

For 14h day = 4h active + 10h standby:
- 4 × 630 + 10 × 185 = 2520 + 1850 = ~4400 mAh + 20% margin = **~5300 mAh recommended**

4000 mAh sits at the bottom of comfortable. If form factor allows, prefer 5000 mAh.

## Software Stack (Proposed)

| Layer | Choice |
|---|---|
| OS | Raspberry Pi OS Lite (Bookworm) |
| Display driver | fbcp-ili9341 style SPI framebuffer copy, OR mainline kmsdrm with SH8601 panel device-tree overlay (custom work, 5-10 hours) |
| Streaming | Moonlight Embedded (mainline) |
| Native game runtime | Pico-8 binary (~$15 license, runs on ARM Linux) |
| Music | mpd or mpv with mpc/ncmpcpp frontend, or custom shell |
| Menu shell | TBD — custom curses/LVGL menu to switch between Moonlight / Pico-8 / Music modes |
| Input chmod | systemd-managed inotify watcher (lesson from `fuji` work) for hot-plug input devices |

## Cost Estimate

| Bucket | $ |
|---|---|
| Pi Zero 2 W | 20 |
| 1.8″ AMOLED panel | 30 |
| Waveshare dev board (proof-of-concept) | 50 |
| LiPo 4000 mAh + PowerBoost 1000C | 30 |
| Buttons + switches + caps | 15 |
| I2S amp + speaker | 10 |
| microSD | 8 |
| Misc (USB-C, JST, wiring, hardware) | 15 |
| 3D-printed enclosure (Etsy maker premium) | 50 |
| Pico-8 license (optional) | 15 |
| **Subtotal** | **~$245** |

Off-the-shelf comparisons:
- Anbernic RG28XX: $50 (way cheaper, no Moonlight by default, plays everything natively)
- Retroid Pocket Mini: $170 (OLED, Android, Moonlight + Pico-8 + music)
- Sony NW-A306 + 8BitDo Zero 2: $370 (premium feel, Android Play Store)

DIY is the *most expensive* option. The justification is the object, not the cost.

## Open Questions

1. **Enclosure path** — Etsy maker (lowest effort), donor handheld gut (most "authentic" feel), or custom CAD + JLCPCB CNC (highest control). Decision blocks final BOM.
2. **Aesthetic direction** — Game Boy Micro retro-colored vibe, or Walkman-derived brushed-metal premium vibe, or cyberdeck-derived blacked-out utility vibe? Affects case sourcing and button cap selection.
3. **Country of shipment** — affects vendor bias (Pimoroni/UK vs Adafruit/US vs Aliexpress slow shipping).
4. **Bare panel vs dev board strategy** — buy bare panel only ($30), buy dev board first as proof ($50) and bare panel second ($80 total), or use dev board permanently and drop Pi Zero (loses Moonlight and Pico-8). Recommended: dev board as proof + bare panel for final build.
5. **Speaker model** — needs to fit ~20-30mm grille area in the chin. Pimoroni Speaker pHAT or smaller mono speaker module.
6. **Battery exact dimensions** — 4000-5000 mAh LiPo pouch cell needs to fit alongside Pi Zero in the case. 5×40×60mm or similar — needs case design coordination.
7. **Cloud save sync mechanism** — Syncthing? rsync over Tailscale? A custom script? Depends on which emulator state files need syncing and what the upstream `fuji` writes.
8. **Menu shell** — custom LVGL UI, or a minimal terminal-based dmenu-style launcher, or use RetroPie's EmulationStation as the front-end shell?

## Out of Scope (Explicitly)

- Cellular / SIM card connectivity (X1)
- 3D-tier emulation (N64, PSP, GameCube) — same blocker as `fuji` (no GL on Pi Zero with this display stack, and the CPU is too weak anyway)
- Persistent NixOS configuration — this device is a personal one-off, not a fleet
- Pre-built handheld product release / commercialization

## Related

- `docs/solutions/architecture-patterns/headless-arm-cloud-feasibility-for-sunshine-emulator-stack-2026-05-25.md` — the upstream `fuji` learning that produced the streaming side of this picture
- `docs/brainstorms/2026-05-18-headless-game-stream-orchestration-requirements.md` — adjacent: orchestration on the server side; this brainstorm is about the client device

## Next Steps

1. Decide on enclosure path (Q1) and aesthetic direction (Q2) — these are blocking everything else
2. Order Waveshare ESP32-S3-Touch-AMOLED-1.8 dev board as proof-of-concept platform (~$50, arrives in 1-2 weeks)
3. While waiting: get Moonlight Embedded compiled on a Pi Zero 2 W, prove it can pair with `fuji` and decode at 720p
4. While waiting: get Pico-8 license, prove it runs at 60 fps on Pi Zero 2 W against an HDMI monitor
5. Once dev board arrives: prove the AMOLED panel works via the Waveshare Arduino examples
6. Port the SH8601 init sequence from Arduino to Pi Zero SPI (fbtft module or custom kmsdrm panel driver)
7. Order bare panel + LiPo + amp + speaker + button hardware in parallel with case order
8. Finalize BOM and assemble
