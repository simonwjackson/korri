# sunshine-korri automated restoration evidence

Date: 2026-08-31

This record contains automated evidence only. It is not physical VAAPI, controller, pairing, rollback, or reboot acceptance.

## Source identity

- Korri branch: `feat/restore-linux-inputplumber`
- Korri revision: `69251d9d6d990ae6d599676940ca7c7a28e5a0d5`
- Mountainous branch: `unified`
- Mountainous revision: `92e2501`
- Zao candidate: `/nix/store/gky6svmyycxji6vxqig1z3v4cy4z3d6x-nixos-system-zao-26.05.20260313.c06b4ae`
- Candidate gate SHA-256: `d7bf1678c4ce8eff3e0641106a804f5984b2ca1fae862385ff27befe6fbd04b7`
- Candidate Sunshine: `/nix/store/iaxhcnwzc9hqrdiangphcdrg64zyfhdg-sunshine-korri-2025.924.154138-korri/bin/sunshine`
- Approved patch-set SHA-256: `30121b5d935b435482814b2c2801c6c3c456bc42c6019123f77018cb0294a62a`

Mountainous imports only `nixosModules.korri-linux-host` for Zao and provides host identity and network values. The `korri-input-host` lock remains a local exact `git+file` revision. It is not the final portable publication pin.

## Automated results

The following checks passed on the recorded source:

- `nix run .#inputd-check`
- `nix run .#android-apk`
- `nix build --no-link .#checks.x86_64-linux.zao-korri-consumer`
- `nix build --no-link .#nixosConfigurations.zao.config.system.build.toplevel`
- the focused Android JVM, native runtime-settings, korrid, portal, Shift, Sunshine package, Sunshine protocol, and APK checks recorded by commit `01992fb7`
- device-gate shell tests for stock Sunshine rejection, running-executable replacement, duplicate/reordered/wrong patch records, wrong base and FFmpeg ABI provenance, unsafe or absent baselines, post-HITL private-tree replacement, and cross-reboot private-state loss

The candidate is copied to Zao and rooted at `/nix/var/nix/gcroots/korri-candidate-unified-92e2501`. Read-only verification found the rollback generation still current and default, no attempt marker, an inactive lease, and zero live `korri-game-*.service` units.

The current debug APK was built and installed on `usu` through its live adb mDNS identity. The device check reached the installed application, but its catalog smoke stopped because Android denied `/storage/emulated/0/korri/upstreams.json`. No permission was changed automatically. This requires the final device interaction before the Sunshine journey can run.

## Preserved boundaries

- The running Sunshine executable must equal the exact immutable executable in `sunshine.service`.
- Installed provenance must be root-owned, mode `0444`, and match the independently approved ten-patch digest.
- The protected Sunshine tree is represented only by one combined digest. A shipped Rust helper traverses from canonical directory descriptors with `O_NOFOLLOW`, rejects unsafe types, links, owners, modes, empty required files, and traversal races, and reads file content only through validated descriptors. File names, contents, per-file hashes, certificates, PIN data, pairing records, application definitions, and settings are not logged.
- Baseline creation and every mutation require an exact present pairing predicate and a valid private-tree digest. Persistent acceptance stores the private digest in the mode-`0600` ledger, and reboot verification compares it before HITL.
- Acceptance rechecks Sunshine executable and patch provenance after the physical Sunshine restart.
- Live settings remain gated only by `services.korriLinuxHost.sunshine.runtimeSettings.enable`, which controls `SUNSHINE_LIVE_SETTINGS_MVP=1`.
- Patch `0015` is shipped and source-checked but remains inert because the full legacy input-seat receiver, launch sidecar producer, token authority, and virtual-seat backend are separate work. No incomplete receiver is enabled.

## Pending physical evidence

The final device stage must still prove:

- Android storage access is restored for the installed debug client, then the client on `usu` connects with the custom `0x5504`/`0x5505` protocol;
- live bitrate and FPS apply and restore without reconnect;
- same-ratio resolution downshift and restore work with fresh video and input mapping;
- disabled and unsupported outcomes fail closed;
- controller input, hotplug, ambiguity handling, exact stop, direct-action isolation, catalog/session recovery, and Sunshine restart work;
- pairing and the complete private Sunshine tree survive rollback, reboot, persistent installation, and candidate reboot;
- the rollback and candidate generations pass the required repeated seven-stage HITL policy.
