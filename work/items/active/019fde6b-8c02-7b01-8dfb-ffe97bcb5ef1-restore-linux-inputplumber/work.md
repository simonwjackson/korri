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

- Portable development, the pinned InputPlumber 0.75.2 package, Rust inputd, exact local session control, immutable bundles, NixOS modules, and RetroArch normalization are complete.
- `sunshine-korri` is now a first-class eleven-patch package with exact source, patch, Sunshine, FFmpeg ABI, installed-provenance, and full-build checks. Live settings use an explicit Nix option and exact `SUNSHINE_LIVE_SETTINGS_MVP=1` gate.
- The Android Moonlight client implements the custom `0x5504`/`0x5505` protocol and exact-launch bitrate, FPS, and resolution controls with native epoch checks, host-applied completion, bounded repair, and teardown-safe publication.
- The device gate now accepts the immutable versioned Nix-store executable reported through `/proc/PID/exe`, resolves the exact unit-declared `sunshine-korri` `bin/sunshine` symlink, requires exact same-package target equality, verifies the independently approved patch-set digest and protected private-tree digest, and rechecks unchanged Sunshine provenance after the HITL restart.
- The private-tree proof uses the shipped `korri-sunshine-state-digest` Rust helper. It traverses through directory descriptors, rejects links, special nodes, unsafe hard links, ownership or mode errors, empty required files, and metadata/content races, then reopens canonical home, `.config`, and `sunshine` entries and requires exact device and inode identity before it emits one combined digest. Every private-tree file remains fully hashed. The host starts Sunshine with the immutable `log_path=/dev/null` override, so volatile file logging cannot mutate the protected tree while stdout remains available to journald. This intentionally makes Sunshine's web log viewer empty; `journalctl -u sunshine` is the operator log source. Baseline, post-HITL, persistent, and reboot gates bind the digest.
- The shipped `korri-ledger-proof` helper captures one exact ledger device-and-inode identity and requires it for state, baseline, and accepted-proof reads and writes. State uses atomic replace. Proofs require current-user mode-`0600` regular single-link files, unique `O_EXCL` temporary files, file/directory fsync, and exact rebinds. Retained baselines must name the requested rollback and match all live rollback predicates before mutation. An already committed accepted digest is resumable only when its content is exact.
- Runtime package attestation now verifies the exact base Sunshine version and source hash, reviewed FFmpeg commit/source, libavcodec ABI, NVENC API, and the ordered eleven-record patch manifest before it recomputes the aggregate digest.
- Capability queries now remain on Sunshine's serialized control thread. One pending 100 ms settling record coalesces floods to the newest request, and session removal drops it without any timer thread or cross-thread ENet access. Android replacement owners reuse only quiescent final snapshots and poll pending mutation or reconciliation work.
- Host evaluation binds Sunshine to the exact approved final derivation and output. An `overrideAttrs` derivative that preserves trusted metadata but removes patches fails evaluation.
- Patch `0015` is shipped and checked but remains inert. The legacy input-seat receiver, launch sidecar/token authority, and virtual-seat backend remain separate work under the explicit legacy-equivalence decision.
- The exact final debug APK is installed on Bandai with SHA-256 `dd794fc2c4a402953ae84655b69adf1a61cb4077291e38b59080c6117e097ab2`. Android all-files access allows the reviewed `/storage/emulated/0/korri/upstreams.json`, and the Korrid-owned Zao route is visible.
- Read-only Zao inspection after v29 found the rollback generation current/default, the exact controller on USB `3-4`, no marker, an inactive lease, zero game units, and every candidate service inactive.
- The full inputd check-in-shell suite, Android JVM/APK/native checks, portal/Shift checks, Sunshine package/protocol checks, Zao consumer check, and final runtime review pass at Korri commit `f44c8f361f0ab75a480f6beb6fe24ede15762dca`.
- Final review found no remaining findings in the accepted streaming patch set. Physical streaming acceptance is complete for the exercised paths; the broader U7 controller, rollback, persistence, and reboot journey remains incomplete.
- Mountainous branch `unified` has the isolated Korri host lock committed at `fdbc8b655f525b44d3d1b2fd3e70806588eba08e`. The unrelated `features/disk-array/nixos.nix` modification remains untouched and unstaged. Zao still imports only `nixosModules.korri-linux-host`. Nothing is pushed and no PR exists.
- The current candidate is `/nix/store/2mw5qb8dlwhxqz4sgav89wsw8izf5i0w-nixos-system-zao-26.05.20260313.c06b4ae`. Its gate helper SHA-256 is `907b94f7d7a52683453679397c93666a6c9f288116ad813777f9a7cab54fa1b9`, and it is rooted at `/nix/var/nix/gcroots/korri-candidate-unified-fdbc8b6`.
- The rollback generation remains `/nix/store/ac46r72fh00p9g81z5hv45pw8zdsbpy4-nixos-system-zao-26.05.20260313.c06b4ae`.
- Zao is at the exact rollback baseline. The controller is connected to USB port `3-4`. No Korri game unit is active. The attempt marker is absent and the attempt lease is inactive.
- `user@1000` remains PID `363588`, invocation `31dfefc905ea49fd8ec0b05a4a0e53fd`. No rollout test restarted it.
- The selected InputPlumber composite now persists one normalized target across physical disconnect and reconnect. Inputd reports `Missing`, then `Ready`, without restarting InputPlumber or inputd.
- A bounded second controller fixture produces two normalized targets and `Ambiguous` health. Inputd suppresses actions, clears held state, then stops the empty non-authoritative composite after fixture removal. Health returns to `Ready` with one target.
- The rollback predicate now canonicalizes a redundant POSIX ACL mask when no named ACL entry exists. Candidate v24 proved that physical reconnect and rollback reconcile without manual ACL repair.
- The validation-only `workspace-next` action now uses an immutable blocking C fixture. Inputd must contain it, expose it for isolation inspection, then kill it through the 10-second action timeout. Repository and NixOS checks pass, but physical candidate proof remains outstanding.
- Candidate v23 and v24 passed normalized gameplay, hotplug and ambiguity, authenticated DBus under an exclusive grab, spoof rejection, exact hold-to-stop, stale-stop rejection, child-exit recovery, and korrid/InputPlumber restart races.
- Candidate v24 exposed that coreutils `sleep 5` exited before direct-action inspection. Commit `de99db20b1a5bfe36d859096d1ce2e3f83e84d62` replaces it with the deterministic fixture.
- Candidate v25 was paused by the user during `health-recovery-ambiguity`. The exact validation session and stale monitor were stopped. A guarded restore returned Zao to the rollback generation. Official reconcile passed. The archived ledger is `~/.local/state/korri-device-gate/.archive/zao-20260830-inputplumber-unified-v25-reconciled-user-pause`.
- Candidate v26 passed automated gates and reached `normalized-gameplay` before the validation process was stopped. Guarded cleanup stopped the stale attempt holder and restored the exact current/default rollback generation with every candidate service inactive, no active game unit, no attempt marker, and no active lease. Read-only comparison found every non-private rollback predicate equal to the baseline; the only pre-pairing mismatch came from normal writes to the baseline-hashed `sunshine.log`.
- Bandai completed Sunshine pairing after rollback. The protected Sunshine state gained exactly one authorized device, and Artemis removed Zao's lock icon after a clean isolated Sunshine restart. Running the approved binary with the immutable `log_path=/dev/null` override left the complete protected-tree digest unchanged before, during, and after that restart.
- V26 is archived as inspected and intentionally superseded at `~/.local/state/korri-device-gate/.archive/zao-20260830-inputplumber-unified-v26-inspected-superseded-log-proof-and-bandai-pairing`. It must never be retried. A fresh candidate and ledger are required after rebuilding with the log override.
- V28 physically proved Intel iHD H.264 VAAPI, FPS mutation/restore, resolution mutation/restore, async capture reinitialization, touch remapping, lifecycle reset, and a 20-cycle teardown soak. It also exposed two real defects: Intel's low-power entrypoint was CQP-only so bitrate failed, and root-owned rollback cleanup could not query the exact-peer Korrid control socket after a completed host session.
- Commits `deec4a7d` and `f44c8f36` fix those defects without weakening the control socket or adding a reconnect fallback. The final package queries actual VAAPI rate-control support, advertises bitrate only from the active mutable session, clears and republishes support across replacement/teardown, and enforces its advertised bounds.
- V29 physically passed same-session bitrate apply/restore with measured bandwidth reduction/recovery, 60→30→60 FPS with Bandai's performance overlay, 1280×720→854×480→1280×720 resolution, post-replacement bitrate apply, Android-injected touch mapping, a final 20-cycle normal/VBR soak, disabled-gate and unsupported-encoder publication, Sunshine restart, private-state preservation, and automatic rollback after a completed Korrid-owned session. Evidence is in `docs/acceptance/sunshine-korri-physical-runtime-settings-2026-09-01.md`.
- V29 cleanup reported `rollback=true`; current and default generations are the exact rollback, candidate services are inactive, the marker and lease are absent, and the ledger reconciled to baseline. Bandai's captured accessibility, codec, and performance-overlay preferences were restored. The restricted-settings app-op ended at `default`; no pre-test baseline for that app-op was captured.
- The eleven-patch NVENC candidate adds H.264 live bitrate/FPS/resolution and restore support, exact FFmpeg/NVENC layout proof, one-attempt-per-500-ms limiting, failed/slow-call session withdrawal, and reset-before-publication across every successful encoder creation/replacement path. Android/keyboard range gestures now use exact opaque source/gesture release identities, and Artemis's legacy Activity-exit chord is removed. The authoritative Sunshine, Linux-host, inputd, portal, Shift, and Android automated gates pass for patch `0016` SHA-256 `ba767c4b8d853001ead6af7af44dbc9503d24cf22aa257d29635be3b62a7feb2` and ordered digest `46e32d78438aed4f8b2a4572f26bee158182afcaa6257b01cd0345b9de396901`. Zao NVENC deployment and physical acceptance remain pending.

## Resume checkpoint

1. Verify the Korri worktree is clean at `f44c8f361f0ab75a480f6beb6fe24ede15762dca` plus the physical-evidence documentation commit. Verify Mountainous branch `unified` is at `fdbc8b655f525b44d3d1b2fd3e70806588eba08e` and still has only the unrelated `features/disk-array/nixos.nix` modification.
2. Verify Zao current and default generations equal `/nix/store/ac46r72fh00p9g81z5hv45pw8zdsbpy4-nixos-system-zao-26.05.20260313.c06b4ae`. Verify the marker is absent, the lease is inactive, and active `korri-game-*.service` count is zero.
3. Candidate `/nix/store/2mw5qb8dlwhxqz4sgav89wsw8izf5i0w-nixos-system-zao-26.05.20260313.c06b4ae` is rooted at `/nix/var/nix/gcroots/korri-candidate-unified-fdbc8b6`. Its confirmation is `CONFIRM-e23f920ecfded24a`, gate helper SHA-256 is `907b94f7d7a52683453679397c93666a6c9f288116ad813777f9a7cab54fa1b9`, and reconciled ledger is `~/.local/state/korri-device-gate/zao-20260901-inputplumber-unified-v29`.
4. Keep the controller in USB port `3-4`. The streaming-focused run did not claim `normalized-gameplay` or any later controller/session HITL token.
5. Complete the seven temporary candidate HITL stages with fresh nonce-bound tokens. Do not substitute the streaming report for normalized controller, health, DBus, exact-stop, direct-action, or catalog/session proof.
6. After `candidate-green`, run automatic health-failure rollback, explicit rollback, rollback reboot verification, persistent switch, persistent HITL, candidate reboot, and rebooted HITL under the existing policy.
7. Audio remains outside the accepted streaming patch set: preserve the observed PulseAudio access/read-only-symlink evidence and design its host-session fix separately.
8. Publish the local Korri revision only after explicit push approval. Replace the final `git+file` consumer pin with an exact portable Git revision before completion.

## Execution decisions

- Active games survive korrid crashes, upgrades, and restarts. Korrid reattaches only when one persisted launch ID and one systemd scope match exactly. Ambiguity preserves all game scopes and blocks new launches and stop requests until an operator resolves it; recovery never kills an active game.
- The protected AF_UNIX listener uses the existing native tagged RPC treaty. `expectedLaunchId` is generated for Rust and TypeScript, but host status and stop remain rejected on the LAN listener.
- Inputd starts root-configured action argv directly without a shell. Action children receive a minimal environment, closed control descriptors, bounded runtime/output/concurrency, no control-socket group, and no inherited capabilities. Inputd is non-dumpable so a child cannot extract its authority.
- Runtime health remains a platform-neutral Rust state. The Linux adapter publishes fixed state values through `sd_notify`; the device gate combines systemd `ActiveState` with the status value.
- Zao's consuming NixOS configuration and a real supported controller are available prerequisites for persistent rollout and reboot verification.

## Execution tracker

- [x] U1: Portable Rust input core
- [x] U2: Korri InputPlumber package and profile composition
- [x] U3: Linux evdev and authenticated DBus runtime
- [x] U4: Direct action dispatch and recoverable exact session control
- [x] U5: NixOS modules, service isolation, and project checks
- [x] U6: Linux RetroArch normalized-input policy
- [ ] U7: Reversible Zao rollout, rollback, and reboot proof
- [x] Repository-wide verification and review
