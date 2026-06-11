---
title: "feat: Generic removable-media Korri config roots"
type: feat
status: completed
date: 2026-06-10
deepened: 2026-06-10
origin: work/items/active/01KTRYCA2EC1DBW6RJXPC4NJV4-generic-removable-media-config-roots/item.md
verify_command: "just check"
---

# feat: Generic removable-media Korri config roots

## Summary

Generalize the SM8550-only SD-card mounting POC into a shared `korri-removable-media`
NixOS module that mounts SD/microSD/USB media with a two-gate matcher, and wire each
mounted volume into the config cascade as a *card-wins* Korri config root through a
stable `config-roots.d` signal directory so korrid re-resolves and rebuilds the config
graph on hotplug/unplug. SM8550 migrates onto the module with no behavior change;
x86 and live-USB opt in with USB enabled.

---

## Problem Frame

The removable-media work lives only in `product/systems/nixos/images/platforms/rocknix-sm8550.nix`:
it matches `mmcblk*p*` only (no USB), is hardcoded to one platform, and exposes media
as game *content* (`/var/lib/korri/content/removable/cards`) — it is not connected to the
config cascade that just landed. We want a device-neutral convention so any appliance
(one or two SD slots, USB sticks) streamlines mounting, and — per the user — a card can
carry the *entire* Korri config/library, not just supplemental fragments. The config
cascade (`KORRI_CONFIG_ROOTS`) is rendered statically at Nix build time and the
config-graph controller wires watchers once at startup, so dynamically-mounted media
cannot currently join the live graph. (see origin: item.md)

---

## Requirements

- R1. A device-neutral removable-media exposure contract under Korri-owned paths, not tied to SM8550 SD-card paths.
- R2. Support multiple removable devices and media types — SD/microSD and USB — with one mount per filesystem partition, no UUID/label assumptions.
- R3. Each mounted volume contributes an ordered Korri config root (card-wins) without device-specific hardcoding.
- R4. Hotplug add/remove and coldplug (media present at boot) both trigger config-graph re-resolve + rebuild and config-event broadcasts.
- R5. Never mount or expose the disk the running system depends on (internal storage, the live-USB boot stick), derived at runtime — safe as hardware passthrough to the guest widens.
- R6. Nix/module checks for a generic provider shape plus per-platform enablement (SM8550, x86/live-usb).
- R7. SM8550's existing SD-card behavior stays green through the migration.
- R8. An unmarked removable card may contribute only *data* collections (`library`, `collections`, `users`); execution-privileged collections (`host`, `apps`, `runtimes`, `profiles`) stay frozen to trusted static roots. A card carrying valid trust-marker credentials may contribute all collections (deferred escalation, slice E).

**Origin acceptance examples:** none (parked item carries acceptance criteria, not AE-IDs).

---

## Scope Boundaries

- No authoring/write-target redirection in this PR — read-side only. Removable roots are registered with a writability classification seam, but CLIs are not yet moved off `KORRI_LIBRARY_ROOT`.
- No filesystem repair, fsck, or write-back to removable media beyond mounting.
- No UI surface for browsing/selecting cards; this is runtime + config-graph plumbing.
- No change to the static base roots ordering (platformDefaults → localRoot → operator roots); removable roots append after them.

### Deferred to Follow-Up Work

- **Slice D** — Write-target authoring semantics (CLIs off `KORRI_LIBRARY_ROOT`; "record originated from a read-only/removable root → write here / refuse" + diagnostics): backlog item `01KTRYCK5XYMCSVYD55P7XWBDY`, separate PR.
- **Slice E** — Trusted-marker escalation: let a card carrying valid trust credentials contribute execution-privileged collections (`host`, `apps`, `runtimes`, `profiles`), lifting it past the data-only default. Requires a trust-anchor design (device-local enrollment allowlist vs operator-signed token — see Open Questions). PR1 ships the safe data-only default that this builds on.
- Retiring the legacy `content/removable` symlink once config-root exposure subsumes it.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` — the POC: `removableCardsMediaRoot`/`removableCardsContentRoot`, `korriRemovableCardMount`/`…Coldplug`/`…Unmount` scripts, udev rules, `korri-removable-card-mount@`/`…unmount@`/`…coldplug` units, tmpfiles. This is what gets extracted.
- `product/systems/nixos/modules/korri-daemon.nix` — `effectiveConfigRoots` / `configRootsEnv` (`KORRI_CONFIG_ROOTS`), `services.korri.config.{localRoot,roots}` (note the seeded example `[ "/run/media/korri/cards/sd1" ]`). New `KORRI_CONFIG_ROOTS_DIR` env wires here.
- `product/platform/library/config-graph-controller.ts` — `createConfigGraphController({ roots })`, `startWatchers`, `attemptBuild`, debounced `rebuild`. Roots are frozen at construction; this gains re-resolution.
- `product/platform/library/library-source-layer-live.ts` — `configGraphRootsFromEnv()` parses `KORRI_CONFIG_ROOTS`. Add dynamic `config-roots.d` resolution here.
- `product/services/device/korrid.ts` — `createConfigGraphController({ roots: configGraphRootsFromEnv() })`; wire resolver + signal dir.
- `product/platform/library/proseql/library-db.ts` — `KorriConfigGraphRoot { root; optional?; id? }`; add writability classification field.
- `product/systems/nixos/images/live-usb-persistence-resolver.sh` — **proven disk-identity toolkit**: `findmnt -n -o SOURCE --target <mount>` → `lsblk -no PKNAME` (parent disk) → `lsblk -ndo TRAN,RM` (transport/removable) → `blkid`. The two-gate matcher reuses this exact pattern.
- `product/systems/nixos/images/platforms/x86.nix`, `product/systems/nixos/images/live-usb*.nix` — clean `lib.mkIf kiosk.enable` opt-in points.
- `product/systems/nixos/modules/korri-compositor.nix` — template for the new module's option/config shape.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` (lines ~40, 193-205) — existing hardcoded removable assertions to generalize.

### Institutional Learnings

- POC commits encode hard-won quirks to preserve: `mountpoint(1)` exact-target check (not `findmnt --target`, which returns longest-prefix mount — commit 30583d3), the nspawn devtmpfs bind guard (`devtmpfs on /dev/mmcblkXpY` is not the fs mount), and the coldplug oneshot for media present before boot (commit 51881e6). The shared module must carry all three forward.

---

## Key Technical Decisions

- **Removable media = config root, card-wins *within its allowed collections*.** Each mount is a `KorriConfigGraphRoot` appended *after* the static base roots (platformDefaults → localRoot → operator roots), so a card overrides the appliance — but only for the collections it is permitted to contribute (next decision). Content/assets ride along because config records reference content paths under the same mount.
- **Collection-scoped trust, not per-key (closes the card-wins RCE).** ProseQL's documentGraph deep-merge is collection-granular, so trust is enforced per-collection, not per-key. Unmarked removable roots are restricted to data collections (`library`, `collections`, `users`); execution-privileged collections (`host`, `apps`, `runtimes`, `profiles`) are frozen to trusted static roots. This still delivers "the whole library lives on the card" (the `library` collection *is* the catalog) while a malicious card cannot re-point `host.moonlight.command` or per-app runtime config. Per-key filtering was rejected: it would require a post-merge filter layer that breaks ProseQL's "later root wins" invariant. (Full-power cards via a trust marker are slice E.)
- **Stable `config-roots.d` signal dir over recursive cross-mount watching.** Mount units add a symlink per mounted volume into `KORRI_CONFIG_ROOTS_DIR` (e.g. `/run/korri/config-roots.d/`), remove it on unmount. korrid watches *that directory* (reliable child add/remove) and re-resolves. Recursive `fs.watch` does not descend into mountpoints reliably on Linux, so we never watch *through* a mount — only the set of mounts.
- **Coarse re-resolve, not fine-grained add/remove.** On signal-dir change the controller tears down content watchers, re-resolves the full root set, rebuilds the graph, and re-watches. Root counts are tiny; surgical diffing is unjustified complexity.
- **Two-gate matcher (both must pass), extracted to a testable script.** (1) Positive: parent disk transport is `usb` OR the partition is an SD/microSD card (`mmcblk*p*`, excluding the boot/eMMC device). (2) Negative deny-list: refuse any partition whose parent disk backs a system mount. The deny-list is **derived from *all* block-device-backed mounts currently visible in the guest namespace** (not a fixed `/ /iso /flash /storage` enumeration), each resolved to its parent disk; the named system paths become an *assertion set* that must appear in the derived result. The matcher lives in a standalone `korri-removable-media-match.sh` so it earns a real automated behavioral test (see U1), not just on-device validation.
- **Fail-safe, never fail-open.** If any deny-list resolution step *errors* (command failure, incomplete guest mount namespace) or the derived system-disk set is empty, the mount aborts and logs — it does not proceed. "Empty result" is distinguished from "resolution failed"; only a successful, non-empty resolution permits a mount. Critical on `match.usb = true` platforms where the deny-list is the *only* discriminator between the boot stick and a second USB stick.
- **Hardened mount options.** All removable mounts add `noexec` to `nosuid,nodev,relatime` (+ `uid/gid/umask` for vfat/exfat/ntfs). Filesystem type is **allowlisted** (`vfat exfat ntfs ntfs3 ext4 …`) before `mount -t`; unrecognized types (btrfs subvolumes, `fuse.*`, `autofs`) are skipped with a log. Device identity (UUID) is re-read immediately before the `mount` syscall and must match the checked device (TOCTOU guard for device-node recycling on multi-slot hardware).
- **Multiple simultaneous cards order deterministically by mountpoint name** (sorted), appended in that order; the later-sorted card wins on overlay collision. Documented and asserted.
- **Removable roots are `optional: true`** (may disappear) and carry a `writable` classification (RW mount vs RO) for slice D; default readonly contribution to authoring until D lands.
- **Keep the `content/removable` symlink intact** this PR to avoid breaking existing content references; converge later (Deferred).

---

## Open Questions

### Resolved During Planning

- *Static vs dynamic roots tension:* resolved via `config-roots.d` signal dir + controller re-resolution (card mounted after boot joins the live graph).
- *Internal-disk safety as passthrough widens:* resolved via runtime system-disk deny-list (not kernel-name matching).
- *live-USB overlay root unresolvable?* No — the boot stick is always findable through the `/iso` mount; the runtime-derived deny-list (all block-backed mounts) covers `/iso` and the persistence root.
- *Card-wins RCE (malicious card overrides `host.moonlight.command`)?* Resolved by collection-scoped trust: unmarked cards contribute data collections only; execution-privileged collections stay frozen to static roots (see Key Technical Decisions).
- *Does sessiond see dynamically-mounted roots?* Decided in U5: sessiond must read the same effective roots — either export `KORRI_CONFIG_ROOTS_DIR` to sessiond or have sessiond query korrid's live graph (single source of truth). The wiring choice is settled in U5; do not leave sessiond on stale static roots.
- *config-roots.d location:* `/run/korri/config-roots.d`, following the existing `/run/korri/launch-artifacts` precedent (a tmpfs/runtime dir korrid already reads).

### Deferred to Implementation

- **Trust-anchor mechanism for the slice-E trusted marker** — device-local enrollment allowlist (operator explicitly trusts a card's identity once; simplest, device-bound) vs operator-signed token verified against a key in trusted config (portable across devices, more machinery). Recommend the enrollment allowlist; settle when slice E starts. Mere presence of a marker file is *not* sufficient (forgeable).
- Exact `writable` probe (mount-options inspection vs write test) — settle when slice D needs it; this PR only carries the field.
- Precise systemd ordering between the per-mount config-roots.d symlink write and korrid's debounce — validate on device.
- Last-known-good granularity: whether an invalid *fragment* skips only itself or fails the whole root (ProseQL per-fragment vs per-root validation) — confirm against ProseQL behavior in U4/U5 and document the observed contract.

---

## Implementation Units

### U1. Shared `korri-removable-media` NixOS module (mount mechanism + two-gate matcher)

**Goal:** Extract the SM8550 mount mechanism into a generic, parameterized module that mounts any removable filesystem partition behind the two-gate matcher.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Create: `product/systems/nixos/modules/korri-removable-media.nix`
- Create: `product/systems/nixos/modules/korri-removable-media-match.sh` (standalone two-gate matcher, so it is testable)
- Create: `tools/testing/nix/korri-removable-media-matcher-check.nix` (behavioral matcher test, fake-binary rig)
- Modify: `product/systems/nixos/flake/modules.nix` (register as standalone `korri-removable-media = import ../modules/korri-removable-media.nix { korri = self; }`; NOT added to `korri-daemon.imports` — platform opt-in)
- Modify: `product/systems/nixos/flake/checks.nix` (register the matcher check in the `pkgs.stdenv.isLinux` block alongside `korri-live-usb-persistence-resolver`)

**Approach:**
- Options under `services.korri.removableMedia`: `enable`, `mediaRoot` (default `/run/media/korri`), `contentRoot` (optional, default keeps `/var/lib/korri/content/removable`), `configRootsDir` (default `/run/korri/config-roots.d`), `match = { mmc = true; usb = false; }` (USB default-off; U6 turns it on per platform), `user`/`group` from runtime.
- Render: udev `add|change|remove` rules tagging per-kernel mount/unmount units; `korri-removable-media-mount@`/`…unmount@`/`…coldplug` units; tmpfiles for `mediaRoot`/`contentRoot`/`configRootsDir` (config-roots.d as `0750 root <runtime-group>` — root-owned so the runtime user cannot inject symlinks; see U5).
- **Extract the two-gate matcher into `korri-removable-media-match.sh`**: takes a device path, returns exit 0 (accept) / 1 (reject). Positive gate (usb transport via `lsblk -ndo TRAN`, or `mmcblk*p*` non-boot; empty TRAN explicitly treated as non-removable). Negative gate: build the deny-list from **all block-backed mounts in the namespace** (`findmnt` enumerate → `lsblk -no PKNAME` parent disks), assert the named system paths are present, **abort on resolution error or empty set** (fail-safe), refuse if the candidate's parent disk is in the set. Re-read device UUID and re-confirm before returning accept (TOCTOU guard).
- Mount helper invokes the matcher, then mounts with `noexec,nosuid,nodev,relatime` (+ vfat/exfat/ntfs uid/gid/umask), **filesystem-type allowlist** before `mount -t`, carrying forward the `mountpoint(1)` exact-target check and nspawn devtmpfs bind guard.
- Coldplug oneshot enumerates visible candidate partitions and starts mount units (carry forward commit 51881e6).

**Patterns to follow:** `product/systems/nixos/modules/korri-compositor.nix` (option/config shape); `live-usb-persistence-resolver.sh` (disk-identity resolution); `tools/testing/nix/korri-live-usb-persistence-resolver-check.nix` (fake-binary `runCommand` rig — verbatim pattern for the matcher test); the existing POC scripts verbatim where behavior must not change.

**Test scenarios (matcher behavioral check, fake `findmnt`/`lsblk`/`blkid`/`mount` rig):**
- Happy path: USB-transport removable disk partition → accepted; `mmcblk1p1` non-boot → accepted; a second USB stick whose parent disk is in no system mount → accepted.
- Error path (deny-list): `mmcblk0p1` whose parent backs `/` (eMMC boot) → denied; `sdb1` usb whose parent backs `/iso` (live-USB boot stick) → denied; internal NVMe/SATA (transport not usb, not mmc) → denied by positive gate.
- Error path (fail-safe): `findmnt`/`lsblk` stub exits non-zero, or deny-list resolves empty → matcher aborts (reject), never accepts.
- Edge case: unsupported fs type (e.g. `btrfs`) → skipped; empty TRAN → treated as non-removable.

**Verification:** Module evaluates; `enable = true` produces the units/rules/tmpfiles; `nix build .#checks.<sys>.korri-removable-media-matcher` passes (the matcher's *behavior*, not just its text, is proven).

---

### U2. Migrate SM8550 onto the shared module

**Goal:** Replace the hand-rolled removable block in the SM8550 platform with the module, preserving today's SD-card behavior exactly.

**Requirements:** R7, R1

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` (delete `removableCards*` lets, scripts, udev rules, units, tmpfiles; set `services.korri.removableMedia.enable = true` with `match.mmc = true; match.usb = false;` and SM8550 media/content roots)
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` (replace hardcoded `korri-removable-card-*` assertions with the new module-driven unit names / enablement)

**Approach:**
- Keep `mediaRoot = /run/media/korri/cards`-equivalent and `contentRoot = /var/lib/korri/content/removable/cards` if needed to preserve paths, OR migrate to the generic defaults and update the check — decide to minimize churn while keeping the symlink contract. Preserve the seat/input udev rules (unrelated to removable).
- SM8550's `sda` (UFS system disk) must remain excluded: with `match.usb = false` it is excluded by the positive gate, and by the deny-list (`/storage` is bound into the guest → backs `sda`).

**Patterns to follow:** existing SM8550 config-check structure.

**Test scenarios:**
- Edge case: SM8550 config still evaluates and the SM8550 kiosk-config check passes with the migrated unit names.
- Integration: assert `sda`-class devices are excluded (positive gate off for non-usb/non-mmc; deny-list covers `/storage`).

**Verification:** `nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config` passes; Thor toplevel dry-build succeeds; no behavior change for `mmcblk*p*`.

---

### U3. Generic Nix check for the removable-media module

**Goal:** A device-neutral check asserting the module renders the expected units, rules, matcher gates, and config-roots.d wiring, independent of any platform.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Create: `tools/testing/nix/korri-removable-media-check.nix`
- Modify: `product/systems/nixos/flake/checks.nix` (wire the module-eval check into the ungated `// { … }` block, AND add it to `korri-standard-native`'s `ownerMatrix` with `owner = "module"` — the registry-completeness gate fails CI otherwise)

**Approach:**
- Evaluate the module against a minimal fixture host config. Assert: mount/unmount/coldplug units exist; udev rules tag them; tmpfiles create `mediaRoot`/`configRootsDir`; matcher script contains both gates (transport/mmc positive + system-disk deny-list infixes); `configRootsDir` symlink add/remove wiring is present (post-U5).
- Assert the `match.usb` toggle flips the USB udev rule on/off.

**Patterns to follow:** existing `tools/testing/nix/*-config-check.nix` (`check`/`lib.hasInfix` assertion style).

**Test scenarios:**
- Happy path: module with defaults renders all units/rules/tmpfiles.
- Edge case: `match.usb = true` adds a USB-transport udev rule; `= false` omits it.
- Edge case: `enable = false` renders nothing.

**Verification:** `nix build .#checks.x86_64-linux.korri-removable-media` passes; `just test-nix` green.

---

### U4. Config-graph controller: re-resolvable roots + signal-dir watch

**Goal:** Let the controller re-resolve its root set and rebuild on a signal, instead of freezing roots at construction.

**Requirements:** R3, R4

**Dependencies:** None (pure TS; integrates with U5)

**Files:**
- Modify: `product/platform/library/config-graph-controller.ts`
- Modify: `product/platform/library/config-graph-controller.test.ts`

**Approach:**
- Change `ConfigGraphControllerOptions` to accept `resolveRoots: () => readonly KorriConfigGraphRoot[]` (keep a `roots` convenience that wraps a constant) plus optional `rootsSignalDir`.
- `attemptBuild`/`loadSnapshot`/`discoverFragments`/`startWatchers` call `resolveRoots()` at rebuild time rather than closing over a frozen array.
- **Watcher lifecycle (gap in current controller):** `startWatchers()` pushes content watchers that are only closed in `stop()`. Extract a `closeContentWatchers()` helper; on re-resolve, call it *before* rebuild and re-`startWatchers()` *after*, so watchers track the new root set and do not leak.
- Watch `rootsSignalDir` non-recursively (suppressed by the existing `watch: false` test flag, like content watchers); on child add/remove, debounce → re-resolve → `closeContentWatchers()` → rebuild → re-`startWatchers`. Reuse the existing debounce.
- Emit the same `config.changed`/`config.invalid` events; a vanished removable root that breaks the graph retains last-known-good (existing behavior).

**Execution note:** Test-first — drive `resolveRoots` returning different sets and assert rebuild + event emission and watcher re-pointing. Mirror the existing `withRoot` temp-dir + `watch: false` harness in `config-graph-controller.test.ts`; no mocks (drive `rebuild()` directly).

**Test scenarios:**
- Happy path: adding a root to `resolveRoots`'s return + firing the signal → `config.changed` with the new root's fragments in `files`.
- Happy path: removing a root + signal → rebuild without that root's fragments.
- Edge case: signal fires but resolved set unchanged → still rebuilds (coarse), generation advances only on valid build.
- Error path: a removable root makes the graph invalid → `config.invalid`, last-known-good snapshot retained, generation held.
- Edge case: `rootsSignalDir` absent/unwatchable → controller still serves static roots, logs a warning, does not crash.
- Integration: after a re-resolve, the previous content watchers are closed and not leaked (assert watcher count returns to the resolved root count, not the cumulative total).

**Verification:** New controller tests pass; existing controller tests still green; no watcher leak across re-resolves; `just test-unit` green.

---

### U5. Runtime root resolution + korrid wiring + module → config-roots.d feed

**Goal:** Resolve `config-roots.d` entries into ordered card-wins roots, wire korrid to re-resolve on the signal, and have the module write/remove the per-mount symlinks and set korrid's env.

**Requirements:** R3, R4

**Dependencies:** U1, U4

**Files:**
- Modify: `product/platform/library/library-source-layer-live.ts` (dynamic `config-roots.d` resolution appended card-wins; mark roots `optional: true` + `writable` classification + collection scoping)
- Modify: `product/platform/library/library-source-layer-live.test.ts`
- Modify: `product/platform/library/proseql/library-db.ts` (`KorriConfigGraphRoot` gains `writable?: boolean`; confirm/use ProseQL's per-root `collections` restriction in the graph open path)
- Modify: `product/services/device/korrid.ts` (pass `resolveRoots` + `rootsSignalDir` to the controller)
- Modify: `product/systems/nixos/modules/korri-removable-media.nix` (mount unit writes `configRootsDir/<name>` symlink → mountpoint; unmount removes it)
- Modify: `product/systems/nixos/modules/korri-daemon.nix` (export `KORRI_CONFIG_ROOTS_DIR` to korrid; keep static `KORRI_CONFIG_ROOTS` for base roots)
- Modify: `tools/testing/nix/korri-daemon-module-check.nix` (add a `KORRI_CONFIG_ROOTS_DIR` export assertion, parallel to the existing `KORRI_CONFIG_ROOTS` check)

**Approach:**
- New resolver: read `KORRI_CONFIG_ROOTS_DIR`, list entries (sorted), resolve each to its mountpoint → `{ root, optional: true, writable, id, collections }`. Compose final ordered list = static `configGraphRootsFromEnv()` ++ dynamic (card-wins, last entry wins).
- **Collection-scoped trust:** static roots are `collections: 'all'`; removable roots default to data collections only (`['library', 'collections', 'users']`) so execution-privileged collections (`host`/`apps`/`runtimes`/`profiles`) cannot be overridden from a card. Use ProseQL's per-root collection restriction (`library-db.ts` documentGraph open path) rather than a post-merge filter.
- **Symlink-escape guard:** when discovering fragments under a removable root, every fragment's *resolved real path* must be a descendant of the mount's real path — reject (do not load) fragments that escape via symlink (e.g. `config/x -> /etc/korri`). `fast-glob` follows symlinks by default; this guard is explicit.
- **config-roots.d integrity:** the resolver cross-references each entry's resolved target against `/proc/mounts` (or `mountpoint`) before accepting it as a root, so a stale or injected symlink that is not a live mount is ignored. Combined with the `0750 root:<group>` dir perms (U1), the runtime user cannot inject roots.
- `korrid.ts`: `createConfigGraphController({ resolveRoots: resolveAllConfigGraphRoots, rootsSignalDir: process.env.KORRI_CONFIG_ROOTS_DIR })`.
- **Sessiond parity:** export `KORRI_CONFIG_ROOTS_DIR` to korri-sessiond as well (mirroring `KORRI_CONFIG_ROOTS`) so foreground surfaces resolve the same effective roots after hotplug; sessiond does not stay on stale static roots.
- Module: on mount success create `configRootsDir/<kernelname>` symlink to the mountpoint; on unmount remove it. This is the signal U4 watches.

**Execution note:** Test-first on the resolver ordering/classification/scoping. Mirror `library-source-layer-live.test.ts` env snapshot/restore + real temp dirs/symlinks; no mocks.

**Test scenarios:**
- Happy path: two signal-dir entries resolve in sorted order, appended after static roots; later entry wins.
- Edge case: empty/absent `KORRI_CONFIG_ROOTS_DIR` → only static roots (back-compat).
- Edge case: a symlink whose target no longer exists, or whose target is not a live mount → skipped (optional), no throw.
- Happy path: removable root carries `optional: true`, a `writable` value, and `collections: ['library','collections','users']`; static roots carry `collections: 'all'`.
- Error path (trust): a removable root carrying a `host.moonlight.command` fragment → that key is NOT applied; the trusted static `host` value stays in effect.
- Edge case (symlink escape): a fragment symlinked outside the mount is not loaded as card config.
- Integration: end-to-end through korrid — writing a symlink into `configRootsDir` triggers a `config.changed` event including that root's data fragments (controller + resolver wired).

**Verification:** `just test-unit` green; `korri-daemon-module-check` asserts `KORRI_CONFIG_ROOTS_DIR`; manual: dropping a symlink into the signal dir on a dev korrid emits `config.changed`; a card `host.*` override has no effect on launch.

---

### U6. Enable USB + x86/live-usb opt-in

**Goal:** Turn on the USB gate and opt the x86 and live-USB platforms into the module, honoring their system-disk deny-lists.

**Requirements:** R2, R5, R6

**Dependencies:** U1, U2, U3, U5

**Files:**
- Modify: `product/systems/nixos/images/platforms/x86.nix` (`services.korri.removableMedia.enable = true; match.usb = true;` under kiosk.enable)
- Modify: `product/systems/nixos/images/live-usb-runtime.nix` (opt in; ensure deny-list covers `/iso` + persistence root so the boot stick is never grabbed)
- Modify: `tools/testing/nix/korri-live-usb-config-check.nix` and `tools/testing/nix/korri-removable-media-check.nix` (per-platform enablement + USB-gate assertions)

**Approach:**
- x86: internal `sd*`/`nvme*` system disk excluded by deny-list (backs `/`); USB sticks (`sd*`, transport usb) pass both gates.
- live-USB: the boot stick is `sd*`/usb and *removable*, but backs `/iso`/persistence → excluded by deny-list. A *second* inserted USB stick passes. This is the critical safety case to assert.
- Confirm `services.udisks2`/`gvfs` stay disabled on live-USB (already `mkForce false`) so nothing else races to automount.

**Test scenarios:**
- Integration (Nix eval): live-USB config renders the module with USB on; the live-usb check (in the `isX86Linux` block) asserts enablement + USB gate.
- Edge case: x86 kiosk config renders the module; non-kiosk x86 does not.
- Integration (coldplug convergence): boot with two USB sticks pre-inserted → a single `config.changed` carries both roots (debounce coalesces the coldplug spread).
- Edge case (invalid card): a card with valid library entries plus one syntactically invalid fragment → document the observed contract (whole-root skip vs per-fragment skip) and assert last-known-good is retained.
- On-device/VM: insert a second USB stick on live-USB → mounts + becomes a config root; the boot stick is never mounted as removable. Insert an SD card on SM8550 → unchanged behavior.

**Verification:** `nix build .#checks.x86_64-linux.korri-live-usb-config` and `…korri-removable-media` pass; `just live-usb-vm-smoke` green; device validation of hotplug add/remove + `config.changed` broadcast (R4).

---

## System-Wide Impact

- **Interaction graph:** udev → mount unit → `config-roots.d` symlink → korrid signal-dir watcher → config-graph rebuild → `/api/config/events` (`config.changed`) → portal GUI bridge refreshes library atoms. The full chain is exercised end-to-end in U5/U6.
- **Error propagation:** an invalid card config keeps last-known-good (existing controller behavior); a failed mount logs and is skipped; a vanished root is `optional` and skipped — no crash-loop.
- **State lifecycle risks:** unmount must remove the `config-roots.d` symlink even on dirty removal (card yanked) — coldplug/unmount units must converge; debounce avoids rebuild storms on multi-partition cards.
- **API surface parity:** `KORRI_CONFIG_ROOTS` (static) and new `KORRI_CONFIG_ROOTS_DIR` (dynamic) coexist; both korrid and korri-sessiond read the dynamic dir so foreground and headless resolve the same effective roots after hotplug (U5).
- **Trust boundary:** removable roots are untrusted for execution-privileged collections (`host`/`apps`/`runtimes`/`profiles`) — collection-scoped at the graph open path. The signal dir is root-owned (`0750`), the resolver validates each entry against live mounts, and fragment discovery refuses symlink-escapes out of the mount. A malicious card is confined to its own data view.
- **Unchanged invariants:** static base root ordering (platformDefaults → localRoot → operator roots) is unchanged; the `content/removable` symlink contract is preserved; `KORRI_LIBRARY_ROOT` remains the deferred write-target anchor (untouched until slice D).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Two-gate matcher wrongly mounts a system disk as passthrough widens | Runtime deny-list derived from *all* block-backed system mounts + positive removable gate; **fail-safe abort** on resolution error/empty set; matcher behavioral check + live-USB boot-stick exclusion asserted (U1, U6). |
| Malicious card overrides privileged config (`host.moonlight.command`) → RCE | Collection-scoped trust: unmarked removable roots restricted to `library`/`collections`/`users`; execution-privileged collections frozen to static roots. Full-power cards require the slice-E trusted marker. |
| Deny-list resolution fails open on USB platforms (boot stick mountable) | Distinguish "resolution failed" from "empty result"; abort the mount on failure; assert in the matcher fail-safe test (U1) and live-USB exclusion (U6). |
| Untrusted card escalates via symlink or injected signal-dir entry | Fragment discovery rejects symlink-escapes out of the mount; resolver validates entries against `/proc/mounts`; `config-roots.d` is `0750 root:<group>`; mounts are `noexec` + fs-type allowlisted. |
| Device-node recycling between safety check and mount (multi-slot) | Re-read device UUID immediately before `mount`; abort on mismatch (U1). |
| Watcher leak on coarse re-resolve | Extract `closeContentWatchers()`; close before rebuild, re-watch after; assert no leak across re-resolves (U4). |
| `fs.watch` on `config-roots.d` misses fast add/remove on a tmpfs | Non-recursive child watch + debounce; coldplug + unmount converge the symlink set; coldplug-convergence test (U6). |
| SM8550 behavior regresses during extraction | U2 preserves paths/options verbatim; SM8550 kiosk-config check + Thor dry-build gate the migration (R7). |
| Multiple cards produce nondeterministic overlay order | Deterministic sort by mountpoint name; assert ordering in U5 tests. |
| nspawn devtmpfs bind treated as the fs mount | Carry forward the POC's `mountpoint(1)` + source/fstype guards into the shared script (U1). |

---

## Sources & References

- **Origin item:** `work/items/active/01KTRYCA2EC1DBW6RJXPC4NJV4-generic-removable-media-config-roots/item.md`
- Related backlog: `01KTRYCK5XYMCSVYD55P7XWBDY` (write-target semantics, slice D)
- POC commits: 5ea9298, 30583d3, 51881e6
- Disk-identity toolkit: `product/systems/nixos/images/live-usb-persistence-resolver.sh`
