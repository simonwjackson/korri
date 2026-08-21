---
id: 019fde6b-8c02-7b01-8dfb-ffe97bcb5ef1
title: Restore Linux InputPlumber and Rust inputd
status: active
created: 2026-08-07
source: direct
---

# Restore Linux InputPlumber and Rust inputd

Restore Korri's Linux normalized-input boundary using a pinned upstream InputPlumber package, Korri-owned profile composition, and a new Rust input-policy daemon. Portable development is now the default: `korri-dev` runs without host mutation, and an explicit physical flag reads only an existing validated normalized target. The optional hardened host layer selects one immutable service bundle and performs service-scoped rollback without a full NixOS activation. Zao remains the final physical and persistence gate, used only after explicit device availability and maintenance approval. The browser input bridge, Android backend integration, Xvfb pointer repair, and Sunshine input seats remain separate work.

## Current status

- Portable `korri-dev` starts isolated korrid and inputd processes. Physical input and actions are off by default.
- `--physical` reads only the validated normalized InputPlumber target. Actions stay off.
- `korri-bundle` contains exact korrid, inputd, InputPlumber, and profile store paths.
- The optional `nixosModules.korri-bundle` host adapter initializes GC-rooted active and previous selectors.
- Rust launch and selection helpers reject mutable components or data, use no shell, restart only InputPlumber, inputd, and korrid, and restore the previous selector after failed health.
- Local Rust, package, NixOS module, dev-runner, and repository korrid checks pass.
- Device work is pending. It requires one online device and a maintenance window only for the first stable host-layer activation. Later bundle tests do not need a NixOS activation.

## Execution decisions

- Active games survive korrid crashes, upgrades, and restarts. Korrid reattaches only when one persisted launch ID and one systemd scope match exactly. Ambiguity preserves all game scopes and blocks new launches and stop requests until an operator resolves it; recovery never kills an active game.
- The protected AF_UNIX listener uses the existing native tagged RPC treaty. `expectedLaunchId` is generated for Rust and TypeScript, but host status and stop remain rejected on the LAN listener.
- Inputd starts root-configured action argv directly without a shell. Action children receive a minimal environment, closed control descriptors, bounded runtime/output/concurrency, no control-socket group, and no inherited capabilities. Inputd is non-dumpable so a child cannot extract its authority.
- Runtime health remains a platform-neutral Rust state. The Linux adapter publishes fixed state values through `sd_notify`; the device gate combines systemd `ActiveState` with the status value.
- Zao's consuming NixOS configuration and a real supported controller are available prerequisites for persistent rollout and reboot verification.

## Execution tracker

- [ ] U1: Portable Rust input core
- [ ] U2: Korri InputPlumber package and profile composition
- [ ] U3: Linux evdev and authenticated DBus runtime
- [ ] U4: Direct action dispatch and recoverable exact session control
- [ ] U5: NixOS modules, service isolation, and project checks
- [ ] U6: Linux RetroArch normalized-input policy
- [ ] U7: Reversible Zao rollout, rollback, and reboot proof
- [ ] Repository-wide verification and review
