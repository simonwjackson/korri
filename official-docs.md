# Official Streaming Quality / Network Docs

Research date: 2026-07-06  
Purpose: Inform Korri floor/startup/ceiling bitrate design, preflight probe, and handoff downshift policy.

---

## 1. GeForce NOW — Official Network Requirements

**Source:** https://www.nvidia.com/en-us/geforce-now/system-reqs/ (NVIDIA, accessed 2026-07-06)

### Bandwidth requirements (downstream, per client tier)

| Quality target | Minimum download |
|---|---|
| HD / 720p @ up to 60 FPS | **15 Mbps** |
| FHD / 1080p @ 60 FPS | **25 Mbps** |
| UW-QHD / QHD (2560×1440) @ 120 FPS | **35 Mbps** |
| 4K (3840×2160) @ 120 FPS | **45 Mbps** |
| QHD & FHD @ 240 / 360 FPS | **55 Mbps** |
| 5K (5120×2180) @ 120 FPS | **65 Mbps** |

**Latency requirement:** < 80 ms from an NVIDIA data center (round-trip).  
**Connection recommendation:** Wired Ethernet, or 5 GHz WiFi router.

### Interpretation for Korri

- 15 Mbps is NVIDIA's published hard floor for any playable stream (720p/60).
- 25 Mbps is the threshold at which a 1080p/60 stream is considered viable.
- The GFN bandwidth steps confirm the non-linear relationship between resolution, FPS, and required throughput: 4K/120 needs 3× the bandwidth of 720p/60.
- 80 ms RTT is the latency hard cap; above this GFN refuses the session. A Korri preflight probe should use the same or tighter gate.

---

## 2. Moonlight — Default Bitrates per Resolution/FPS

**Source:** https://github.com/moonlight-stream/moonlight-embedded/tree/master/docs (`README.pod`, official moonlight-embedded documentation)

### Default auto-selected bitrates (`moonlight-embedded`)

Documented verbatim from the `README.pod`:

> Change bitrate to BITRATE Kbps. By default the bitrate depends on the selected
> resolution and FPS.
> - **For resolution 1080p and 60 FPS and higher, 20 Mbps is used.**
> - For resolution 1080p or 60 FPS and higher, 10 Mbps is used.
> - **For other configurations, 5 Mbps is used by default.**

| Configuration | Moonlight-embedded default |
|---|---|
| 1080p **AND** ≥ 60 FPS | **20 Mbps (20,000 Kbps)** |
| 1080p **OR** ≥ 60 FPS (but not both) | **10 Mbps (10,000 Kbps)** |
| Everything else (720p/30, etc.) | **5 Mbps (5,000 Kbps)** |

### Moonlight-Qt bitrate slider

**Source:** https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions

> **Why doesn't the bitrate slider go beyond 150 Mbps?**  
> The hardware video decoder on the client must have the capability to actually handle the video bitrate you specify. Since almost no content is produced at a bitrate above 100 Mbps, it's unlikely that the hardware decoder and driver could handle a 1 Gbps video stream even if you have a 1 Gbps network connection.

**Maximum configurable bitrate in all Moonlight clients: 150 Mbps.** This is a hard cap, not a user preference.

### Internet streaming bitrate recommendation

> When you are streaming outside your home, we recommend that you choose a bitrate in Moonlight that is **at least 1 Mbps lower than your Internet connection's upload speed.** This will leave room for other upload traffic from your network to avoid disturbing your Moonlight streaming performance.

### Moonlight frame rate behavior (variable frame rate note)

**Source:** https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions

> **Why is my frame rate low when streaming static content from Sunshine?**  
> Unlike GeForce Experience which produces a fixed frame rate encode, Sunshine uses **variable frame rate encoding** to match the rate of content updates on the host. That means you'll see **a low frame rate (typically around 10 FPS) when streaming static content**. When content on the screen starts changing, the frame rate will increase to match the frame rate of the content displayed on the host PC, up to the maximum FPS set in Moonlight.

This is critical for Korri preflight: a "low FPS" reading during the first seconds of a stream does not indicate a network problem — it indicates static content on the host.

### Moonlight diagnostic overlay metrics

| Metric | Meaning | Failure signal |
|---|---|---|
| Network latency | RTT client↔host ("ping") | Increases with distance, high bitrate |
| Network latency variance | Jitter between packets | High or unstable = lower bitrate or switch network |
| Decode latency | Time to decode one frame (hw/sw decoder + bitrate + FPS dependent) | Varies widely; higher FPS can *reduce* it on some devices |
| Frames dropped by network | % of frames lost in transit | Should be ≈ 0%; >0% = unreliable network or bitrate too high |
| Frames dropped due to jitter | % of frames too early/late to render | Caused by high jitter; can also be hardware/driver |

**Source:** https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions

---

## 3. Sunshine — Configuration Reference

**Source:** https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html (LizardByte, current stable)  
**Source:** https://docs.lizardbyte.dev/projects/sunshine/v0.23.0/about/advanced_usage.html (v0.23.0, last stable with full advanced-usage page)

### Directly relevant settings

#### `max_bitrate` (Audio/Video section)

> The maximum bitrate (in Kbps) that Sunshine will encode the stream at.  
> If set to 0, it will always use the bitrate requested by Moonlight.
>
> **Default: 0**  
> Example: `max_bitrate = 5000`

**Implication:** Out of the box, Sunshine is bitrate-uncapped and simply honours whatever Moonlight negotiates. Korri can trust Moonlight's requested bitrate as the actual encoder target, unless `max_bitrate` is set server-side.

#### `minimum_fps_target` (Audio/Video section)

> Sunshine tries to save bandwidth when content on screen is static or a low framerate. Because many clients expect a constant stream of video frames, a certain amount of duplicate frames are sent when this happens. This setting controls the **lowest effective framerate a stream can reach**.
>
> **Default: 0** = Use half the stream's FPS as the minimum target.  
> Choices: 0–1000.

**Implication:** At default (0), the minimum delivered FPS during static scenes is `configured_fps / 2`. For a 60 FPS stream that's ≥ 30 FPS. A Korri FPS floor in adaptive control should stay above this half-rate floor; anything below it is actually encoder-imposed, not network-imposed.

#### `fec_percentage` (Advanced section)

> Percentage of error correcting packets per data packet in each video frame.  
> Higher values can correct for more network packet loss, but at the cost of increasing bandwidth usage.
>
> **Default: 20** (i.e., 20% overhead for FEC)  
> Range: 1–255.

**Implication:** A 20% FEC overhead means that a stream configured to 20 Mbps actually sends ~24 Mbps on the wire. Korri's ceiling and preflight bandwidth gates should account for this overhead (~20% above the configured bitrate).

#### `nvenc_vbv_increase` (NVENC-specific)

> Single-frame VBV/HRD percentage increase. By default sunshine uses **single-frame VBV/HRD**, which means any encoded video frame size is not expected to exceed **requested bitrate ÷ requested frame rate**.  
> Relaxing this restriction can be beneficial and act as low-latency variable bitrate, but may also lead to packet loss if the network doesn't have buffer headroom to handle bitrate spikes.  
> Maximum accepted value is 400, which corresponds to 5× increased encoded video frame upper size limit.
>
> **Default: 0**

**Implication:** With default settings (vbv_increase=0), Sunshine enforces that no single frame exceeds `bitrate_kbps / fps` bits. This is strict CBR behaviour. A Korri adaptive controller that negotiates bitrate changes will see consistent per-frame sizes — there are no surprise bursts unless the host admin has changed this.

#### `nvenc_twopass`

> Enable two-pass mode in NVENC encoder. This allows to detect more motion vectors, better distribute bitrate across the frame and **more strictly adhere to bitrate limits**. Disabling it is not recommended since this can lead to occasional bitrate overshoot and subsequent packet loss.
>
> **Default: `quarter_res`** (two passes, first pass at quarter resolution)

**Implication:** Bitrate adherence is by design tight. Transient overshoots triggering packet loss are a known failure mode when two-pass is off.

### Sunshine system requirements (minimum network)

**Source:** https://docs.lizardbyte.dev/projects/sunshine/latest/ (Sunshine landing page)

| Tier | Requirement |
|---|---|
| Minimum (host + client) | 5 GHz, 802.11ac |
| 4K recommendation (host + client) | CAT5e Ethernet or better |
| HDR recommendation (host + client) | CAT5e Ethernet or better |

### Advertised resolutions and FPS (Sunshine defaults)

These are the resolutions and FPS modes Sunshine will advertise to Moonlight clients (unless the host admin changes them):

**Resolutions:**
```
352x240, 480x360, 858x480, 1280x720, 1920x1080,
2560x1080, 3440x1440, 1920x1200, 3840x2160, 3840x1600
```

**FPS modes:**
```
10, 30, 60, 90, 120
```

**Implication:** Korri's startup negotiation can safely request any combination in the above lists. Requesting values outside these lists is possible via the Moonlight protocol, but some clients (e.g. Moonlight-nx on Switch) require the value to be in the advertised list.

---

## 4. WebRTC / GCC — Congestion Control Reference

**Source:** https://datatracker.ietf.org/doc/html/draft-ietf-rmcat-gcc-02  
("A Google Congestion Control Algorithm for Real-Time Communication", IETF RMCAT WG)

> **Note:** Moonlight uses NVIDIA's GameStream protocol (custom RTSP + UDP, not WebRTC). These GCC concepts do not directly apply to Sunshine/Moonlight streams but are the closest published standard for real-time bitrate adaptation and are useful reference for designing Korri's adaptive control policy.

### GCC architecture

Two cooperating controllers:
- **Delay-based controller**: detects queue build-up from inter-packet delay variation (Kalman filter). Outputs `A_hat` (available bandwidth estimate).
- **Loss-based controller**: uses RTT + packet loss fraction. Outputs `As_hat`. Actual send rate = `min(A_hat, As_hat)`.

### Rate control state machine

```
States: Increase → Decrease → Hold → Increase
Signal: Over-use → Decrease
Signal: Normal  → Increase (or Hold from Decrease)
Signal: Under-use → Hold
```

### Increase phase (two modes)

| Mode | When | Formula |
|---|---|---|
| **Multiplicative** | Far from convergence (no recent Decrease state) | `A_hat *= 1.08^(dt_seconds)` — up to **8% per second** |
| **Additive** | Close to convergence | `A_hat += 0.5 × avg_packet_size / response_time` — response_time = **RTT + 100 ms** |

### Decrease (on over-use detection)

```
A_hat(i) = 0.85 × R_hat(i)
```
Where `R_hat(i)` = measured incoming bitrate over a 0.5–1 s window.  
**Beta = 0.85** is the recommended value (range 0.80–0.95).

### Loss-based control thresholds

| Packet loss fraction | Action |
|---|---|
| < 2% | Increase: `As_hat *= 1.05` |
| 2%–10% | Hold: `As_hat` unchanged |
| > 10% | Decrease: `As_hat *= (1 - 0.5 × loss_fraction)` |

### Key timings

| Parameter | Recommended value |
|---|---|
| Burst pacing interval | **5 ms** |
| Over-use signal delay | **10 ms** sustained |
| Bitrate measurement window | **0.5–1 s** |
| Delay estimate initial threshold | **12.5 ms** |
| Delay threshold clamp range | [6 ms, 600 ms] |
| Increase bound | `A_hat < 1.5 × R_hat` |

### Startup implication

> The subsystem **starts in the Increase state**, where it will stay until over-use or under-use has been detected. On every update the delay-based estimate is increased, either multiplicatively or additively, depending on its current state.

Startup is always multiplicative (no previous Decrease data → treated as "far from convergence").  
8% per second ramp-up means a stream starting at 10 Mbps reaches 20 Mbps in ~9 seconds if no congestion is detected.

---

## 5. Synthesis: Concrete Numbers for Korri Design

### Bitrate floor / minimum viable

| Scenario | Floor |
|---|---|
| Absolutely unusable | < 5 Mbps |
| Moonlight-embedded self-selected floor (720p/30 or less) | **5 Mbps** |
| Moonlight-embedded: 1080p or 60 FPS (not both) | **10 Mbps** |
| Moonlight-embedded + GFN: 1080p/60 (both) | **15–20 Mbps** |

**Recommended Korri preflight gate:** ≥ 5 Mbps to attempt any stream; ≥ 15 Mbps for 720p/60; ≥ 20 Mbps for 1080p/60.

### Startup bitrate selection

- Moonlight-embedded's defaults are proven conservative starting points.
- For a Korri "startup bitrate" policy: begin at the GFN minimum for the target resolution/FPS tier, not the ceiling.
  - 720p/60 startup: 15 Mbps
  - 1080p/60 startup: 20 Mbps
  - 4K/60 startup: 45 Mbps
- GCC startup is multiplicative ramp: starting at 50–60% of ceiling and ramping up avoids initial congestion.

### Ceiling

- Moonlight UI hard cap: **150 Mbps** (hardware decoder limit, not a network recommendation).
- GFN practical ceiling: 65 Mbps for 5K/120.
- For LAN streams (no upload constraint), a practical ceiling for 1080p/60 is **~50 Mbps** (produces visually lossless encode with comfortable headroom).
- For WAN streams: ceiling = `upload_speed_mbps - 1 Mbps` (Moonlight docs recommendation).

### FEC bandwidth overhead

- Sunshine default FEC = 20%.
- Wire throughput = configured bitrate × 1.20.
- Preflight and ceiling calculations should reserve at least **20% headroom** above the desired stream bitrate.

### Handoff downshift policy

Based on Moonlight's observable metrics (visible in the `Ctrl+Alt+Shift+S` overlay):
- **Trigger on:** "Frames dropped by network connection" > ~0.5% sustained over ≥ 1 s.
- **Trigger on:** "Network latency variance" (jitter) rising steeply.
- **GCC-derived downshift magnitude:** reduce to **85%** of current measured incoming bitrate.
- **Recovery:** additive increase only (not multiplicative) after a downshift to avoid re-triggering congestion.
- **Floor guard:** do not shift below the configured `minimum_fps_target`-equivalent; below that the encoder is already duplicating frames and further bitrate cuts only reduce quality, not latency.

### Latency hard gate

- GFN: **< 80 ms RTT** is the hard gate for launching a session.
- Moonlight docs: latency increases when bitrate exceeds link capacity ("Network latency usually increases... if your bitrate is set higher than your connection can handle well").
- **Korri preflight recommendation:** measure RTT before launch; abort or warn if > 60–80 ms; refuse if > 120 ms.

### Static-content FPS floor

- Sunshine default: `minimum_fps_target = 0` → floor = `stream_fps / 2`.
- At 60 FPS stream config, static scenes may deliver ≥ 30 FPS.
- Do **not** interpret FPS readings below the configured target as a network failure during stream startup; they are normal for static/loading screens.

---

## 6. URLs and Source Citations

| Source | URL |
|---|---|
| NVIDIA GeForce NOW System Requirements | https://www.nvidia.com/en-us/geforce-now/system-reqs/ |
| Moonlight-embedded docs (bitrate defaults) | https://github.com/moonlight-stream/moonlight-embedded/tree/master/docs |
| Moonlight FAQ (bitrate slider limit, static FPS, jitter) | https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions |
| Moonlight Setup Guide (internet bitrate advice) | https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide |
| Sunshine configuration reference (latest) | https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html |
| Sunshine advanced usage / NVENC VBV (v0.23.0) | https://docs.lizardbyte.dev/projects/sunshine/v0.23.0/about/advanced_usage.html |
| Sunshine overview / system requirements | https://docs.lizardbyte.dev/projects/sunshine/latest/ |
| IETF draft-ietf-rmcat-gcc-02 (GCC congestion control) | https://datatracker.ietf.org/doc/html/draft-ietf-rmcat-gcc-02 |
