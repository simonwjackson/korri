# sunshine-korri automated restoration evidence

Date: 2026-08-31

This record contains automated evidence only. It is not physical VAAPI, controller, pairing, rollback, or reboot acceptance.

## Source identity

- Korri branch: `feat/restore-linux-inputplumber`
- Korri revision: `378658a786f4c6712c814d1005aece2ac5501803`
- Mountainous branch: `unified`
- Mountainous revision: `9219f02`
- Zao candidate: `/nix/store/9dygll4cg26dsd5gsya1vxj8v40yn0gx-nixos-system-zao-26.05.20260313.c06b4ae`
- Candidate gate SHA-256: `7d82dc2b5be1126b418c478e57391cfc9765e5e11e49c68957e8cca3a5bcab25`
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
- device-gate shell tests for stock Sunshine rejection, running-executable replacement, wrong patch provenance, private-tree failure, and post-HITL Sunshine replacement

The candidate is copied to Zao and rooted at `/nix/var/nix/gcroots/korri-candidate-unified-9219f02`. Read-only verification found the rollback generation still current and default, no attempt marker, an inactive lease, and zero live `korri-game-*.service` units.

## Preserved boundaries

- The running Sunshine executable must equal the exact immutable executable in `sunshine.service`.
- Installed provenance must be root-owned, mode `0444`, and match the independently approved ten-patch digest.
- The protected Sunshine tree is represented only by one combined digest. File names, contents, per-file hashes, certificates, PIN data, pairing records, application definitions, and settings are not logged.
- Acceptance rechecks Sunshine executable and patch provenance after the physical Sunshine restart.
- Live settings remain gated only by `services.korriLinuxHost.sunshine.runtimeSettings.enable`, which controls `SUNSHINE_LIVE_SETTINGS_MVP=1`.
- Patch `0015` is shipped and source-checked but remains inert because the full legacy input-seat receiver, launch sidecar producer, token authority, and virtual-seat backend are separate work. No incomplete receiver is enabled.

## Pending physical evidence

The final device stage must still prove:

- the Android client on `usu` connects with the custom `0x5504`/`0x5505` protocol;
- live bitrate and FPS apply and restore without reconnect;
- same-ratio resolution downshift and restore work with fresh video and input mapping;
- disabled and unsupported outcomes fail closed;
- controller input, hotplug, ambiguity handling, exact stop, direct-action isolation, catalog/session recovery, and Sunshine restart work;
- pairing and the complete private Sunshine tree survive rollback, reboot, persistent installation, and candidate reboot;
- the rollback and candidate generations pass the required repeated seven-stage HITL policy.
