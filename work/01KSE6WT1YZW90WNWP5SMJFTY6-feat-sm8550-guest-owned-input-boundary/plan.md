---
title: SM8550 guest-owned input boundary
type: feat
status: active
date: 2026-05-25
origin: ./requirements.md
verify_command: "nix flake check"
---

# SM8550 guest-owned input boundary

## Summary

Land the substrate cutover that gives the SM8550 nspawn guest its own `systemd-udevd`, exposes a guest-visible `/dev/inputplumber` via a tmpfiles symlink into a hidden subdirectory of the existing `/dev/input` bind (single mount, no EXDEV at `mv` time), drops the read-only staged-udev bind, masks the host's InputPlumber service, and bumps the consumer Korri commit that removes Moonlight's `-input` flag — all in one atomic PR with pre-staged SSH revert artifacts under writable `/storage`. A separate follow-up PR after Sobo soak deletes the now-vestigial host pieces.

---

## Problem Frame

Moonlight Embedded on Sobo is launched with `-input /dev/input/event11`, which restricts evdev auto-discovery to the virtual gamepad and starves the touchscreen (`event4`) of any chance to reach Sunshine. Today's hide of the raw AYN gamepad (`event3`) is incomplete: the host runs InputPlumber with `HIDE_DEVICES_FROM_ROOT=1` (so `MoveSourceDevice` *should* work), the guest also runs InputPlumber and fails its hide with `EROFS` because `/run/udev/rules.d/` is read-only inside the guest, and the guest has no `systemd-udevd` to apply rules even if writable. The brainstorm chose Option B (finish moving input ownership into the guest) with the B1' migration shape: clean break in behavior with a one-release SSH-driven revert path, then decommission. See origin: `./requirements.md`.

---

## Requirements

- R1. The SM8550 guest is the sole input owner; host InputPlumber does not run.
- R2. Hide mechanism is strong enough that a root-uid process with `CAP_DAC_OVERRIDE` cannot open `/dev/input/event3` — the node is absent, not just mode-locked.
- R3. The guest emits the same virtual devices today's host InputPlumber emits (at minimum: virtual XBox360 pad).
- R4. The guest runs `systemd-udevd` with a reliable initial device-DB population.
- R5. The host substrate does not stage or bind `/run/udev` into the guest; guest owns `/run/udev` as a writable tmpfs.
- R6. The guest-visible `/dev/inputplumber` path resolves to a location inside the existing `/dev/input` bind mount (via a tmpfiles symlink to a hidden subdirectory) so hide-by-move cannot fail with `EXDEV`. A separate `--bind=/dev/inputplumber` is NOT used: separate nspawn binds, even from the same devtmpfs superblock, present as distinct mount points and `rename(2)` across mount points returns `EXDEV`.
- R7. The Korri Moonlight launcher stops passing `-input` to Moonlight.
- R8. Sway/libseat boots without the Bug-6 GPU-reset cascade on cold boot.
- R9. Tapping the Sobo touchscreen during an active stream moves the host cursor on aka; gamepad still works with no doubled input.
- R10. WirePlumber discovers the sound card on cold boot — no dummy-sink regression.
- R11. Same-PR cutover: host masking + udev-stage skip + read-only bind removal land together.
- R12. Vestigial host pieces (`inputplumber` package + `rocknix-guest-udev-stage` script) remain on disk for one release with an SSH-driven revert.
- R13. Follow-up PR (after clean Sobo soak) deletes the vestigial pieces and the must-stay static-check assertions.

**Origin actors:** A1 (host substrate), A2 (NixOS nspawn guest), A3 (Moonlight Embedded), A4 (sway / libseat / WirePlumber / future input consumers), A5 (operator over SSH).
**Origin flows:** F1 (cold-boot input bring-up), F2 (Moonlight stream launch), F3 (SSH-driven rollback).
**Origin acceptance examples:** AE1 (covers R2, R7), AE2 (covers R2), AE3 (covers R8, R10), AE4 (covers R9), AE5 (covers R11, R12), AE6 (covers R13).

---

## Scope Boundaries

- All exclusions from origin's Scope Boundaries (Thor multi-touchscreen routing; Korri compositor SEGV; korri-inputd input-grab redesign; Sunshine-side config; retention of `-input` as long-term fallback; AYN MCU map changes; Korri lifecycle fix).
- Patching upstream InputPlumber to make its `/dev/inputplumber/sources/` path configurable. Local bind is cheaper and reversible.
- Splitting Korri-side and rocknix-side commits into PRs that can land in either order. The rocknix-side substrate change presupposes the launcher no longer passes `-input`, so cross-repo coordination is required.
- Auto-running the SSH revert path on detected boot failure. Manual SSH per origin F3 is the contract.
- Rewriting the trim plan's full R8 — this plan adds a closure note, not a rewrite.

### Deferred to Follow-Up Work

- U9 — decommission of host InputPlumber package activation, `rocknix-guest-udev-stage` script + ExecStartPre wiring, and the must-stay static-check assertions: separate follow-up PR after ≥ N days of clean Sobo soak with at least one rehearsed revert-path exercise (see Operational / Rollout Notes for the soak gate).

---

## Context & Research

### Relevant Code and Patterns

- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-start` — `emit_arg`/`emit_device_allow` pattern for adding nspawn binds and cgroup device-allow entries. Lines 192 and 197 currently emit `--bind=/dev/input` and `--bind-ro=/run/.guest-udev:/run/udev` respectively.
- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/system.d/rocknix-guest.service` — current ExecStartPre chain includes `/usr/bin/rocknix-guest-udev-stage`. Existing comment block already flags the staged-udev approach as transitional.
- `work/rocknix/projects/ROCKNIX/packages/tools/inputplumber/sources/usr/lib/systemd/system/inputplumber.service` — host service file (LibreELEC-style, not NixOS); already has `Environment=HIDE_DEVICES_FROM_ROOT=1` so the host's `MoveSourceDevice` is wired in principle.
- `work/rocknix/projects/ROCKNIX/devices/SM8550/options:72` — `ADDITIONAL_PACKAGES="gamepadcalibration screen-switch rocknix-abl inputplumber"`. The `inputplumber` entry is the host activation that U9 will remove.
- `work/rocknix/projects/ROCKNIX/devices/SM8550/filesystem/usr/share/inputplumber/devices/02-ayn-controller.yaml` — AYN composite_device map uses `evdev:` source matching, not `hidraw:`. Confirms no `/dev/hidraw*` bind is needed (resolves origin's verification question).
- `guest/modules/input.nix` — current guest-side InputPlumber wiring; uses the existing `boot.isContainer = true` override pattern (e.g., `before = [ "main-space-sway-kiosk.service" "korri-kiosk.service" ]`). Extension point for ordering after udev.
- `guest/modules/base.nix:4` — `boot.isContainer = true`. Existing override pattern (`nix.settings.sandbox = false` etc.) is the template for force-enabling `systemd-udevd`.
- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh` — `grep -q ... || fail` assertion pattern. Existing udev-stage assertions are at lines 90, 104, 214, 866–869, 895.
- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-runtime-smoke.sh` — runtime smoke pattern for on-host post-deploy checks.

### Institutional Learnings

- `docs/solutions/best-practices/rocknix-layer14-main-space-cold-boot-autostart-2026-05-08.md` — Bug 6 narrative (raw `/run/udev` bind → libseat canonicalize ENOENT → wlroots GPU-reset cascade → black panels). The fix this plan removes is exactly the staged-udev bind; preventing regression requires guest-side udev + InputPlumber hide ordered before sway.
- `docs/solutions/runtime-errors/guest-pipewire-dummy-sink-missing-udev-sound-records-rocknix-2026-05-13.md` — WirePlumber dummy-sink class of regression. Current mitigation lives in `rocknix-guest-udev-stage`'s `sound_udev_record_ready` wait. Replacement strategy: lean on `systemd-udev-trigger.service` + `systemd-udev-settle.service` ordering so WirePlumber starts after udev has populated sound records.
- `docs/plans/2026-05-12-002-refactor-sm8550-minimal-host-trim-plan.md` (R8) — explicitly deferred this input-boundary decision; this plan closes it.

### External References

- ShadowBlip/InputPlumber `src/udev/mod.rs` (v0.75.2) — `hide_device` writes `RULES_PREFIX = "/run/udev/rules.d"`; `MoveSourceDevice` flag emits `RUN+="mv /dev/input/%k /dev/inputplumber/sources/%k"`. `unhide_all` reads `/dev/inputplumber/sources/`. Hardcoded paths drive R6.
- NixOS `boot.isContainer = true` semantics — suppresses `systemd-udevd` by default; force-enable via `systemd.services.systemd-udevd.enable = lib.mkForce true` is the standard override.

---

## Key Technical Decisions

- **`/dev/inputplumber` as a guest-side symlink into a hidden subdirectory of the existing `/dev/input` bind**: InputPlumber's `MoveSourceDevice` rule hardcodes `/dev/inputplumber/sources/%k` as the move destination. Earlier draft proposed `--bind=/dev/inputplumber` as a sibling bind to `/dev/input`, but two independent reviewers caught that `rename(2)` returns `EXDEV` across separate nspawn mount points even when both originate from the same devtmpfs superblock. The fix: host pre-creates `/dev/input/.inputplumber/sources/` (hidden subdirectory inside the existing `/dev/input` bind); guest defines a `systemd.tmpfiles.rules` symlink `L /dev/inputplumber - - - - /dev/input/.inputplumber` so InputPlumber's hardcoded path resolves through the symlink into the same mount as `/dev/input/event3`. Single mount, no EXDEV. Rejected alternatives: patching upstream InputPlumber to make the sources path configurable; binding `/dev/inputplumber` separately.
- **Force-enable the full NixOS udev module while keeping `boot.isContainer = true`**: `services.udev.enable = lib.mkForce true` is the correct override (not just `systemd.services.systemd-udevd.enable = lib.mkForce true` — that enables the unit but leaves `/etc/udev/rules.d` ungenerated and the trigger units suppressed). The combination of `services.udev.enable`, `systemd.services.systemd-udevd.enable`, `systemd.services.systemd-udev-trigger.enable`, and `systemd.services.systemd-udev-settle.enable` — all forced — gives the guest its NixOS udev stack. Extends the existing override pattern in the guest (already used for `nix.settings.sandbox`, `systemd.services."getty@tty1".enable`). Avoids dropping container mode entirely, which would re-open many of the 13 cold-boot bugs.
- **Synthetic device seeding via `systemd-udev-trigger.service`**: NixOS ships this service in the standard udev module; force-enabling it gives the guest its initial device-DB without bespoke scripting. Ordering through `systemd-udev-settle.service` gives a clean gate WirePlumber and InputPlumber can wait on. WirePlumber's unit in `guest/modules/audio.nix` is explicitly ordered `After=systemd-udev-settle.service` as part of U2 (not just the new udev module).
- **Host masking via package post_install, not a separate flag**: `systemctl mask inputplumber.service` at install time leaves the unit file on disk for the revert path (`unmask + start`). Cheaper than introducing a substrate-level boolean flag, and the revert is one command sequence over SSH.
- **`rocknix-guest-udev-stage` skipped, not deleted, during the safety-net release**: drop the `ExecStartPre` from `rocknix-guest.service` and leave the script file alone. Revert path is to restore the ExecStartPre line; the script remains executable as-is.
- **SSH revert pre-staged in writable `/storage`, not editing squashfs at recovery time**: ROCKNIX ships `/usr/bin/rocknix-guest-start` and `/usr/lib/systemd/system/rocknix-guest.service` from a read-only squashfs. The originally-drafted revert ("restore the ExecStartPre line", "restore the bind") is impossible to execute on-device because squashfs is RO. U4 pre-stages a drop-in at `/storage/.config/system.d/rocknix-guest.service.d/00-restore-udev-stage.conf.disabled` (additive `ExecStartPre`) and a patched start-script at `/storage/.cache/rocknix-guest-start-with-stage-bind` (full alternate script that re-emits `--bind-ro=/run/.guest-udev:/run/udev`). Revert is `mv` the drop-in to remove the `.disabled` suffix, set an ExecStart override that points at the cached script, `systemctl unmask inputplumber.service`, reboot. This matches the host-iteration pattern already documented in the cold-boot autostart doc.
- **New `guest/modules/udev.nix`, not overload `base.nix`**: keeps the input substrate concern localized and reviewable independently from base.nix's existing `boot.isContainer` overrides.
- **Same-PR cutover for U1–U7**: dropping the udev-stage bind without standing up guest udev re-opens Bug 6 mid-flight, so substrate prep, guest module changes, and the cutover must merge atomically. U5 (Korri) is bumped via `PKG_NIX_GUEST_REV` in the same PR — coordinating a paired Korri commit that lands first.
- **Soak gate is operational, not calendar**: "≥ N days of clean Sobo soak with at least one rehearsed revert-path exercise" before U9 ships, where N is set by user comfort with the soak signal. Captured in Operational / Rollout Notes.

---

## Open Questions

### Resolved During Planning

- **Hidraw passthrough need (origin's `[Affects R3, Dependencies][Needs research]`)**: Not needed. The AYN composite_device map at `work/rocknix/projects/ROCKNIX/devices/SM8550/filesystem/usr/share/inputplumber/devices/02-ayn-controller.yaml` uses `evdev:` source matching only. No `--bind=/dev/hidraw*` is required.
- **Sources directory location (origin's `[Affects R6][Technical]`)**: Host pre-creates `/dev/input/.inputplumber/sources/` inside the existing `/dev/input` bind. The guest's `/dev/inputplumber` is a tmpfiles symlink to `/dev/input/.inputplumber`, so InputPlumber's hardcoded sources path resolves through the symlink into the *same* nspawn mount as the source. Initial draft proposed a separate `--bind=/dev/inputplumber` but two independent reviewers caught that distinct nspawn mount points return `EXDEV` on `rename(2)` even when both originate from the same underlying devtmpfs superblock. The symlink-into-existing-bind approach is the EXDEV-safe fix.
- **WirePlumber sound-record-ready preservation (origin's `[Affects R10][Needs research]`)**: Use `systemd-udev-settle.service` ordering rather than recreating the script's sound-card-ready wait. WirePlumber's service in the guest is ordered after udev-settle.
- **Masking shape (origin's `[Affects R11, R12, F3][Technical]`)**: `systemctl mask` in rocknix-guest-substrate's post_install; `ExecStartPre` line removed from `rocknix-guest.service`. Both reversible via SSH.
- **Static-check decommission (origin's `[Affects R13][Technical]`)**: Lines 90, 104, 214, 866–869, 895 of `guest-substrate-static-checks.sh` are the must-stay assertions to remove in U9.

### Deferred to Implementation

- **Exact NixOS option spelling for force-enabling udevd in container mode** (Affects U2): The override set is `services.udev.enable = lib.mkForce true;` *plus* `systemd.services.systemd-udevd.enable = lib.mkForce true;` *plus* `systemd.services.systemd-udev-trigger.enable = lib.mkForce true;` *plus* `systemd.services.systemd-udev-settle.enable = lib.mkForce true;`. The `services.udev.enable` line is the one the feasibility reviewer flagged as load-bearing: without it, the NixOS module suppresses `/etc/udev/rules.d` generation and several internal wiring edges. The implementer verifies by building on fuji and confirming `/etc/udev/rules.d/` is non-empty and the trigger/settle services exist in the resulting unit graph before deploying to Sobo.
- **Whether `services.udev.packages` is the right wiring** (Affects U3): NixOS standard is `services.udev.packages = [ rocknixInputplumber ];` to install the package's `lib/udev/rules.d/` into `/etc/udev/rules.d/`. Verify InputPlumber's static udev rules (separate from the runtime-generated hide rules) ship through this channel.
- **rocknix post_install mask idiom** (Affects U4): LibreELEC-style packages use `package.mk` `post_install` shell hooks. The exact form for masking a unit file on a non-NixOS image is one of: (a) `ln -sf /dev/null /etc/systemd/system/inputplumber.service` written by post_install, (b) `systemctl --root="${INSTALL}" mask inputplumber.service` at image build time, or (c) shipping a drop-in that sets `[Install] WantedBy=` to nothing. Implementer picks the form rocknix conventions favor.
- **Whether `rocknix-guest.service` needs a complete replacement or a drop-in to remove the ExecStartPre** (Affects U4): LibreELEC images bake the unit file from the substrate package; a clean approach is to edit the source unit file. If runtime override is preferred, drop-ins under `/etc/systemd/system/rocknix-guest.service.d/` work.
- **The N-day soak threshold** (Affects U9): set during U8 by the operator's comfort with the cold-boot soak signal; not a planning-time decision.

---

## Implementation Units

### U1. Substrate: pre-create `/dev/input/.inputplumber/sources/` inside the existing `/dev/input` bind

**Goal:** Make a destination for InputPlumber's hide-by-move that lives on the *same nspawn mount* as `/dev/input` itself. Must land before any cutover that activates guest-side hiding.

**Requirements:** R6.

**Dependencies:** None.

**Files:**
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-start`
- Test: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh` (extended in U6)

**Approach:**
- Add `mkdir -p /dev/input/.inputplumber/sources` early in `rocknix-guest-start`, alongside the existing `ensure_tun_device` block. Failure is fatal (mkdir must succeed or guest start aborts).
- Do **not** add a separate `--bind=/dev/inputplumber`. Two independent reviewers confirmed `rename(2)` returns `EXDEV` across distinct nspawn mount points even when both originate from the same devtmpfs superblock. The destination lives *inside* the existing `--bind=/dev/input` directory so the kernel sees source and destination on the same mount.
- The guest reaches the destination via a tmpfiles symlink declared in U3 (`L /dev/inputplumber - - - - /dev/input/.inputplumber`). InputPlumber's hardcoded `/dev/inputplumber/sources/%k` resolves through the symlink into the bound directory.
- devtmpfs allows regular subdirectories; the leading `.` keeps the directory invisible to guest consumers that enumerate `/dev/input/event*`.

**Patterns to follow:**
- `ensure_tun_device` for the create-or-fail pattern (script idiom: `mkdir + fatal-on-failure`).
- The existing `emit_arg "--bind=/dev/input"` block stays unchanged — no new bind added.

**Test scenarios:**
- Happy path: after this unit's change is applied, the static-check suite (extended in U6) asserts `rocknix-guest-start` contains `mkdir -p /dev/input/.inputplumber/sources`.
- Happy path: substrate runtime smoke (extended in U6 and observed in U8) confirms `/dev/input/.inputplumber/sources/` exists and is writable inside the guest after cold boot.
- Edge case: `/dev/input/.inputplumber/sources/` already exists from a prior guest-start invocation — `mkdir -p` is idempotent, no failure.
- Edge case (proves R6): inside the running guest, `mv /dev/input/event0 /dev/input/.inputplumber/sources/event0` succeeds on a test node and a follow-up `mv` back restores it — confirming no EXDEV. This proves the architectural fix before U3/U4 cut over.

**Verification:**
- Static check assertion in U6 passes.
- Runtime: the edge-case `mv` round-trip on a test event node succeeds.

---

### U2. Guest: stand up the full NixOS udev module under container mode; order WirePlumber after settle

**Goal:** Give the guest a real, fully-wired NixOS udev stack with reliable initial device-DB population, and order WirePlumber explicitly after udev-settle (preventing the dummy-sink regression class).

**Requirements:** R4, R8 (in part — ordering is what prevents Bug 6), R10.

**Dependencies:** None (independent Nix module change).

**Files:**
- Create: `guest/modules/udev.nix`
- Modify: `guest/profiles/main-space.nix` and `guest/profiles/dev-env.nix` to import the new module
- Modify: `guest/modules/audio.nix` (add `After=systemd-udev-settle.service` to the WirePlumber service)

**Approach:**
- New module sets the full override set: `services.udev.enable = lib.mkForce true`, `systemd.services.systemd-udevd.enable = lib.mkForce true`, `systemd.services.systemd-udev-trigger.enable = lib.mkForce true`, `systemd.services.systemd-udev-settle.enable = lib.mkForce true`. The `services.udev.enable` line is load-bearing: without it, NixOS's container-config sets it to `false` and the module suppresses `/etc/udev/rules.d` generation plus internal wiring edges (feasibility reviewer P1 finding).
- The trigger service runs `udevadm trigger --action=add` at startup to seed the DB from the kernel's view of existing devices.
- Settle gates downstream consumers on first-pass rule application.
- WirePlumber's unit in `guest/modules/audio.nix` gets an explicit `after = [ "systemd-udev-settle.service" ]`. This replaces the `rocknix-guest-udev-stage`'s `sound_udev_record_ready` wait, which is being retired in U4.
- Module-header comment block explains why container mode otherwise suppresses these services (link to `docs/solutions/best-practices/rocknix-layer14-main-space-cold-boot-autostart-2026-05-08.md` and `docs/solutions/runtime-errors/guest-pipewire-dummy-sink-missing-udev-sound-records-rocknix-2026-05-13.md`).

**Execution note:** Build on fuji and inspect the resulting unit graph before deploying to Sobo. Confirm `/etc/udev/rules.d/` is non-empty in the resulting toplevel store path and that all four target services are present and enabled.

**Patterns to follow:**
- `guest/modules/base.nix` — existing `boot.isContainer = true` overrides (`nix.settings.sandbox = false`, the disabled getty services).
- Other guest module shape: top-of-file comment block explaining the substrate decision, then the Nix config.

**Test scenarios:**
- Happy path: `nix flake check` passes after the module is imported.
- Happy path (build-time): `/etc/udev/rules.d/` in the built toplevel is non-empty; a `find` over the closure for `99-systemd.rules` (or any standard udev rule) succeeds.
- Integration (covers AE3, partially): after Sobo cold boot, `nsenter ... systemctl is-active systemd-udevd.service systemd-udev-trigger.service systemd-udev-settle.service` returns active for all three.
- Integration: after Sobo cold boot, specific per-device assertions — `nsenter ... udevadm info /dev/input/event0`, `/dev/input/event4`, `/dev/snd/controlC0` each return non-empty records with `E:SUBSYSTEM=` lines present.
- Integration (covers AE3, sound side): WirePlumber in the guest reports a real sound card (not a dummy sink) after cold boot.

**Verification:**
- `nix flake check` passes.
- After deploy, all four udev-stack services are active in the guest, and per-device `udevadm info` returns real records (not the "non-trivial count" surrogate originally drafted).

---

### U3. Guest: configure InputPlumber as sole input owner; order it after udev

**Goal:** Ensure guest InputPlumber is the only InputPlumber doing hides, that it has `HIDE_DEVICES_FROM_ROOT=1` enabled, and that its static udev rules ship into the right path inside the guest. Ordering edges chain udev → udev-trigger → udev-settle → InputPlumber → sway-kiosk.

**Requirements:** R1, R2, R3, R8 (ordering).

**Dependencies:** U2 (udevd must exist before this unit is meaningful).

**Files:**
- Modify: `guest/modules/input.nix`

**Approach:**
- Add `services.udev.packages = [ rocknixInputplumber ]` (or equivalent NixOS knob) so InputPlumber's bundled static udev rules ship through the standard channel.
- Set `systemd.services.inputplumber.environment.HIDE_DEVICES_FROM_ROOT = "1"` (the existing host service does this; guest's NixOS module must too).
- Extend the service's `after = [ ... ]` with `systemd-udev-settle.service` so InputPlumber doesn't race the device-DB population.
- Keep the existing `before = [ "main-space-sway-kiosk.service" "korri-kiosk.service" ]` so sway/libseat reads `/dev/input/` after the hide-by-move rule has fired.
- Add the symlink tmpfiles rule that makes InputPlumber's hardcoded sources-path traverse into U1's hidden subdirectory of the `/dev/input` bind: `systemd.tmpfiles.rules = [ "L /dev/inputplumber - - - - /dev/input/.inputplumber" ];` (extended alongside the existing `/dev/uinput` tmpfiles rule).
- Add a defensive tmpfiles rule for `/run/udev/rules.d` so the directory exists before InputPlumber's first `unhide_all()` reads it. (The adversarial reviewer flagged this as P0; on closer reading, InputPlumber's `unhide_all()` failure is caught and logged non-fatally in `src/main.rs`, so the worst case is a debug-level log line. The tmpfiles rule is cheap defense-in-depth.)
- Existing tmpfiles rule for `/dev/uinput` stays unchanged.

**Patterns to follow:**
- Existing structure of `guest/modules/input.nix` — keep its layout; this unit extends in place.
- Host service file `work/rocknix/projects/ROCKNIX/packages/tools/inputplumber/sources/usr/lib/systemd/system/inputplumber.service` is the reference for env vars to mirror.

**Test scenarios:**
- Happy path: `nix flake check` passes.
- Integration (covers AE1, AE2): after Sobo cold boot, `nsenter ... ls /dev/input/event3` returns `No such file or directory`; `ls /dev/inputplumber/sources/event3` returns success (resolves through the symlink to `/dev/input/.inputplumber/sources/event3`). A root-uid `cat /dev/input/event3` fails with ENOENT (not EACCES).
- Integration (covers AE3): journalctl in the guest shows InputPlumber start before sway-kiosk; no `libseat ... canonicalize` errors from sway.
- Integration (Bug 6 cascade check — see Risks): after InputPlumber start, `nsenter ... grep -l inputplumber/by-hidden /run/udev/data/*` is inspected. If by-hidden entries are present in the guest's udev DB, the soak (U8) records whether sway/libseat shows any canonicalize-related errors. Mitigation steps live in Risks.
- Edge case: on second guest boot in a row (warm restart), `unhide_all()` at InputPlumber startup finds the existing `/dev/input/.inputplumber/sources/event3`, attempts to rename it back, and the early udev rule then re-moves it. Net effect: device ends in the hidden location.
- Edge case (first cold boot after cutover): `/run/udev/rules.d` exists due to the defensive tmpfiles rule; `unhide_all()` reads an empty directory and proceeds without error.

**Verification:**
- Hide rule observable in `/run/udev/rules.d/` inside the guest after InputPlumber start.
- `/dev/input/event3` absent in the guest's view; `/dev/input/.inputplumber/sources/event3` present.

---

### U4. Substrate cutover: drop udev-stage bind, mask host InputPlumber

**Goal:** Switch the substrate to the new contract in one step. Removes the read-only udev bind, removes the udev-stage ExecStartPre, and masks the host's InputPlumber service. Leaves the underlying script and unit files on disk for the revert path.

**Requirements:** R1, R5, R11, R12.

**Dependencies:** U1, U2, U3 (substrate target exists; guest udev and InputPlumber are configured before this cutover removes the safety net).

**Files:**
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-start` (remove the `--bind-ro=/run/.guest-udev:/run/udev` emit; do NOT delete the staging-related comments — keep them as breadcrumbs for the U9 cleanup)
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/system.d/rocknix-guest.service` (remove the `ExecStartPre=/usr/bin/rocknix-guest-udev-stage` line; update the surrounding comment block to explain the safety-net state)
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/package.mk` (extend the post_install / install step to mask `inputplumber.service` on the target image AND pre-stage the SSH revert artifacts described below; pick the rocknix-idiomatic mask form per "Deferred to Implementation")
- Pre-stage in writable `/storage` (created at image install or first-boot activation):
  - `/storage/.config/system.d/rocknix-guest.service.d/00-restore-udev-stage.conf.disabled` — an additive `ExecStartPre=/usr/bin/rocknix-guest-udev-stage` drop-in with a `.disabled` suffix so it does not take effect until renamed.
  - `/storage/.cache/rocknix-guest-start-with-stage-bind` — an alternate start script (full file) that re-emits the `--bind-ro=/run/.guest-udev:/run/udev` arg. An `ExecStart=` override drop-in can point at this script during revert.

**Approach:**
- Four coordinated edits to enact the cutover and stage the revert artifacts.
- Mask form is implementation-deferred but the user-observable outcome is: after image install, `systemctl is-enabled inputplumber.service` reports `masked` on host; `inputplumber.service` does not start automatically; the unit file is still present and can be unmasked.
- The `rocknix-guest-udev-stage` script and its source file in the package remain installed (this unit does not touch them). They simply are no longer wired into the guest service's startup chain.
- **SSH revert correctness**: the adversarial reviewer flagged that the original draft's revert ("restore the ExecStartPre line", "restore the bind") was impossible to execute on-device because `/usr/bin/rocknix-guest-start` and `/usr/lib/systemd/system/rocknix-guest.service` live on a squashfs read-only mount. The drop-in + cached-script staging above uses the same pattern documented in the cold-boot autostart doc's "Iteration tips" section, where `/storage/.config/system.d/<unit>.d/` drop-ins and `/storage/.cache/<name>` cached scripts are the writable overlay for squashfs-shipped units.

**Patterns to follow:**
- The `emit_arg` removal is a simple delete; preserve the surrounding nspawn arg block.
- `package.mk` post_install conventions in other ROCKNIX packages — look at how other packages handle systemctl operations at install time.

**Test scenarios:**
- Static check (added in U6): `rocknix-guest-start` no longer emits `--bind-ro=/run/.guest-udev:/run/udev`.
- Static check (added in U6): `rocknix-guest.service` does not contain `ExecStartPre=/usr/bin/rocknix-guest-udev-stage`.
- Static check (added in U6): `package.mk` post_install contains the chosen mask form AND the staging of `00-restore-udev-stage.conf.disabled` plus `rocknix-guest-start-with-stage-bind`.
- Integration (covers AE1, AE2, AE3, AE4): see U3 and U5 for the end-to-end gates.
- Integration (covers AE5): manual revert exercise during U8 follows the concrete sequence in Operational / Rollout Notes and confirms the prior behavior is restored without re-flash.

**Verification:**
- All static checks pass after this unit's changes.
- On Sobo: `systemctl is-enabled inputplumber.service` reports `masked`; the unit file is still present at the expected path.
- On Sobo: `/storage/.config/system.d/rocknix-guest.service.d/00-restore-udev-stage.conf.disabled` exists and contains a valid `ExecStartPre=` line; `/storage/.cache/rocknix-guest-start-with-stage-bind` exists and is executable.

---

### U5. Korri: drop `-input` from Moonlight launcher; bump `PKG_NIX_GUEST_REV`

**Goal:** Cross-repo change that drops the launcher's `-input event11` so Moonlight Embedded's default udev auto-discovery picks up the touchscreen and the virtual pad. The rocknix-side change in this repo is the `PKG_NIX_GUEST_REV` bump that pulls the new Korri commit.

**Requirements:** R7, R9.

**Dependencies:** U1, U2, U3, U4 (the launcher change presupposes the substrate has hidden event3; landing the Korri commit before the substrate is ready would re-create input doubling on every stream).

**Files:**
- Modify (in the **Korri repo** at `simonwjackson/korri`): the launcher source the handoff identifies as `korri/products/app/stream/moonlight-launcher.ts`. Drop the `-input` flag emission. Verify there is no fallback path that still passes it on a different code path.
- Modify (in this repo): `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/package.mk` — bump `PKG_NIX_GUEST_REV` to the new Korri commit hash and `PKG_NIX_GUEST_SHA256` to its tarball SHA.

**Approach:**
- Land the Korri commit first (its own PR in the Korri repo). Then bump `PKG_NIX_GUEST_REV` in this repo's substrate package so the next ROCKNIX build pulls the new launcher behavior.
- Korri ships its own test harness (`bun test`, `just typecheck`, `just format` per prior session notes). Run those in the Korri repo before bumping.

**Patterns to follow:**
- Existing `PKG_NIX_GUEST_REV` / `PKG_NIX_GUEST_SHA256` update pattern in `package.mk`; the comment block above the variables already explains the bump workflow.

**Test scenarios:**
- Happy path (Korri-side): Korri's own typecheck and unit tests pass with the launcher change.
- Integration (covers AE1): after Sobo deploy, `/proc/<moonlight-pid>/fd/*` symlinks include `event4` and `event11`. The `-input` flag is not in `cat /proc/<moonlight-pid>/cmdline`.
- Integration (covers AE4): manual touchscreen tap on Sobo moves the host cursor on aka and registers tap-to-click; gamepad input remains intact, no doubling.

**Verification:**
- Korri commit lands; `PKG_NIX_GUEST_REV` and SHA bumped.
- After Sobo deploy and a Moonlight stream: touch reaches aka.

---

### U6. Substrate static checks: assert the new boundary (additive only)

**Goal:** Lock the new substrate contract behind static-check assertions without yet removing the old must-stay assertions (those go in U9). Keep the safety net's invariants assertable in both directions.

**Requirements:** R11 (assertable invariants for the cutover).

**Dependencies:** U1, U4 (the assertions reflect the substrate state introduced by those units).

**Files:**
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh`
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-runtime-smoke.sh` (extend with runtime assertions where the static script cannot reach)

**Approach:**
- Add `grep -q 'mkdir -p /dev/input/\.inputplumber/sources' "${PKG_DIR}/scripts/rocknix-guest-start" || fail` for the new hidden-directory creation (the EXDEV-safe approach replaces the originally-drafted bind assertion).
- Add `! grep -q '\-\-bind-ro=/run/\.guest-udev' "${PKG_DIR}/scripts/rocknix-guest-start" || fail` for the removed bind.
- Add `! grep -q 'ExecStartPre=/usr/bin/rocknix-guest-udev-stage' "${guest_unit}" || fail` for the removed ExecStartPre.
- Add the mask-form assertion against `package.mk` (exact pattern depends on the chosen mask form from U4).
- Add assertions that `package.mk` post_install stages both `00-restore-udev-stage.conf.disabled` (drop-in) and `rocknix-guest-start-with-stage-bind` (cached script) under `/storage/.config/system.d/` and `/storage/.cache/` respectively.
- Do NOT remove the existing five udev-stage assertions (lines 90, 104, 214, 866–869, 895). They continue to assert the *file* is present on disk and that its content is valid — both true during the safety-net release.
- Runtime smoke: add assertions that `/dev/inputplumber` resolves as a symlink to `/dev/input/.inputplumber/` in the guest's view, that `/dev/inputplumber/sources/event3` is reachable through the symlink, that `event3` is absent from the guest's `/dev/input/`, and that the host's `inputplumber.service` is masked.

**Execution note:** Add the new assertions in this unit *after* U1 and U4 have changed the substrate; if they were added before the substrate change, the assertion suite would fail. The safe sequence within a single PR is: U1 → U4 → U6 (assertions encode the post-cutover state).

**Patterns to follow:**
- Existing `grep -q ... || fail` and `! grep -q ... || fail` patterns in the static check script.

**Test scenarios:**
- Happy path: `bash work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh` passes with the new assertions.
- Negative test: temporarily revert U1's bind edit; the new assertion fails as expected. Restore.
- Negative test: temporarily restore the `--bind-ro=` line; the new negative assertion fails as expected. Restore.

**Verification:**
- All static-check assertions pass.
- Negative tests above confirm the assertions are load-bearing, not vacuous.

---

### U7. Update contract docs; add R8 closure note to trim plan

**Goal:** Keep the substrate contract docs consistent with the new boundary and record that the trim plan's R8 deferral is closed.

**Requirements:** R1, R11.

**Dependencies:** U1–U4 (the substrate state being documented).

**Files:**
- Modify: `docs/contracts/layer13-modules-contract.md` (revise the `/dev/input` passthrough note to reflect guest-side ownership of input classification/hiding)
- Modify: `docs/contracts/layer9-nspawn-guest-contract.md` (cross-reference the new boundary; layer 9 is still "input passthrough is layer 11+ exception" — no contract change, just a sentence noting the substrate exception now includes `/dev/inputplumber`)
- Modify: `docs/plans/2026-05-12-002-refactor-sm8550-minimal-host-trim-plan.md` (add a closure note in the deferred-questions area linking to this plan and origin brainstorm; do not rewrite R8 itself)

**Approach:** Targeted documentation edits. No file deletions; preserve historical context.

**Patterns to follow:**
- Existing layer-contract doc shape (problem statement / responsibilities / passthrough / boundary).
- Existing trim plan deferred-questions section.

**Test scenarios:**
- Test expectation: none — documentation-only unit. Links resolve and prose accurately describes the post-cutover boundary; reviewed during PR.

**Verification:**
- Documentation reads correctly; no stale references to the udev-stage bind as the input-hide mechanism.

---

### U8. Sobo soak and learning capture

**Goal:** Cold-boot Sobo with the new substrate, execute origin AEs by hand, exercise the SSH revert path at least once, and capture findings in a learning doc.

**Requirements:** R8, R9, R10, R12. Origin AE1–AE6 are the acceptance gates.

**Dependencies:** U1–U7 merged and deployed to Sobo.

**Files:**
- Create: `docs/solutions/best-practices/sm8550-guest-owned-input-boundary-soak-<completion-date>.md` (date set when soak completes). Scope is **constrained to the soak gate**: AE1–AE6 results, the verbatim revert command sequence executed, the by-hidden cascade observation from U3's check, and any findings that affect U9 readiness. **Not** a general lessons-learned doc — the scope-guardian reviewer flagged that as docs sprawl. Operational rollout/iteration tips stay in this plan's Operational / Rollout Notes section, not in a new doc.
- No code modifications.

**Approach:**
- Build the substrate change closure on fuji.
- `nix copy` / `nix-store --export | ssh ... import` per the handoff's host-iteration pattern (no nix-daemon on rocknix host).
- `nsenter -t <guest-pid> ... switch-to-configuration switch`.
- Cold-reboot Sobo (not just service restart — needs to validate the full boot ordering).
- Walk through AE1–AE6 by hand. Record results.
- Deliberately exercise the revert via the concrete SSH command sequence in Operational / Rollout Notes (mv the staged drop-in into effect, rename the cached script, unmask host inputplumber, reboot). Confirm prior behavior; then re-cutover by reversing the revert.
- Write the constrained soak-evidence doc per Files above.

**Execution note:** This unit is a manual soak gate, not a code change. The "verification" is observational; the artifact is the learning doc.

**Test scenarios:**
- **Covers AE1 (R2, R7)**: Moonlight launched with no `-input`; `/proc/<moonlight-pid>/fd/*` shows `event4` + `event11`; `event3` is absent from `/dev/input/`.
- **Covers AE2 (R2)**: a root-uid `cat /dev/input/event3` in the guest fails with `ENOENT`.
- **Covers AE3 (R8, R10)**: `journalctl -b` shows sway-kiosk reaches its session; no `libseat ... canonicalize` errors; WirePlumber reports a real sound card.
- **Covers AE4 (R9)**: physical touchscreen tap on Sobo during a live stream moves the host cursor on aka with tap-to-click; gamepad still works, no doubling.
- **Covers AE5 (R11, R12)**: revert exercised; prior input topology restored without re-flash; cutover redeployed afterward.

**Verification:**
- AE1–AE5 all pass at least once.
- Learning doc captures any surprises and proposes a soak duration before U9 ships.

---

### U9. Decommission (separate follow-up PR)

**Goal:** After U8 soak passes the operator's confidence threshold, delete the now-vestigial host pieces and the must-stay static-check assertions that guarded them.

**Requirements:** R13. **Covers AE6.**

**Dependencies:** U1–U8 merged, deployed, and soaked on Sobo with at least one rehearsed revert.

**Ship as a separate PR.** Not part of the same atomic PR as U1–U7. This unit exists in the plan so the work is enumerated and concrete, but it is intentionally scoped as follow-up work per Scope Boundaries.

**Files:**
- Delete: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/scripts/rocknix-guest-udev-stage`
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/package.mk` (remove the install of `rocknix-guest-udev-stage` from the package; remove the `systemctl mask inputplumber.service` post_install step — see "Approach" below for why the mask comes out)
- Modify: `work/rocknix/projects/ROCKNIX/devices/SM8550/options` line 72 (remove `inputplumber` from `ADDITIONAL_PACKAGES` so the package is no longer activated on SM8550 builds)
- Modify: `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh` (remove lines 90, 104, 214, 866–869, 895 — the must-stay udev-stage assertions; remove the mask assertion added in U6 since masking is no longer the mechanism)
- Do **not** delete the host `inputplumber` package directory at `work/rocknix/projects/ROCKNIX/packages/tools/inputplumber/`. Scope-guardian reviewer flagged this as exceeding R13 (which only requires removing SM8550 *activation*, not removing reusable package sources). Other ROCKNIX devices may still depend on it under different boundaries. SM8550's de-activation is sufficient.

**Approach:**
- The mask form added in U4 was a safety-net mechanism; once the package is no longer in `ADDITIONAL_PACKAGES`, the mask becomes dead code. Remove both together.
- The static-check assertion removals are the trim plan's R8 invariant retirement. Update the trim plan again (or add a second closure note) to record the final state.

**Patterns to follow:**
- Standard package removal from `ADDITIONAL_PACKAGES` (other packages have come and gone the same way).
- Standard `git rm` for the script and its content assertion lines.

**Test scenarios:**
- Happy path: `bash guest-substrate-static-checks.sh` passes without the removed assertions (the assertions don't exist to fail).
- Integration (covers AE6): the resulting Sobo image does not contain the `inputplumber` package at the host level; `which inputplumber` on host returns nothing; the script file is absent from `/usr/bin/rocknix-guest-udev-stage`.
- Edge case: ensure no other ROCKNIX device (Thor, etc.) is still listed against `inputplumber` in `ADDITIONAL_PACKAGES` in a way that the SM8550 removal would break. If Thor still depends on host InputPlumber under a different boundary, this removal is SM8550-only.

**Verification:**
- Image build succeeds without the host inputplumber package.
- Static checks pass.
- AE6 observable on a fresh image: host has no InputPlumber; guest substrate has no udev-stage; no must-stay assertion references either.

---

## System-Wide Impact

- **Interaction graph**: guest `systemd-udevd` introduces a new daemon that participates in the kernel uevent multicast (shared host/guest netns). Host udev also receives the same uevents but no longer holds InputPlumber rules, so there is no rule conflict during the safety-net release. Removal of `rocknix-guest-udev-stage` from `rocknix-guest.service`'s ExecStartPre chain shortens the host's startup work for the guest unit.
- **Error propagation**: if guest `systemd-udevd` fails to start, the dependency chain (udev-trigger → udev-settle → InputPlumber → sway-kiosk) means sway never starts, the kiosk session is unreachable, and `rocknix-recovery-toggle` recovery flags (e.g., `rocknix.no-nspawn`) plus SSH remain the recovery surface. The revert path documented in F3 is the milder failure mode.
- **State lifecycle risks**: warm restarts of InputPlumber inside the guest call `unhide_all()` at startup, which attempts to mv devices back from `/dev/inputplumber/sources/` to `/dev/input/`. Since the udev rule then re-fires, the steady-state is hidden — but there's a brief window of visibility. Future input consumers that auto-discover on the InputPlumber-restart edge could see event3 transiently.
- **API surface parity**: this plan only addresses SM8550 (Sobo handheld). Thor and other ROCKNIX targets still using the host-side InputPlumber pattern are unchanged. If a future plan extends this to Thor, the same substrate cutover will need to be applied there; the static checks are device-specific where needed.
- **Integration coverage**: guest-side udev + InputPlumber + libseat + WirePlumber + Moonlight Embedded touch path is end-to-end exercised by U8's manual soak. No unit-test substitute exists for the cold-boot ordering.
- **Unchanged invariants**: The `boot.isContainer = true` model in the guest stays in place. The host's responsibility for `/flash`, `/storage`, `/nix`, recovery toggles, and substrate updates is unchanged. Korri's lifecycle fix from the prior session is unchanged. The cold-boot autostart doc's other 12 bug fixes remain in place.

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `lib.mkForce true` is insufficient to actually run `systemd-udevd` under `boot.isContainer = true` | Medium | Boot loop; requires SSH + `rocknix.no-nspawn` flag for recovery | Build on fuji first; inspect unit graph before deploying to Sobo. If insufficient, fall back to a more direct override pattern (see Open Questions / Deferred). |
| Bug-6 GPU-reset re-emerges because sway races InputPlumber's hide rule application | Medium | Both DSI panels go black; cold reboot only recovery | Ordering edges in U3 (`After=systemd-udev-trigger.service`, existing `Before=main-space-sway-kiosk.service`). U8 soak validates ordering across cold boots. |
| WirePlumber dummy-sink regression — sound card not discovered by the time WirePlumber starts | Medium | Audio silently broken until reboot or service restart | Order WirePlumber after `systemd-udev-settle.service`. Observed in U8; if it appears, reuse the sound-card-ready wait pattern from `rocknix-guest-udev-stage` in a small guest-side helper. |
| `/dev/inputplumber/sources/` bind across host/guest fails or races at boot | Low | InputPlumber's hide returns `EXDEV` or `ENOENT` | `mkdir -p` in `rocknix-guest-start` is fatal-on-failure (must succeed before nspawn launch). Confirm in U6's runtime-smoke assertions. |
| Kernel uevent multicast under shared netns causes host udev to race with guest udev | Low | Lingering host udev rules could chmod nodes guest just moved | During the safety-net release, host's InputPlumber is masked (no inputplumber rules), so the only host udev activity touching `/dev/input/` is the default kernel uaccess tagging. Audit host's `/run/udev/rules.d/` after deploy; should contain no inputplumber-hide entries. |
| Bug 6 cascade re-emerges via guest udev DB — sway/libseat enumerates `inputplumber/by-hidden` symlink records inside the guest's own `/run/udev/data/` and triggers the canonicalize-ENOENT chain | Medium | Both DSI panels black; cold reboot recovery | Ordering (InputPlumber before sway) is necessary but not sufficient — the by-hidden tag may still appear in the guest's udev DB. U3's test scenarios include an explicit check (`grep -l inputplumber/by-hidden /run/udev/data/*` inside the guest). If the tag is present and the cascade is observable in U8 soak, the fallback mitigation is a guest-side scrubbing helper (small replacement for what host-side `rocknix-guest-udev-stage` did, scoped to the guest's own `/run/udev`). The pragmatic case-by-case mitigation is deferred to U8 evidence — the soak determines whether scrubbing is needed. |
| Korri commit and rocknix substrate commit are out of order on Sobo | High (if not coordinated) | Either input doubling (Korri new, substrate old) or touch broken (substrate new, Korri old) | U5 explicitly sequences Korri-first, then `PKG_NIX_GUEST_REV` bump. PR description states the coordination. |
| Sobo iteration time (build on fuji → closure copy → switch on Sobo → cold boot) is slow enough that early-detection costs add up | High | Multi-hour soak loops if first deploy regresses | U2's execution note: build and unit-graph inspect on fuji before deploying. U6's static-check assertions catch a class of errors before the build hits Sobo. |
| Soak window N is undefined; U9 ships too early and a latent regression appears in field use | Medium | Lost safety-net before regression surfaces | U8 captures N in the learning doc; user explicitly approves before U9 PR is opened. |

---

## Alternative Approaches Considered

- **Option A — Host keeps owning input** (origin brainstorm): rejected at brainstorm time. Would have backed out the partial migration with the smallest substrate change but kept host as the InputPlumber owner indefinitely, conflicting with the minimal-host direction.
- **Option C — `-input event4 -input event11` fallback in Moonlight launcher** (origin brainstorm): rejected at brainstorm time. Doesn't generalize beyond Moonlight; every future input consumer in the guest would need its own filter.
- **Patch upstream InputPlumber to make `/dev/inputplumber/sources/` configurable**: rejected at planning time. Adds upstream maintenance burden for a single-bind workaround. Local bind from host devtmpfs is cheaper, reversible, and ships in one repo.
- **Decommission host pieces in the same PR as the cutover (B1, not B1')**: rejected at brainstorm time. The cold-boot doc's 13-bug history shows this substrate is touchy enough that a SSH-driven revert is materially valuable.

---

## Phased Delivery

**Phase 1 — Korri commit lands first**: in the `simonwjackson/korri` repo, drop the `-input` flag from the Moonlight launcher. PR merges in that repo. Capture the resulting commit hash and tarball SHA.

**Phase 2 — Atomic cutover PR in this repo** (U1, U2, U3, U4, U5 rev-bump portion, U6, U7): substrate prep, guest udev, guest InputPlumber, cutover with pre-staged revert artifacts, the `PKG_NIX_GUEST_REV` bump pointing at Phase 1's commit, static checks, contract docs. All atomic in one rocknix-side PR. The R11 "same change" invariant is honored end-to-end: no Sobo image ships with the substrate change but without the launcher change. Scope-guardian reviewer flagged the earlier draft's "immediate follow-up" wording as breaking this invariant; this phasing closes it.

**Phase 3 — Sobo soak** (U8): operator on Sobo, recording AE1–AE6 results and the revert exercise outcome.

**Phase 4 — Decommission PR** (U9): after U8 approval and the operator-determined soak window, ships separately. Removes SM8550 activation of the host package, removes the udev-stage script, removes must-stay assertions. Reusable package sources stay in tree.

---

## Operational / Rollout Notes

- **Build target**: fuji is the build host. No builds on Sobo. Closure copy via `nix-store --export | ssh root@sobo 'nsenter ... nix-store --import'` (no nix-daemon on rocknix host).
- **Deploy step**: `nsenter -t <guest-pid> -m -u -i -n -p -r -w -- /run/current-system/sw/bin/systemctl ...` per existing handoff conventions.
- **Recovery flags**: `rocknix.no-nspawn` at `/flash/` brings up legacy host UI if the guest cannot start. `rocknix.safe=1` is the deeper escape hatch.
- **SSH revert** (F3): concrete operator command sequence using the U4 pre-staged artifacts. Squashfs-shipped files are NOT edited at recovery time — the writable `/storage` drop-in / cached-script pattern is.

  1. `ssh root@<sobo-ip>` (host)
  2. `systemctl unmask inputplumber.service && systemctl start inputplumber.service` (host)
  3. Activate the staged drop-in: `mv /storage/.config/system.d/rocknix-guest.service.d/00-restore-udev-stage.conf.disabled /storage/.config/system.d/rocknix-guest.service.d/00-restore-udev-stage.conf` — this re-adds the `ExecStartPre=/usr/bin/rocknix-guest-udev-stage` via NixOS-style override.
  4. If the bind-ro itself must be restored (the rare case where step 3 alone is not enough): write `/storage/.config/system.d/rocknix-guest.service.d/01-restore-start-with-stage-bind.conf` with `ExecStart=` clearing the previous and pointing at `/storage/.cache/rocknix-guest-start-with-stage-bind`.
  5. `systemctl daemon-reload && systemctl restart rocknix-guest.service`, or reboot the device.

  The exact pattern follows the "Iteration tips" section of `docs/solutions/best-practices/rocknix-layer14-main-space-cold-boot-autostart-2026-05-08.md`, which documents `/storage/.config/system.d/<unit>.d/` drop-ins and `/storage/.cache/<name>` cached scripts as the writable overlay for squashfs-shipped units.

- **Soak signal**: ≥ N days of clean cold-boots on Sobo (operator's discretion; U8 captures a recommendation). No regression in AE3, AE4. Revert path exercised at least once during the window. U3's Bug-6-cascade check (`grep -l inputplumber/by-hidden /run/udev/data/*`) reviewed at least once during the window; if present, sway/libseat journal entries are spot-checked for `canonicalize` errors.
- **No broad pgrep/pkill** during the soak — per user constraint, these have killed SSH shells twice this work cycle.

---

## Sources & References

- **Origin document:** [./requirements.md](./requirements.md)
- Related: `docs/solutions/best-practices/rocknix-layer14-main-space-cold-boot-autostart-2026-05-08.md` (Bug 6 narrative)
- Related: `docs/solutions/runtime-errors/guest-pipewire-dummy-sink-missing-udev-sound-records-rocknix-2026-05-13.md` (WirePlumber regression precedent)
- Related: `docs/plans/2026-05-12-002-refactor-sm8550-minimal-host-trim-plan.md` (R8 deferral closed by this plan)
- InputPlumber source: ShadowBlip/InputPlumber `src/udev/mod.rs` (v0.75.2) — `hide_device`, `unhide_all`, `RULES_PREFIX = "/run/udev/rules.d"`
- Cross-repo: `simonwjackson/korri` — launcher source at the path the handoff identifies (`korri/products/app/stream/moonlight-launcher.ts`)
