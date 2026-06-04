---
date: 2026-05-25
topic: sm8550-guest-owned-input-boundary
---

# SM8550 guest-owned input boundary

## Summary

Finish moving input ownership end-to-end into the SM8550 guest. The host stops running InputPlumber and stops staging a scrubbed udev DB; the guest stands up its own udev and runs InputPlumber with a stronger hide that physically moves the raw gamepad node out of `/dev/input/`. Vestigial host pieces are masked-but-installed for one release as an SSH-driven revert, then decommissioned in the next release.

---

## Problem Frame

Today on Sobo (SM8550 AYN Odin2), Korri streams to Sunshine on aka via Moonlight Embedded launched with `-input /dev/input/event11`. That filter exists to keep Moonlight from grabbing both the raw AYN gamepad (`event3`) and InputPlumber's normalized virtual XBox360 pad (`event11`) — without it, games on aka receive doubled / conflicting gamepad input. The cost of the filter is that the touchscreen (`event4`) never reaches Sunshine, so touch passthrough does not work.

Moonlight Embedded with no `-input` flag auto-discovers every `/dev/input/event*` via udev (verified in upstream source) and would pick up exactly the touchscreen plus the virtual pad if the raw gamepad were invisible at the device-node level. That hide is the substrate fix that unblocks touch.

The original hide design ran InputPlumber on the host and bound a scrubbed copy of `/run/udev` into the guest read-only so sway/libseat would not open hidden source nodes (the cold-boot autostart doc records this as Bug 6, with a wlroots GPU-reset cascade that turned both panels black). When the minimal-host trim plan partially moved input ownership into the guest, it added a redundant guest-side InputPlumber but kept host InputPlumber and the scrubbed-udev bind in place, deferring final resolution to "a separate input-device ownership plan." This document is that plan.

The guest-side InputPlumber today logs `Failed to hide device '/dev/input/event3': Read-only file system` and never writes its hide rules — its target path is `/run/udev/rules.d/`, which is read-only inside the guest because of the host-staged bind. Even when the host-side hide does fire, it uses `chmod 000` only, which a root-uid consumer with `CAP_DAC_OVERRIDE` (the most likely shape for Moonlight inside an nspawn guest) can bypass. So today's hide is partial in two compounding ways, and the `-input` filter is the only thing keeping gamepad input from doubling.

---

## Actors

- A1. **Host substrate** (rocknix-side, outside the guest namespace): owns kernel, device passthrough, container launch. Today also runs InputPlumber and `rocknix-guest-udev-stage`; will stop doing both.
- A2. **Guest (NixOS nspawn machine)**: owns the product input contract end-to-end after this change — udev daemon, InputPlumber, virtual device emission via uinput, hide rule application.
- A3. **Moonlight Embedded** (consumer in the guest): launched by Korri to stream to Sunshine on aka. Receives input via default udev auto-discovery once event3 is hidden at the substrate level.
- A4. **Sway / libseat / WirePlumber / future guest input consumers** (Steam, gamescope, native games): also benefit from event3 being absent from `/dev/input/`, because each does its own auto-discovery and would otherwise re-create the per-consumer filter problem.
- A5. **Operator over SSH**: exercises the masked-rollback path during the safety-net release if a regression appears.

---

## Key Flows

- F1. **Cold-boot input bring-up (target state)**
  - **Trigger:** Sobo cold boot reaches `rocknix-guest.service`.
  - **Actors:** A1, A2.
  - **Steps:**
    1. Host launches nspawn guest with `/dev/input` (RW), `/dev/uinput` (RW), `/dev/inputplumber` (RW, on the same filesystem as `/dev/input` so cross-mount renames cannot fail), and `/dev/hidraw*` (if needed by AYN MCU maps — see Dependencies).
    2. Host does **not** stage a scrubbed `/run/udev` and does **not** bind it into the guest. The guest gets its own writable `/run/udev` (tmpfs).
    3. Guest `systemd-udevd` starts and seeds its device database by replaying add events for every kernel-known device.
    4. Guest InputPlumber starts after udev, writes its hide rule for the raw AYN gamepad, and the guest's udev applies it — physically moving `event3` out of `/dev/input/`.
    5. Guest InputPlumber emits the virtual XBox360 pad (and any keyboard/mouse virtuals it ships) via `/dev/uinput`.
    6. Sway / libseat starts only after the hide rule has applied — never sees the raw event3 in `/dev/input/`.
  - **Outcome:** `/dev/input/` contains the touchscreen and the virtual pad (plus other non-claimed nodes); the raw gamepad is no longer present in `/dev/input/`. WirePlumber discovers the sound card. Sway boots cleanly with no Bug-6 cascade.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R8, R10.

- F2. **Moonlight stream launch (target state)**
  - **Trigger:** Korri spawns Moonlight Embedded for an aka stream.
  - **Actors:** A2, A3.
  - **Steps:**
    1. Moonlight is launched with no `-input` flag.
    2. Moonlight's default udev auto-discovery enumerates `/dev/input/event*` and opens every evdev node.
    3. Touch events from `event4` reach Sunshine as client-side mouse deltas + tap-to-click. Gamepad events from `event11` reach Sunshine as XInput. No raw `event3` is present to open, so no input doubling.
  - **Outcome:** Touch and gamepad both work; no per-consumer filter is needed.
  - **Covered by:** R7, R9.

- F3. **SSH-driven rollback during the safety-net release**
  - **Trigger:** Operator observes a regression on Sobo that points at the new guest-side input ownership.
  - **Actors:** A5.
  - **Steps:**
    1. Operator SSHes to Sobo and runs the documented one-shot revert command sequence.
    2. The host's masked InputPlumber service and `rocknix-guest-udev-stage` service are unmasked and enabled.
    3. The substrate flag that gates the new bind topology is flipped back; rocknix-guest.service is restarted (or the device is rebooted).
    4. The guest returns to the prior "host hides, scrubbed udev staged into guest" configuration with the redundant guest InputPlumber still enabled (matching today's known-stuck-but-bootable state).
  - **Outcome:** Sobo boots back to the pre-change input behavior — Moonlight needs `-input event11`, touch is broken, but the device is usable and gamepad works.
  - **Covered by:** R11, R12, R13.

---

## Requirements

**Input ownership and hide mechanism**
- R1. The SM8550 NixOS guest is the sole owner of input device classification, hiding, and virtual-device emission. The host does not run InputPlumber.
- R2. The hide mechanism is strong enough that a process running as uid 0 with `CAP_DAC_OVERRIDE` inside the guest cannot open the raw AYN gamepad source node — the node is not present in `/dev/input/` after the hide has applied, not merely mode 000.
- R3. The guest emits the same set of virtual devices today's host InputPlumber emits (at minimum: virtual XBox360 pad). If today's deployment relies on additional virtuals (keyboard, mouse), those are preserved.

**Substrate boundary changes**
- R4. The guest runs `systemd-udevd`. Initial device database population at guest startup is reliable enough for libseat, WirePlumber, and InputPlumber to find their devices without races.
- R5. The host substrate does not stage a scrubbed `/run/udev` and does not bind anything into the guest's `/run/udev`. The guest owns `/run/udev` as a writable tmpfs.
- R6. The host substrate exposes `/dev/inputplumber` into the guest on the same filesystem as `/dev/input` so the guest's hide-by-move cannot fail with `EXDEV`.

**Consumer contract**
- R7. Korri's Moonlight Embedded launcher stops passing `-input` to Moonlight. Moonlight's default udev auto-discovery is the contract.
- R8. Sway/libseat in the guest boots without the Bug-6 GPU-reset cascade (no by-hidden-tag with a missing canonicalization target) on cold boot.

**Operational gates**
- R9. Tapping the Sobo touchscreen during an active stream moves the host cursor on aka and triggers clicks. Gamepad continues to work with no doubled input.
- R10. WirePlumber discovers the sound card on cold boot — no dummy-sink regression. (Today's `rocknix-guest-udev-stage` has an explicit sound-record-ready wait; the new path must preserve equivalent behavior.)

**Migration shape — clean break in behavior, one-release safety net**
- R11. In the same change that implements R1–R10, the host's InputPlumber service is masked, `rocknix-guest-udev-stage` is dropped from `rocknix-guest.service`'s ExecStartPre chain, and the `--bind-ro=/run/.guest-udev:/run/udev` bind is removed from `rocknix-guest-start`. No host-side InputPlumber tagging or udev scrubbing happens at runtime.
- R12. The host's InputPlumber package and `rocknix-guest-udev-stage` script + service remain installed on disk for one release. A documented SSH-driven revert command sequence restores the prior behavior without re-flashing.
- R13. The release immediately following a clean Sobo soak of R1–R12 deletes the host InputPlumber package activation, the `rocknix-guest-udev-stage` script, its service unit, and the corresponding must-stay assertions from the static checks. The trim plan's invariant R8 is then retired.

---

## Acceptance Examples

- AE1. **Covers R2, R7.** Given the guest has cold-booted to the target state, when Moonlight Embedded is launched with no `-input` flag and the operator inspects `/proc/<moonlight-pid>/fd/*` symlinks, then `event4` and `event11` are open and `event3` is not present in `/dev/input/` at all.
- AE2. **Covers R2.** Given the guest has cold-booted to the target state, when a root-uid process inside the guest runs `cat /dev/input/event3`, then the open fails with `ENOENT` (the node is absent) — not `EACCES` (mode-blocked but present).
- AE3. **Covers R8, R10.** Given Sobo cold-boots, when `journalctl -b` is inspected for the guest, then sway reaches its kiosk session without any `libseat ... canonicalize` errors, both panels render, and WirePlumber reports a real sound card (no dummy sink).
- AE4. **Covers R9.** Given a Moonlight stream is active to aka, when the operator taps the Sobo touchscreen, then the host cursor on aka moves to the corresponding position and tap-to-click registers; simultaneously, gamepad input from the AYN controls continues to reach the streamed game with no observable doubling.
- AE5. **Covers R11, R12.** Given the safety-net release is deployed, when the operator runs the documented revert sequence over SSH and reboots, then the guest comes up with the pre-change input topology (Moonlight needs `-input event11`, touch broken, gamepad works through the virtual pad).
- AE6. **Covers R13.** Given a clean Sobo soak has completed on the safety-net release, when the decommission release is built, then neither the host InputPlumber package activation nor `rocknix-guest-udev-stage` exists in the image, and the trim-plan must-stay assertion for them is removed from the static checks.

---

## Success Criteria

- Operator success: a single touch on Sobo controls the cursor on aka during a Korri stream; the gamepad continues to work; no per-client filter has to be re-tuned when a new input consumer ships inside the guest.
- Engineer success: the input-ownership question deferred by the trim plan is closed. There is exactly one InputPlumber in the running system and exactly one udev daemon doing hide-rule work, both inside the guest. The host substrate's responsibility for input devices is reduced to passthrough.
- Handoff quality: `se-plan` can sequence the substrate, guest module, and host service changes without re-deriving why host InputPlumber existed, why the scrubbed-udev bind existed, why `MoveSourceDevice` is required over `ChangePermissions`, or what the rollback shape is.
- Safety-net discipline: the rollback path is exercised at least once on Sobo before the decommission release is cut. Discovery of a regression during the safety-net window does not require re-flashing.

---

## Scope Boundaries

- Per-display touch routing on Thor (different brainstorm: `docs/brainstorms/2026-05-08-001-rocknix-thor-multi-touchscreen-routing.md`). Identifier-collision on sway 1.11 is an unrelated upstream limitation; this work does not address it.
- Korri compositor SEGV around stream launch/teardown. Out of scope per handoff; tracked separately.
- Korri `korri-inputd` compositor-aware focus and input-grab redesign. Out of scope per handoff; the defensive lifecycle fix from the prior session ships independently.
- Aka-side Sunshine configuration of any kind, including `native_pen_touch`. Off the table per user constraint.
- Retaining the Moonlight `-input` flag as a long-term per-consumer fallback. Explicitly rejected — this would re-create the same smell for every future input consumer in the guest (Steam, gamescope, native SDL games).
- Replacing AYN MCU maps or changing InputPlumber profile selection.
- Any change to the Korri lifecycle fix landed in the prior session.

---

## Key Decisions

- **Guest owns input end-to-end, not host.** Aligns with the minimal-host trim plan's deferred direction. Accepts the cost of standing up `systemd-udevd` inside an `isContainer = true` NixOS guest, in exchange for closing the half-finished migration and consolidating input ownership in one daemon in one namespace.
- **Hide via `MoveSourceDevice`, not `ChangePermissions`.** A root-uid Moonlight in nspawn with `CAP_DAC_OVERRIDE` defeats `chmod 000`. Physical absence from `/dev/input/` is the only protection that survives that capability profile.
- **One-release safety net, not "delete everything now".** The substrate touches infrastructure that took 13 distinct bug fixes to stabilize (per the cold-boot autostart doc). A masked-but-installed crumb trail lets a regression be reverted by SSH instead of re-flash, and an explicit decommission release prevents the safety net from calcifying.
- **SSH-driven rollback, not a kernel cmdline flag.** A boot flag adds substrate complexity disproportionate to a one-release safety net. The existing `rocknix.no-nspawn` flag still works as a deeper escape hatch for catastrophic failure modes.
- **No retention of `-input` as a fallback in Moonlight launcher.** A consumer-side filter is per-consumer carrying cost; this brainstorm exists specifically to retire that pattern.

---

## Dependencies / Assumptions

- The shipped guest InputPlumber package (`rocknix-inputplumber`, currently v0.75.2) supports `HIDE_DEVICES_FROM_ROOT=1` and emits `MoveSourceDevice` rules when that env var is set. Verified against upstream source.
- The guest can run `systemd-udevd` despite `boot.isContainer = true`. The combination is untested in this substrate today; planning must verify on fuji-built closures before Sobo soak.
- Hidraw passthrough need is unknown. If SM8550 InputPlumber maps require `/dev/hidraw*` to fully drive the AYN MCU (battery, RGB, vibration, button matrix), the substrate must add `--bind=/dev/hidraw*` to `rocknix-guest-start`. If only evdev is needed, no change. **This is a verification point for planning, not a design decision.**
- Initial udev DB population in the guest can be triggered by a synthetic add-event replay at guest startup. If the replay turns out to race with consumers, a different seeding strategy may be needed in planning.
- The shared host/guest network namespace means kernel uevent multicast is received by both host and guest udev daemons during the safety-net release. Host udev no longer runs InputPlumber rules in that window, so concrete conflicts should be minimal, but planning must check for any other host udev rules that would race with guest udev rules over `/dev/input/`.
- Build path is fuji → closure copy → `nsenter ... switch-to-configuration switch` on Sobo. No builds on Sobo per user constraint. Each iteration costs minutes, not seconds, which justifies the safety-net shape above.

---

## Outstanding Questions

### Resolve Before Planning

(None — every scope-shaping question was resolved in the brainstorm dialogue.)

### Deferred to Planning

- [Affects R4][Technical] Exact NixOS-level mechanism to force-enable `systemd-udevd` while preserving useful parts of `boot.isContainer = true`. Candidate is `systemd.services.systemd-udevd.enable = lib.mkForce true` plus any related `services.udev` knobs; planning must verify the combination boots cleanly under nspawn.
- [Affects R4][Technical] Synthetic device-add seeding mechanism (`udevadm trigger --action=add` ordering vs. consumers). Planning must pick a sequencing that satisfies libseat, WirePlumber, and InputPlumber.
- [Affects R6][Technical] Where `/dev/inputplumber` actually lives on the host so its filesystem matches `/dev/input`'s. Most likely an empty directory created at substrate start under host `/dev`; planning must confirm devtmpfs allows mkdir in the right place and that nspawn's bind preserves the inode/filesystem identity.
- [Affects R3, Dependencies][Needs research] Whether SM8550 InputPlumber maps need `/dev/hidraw*` access. Inspect `packages/inputplumber/maps/` and the matched composite_device config on Sobo to confirm before declaring substrate complete.
- [Affects R10][Needs research] How to preserve the equivalent of `rocknix-guest-udev-stage`'s sound-record-ready wait without the staging script. Likely a synthetic-trigger + WirePlumber-after-udev ordering, but the existing solutions doc on dummy-sink regressions is the reference to satisfy.
- [Affects R11, R12, F3][Technical] Exact masking shape — `systemctl mask` on host units plus a substrate flag that gates the nspawn binds in `rocknix-guest-start`, vs. a NixOS-level option toggle that takes effect at activation. Planning chooses the shape with the cleanest one-command revert.
- [Affects R13][Technical] Where the must-stay assertions for host InputPlumber and `rocknix-guest-udev-stage` live in the static checks and what their removal looks like in the decommission release.
