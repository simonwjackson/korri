---
title: Replace Moonlight pairing with korrid-provisioned certificates
status: active
work_item: 01M1M90CMWX4YK3X924CZ18S4Q
branch: feat/korrid-auto-pairing
base: 6c6001ab
created: 2026-09-03
---

# Plan: Replace Moonlight pairing with korrid-provisioned certificates

## Objective

Make a first stream from a newly discovered Korri Sunshine device work without a PIN, pairing page, or other user ceremony.

Android supplies its existing public Moonlight client certificate to its embedded korrid. The embedded brain asks only the native peers already configured in its `UpstreamRegistry` which one owns the requested Artemis/Sunshine host UUID. It requires one exact attested match, then sends the certificate to that peer through the existing native tagged `/rpc` protocol. Host korrid asks Sunshine through a private local socket to re-attest the requested host UUID, trust that exact certificate, and return Sunshine's public server certificate. Android stores that certificate in the existing `ComputerDatabaseManager` record before any Moonlight HTTPS request.

Provisioning first runs when the portal requests apps for an online host. It persists the server pin, verifies protocol `PairStatus == PAIRED`, refreshes and caches the app list, and makes the host selectable. Stream start repeats the idempotent provisioning as repair.

The GameStream PIN and challenge exchange leaves the Korri runtime path. Certificate-authenticated TLS remains unchanged. The Android private key never leaves `AndroidCryptoProvider` storage. Future identity and authorization are outside this work.

## Binding decisions

1. **Korrid owns policy and orchestration.** Sunshine owns its current trusted-client state and live verifier. Android owns its existing Moonlight keypair and per-computer server pin.
2. **Use the existing native tagged `/rpc` wire.** Do not add another public listener, an Effect-RPC envelope, or a persisted peer map.
3. **Use configured native peers as the endpoint source.** Android supplies only the requested Sunshine host UUID and public client certificate. Embedded brain mode fans out attestation only across `UpstreamKind::Native` entries already held by `UpstreamRegistry`. It does not derive a korrid endpoint from an Artemis address, scan ports, or hard-code `39217` or `43117`.
4. **Require two host-UUID checks.** Brain mode selects one uniquely attested native peer. The selected host's Sunshine adapter rechecks the exact requested UUID during provision or revoke, before mutation or response. This rejects endpoint drift between selection and mutation.
5. **Patch Sunshine with a private Unix `SOCK_SEQPACKET` adapter supplied by systemd socket activation.** A root-owned `.socket` unit creates the pathname and passes the listening descriptor to Sunshine. Sunshine does not create, unlink, or replace the path. It validates the descriptor and exact `SO_PEERCRED`.
6. **Do not edit `sunshine_state.json` from korrid.** Sunshine serializes mutation of its own persisted state and live verifier. Korrid does not receive state-directory or private-key access.
7. **Keep TLS and client-certificate authentication.** `NvHTTP` sends `rikey` inside HTTPS. The certificate layer protects that key and the input channel.
8. **Provision at first app query and before every stream attempt.** `queryStreamApps` removes the first-use deadlock. Stream start repeats provision to repair lost Sunshine state or a changed server certificate.
9. **Keep protocol `PairStatus` as attestation.** Remove user-facing pairing state and ceremony, not Sunshine's proof that it accepted the provisioned certificate.
10. **Provisioning is durable trust.** A later launch failure does not revoke the client. Revocation removes trust by exact client-certificate identity and blocks later TLS connections. It need not terminate an existing stream.
11. **Alpha authorization and authenticity are deliberately weak.** Network reachability authorizes provisioning. Alpha also accepts active on-path substitution of unauthenticated korrid HTTP `/rpc` requests or responses. An attacker can impersonate a configured peer and cause Android to pin a different Sunshine certificate. TLS protects traffic only after this bootstrap. Do not claim intended-host or owner authenticity in alpha.
12. **Future auth must bind three values.** The later auth layer must cryptographically bind the requested Sunshine host UUID, the selected korrid peer endpoint, and the returned Sunshine server certificate. Do not invent that identity or persistence schema here.
13. **No device activation.** Automated tests and package builds are in scope. Bandai/Zao deployment and physical acceptance need separate approval.

## Existing schema grounding

- Android client material remains `client.crt` and `client.key`, produced by `AndroidCryptoProvider` under app-private files.
- The server pin remains `ComputerDatabaseManager.Computers.ServerCert` as DER bytes.
- Sunshine continues to persist existing `root.named_devices[]` records and its existing root UUID. No field is added.
- Native peer endpoints remain the existing `UpstreamHostConfig.base_url` values.
- New Rust wire types are generated with Typeshare. `contracts/generated/korrid.ts` is read-only.
- The local path is runtime-only systemd state, not a persisted Korri schema.

## Scope boundaries

### In scope

- Sunshine host UUID attestation.
- Live, idempotent trusted-client provision and exact revocation.
- Unique peer selection across configured native `UpstreamRegistry` entries.
- Host and brain korrid RPC behavior.
- Embedded Android korrid provisioning call.
- First app-query provisioning, app-list refresh/cache, and start-time repair.
- Removal of Korri pairing UI, public bridge pairing methods, PIN operations, and GameStream pairing calls.
- Root-owned systemd socket activation, peer credentials, game isolation, and approved Sunshine patch provenance.
- Automated integration, package, rollback, and repository gates.

### Out of scope

- User/device identity, Nostr, authorization tokens, account recovery, and trust synchronization.
- Claims that alpha bootstrap authenticates the intended owner or host.
- A public Sunshine API or direct Android-to-Sunshine provisioning protocol.
- Moving the Android private key into korrid or sending it over JNI/network.
- Replacing TLS or relaxing server-certificate or client-certificate checks.
- Immediate stream termination after revocation.
- Device deployment, persistent generation switch, or physical acceptance.

## Implementation units

### U1: Add Sunshine's activated trusted-client control adapter

**Goal**

Add an opt-in local adapter that attests the current Sunshine UUID and provisions or revokes exact public client certificates while reusing Sunshine's existing state and live verifier.

**Files**

- Create `services/sunshine/patches/0020-add-korrid-certificate-control.patch`.
- Create a focused certificate-control Nix check.
- Modify `services/sunshine/approved-patches.nix` and package/check composition.

**Approach**

1. Start with a failing compiled test through the real state mutation functions.
2. Add closed operations `attest`, `provision`, and `revoke`. Each request carries an expected Artemis/Sunshine host UUID. Compare it with Sunshine's current root UUID before mutation or server-certificate response.
3. Parse exactly one bounded PEM X.509 client certificate. Reject empty, NUL-containing, oversized, repeated-block, trailing-data, and malformed input.
4. Use one mutation lock shared by existing pair/unpair and the new adapter.
5. Build a full candidate transaction while holding the lock:
   - Retain the old serialized state document and old live verifier.
   - Construct the complete candidate document without changing current state.
   - Parse all candidate client certificates and build the complete candidate verifier before durable mutation.
   - Serialize the candidate document.
   - Write it to a same-directory temporary file, sync and close it, rename it over the configured state path, then sync the directory.
   - Install both in-memory candidate representations only with an infallible/noexcept swap.
6. Treat every failure after candidate rename as rollback. Keep the old live verifier active, atomically restore and sync the retained old document, and release the lock only after restoration succeeds. If restoration cannot complete, acknowledge no success and terminate Sunshine with a fatal state-integrity error before another authorization or mutation request is served.
7. Provision idempotently by the parsed certificate's SHA-256 fingerprint. Concurrent duplicate requests produce one current-schema named-device entry. Do not accept a friendly name or identity field from the caller.
8. Revoke every exact matching certificate fingerprint. Repeated revoke succeeds with `removed=false`. Other records remain unchanged.
9. Return only Sunshine's current public server certificate PEM after successful attestation and mutation. Never return or log its private key or state body.
10. Consume one named systemd-activated descriptor. Validate `LISTEN_PID`, exact descriptor count/name, `AF_UNIX`, `SOCK_SEQPACKET`, listening/nonblocking state, and expected root-owned inode metadata before accepting.
11. Accept one bounded request and return one bounded response. Verify exact korrid `SO_PEERCRED` before payload parsing. Use bounded waits and shutdown. Do not add TCP, HTTP, or web-UI endpoints.
12. Add patch hash, ordered patch-set digest, provenance assertions, and exact package checks.

**Test scenarios**

- Exact UUID attests; a wrong UUID returns mismatch without mutation or server cert.
- New valid certificate becomes durable and live before success.
- Sequential and concurrent repeats remain one entry.
- Two distinct certificates remain separate.
- Malformed, oversized, multi-cert, NUL, and trailing-data input never mutates state.
- Wrong UID/GID, wrong descriptor, stream socket, truncated/multiple frames, unknown operation, and extra fields fail closed.
- Revoke removes only the exact certificate and is idempotent.
- Unrelated state keys and named devices survive.
- Injected failure after candidate construction, write, sync, rename, and directory sync leaves old durable/live state. Injected restoration failure is fatal and never reports success.
- Logs and responses contain no certificate body, private key, or state body.

**Verification**

- Focused Sunshine certificate-control check.
- Complete approved Sunshine package build.
- Exact patch names, hashes, patch-set digest, and provenance.

### U2: Bind the requested Sunshine UUID to one configured native peer

**Goal**

Route provisioning without a hard-coded host port or a new endpoint map.

**Files**

- Modify `services/korrid/src/upstreams.rs`.
- Modify `services/korrid/src/upstream_native.rs`.
- Modify `services/korrid/src/lib.rs`.
- Extend host/router/upstream integration tests.

**Approach**

1. Add a host-only attestation request carrying one expected `hostUuid`. Host korrid delegates to U1. Wrong hosts return stable mismatch and no server certificate.
2. Brain mode fans attestation out only across configured native clients in `UpstreamRegistry`. Legacy peers are excluded.
3. Require exactly one match. Zero matches return `MoonlightHostNotFound`. Multiple matches return `MoonlightHostAmbiguous`. Do not provision in either case.
4. Send provision/revoke to only the selected registered native client.
5. Host mode passes the expected UUID into U1 again for atomic re-attestation before every mutation/response.
6. Keep peer labels and base URLs out of Android and public response payloads.
7. Accept the alpha on-path substitution threat explicitly. Tests prove routing consistency, not owner authenticity.

**Test scenarios**

- One native peer attests and is selected.
- Wrong peers reject without mutation or server cert.
- Legacy peers are never contacted.
- Zero/duplicate matches, timeout, malformed response, and peer disappearance fail closed.
- Configured non-default ports and bracketed IPv6 URLs work.
- Host UUID change between attest and provision is rejected.

**Verification**

- Focused upstream registry and native-client Cargo tests.
- Inspection proves no fixed host port or Artemis-address-derived endpoint.

### U3: Add korrid attest/provision/revoke RPCs and the Sunshine socket client

**Goal**

Define the native tagged RPCs and connect host korrid to the activated Sunshine socket.

**Files**

- Create `services/korrid/src/host/moonlight_certificate.rs`.
- Modify host modules, `services/korrid/src/lib.rs`, `main.rs`, `upstream_native.rs`, and tests.
- Regenerate `contracts/generated/korrid.ts` through `nix run .#korrid-check`.

**Approach**

1. Add closed tagged requests/responses:
   - `app.moonlight.certificate.attest`: expected `hostUuid`.
   - `app.moonlight.certificate.provision`: expected `hostUuid` and one public client certificate PEM.
   - `app.moonlight.certificate.revoke`: expected `hostUuid` and the same public PEM.
2. Add an injected host trait with attest/provision/revoke. Host LAN mode uses the local adapter. Brain mode uses U2. Private session-control mode rejects them.
3. Validate bounded exact-single-PEM shape before local calls. Sunshine remains the X.509 authority.
4. Implement one bounded `SOCK_SEQPACKET` request/response client. Validate absolute non-symlink path and expected root owner/group/mode before connect. Map timeout, closure, malformed response, and adapter errors to stable failures.
5. Keep PEM bodies out of `Debug`, tracing, and errors.
6. Add `NativeClient` methods with exact response-tag checks and existing URL handling.
7. Keep host behavior stateless. Sunshine owns idempotence and persistence.

**Test scenarios**

- Host RPC returns exact attestation/provision/revoke outcomes.
- Brain RPC routes only through U2.
- Private control rejects all three.
- Invalid PEM never reaches the adapter.
- Wrong tags, HTTP error, malformed JSON, timeout, oversized response, missing socket, and peer closure fail closed.
- Logs/failures contain no PEM body.

**Verification**

- Focused Cargo tests and Clippy with `-D warnings`.
- `nix run .#korrid-check`; inspect generated output.

### U4: Wire and isolate the activated Sunshine socket

**Goal**

Provide pathname integrity, exact identities, startup behavior, and denial from games and unrelated services.

**Files**

- Modify `services/inputd/nix/korri-linux-host.nix` and module checks.
- Modify korrid NixOS module/checks only for required path access.
- Modify game-unit isolation tests where needed.

**Approach**

1. Add a root-owned systemd `.socket` unit with `Accept=false`, `SOCK_SEQPACKET`, narrow `SocketMode`/`SocketUser`/`SocketGroup`, `RemoveOnStop`, nonblocking behavior, and a fixed descriptor name.
2. Keep the parent runtime directory and inode root-owned and not writable by the shared gameplay UID. Sunshine gets the listening descriptor, not pathname write access. Korrid gets only connect permission.
3. Pass Sunshine the expected korrid UID/GID and descriptor name. Pass korrid the socket path and expected root ownership/mode.
4. Preserve exact `SO_PEERCRED` inside Sunshine. The gameplay UID cannot replace the path or successfully invoke it.
5. Hide the runtime path from fresh and resumed game units with `InaccessiblePaths` as defense in depth.
6. Do not grant korrid Sunshine state-directory, private-key, HOME, or broad gameplay-home access.
7. A missing socket yields provisioning unavailable, not a service crash loop. Preserve Nix generation rollback.
8. Require the exact approved Sunshine package containing patch 0020.

**Test scenarios**

- Systemd owns the directory/inode and passes one named descriptor to Sunshine.
- Korrid can connect; gameplay processes, games, inputd, portal, and browser code cannot.
- Games cannot see the path in fresh or resumed units.
- Korrid cannot access Sunshine state/private key or unrelated home files.
- Missing/malformed configuration fails closed without a TCP fallback.
- Prior generation remains a usable rollback with unchanged state schema.

**Verification**

- Focused NixOS module checks.
- Inspect generated `.socket`, Sunshine, korrid, and game units.
- Full Linux host package/module gate.

### U5: Provision during first app discovery and again at stream start

**Goal**

Make a host with no server pin and no cached app list become selectable and launchable without pairing UI.

**Files**

- Create `KorriMoonlightProvisioning.java` and focused tests.
- Modify `KorridServer.java`, `services/korrid/src/android.rs`, `KorriShellActivity.java`, and exact computer/cache update paths.
- Update Android lifecycle/launch contract tests.

**Approach**

1. Add a package-private coordinator with narrow seams for public PEM supply, native provisioning, X.509 parsing, exact-UUID computer update, and app-list cache update.
2. Java obtains only `AndroidCryptoProvider.getPemEncodedClientCertificate()`. Private key material never crosses JNI or the network.
3. Add a JNI method accepting only requested `hostUuid` and public client PEM. Rust invokes embedded brain U2 routing. Java never supplies a korrid endpoint or port.
4. In `queryStreamApps(hostUuid)`, obtain the binder and exact online computer, then provision before Moonlight HTTPS. Parse and persist the server pin, refresh server info, require `PairStatus == PAIRED`, fetch the real app list, update the established cache, and return those apps in the same request.
5. Repeat provisioning in `startStream` after the exact online computer is resolved but before app resolution, `NvHTTP`, intent creation, or `NvConnection` use.
6. Parse exactly one bounded server X.509 certificate. Invalid or partial material never replaces an existing pin.
7. Persist through existing `ComputerDatabaseManager` state. Add no field or alternate store.
8. Keep network work off the Android main thread and inside current budgets. Serialize concurrent work for one host and prevent duplicate game starts.
9. Keep online hosts visible even without a pin. Do not expose an unpaired user state.
10. Fail with stable stream/query errors containing no certificate material. Do not construct a game intent after provisioning or attestation failure.

**Test scenarios**

- An online DB host with no pin and no cache is visible.
- `queryStreamApps` sends only UUID/public PEM, persists a valid server pin, proves paired status, refreshes/caches apps, and returns a selectable route.
- Invalid/empty/multi-cert/oversized server PEM is not persisted.
- JNI timeout, no matching peer, ambiguous peer, Sunshine rejection, and post-provision non-paired status do not launch.
- `startStream` repeats idempotent provision as repair.
- Concurrent queries/starts cannot cross-update hosts or start two games.
- Configured IPv4, DNS, non-default-port, and bracketed IPv6 peers route inside Rust without Android endpoint construction.
- TLS key manager, exact server pin, and HTTPS `rikey` behavior remain present.

**Verification**

- Focused JVM/Robolectric tests.
- Native/JNI compile checks, Android lint/unit checks, and debug APK build without installation.

### U6: Remove the pairing ceremony and public pairing contract

**Goal**

Delete the PIN workflow and user-facing pair state while retaining protocol certificate-acceptance checks.

**Files**

- Remove or reduce `PairingManager.java` and pairing methods in `NvHTTP.java`.
- Modify `PcView`, `KorriShellActivity`, pair-state consumers, resources, bridge treaty, portal bridge, surface model, and tests.
- Extend the Moonlight parity/source inventory.

**Approach**

1. Characterize all `PairingManager`, `/pair`, `/unpair`, PIN, `openPairing`, `NotPaired`, and public `paired` references.
2. Remove `doPair`, OTP pair, unpair, pending PIN/passphrase state, menu IDs, dialogs, and tap-to-pair behavior.
3. Remove `openPairing`, `OpenPairingResult`, public `StreamHost.paired`, and `StartStreamResult.NotPaired` from the bridge and portal. Provision failure is a normal stable stream/query failure.
4. Remove portal filtering and actions that hide or pair unpinned hosts.
5. Keep protocol `PairState` in a neutral protocol type if still required by `NvHTTP`, `NvConnection`, polling, and post-provision attestation. Delete GameStream pairing/challenge/PIN calls once no runtime references remain.
6. Retain TLS key manager, exact server-pin trust manager, hostname verifier, pair-status parsing, and `NvConnection` paired attestation.
7. Remove unused strings/imports only after reference and build checks.
8. Add tests that fail if Korri production paths call pairing endpoints, challenge exchange, PIN generation, `openPairing`, or `NotPaired`.

**Test scenarios**

- No Korri UI displays pair/unpair/PIN status or actions.
- No bridge/surface method opens pairing.
- Unpinned online hosts enter U5 discovery.
- Provision failure never opens a prompt.
- No production Korri path invokes `/pair`, `/unpair`, or challenge/PIN generation.
- Protocol paired status still blocks a stream if Sunshine did not accept the cert.
- Android, portal, surface, and treaty compilers agree.

**Verification**

- Android unit/lint/source-contract checks.
- Portal and Shift tests.
- Production-source search with inspection of remaining protocol-only pair-state references.

### U7: Prove the end-to-end contract and integrate locally

**Goal**

Prove first-use discovery through launch, rollback behavior, package integrity, and a review-clean local integration without device activation.

**Approach**

1. Add a deterministic cross-stack fixture with a real public client certificate, compiled Sunshine adapter seam, host router, embedded-brain `UpstreamRegistry`, native peer client, and Android contract assertions.
2. Begin with an online DB host that has no server pin and no cached app list. Prove: app query, configured-peer UUID attestation, unique selection, provision, live/durable trust, server cert return, Android pin persistence, paired attestation, app refresh/cache, selectable route, repeated start-time repair, and launch authorization.
3. Prove the GameStream pairing endpoint is absent from that sequence and unreachable from Korri production paths.
4. Prove failure rollback:
   - Sunshine transaction failure preserves old durable/live state or enters fatal integrity stop on unrecoverable restoration failure.
   - Korrid timeout/malformed response persists nothing on Android.
   - Invalid server cert never replaces a good pin.
   - Launch failure after successful provisioning keeps durable trust and uses existing launch rollback.
5. Prove state-schema rollback compatibility with the prior approved Sunshine package.
6. Tests assert encryption, exact certificate use, and consistent UUID/endpoint/cert values. They must not claim intended owner authenticity during alpha bootstrap.
7. Run focused gates, complete repository gate, then P0-P2 security/code review.
8. Commit atomic slices, rebase onto latest local `main`, rerun the final gate, fast-forward local `main`, archive/close the item, and remove the feature branch/worktree. Do not push.

**Test scenarios**

- First app query makes a never-paired/no-cache host selectable; launch follows with zero pairing UI and no `/pair` call.
- Retry, concurrency, host restart, and client restart remain idempotent.
- Host server cert changes update Android only after successful re-provision.
- Revoke blocks later TLS; provision restores it.
- Malicious LAN input cannot bypass UUID/shape checks into mutation.
- Wrong local credentials cannot provision/revoke or replace the socket path.
- No PEM, private key, input AES key, state body, or future credential appears in logs/argv.
- Prior Nix generation reads unchanged named-device state.

**Verification**

- Focused Sunshine check and full package build.
- Focused korrid tests and Clippy `-D warnings`.
- `nix run .#korrid-check`.
- Android JVM/native/lint/debug APK checks.
- Portal and Shift tests.
- Linux host NixOS module/package checks.
- `nix run .#inputd-check`, unless `nix run .#help` identifies a newer complete gate.
- Final review with no unresolved P0-P2 findings.

## Dependency order

1. U1 defines Sunshine UUID attestation, transaction behavior, and activated socket protocol.
2. U2 grounds UUID routing in configured native peers.
3. U3 defines tagged RPCs and consumes U1/U2.
4. U4 deploys and isolates the activated socket.
5. U5 provisions during app discovery and stream start.
6. U6 removes the old ceremony only after U5 is green.
7. U7 proves and integrates the complete slice.

U1 through U3 share protocol files and execute serially. U4 depends on the final descriptor/credential contract. U5 depends on generated Rust wire behavior. U6 depends on U5 so there is no interval without either pairing or provisioning.

## Deferred implementation-time checks

- Confirm the smallest Sunshine lock shared by existing pair/unpair and new mutation.
- Confirm Sunshine's current root UUID accessor and state-write functions.
- Confirm systemd activated descriptor consumption without adding a broad dependency. If direct `LISTEN_FDS` validation is needed, implement that exact contract. Do not fall back to a Sunshine-writable pathname. If source evidence makes descriptor consumption impossible, establish a distinct Sunshine service UID before claiming pathname integrity and record why.
- Confirm the binder/database method that updates exact `serverCert` without a new field.
- Confirm the established app-list cache write path used by `queryStreamApps`.
- Confirm whether unused pairing resources can be deleted.
- Confirm the current complete repository gate with `nix run .#help`.

## Completion conditions

Complete only when all `item.md` acceptance criteria pass, automated gates pass, no P0-P2 finding remains, local `main` contains the atomic commits, the item is archived/closed, and the feature worktree/branch are removed. Deployment, push, and physical acceptance are not completion conditions and must not occur without separate approval.
