---
id: 01KTRYCA2EC1DBW6RJXPC4NJV4
slug: generic-removable-media-config-roots
title: Generic removable-media Korri config roots
status: active
graduated: 2026-06-10
source: se-challenge-plan
related:
  - 01KTRYCK5XYMCSVYD55P7XWBDY  # write-target semantics (fast-follow slice D)
---

# Generic removable-media Korri config roots

Graduated from the parking lot to active planning. See `item.md` for the
original acceptance criteria and `plan.md` for the implementation plan.

PR 1 scope (A+B+C): a shared `korri-removable-media` NixOS module that mounts
SD/microSD/USB media with a two-gate matcher, exposes each mount as a
card-wins Korri config root through a stable `config-roots.d` signal dir, has
korrid re-resolve and rebuild the config graph on mount/unmount, and is opted
into by SM8550 + x86/live-usb. Write-target authoring redirection
(01KTRYCK) is the deferred fast-follow (slice D).

## Completion (2026-06-10)

PR-1 scope (A+B+C) implemented and locally integrated on trunk
(7 commits, U1-U6 plus Tier-2 review fixes):

- U1 `korri-removable-media` module + standalone two-gate matcher +
  behavioral matcher check (`korri-removable-media-matcher`).
- U2 SM8550 migrated onto the module (paths preserved; kiosk-config check +
  Thor/Sobo toplevel dry-build green).
- U3 device-neutral module-eval check (`korri-removable-media`).
- U4 controller `resolveRoots` + config-roots.d signal watch + watcher
  lifecycle; review hardening added single-flight rebuild serialization and
  a discriminated options type.
- U5 runtime resolver (`resolveAllConfigGraphRoots`) with live-mount
  validation, collection-scoped trust in the ProseQL transform (data
  collections only for unmarked cards; symlink-escape skip), korrid +
  hono-app wiring, KORRI_CONFIG_ROOTS_DIR exported by korri-daemon and
  mirrored to sessiond. Config-graph surface extracted to
  proseql/config-graph-db.ts.
- U6 x86 kiosk + live-USB opt-in with USB gate; live-USB boot stick excluded
  by the runtime deny-list (asserted; verified by direct eval — the
  korri-live-usb-config check derivation itself remains CI-disabled by the
  pre-existing korri-session assertion, backlog 01KTSWVMVH8PR157R4BPSBJ9KJ).

Outstanding (not blocking PR-1):
- On-device/VM validation of hotplug add/remove + config.changed broadcast
  (R4) on SM8550 and live-USB hardware; live-usb-vm-smoke skipped per user.
- Slice D (write-target authoring, backlog 01KTRYCK5XYMCSVYD55P7XWBDY) and
  slice E (trusted-marker escalation) per plan.
- Review advisories: UUID-less TOCTOU guard gap, mounted-elsewhere silent
  exit, ConfigGraphEvent not carrying the resolved root set (see
  /tmp/software-engineering/se-code-review/20260610-190740-0162ae31/).

## ProseQL 0.15 adoption (2026-06-10, follow-on)

Upstream landed per-root `collections`, `onFragmentError`, and first-class
provenance/diagnostics. Adopted on trunk (4 commits, ending 5452c40):

- Collection-scoped trust is now native per-root scoping (ignored-collection
  diagnostics); the Korri strip-first transform was deleted, validation is
  narrowed to root-allowed sections, and the symlink-escape realpath guard
  remains defense-in-depth (0.15 discovery never lists symlink entries).
- Fragment-error containment (`skip-fragment`, user-approved contract
  change): broken fragments — card files or local typos — are skipped with
  diagnostics instead of freezing the graph at last-known-good;
  `config.invalid`/last-known-good now applies only to non-fragment errors
  (missing non-optional root). Controller/RPC tests updated.
- `ConfigGraphEvent.diagnostics` surfaces skips over `/api/config/events`;
  `openKorriConfigGraph` returns `KorriConfigGraphDb` exposing
  `$documentGraph` provenance + diagnostics (slice-D enabler).
- bun offline-cache codec patch re-keyed to `@proseql/core@0.15.0`.

Follow-ups: backlog 01KTTHJ7SPYEB5M1RTAT20RZ05 (surface diagnostics/
provenance/roots in portal + events), 01KTTHJRTT3N93BMBZ1SF8VXJ1 (upstream
asks: per-root error policy, symlink contract, transform meta).

## Media-id mountpoints (2026-06-11, follow-on)

Mounts and config-roots.d entries renamed from kernel instance to media id
(partition filesystem UUID): /run/media/korri/<uuid>. Stable paths across
slots/re-inserts, stable config-root identity for provenance/diagnostics,
deterministic card-wins ordering by media identity. UUID now required to
mount (closes the vacuous-TOCTOU advisory) and charset/length-validated
(attacker-controlled header becomes a path component). Unmount resolves
mountpoints from the surviving mount table (findmnt --source) scoped to
mediaRoot with a dot/empty id guard; dd-cloned cards (same UUID, different
device) are skipped, never aliased. Trunk commits f32f62b + 863dd15.

## Fixed cross-device media path (2026-06-11, follow-on)

/run/media/korri/<media-id> is now the same on every Korri device:
mediaRoot and configRootsDir became read-only module options (card
fragments reference their own content by absolute path resolved on
whatever device the media is inserted into, so the prefix is a contract,
not a preference). SM8550 dropped its legacy cards/ override; the content
symlink retargets to the generic root. Module check asserts the readOnly
declarations and that an override fails at eval time. Trunk commit 82a09f1.
