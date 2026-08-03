# Handoff: can an Android device hold the "encoder" capability?

**Status:** not started. This is a time-boxed feasibility spike, not a feature.
**Owner:** unassigned — pick this up cold, everything you need is below.
**Time box:** one afternoon. Kill criteria are explicit; honour them.

---

## Why this exists

`AGENTS.md` states the federation model:

> A device is defined by the capabilities attached to it — a screen,
> controllers, **an encoder**, fast storage, an internet connection, the
> ability to run a given kind of content — and any device may have any
> subset... **No device holds a role.**

Today that is aspirational in one specific way: **every Android device in the
federation can only receive a stream, never serve one.** Only the desktop
(`aka`) can serve. So "no device holds a role" is not yet true — the phone and
tablet are permanently clients, which makes content installed on them
unreachable from any other screen.

This spike answers one question: **can an Android device serve a stream at a
latency good enough to play through?** If yes, "encoder" becomes a real
capability an Android device can advertise, and the multi-route example in
`AGENTS.md` (Wario Land 4 playing locally on the tablet *and* streaming from a
device running RetroArch) becomes reachable in both directions.

**Guard from AGENTS.md — respect it:** *"the capability model is deliberately
unbuilt. Do not invent it ahead of real cases."* This spike gathers evidence.
It does **not** touch the capability model, korrid, contracts, or the portal.

---

## Where to work

Create a worktree — **do not work in the main checkout**:

```bash
cd ~/code/sandbox/korri
git worktree add .worktrees/spike/sunshine-android-host -b spike/sunshine-android-host
cd .worktrees/spike/sunshine-android-host
```

`.worktrees/` is the established convention here (gitignored, branch-shaped
subpaths — see `git worktree list` for the existing ones).

The third-party Sunshine fork is **not** a worktree of this repo. Clone it
separately, e.g. `~/code/sandbox/sunshine-android` or `/tmp`. Only your
findings doc lands in the korri worktree.

### Do not touch `~/code/sandbox/artemis`

Another agent session works in that checkout continuously. The Korri client
APK is **already built and installed on both devices** — you need no changes
there. Treat it as read-only. (A previous session's uncommitted spike code got
swept into an unrelated commit by the parallel session; don't repeat that.)

---

## What is already proven — do not re-derive

Measured on `usu` (Fold7) this session with scrcpy, which uses the same
on-device hardware encoder path the Sunshine port uses:

| Finding | Evidence |
|---|---|
| Display capture works at native resolution, no DRM blackout | 2184×1968 H.264 captured cleanly |
| The encoder keeps up **while a game is running** | TMNT: Shredder's Revenge live; **600 frames in 12.004 s ≈ 50 fps** at native res, 20.5 Mbps |
| Encode-while-gaming contention is not a blocker on this hardware | same run — game rendering and encoding concurrently, no collapse |

**Caveat to carry forward:** Shredder's Revenge is 2D pixel art — cheap to
render and cheap to encode. A 3D title stresses GPU and encoder far harder.
Read the above as "the path is clear", never "any game will do this".

**What remains genuinely unknown — this is your job:**
1. Does the NDK cross-build actually work?
2. Does the whole chain close with *our own* client?
3. **What is the end-to-end latency?** ← the headline deliverable

---

## Target

`https://github.com/bigonionbots/Sunshine`, branch **`android-port`** — a fork
of LizardByte/Sunshine (GPL). Last active 2026-07-17. 0 stars, essentially
unknown, but the commit log shows the hard problems solved:

- capture: evolved `screencap` → framebuffer → SurfaceControl reflection →
  persistent native screencap daemon
- encode: MediaCodec hardware encode, surface input
- audio: AudioPlaybackCapture
- input: `/dev/uinput` via **Shizuku** fd-handoff (⚠️ out of scope, see below)

**No releases, no prebuilt APK.** Build shape: CMake/C++ core cross-compiled to
`libsunshine.so` via the Android NDK, plus a Gradle project in `android-app/`.
The fork has commits smoothing the FFmpeg cross-build ("make the FFmpeg
cross-build recipe self-sufficient", "disable x265 assembly on arm targets"),
so the path is trodden — but this is where the afternoon can evaporate.

---

## Scope

**In scope**
1. Build the `android-port` APK.
2. Install on **usu** (Snapdragon — better-trodden path than the MediaTek
   tablet; the fork author almost certainly developed on Snapdragon).
3. Start the host **without Shizuku** — no input injection.
4. Connect from the **tablet** using the Korri client already installed:
   launch the shell → *Artemis setup (pair / cache apps)* → PcView → add host
   by IP → pair. Zero client-side code.
5. Stream **the Android home screen** — not a game. Frames arriving is the
   whole test.
6. **Measure end-to-end latency** (method below).

**Explicitly out of scope** — do not do these even if they look easy:
- Input / Shizuku / uinput (that is a later step, gated on this one passing —
  it carries permanent friction: re-arming after every device reboot)
- Streaming an actual game
- Audio
- Any korrid, contracts, portal, or capability-model integration

---

## How to measure latency (no special equipment)

The classic two-screen photo method, and **this is the job for the Pixel 3**:

1. Run a millisecond stopwatch on **usu** (the host).
2. Stream usu → tablet, and place the two screens side by side.
3. Photograph both screens in a single frame with the **Pixel 3**.
4. The difference between the two displayed times is end-to-end latency.
5. Repeat ~5 times, report the spread, not one number.

Report the median and the worst case. A single lucky frame proves nothing.

---

## Kill criteria — honour these

- **Cross-build fights for more than half a day** → stop. Document exactly
  where it broke (which dependency, which error). A precise failure point is a
  perfectly good deliverable.
- **Latency is clearly unusable** → record the number and stop. Do not start
  optimising; the answer "not viable at this latency" is worth having cheaply.
- **Frames never arrive** → capture the failure mode and stop.

Any of these outcomes is a success for the spike. The failure mode to avoid is
quietly turning an afternoon into a week.

---

## Deliverable

`docs/research/sunshine-android-host-feasibility.md` in your worktree,
answering in this order:

1. **The latency number** (median + worst case + method). Headline.
2. Did the build work? If not, precisely where did it break?
3. Did our existing client connect and render? Any pairing friction?
4. Thermals / battery observations on usu during sustained streaming.
5. **Verdict:** is "Android device serves a stream" viable enough to pursue?
6. If viable: what would step 2 (input via Shizuku) actually cost, now that
   you have seen the code?

Follow the shape of the existing docs in `docs/research/`.

---

## Device reference

| | usu (host) | tablet (client) |
|---|---|---|
| Model | Samsung Fold7, SM-F966U1 | Tab S10 Ultra, SM-X930 |
| SoC | Snapdragon 8 Elite | Dimensity 9400 |
| OS | Android 16 | — |
| adb serial | discover with `adb devices` | discover with `adb devices` |
| Network | LAN or Tailscale; discover the current address | — |
| Display | 1968×2184 (inner) | 2960×1848 |

Korri client on both: package `com.limelight.noirdebug`, launch
`com.limelight.KorriShellActivity`.

### Environment gotchas that will waste your time

- **Play Protect blocks adb sideloads** (`INSTALL_FAILED_VERIFICATION_FAILURE`).
  Workaround: `adb shell settings put global verifier_verify_adb_installs 0`
  — **set it back to 1 when done.**
- **Wireless adb dies on device reboot** and must be re-enabled on-device.
- **Samsung DeX / desktop mode on the tablet** produces black screencaps and
  bizarre lifecycle behaviour. Verify you are not in DeX before trusting any
  observation. A reboot clears it.
- Headless scrcpy (useful for sanity checks) needs `--no-window`;
  `--no-playback` alone still initialises SDL and fails without a display.
- adb commands in the artemis checkout run under `nix develop`; the korri
  repo's tasks are Nix apps — discover with `nix run .#help`.

---

## Context worth reading first

- `AGENTS.md` — Federation section (the architectural stake this spike serves)
- Backlog item `01KYTRAQKDC4RDGJHBNKRETMA6` — the `com.korri.retroarch` fork,
  the mirror-image problem (Android devices *running* content locally)
- Backlog item `01KYTR9R4JJDMWBW88DXE3J0QD` — federated identity/authz; if
  devices start serving each other streams, that layer decides who may ask
