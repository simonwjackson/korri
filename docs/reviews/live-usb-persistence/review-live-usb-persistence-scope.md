# Scope review: live USB Product/Developer persistence plan

Plan reviewed: `docs/plans/2026-05-24-006-feat-live-usb-product-developer-persistence-plan.md`  
Origin: `docs/brainstorms/2026-05-24-001-live-usb-persistence-modes-requirements.md`  
Review lens: scope alignment, YAGNI, implementation-time abstractions, overreach.

## Existing-system read

- The current implementation is already concentrated in a small seam: `nix/images/live-usb-runtime.nix` owns live-USB options/service ordering and `nix/images/live-usb-persistence-resolver.sh` owns same-stick safety.
- The existing resolver already has the storage-authority behavior the origin needs: derive boot media from `/iso`, require USB parent, accept sibling `KORRI-PERSIST`, otherwise tmpfs + ephemeral marker.
- The minimum change set is therefore: keep the resolver trust boundary, change Product path preparation from broad `$root/home` to explicit allowlist, add one Developer system/package that selects broad persistence, and update checks/docs.
- The plan is mostly proportionate to the origin, but it risks extra abstraction and duplicated implementation passes in the findings below.

## Findings

### 1. High — Developer visibility is treated as optional even though the origin requires it

**Evidence**
- Origin R10: "The Developer ISO must be visibly distinguishable from the Product ISO" (`requirements` lines 69-73).
- Origin AE2: "the session is visibly marked as the Developer ISO" (`requirements` lines 83-84).
- Plan defers the on-screen signal: "On-screen React banner for persistence state: include only if the existing runtime-config seam is cheap" (`plan` lines 57-60) and "Exact UI visibility mechanism ... if a cheap runtime-config addition fits" (`plan` lines 119-122).
- U3 guarantees image filename/menu/config metadata, but not a visible running-session marker (`plan` lines 261-267).

**Why this is a scope problem**
The plan covers artifact distinguishability, but the origin explicitly requires visible Developer identity during the session. Making the session-visible mechanism conditional on "cheap" creates an acceptance gap.

**Recommended fix**
Make a running-session Developer marker a required U3/U6 deliverable. Keep it minimal: use the cheapest existing environment/config seam, but require some visible "Developer ISO / broad persistence" indication during kiosk use. Do not let docs, marker files, or ISO filenames be the only visibility contract.

**Confidence:** 75

---

### 2. Medium — The local "Impermanence-style declaration layer" risks becoming a mini-framework before it has enough consumers

**Evidence**
- Plan summary commits to "a local Impermanence-style declaration layer" (`plan` line 13).
- U1 adds a declaration shape for files/directories and user-relative paths with owner/group/mode metadata (`plan` lines 169-171), using Impermanence vocabulary as a pattern (`plan` lines 177-180).
- Existing code currently needs only one preparation function that creates a few directories and sets ownership (`resolver` lines 16-20).
- The origin deferred exact Nix module structure/bind mechanics to planning, but did not require a reusable declaration framework (`requirements` lines 131-135).

**Why this is a scope problem**
For v1 there are only two persistence profiles and one setup implementation. A generic files/directories/users declaration API can become a shallow abstraction over shell preparation rather than a deep module with multiple current consumers.

**Recommended fix**
Constrain U1 to a private, concrete Product allowlist plus a profile enum/artifact metadata. Add only the metadata required by current paths. Avoid a public or Impermanence-shaped generic API (`users`, generic bind/link options, broad permission schema) until a second real setup mechanism or multiple independent allowlists need it.

**Confidence:** 75

---

### 3. Medium — U3 unnecessarily depends on U2, delaying the separate Developer artifact without a real implementation dependency

**Evidence**
- U3's goal is to expose a separate Developer ISO artifact while preserving the Product ISO (`plan` lines 244-267).
- The existing image library already composes live USB systems by passing extra `modules` (`common.nix` lines 128-135).
- U2's goal is Product allowlist replacement (`plan` lines 196-219), which is not required to add a second system/package selected by Nix configuration.
- U3 nevertheless depends on both U1 and U2 (`plan` line 250).

**Why this is a scope/ordering problem**
This serializes artifact-split work behind Product allowlist internals. The separate artifact contract can be made visible earlier after U1, reducing risk and review size.

**Recommended fix**
Either remove U2 from U3's dependency list, or split U3 into:
1. U3a after U1: Developer system/package/output/name metadata.
2. U3b after U2 only if Developer broad setup truly reuses the new Product setup machinery.

**Confidence:** 75

---

### 4. Medium — U4 duplicates resolver/harness work already assigned to U2/U3

**Evidence**
- U2 modifies `live-usb-persistence-resolver.sh`, the safety fixture/test, config check, and VM smoke (`plan` lines 204-210), and already includes Product allowlist, unsafe-device, duplicate-label, write-probe, and fallback scenarios (`plan` lines 228-236).
- U3 adds Developer artifact/config/failure coverage (`plan` lines 276-282).
- U4 then modifies the same resolver and safety fixture/test again (`plan` lines 298-301) for overlapping Product/Developer safety and isolation scenarios (`plan` lines 314-321).

**Why this is a scope problem**
This plans two passes through the same resolver and harness. That increases churn and makes it easier to implement Product behavior first and then retrofit Developer isolation, even though the resolver trust boundary should stay shared.

**Recommended fix**
Fold U4's required isolation scenarios into U2/U3, or redefine U4 as test-only hardening after the implementation is complete. If U4 remains separate, remove `nix/images/live-usb-persistence-resolver.sh` from its file list unless a specific missing resolver behavior is named.

**Confidence:** 75

---

### 5. Advisory — U5's new QEMU/just surfaces may be more validation infrastructure than v1 needs

**Evidence**
- Origin requires distinct artifacts and clear validation surfaces, but not necessarily new QEMU apps or just recipes (`requirements` lines 120-125).
- U5 touches `flake.nix`, both live USB app wrappers, config checks, VM smoke, docs smoke, and `justfile` (`plan` lines 337-345).
- Existing flake/apps already expose Product QEMU runners parameterized by ISO package and persistence mode (`flake.nix` lines 521-538).

**Why this may be overreach**
The essential v1 validation is package/output eval, Product/Developer config checks, resolver harness safety, and docs. New Developer QEMU convenience commands are useful, but may not be necessary for the core persistence split.

**Recommended fix**
Make U5's required scope static checks + docs smoke + reuse of existing QEMU machinery. Defer new Developer-specific QEMU app names and just recipes unless they are a thin parameterization of the existing runner with little additional code.

**Confidence:** 50
