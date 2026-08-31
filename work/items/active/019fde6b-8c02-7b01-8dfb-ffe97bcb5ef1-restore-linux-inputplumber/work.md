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
- `sunshine-korri` is now a first-class ten-patch package with exact source, patch, Sunshine, FFmpeg ABI, installed-provenance, and full-build checks. Live settings use an explicit Nix option and exact `SUNSHINE_LIVE_SETTINGS_MVP=1` gate.
- The Android Moonlight client implements the custom `0x5504`/`0x5505` protocol and exact-launch bitrate, FPS, and resolution controls with native epoch checks, host-applied completion, bounded repair, and teardown-safe publication.
- The device gate now requires the exact running `sunshine-korri` executable, independently approved patch-set digest, protected private-tree digest, and unchanged Sunshine provenance after the HITL restart.
- Patch `0015` is shipped and checked but remains inert. The legacy input-seat receiver, launch sidecar/token authority, and virtual-seat backend remain separate work under the explicit legacy-equivalence decision.
- `nix run .#inputd-check` and `nix run .#android-apk` pass at Korri commit `378658a786f4c6712c814d1005aece2ac5501803`.
- Mountainous branch `unified` is clean at `9219f02`. It imports only `nixosModules.korri-linux-host` and pins the exact local Korri revision above. Nothing is pushed and no PR exists.
- The current candidate is `/nix/store/9dygll4cg26dsd5gsya1vxj8v40yn0gx-nixos-system-zao-26.05.20260313.c06b4ae`. Its gate digest is `7d82dc2b5be1126b418c478e57391cfc9765e5e11e49c68957e8cca3a5bcab25`. It is rooted on Zao at `/nix/var/nix/gcroots/korri-candidate-unified-9219f02`.
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

## Resume checkpoint

1. Verify the Korri worktree is clean at `378658a786f4c6712c814d1005aece2ac5501803` plus the final documentation commit. Verify Mountainous is clean at `9219f02` and still pins that exact local Korri revision.
2. Verify Zao current and default generations equal the rollback generation. Verify the marker is absent, the lease is inactive, and active `korri-game-*.service` count is zero.
3. Keep the controller in USB port `3-4`. Verify identity `0003:045e:0b12:0501`, `ID_SERIAL=Microsoft_Controller_3039373138353136313636313332`, and `ID_PATH=pci-0000:00:14.0-usb-0:4:1.0`.
4. Use candidate `/nix/store/9dygll4cg26dsd5gsya1vxj8v40yn0gx-nixos-system-zao-26.05.20260313.c06b4ae`. Generate and use the confirmation token printed by the fresh preflight; do not reuse the old v25 token.
5. Create a new ledger after v25. Start with `zao-20260830-inputplumber-unified-v26` or a later unused suffix.
6. Do not overlap physical `ask_user` prompts. Wait for each answer before posting the next prompt. For hotplug, use one prompt: unplug, wait 15 seconds, reconnect to port `3-4`.
7. Run the full temporary candidate gate. The first four stages have prior evidence but tokens must bind the new nonce. At `direct-action-isolation`, trigger Guide plus RB, verify `action-isolation=verified`, wait for timeout, then verify `action-cleanup=verified`.
8. Install the current debug APK on `usu`. Complete `sunshine-video-controller-recovery`, including live bitrate, FPS, resolution downshift/restore, disabled/unsupported outcomes, pairing preservation, and post-restart executable provenance. Then complete `catalog-and-session`.
9. After `candidate-green`, decide whether to keep the current repeated-HITL policy or implement the separate backlog item that reduces repeated stages. Do not silently weaken the gate.
10. If the current policy remains, run `inject-health-failure`, explicit `rollback`, reboot and `rollback-reboot-verify`, `persistent-switch` with all seven HITL stages, reboot, then `candidate-reboot-verify` with all seven stages.
11. Publish the local Korri revision only after explicit push approval. Replace the final `git+file` consumer pin with an exact portable Git revision before completion.

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
- [ ] Repository-wide verification and review
