# Institutional Learnings: Bandai/SM8550 Fake-Suspend Ownership Split

## Search Context

- **Feature/Task**: Planning the SM8550 Bandai fake-suspend ownership split — Guest/Korri owns product lid/power/session/display behavior; nix-on-rocks/ROCKNIX host/substrate remains dumb and owns only boot/recovery/lifecycle/device pass-through/narrow privileged actuators.
- **Keywords Used**: fake-suspend, lid, power, SIGSTOP, cgroup, kiosk-unit, substrate-capability, host-guest boundary, rocknix.session, sessiond ownership, NetworkManager, radio cycling, iwd/connman, uinput ACL, recovery, device-report, product-blind invariants
- **Files Scanned**: 80 docs/solutions files + active work items and parking-lot items
- **Relevant Matches**: 9 files

---

## Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

## Relevant Learnings

---

### 1. The substrate's `lid.nix` hardcodes `korri-kiosk.service` as the cgroup target for fake-suspend SIGSTOP — this is the load-bearing Korri coupling to fix first

- **File**: `work/parking-lot/01KSV2WD0MP6C77QJ9BZ8FF55D-parameterize-substrate-kiosk-coupling-and-write-product-blind-contract.md`
- **Module**: nix-on-rocks `guest/modules/lid.nix`, `guest/modules/input.nix`, `guest/modules/session.nix`
- **Problem Type**: `convention` (product-blind invariants contract gap) — inferred from context; parking-lot item, not a solution doc
- **Relevance**: This is the primary upstream blocker for the fake-suspend ownership split. The SM8550 substrate's lid-close handler (`guest/modules/lid.nix:115`) currently scans two hardcoded cgroup paths:
  ```sh
  /sys/fs/cgroup/system.slice/korri-kiosk.service
  /sys/fs/cgroup/system.slice/main-space-sway-kiosk.service
  ```
  It SIGSTOPs all PIDs in the cgroup except "keep" PIDs when the lid closes. A non-Korri product (or a Korri build where the unit is renamed) silently falls back to a substrate-local profile that is not the real kiosk — **the lid feature breaks silently**. This is classified as a "load-bearing" Korri coupling in the product-blind audit (Leak A).

  The planned fix is `rocknix.session.kioskUnit` — a parameterized NixOS option (default `"main-space-sway-kiosk.service"`, Korri sets to `"korri-kiosk.service"`) that the lid module and ordering arrays read instead of literal names. This is the dependency-chain gating item for clean fake-suspend policy ownership.

- **Key Insight**: Before Korri can own fake-suspend *behavior* (deciding what to do on lid-close from the product/session side), the substrate must stop encoding Korri's unit name in the mechanism that triggers it. Fix the parameterization (`task-032`) first; then the guest/Korri product layer can register as the authority for what lid-close *means* via that option without the substrate knowing it's Korri.
- **Repo-relative paths**:
  - `work/parking-lot/01KSV2WD0MP6C77QJ9BZ8FF55D-parameterize-substrate-kiosk-coupling-and-write-product-blind-contract.md` — full AC and design notes
  - nix-on-rocks `guest/modules/lid.nix:115` — Leak A
  - nix-on-rocks `guest/modules/input.nix:17` — Leak B (option-tree inspection)
  - nix-on-rocks `nix/tests/main-space-systemd-contract.nix:31` — Leak D (assertContract hardcode)

---

### 2. `rocknix-fake-suspend` is a host-side ROCKNIX binary; it is not a NixOS guest unit — and it resets CPU governor state that Korri cares about

- **File**: `docs/deployment/device-report.md` (line 70) + `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`
- **Module**: ROCKNIX host tooling (`/usr/bin/rocknix-fake-suspend`) + Korri product runtime config
- **Problem Type**: `architecture_pattern` (inferred from device-report context and cross-referenced solution doc)
- **Relevance**: `rocknix-fake-suspend` is a ROCKNIX host binary (`/usr/bin/rocknix-fake-suspend`) because real S3 suspend is unreliable on the SM8550 SoC. It exists entirely on the *host*, not in the NixOS guest. The Ryubing solution doc documents that `rocknix-fake-suspend` **resets the CPU governor to `simple_ondemand` after suspend/resume** unless the user has set `system.gpuperf=performance` and `system.cpugovernor=performance` in ROCKNIX settings — in which case it restores `performance`.

  This has two implications for the fake-suspend ownership plan:
  1. **The trigger mechanism lives on the host** (hardware lid event → ROCKNIX evdev handler → `rocknix-fake-suspend`). Guest/Korri cannot directly own this binary; it can only register policy through the substrate options.
  2. **Post-suspend governor restore is currently a ROCKNIX host concern**, not a Korri NixOS concern. If Korri wants to guarantee performance mode after resume, it either sets the ROCKNIX setting through a deploy-time precondition or adds a guest-side post-resume hook that re-applies governor policy.

  The networking layer is also relevant: `NetworkManager` is **not present** on the ROCKNIX host. Networking is managed by `iwd + connman`. Any radio cycling during fake-suspend must use `connmanctl`/`iwctl` or sysfs directly — `nmcli` will not exist.

- **Key Insight**: The fake-suspend *trigger* is a ROCKNIX host binary that Korri cannot own or replace without substrate cooperation. Korri's ownership of fake-suspend *behavior* must be expressed as: (a) parameterized options the substrate reads (cgroup target, keep-list), and (b) guest-side sessiond hooks that fire on the resume event. The governor-reset side-effect and network-radio cycling are host-side concerns routed through ROCKNIX settings, not NixOS guest modules.
- **Repo-relative paths**:
  - `docs/deployment/device-report.md` — authoritative ROCKNIX host service inventory; confirms `iwd + connman`, no NetworkManager, `rocknix-fake-suspend` at `/usr/bin/`
  - `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md` — governor-reset side-effect documented at line 76

---

### 3. Sessiond is the authoritative foreground lifecycle source — fake-suspend must coordinate with it, not bypass it

- **File**: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
- **Module**: `tools/device/sessiond` + `korri/shared/library` + `nix/modules`
- **Problem Type**: `architecture_pattern`
- **Relevance**: The canonical rule: **Sessiond is the single source of truth for whether the Korri host can accept a launch, what is running, and whether it is back to idle.** An out-of-band action (like the substrate's lid-close SIGSTOP cgroup walk) that interrupts a running game without going through sessiond will leave sessiond in an inconsistent state — still believing the game is in `game` mode, attempting a `restoring` pass on a process tree that was SIGSTOPped rather than exited.

  The practical implication: the fake-suspend ownership plan needs to define how lid-close events interlock with sessiond's `home → launching → game → restoring` state machine. Options include:
  - Sessiond exposes a suspend-notification endpoint that the substrate (or guest-side evdev handler) calls before the SIGSTOP cgroup walk, allowing sessiond to gracefully freeze/release its active launch.
  - A guest-side lid-event watcher fires a `POST /managed-launch/terminate` (graceful) before the substrate's lid-close handler executes.
  - The substrate's SIGSTOP keep-list includes sessiond's `bun` master process so sessiond stays alive during suspend to handle resume cleanup.

  The discrimination rule for rejections is also relevant: `PreflightRejected` with `reason.source: 'sessiond'` is the typed rejection shape when sessiond detects the host is not idle. Post-suspend, if sessiond is in `recovering` mode due to a SIGSTOP-interrupted game, launches will correctly reject until sessiond stabilizes.

- **Key Insight**: Do not design the fake-suspend ownership split as if sessiond doesn't exist. The SIGSTOP cgroup walk is a substrate mechanism; the sessiond state machine is the product mechanism. Both need to agree on what constitutes a "clean suspend". Design the seam as: substrate tells Guest/Korri lid-close is imminent → Korri/sessiond handles active session → substrate executes SIGSTOP.
- **Severity**: high
- **Repo-relative paths**:
  - `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
  - `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` — lifecycle vocabulary, `/managed-launch/terminate`, event sequences
  - `tools/device/sessiond-state.ts` — internal state machine

---

### 4. Sessiond operator model: kiosk vs source-machine role idle semantics, restore behavior, and the SIGSTOP keep-list question

- **File**: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- **Module**: `tools/device/sessiond` + `tools/device/sessiond-role.ts`
- **Problem Type**: `architecture_pattern`
- **Relevance**: The sessiond operator model defines what "idle" means for each role and what the restore sequence looks like after a child exits. The SM8550 Bandai kiosk uses the **kiosk role** with `home` as the idle wire label and `home-ready` as the terminal readiness event. The kiosk role's `restoreIdleAfterLaunch` re-launches the Electrobun renderer after the child exits and reconciles the `home` invariant (`home-invariant windows=N [renderer-relaunched] … [satisfied]`).

  For fake-suspend ownership, the key question is: what does the kiosk role expose to a suspend/resume cycle? Currently there is no `suspend` phase in the `ForegroundSessionFailureStage` union (`prepare`, `spawn`, `foreground`, `exit`, `teardown`, `readiness`, `restore`, `adapter`). A mid-game lid-close could manifest as an unexpected `exit` phase if the SIGSTOP is followed by a SIGCONT then SIGTERM, or leave sessiond in `game` phase indefinitely if the process is merely frozen.

  The protocol-evolution rule (five operating principles in `sessiond-managed-launch-protocol.ts`) is worth remembering when adding suspend-related events: **additive only**, **optional by default**, **capability flags over schema versioning**.

- **Key Insight**: The kiosk role's `restoreAttempts` counter (defaults to stop after 3 failed restore attempts) and `shouldStopAfterRestoreFailure` may incorrectly fire if a SIGSTOP-interrupted game is mis-read as a crashed restore. Any suspend/resume plumbing should either produce a clean `child-exited` event (orderly) or add a distinct `suspend → resume` event pair that sessiond's state machine can handle without incrementing `restoreAttempts`.
- **Severity**: high
- **Repo-relative paths**:
  - `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
  - `tools/device/sessiond-role.ts` — role boundary; `createKioskSessionRole`
  - `korri/shared/library/sessiond-managed-launch-protocol.ts` — protocol evolution rules and capability flags

---

### 5. Sessiond kiosk renderer ownership: environment invariants required when the GUI process moves off the compositor's exec tree

- **File**: `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- **Module**: `nix/images` + `nix/modules` + `tools/device/sessiond`
- **Problem Type**: `architecture_pattern`
- **Relevance**: This doc is the chronicle of 11 empirical fixes needed to make sessiond own the Electrobun renderer on a real Sobo kiosk — including the `ProtectSystem=strict` + `ReadWritePaths` issue (#6), the SWAYSOCK discovery problem (#8), and the env vars that must be explicitly declared on the sessiond unit when it's no longer a sway exec child. Critically relevant for any new systemd units the fake-suspend split introduces on the guest side.

  The fake-suspend design may need a new guest-side unit (e.g., a lid-event watcher or a suspend-notifier service) that runs as a sibling of sessiond. That unit will hit the same class of problems: it must explicitly carry `WAYLAND_DISPLAY`, `SWAYSOCK`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, and `ReadWritePaths` for every persistent path it writes. The 11 empirical fixes are the runtime contract *every* new device-side service on the kiosk image has to satisfy.

  The `10-second white-flash loop` pattern (renderer spawning and crashing on a missing env/permission) is the canonical symptom when one of these invariants is missed. The `KORRI_ELECTROBUN_LOG` (baked into kiosk.nix) is the only diagnostic that survives the loop.

- **Key Insight**: Any new guest-side service introduced for fake-suspend (lid watcher, resume hook, suspend-state notifier) must be treated like a new sessiond companion: explicitly carry all Wayland/sway env; add `ReadWritePaths` for every persistent path; add `pkgs.util-linux`, `pkgs.bashInteractive`, and `swaymsg` to its unit PATH if it uses the shell launcher path. Do not assume these inherit from sway.
- **Severity**: high
- **Repo-relative paths**:
  - `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — 11-item runtime invariant table
  - `nix/modules/korri-sessiond.nix` — reference for how sessiond declares env and paths
  - `nix/tests/korri-sessiond-module-check.nix` — NixOS eval guards for these invariants

---

### 6. SM8550 substrate capability boundary plan — the active work this split extends

- **File**: `work/01KSRGFP2QY612H6A1DSTPNGEZ-refactor-sm8550-substrate-capability-boundary/plan.md`
- **Module**: nix-on-rocks `guest/modules/chipsets/sm8550/` + `nix/images/platforms/rocknix-sm8550.nix`
- **Problem Type**: `architecture_pattern` (active plan)
- **Relevance**: This is the in-flight predecessor that established the substrate vs. product policy split pattern for SM8550. Its core rule: **nix-on-rocks says "this chipset exposes these Linux capabilities"; Korri says "for a Korri appliance, use those capabilities with Moonlight/sessiond/server/kiosk policy."** The implementation units (U1–U6) define the collapsed chipset folder structure (`guest/modules/chipsets/sm8550/{default,audio,video}.nix`), the neutral capability option contract (video decode backend, audio API), and the Korri-side consumption pattern.

  The scope boundaries explicitly state: do not make nix-on-rocks configure `services.korri.*`, `KORRI_*` env vars, or Korri service names. This is the direct architectural precedent for the fake-suspend ownership split: the substrate exposes a lid/power hardware capability; Korri registers what to do with it via parameterized substrate options.

  **Risk mitigation pattern from this plan that applies to fake-suspend**: "Land additive substrate options first, update Korri to consume them second, remove obsolete substrate product surface last." Fake-suspend should follow the same additive sequencing: add `rocknix.session.kioskUnit` / lid-behavior options to nix-on-rocks first (task-032), wire Korri to set them second, remove hardcoded `korri-kiosk.service` references last.

- **Key Insight**: The `refactor-sm8550-substrate-capability-boundary` plan's additive migration pattern and its risk table (especially "Removing nix-on-rocks Moonlight module breaks existing flow → use compatibility shims") is the playbook for the fake-suspend split. The lid-close power behavior is the same category: substrate owns the mechanism; Korri parameterizes the policy. The multi-repo sequencing discipline (additive → consume → remove) is mandatory because there is no intermediate red state allowed.
- **Repo-relative paths**:
  - `work/01KSRGFP2QY612H6A1DSTPNGEZ-refactor-sm8550-substrate-capability-boundary/plan.md` — full design
  - `work/01KSRGFP2QY612H6A1DSTPNGEZ-refactor-sm8550-substrate-capability-boundary/work.md` — execution log

---

### 7. Device ACL for privileged kernel interfaces: the uinput permissions pattern

- **File**: `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
- **Module**: `product/systems/nixos/modules/korri-steam.nix`
- **Problem Type**: `integration_issue`
- **Relevance**: When Steam needed write access to `/dev/uinput` to create virtual XInput controllers, the fix belonged in a NixOS module (`korri-steam.nix`) that issues `chgrp input /dev/uinput` and `chmod 0660` via a startup unit. The pattern: **privileged device-node access is declared in the NixOS guest's systemd service layer**, not in application code or ad-hoc ROCKNIX host setup.

  For fake-suspend, the analogous question is: which device nodes does the Guest/Korri fake-suspend behavior need access to? If a guest-side lid watcher or resume hook needs evdev input nodes (to observe the lid-state physical event), or if a post-resume power-mode restorer needs cgroup or sysfs clock-freq access, those ACLs are wired in NixOS udev rules or service ExecStartPre — same pattern as `korri-steam.nix`. The ROCKNIX host does not grant or revoke them; the NixOS guest's udev/systemd layer does.

  The validation checklist from this doc is also instructive: (1) build the module check (`nix build .#checks`), (2) verify the device node ownership on target, (3) restart the service, (4) confirm the actual behavior. Don't conflate "device is visible" with "device is accessible" — they are separate checks.

- **Key Insight**: Establish the exact kernel interfaces the guest-side fake-suspend ownership needs (evdev lid event nodes, sysfs power nodes, cgroup paths), then wire udev rules and `ReadWritePaths`/`DeviceAllow` in the NixOS module. Do not rely on ROCKNIX host chmod or post-deploy manual fixups — those won't survive reboots.
- **Severity**: high
- **Repo-relative paths**:
  - `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
  - `product/systems/nixos/modules/korri-steam.nix` — reference implementation for device ACL wiring

---

### 8. Architectural posture belongs in the image-level default, not the module default

- **File**: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- **Module**: `nix/images` + `nix/modules`
- **Problem Type**: `architecture_pattern`
- **Relevance**: A module default calibrated for one posture silently breaks another. The federation example: modules defaulted to `host = "127.0.0.1"` and `openFirewall = false`; fleet devices came up non-federated because no image override asserted the posture. The rule: **fleet-level behavioral posture belongs in the image composition layer** (`nix/images/platforms/rocknix-sm8550.nix`), not in module-level `lib.mkDefault`.

  For fake-suspend: the guest-side fake-suspend policy options (suspend behavior mode, resume hook enable, governor restore target, keep-list overrides) should be **set to their Korri values in `nix/images/platforms/rocknix-sm8550.nix`** and/or the SM8550 kiosk image composition. Do not assume a module default of "pass-through to substrate behavior" will work on Bandai; assert it explicitly in the platform layer. Devices deployed before the explicit assertion silently inherit whatever the module default was.

- **Key Insight**: When wiring fake-suspend behavior options in the NixOS guest, set them explicitly in the SM8550 appliance composition (`nix/images/platforms/rocknix-sm8550.nix`) rather than counting on a module default being "correct for Bandai." The config-check test (`nix/tests/korri-rocknix-sm8550-config-check.nix`) is where to assert the posture holds.
- **Severity**: medium
- **Repo-relative paths**:
  - `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
  - `nix/images/platforms/rocknix-sm8550.nix` — where Bandai platform posture is asserted
  - `nix/tests/korri-rocknix-sm8550-config-check.nix` — assertion guard for SM8550 kiosk invariants

---

### 9. ROCKNIX deploys target the guest store; the host has no `/nix`

- **File**: `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- **Module**: `tools/scripts/deploy-sobo` + nix-on-rocks
- **Problem Type**: `workflow_issue`
- **Relevance**: All NixOS module work (the guest-side fake-suspend hooks, lid-event watchers, governor restore units) lives in the **guest NixOS store**. The ROCKNIX host is an immutable squashfs with no `/nix`. Deploy scripts must target the guest (port 2222) for closure copies and use `rocknix-guest-generation-import` + `rocknix-guest-generation-switch` + `systemctl restart rocknix-guest.service` on the host (port 22) to activate. `readlink -f` (not bare `readlink`) for profile resolution.

  The fake-suspend plan will require verifying changes on Bandai. The deploy path is: build on aarch64 builder → `nixos-rebuild boot --target-host root@guest` → resolve toplevel on guest with `readlink -f` → `rocknix-guest-generation-switch` on host → `systemctl restart rocknix-guest.service`. Any smoke testing of lid-event handling must happen via physical lid-close on the Bandai device — there is no virtual path.

- **Key Insight**: Guest module changes (new lid-event units, sessiond hooks) are deployed the same way as all other NixOS changes: into the guest store via the guest SSH port, not via the host. Physical lid-close smoke is the only real validation path for the fake-suspend behavior.
- **Severity**: high
- **Repo-relative paths**:
  - `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`

---

## Recommendations

### Architecture

1. **Parameterize before you own.** The hard blocker is `task-032` (`work/parking-lot/01KSV2WD0MP6C77QJ9BZ8FF55D-…`). The substrate's `guest/modules/lid.nix` must read `config.rocknix.session.kioskUnit` instead of the literal `"korri-kiosk.service"` cgroup path before Korri can cleanly own lid/power behavior. Land `rocknix.session.{kioskUnit,compositorUnit,inputdUnit}` in nix-on-rocks first; then set those options in `nix/images/platforms/rocknix-sm8550.nix` from the Korri side. This is the same additive→consume→remove sequencing established by the SM8550 substrate capability boundary plan.

2. **Sessiond must be the policy gate for fake-suspend, not a bystander.** The SIGSTOP cgroup walk (substrate mechanism) happens *outside* sessiond's state machine today. The plan needs to define a notification seam so the substrate announces a lid-close before executing SIGSTOP. The simplest form: a guest-side unit that fires `POST /managed-launch/terminate` (graceful) to sessiond before the SIGSTOP walk, or a `/control/suspend` endpoint sessiond exposes that the substrate calls. Do not add a `suspend` phase to the sessiond state machine prematurely — the protocol-evolution rule requires capability flags and additive-only schema changes.

3. **Keep fake-suspend trigger on the host; put policy in the guest.** `rocknix-fake-suspend` is an immutable ROCKNIX host binary. The plan's ownership goal is for Korri to own *what happens during and after* fake-suspend (session preservation, display behavior, post-resume restore), not the trigger binary itself. The mechanism is: nix-on-rocks substrate options parameterize cgroup targets and keep-lists; the NixOS guest wires post-resume hooks via systemd units.

4. **Governor restoration and radio cycling are host settings, not guest modules.** `rocknix-fake-suspend` resets the CPU governor on resume. Korri's lever is the ROCKNIX `system.gpuperf` / `system.cpugovernor` settings (set at device-config time), not a NixOS module. NetworkManager is absent; radio cycling must use `connmanctl`/`iwctl` or sysfs — this is a ROCKNIX host concern unless a guest-side post-resume hook is explicitly introduced.

### Implementation guards

5. **Any new guest-side unit for lid-event or resume behavior must explicitly carry the full kiosk env**: `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `SWAYSOCK` (discovered at spawn time by globbing `$XDG_RUNTIME_DIR/sway-ipc.*.sock`), `DBUS_SESSION_BUS_ADDRESS`, `XDG_SESSION_TYPE=wayland`, plus `ReadWritePaths` for every persistent path it writes. The 11-item empirical table in `kiosk-renderer-ownership-by-sessiond-2026-05-27.md` is the checklist.

6. **Device-node ACLs for any sysfs/evdev access go in NixOS udev rules or service `DeviceAllow`/`ReadWritePaths`** — see the `korri-steam.nix` uinput pattern. Validate with the same three-step checklist: (1) build module check, (2) verify node ownership on target, (3) confirm runtime behavior.

7. **Assert fake-suspend posture explicitly in `nix/tests/korri-rocknix-sm8550-config-check.nix`** — don't rely on module defaults to be correct for Bandai. The architectural-posture lesson is that module defaults reflect original design intent, not fleet reality.

8. **Physical lid-close smoke is the only valid integration test.** There is no virtual path for lid events on Bandai; deploy via guest SSH (port 2222), activate via host, and test with a real lid-close.
