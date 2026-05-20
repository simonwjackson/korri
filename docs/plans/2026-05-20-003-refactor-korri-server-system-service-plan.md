---
title: Refactor Korri Server System Service
type: refactor
status: completed
date: 2026-05-20
origin: docs/brainstorms/2026-05-20-korri-headless-source-aware-server-requirements.md
verify_command: "just format && just lint && just typecheck && just test-unit && nix build .#korri-server --no-link && nix build .#korri-game-stream-runner --no-link && nix eval .#nixosModules.korri-server >/dev/null"
---

# Refactor Korri Server System Service

## Summary

Move `services.korri.server` from an always-user-service shape to an explicit service-mode model where headless stream hosts can run `korri-server` as a boot-scoped system service under a configured non-root user. The module should derive safe stream runtime paths from the selected mode, preserve the Sunshine-launched runner as session-scoped, and make `aka` consume the product-level defaults without repeating `/run/korri-game-stream` boilerplate.

---

## Problem Frame

The server/control-plane refactor made `korri-server` the intended always-on headless API, but the NixOS module still starts it as a systemd user service. That leaves `aka` vulnerable to “enabled but inactive” behavior when the user manager is already running, and it keeps `%t` path semantics tied to the user manager even though the control plane should be boot-scoped for a stream host.

---

## Requirements

- R1. `services.korri.server` must support a system-service mode that starts at boot under `multi-user.target` and runs as a configured non-root user.
- R2. Stream-host runtime paths must be mode-derived defaults, not required host boilerplate: system mode defaults to `/run/korri-game-stream`, and user mode keeps `%t/korri-game-stream` compatibility.
- R3. Server and Sunshine runner must share the same intent/status paths when `streamHost.enable = true`.
- R4. The launch-intent trust contract must remain fail-closed: private parent directory, non-root ownership, no group/world access, and `0600` intent file behavior.
- R5. Sunshine, Moonlight, and the `korri-game-stream-runner` remain separate/session-scoped; the server must not absorb their lifecycle or require Wayland/Sway session environment.
- R6. LAN exposure must remain explicit: loopback/control-disabled/firewall-closed defaults should not become LAN-open because the service is boot-scoped.
- R7. The module must reject unsafe service-mode/path combinations rather than silently writing intents where the runner cannot see or trust them.
- R8. Existing user-service deployments must have a compatibility path and clear migration behavior.
- R9. `aka` should migrate to the new system-service interface with minimal host-specific Korri wiring.
- R10. Verification must prove evaluated NixOS module output, not only TypeScript behavior.

**Origin actors:** A1 Player/operator, A2 Source-aware Korri client, A4 Headless Korri host, A5 Stream runtime
**Origin flows:** F1 Browse local and remote games, F3 Stream a remote game, F4 Handle unavailable sources
**Origin acceptance examples:** AE3 remote RPC prepare, AE4 partial availability

---

## Scope Boundaries

- Strong pairing/authentication remains out of scope; this plan preserves trusted-LAN opt-in defaults and does not add auth.
- Managing Sunshine as a system service is out of scope. Sunshine remains the NixOS-provided systemd user service.
- Managing user lingering automatically is out of scope. Operators may choose lingering separately if they want Sunshine available before login.
- Changing the Effect RPC contract is out of scope except for any diagnostics needed to keep status truthful.
- Replacing the launch-intent file contract with a socket, database, queue, or daemon protocol is out of scope.
- Making `korri-server` run as root or as a dynamic user for stream-host mode is out of scope.

### Deferred to Follow-Up Work

- Add pairing/token authorization before exposing system-mode servers beyond trusted LAN/VPN.
- Add dynamic mDNS capability suppression if runtime stream readiness should affect advertised TXT records.
- Add first-class operational runbooks after the `aka` migration is validated on hardware.

---

## Context & Research

### Relevant Code and Patterns

- `nix/modules/korri-server.nix` currently defines `systemd.user.services.korri-server`, defaulting stream paths to `%t/korri-game-stream/*` and wiring `services.korri.gameStream` when `streamHost.enable = true`.
- `nix/modules/korri-game-stream.nix` defines the Sunshine app wrapper. It refuses root, uses `XDG_RUNTIME_DIR/korri-game-stream` by default, and can consume explicit intent/status paths from the server module.
- `tools/device/game-stream-launch-intent.ts` enforces the trusted file contract for launch intents. This makes shared UID and private runtime-directory ownership load-bearing.
- `tools/device/game-stream-state.ts` and `tools/device/game-stream-runner.ts` write/read runner status and should keep working with explicit absolute status paths.
- `nix/modules/korri-inputd.nix` is the closest Korri module example of a system service under `systemd.services`.
- The NixOS Sunshine module creates `systemd.user.services.sunshine`; the Korri server must not assume Sunshine has a system-service lifecycle.
- `tools/device/korri-server.ts` does not require Wayland/Sway runtime env and can run as a non-root system service as long as it can access the library and stream runtime files.

### Institutional Learnings

- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: keep one stable `Korri Stream` Sunshine app, write a fresh one-shot launch intent, and do not introduce arbitrary command listeners.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`: deployment must converge service definitions, running processes, runtime env, and smoke validation; systemd contexts do not inherit interactive shell/session env.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`: lifecycle ownership should be explicit; launcher paths should fail closed if the owner/supervisor contract is unavailable.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`: identify the real systemd owner before changing live services; inactive-looking units may not own active processes.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`: use real filesystem and module evaluation checks where feasible.

### External References

- No external research was needed. The work is primarily about applying local Korri/NixOS module patterns and known systemd ownership semantics.

---

## Key Technical Decisions

- Make `serviceMode` canonical and compatibility-preserving: `services.korri.server.serviceMode = "system" | "user"` is the public option name for this refactor. Default it to `"user"` initially to avoid surprising existing deployments; hosts such as `aka` opt into `"system"` explicitly.
- Default system mode to boot-scoped runtime paths: when `serviceMode = "system"`, derive `/run/korri-game-stream`, `/run/korri-game-stream/next-launch.json`, and `/run/korri-game-stream/status.json` unless the operator intentionally overrides the runtime directory.
- Keep user mode compatibility with `%t`: when `serviceMode = "user"`, continue to derive `%t/korri-game-stream`, `%t/korri-game-stream/next-launch.json`, and `%t/korri-game-stream/status.json`.
- Require a configured non-root user for system stream-host mode: the system service must run as the same Unix user expected to launch the Sunshine runner, because intent ownership checks rely on that shared user boundary.
- Derive or require the library root safely in system mode: `%h` must not silently resolve to root's home. Prefer deriving from the configured user's declared home when available; otherwise require an explicit absolute `library.root`.
- Decouple `/run/korri-game-stream` lifetime from the server process: use systemd tmpfiles or an equivalent root-owned setup mechanism for the private runtime directory so a server restart/stop does not remove files the session runner depends on.
- Keep LAN exposure opt-in: changing service scope does not change `host`, `openFirewall`, `advertise.enable`, or `streamControl.enable` defaults.
- Treat `aka` migration as downstream host policy: Korri owns product module behavior; Mountainous owns host-specific user, library root, LAN bind, and service switch.

---

## Open Questions

### Resolved During Planning

- Should `korri-server` absorb Sunshine or the runner lifecycle? No. The server is boot-scoped control plane; Sunshine and runner remain external/session-scoped.
- Should `/run/korri-game-stream` be required in host config? No. It should be the system-mode default, with overrides only for unusual deployments.
- Should prepare fail when Sunshine/session status is unknown? No for this refactor. Prepare may succeed when the intent write succeeds; status/diagnostics should remain truthful that runner/session readiness may be unknown.
- Should LAN/mDNS defaults change because the service is boot-scoped? No. Existing conservative defaults remain.

### Deferred to Implementation

- Exact warning/deprecation copy for user mode and `headlessSource`: implementation should keep it concise and actionable.
- Exact runtime-directory setup primitive: the plan prefers tmpfiles/setup-unit ownership over `RuntimeDirectory`, but implementation may choose an equivalent mechanism if it preserves runtime files across server restarts and keeps owner/mode guarantees testable.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  Mode{services.korri.server.serviceMode}
  Mode -->|system| Sys[systemd.services.korri-server]
  Mode -->|user| User[systemd.user.services.korri-server]

  Sys --> SysPaths[/run/korri-game-stream defaults]
  User --> UserPaths[%t/korri-game-stream defaults]

  SysPaths --> SharedIntent[next-launch.json]
  UserPaths --> SharedIntent
  SysPaths --> SharedStatus[status.json]
  UserPaths --> SharedStatus

  SharedIntent --> Runner[korri-game-stream-runner via Sunshine user service]
  Runner --> SharedStatus
  Server[korri-server control plane] --> SharedIntent
  Server --> SharedStatus
```

Decision matrix:

| Mode | Server unit | Default runtime dir | Path style allowed by default | Startup target |
|------|-------------|---------------------|-------------------------------|----------------|
| `system` | `systemd.services.korri-server` | `/run/korri-game-stream` | absolute paths under the effective runtime dir | `multi-user.target` |
| `user` | `systemd.user.services.korri-server` | `%t/korri-game-stream` | `%t/...` defaults; explicit absolute overrides only when they still satisfy ownership/path assertions | `default.target` |

---

## Implementation Units

### U1. Add service-mode options and derived runtime defaults

**Goal:** Make server lifecycle and runtime paths explicit in the NixOS module while keeping host config concise.

**Requirements:** R1, R2, R6, R7, R8

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-server.nix`
- Create/Test: `tools/testing/nix/korri-server-module-eval.test.ts`

**Approach:**
- Add canonical `services.korri.server.serviceMode` with `system` and `user` values. Default to `user` for compatibility in this refactor; downstream stream hosts opt into `system` explicitly.
- Add `user` and `group` options for system mode. Require a non-root user when system mode and stream hosting are enabled.
- Change `streamHost.runtimeDir`, `intentPath`, and `statusPath` defaults to derive from the selected mode instead of using fixed `%t` defaults.
- In system mode, derive `library.root` from the configured user's home when the host did not provide an explicit root; fail evaluation if the module cannot derive a safe non-root home.
- Preserve override capability for advanced hosts, but require all stream files to remain under the effective private runtime directory unless the module also owns that custom directory's mode/ownership.
- Ensure derived paths are used both in `korri-server` environment and in the `services.korri.gameStream` wiring.

**Patterns to follow:**
- `nix/modules/korri-server.nix`
- `nix/modules/korri-game-stream.nix`
- `nix/modules/korri-inputd.nix`

**Test scenarios:**
- Happy path: default evaluation preserves user mode and `%t/korri-game-stream` path defaults.
- Happy path: evaluating explicit system mode with `streamHost.enable = true` produces `/run/korri-game-stream`, `/run/korri-game-stream/next-launch.json`, and `/run/korri-game-stream/status.json` without host-supplied path overrides.
- Happy path: system mode without explicit `library.root` derives from the configured non-root user's declared home.
- Edge case: explicit path overrides under the effective runtime directory are reflected consistently in server environment and game-stream module wiring.
- Error path: invalid mode values fail Nix option evaluation.
- Error path: system mode without a derivable non-root home and without explicit `library.root` fails evaluation.
- Integration: generated `services.korri.gameStream.intentPath/statusPath` match the effective server intent/status paths.

**Verification:**
- Host configs no longer need to repeat `/run/korri-game-stream` paths for system-mode stream hosts.

---

### U2. Emit a boot-scoped systemd service for system mode

**Goal:** Start `korri-server` at boot as a non-root system service while preserving user-service compatibility mode.

**Requirements:** R1, R4, R5, R6, R8, R10

**Dependencies:** U1

**Files:**
- Modify: `nix/modules/korri-server.nix`
- Test: `tools/testing/nix/korri-server-module-eval.test.ts`

**Approach:**
- In system mode, emit `systemd.services.korri-server` with `wantedBy = [ "multi-user.target" ]` and run it as the configured non-root `User`/`Group`.
- Create the default `/run/korri-game-stream` directory through `systemd.tmpfiles.settings` or an equivalent setup unit with owner set to the configured user/group and mode `0700`.
- Do not rely on a non-root `ExecStartPre` to create top-level `/run` directories.
- Keep the server process environment equivalent to the current user-service environment, including server identity, library source/root, stream control, advertisement, and stream intent/status paths.
- In user mode, continue emitting `systemd.user.services.korri-server` so existing behavior can be selected intentionally.
- Add basic systemd hardening for the boot-scoped RPC process where compatible with Bun, library access, networking, and runtime writes.
- Avoid requiring Wayland/Sway/session env for the server service.

**Patterns to follow:**
- `nix/modules/korri-inputd.nix` for system service shape
- Current `systemd.user.services.korri-server` environment in `nix/modules/korri-server.nix`

**Test scenarios:**
- Happy path: system mode emits `systemd.services.korri-server` with `User`, `Group`, `Restart`, `ExecStart`, and boot target wiring.
- Happy path: system mode emits tmpfiles/setup configuration for `/run/korri-game-stream` owned by the configured user/group with mode `0700`.
- Happy path: system mode does not emit `systemd.user.services.korri-server`.
- Happy path: user mode emits `systemd.user.services.korri-server` and does not emit the system unit.
- Happy path: system service hardening includes no-new-privileges and no ambient capabilities unless implementation discovers a specific incompatibility that is documented.
- Error path: system mode with `user = "root"` fails evaluation.
- Integration: evaluated system configuration does not use unsafe non-root pre-start creation for top-level `/run` directories.

**Verification:**
- `korri-server` becomes boot-scoped in system mode and no longer depends on the user manager reaching `default.target`.

---

### U3. Add path-safety assertions and compatibility warnings

**Goal:** Fail early when service mode, user identity, and stream paths would break the launch-intent trust contract.

**Requirements:** R3, R4, R7, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `nix/modules/korri-server.nix`
- Modify: `nix/modules/korri-headless-source.nix`
- Test: `tools/testing/nix/korri-server-module-eval.test.ts`

**Approach:**
- Add module assertions for unsafe path/mode combinations. System mode should reject `%t/...` effective stream paths. User mode should keep `%t` defaults; explicit absolute overrides are allowed only when they remain under an explicitly managed private runtime directory.
- Assert that system stream-host mode uses a non-root configured user and that effective runtime paths are absolute.
- Assert that intent, status, and lock/runtime-derived files stay under the effective runtime directory unless a custom runtime directory is also managed with explicit owner/mode.
- Keep `host = "127.0.0.1"`, `openFirewall = false`, `advertise.enable = false`, and `streamControl.enable = false` defaults unchanged.
- Add a warning for boot-scoped system mode when `host` is non-loopback and `openFirewall = true` without `firewallInterfaces`, nudging operators toward explicit trusted-interface scoping.
- Add warnings or deprecation guidance for legacy `headlessSource` and user-service server mode where appropriate, without removing compatibility in this plan.
- Add an assertion or warning when `services.korri.headlessSource.enable` and `services.korri.server.enable` would bind the same host/port.
- Ensure assertions protect the common split-brain failure: server writes one path while Sunshine runner reads another.

**Patterns to follow:**
- NixOS `assertions`/`warnings` conventions
- `tools/device/game-stream-launch-intent.ts` trust requirements

**Test scenarios:**
- Error path: system mode with `%t/korri-game-stream/next-launch.json` fails evaluation with an actionable message.
- Error path: system stream-host mode with root user fails evaluation.
- Error path: system stream-host mode with relative runtime paths fails evaluation.
- Error path: mismatched stream file parents such as runtime dir under `/run/korri-game-stream` but status under `/tmp/status.json` fail evaluation unless a managed custom runtime dir is configured.
- Happy path: loopback/firewall/advertisement defaults remain conservative in both modes.
- Happy path: interface-scoped firewall configuration remains available and is preserved in system mode.
- Happy path: legacy user mode still evaluates for compatibility.
- Integration: enabling `services.korri.headlessSource` with `services.korri.server` on the same port triggers the planned assertion/warning behavior.

**Verification:**
- Unsafe deployments fail during Nix evaluation instead of producing a prepared-but-runner-cannot-see-intent runtime bug.

---

### U4. Preserve runner/session separation with explicit shared paths

**Goal:** Ensure the Sunshine-launched runner remains session-scoped while consuming the same absolute system-mode paths as the boot-scoped server.

**Requirements:** R3, R4, R5, R7

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `nix/modules/korri-game-stream.nix`
- Modify: `nix/modules/korri-server.nix`
- Test: `tools/testing/nix/korri-server-module-eval.test.ts`
- Test: `tools/device/game-stream-launch-intent.test.ts`
- Test: `tools/device/game-stream-runner.test.ts`

**Approach:**
- Keep the existing wrapper behavior for user-mode `%t` paths.
- Ensure explicit absolute intent/status paths pass through to the runner wrapper unchanged in system mode.
- Avoid adding server-owned session environment to the runner. The runner should still rely on Sunshine/session-provided Wayland/Sway env or the existing `sessionEnvFile` path.
- Confirm the runner still refuses root and still validates trusted launch-intent ownership/mode.
- If lock path remains runtime-dir-derived, ensure it follows the effective runtime dir so system-mode streams do not mix locks under `$XDG_RUNTIME_DIR` and intents under `/run/korri-game-stream`.

**Patterns to follow:**
- `nix/modules/korri-game-stream.nix` `shellPathExpression`
- `tools/device/game-stream-launch-intent.test.ts`
- `tools/device/game-stream-runner.test.ts`

**Test scenarios:**
- Happy path: system-mode server wiring generates a Sunshine app command whose intent/status env points at `/run/korri-game-stream/*`.
- Happy path: user-mode wiring still translates `%t/...` to `$XDG_RUNTIME_DIR/...` for the runner.
- Edge case: explicit absolute status path is used for both server status reads and runner writes.
- Error path: runner still rejects root execution and untrusted intent parent/file modes.
- Integration: a temp private runtime directory owned by the current user can still stage and claim an intent using the same absolute paths that system-mode wiring would provide.

**Verification:**
- The server can be boot-scoped without making the runner boot-scoped or weakening launch-intent trust checks.

---

### U5. Update `aka` to the system-mode server interface

**Goal:** Move the real stream host config to the product-level system-service interface and remove path/service boilerplate from the host file.

**Requirements:** R2, R3, R6, R9, R10

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify external repo `mountainous`: `flake.lock`
- Modify external repo `mountainous`: `hosts/aka/default.nix`

**Approach:**
- Update the Korri flake input in Mountainous after the Korri module changes land.
- Configure `services.korri.server.serviceMode = "system"`, `user = "simonwjackson"`, and `group = "users"` for `aka`.
- Keep host-specific policy in Mountainous: LAN bind, firewall, advertisement name, server id, library root, Sunshine settings, and runner display/session settings.
- Remove any `korri-server.service` user-service startup from the Sway startup script; it should no longer be needed for the control plane. Keep session startup focused on Sunshine/session-specific setup.
- During migration, explicitly stop and disable old user units (`korri-server.service`, `korri-api.service`, `korri-lan-stream-advertise.service`) before or as part of switching to the system unit so only one control-plane process binds port `3001` and advertises mDNS.

**Patterns to follow:**
- External repo `mountainous`: `hosts/aka/default.nix`
- Current Korri aggregate module export from `flake.nix`

**Test scenarios:**
- Test expectation: none in Korri unit tests -- this is downstream host configuration, validated through NixOS evaluation/build rather than Bun tests.
- Integration: evaluated `aka` config contains `systemd.services.korri-server`, not `systemd.user.services.korri-server`.
- Integration: evaluated `aka` `korri-server` environment uses `/run/korri-game-stream/*`, the configured library root, `serverId = aka`, and LAN opt-in values.
- Integration: evaluated Sunshine app still contains one `Korri Stream` entry and points to the Korri game stream runner wrapper.
- Operational: after switching `aka`, `systemctl status korri-server` shows active, `systemctl --user status sunshine` remains the Sunshine scope, and `korri play --host http://aka:3001` lists remote games.

**Verification:**
- `aka` no longer relies on user-manager startup to bring up the Korri control plane, while the Sunshine app and runner remain session-scoped.

---

## System-Wide Impact

- **Interaction graph:** NixOS module evaluation now decides whether `korri-server` is a system or user unit; the runner remains a Sunshine user-service app that shares explicit intent/status files.
- **Error propagation:** Unsafe path/user combinations should fail at Nix evaluation with actionable messages. Runtime client errors should remain LAN-safe and not expose private host paths.
- **State lifecycle risks:** `/run/korri-game-stream` is boot-scoped and may clear on reboot. Pending intent behavior across service restart must be explicit through systemd runtime-directory settings and launch-intent max-age handling.
- **API surface parity:** No RPC tags change in this plan. CLI and LAN clients should continue to talk to the same server RPC surface.
- **Integration coverage:** Nix module evaluation is required because TypeScript tests alone cannot prove systemd unit shape, runtime directory ownership declarations, or downstream `aka` wiring.
- **Unchanged invariants:** One stable Sunshine app (`Korri Stream`), known-game-only prepare, no arbitrary remote command listener, runner refuses root, and LAN exposure remains explicit.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Server and runner run as different Unix users, breaking private intent/status sharing | Require configured non-root user for system stream-host mode and document that it must match the Sunshine/session user. |
| `%t` resolves differently between system and user managers | Derive mode-specific defaults and assert against `%t` in system mode. |
| System-mode `%h` library root resolves to root's home | Derive the library root from the configured user's declared home or require explicit `library.root`. |
| Old user service remains active and conflicts with the new system service | Include migration guidance and downstream `aka` verification that only the system unit owns port `3001`. |
| Server advertises before Sunshine/session is usable | Keep advertisement opt-in and rely on server/status for live readiness rather than changing mDNS dynamically in this plan. |
| `/run` directory disappears when the server stops/restarts | Use tmpfiles/setup-unit ownership decoupled from the server process lifetime. |
| Boot-scoped LAN API has a larger availability window | Preserve closed defaults, warn on unscoped firewall exposure, and add conservative systemd hardening. |
| Changing defaults surprises existing user-service deployments | Default `serviceMode` to `user` for this refactor and require explicit system-mode opt-in for migrated hosts. |

---

## Documentation / Operational Notes

- Update module option descriptions so system mode, user mode, runtime paths, and user ownership are understandable from `nixos-option` output.
- Add release/migration notes in the plan or follow-up PR description explaining how to stop/disable old user services when switching an existing host.
- The frontmatter `verify_command` covers the Korri repo. U5 has a separate external validation in Mountainous because it targets a downstream repo.
- `aka` validation should distinguish system service and user service scopes:
  - `systemctl status korri-server`
  - `systemctl --user status sunshine`
  - `journalctl -u korri-server`
  - `journalctl --user -u sunshine`
- Operators should not assume system-mode `korri-server` means Sunshine/Moonlight are ready before login; status should remain the source of truth.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-20-korri-headless-source-aware-server-requirements.md](../brainstorms/2026-05-20-korri-headless-source-aware-server-requirements.md)
- Related plan: [docs/plans/2026-05-20-002-refactor-korri-server-control-plane-plan.md](2026-05-20-002-refactor-korri-server-control-plane-plan.md)
- Related code: `nix/modules/korri-server.nix`
- Related code: `nix/modules/korri-game-stream.nix`
- Related code: `tools/device/game-stream-launch-intent.ts`
- Related code: `tools/device/game-stream-runner.ts`
- Institutional learning: [docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md](../solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md)
- Institutional learning: [docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md](../solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md)
