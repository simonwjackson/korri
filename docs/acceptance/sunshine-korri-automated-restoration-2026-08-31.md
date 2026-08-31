# sunshine-korri automated restoration evidence

Date: 2026-08-31

This record contains automated evidence only. It is not physical VAAPI, controller, pairing, rollback, or reboot acceptance.

## Source identity

- Korri branch: `feat/restore-linux-inputplumber`
- Korri revision: `6f34f1fddee0d5b0eb75e819ed218a4b694b566e`
- Mountainous branch: `unified`
- Mountainous revision: `e3f988e`
- Zao candidate: `/nix/store/2fbh1np1anck1y26b04v134rl0chk9m2-nixos-system-zao-26.05.20260313.c06b4ae`
- Candidate gate SHA-256: `02e35bea4b68d9aa044a935a8e8715adc9e3a3410e685e5515107ae4d427dfef`
- Candidate Sunshine declaration: `/nix/store/prhz4f9fapm7z7p2lhigzkvw8ai3s590-sunshine-korri-2025.924.154138-korri/bin/sunshine`
- Candidate Sunshine process target: `/nix/store/prhz4f9fapm7z7p2lhigzkvw8ai3s590-sunshine-korri-2025.924.154138-korri/bin/sunshine-2025.924.154138-korri`
- Approved patch-set SHA-256: `4b96bab218af1e4c7fa5961fbbd95592be9d8bdd234eedc77585b48371a24522`

Mountainous imports only `nixosModules.korri-linux-host` for Zao and provides host identity and network values. The `korri-input-host` lock remains a local exact `git+file` revision. It is not the final portable publication pin.

## Automated results

The following checks passed on the recorded source:

- `nix run .#inputd-check`
- `nix run .#android-apk`
- `nix build --no-link .#checks.x86_64-linux.zao-korri-consumer`
- `nix build --no-link .#nixosConfigurations.zao.config.system.build.toplevel`
- the focused Android JVM, native runtime-settings, korrid, portal, Shift, Sunshine package, Sunshine protocol, and APK checks recorded by commit `01992fb7`
- device-gate shell tests for stock Sunshine rejection, running-executable replacement, the shipped `bin/sunshine` symlink to its versioned process target, duplicate/reordered/wrong patch records, wrong base and FFmpeg ABI provenance, unsafe or absent baselines, descriptor-bound baseline and accepted-proof symlink/hard-link/mode rejection, post-HITL private-tree replacement, and cross-reboot private-state loss
- final review checks for descriptor-bound virtual-target ACL mutation, physical lookalike and replacement rejection, game-unit Sunshine private-state denial, ledger-bound automated evidence, `Ready` bundle health, exact host payload framing, serialized control-thread capability ACK coalescing and disconnect-before-due drop, quiescent-only repeated-owner snapshot reuse, and exact stream-ended mutation classification

The candidate is copied to Zao and rooted at `/nix/var/nix/gcroots/korri-candidate-unified-e3f988e`. The host module also rejects an `overrideAttrs` derivative that retains trusted passthru/provenance while removing the approved patches; only the exact approved final derivation and output are accepted. Read-only verification found the rollback generation still current and default, no attempt marker, an inactive lease, and zero live `korri-game-*.service` units.

The final debug APK builds successfully. An earlier compatible debug APK remains installed on `usu`, but the device was reported unavailable before this final build could be installed. Its prior catalog smoke stopped because Android denied `/storage/emulated/0/korri/upstreams.json`. No permission was changed automatically. Current APK installation and storage permission require the final device interaction before the Sunshine journey can run.

## Preserved boundaries

- The unit-declared Sunshine executable must be one exact path in the `sunshine-korri` package. The gate accepts the immutable canonical Nix-store process target reported through `/proc/PID/exe`, resolves the declared in-package `bin/sunshine` symlink, and requires exact target equality and same-package containment before provenance validation.
- Installed provenance must be root-owned, mode `0444`, and match the independently approved ten-patch digest.
- The protected Sunshine tree is represented only by one combined digest. A shipped Rust helper traverses from canonical directory descriptors with `O_NOFOLLOW`, rejects unsafe types, links, owners, modes, empty required files, and traversal races, reads file content only through validated descriptors, then reopens the canonical home, `.config`, and `sunshine` entries and compares exact device and inode identity before it emits the digest. File names, contents, per-file hashes, certificates, PIN data, pairing records, application definitions, and settings are not logged.
- Baseline creation and every mutation require an exact present pairing predicate and a valid private-tree digest. One captured ledger device-and-inode identity binds state, baseline, and accepted proof for the full gate session. The shipped ledger-proof helper uses no-follow descriptor-relative reads, atomic state replacement, unique `O_EXCL` temporary files, file and directory fsync, and exact post-commit rebinds. Retained baselines must still name the requested rollback and equal all current rollback predicates before mutation. Persistent acceptance stores the private digest as one mode-`0600`, single-link proof; an exact existing digest is an idempotent resume, while a different value fails closed.
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
