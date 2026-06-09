---
title: refactor: Clean-break rootless Korri appliance runtime
type: refactor
status: active
date: 2026-06-09
deepened: 2026-06-09
---

# refactor: Clean-break rootless Korri appliance runtime

## Summary

This plan moves Korri appliance runtime architecture to the model we would have chosen from the start: one `korri` product user owns the guest-visible runtime, root only performs privileged setup, and Korri paths are normal NixOS paths (`/home/korri`, `/var/lib/korri`, and XDG runtime sockets). It also cleanly renames `korri-server` to `korrid`, moves Korri daemons into the `korri` user session, and replaces same-host token HTTP control with Unix-socket IPC.

---

## Problem Frame

Korri currently mixes product runtime identity with historical deployment constraints: RockNIX-targeted guest adapters encode `root`, `/storage`, and `/run/user/0`; `korri-sessiond` and `korri-inputd` run as implicit-root system services; and the primary federated daemon is named like a generic HTTP server. The result is a brittle appliance model where root owns too much of the session and substrate implementation details leak into guest/runtime contracts.

The clean break intentionally avoids compatibility aliases and legacy defaults. The implementation should make root usage explicit, remove root-shaped Korri runtime paths, and keep any RockNIX/nix-on-rocks rootfulness below the Korri guest/runtime boundary.

---

## Requirements

- R1. All Korri-owned long-lived services run as the `korri` user; root is limited to setup/helpers/substrate work.
- R2. Korri guest-visible runtime contracts use `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, and `$XDG_RUNTIME_DIR/korri/*`; they do not encode `/storage`, `/run/user/0`, or root as the Korri runtime identity.
- R3. Every appliance profile uses greetd auto-login as `korri` to create a real logind/session environment; source-machine and headless profiles run a minimal idle compositor session.
- R4. Korri user services are grouped behind a user-level `korri-session.target`.
- R5. `korri-server` is renamed to `korrid` across runtime code, packages, units, Nix options, tests, and current docs, with no compatibility aliases.
- R6. Nix option shape separates shared runtime identity (`services.korri.runtime`) from daemon behavior (`services.korri.daemon`).
- R7. `korrid` is the federated Korri daemon: LAN HTTP/mDNS is trusted-LAN/no-auth v1 and enabled by default for appliances.
- R8. Local/native IPC uses Unix sockets where browser constraints do not apply: local UI/CLI to `korrid`, and `korrid` to `korri-sessiond`.
- R9. `korri-inputd` remains local-only for renderer compatibility via loopback WebSocket, but runs as `korri` and obtains device/action permissions through setup, groups, uaccess, substrate ownership, or narrow helpers.
- R10. Root setup is represented by one explicit `korri-setup.service` boundary; no Korri-owned long-lived daemon remains implicit-root.
- R11. Existing product wire behavior should not change solely because of the daemon rename; RPC schemas/tags and managed-launch semantics remain product-compatible unless a unit explicitly calls out a transport-only change.

---

## Scope Boundaries

- No compatibility aliases for `korri-server`, `services.korri.server`, legacy env names, or root/session defaults.
- No client authentication or pairing for federation v1; federation remains trusted-LAN/no-auth.
- No rewrite of historical evidence documents or old plans solely to replace `korri-server` mentions; historical docs may remain historical.
- No change to third-party/substrate daemon identities beyond what Korri needs to consume them correctly.
- No new automatic game library scanner in this plan.
- No final policy for missing/unsafe persistence in this plan.

### Deferred to Follow-Up Work

- Persistence failure policy: captured as `task-083` in `backlog/task-083 - decide-korri-appliance-persistence-failure-policy.md`.
- Library scanning/import policy for `/var/lib/korri/content/games`: captured as `task-084` in `backlog/task-084 - design-library-scanning-for-var-lib-korri-content-games.md`.
- Pairing/authenticated federation, if needed after trusted-LAN v1 hardening.
- Replacement of inputd loopback WebSocket with a native renderer bridge, if Electrobun/native APIs later make that cleaner.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/modules/korri-compositor.nix` already exposes a configurable compositor user/home/runtime/session-bus model, but RockNIX platform adapters override it to root-shaped values.
- `product/systems/nixos/modules/korri-server.nix` currently owns server/streaming/federation wiring, system-vs-user service mode, sessiond token env, library root defaults, and Sunshine integration.
- `product/systems/nixos/modules/korri-sessiond.nix` currently defines an implicit-root system service plus a root token oneshot and loopback HTTP token-auth control surface.
- `product/systems/nixos/modules/korri-input.nix` currently defines an implicit-root inputd system service and an InputPlumber/uinput provider branch.
- `product/systems/nixos/images/live-usb-runtime.nix` already demonstrates greetd auto-login as the configured compositor user and parametric `/home/<user>` persistence allowlist wiring.
- `product/systems/nixos/images/source-machine.nix` demonstrates a non-root compositor/session user (`korri-source`) and source-machine idle compositor shape, but the clean break consolidates Korri-owned users to `korri`.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` and `product/systems/nixos/images/platforms/rocknix-rk3566.nix` are the primary root-shaped guest adapters to purge: they set `root`, `/storage`, `/run/user/0`, root DBus, and root linger.
- `product/platform/config/xdg-paths.ts` provides the XDG path helper pattern to keep TypeScript code environment-derived and testable.
- `tools/testing/nix/korri-*-module-check.nix` files are the main pure-eval test pattern for option defaults, emitted units, env propagation, and assertion messages.

### Institutional Learnings

- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` warns about `%t`/`%h` path drift between user and system managers and emphasizes eval-time assertions for lifecycle/path contracts.
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` identifies stopping runtime services from running as root as an explicit follow-up and documents the managed-launch/sessiond protocol boundary.
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` records the environment and hardening pitfalls when renderer/session work moves from compositor children to systemd siblings.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md` distinguishes conservative reusable module defaults from product image posture; this plan makes the rootless posture product-default rather than host-local folklore.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` matters for validation: Korri NixOS changes land in the guest, not the minimal RockNIX host.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` records redaction at the status seam; path redaction should be rechecked after replacing `/storage` paths with `/var/lib/korri` and `/home/korri`.

### External References

- systemd user-service guidance: `graphical-session.target`, `graphical-session-pre.target`, user runtime dirs, and user service targets shape the `korri-session.target` design.
- NixOS/greetd guidance: greetd plus PAM/logind is the right way to create a real appliance session for `korri`; lingering alone is not a substitute for a seat/session.
- FHS/XDG guidance: `/home/korri` should carry user/session XDG state, while `/var/lib/korri` carries product/service state such as library/content/device state.
- Unix-socket IPC guidance: same-user local IPC can use filesystem socket ownership instead of bearer-token files; HTTP-over-Unix-socket preserves existing route semantics with lower migration cost than a new protocol.

---

## Key Technical Decisions

- Use one product runtime user, `korri`: this keeps the appliance mental model simple and avoids user/group sprawl while relying on systemd hardening and explicit paths for confinement.
- Make `korri` a normal, non-interactive appliance user with a stable UID: it needs a real logind/PAM session and stable `/run/user/<uid>` ownership, but the numeric UID remains an implementation detail rather than a guest-visible path contract.
- Put app/session state under `/home/korri` and product truth under `/var/lib/korri`: foreground apps get a normal home/XDG environment, while library/content/device state gets a stable product state root.
- Use `/var/lib/korri/content/games` as the human-facing manual game hierarchy: scanning/import behavior is deferred, but the path contract is established now.
- Keep root below the line: `korri-setup.service`, greetd, udev/device setup, and substrate helpers may be root; long-lived Korri daemons may not.
- Use greetd for every appliance, including source-machine and headless profiles: every Korri appliance gets a real `korri` session; source-machine and headless profiles run a minimal idle compositor rather than bypassing the session model.
- Let greetd/session activation, not pre-session lingering, start the Korri runtime target by default: if a platform later needs `korri` lingering, checks must ensure it cannot start `korri-session.target` before the real graphical/login session is established.
- Use a user-level `korri-session.target`: this gives operators/tests one product-owned lifecycle anchor without stuffing Korri services into generic `default.target` only.
- Rename `korri-server` to `korrid`, but keep specialized daemon names `korri-sessiond` and `korri-inputd`: `korrid` is the compressed primary daemon name; specialized daemons remain product-qualified role daemons.
- Use `services.korri.runtime` and `services.korri.daemon`: runtime identity/path settings are shared; daemon/federation/library settings belong to the primary daemon namespace.
- Use descriptive `KORRI_*` env names, not `KORRID_*`: env vars remain product-prefixed and descriptive, while `korrid` is the binary/unit/package name.
- Make `korrid` LAN federation explicit: appliance defaults expose the public federation API only on trusted LAN interfaces; wildcard binding is allowed only when the profile also constrains exposure with NixOS firewall/interface policy. U2 must classify routes into discovery/read/status, trusted-peer mutations such as typed launch requests, and local-only daemon/session controls.
- Use HTTP-over-Unix-socket for `korrid` to `korri-sessiond`: this keeps the existing route/protocol concepts while removing TCP/token exposure for local control.
- Split session-scoped sockets from cross-session launch artifacts: sockets live under `$XDG_RUNTIME_DIR/korri`, while launch artifacts that must survive compositor/session restarts live under `/run/korri/launch-artifacts`.
- Keep inputd renderer transport as loopback WebSocket: browser-like renderer clients cannot directly use Unix sockets, so the clean break makes it local-only and non-root instead of replacing it prematurely.
- Do not expose `/storage` as a Korri guest contract: if a substrate uses root or storage internally, that is hidden below the guest/runtime line.
- Avoid hard-coded numeric `/run/user/<uid>` in product contracts: user units should use XDG/runtime specifiers in user context, and system units should avoid depending on numeric user runtime paths.

---

## Open Questions

### Resolved During Planning

- Should the primary runtime user be one `korri` user or role-specific users? Use one `korri` product user.
- Should all Korri-owned long-lived services run as `korri`? Yes; root is setup/helper/substrate only.
- Should `korri-server` become `korrid`? Yes, full clean rename with no compatibility aliases.
- Should `sessiond` and `inputd` be absorbed into `korrid`? No; keep separate daemons for failure isolation and operational clarity.
- Should `korrid` be part of the federated network? Yes; it is the federated daemon.
- Should federation add auth now? No; trusted-LAN/no-auth v1 remains the posture.
- Should every appliance use greetd? Yes; kiosk, source-machine, and headless profiles all get a real `korri` session.
- What should source-machine and headless run? A minimal idle compositor session.
- Should inputd stay root? No; it runs as `korri`, with permissions/helpers modeled explicitly.

### Deferred to Implementation

- Exact Unix-socket client helper shape for Bun/Hono: the plan chooses HTTP-over-Unix-socket, but the final library/helper names and Bun API wrapper are implementation details.
- Exact user-service hardening fragments: apply the shared policy consistently, but final Nix attr factoring can follow implementation ergonomics.
- Exact root setup script internals: the contract is one explicit root setup boundary; implementation can decide which preparation is better expressed through native NixOS primitives plus setup validation.
- Exact source-machine/headless idle compositor command: the behavioral contract is a minimal idle compositor under `korri`; final Sway config can follow existing source-machine patterns.
- Physical-device validation order for RockNIX products: the plan defines the guest/runtime contract; exact hardware smoke sequencing belongs to implementation and release validation.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  Boot[root/system boot] --> Setup[korri-setup.service<br/>root oneshot]
  Setup --> Greetd[greetd auto-login<br/>user: korri]
  Greetd --> Login[logind/PAM session<br/>/run/user/&lt;korri-uid&gt;]
  Login --> Target[korri-session.target<br/>systemd --user]

  Target --> Compositor[korri-compositor<br/>user service]
  Target --> Daemon[korrid<br/>user service]
  Target --> Sessiond[korri-sessiond<br/>user service]
  Target --> Inputd[korri-inputd<br/>user service]

  Daemon -- LAN HTTP/mDNS --> Peers[Federated Korri peers]
  Daemon -- Unix socket --> Sessiond
  Inputd -- loopback WebSocket --> Renderer[Electrobun renderer]
  Sessiond --> Apps[Gamescope / Moonlight / RetroArch / foreground apps]

  Setup -. prepares .-> Home[/home/korri + XDG]
  Setup -. prepares .-> State[/var/lib/korri]
  Setup -. prepares .-> Run[/run/korri and device permissions]
```

The important line is between `Setup` and the user session: privileged work is complete before the Korri runtime starts. Any RockNIX/root substrate behavior stays below or beside setup; Korri runtime services consume only the normal guest contracts above.

---

## Phased Delivery

The work is intentionally split into independent backlog-sized slices that can be implemented one after another in one worktree. Each slice is clean within its scope: no compatibility aliases and no temporary old/new runtime contracts exposed as public behavior.

### Phase 1 — Establish contracts

- U1 establishes `services.korri.runtime`, canonical paths, the setup boundary, and checks.

### Phase 2 — Rename and lifecycle

- U2 renames the primary daemon to `korrid`.
- U3 moves appliance lifecycle to greetd and user services.

### Phase 3 — IPC and permissions

- U4 replaces sessiond token HTTP with Unix-socket IPC.
- U5 moves inputd into the non-root permission model.

### Phase 4 — Platform purge and verification

- U6 removes root/storage/run-user-0 guest assumptions from platform adapters and broadens checks.
- U7 updates current docs/operator notes and release validation guidance.

---

## Implementation Units

### U1. Runtime identity, guest paths, and setup boundary

**Goal:** Introduce the shared rootless runtime contract and the single root setup boundary that prepares it.

**Requirements:** R1, R2, R6, R10

**Dependencies:** None

**Files:**
- Create: `product/systems/nixos/modules/korri-runtime.nix`
- Create: `product/systems/nixos/modules/korri-setup.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/images/common.nix`
- Modify: `product/systems/nixos/images/headless.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/images/live-usb-runtime.nix`
- Modify: `product/platform/config/xdg-paths.ts`
- Test: `tools/testing/nix/korri-runtime-module-check.nix`
- Test: `tools/testing/nix/korri-image-outputs-check.nix`
- Test: `product/platform/config/xdg-paths.test.ts`

**Approach:**
- Add `services.korri.runtime` as the shared contract for the `korri` user, group, home, product state root, content root, games root, XDG-derived paths, and runtime socket directory.
- Declare `users.users.korri` and `users.groups.korri` from the runtime module as the single Korri-owned runtime identity. The user must be a normal logind-capable user, have a stable non-zero UID, use a non-interactive shell, and belong to the baseline appliance groups needed by later units (`input`, `render`, `seat`, and `video` unless a platform proves a narrower set).
- Add one root-owned `korri-setup.service` boundary that prepares and validates `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, `/run/korri`-style cross-session runtime directories, and baseline device/group prerequisites before greetd starts. greetd must require this setup boundary, not merely order after it, so a failed setup cannot start a partially prepared session.
- Prefer native NixOS primitives for user creation and simple tmpfiles declarations, but keep one explicit `korri-setup.service` as the privileged setup boundary and validation point. The setup service should write only the specific prefixes it owns, such as `/home/korri`, `/var/lib/korri`, and `/run/korri`, not broad `/run`.
- Establish `/var/lib/korri/content/games` as the manual game hierarchy without adding a scanner. The path is owned by `korri:korri`, readable/traversable for inspection, and writable only by `korri` unless a future operator-editors group is deliberately introduced.
- Update XDG helpers/tests only where the helper API needs to reflect the new canonical defaults; avoid hard-coding `/home/korri` in TypeScript when `HOME`/`XDG_*` can supply it.
- Remove or quarantine `/storage` path assumptions from shared runtime config. Any remaining `/storage` in historical docs or lower substrate scripts is not a Korri runtime contract.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-compositor.nix` option structure and `_file`/`key` deduplication.
- `product/systems/nixos/images/live-usb-runtime.nix` parametric owner/home allowlist pattern.
- `product/platform/config/xdg-paths.ts` environment-injected path derivation.
- `tools/testing/nix/korri-server-module-check.nix` pure module-eval check style.

**Test scenarios:**
- Happy path: evaluating the runtime module creates a normal, non-interactive `korri` user/group with stable non-zero UID, home `/home/korri`, baseline appliance groups, and `/var/lib/korri` plus `/var/lib/korri/content/games` as Korri-owned state paths.
- Happy path: appliance image evaluation shows runtime env/path defaults use `/home/korri`, `/var/lib/korri`, and XDG-derived runtime socket paths.
- Edge case: a module evaluation that attempts to set root as the runtime user fails with an eval-time assertion unless it is a non-Korri root setup helper.
- Error path: if `korri-setup.service` fails, `greetd.service` does not start the Korri session.
- Error path: a Korri runtime option that introduces `/storage` or `/run/user/0` into the runtime contract fails a Nix check.
- Integration: XDG helper tests prove Korri data/config/state/cache paths derive from `HOME=/home/korri` and explicit `XDG_*` env overrides without relying on `/storage`.

**Verification:**
- Nix module checks prove the runtime contract exists and root/storage/run-user-0 are absent from Korri runtime options and emitted unit env.
- TypeScript path helper tests still pass and reflect the new canonical path assumptions.

---

### U2. Full `korri-server` to `korrid` rename

**Goal:** Rename the primary federated daemon and its Nix/API runtime contract with no compatibility aliases.

**Requirements:** R5, R6, R7, R11

**Dependencies:** U1

**Files:**
- Rename/Modify: `product/services/device/korri-server.ts` -> `product/services/device/korrid.ts`
- Modify: `product/services/server/package.nix`
- Rename/Modify: `product/systems/nixos/modules/korri-server.nix` -> `product/systems/nixos/modules/korri-daemon.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/flake/packages.nix`
- Modify: `product/systems/nixos/flake/apps.nix`
- Modify: `product/systems/nixos/images/headless.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Modify: `product/apps/portal/api/server/status.rpc-handler.ts`
- Test: `product/apps/portal/api/server/status.rpc-handler.test.ts`
- Rename/Modify: `tools/testing/nix/korri-server-module-check.nix` -> `tools/testing/nix/korri-daemon-module-check.nix`
- Modify: `tools/testing/nix/korri-image-outputs-check.nix`
- Test: `product/services/device/korrid.test.ts`

**Approach:**
- Rename the binary/package/unit to `korrid` and the Nix namespace to `services.korri.daemon`.
- Rename current runtime env vars that encode `SERVER` terminology to descriptive `KORRI_DAEMON_*` names where they are daemon-specific. Keep product/domain env names that are not server-specific when they remain semantically correct.
- Preserve federation semantics: `korrid` remains LAN HTTP/mDNS by default for appliance images and trusted-LAN/no-auth v1. Appliance profiles expose the public federation API only on trusted LAN interfaces; any wildcard listener must be paired with NixOS firewall/interface policy and a module assertion that blocks accidental exposure on unconstrained profiles. `korri-sessiond` and `korri-inputd` remain local-only. As part of the rename, inventory active HTTP routes and classify them as: LAN-exposed discovery/read/status routes, LAN-exposed trusted-peer mutation routes such as typed launch requests, and local-only daemon/session controls.
- Keep existing RPC tags and wire schemas stable unless a test proves a name is purely internal. The rename should not gratuitously rename public product RPC concepts. Status/identity handlers that read `KORRI_SERVER_*` env must move with the daemon env decision in this unit, not later.
- Update package attrs, flake apps, NixOS module exports, checks, current docs, and TypeScript imports in the same slice.
- Leave historical docs/backlog references alone unless they are current operational instructions or tests.

**Patterns to follow:**
- `product/services/device/korri-server.ts` current dependency-injected service startup pattern.
- `product/services/server/package.nix` Bun service package pattern.
- `product/services/device/lan-stream-advertise.ts` federation advertisement behavior.

**Test scenarios:**
- Happy path: the packaged output exposes a `korrid` binary and no runtime package path expects `korri-server`.
- Happy path: Nix module eval under `services.korri.daemon.enable = true` emits a `korrid` user service contract and federation env with `KORRI_DAEMON_*` names.
- Error path: references to `services.korri.server` in active module eval fail rather than silently aliasing.
- Error path: active Nix modules have no remaining `services.korri.server.*` option references after the rename.
- Integration: service startup config still advertises federation capabilities and host identity using the renamed daemon env names.
- Integration: mDNS TXT records expose only intended identity/name/port/capability fields and no internal paths, socket addresses, or runtime details.
- Integration: TypeScript daemon config parsing accepts the renamed env names and preserves current default federation posture.
- Integration: Nix module checks prove wildcard federation binding is rejected unless paired with explicit trusted-interface/firewall policy.
- Integration: route inventory tests prove daemon/session-control routes are not mounted on the LAN federation router; LAN mutation routes are limited to documented trusted-peer typed commands.

**Verification:**
- Runtime code, Nix modules, tests, package names, and current docs no longer depend on active `korri-server` naming.
- Federation behavior remains equivalent except for the daemon/package/unit names.

---

### U3. greetd appliance session and `systemd --user` service graph

**Goal:** Move Korri-owned long-lived services into the `korri` user session and group them under `korri-session.target`.

**Requirements:** R1, R3, R4, R10

**Dependencies:** U1, U2

**Files:**
- Modify: `product/systems/nixos/modules/korri-compositor.nix`
- Modify: `product/systems/nixos/modules/korri-daemon.nix`
- Modify: `product/systems/nixos/modules/korri-sessiond.nix`
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Modify: `product/systems/nixos/images/common.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/images/headless.nix`
- Modify: `product/systems/nixos/images/live-usb-runtime.nix`
- Test: `tools/testing/nix/korri-runtime-module-check.nix`
- Test: `tools/testing/nix/korri-compositor-module-check.nix`
- Test: `tools/testing/nix/korri-sessiond-module-check.nix`
- Test: `tools/testing/nix/korri-input-module-check.nix`
- Test: `tools/testing/nix/korri-source-machine-image-check.nix`
- Test: `tools/testing/nix/korri-live-usb-config-check.nix`

**Approach:**
- Configure greetd auto-login as `korri` for every appliance profile.
- Use a greetd session wrapper that creates a real Wayland/logind session, activates the `korri` user service graph, and keeps the appliance session anchored to the compositor or minimal idle compositor. Do not rely on root DBus or `dbus-run-session` as a separate private bus unless implementation proves the user bus cannot serve the target.
- Add a user-level `korri-session.target` as the product runtime anchor. By default, this target starts from the greetd-created session path, not from pre-session lingering. If a device later requires `users.users.korri.linger = true`, the target wiring must prevent duplicate pre-seat startup and emit a Nix warning or assertion for unsafe combinations.
- Convert `korrid`, `korri-sessiond`, `korri-inputd`, and `korri-compositor` to `systemd.user.services` running as `korri`.
- Kiosk profiles start the UI compositor/session; source-machine and headless profiles start a minimal idle compositor session so sessiond and Sunshine/foreground lifecycle still have a normal session substrate.
- Ensure user services use user-context runtime paths (`%t` only in user units) and avoid numeric `/run/user/<uid>` in product contracts.
- Do not copy system-service hardening blindly. For user services, omit `ProtectHome=true` when the service needs `/home/korri`, set `MemoryDenyWriteExecute = false` for Bun-backed services, keep `NoNewPrivileges`/`PrivateTmp` where compatible, and explicitly allow needed `/home/korri`, `/var/lib/korri`, `/run/korri`, and XDG runtime paths.
- Any new persistent log path introduced by the migration must use append semantics so restart loops do not erase diagnostics.
- Retire split service users such as `korri-server`/`korri-source` from Korri-owned long-lived units; third-party substrate units may keep their own identities.

**Patterns to follow:**
- `product/systems/nixos/images/live-usb-runtime.nix` greetd auto-login shape, adjusted for the new user-service model.
- `product/systems/nixos/images/source-machine.nix` idle compositor semantics, consolidated to `korri`.
- systemd user target conventions around `graphical-session.target` and `graphical-session-pre.target`.

**Test scenarios:**
- Happy path: appliance image eval shows greetd initial/default session user is `korri`.
- Happy path: `korrid`, `korri-sessiond`, `korri-inputd`, and compositor are emitted as user services wanted by `korri-session.target`, not implicit-root system services.
- Happy path: source-machine and headless image eval includes a minimal idle compositor session under `korri`.
- Edge case: user-service path settings use XDG/user-manager context and never expand `%t` inside root/system units.
- Edge case: enabling `korri` linger alongside greetd cannot start `korri-session.target` before the graphical/login session; unsafe combinations warn or fail evaluation.
- Error path: checks fail if any Korri-owned long-lived daemon is emitted as a system service without an explicit documented substrate/helper reason.
- Integration: the renderer/session environment still includes the Wayland, XDG, display, and user bus information needed by Electrobun and GTK-derived dependencies.
- Integration: user-service hardening allows intended writes to `/home/korri`, `/var/lib/korri`, and `/run/korri` without making the full filesystem writable.

**Verification:**
- Pure Nix checks prove the service graph has moved to the `korri` user manager and the session target anchors all Korri-owned runtime daemons.
- Existing sessiond and Electrobun tests still pass after env-path derivation changes.

---

### U4. Unix-socket sessiond IPC

**Goal:** Replace root-created sessiond tokens and loopback HTTP delegation with same-user Unix-socket IPC between `korrid` and `korri-sessiond`.

**Requirements:** R8, R10, R11

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `product/services/device/sessiond.ts`
- Modify: `product/platform/library/session-launcher.ts`
- Modify: `product/platform/library/launcher-layer-live.ts`
- Modify: `product/platform/library/sessiond-managed-launch-client.ts`
- Modify: `product/apps/portal/api/library/local-foreground-launch-adapter.ts`
- Modify: `product/apps/portal/api/server/status.rpc-handler.ts`
- Modify: `product/services/device/sessiond-electrobun.ts`
- Modify: `product/services/device/game-stream-runner.ts`
- Modify: `product/services/device/sessiond-smoke.ts`
- Modify: `product/systems/nixos/modules/korri-sessiond.nix`
- Modify: `product/systems/nixos/modules/korri-daemon.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Test: `product/services/device/sessiond.test.ts`
- Test: `product/services/device/sessiond-electrobun.test.ts`
- Test: `product/platform/library/sessiond-managed-launch-client.test.ts`
- Test: `product/apps/portal/api/server/status.rpc-handler.test.ts`
- Test: `tools/testing/nix/korri-game-stream-module-check.nix`
- Test: `product/platform/library/session-launcher.test.ts`
- Test: `product/services/device/game-stream-runner.test.ts`
- Test: `tools/testing/nix/korri-sessiond-module-check.nix`
- Test: `tools/testing/nix/korri-daemon-module-check.nix`

**Approach:**
- Bind the sessiond control surface to `$XDG_RUNTIME_DIR/korri/sessiond.sock` or the configured runtime socket path. The socket parent directory is owned by `korri` and mode `0700`; sessiond refuses to start if the parent permissions do not preserve same-user trust.
- Prefer HTTP-over-Unix-socket to preserve existing route semantics and managed-launch protocol concepts while changing the transport and trust boundary. Verify Bun/Hono client support for HTTP-over-Unix-socket at the start of this unit; if the pinned Bun cannot do it, use the smallest local Unix-socket client shim that preserves the route contract.
- Update `korri-game-stream.nix` sessiond env forwarding: replace `KORRI_SESSIOND_URL` and `KORRI_SESSIOND_TOKEN_FILE` emission to game-stream runners with the configured socket path option (`KORRI_SESSIOND_SOCKET` or equivalent); this keeps the module's runner delegation working after the token endpoint is removed.
- Update Electrobun/session renderer env forwarding so children receive `KORRI_SESSIOND_SOCKET` instead of URL/token env; otherwise the renderer loses its sessiond connection after the token surface is deleted.
- Update managed-launch clients, live launcher layering, smoke tools, and foreground launch adapters that currently treat `KORRI_SESSIOND_URL` as the availability guard so they use socket availability and the Unix-socket fetch/client path instead of silently falling back to shell launching.
- Remove the long-term need for `korri-sessiond-token.service`, `KORRI_SESSIOND_TOKEN_FILE`, `KORRI_SESSIOND_TOKEN`, and `KORRI_SESSIOND_URL` in the same-user appliance path.
- Update `korrid` delegation to use `KORRI_SESSIOND_SOCKET` or the runtime-derived default. Add a Nix assertion that prevents `KORRI_SESSIOND_SOCKET` from coexisting with removed `KORRI_SESSIOND_URL`/token env in the daemon environment.
- Keep `korri-sessiond` local/private; it must not expose a LAN TCP port.
- Preserve startup semantics currently provided by `/control/start`: define a socket-based start/control handshake and make duplicate start requests idempotent or explicitly rejected so renderer double-spawn regressions do not return. A start oneshot may retry only for socket readiness; long Electrobun `enterHome` latency belongs inside sessiond handling rather than in repeated boot-script requests.
- Split socket runtime from launch artifact runtime. Socket paths live under `$XDG_RUNTIME_DIR/korri`; launch artifacts that must survive compositor/session restarts live under `/run/korri/launch-artifacts`, prepared by setup/tmpfiles as `korri:korri` with private permissions. Artifact destinations are server-derived only, must resolve under `/run/korri/launch-artifacts`, reject absolute/traversal inputs, and refuse symlink traversal before writing.
- Remove `/storage/bin` from Electrobun PATH sanitation in this unit so sessiond-spawned renderers no longer carry the old substrate path while IPC/env wiring is being updated.
- Keep launch event streaming semantics equivalent over the new transport where practical; do not invent a new protocol unless implementation proves HTTP-over-socket is not viable.

**Patterns to follow:**
- Current `product/services/device/sessiond.ts` route/authorization boundary, minus token auth on same-user socket.
- Current `product/platform/library/session-launcher.ts` environment-derived launcher creation pattern.
- Current `korri-sessiond-token` tests for ACL contracts, translated into socket path/ownership assertions.

**Test scenarios:**
- Happy path: `korri-sessiond` starts with a Unix socket path and handles the existing control/managed-launch routes over that socket.
- Happy path: socket directory permissions enforce same-user trust (`korri` owner, private parent directory) and are asserted by Nix/module tests.
- Happy path: `korrid`/session launcher prefers `KORRI_SESSIOND_SOCKET` and delegates a managed launch through the socket.
- Edge case: if the socket is missing during sessiond restart, the client reports a bounded retryable connection failure rather than falling back to local shell launch.
- Error path: token env vars are absent and token files are not required for a valid appliance config.
- Error path: attempts to configure a TCP sessiond URL for the appliance path fail Nix checks.
- Error path: eval fails if both socket and old URL/token sessiond delegation env are present.
- Integration: `/control/start` replacement does not spawn duplicate renderers when a prior start is already in progress.
- Integration: launch artifacts are written under `/run/korri/launch-artifacts`, remain private to `korri`, and reject absolute paths, `..` traversal, and symlink escapes.
- Integration: status redaction covers Unix-socket POSIX errors such as missing/refused `/run/user/<numeric-uid>/korri/sessiond.sock` paths before those errors can reach the LAN status response.

**Verification:**
- Sessiond and launcher tests prove the Unix-socket path works and old token delegation is gone from active runtime contracts.
- Nix checks prove socket paths are under the user runtime directory and sessiond is not LAN-exposed.

---

### U5. Non-root inputd permissions and local renderer bridge

**Goal:** Run `korri-inputd` as a `korri` user service while preserving renderer input behavior and modeling privileged actions explicitly.

**Requirements:** R1, R9, R10

**Dependencies:** U1, U3

**Files:**
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Modify: `product/systems/nixos/modules/korri-runtime.nix`
- Modify: `product/systems/nixos/modules/korri-setup.nix`
- Modify: `product/services/device/inputd.ts`
- Modify: `product/services/device/inputd-actions.ts`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Test: `product/services/device/inputd.test.ts`
- Test: `product/services/device/inputd-actions.test.ts`
- Test: `tools/testing/nix/korri-input-module-check.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Move inputd to a `systemd --user` service under `korri-session.target`.
- Ensure `korri` has the groups and udev/uaccess setup required for normalized input and `/dev/uinput` access; the runtime module owns the baseline `input`, `render`, `seat`, and `video` group membership unless a platform narrows it deliberately.
- Start inputd only after the real greetd/logind session gives `korri` seat/uaccess permissions; do not depend on pre-session lingering for input devices.
- Bind inputd's renderer-facing WebSocket to loopback (`127.0.0.1`) by default and keep the renderer URL env explicit. Appliance profiles reject non-loopback inputd binding unless a future explicit remote-debug escape hatch is added with a warning.
- Keep bare power/lid/raw volume policy substrate-owned where possible.
- For privileged product actions that truly remain Korri-owned, use a narrow mediated helper/systemd/logind/polkit seam; do not keep inputd root. This unit must audit each inputd shortcut action and classify it as unprivileged, substrate-owned, or helper-mediated before enabling it in the rootless service.
- Preserve the InputPlumber normalized-controller invariant and do not regress to raw gamepad fallback as a shortcut around permissions.

**Patterns to follow:**
- Current InputPlumber provider branch in `product/systems/nixos/modules/korri-input.nix`.
- Current `product/services/device/inputd.ts` dependency-injected test pattern.
- SM8550 platform comments around substrate ownership of bare power/lid/volume behavior in `product/systems/nixos/images/platforms/rocknix-sm8550.nix`.

**Test scenarios:**
- Happy path: Nix eval emits `korri-inputd` as a `korri` user service with loopback-only WebSocket env.
- Happy path: inputd still publishes normalized input/action frames to renderer clients over WebSocket.
- Edge case: if InputPlumber's normalized virtual gamepad is missing and the provider declares it required, inputd reports the existing unavailable diagnostic rather than opening raw physical gamepads.
- Error path: a privileged action without a configured helper logs a skipped/failed action without crashing inputd.
- Error path: Nix checks fail if inputd is emitted as an implicit-root system service.
- Error path: Nix checks fail if an appliance config binds inputd WebSocket to a non-loopback hostname.
- Integration: RockNIX platform checks prove bare hardware policies remain substrate-owned while Korri product shortcuts remain wired.

**Verification:**
- Inputd tests pass with non-root assumptions and local-only WebSocket defaults.
- Nix checks prove the user/group/udev model is emitted and no root inputd unit remains.

---

### U6. Platform adapter purge: root, `/storage`, and `/run/user/0`

**Goal:** Remove root-shaped Korri runtime assumptions from platform adapters, including current RockNIX-targeted guest adapters, while keeping substrate rootfulness below the line.

**Requirements:** R1, R2, R3, R10

**Dependencies:** U1, U2, U3, U5

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `product/systems/nixos/images/platforms/x86.nix`
- Modify: `product/systems/nixos/images/live-usb-runtime.nix`
- Modify: `local.env.example`
- Modify: `tools/scripts/gamescope-control-bandai-acceptance.ts`
- Modify: `tools/scripts/live-runtime-resolution-gate.sh`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Test: `tools/testing/nix/korri-live-usb-config-check.nix`
- Test: `tools/scripts/gamescope-control-bandai-acceptance.test.ts`

**Approach:**
- Replace platform-level `user = "root"`, `home = "/storage"`, `runtimeDir = "/run/user/0"`, root DBus addresses, root linger, and `USER = "root"` with the shared `services.korri.runtime`/greetd/session model.
- Update local examples and active scripts to use `korri`/normal runtime paths or parameterized runtime discovery instead of root examples where they describe Korri guest runtime.
- Do not require RockNIX/nix-on-rocks itself to stop using root internally. The boundary is that Korri guest/runtime config no longer consumes root-shaped substrate session paths.
- Keep guest deployment workflow distinctions intact: changes still land in the NixOS guest, not the minimal RockNIX host.

**Patterns to follow:**
- `product/systems/nixos/images/platforms/x86.nix` group/default wiring, adjusted to the shared `korri` user.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` for deploy/validation boundary language.
- `tools/testing/nix/korri-module-identity-audit-check.nix` style for forbidding identity/path drift.

**Test scenarios:**
- Happy path: SM8550 and RK3566 config checks show Korri compositor/session/user services run as `korri` with `/home/korri`, `/var/lib/korri`, and user-runtime sockets.
- Error path: checks fail if `/storage`, `/run/user/0`, `users.users.root.linger`, or `USER=root` appear in Korri-owned runtime service env/options.
- Integration: active acceptance scripts derive runtime socket/session details from configuration or explicit parameters rather than hard-coded root paths.

**Verification:**
- Platform config checks prove all Korri guest adapters comply with the clean runtime identity.
- Current examples no longer teach root as the Korri guest runtime path.

---

### U7. Current documentation, operator notes, and verification gates

**Goal:** Update current operational docs and checks so the new architecture is discoverable and guarded without rewriting historical evidence.

**Requirements:** R2, R5, R7, R10, R11

**Dependencies:** U1, U2, U3, U4, U5, U6

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/deployment/korri-nixos-modules.md`
- Modify: `docs/deployment/korri-images.md`
- Modify: `docs/device-flake-run.md`
- Modify: `product/systems/nixos/flake/checks.nix`
- Modify: `tools/testing/nix/korri-module-identity-audit-check.nix`
- Modify: `tools/testing/nix/korri-image-outputs-check.nix`
- Test: `product/apps/portal/api/server/status.rpc-handler.test.ts`
- Test: `tools/testing/nix/korri-module-identity-audit-check.nix`
- Test: `tools/testing/nix/korri-image-outputs-check.nix`

**Approach:**
- Document the clean runtime contract in current deployment/module docs: `korri` user, `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, user services, greetd, `korri-session.target`, and `korrid`.
- Mark root as setup/helper/substrate-only in current docs.
- Update identity audit checks to fail on active root/storage/run-user-0 regressions in Korri-owned runtime code and Nix modules.
- Recheck SEC-003 path redaction for the new canonical paths before leaving the unauthenticated LAN status surface unchanged.
- Update flake checks to include the renamed daemon module check and rootless appliance config checks.
- Preserve historical docs/backlog as history. Only update old docs if they are current operator instructions likely to be copied.
- Add operational validation notes for local Unix sockets, LAN federation, inputd loopback WebSocket, and guest-vs-host RockNIX deploy validation.

**Patterns to follow:**
- Existing deployment docs in `docs/deployment/`.
- Existing identity audit check in `tools/testing/nix/korri-module-identity-audit-check.nix`.
- Existing flake check aggregation in `product/systems/nixos/flake/checks.nix`.

**Test scenarios:**
- Happy path: identity audit passes for active Korri Nix modules and scripts after clean-break paths are applied.
- Error path: fixture checks fail on root runtime user, `/storage`, `/run/user/0`, or active `korri-server` runtime naming in current code paths.
- Integration: flake checks reference renamed `korrid`/daemon checks and no longer reference removed `korri-server` module checks.
- Integration: status redaction tests cover `/home/korri`, `/var/lib/korri`, `/run/korri/launch-artifacts/<name>`, and `/run/user/<numeric-uid>/korri/sessiond.sock` path-shaped substrings.
- Documentation: current deployment docs describe `korrid` and `services.korri.daemon` without instructing users to run Korri guest runtime as root.

**Verification:**
- Current docs and automated checks agree on the new architecture.
- Historical docs may still contain old terms, but active operator paths and generated/eval checks do not.

---

## System-Wide Impact

- **Interaction graph:** root setup and greetd become prerequisites for every Korri appliance runtime; user services replace system services for `korrid`, `korri-sessiond`, `korri-inputd`, and compositor/session; `korrid` delegates to `korri-sessiond` over a Unix socket; renderer still connects to inputd over loopback WebSocket.
- **Error propagation:** setup failures should fail before session startup unless task-083 later defines an explicit ephemeral/degraded path; sessiond socket failures should surface as bounded launch-delegation errors, not local shell fallback; input permission failures should surface as inputd diagnostics rather than raw fallback.
- **State lifecycle risks:** `$XDG_RUNTIME_DIR` is session-scoped and should hold sockets; cross-session ephemeral launch artifacts should use a setup/tmpfiles-managed `/run/korri` path if they must survive compositor/session restarts; persistent truth belongs under `/var/lib/korri` or XDG home paths. Launch artifact writes originate from trusted-LAN `korrid` routes and must stay contained, private to `korri`, and path-validated.
- **API surface parity:** the daemon rename affects binary/unit/Nix/env/test names, but not product RPC wire concepts unless explicitly called out; local session IPC changes transport, not managed-launch semantics. The plan requires a route inventory that separates LAN discovery/read/status routes, LAN trusted-peer mutation routes, and local/socket-only controls.
- **Integration coverage:** pure TypeScript tests are insufficient; Nix module checks must prove unit shape, user identity, env paths, target wiring, and absence of root-shaped regressions.
- **Unchanged invariants:** InputPlumber remains the normalized input provider path; federation remains trusted-LAN/no-auth v1; historical docs remain historical; generated files remain read-only.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| greetd/user-service sequencing starts services before logind seat/uaccess exists | Use real greetd auto-login for every appliance; order seat/input-dependent user services after the graphical session boundary; verify with Nix checks and physical smoke. |
| `%t` or `/run/user/<uid>` paths drift between system and user managers | Use `%t` only in user units, avoid numeric runtime paths in public contracts, and add Nix checks for root/system unit path misuse. |
| Removing token HTTP breaks launch delegation or startup handshake | Use HTTP-over-Unix-socket to preserve route semantics; add idempotent start handling and targeted session launcher tests. |
| RockNIX platform boot currently depends on root bus/session assumptions | Treat those assumptions as Korri guest adapter bugs; migrate adapters to the same `korri`/greetd/user-service contract while leaving substrate root internals below the line. |
| `korrid` running as `korri` is network-visible and can write shared state | Keep trusted-LAN posture explicit, inventory route exposure, preserve schema/path containment, keep launch artifacts private and server-derived under `/run/korri/launch-artifacts`, avoid arbitrary file APIs, and rely on typed commands plus systemd hardening rather than extra Unix users. |
| Inputd loses device access when non-root | Grant input/uinput access through groups/uaccess/root setup, start after session establishment, and use narrow helpers for privileged actions. |
| Large clean break causes search/rename misses | Require Nix identity-audit checks, TypeScript tests, and targeted grep/check fixtures for active `korri-server`, `/storage`, `/run/user/0`, and implicit-root regressions. |
| Persistence behavior remains unresolved | Keep task-083 deferred but do not hide persistence behind `/storage`; design setup so the later policy can choose fail vs ephemeral without changing runtime paths. |
| greetd starts with partial setup | Make greetd require the completed `korri-setup.service` boundary so failed setup blocks the session instead of producing a half-rootless appliance. |
| inputd privileged actions creep into hidden root helpers | Audit every shortcut action and require a declared substrate/logind/polkit/helper mechanism before enabling privileged behavior. |

---

## Documentation / Operational Notes

- Current deployment docs should say: Korri runtime runs as `korri`; `korrid` is the federated daemon; root only runs setup/substrate helpers.
- Operator examples should prefer guest-visible `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, and XDG runtime socket paths.
- RockNIX validation docs should distinguish host/substrate rootfulness from Korri NixOS guest runtime identity.
- Device smoke validation should check: `id korri`, greetd session, `korri-session.target`, `korrid` LAN advert, `korri-sessiond` socket, inputd loopback URL, Wayland socket, user bus, and absence of active `/storage`/`/run/user/0` Korri runtime env.
- Current docs should state the expected `korrid` LAN advertisement fields and the trusted-LAN/no-auth boundary.
- Historical documents can continue to mention `korri-server` and root-shaped old evidence; current operator paths should not.

---

## Sources & References

- Backlog slice: `backlog/task-085 - introduce-korri-runtime-identity-and-guest-path-contract.md`
- Backlog slice: `backlog/task-086 - move-korri-appliance-lifecycle-to-greetd-and-user-services.md`
- Backlog slice: `backlog/task-087 - rename-korri-server-to-korrid-cleanly.md`
- Backlog slice: `backlog/task-088 - replace-sessiond-token-http-with-unix-socket-ipc.md`
- Backlog slice: `backlog/task-089 - model-korri-root-setup-as-one-narrow-oneshot-service.md`
- Backlog slice: `backlog/task-090 - constrain-inputd-permissions-without-running-as-root.md`
- Deferred follow-up: `backlog/task-083 - decide-korri-appliance-persistence-failure-policy.md`
- Deferred follow-up: `backlog/task-084 - design-library-scanning-for-var-lib-korri-content-games.md`
- Related code: `product/systems/nixos/modules/korri-compositor.nix`
- Related code: `product/systems/nixos/modules/korri-server.nix`
- Related code: `product/systems/nixos/modules/korri-sessiond.nix`
- Related code: `product/systems/nixos/modules/korri-input.nix`
- Related code: `product/systems/nixos/images/live-usb-runtime.nix`
- Related code: `product/systems/nixos/images/source-machine.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Institutional learning: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- Institutional learning: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- Institutional learning: `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
