---
id: 01M1M90CMWX4YK3X924CZ18S4Q
slug: replace-moonlight-pairing-with-korrid-provisioned-certificat
title: Replace Moonlight pairing with korrid-provisioned certificates
origin: parked
status: Complete
priority: high
labels:
  - streaming
  - security
  - moonlight
  - sunshine
  - korrid
  - rpc
created: 2026-09-03
source: user
context:
  branch: main
  commit: 6c6001ab
  repo: korri
  invoked_by: user
---

# Replace Moonlight pairing with korrid-provisioned certificates

## Why it matters

Streaming from a Korri host requires the manual Moonlight PIN ceremony even though both devices run korrid and already exchange catalog and session RPCs. Pairing must become invisible: a Korri client that can reach a Korri host streams on first use, with no pairing UI. For alpha, reachability equals trust — the owner accepts this because nothing ships past alpha without the identity layer (possibly Nostr). That future layer replaces only korrid's decision to provision; the plumbing built here does not change again.

## Acceptance Criteria

- [x] A Korri client that has never paired with a host starts a stream on first attempt with zero pairing UI.
- [x] The GameStream pairing exchange (PIN generation, salted challenge dance, pairing HTTP endpoints) is never invoked in the streaming path — removed, not automated.
- [x] Moonlight-to-Sunshine TLS still authenticates with per-client certificates, and the input AES key (rikey) still travels only inside paired-cert HTTPS.
- [x] Pairing UX and pair state are removed from the Android app: doPair, doOTPPair, doUnpair, PIN dialogs, pair-state polling, and pairing menus in PcView/KorriShellActivity.
- [x] The host korrid can remove a provisioned client certificate (a minimal revocation path is acceptable).
- [x] All touched gates pass: nix run .#korrid-check (regenerates contracts), Android checks, and Sunshine patch checks if a patch is added.

## Related

- `clients/android/app/src/main/java/com/limelight/nvstream/http/NvHTTP.java`
- `clients/android/app/src/main/java/com/limelight/nvstream/http/PairingManager.java`
- `clients/android/app/src/main/java/com/limelight/binding/crypto/AndroidCryptoProvider.java`
- `clients/android/app/src/main/java/com/limelight/PcView.java`
- `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java`
- `clients/android/app/src/main/jni/moonlight-core/moonlight-common-c/src/Limelight.h`
- `services/korrid/src/lib.rs`
- `services/sunshine/approved-patches.nix`
- `plugins/moonlight/plugin.ts`
- `work/items/parking-lot/01KZFGY0Z4FM1CBRZ2BBEC57V3-authenticate-mutating-linux-host-rpc-requests.md`

## Notes

Binding decisions from the shaping conversation (2026-09-03):

1. The automation lives in korrid on both devices. The Moonlight core and Sunshine stay near-stock; korrid is already the authority in the launch path (it signs Moonlight launch instructions).
2. Keep the certificate transport. Verified evidence: the input AES key is sent inside the HTTPS launch request (clients/android/app/src/main/java/com/limelight/nvstream/http/NvHTTP.java:814, `&rikey=`), and that channel is authenticated by the paired certificates (moonlight-common-c src/Limelight.h:101, `remoteInputAesKey`). Removing the certificate layer would let any LAN peer read or forge input to the host. Do not strip TLS or client-cert auth.
3. Delete the pairing exchange instead of automating it. The client korrid obtains the client certificate (the existing producer is AndroidCryptoProvider on the client — reuse its keypair and certificate, do not invent new storage), sends it to the host korrid over the native tagged /rpc wire, and the host korrid installs it into Sunshine's trusted-client store and returns Sunshine's server certificate. The client arrives already paired.
4. Alpha trust model: any device that can reach the host korrid may obtain provisioning. This widens the surface tracked in parking-lot item 01KZFGY0Z4FM1CBRZ2BBEC57V3 (authenticate mutating Linux host RPC requests); that item becomes part of the auth-layer work rather than optional hardening.
5. When the identity layer lands (maybe Nostr), it changes only korrid's provisioning decision ("is this device authorized to my owner?"). Nothing below it moves.

Open questions the builder must settle from real code, not invention:
- Host install mechanism: Sunshine state file plus reload, a local endpoint, or a small approved patch. Read Sunshine's state handling first. Any Sunshine change goes through services/sunshine/approved-patches.nix with digest updates and the existing patch checks.
- How korrid on Android reaches the client certificate: the shell embeds korrid as a cdylib, so either the shell hands the certificate in or korrid reads the AndroidCryptoProvider files. Decide from the real code.
- Whether "paired" state in ComputerDetails/ComputerManagerService can collapse to "korrid holds material for this host" without breaking Artemis internals.

Schema guard (AGENTS.md): do not invent persisted schema. Ground on Sunshine's existing state format and AndroidCryptoProvider's existing certificate storage. New wire types are Rust + typeshare; contracts/generated is read-only and regenerates via nix run .#korrid-check. Peer korrids speak the native tagged /rpc wire only.

Do not push, publish, or activate a device without approval. Physical acceptance on Bandai/Zao is a separate instruction.
