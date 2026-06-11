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
