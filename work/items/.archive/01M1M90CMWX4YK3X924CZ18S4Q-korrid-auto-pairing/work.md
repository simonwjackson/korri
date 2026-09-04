# Work Log

Implementation started from local main at `6c6001ab` and was rebased onto the current local main before integration.

## 2026-09-03

- Added Sunshine host UUID attestation and private certificate provision/revoke control.
- Added native korrid routing through configured native peers only.
- Added first-use Android certificate provisioning, app refresh, and stream-start repair.
- Removed the Korri pairing entry, settings action, JavaScript bridge method, PIN/OTP actions, unpair action, and click-to-pair behavior.
- Deleted the legacy GameStream pairing manager, `/pair` and `/unpair` calls, PIN/challenge exchange, public paired state, and `NotPaired` result.
- Kept certificate-authenticated TLS, exact Sunshine server pinning, HTTPS launch, encrypted `rikey` transport, and protocol pair-status attestation.
- Hardened Android provisioning with bounded retries, close/commit fencing, lock-order fixes, nonblocking app discovery, cache generation checks, and launch reservation ownership.
- Fixed retry-burst exhaustion so a cooldown wakes the portal and permits a fresh bounded attempt cycle.
- Corrected korrid client peer verification for the root-owned systemd socket listener. Sunshine still verifies the accepted korrid UID/GID before parsing requests.
- Kept the Android private key inside `AndroidCryptoProvider`. Only the public client certificate crosses JNI.
- Kept korrid outside Sunshine's private state, private key, and gameplay home.
- Preserved the existing Sunshine `root.named_devices` state schema and Android `ServerCert` storage.
- Did not deploy, activate a device, reboot, push, publish, or run physical acceptance.

## Commits after final rebase

- `40f570b3 feat(sunshine): add private certificate control`
- `c0bd620e feat(korrid): broker moonlight certificates`
- `0b270bc1 feat(nixos): isolate certificate control socket`
- `160a3524 fix(moonlight): finish runtime settings lock cutover`
- `c00b02bc feat(moonlight): remove manual pairing ceremony`
- `c4be3cc3 fix(moonlight): harden automatic provisioning lifecycle`
- `7a4a6646 refactor(moonlight): delete manual pairing protocol`
- `9c492b0e fix(moonlight): repair trust retries and socket peer checks`

## Verification

- `nix run .#android-jvm-check`: passed, including retry exhaustion, queue saturation, close fencing, lock-order, slow-network, provisioning, launch, TLS-preservation, and pairing-removal tests.
- `nix build .#checks.x86_64-linux.korri-linux-host-module --no-link`: passed.
- `nix run .#korrid-check`: passed before rebase.
- `nix run .#korrid-check`: passed again after rebase onto current local main.
- `nix run .#inputd-check`: passed after rebase, including the Sunshine patch and Linux host/NixOS checks.
- `nix run .#shift-check`: 55 tests passed and TypeScript passed.
- `git diff --check`: passed.
- Generated korrid contracts were regenerated only through the repository gate.
- Final review found two P1 issues: the systemd listener peer identity and permanent retry exhaustion. Both were fixed in `9c492b0e`; focused tests and the full post-rebase gates passed afterward.
- `se_read_residuals`: no unresolved findings.

## Sunshine provenance

- Patch `0020` SHA-256: `5ab5b2b5a464c4839f18aa1fc0f304b42b5b8c941fbc4ad5605b34eeaff525e0`.
- Ordered Sunshine patch-set digest: `e330647511163d07c252901908e7c29c435b36459246201162be58bb2eb007d5`.

## Release boundary

This alpha implementation deliberately treats reachable configured korrid peers as trusted. It must not ship beyond alpha until the authentication layer binds the host UUID, selected peer endpoint, and returned Sunshine server certificate.
