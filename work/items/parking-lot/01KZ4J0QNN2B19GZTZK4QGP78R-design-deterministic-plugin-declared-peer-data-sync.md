---
id: 01KZ4J0QNN2B19GZTZK4QGP78R
slug: design-deterministic-plugin-declared-peer-data-sync
title: Design deterministic plugin-declared peer data sync
origin: parked
status: To Do
priority: medium
labels:
  - federation
  - sync
  - plugins
  - data-safety
  - design
created: 2026-08-03
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: main
  commit: 451138f1
  repo: korri
  invoked_by: user
---

# Design deterministic plugin-declared peer data sync

## Why it matters

Korri needs safe synchronization of launcher-owned persistent data across a federation of intermittently connected devices. File mirroring tools such as Syncthing can silently select or overwrite the wrong copy after concurrent offline play. The required user experience is deliberately small: when two devices changed the same data independently, show both candidates, require the user to pick one winner, propagate that decision, and move on—without exposing save history, branches, merging, or multi-state management.

## Acceptance Criteria

- [ ] Document a high-level design in plain language for deterministic device-to-device synchronization with no central server or authoritative device.
- [ ] Define an opt-in plugin/launcher declaration that identifies opaque data groups, their device-local files/directories, and when capture or restore is safe; plugins with no persistent data declare nothing.
- [ ] Keep physical launcher paths device-local: support fixed paths, configurable paths, multiple roots, and inaccessible launcher-private data without assuming a universal Korri save directory.
- [ ] Define the korrid-owned lifecycle: capture only at a safe point, package a complete declared group, fingerprint it, advertise a small summary, transfer through authenticated encrypted peer connections, verify it, stage it, and replace data only while the launcher is stopped.
- [ ] Define peer comparison rules without timestamps: identical content does nothing; a change that follows the receiver's known version propagates; independent changes create a conflict.
- [ ] Define the conflict experience as a temporary local-versus-peer choice. The selected complete package becomes the accepted version; the losing package is discarded after the decision, while only enough small decision metadata remains to prevent the same conflict returning.
- [ ] Explain how a winner decision spreads through any connected Korri peers and later reaches offline peers. No peer is authoritative; any peer may carry data.
- [ ] Handle the unavoidable decentralized edge case: two disconnected groups may resolve the same conflict differently, requiring another explicit choice when they later meet.
- [ ] Describe direct transfer, interrupted-transfer recovery, and optional store-and-forward through another Korri peer or untrusted encrypted relay. State clearly that synchronization cannot occur if no communicating path exists.
- [ ] Evaluate DIY implementation against Unison, rclone bisync, Ludusavi, and Nostr. Treat these as references or optional transport/discovery aids, not as authorities or automatic conflict resolvers.
- [ ] Identify a narrow first proof using two devices and one plugin-declared data group: start from the same version, modify both offline, reconnect, choose a winner, verify both devices converge without silent replacement.
- [ ] Do not implement account UI, automatic scanning, cloud-save product features, generic save/state semantics, binary merging, or a central synchronization service as part of the first slice.

## Related

- `AGENTS.md`
- `services/korrid/src/launcher/`
- `services/korrid/src/upstream.rs`
- `services/korrid/src/plugin.rs`
- `plugins/retroarch/`
- `plugins/mgba/`
- `clients/portal/src/launchables/`
- `contracts/`

## Notes

Conversation conclusions:

- This is not specifically a save-game subsystem. Korrid should synchronize opaque plugin-declared data. The core must not assume concepts such as saves, states, profiles, slots, or a shared root directory.
- Every launcher has its own storage constraints: fixed directories, configurable directories, several directories, or no persistent data at all. A declaration does not grant filesystem access; synchronization is fulfillable only where korrid can actually read and restore the declared locations.
- Plugins declare; korrid performs effects. A plugin/launcher explicitly opts in, identifies which local items must move together, and identifies safe lifecycle points. Korrid captures, packages, transfers, verifies, stages, and restores.
- A complete declared group is the unit of choice. Never merge individual files from two competing directory snapshots, even when changed filenames do not overlap, because indexes, journals, and checksums may span files.
- Desired UX resembles Steam Cloud's local-versus-cloud conflict prompt, but must not use wall-clock timestamps to select a winner. Timestamps/device labels/playtime may help the user decide but are never ordering authority.
- There is no central server, canonical host, global root, or authoritative device. Each peer holds its best-known accepted package plus compact change/decision metadata. Any peer can send, receive, or temporarily carry data.
- Conceptual flow: plugin identifies data -> korrid captures after safe stop -> creates a complete compressed package and fingerprint -> peers exchange summaries -> receiver requests missing package -> encrypted transfer -> fingerprint verification -> stage -> install only while stopped -> accepted result propagates onward.
- Initial transfer may send full compressed packages. Resumable/chunked transfer is a later optimization if size proves problematic.
- Comparison is based on known change lineage rather than clocks: same content is a no-op; one side that clearly follows the other can propagate; independent changes require the user to choose.
- A conflict temporarily retains both candidates only long enough to choose. The choice creates compact metadata acknowledging both candidates and naming the winner. This is internal bookkeeping, not user-facing history or branch management. Offline peers later receiving the decision discard the losing candidate.
- If a third offline peer independently changed the earlier version, that is a new real conflict. If two disconnected groups make opposing winner decisions, they must ask again when they meet; no decentralized design can prevent independent decisions during isolation.
- Transport options: direct peer connection on reachable networks; another Korri peer may store and forward; an untrusted relay may carry encrypted announcements or packages. If no devices overlap and no intermediary carries data, synchronization is physically impossible.
- Nostr may fit later for discovery, announcements, or relayed small messages. It does not provide reliable private blob storage, delivery guarantees, conflict rules, or winner selection. Avoid Nostr's latest-event-wins behavior. Actual data and decisions remain Korri-owned.
- Unison and rclone bisync are useful references for remembering prior synchronization and detecting both-sides-changed conflicts, but their filesystem-root/file-granular model and lifecycle assumptions do not directly fit Korri. Ludusavi is useful reference material for game-data capture and cloud conflict UX but is a large desktop/save-specific application, not an obvious embeddable core.
- DIY appears intentionally small. Existing korrid dependencies already include sha2, reqwest, serde, and Tokio; directory walking/packaging may need a small additional crate. Do not choose crates or freeze a wire/schema until grounded in the first real plugin and two-device proof.
- Security requirements to resolve in design: enrolled device/account authorization, authenticated encrypted transfer, package integrity, and path-safe unpacking. Relays must not be trusted with plaintext.
- Keep responses and resulting user-facing design succinct and free of unnecessary jargon.
