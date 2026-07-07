# External Best Practices: Game Streaming Quality Adaptation

**Written:** 2026-07-06  
**Scope:** Preflight network tests, conservative cold-start ramp, max-bitrate auto, network handoff/transition handling, and congestion-collapse avoidance for low-latency interactive video. Focused on design guidance relevant to Korri's floor/startup/ceiling CLI grammar, health-driven adaptive controller, and the parking-lot items for preflight launch-quality selection and handoff-aware preemptive downshift.

---

## 1. How Industry Leaders Handle Preflight Quality Selection

### GeForce NOW: server-selection network test before launch

GeForce NOW executes a dedicated **platform management phase** before every gameplay session begins. Network measurement flows run against several vantage points (regional → city → individual server) and measure latency and throughput to select the optimal cloud server. Only after this preflight pass does the gameplay session open. The entire flow is observable in packet captures as a distinct burst of HTTPS flows to `server_[location]_pnt.nvidiagrid.net` subdomains, running at a low packet rate (~0.5 pps) before any video traffic starts.

> Source: *Network Anatomy and Real-Time Measurement of Nvidia GeForce NOW Cloud Gaming*, Lyu et al., arXiv 2401.06366, Feb 2024. URL: https://arxiv.org/html/2401.06366v2

**Key design implication for Korri:** The industry pattern is a two-phase model — a cheap, non-intrusive **probe phase** (latency + rough throughput) before the stream is established, not after. Korri's current implementation does no pre-launch probe; everything is post-launch adaptive. The parking-lot item `add-preflight-probe-for-stream-launch-quality-selection` maps directly to this gap.

### Moonlight/Sunshine: manual floor set, then user-driven bitrate discipline

Moonlight's official guidance (as of March 2024) recommends:

> "When you are streaming outside your home, we recommend that you choose a bitrate in Moonlight that is at least 1 Mbps lower than your Internet connection's upload speed."

This is a **manual headroom discipline**, not an automatic preflight probe. The bitrate slider is limited to 150 Mbps due to hardware decoder and NVENC encoding constraints — not a software cap. Sunshine does not perform adaptive bitrate control itself; bitrate adaptation must come from the client side (Moonlight sends the target; Sunshine honors it up to its `max_bitrate` cap, defaulting to 0 = honor whatever Moonlight requests).

> Sources:  
> - Moonlight FAQ: https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions  
> - Sunshine configuration reference: https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html

Sunshine's `max_bitrate` config:

```
# max_bitrate = 0  (default: honor client request fully)
# max_bitrate = 5000  (cap at 5 Mbps regardless of client request)
```

Sunshine's `nvenc_vbv_increase` allows single-frame VBV relaxation: small bursts above the stated bitrate are allowed, acting as low-latency variable bitrate, but risks packet loss if the network has no buffer headroom for spikes. This directly maps to Korri's startup burst / panic bitrate behavior — the host-side encoder VBV and the client-side adaptive controller must be in concert.

### iperf3 vs. a lightweight product-owned probe

iperf3 is a conventional tool for measuring memory-to-memory bandwidth. For a game streaming preflight, it has several drawbacks:

- **User friction:** requires an iperf3 server to be running on the source machine, which is a setup burden.
- **Over-aggressive:** iperf3 saturates the link to measure maximum throughput, which can fill router buffers and temporarily hurt RTT — the opposite of what a low-latency probe should do.
- **Not path-realistic:** iperf3 measures raw TCP/UDP bandwidth, not the UDP+codec-shaped traffic pattern that Moonlight/Sunshine actually emit.

A **lightweight product-owned probe** is preferable:

- Send a short burst of UDP packets (~10–30 packets over 500 ms–1 s) at a probe rate (e.g., 2 Mbps) and measure one-way delay, jitter, and delivery ratio.
- Use RTT (ping to the source machine) plus packet delivery ratio as the primary signal, not raw throughput.
- Map results to a named launch profile: `high` (RTT < 30 ms, loss < 0.5%), `medium` (RTT 30–70 ms, loss < 1%), `safe` (RTT 70–120 ms, loss < 2%), `rescue` (RTT > 120 ms or loss ≥ 2%).

This is precisely how GCC/WebRTC does its start-of-call probing (see §3).

---

## 2. Conservative Cold Start Then Ramp

### WebRTC GCC: exponential probe clusters from a 300 kbps floor

Google's Congestion Control (GCC) — the algorithm underlying WebRTC's TWCC feedback — starts every call at a hardcoded **300 kbps** estimate, then immediately sends two exponential probe clusters:

- Probe 1: 3 × start_bitrate = **900 kbps**
- Probe 2: 6 × start_bitrate = **1800 kbps**

If probes succeed (receive rate ≥ send rate within tolerance), the bandwidth estimate jumps aggressively — reaching >1 Mbps in under 1 second, and >3 Mbps after 5 probes in a good network. This is the **cold-start ramp**: a deliberate exponential increase, not AIMD linear increase, because AIMD is too slow after a fresh start.

> Source: *Probing WebRTC Bandwidth Probing — why and how in gcc*, webrtcHacks, May 2024. URL: https://webrtchacks.com/probing-webrtc-bandwidth-probing-why-and-how-in-gcc/  
> Chromium source: https://source.chromium.org/chromium/chromium/src/+/main:third_party/webrtc/modules/pacing/

GCC also re-probes after a **large transient drop**:

> "If a transient problem causes a large bitrate drop, it can take a long time to fully recover. `ProbeController::RequestProbe()` initiates a single probe at 0.85 × bitrate_before_last_large_drop. If the probe fails, the drop was real."

This is the **post-cliff recovery probe** — a single targeted test at 85% of the pre-cliff level to distinguish a transient glitch from a sustained degradation.

**Korri mapping:**  
Korri's existing `coldStartBitrateKbps = 8_000` (8 Mbps) and `coldStartIncreaseFraction = 0.28` (28% per tick) during the `establish` phase implement a similar ramp. The cold-start sample count of 3 before allowing growth is analogous to GCC's sample accumulation guard. The current default `coldStartSampleCount: 3` and `coldStartIncreaseFraction: 0.28` are well-calibrated relative to GCC's approach. The post-cliff re-probe in GCC (`0.85 × pre-cliff bitrate`) maps to the observation that Korri's cliff detection could similarly emit a targeted single re-probe attempt rather than resuming normal AIMD growth immediately.

### TGaming (Princeton, 2024): resolution-first on growth, fps-first on shed

TGaming's scheduler (validated on a production 5G SA network) follows this priority order:

- **On bandwidth increase:** first raise resolution (to a cap), then raise frame rate.
- **On bandwidth decrease:** first decrease frame rate to a preset step, then gradually decrease resolution.
- Floor for "bad" resolution: 640 × 360. Below this, further frame rate reductions before additional resolution shrinkage.
- Frame rate steps: [90, 60, 45, 30, 15] fps.
- Resolution changes are **gradual** (10% width/height steps, e.g., 1920×1080 → 1728×972) rather than large jumps (1080p → 720p) to avoid perceptible quality cliff drops.

> Source: *Evolving Mobile Cloud Gaming with 5G Standalone Network Telemetry*, Wan & Jamieson, Princeton / arXiv 2402.04454, Sep 2024. URL: https://arxiv.org/abs/2402.04454

**Korri mapping:**  
Korri's `recoverResolution` and `recoverFps` follow the same general priority (resolution recovers before fps in the fine-tune path). The 10%-step resolution growth in TGaming is more conservative than Korri's `resolutionRecoverFraction: 0.18` (18% grow per tick). For the shed path, Korri's `applyPlayabilityShed` drops directly to `panicBitrateKbps` / `playableResolutionWidth` rather than stepping through fps first — the TGaming evidence supports stepping fps first before collapsing resolution on a gradual bandwidth decrease, reserving the panic drop only for the true cliff case.

### Nebula: forward error correction as an alternative to pure bitrate adaptation

Nebula (SIGCOMM, 2022) couples **adaptive source rate** with **forward error correction (FEC)** at the frame level. Under packet loss, instead of immediately dropping bitrate, Nebula adds redundancy via FEC, tolerating up to ~5% loss without quality reduction, then cuts bitrate when loss exceeds that threshold.

> Source: *Nebula: Reliable Low-latency Video Transmission for Mobile Cloud Gaming*, arXiv 2201.07738. URL: https://arxiv.org/pdf/2201.07738

**Korri mapping:**  
Sunshine exposes a `fec_percentage` knob (default ~20%). Korri does not currently control FEC independently. The Nebula result suggests that FEC and bitrate adaptation can be co-tuned: raising FEC marginally before shedding bitrate may reduce visible quality drops during brief packet loss spikes without triggering the full cliff response.

---

## 3. Max Bitrate Auto-Detection

### The problem: encoder VBV and decoder hardware caps

Moonlight's 150 Mbps slider limit is not arbitrary — it reflects real encoder (NVENC fast-encode path) and client decoder hardware limits. The relevant constraints for "max bitrate auto":

1. **Encoder ceiling:** The host encoder's VBV/HRD determines the maximum per-frame size. Sunshine's single-frame VBV means no frame exceeds `bitrate / fps` bytes. Allowing `nvenc_vbv_increase` relaxes this to a low-latency VBR mode but risks spike-induced loss.
2. **Client decoder ceiling:** The Moonlight client's hardware decoder caps vary. A ~USD 200 phone caps at ~1080p/120fps (per TGaming's measurement). Korri's handheld (SM8550) will have its own decoder ceiling.
3. **Link headroom:** The practical safe ceiling is link_upload_speed − 1 Mbps (Moonlight's own recommendation for WAN streaming) or, for LAN, the observed link rate minus a 5–10% safety margin.

### GCC approach to auto max bitrate

When the **max bitrate of the video channel increases**, GCC sends a probe to verify the new ceiling is achievable:

> "Once probing is complete, if the new max bitrate of the video channel is higher than both the old max bitrate and the current estimate, another probe can be sent to check if we can achieve this higher bitrate."

This maps to Korri's `bitrate=..Xmbps` grammar: when the user or system raises the ceiling, the adaptive controller should immediately probe at the new ceiling rather than waiting for normal AIMD growth to reach it.

### Steam Remote Play: 250 Mbps adaptive cap (2025)

Valve's June 2025 stable Steam update raised the adaptive bitrate ceiling to **250 Mbps** for compatible LAN clients. The relevant principle: the ceiling is a client capability declaration, not a fixed system constant. The adaptive controller respects the declared ceiling as a hard upper bound and treats the estimated link rate as the operative ceiling whenever it's lower.

> Source: *Valve Updates Stable Steam Client with 250 Mbit/s Remote Play*, June 2025. URL: https://www.linuxcompatible.org/story/valve-updates-stable-steam-client-with-250-mbit-s-remote-play-and-multi-controller-support

**Korri mapping:**  
The `bitrate=Xmbps..Ymbps` grammar already supports this. The operational question is: what value to use as the startup `ceiling` before the link rate is known? The GCC approach — start at a conservative ceiling and probe up — means Korri should treat the user-declared `ceiling` as the aspirational max, and the actual operating ceiling during the `establish` phase should be `min(coldStartBitrateKbps, declared_ceiling)`, ramping toward `declared_ceiling` only after the link has proven capacity.

---

## 4. Handling Network Transitions and Handoffs

### The handoff problem for interactive streams

Traditional ABR algorithms for video-on-demand tolerate handoffs by buffering. Interactive game streams cannot buffer — a 200 ms stall during a WiFi→cellular handoff manifests as lost frames and frozen input. The key distinction:

- **Proactive downshift:** Detect the handoff *before* the stream saturates the new (lower-capacity) link and immediately drop to a known-playable floor.
- **Reactive shed:** Wait for delivery ratio drop / RTT spike to trigger the cliff path. Reactive shed is correct but too slow — the RTT spike may take 2–5 seconds to accumulate enough corroboration.

### WebRTC GCC: ALR probing and re-probe after large drops

GCC addresses the "walked into a bad network" case two ways:

1. **Application-Limited Region (ALR) probing:** When the stream is sending less than the estimated capacity (e.g., after shedding), GCC sends periodic padding probes every 5 seconds to maintain a current bandwidth estimate. This prevents the estimate from becoming stale and allows faster ramp-back when the network recovers.
2. **Post-drop re-probe at 0.85×:** After a large drop, GCC emits a single targeted probe at 85% of the pre-drop bitrate to verify whether the drop was transient before committing to slow AIMD recovery.

> Source: https://webrtchacks.com/probing-webrtc-bandwidth-probing-why-and-how-in-gcc/

### Autoformer-based mobility prediction (2025 academic)

A 2025 paper from *Computer Networks* (ScienceDirect) demonstrates that machine-learning-based handoff prediction (Autoformer transformer) can predict upcoming bandwidth drops 1–2 seconds before they manifest as packet loss, allowing preemptive ABR switches. The practical insight: **RTT trend and interface-change signals are leading indicators, while delivery-ratio drop is a lagging indicator**.

> Source: *Autoformer-based mobility and handoff-aware prediction for QoE enhancement in adaptive video streaming in 4G/5G networks*, ScienceDirect, 2025. URL: https://www.sciencedirect.com/science/article/abs/pii/S1084804525002218

### Practical handoff detection signals (no ML required)

For a product-level implementation without ML:

| Signal | How to detect | Latency to detection |
|--------|--------------|---------------------|
| RTT sudden spike (>2× baseline in 1–2 samples) | Monitor `rttMs.trend === "rising"` with a low sample count threshold | 500 ms–1 s |
| Delivery ratio cliff (< 0.5 in 2 consecutive windows) | `bitrateDeliveryRatio` | 1–2 s |
| OS network interface change event | `RTNETLINK` on Linux, `Network.framework` on Apple, `ConnectivityManager` on Android | Immediate (tens of ms) |
| Loss fraction spike (> 5% in a single window) | `lossFraction.mean` | 200–500 ms |

The fastest signal is **OS interface change events** — these fire before any packets are even sent on the new interface. For Korri on a handheld that moves from home WiFi to a mobile hotspot or cellular, a `NETLINK` listener (or equivalent) can trigger a preemptive downshift to a safe profile immediately on interface change, before waiting for RTT/loss corroboration.

**The handoff-aware downshift protocol:**

1. On interface-change event: **immediately** send `bitrate=500kbps fps=30 resolution=640x360` (or whatever the defined `safe` profile is). Do not wait for health windows.
2. Enter a **handoff stabilization period** (e.g., 5–10 seconds) during which the controller holds the floor and does not attempt recovery.
3. After stabilization, measure RTT and delivery ratio over 3 samples.
4. If the new connection is healthy: begin normal AIMD ramp from the floor, not from the previous ceiling.
5. If the new connection is not healthy: remain at floor or enter emergency mode.

**Why not ramp back immediately?** Ramping too fast after a handoff causes a second congestion event — the new connection's buffer is empty but its capacity may still be lower than the pre-handoff link. GCC's post-drop re-probe at 85% is the correct model: confirm capacity at an intermediate level before climbing.

**Korri mapping:**  
The parking-lot item `add-handoff-aware-preemptive-stream-downshift` maps exactly to this. The current cliff detection (`isCliff`) uses RTT rise + delivery ratio + loss corroboration — correct for detecting in-session degradation but too slow for a true handoff. A handoff trigger should bypass the health window and issue the floor command within one control cycle.

---

## 5. Avoiding Congestion Collapse in Low-Latency Interactive Video

### Why game streams are especially collapse-prone

Video-on-demand can absorb congestion by buffering and stalling. Interactive game streams cannot. When a game stream over-shoots link capacity:

1. Router buffer fills → RTT spikes from 20 ms to 200 ms+ ("bufferbloat").
2. The encoder keeps producing frames at the original bitrate.
3. The adaptive controller receives stale / delayed feedback and may not react fast enough.
4. Packet loss begins → frames are dropped → the control socket (used to issue setBitrate/setFps commands) competes with video for the same congested link.
5. The control socket's commands are delayed or lost → the controller can no longer rescue the stream.

This is the "control socket starvation" failure mode that motivates Korri's panic bitrate — you must shed before the control socket itself becomes unreachable.

### AIMD: the foundational anti-collapse algorithm

AIMD (additive increase / multiplicative decrease) is the proven baseline for congestion avoidance:

- **Increase:** add a fixed fraction of current bitrate per RTT (Korri uses `bitrateIncreaseFraction: 0.10`, i.e., +10% per tick).
- **Decrease:** multiply by `(1 - reduction)` where `reduction` scales with pressure (Korri uses 0.06–0.45 scaling).

The multiplicative decrease ensures that under congestion, bitrate drops quickly and decisively. The additive increase ensures recovery is slow and cautious, avoiding re-inducing congestion immediately.

**The key AIMD anti-collapse property:** a multiplicative decrease followed by slow linear recovery cannot cause oscillation at a level that fills the buffer, because each decrease creates a recovery that is smaller than the previous congestion event.

> Reference: *An End-to-End Pipeline Perspective on Video Streaming in Best-Effort Networks*, ACM Computing Surveys, 2024. URL: https://dl.acm.org/doi/10.1145/3742472

### BBR: model-based alternative to loss-based AIMD

BBR v2/v3 (IETF draft, 2024) estimates the bottleneck bandwidth (`BtlBw`) and minimum RTT (`RTprop`) by alternating between bandwidth probing and RTT probing cycles. It maintains a sending rate at `BtlBw × pacing_gain` without waiting for loss:

- **Lower latency than CUBIC/Reno** because it does not need loss to detect congestion — rising RTT is the congestion signal.
- **Better on lossy links** (e.g., WiFi, cellular) because random loss does not cause a false positive and incorrect congestion response.
- **Drawback for game streaming:** BBR is transport-layer (TCP) or requires a custom UDP stack. Moonlight/Sunshine use raw UDP; BBR applies only if a QUIC or BBR-UDP transport is used.

> Source: IETF BBR draft: https://www.ietf.org/archive/id/draft-cardwell-ccwg-bbr-00.html

### SQP: Google's purpose-built interactive video congestion control (2024)

SQP (*Sender Queue Priority*) is Google's congestion control designed specifically for interactive video (used in X/Twitter's AR streaming platform). Key properties:

- **Minimizes sender-side queuing delay**, not just network queuing delay. Standard GCC/AIMD can allow a backlog to build at the encoder/pacer, adding frame delay even without network congestion.
- **Prioritizes frame delay** as the primary QoE metric (not bitrate or resolution).
- **A/B tested on LTE and WiFi:** SQP improved "high bandwidth + low frame delay" sessions by 27 percentage points on LTE and 15 points on WiFi vs. Copa.

> Source: *SQP: Congestion Control for Low-Latency Interactive Video Streaming*, Google Research, 2024. URL: https://research.google/pubs/sqp-congestion-control-for-low-latency-interactive-video-streaming/

The SQP insight directly relevant to Korri: **controlling sender-side queue depth is as important as controlling network congestion**. If the adaptive controller issues a bitrate reduction but the encoder has already queued several frames at the old bitrate, the reduction does not take effect until that queue drains — causing a delayed and therefore inaccurate control loop. Korri's `queueDepth` metric and `(queue - 2) / 8` decode pressure formula capture this, but the SQP finding suggests the controller should weight queue depth more heavily in the "is a downshift needed now?" decision.

### L4S: network-level solution (GeForce NOW already uses it)

L4S (Low Latency, Low Loss, Scalable Throughput — RFC 9330, 2023) is a network architecture that uses the ECN (Explicit Congestion Notification) field to signal *incipient* congestion before queues build. L4S-capable senders can respond to congestion signals with millisecond latency, avoiding bufferbloat entirely.

**GeForce NOW already exposes an L4S toggle** in its custom streaming quality settings, labeled "Adjust for poor network conditions." This is a production deployment of RFC 9330-based congestion avoidance in a game streaming product.

> Sources:  
> - RFC 9330: https://datatracker.ietf.org/doc/rfc9330/  
> - NVIDIA GeForce NOW L4S support: https://nvidia.custhelp.com/app/answers/detail/a_id/5522 (requires auth)  
> - L4S Wikipedia: https://en.wikipedia.org/wiki/L4S

**Korri relevance:** L4S requires both sender and receiver to be L4S-capable, and the network path to support ECN. For Korri's LAN use case (SM8550 handheld ↔ source machine on home network), L4S is unlikely to be supported end-to-end. For WAN or cellular, some ISPs are deploying L4S support (Comcast, DOCSIS 3.1). This is a future consideration, not an immediate design concern, but it explains why GeForce NOW performs well on congested networks that Moonlight/Sunshine struggle with.

### The corroboration requirement and its tradeoff

Korri's current `isCliff` requires **corroboration** before declaring a cliff:

```ts
const corroboratedDeliveryCliff =
  delivery < 0.45 &&
  (rtt >= 100 || queue >= 3 || loss >= 0.02 || pressure.decode > 0.35)
```

This prevents false positives from transient loss or brief RTT spikes. The tradeoff is **detection latency**: a single 500 ms health window showing delivery < 0.45 is insufficient; you need at least one additional corroborating signal, meaning the cliff may go undetected for 500–1000 ms after it begins.

The GCC literature's approach to this is:
- **Delay-based estimator reacts quickly** (RTT rising → bitrate cut within one RTT).
- **Loss-based estimator reacts slowly** (requires sustained loss fraction) to avoid false positives.
- The minimum of both estimates governs the actual bitrate.

For Korri's controller, the equivalent is to treat **RTT trend as a leading indicator** (react immediately to rising RTT, even without delivery ratio drop) and treat delivery ratio drop as a **confirming indicator**. This would allow faster cliff detection without raising false positive rates.

---

## 6. Synthesis: Design Guidance for Korri's Implementation Plan

### 6.1 Preflight probe design

**Recommendation:** Implement a lightweight UDP probe, not iperf3.

Protocol:
1. Before Moonlight launch: send 20 UDP packets to the source machine's probe port at 2 Mbps spacing (~8 KB each, 200 byte is too small — use 1200 byte to simulate real video packets).
2. Measure: round-trip time (echo response), one-way jitter, delivery count.
3. Classify into named profiles:

| Profile | RTT | Loss | Launch config |
|---------|-----|------|--------------|
| `high` | < 30 ms | < 0.5% | 1080p / 60fps / 20 Mbps startup |
| `medium` | 30–70 ms | < 1% | 720p / 60fps / 10 Mbps startup |
| `safe` | 70–120 ms | < 2% | 720p / 30fps / 5 Mbps startup |
| `rescue` | > 120 ms or loss ≥ 2% | — | 480p / 30fps / 2 Mbps startup |

4. Pass the selected profile as `boundary` arguments to the adaptive runner.

**Why not a throughput test?** A throughput test (like iperf3) floods the link and temporarily degrades RTT, which pollutes the initial health measurements that the adaptive controller depends on during the `establish` phase. The goal of preflight is to choose a safe starting point, not to measure peak capacity — the controller will discover capacity through the cold-start ramp.

**Implementation note:** The probe needs an echo listener on the source machine. For Korri's source-machine module, a minimal UDP echo service running on a fixed port, started by the same systemd unit as Sunshine, would suffice. Duration: ≤ 1 second. User-visible latency: < 2 seconds including probe + Moonlight launch.

### 6.2 Cold-start ramp calibration

Current Korri defaults (`coldStartBitrateKbps: 8_000`, `coldStartIncreaseFraction: 0.28`, `coldStartSampleCount: 3`) are reasonable but may be too aggressive for LTE/5G cellular links where the initial bandwidth estimate is unreliable.

**Recommendation:**
- Make `coldStartBitrateKbps` a function of the preflight profile, not a fixed constant:
  - `high` profile → cold start at 8 Mbps (current default)
  - `medium` profile → cold start at 4 Mbps
  - `safe` profile → cold start at 2 Mbps
  - `rescue` profile → cold start at `panicBitrateKbps` (500 kbps)
- Increase `coldStartSampleCount` to 5 for cellular links (identified by high RTT at preflight time), since cellular RTT variance is higher and 3 samples may not be enough to distinguish startup transients from sustained congestion.

This maps the GCC "start at 300 kbps → exponential probe" approach to Korri's preflight-aware context: start at a level informed by actual pre-launch measurement, then ramp aggressively.

### 6.3 Max bitrate auto

**Recommendation:** The declared `ceiling` is the aspirational max; the controller's effective ceiling during `establish` is `min(coldStartBitrateKbps, declared_ceiling)`. During `fine-tune`, when `bitrateDeliveryRatio > 0.98` and `pressure.bandwidth < 0.01` for 5 consecutive ticks at the ceiling, emit a brief probe burst (+20% over ceiling) to test whether the network can actually sustain more. This maps to GCC's "max bitrate increases trigger a probe."

For LAN (RTT < 10 ms), `max_bitrate` can safely be set to the link speed or left at 0 (Sunshine honors client request). For WAN streaming, the recommendation is ceiling = measured_upstream_speed − 2 Mbps.

### 6.4 Handoff-aware preemptive downshift

**Two-tier handoff response:**

**Tier 1 — Interface-change event (immediate):**
- Listen for OS-level network interface change events (`NETLINK RTMGRP_LINK` on Linux, or equivalent).
- On event: immediately issue `bitrate=panicBitrateKbps fps=playableFps resolution=640x360` to the active stream control session — bypassing the normal health window loop entirely.
- Enter a `handoff-stabilizing` phase for 8 seconds. During this phase, the controller holds the floor and suppresses all growth decisions.

**Tier 2 — RTT+loss signal (for environments where interface-change is not available):**
- If `rttMs.mean` doubles in a single health window (e.g., 25 ms → 50 ms) without any delivery ratio problem, treat as a "possible handoff" signal.
- Immediately shed fps by one step and reduce bitrate by 30% (gentler than a full cliff shed).
- If the RTT remains elevated after 2 more windows, escalate to full cliff shed.

**Recovery after handoff:**
- Begin AIMD ramp from the floor (not from the pre-handoff ceiling).
- Require 10 consecutive "healthy" windows before considering a resolution increase (vs. 3 in the normal fine-tune path).
- This implements the GCC post-drop re-probe discipline: confirm stability before climbing.

### 6.5 Congestion collapse avoidance

**Recommendation: raise the RTT trend weight in the pressure model**

Current `latency` pressure formula:

```ts
const latency = clamp01((rtt - 45) / 90 + rttVariance / 120 + rttTrend)
```

`rttTrend` adds 0.12 to pressure when RTT is rising. This is a coarse signal. A more responsive formula:

```ts
const rttRising = rttMs.trend === "rising"
const rttAccel = rttRising ? 0.12 + (rttMs.mean - 45) / 200 : 0
const latency = clamp01((rtt - 45) / 90 + rttVariance / 120 + rttAccel)
```

This makes RTT trend pressure proportional to how far above the base RTT the current measurement is — a small RTT rise at 50 ms produces a small adjustment; a large RTT rise at 120 ms produces a much larger adjustment, triggering a faster shed.

**Recommendation: sender-side queue depth as a first-class signal**

SQP's key finding is that sender-side queue depth (backlog in the encoder/pacer) is as important as network queue depth. Korri's `queueDepth` metric from Moonlight's stats overlay represents the receiver-side decode queue, not the sender-side pacer queue. If the source-machine module can report encoder frame queue depth (frames queued but not yet sent), this should be included in the health signal. In the absence of encoder queue depth, the delivery ratio + frame drop fraction combination is the best available proxy.

**Recommendation: maintain periodic "ALR probes" during low-activity periods**

When the stream is in a low-activity state (e.g., pause menu, static content) and bitrate falls well below the ceiling, the adaptive controller should not assume the ceiling is still achievable when content resumes. GCC's ALR probing (periodic probes every 5 seconds during application-limited periods) maintains a current bandwidth estimate. Korri equivalent: when `bitrateDeliveryRatio > 0.99` and `current.bitrateKbps < 0.3 × ceiling`, emit a brief probe attempt at `0.5 × ceiling` once per 10 seconds to verify the ceiling remains achievable.

**Anti-pattern to avoid: shedding too slowly under corroboration**

The current corroboration requirement (`delivery < 0.45` + at least one of RTT/queue/loss/decode) is correct for preventing false positives in the fine-tune path. However, once a cliff is detected and shedding begins, the shed should be **instantaneous and bypassing of deadband**. The current implementation uses `bypassDeadband = true` in `applyPlayabilityShed`, which is correct. The risk is that the control socket itself may be congested during a cliff — a second shed command should be queued even if the first has not been acknowledged, not suppressed by duplicate-detection logic.

### 6.6 On replacing the explicit emergency mode with a unified controller

The parking-lot item `explore-replacing-explicit-stream-emergency-mode-with-unified-controller` raises whether shed mode can be replaced by a continuous control law.

**Industry evidence:** GCC does not have a distinct "emergency mode" — it has one continuous pressure model where the multiplicative decrease factor scales with congestion severity. TGaming uses a threshold-based shed (below 640×360 width, step fps rather than resolution). SQP uses a unified frame-delay–based policy.

**Recommendation:** The current Korri shed path (`mode === "shed"`) is a reasonable special case, not a design flaw. The key difference from a "pure continuous" controller is that shed bypasses deadbands and ignores the `lean` bias, which is correct — during a cliff, latency bias vs. quality bias is irrelevant; playability is the only goal. The value of keeping it explicit is that the shed path is easier to reason about and test in isolation. The continuous controller design would need to produce equivalent behavior (bypass deadbands, ignore lean) at high pressure values, which is non-trivial to tune without introducing oscillation. Recommendation: keep the explicit shed path but review the threshold for entering it (`isCliff`) to ensure it responds to RTT trend fast enough, per §6.5.

---

## 7. Source Index

| Topic | Source | URL |
|-------|--------|-----|
| GeForce NOW network anatomy / preflight | Lyu et al., arXiv 2401.06366, Feb 2024 | https://arxiv.org/html/2401.06366v2 |
| WebRTC GCC bandwidth probing | webrtcHacks / Kaustav Ghosh, May 2024 | https://webrtchacks.com/probing-webrtc-bandwidth-probing-why-and-how-in-gcc/ |
| TWCC / Transport-CC overview | bloggeek.me WebRTC glossary | https://bloggeek.me/webrtcglossary/transport-cc/ |
| SQP interactive video congestion control | Google Research, 2024 | https://research.google/pubs/sqp-congestion-control-for-low-latency-interactive-video-streaming/ |
| BBR congestion control | IETF draft (Cardwell et al.) | https://www.ietf.org/archive/id/draft-cardwell-ccwg-bbr-00.html |
| L4S architecture | RFC 9330 / IETF | https://datatracker.ietf.org/doc/rfc9330/ |
| L4S in GeForce NOW | NVIDIA support (auth required) | https://nvidia.custhelp.com/app/answers/detail/a_id/5522 |
| TGaming 5G adaptive bitrate | Wan & Jamieson, Princeton, arXiv 2402.04454, Sep 2024 | https://arxiv.org/abs/2402.04454 |
| Nebula FEC + adaptive rate | arXiv 2201.07738 | https://arxiv.org/pdf/2201.07738 |
| Moonlight FAQ / bitrate guidance | Moonlight project wiki | https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions |
| Sunshine configuration reference | LizardByte docs | https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html |
| Sunshine VBV increase / single-frame VBV | LizardByte advanced usage | https://docs.lizardbyte.dev/projects/sunshine/v0.23.1/about/advanced_usage.html |
| Steam Remote Play 250 Mbps cap | LinuxCompatible / Valve changelog | https://www.linuxcompatible.org/story/valve-updates-stable-steam-client-with-250-mbit-s-remote-play-and-multi-controller-support |
| Handoff-aware ABR (Autoformer) | ScienceDirect, *Computer Networks*, 2025 | https://www.sciencedirect.com/science/article/abs/pii/S1084804525002218 |
| AIMD survey | ACM Computing Surveys 2024 | https://dl.acm.org/doi/10.1145/3742472 |
| GeForce NOW network analysis (bitrate by resolution/fps) | arXiv / UNSW + Canopus Networks, 2024 | https://arxiv.org/html/2401.06366v2 |
