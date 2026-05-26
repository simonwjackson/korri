---
title: 'refactor: Invert Korri and nix-on-rocks flake dependency direction'
type: refactor
status: active
date: 2026-05-22
origin: docs/brainstorms/2026-05-22-001-korri-dependency-direction-inversion-requirements.md
deepened: 2026-05-22
---

# refactor: Invert Korri and nix-on-rocks flake dependency direction

## Summary

Implement the inversion additively: nix-on-rocks first keeps the current Sobo path buildable and exposes a substrate contract, then Korri imports that substrate to publish Thor/Sobo kiosk appliance targets, then deploy authority is cut over and nix-on-rocks removes Korri product composition. Thor and Sobo remain kiosk appliance targets only, never server-only targets.

---

## Problem Frame

The origin requirements define the product boundary: nix-on-rocks is the SM8550 substrate and Korri is the product/appliance layer. Today nix-on-rocks imports Korri to build Sobo's main-space kiosk target, which reverses that boundary and makes substrate verification sensitive to Korri's package lock state.

This plan turns the boundary into a safe cross-repo migration. The hard part is not just changing flake inputs; it is preserving Sobo deployability while outputs, rootfs artifacts, host promotion assumptions, and static checks move to the new authority.

---

## Requirements

- R1. Korri depends on nix-on-rocks for SM8550 substrate composition; nix-on-rocks no longer imports Korri. (origin R1, AE1)
- R2. Korri owns Thor and Sobo RockNix-backed kiosk appliance targets. They are never server-only targets. (origin R2, R9, R12)
- R3. nix-on-rocks exposes a single substrate import contract and retains substrate-only smoke targets. (origin R4, R7, AE3)
- R4. nix-on-rocks keeps substrate-owned device facts, OS-coupled runtime plumbing, Cemu launchers/helpers, and device-selection helpers. (origin R5, R6, R8, AE5)
- R5. Korri explicitly opts into user-launchable apps and exposes per-device configs, a by-compatible config, package aliases, and rootfs aliases for supported kiosk appliances. (origin R9, R10, R11, R17)
- R6. The migration stays additive-first: current target buildable, replacement target added, deploy authority cut over, cleanup required. (origin R13, R14, R15, AE4)
- R7. aarch64/Fuji verification distinguishes tactical old-target buildability from the architectural inversion. (origin R16, R17, R18)

**Origin actors:** A1 Korri product maintainer; A2 nix-on-rocks substrate maintainer; A3 Sobo deploy operator; A4 future implementation agent; A5 Fuji/aarch64 verifier.

**Origin flows:** F1 current-target tactical unblock; F2 additive Korri-side replacement; F3 deploy cutover; F4 nix-on-rocks cleanup.

**Origin acceptance examples:** AE1 no live Korri dependency in nix-on-rocks after cleanup; AE2 Korri replacement target builds on aarch64; AE3 substrate smoke targets survive cleanup; AE4 no intentional no-go deploy window; AE5 substrate/product app split is reviewable.

---

## Scope Boundaries

- Sobo's actual production redeploy is not part of this plan; this plan prepares and verifies the deploy target and cutover path.
- Moving Steam from substrate-owned runtime plumbing to Korri product selection remains deferred.
- Splitting, moving, or redesigning the SM8550 Cemu launcher suite is out of scope; it stays in nix-on-rocks.
- nix-sm8550 archival, sm8250 population, and the Sobo zero-copy/Moonlight branch are out of scope.
- Generalizing a Korri device-adapter framework is out of scope.
- Nixpkgs channel changes are out of scope.
- Broad renaming of `rocknix-*` terminology is out of scope unless directly needed for the target names.
- Korri app/UI/runtime behavior changes are out of scope beyond NixOS image composition.

### Deferred to Follow-Up Work

- Production Sobo deploy: separate operator decision after the Korri target and cutover path are verified.
- Steam ownership migration: separate architecture pass to split Steam runtime plumbing from user-facing app selection.
- Cemu launcher ownership revisit: separate plan only if future consumers need a different product/substrate split.
- Rootfs seed publishing relocation hardening: this plan makes the authority transition explicit; future work can streamline release automation once the new target is proven.

---

## Context & Research

### Relevant Code and Patterns

**nix-on-rocks repo**

- `flake.nix` currently declares `inputs.korri`, imports `korri.nixosModules.korri`, enables `services.korri.client` and `services.korri.inputd`, and exposes `rocknix-guest-main-space-*`, `rocknix-guest-stage10-proof-*`, and `rootfs-*` product outputs.
- `guest/profiles/main-space.nix` is the closest existing substrate/session module but currently conditionally writes Korri kiosk options and contains product launch bindings.
- `guest/modules/{base,device,display,audio,input,network,lid,steam,tools,ssh}.nix` already contain the substrate-owned OS concerns that should remain in nix-on-rocks.
- `guest/modules/input.nix` and `guest/modules/lid.nix` already reference both `main-space-sway-kiosk.service` and `korri-kiosk.service`; these service-name references are substrate ordering/support for either compositor owner, not a Korri flake dependency.
- `guest/scripts/static-checks.sh` currently asserts the old Korri-dependent shape and must invert after cleanup.
- `patches/rocknix/0006-rocknix-guest-substrate.patch` embeds a host promotion path that targets the old by-compatible main-space output; this must be updated before old outputs are removed.
- `.github/workflows/build-rootfs-seed.yml` currently publishes nix-on-rocks-owned `rootfs-thor`/`rootfs-odin2portal` artifacts; it cannot remain the canonical Korri appliance publisher after cleanup.

**korri repo**

- `nix/images/common.nix` already exposes `mkHeadlessSystem` and `mkKioskSystem` with a `platformModules` seam.
- `nix/images/kiosk.nix` already models the appliance target: server + client + kiosk + inputd.
- `nix/modules/korri-kiosk.nix` supports root-owned constrained guests, existing session D-Bus, platform-owned input providers, and platform Sway fragments.
- `nix/modules/korri-server.nix` supports a non-root system service; this is compatible with a root-owned kiosk session as long as tests assert the boundary.
- `tools/testing/nix/korri-image-outputs-eval.*` provide the pattern for Nix evaluation tests that inspect product system shape without building the full system.
- `docs/deployment/korri-images.md` already documents product systems and the platform adapter seam.

### Institutional Learnings

- Korri image helpers must keep platform facts out of generic modules; platform-specific facts belong at the image/platform adapter boundary.
- NixOS module lifecycle seams should fail closed with assertions and eval tests for unsafe user/runtime combinations.
- Device deploy is convergence, not just a build; build gates must be paired with session/rootfs authority checks before old paths are removed.
- RockNix guest/rootfs promotion should use live system/generation evidence, not stale marker files.
- Older learning docs still describe Nix-on-Rocks consuming Korri outputs. The confirmed origin requirements supersede that older direction for this inversion: Korri is now the downstream consumer of nix-on-rocks substrate.

### External References

External research was skipped. This is a repo-specific Nix flake/module boundary refactor with strong local docs and implementation patterns.

---

## Key Technical Decisions

- New public substrate contract is introduced before removal: nix-on-rocks adds the substrate module and device-selection helpers while old main-space outputs remain available.
- Public contract over copy-paste: Korri consumes nix-on-rocks modules/profiles/helpers rather than duplicating the SM8550 device map.
- Explicit per-device targets are build gates: Thor and Sobo get explicit Korri kiosk targets. The by-compatible target is impure/on-device convenience and is not the primary Fuji/CI build gate.
- Rootfs aliases move with deploy authority: Korri should expose rootfs aliases in addition to NixOS configuration and system-toplevel package aliases, because current Sobo/rootfs seed flows consume tarball artifacts.
- Server is included as part of the kiosk appliance target: Thor and Sobo are never server-only, but the appliance target follows Korri's existing split where the server is non-root and the kiosk session can run as root.
- The additive coexistence graph must remain acyclic: during the temporary window where both repos have flake inputs, nix-on-rocks must not refresh its Korri lock to a Korri revision that already imports nix-on-rocks.
- RockNix-backed Korri systems use the nix-on-rocks substrate package set for NixOS evaluation: Korri product packages still come from Korri outputs, but the system evaluation must not silently drift to Korri's generic image channel.
- Host promotion must be executable-proven before cleanup: removing the old by-compatible nix-on-rocks output is not safe while the ROCKNIX patch still builds that output, and static patch review is not enough to prove the replacement.
- Rootfs buildability gates deploy authority: Korri's system-toplevel aliases are useful review gates, but Korri must also produce the rootfs artifact and provenance needed by current Sobo seed/promotion flows before being marked canonical.
- Static checks need two boundary modes: during the additive window they permit legacy outputs only in legacy entrypoints while forbidding Korri product references in the new substrate contract; after cleanup they forbid live Korri references in nix-on-rocks Nix surfaces.

---

## Open Questions

### Resolved During Planning

- Should Thor/Sobo ever expose server-only RockNix targets? No. Thor and Sobo are kiosk appliance targets only.
- Should the first Korri RockNix kiosk target include the server? Yes, as part of the kiosk appliance model, following Korri's existing kiosk image pattern with a non-root server and root kiosk session where the platform requires it.
- Should by-compatible be a CI/build package gate? No. Explicit per-device aliases are the reliable off-device build gates; by-compatible remains impure/on-device convenience.

### Deferred to Implementation

- Exact factoring of the new substrate module: implementation may extract from `main-space.nix` or introduce a new module body, provided the public contract is substrate-only and old outputs remain stable until cleanup.
- Exact host-promotion target plumbing: implementation should preserve operator safety while moving away from the old in-repo product target; final shape depends on the existing patch context.
- Exact CI workflow split between Korri and nix-on-rocks after cutover: implementation should keep the smallest useful gate in each repo and avoid duplicating expensive aarch64 builds unnecessarily.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Dependency direction

```text
CURRENT (wrong direction)

┌────────────────────────────┐
│ nix-on-rocks                │
│  substrate + SM8550 guest   │
│                            │
│  ┌──────────────────────┐  │
│  │ imports korri ❌      │──┼──▶ korri
│  │ builds main-space     │  │
│  │ Sobo/Thor kiosk       │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

```text
TARGET (correct direction)

┌────────────────────────────┐
│ nix-on-rocks                │
│  SM8550 substrate only      │
│                            │
│  exports:                   │
│   • rocknix-guest-base      │
│   • device profiles         │
│   • Cemu/Steam/input/etc    │
│   • launchers/helpers       │
│   • rootfs packaging lib    │
└──────────────▲─────────────┘
               │ imports
┌──────────────┴─────────────┐
│ korri                       │
│  product/appliance layer    │
│                            │
│  builds kiosk targets:      │
│   • Thor  = kiosk appliance │
│   • Sobo  = kiosk appliance │
│                            │
│  each appliance includes:   │
│   • server                  │
│   • electrobun client       │
│   • sway kiosk              │
│   • inputd                  │
│   • selected apps           │
└────────────────────────────┘
```

### Migration state matrix

```text
┌───────┬────────────────────────────┬────────────────────────────┬──────────────────────────────┐
│ State │ nix-on-rocks                │ korri                      │ Deploy/build authority        │
├───────┼────────────────────────────┼────────────────────────────┼──────────────────────────────┤
│ S0    │ old Korri pin, old outputs  │ no RockNix input           │ nix-on-rocks old target       │
│ S1    │ bumped Korri pin            │ no RockNix input           │ nix-on-rocks old target       │
│ S2    │ adds substrate contract     │ no RockNix input           │ nix-on-rocks old target       │
│ S3    │ old outputs still present   │ adds RockNix kiosk targets │ both build; Korri candidate   │
│ S4    │ host promotion configurable │ Korri target documented    │ Korri canonical, old fallback │
│ S5    │ Korri input removed         │ Korri target canonical     │ Korri only                    │
└───────┴────────────────────────────┴────────────────────────────┴──────────────────────────────┘
```

### Implementation sequence

```text
┌────┐
│ U1 │  Tactical Korri pin bump in nix-on-rocks
└─┬──┘  Current Sobo target builds again
  │
  ▼
┌────┐
│ U2 │  nix-on-rocks exports rocknix-guest-base
└─┬──┘  Old main-space targets still exist
  │
  ▼
┌────┐
│ U3 │  korri imports nix-on-rocks
└─┬──┘  Adds Thor/Sobo kiosk appliance targets
  │
  ▼
┌────┐
│ U4 │  Korri eval/build gates and docs
└─┬──┘
  │
  ▼
┌────┐
│ U5 │  Host promotion and deploy authority cutover
└─┬──┘  Korri becomes canonical deploy source
  │
  ▼
┌────┐
│ U6 │  Strip Korri from nix-on-rocks
└─┬──┘  Remove old main-space/rootfs outputs
  │
  ▼
┌────┐
│ U7 │  Final historical/operator docs cleanup
└────┘  No stale docs point at old product targets
```

### Appliance invariant

```text
Thor/Sobo ≠ server-only
Thor/Sobo = kiosk appliance

kiosk appliance
├── server
├── electrobun client
├── sway kiosk
└── inputd
```

### Operator-facing target names

| Surface | Canonical Korri target | Old nix-on-rocks fallback during coexistence | Notes |
|---------|-------------------------|----------------------------------------------|-------|
| Sobo NixOS config | `nixosConfigurations.korri-rocknix-kiosk-odin2portal` | `nixosConfigurations.rocknix-guest-main-space-odin2portal` | Explicit per-device target for deploy authority and review. |
| Thor NixOS config | `nixosConfigurations.korri-rocknix-kiosk-thor` | `nixosConfigurations.rocknix-guest-main-space-thor` | Thor remains a kiosk appliance, never server-only. |
| Sobo system package alias | `packages.aarch64-linux.korri-rocknix-kiosk-system-odin2portal` | none | Fuji/off-device system-toplevel build gate. |
| Thor system package alias | `packages.aarch64-linux.korri-rocknix-kiosk-system-thor` | none | Fuji/off-device system-toplevel build gate. |
| Sobo rootfs alias | `packages.<host-system>.korri-rocknix-rootfs-odin2portal` | `packages.<host-system>.rootfs-odin2portal` | Deploy-authority/rootfs seed gate. |
| Thor rootfs alias | `packages.<host-system>.korri-rocknix-rootfs-thor` | `packages.<host-system>.rootfs-thor` | Thor rootfs artifact parity. |
| By-compatible config | `nixosConfigurations.korri-rocknix-kiosk-by-compatible` | `nixosConfigurations.rocknix-guest-main-space-by-compatible` | Impure/on-device convenience only; not the primary CI/Fuji gate. |

---

## Implementation Units

### U1. Tactical Korri pin bump in nix-on-rocks

**Goal:** Make the current nix-on-rocks Sobo target buildable on aarch64 while the additive replacement is prepared.

**Requirements:** R6, R7; origin F1, R13, R16, AE4

**Dependencies:** None

**Files:**

**nix-on-rocks repo**
- Modify: `flake.lock`
- Modify: `docs/migration/2026-05-22-korri-dependency-direction-violation.md`

**Approach:**
- Update the locked Korri input to a revision that contains the bun2nix migration verified on Fuji.
- Keep the pin on a Korri revision that does not import nix-on-rocks; this preserves an acyclic temporary graph until nix-on-rocks removes the Korri input in U6.
- Do not change flake architecture in this unit.
- Record the pre-cutover fallback: old Sobo target name, rootfs seed source, and last-known-good build/provenance evidence.
- Update the migration doc to record that the aarch64 fixed-output dependency drift was resolved upstream and that the remaining work is dependency-direction inversion.

**Execution note:** Treat this as a characterization-preserving preparatory unit. It should prove the old target is buildable before any refactor touches ownership.

**Patterns to follow:**
- Existing lock-file-only input updates in `flake.lock`.
- Existing migration note style in `docs/migration/2026-05-22-korri-dependency-direction-violation.md`.

**Test scenarios:**
- Happy path: current Sobo main-space target builds on Fuji after the pin bump without the old `korri-bun-deps` hash mismatch.
- Happy path: current Sobo rootfs seed artifact can be produced with usable SHA/provenance material.
- Edge case: the temporary nix-on-rocks Korri lock does not point at a Korri revision that imports nix-on-rocks.
- Error path: if the current Sobo target or rootfs seed cannot be produced, failure is not hidden by the inversion plan; stop before U2.
- Regression: static checks that still represent the pre-inversion world continue to pass after the lock update.

**Verification:**
- The current nix-on-rocks Sobo target reaches a system toplevel on aarch64.
- The current nix-on-rocks Sobo rootfs seed artifact remains available as a documented pre-cutover fallback.
- The temporary coexistence graph remains acyclic.
- The migration doc clearly separates the tactical pin bump from the architectural inversion.

---

### U2. Expose the nix-on-rocks substrate contract additively

**Goal:** Add the stable downstream import surface Korri will consume without removing the existing nix-on-rocks main-space/rootfs outputs.

**Requirements:** R3, R4, R6; origin F2, R4, R5, R6, R7, R8, AE3, AE5

**Dependencies:** U1

**Files:**

**nix-on-rocks repo**
- Modify: `flake.nix`
- Create or modify: `guest/profiles/rocknix-guest-base.nix`
- Modify: `guest/profiles/main-space.nix`
- Modify: `guest/scripts/static-checks.sh`
- Modify: `guest/README.md`
- Modify: `docs/contracts/layer14-main-space-contract.md`

**Approach:**
- Expose `nixosModules.rocknix-guest-base` as the single substrate import contract.
- Keep old `main-space` and rootfs outputs intact in this unit so Sobo's current deploy path remains available.
- Make the public substrate contract product-blind: it must evaluate without importing Korri modules and must not write `services.korri.*` product options. Narrow runtime service-name references are allowed only for ordering/cgroup support where the substrate must support either compositor owner.
- Keep user-launchable app selection out of the substrate contract. Korri selects Cemu and moonlight in U3; Steam remains substrate-owned only because the origin requirements defer splitting its OS/runtime wrapper.
- Expose and document the device-profile API Korri will consume, including explicit device profiles and by-compatible selection behavior.
- Add transitional static checks that permit legacy outputs only in legacy entrypoints while forbidding Korri product references in the new substrate contract.

**Execution note:** Characterization-first. Preserve behavior of existing main-space outputs while adding the new contract.

**Technical design:**

```text
nix-on-rocks substrate contract
├── base/container policy
├── SM8550 device/profile facts
├── display/audio/input/network/lid/session plumbing
├── Steam runtime plumbing (temporary substrate ownership)
├── Cemu launchers/helpers stay here
└── no product decision that selects Korri client/server/kiosk outputs
```

**Patterns to follow:**
- Path-valued `nixosModules` exports in `flake.nix` so downstream relative imports still resolve.
- Existing `guest/modules/*` separation for substrate concerns.
- Existing `deviceProfileByCompatible` comments explaining off-device explicit targets versus impure device selection.

**Test scenarios:**
- Happy path: a downstream NixOS evaluation can import `rocknix-guest-base` and a device profile without requiring nix-on-rocks to import Korri.
- Covers AE3. Existing substrate-only `rocknix-guest` remains buildable/evaluable while the new substrate contract exists.
- Covers AE5. The substrate contract includes OS-coupled runtime concerns but does not itself choose Korri product apps.
- Edge case: by-compatible helper fails closed when no compatible value is supplied.
- Edge case: by-compatible helper fails closed when an unknown compatible value is supplied.
- Error path: transitional static checks fail if the new substrate contract writes Korri product service options.
- Regression: old main-space/rootfs outputs remain present and buildable during the additive window.

**Verification:**
- `rocknix-guest-base` is exported and documented.
- Device profile mapping is available to downstream consumers from nix-on-rocks.
- No existing Sobo/Thor old target is removed by this unit.

---

### U3. Add Korri RockNix-backed kiosk appliance outputs

**Goal:** Make Korri the owner of Thor and Sobo RockNix-backed kiosk appliance targets while consuming nix-on-rocks as substrate.

**Requirements:** R1, R2, R4, R5, R6; origin F2, R1, R2, R5, R9, R10, R11, R12, R17, AE2, AE5

**Dependencies:** U2

**Files:**

**korri repo**
- Modify: `flake.nix`
- Modify: `flake.lock`
- Create: `nix/images/platforms/rocknix-sm8550.nix`
- Modify: `docs/deployment/korri-images.md`
- Modify: `docs/deployment/korri-nixos-modules.md`

**Approach:**
- Add `nix-on-rocks` as a Korri flake input.
- Compose Korri's kiosk product modules with the nix-on-rocks substrate contract and device profiles.
- Consume only the substrate-safe nix-on-rocks surfaces: `rocknix-guest-base`, device-profile helpers, substrate packages, and rootfs packaging library. Do not reference legacy nix-on-rocks main-space configs, stage proof configs, or product rootfs aliases from Korri.
- Evaluate RockNix-backed systems against the nix-on-rocks substrate package set/channel while installing Korri product packages from Korri outputs. Do not let these outputs silently drift to Korri's generic image nixpkgs.
- Expose explicit Thor and Sobo/Odin 2 Portal kiosk appliance `nixosConfigurations`.
- Expose by-compatible as an impure/on-device configuration target, not as the primary off-device build gate.
- Expose package aliases for system toplevels and rootfs tarball aliases for supported devices.
- Ensure the appliance model includes server, electrobun client, kiosk, and inputd; server stays non-root, kiosk uses the root/existing-bus constrained-guest settings.
- Explicitly select user-launchable app packages from nix-on-rocks for the appliance image, including Cemu and moonlight-embedded.

**Technical design:**

```text
Korri RockNix kiosk target
├── Korri product modules
│   ├── server       (non-root system service)
│   ├── client       (electrobun device package)
│   ├── kiosk        (root Sway session in RockNix guest)
│   └── inputd       (native input bridge)
├── nix-on-rocks substrate
│   ├── rocknix-guest-base
│   ├── Thor/Sobo device profile
│   ├── session bus/input/audio/display/lid plumbing
│   └── Cemu launchers + Steam runtime plumbing
└── Korri-selected product apps
    ├── Cemu
    └── moonlight-embedded
```

**Patterns to follow:**
- `nix/images/common.nix` platform module seam.
- `nix/images/kiosk.nix` appliance composition pattern.
- `nix/images/platforms/x86.nix` as an example of platform-specific kiosk input/provider defaults.
- `docs/deployment/korri-images.md` product-system terminology.

**Test scenarios:**
- Covers AE2. Sobo/Odin 2 Portal package alias evaluates to a system toplevel derivation on aarch64.
- Covers AE2. Thor package alias evaluates to a system toplevel derivation on aarch64.
- Covers AE5. Korri-selected appliance system includes the expected Cemu and moonlight-embedded executables in the system path.
- Happy path: appliance target includes server, client, kiosk, and inputd.
- Happy path: RockNix-backed targets use the intended nix-on-rocks substrate package set while generic Korri image outputs remain unchanged.
- Edge case: server is non-root while kiosk is root; evaluation rejects accidental root server system mode.
- Edge case: by-compatible target is documented/treated as impure and does not become the only off-device build path.
- Error path: Korri eval/static checks fail if the RockNix outputs reference nix-on-rocks legacy main-space, stage proof, or product rootfs aliases.
- Regression: generic x86 `korri-kiosk-system` remains free of SM8550/RockNix facts.

**Verification:**
- Korri exposes Thor and Sobo/Odin 2 Portal kiosk appliance configuration targets.
- Korri exposes matching system toplevel package aliases and rootfs aliases for explicit devices.
- Generic Korri image helpers remain product-generic; RockNix facts live at the platform/output boundary.

---

### U4. Add Korri eval and build gates for RockNix outputs

**Goal:** Make the new Korri-owned RockNix appliance targets reviewable, regression-tested, and suitable for Fuji/aarch64 verification.

**Requirements:** R2, R5, R7; origin F2, R9, R10, R17, AE2, AE5

**Dependencies:** U3

**Files:**

**korri repo**
- Create: `tools/testing/nix/korri-rocknix-image-eval.fixture.nix`
- Create: `tools/testing/nix/korri-rocknix-image-eval.test.ts`
- Modify: `tools/testing/nix/korri-image-outputs-eval.test.ts`
- Modify: `tools/testing/nix/korri-image-outputs-eval.fixture.nix`
- Modify: `.github/workflows/desktop-stage2.yml` or create a targeted Nix workflow under `.github/workflows/`

**Approach:**
- Add eval coverage for RockNix appliance output names, service shape, app selection, rootfs aliases, provenance expectations, and device-map sourcing.
- Assert Thor and Sobo are kiosk appliance outputs only.
- Assert the generated service shape: server enabled and non-root, client enabled, kiosk enabled as root, input provider points at substrate input plumbing, existing session bus is used.
- Assert Korri does not duplicate nix-on-rocks device-compatible mapping.
- Assert Korri RockNix outputs consume only substrate-safe nix-on-rocks surfaces and do not force legacy product composition attrs during coexistence.
- Assert the target contains the existing launch surface expected by the current kiosk/session contract without adding new Korri UI/runtime behavior in this plan.
- Add a focused aarch64 build gate for the explicit Sobo system package alias once output evaluation is stable.
- Add the explicit Sobo rootfs alias as the deploy-authority build gate; system toplevel builds are necessary but not sufficient for cutover.

**Patterns to follow:**
- `tools/testing/nix/korri-image-outputs-eval.fixture.nix`
- `tools/testing/nix/korri-image-outputs-eval.test.ts`
- Existing Bun test style for Nix fixture evaluation.

**Test scenarios:**
- Covers AE2. Explicit Sobo package alias exists and has a derivation path.
- Covers AE2. Explicit Thor package alias exists and has a derivation path.
- Covers AE2. Explicit Sobo rootfs alias can produce the deployable artifact/provenance expected by the rootfs seed path.
- Covers AE5. Generated system includes product-selected Cemu and moonlight-embedded package outputs.
- Happy path: generated system contains the current launchers/configuration expected by the existing kiosk/session flow for selected apps.
- Happy path: server/client/kiosk/inputd are all enabled for both Thor and Sobo.
- Edge case: kiosk runs as root with `createUser = false` while server stays non-root.
- Edge case: by-compatible target fails clearly without the expected device-compatible input.
- Regression: generic image modules still contain no Snapdragon/RockNix hardware facts.

**Verification:**
- Korri unit tests include the new eval fixture.
- Fuji can build the explicit Sobo package alias end-to-end on aarch64 before any nix-on-rocks cleanup removes the old target.
- Fuji can build the explicit Sobo rootfs alias and produce provenance material before Korri is marked canonical for deploy.

---

### U5. Gate deploy authority and host promotion cutover

**Goal:** Make the transition from nix-on-rocks-owned Sobo target to Korri-owned Sobo target operationally safe before old outputs are removed.

**Requirements:** R5, R6, R7; origin F3, R9, R10, R13, R14, R17, AE4

**Dependencies:** U3, U4

**Files:**

**nix-on-rocks repo**
- Modify: `patches/rocknix/0006-rocknix-guest-substrate.patch`
- Modify: `.github/workflows/build-rootfs-seed.yml`
- Modify: `README.md`
- Modify: `guest/README.md`
- Modify: `docs/migration/2026-05-22-korri-dependency-direction-violation.md`
- Modify: `docs/contracts/layer14-main-space-contract.md`

**korri repo**
- Modify: `docs/deployment/korri-images.md`
- Modify: `.github/workflows/desktop-stage2.yml` or the targeted RockNix rootfs workflow introduced in U4, if artifact publication belongs in Korri CI

**Approach:**
- Treat cutover as a gated promotion unit, not documentation-only.
- Change host promotion/rootfs seed assumptions so they no longer require nix-on-rocks to own the product by-compatible main-space target.
- Separate source-promotion metadata from rootfs seed authority: the host/substrate side must know which product authority repo/revision/output produced the artifact it promotes.
- Define the minimum canonical rootfs artifact path before cutover: who builds it, where it is published or fetched from, what provenance accompanies it, and which old nix-on-rocks publishing surface becomes fallback-only or disabled.
- Mark Korri canonical only after the explicit Sobo system package alias and Sobo rootfs alias pass aarch64 verification.
- Preserve operator safety by requiring one canonical target and one fallback target during coexistence.
- Keep production redeploy out of this unit; the unit prepares the path and updates authority docs.

**Cutover invariants:**
- Fresh-device path: a first-boot rootfs seed exists for Sobo from the canonical Korri target before old product outputs are removed.
- Existing-device path: host promotion can build or promote the canonical Korri target without hard-coding the old nix-on-rocks by-compatible output.
- Recovery path: the old nix-on-rocks target remains available until the Korri fresh-device and existing-device paths are verified.
- Provenance: seed metadata records product authority, product revision, substrate revision/input, device, compatible string, flake output, artifact SHA, and split-asset ordering when assets are split.

**Patterns to follow:**
- Existing comments and failure modes in `patches/rocknix/0006-rocknix-guest-substrate.patch` around by-compatible dispatch.
- Existing rootfs seed workflow safety behaviors: SHA material, manifest, split release assets, native arm64 runner.
- Migration-doc style in `docs/migration/2026-05-22-korri-dependency-direction-violation.md`.

**Test scenarios:**
- Covers AE4. During coexistence, docs identify exactly one canonical target and exactly one temporary fallback target.
- Happy path: host promotion/rootfs seed path can target the Korri-owned artifact without needing nix-on-rocks to import Korri.
- Happy path: seed/promotion provenance identifies both Korri product revision and nix-on-rocks substrate revision.
- Error path: if no target is configured or the target is unknown, host promotion fails closed before building the wrong artifact.
- Error path: if the Korri rootfs alias has not passed aarch64 verification, Korri cannot be marked canonical.
- Integration: the promotion path is run or simulated against the Korri-owned target in the same staged-source/source-namespace assumptions used on device before old outputs are removed.
- Regression: the promotion proof fails if it still invokes the retired nix-on-rocks by-compatible product target.
- Regression: old nix-on-rocks target remains usable as fallback until U6 removes it.

**Verification:**
- A reviewer can identify the canonical Sobo deploy source from docs.
- Patch/static checks no longer hard-code the old product output as the only viable host promotion target.
- Korri's explicit Sobo rootfs artifact is the gate for marking Korri canonical.
- An executable promotion proof demonstrates that the host promotion path can target the Korri-owned appliance output and fails closed for missing/unknown targets.
- This unit does not perform a production redeploy.

---

### U6. Strip Korri product composition from nix-on-rocks

**Goal:** Close the temporary coexistence window by removing the Korri flake input and product-owned main-space/rootfs outputs from nix-on-rocks.

**Requirements:** R1, R3, R4, R6, R7; origin F4, R1, R3, R7, R15, R18, AE1, AE3

**Dependencies:** U5 (including verified Korri Sobo rootfs artifact, executable host promotion proof, canonical/fallback docs, and archived pre-cutover fallback evidence)

**Files:**

**nix-on-rocks repo**
- Modify: `flake.nix`
- Modify: `flake.lock`
- Modify: `guest/profiles/main-space.nix`
- Modify: `guest/scripts/static-checks.sh`
- Modify: `.github/workflows/build-rootfs-seed.yml`
- Modify: `guest/README.md`
- Modify: `README.md`
- Modify: `docs/contracts/layer14-main-space-contract.md`

**Approach:**
- Treat cleanup as blocked until active host/workflow/static-check surfaces no longer require the retired product outputs.
- Treat cleanup as blocked until the executable promotion proof from U5 has passed against the exact Korri-owned target that will remain after cleanup.
- Re-verify the canonical Korri target/rootfs against the exact immutable Korri revision and artifact provenance recorded in U5; do not rely only on stale cutover docs.
- Remove `inputs.korri` and all live Korri flake imports from nix-on-rocks.
- Remove `mainSpaceConfigurationFor` and the Korri-owned `rocknix-guest-main-space-*`, `rocknix-guest-stage10-proof-*`, and product rootfs aliases from nix-on-rocks.
- Retain `rocknix-guest`, `rocknix-guest-dev-env`, substrate package outputs, `rocknix-guest-base`, device profiles, device-selection helpers, and rootfs packaging helper library.
- Invert static checks so live Nix surfaces forbid Korri imports and require the retained substrate surfaces, with a narrow allowlist for runtime service-name references that are not flake/module dependencies.
- Remove, move, or mark non-canonical the rootfs seed publishing path that previously treated nix-on-rocks as appliance rootfs authority.
- Update active ROCKNIX patch queue and contract verification surfaces in this unit if they still reference old product outputs; do not defer active breakage to U7.

**Execution note:** This is the boundary-enforcing unit. Do not start it until Korri replacement outputs and deploy authority docs are merged and verified.

**Patterns to follow:**
- Existing `guest/scripts/static-checks.sh` style for broad string/shape guards.
- Existing substrate-only `nixosConfigurations.rocknix-guest` and `rocknix-guest-dev-env` shape.

**Test scenarios:**
- Covers AE1. Live nix-on-rocks Nix surfaces contain no Korri flake input and no Korri product composition.
- Covers AE3. Substrate-only guest targets still evaluate/build after product outputs are removed.
- Happy path: substrate package outputs for Cemu, moonlight-embedded, inputplumber, and UCM remain available.
- Happy path: active patch queue and SM8550 contract checks no longer require retired nix-on-rocks product outputs.
- Error path: static checks fail if a future change reintroduces Korri as a flake input or product module import.
- Error path: cleanup is no-go if deleting old outputs would make either fresh install or in-place promotion depend on a missing flake attribute.
- Error path: cleanup is no-go if the promotion proof still depends on the retired nix-on-rocks by-compatible product output.
- Error path: cleanup is no-go if the immutable Korri revision/artifact recorded in U5 no longer verifies.
- Regression: launcher scripts that intentionally reference `korri-kiosk.service` as a runtime service name remain allowed where they are supporting either compositor owner, not importing Korri.

**Verification:**
- nix-on-rocks no longer has a Korri input in `flake.nix` or `flake.lock`.
- The retained substrate smoke targets and package outputs build/evaluate on aarch64.
- Static checks enforce the new boundary rather than the old one.
- Active patch queue, workflow, and host promotion surfaces no longer require removed product output names.
- The documented rollback/fallback evidence exists before old outputs are removed.
- The cleanup commit is tied to an immutable, verified Korri product revision/artifact rather than a movable branch name.

---

### U7. Final historical documentation cleanup

**Goal:** Remove or retire stale old-target references from historical docs and non-active operator documentation so the new authority is durable.

**Requirements:** R1, R3, R6, R7; origin F3, F4, R13, R14, R15, R18, AE1, AE4

**Dependencies:** U6

**Files:**

**nix-on-rocks repo**
- Modify: `patches/rocknix/0007-product-docs-plans-and-acceptance-evidence.patch`
- Modify: `docs/migration/2026-05-22-korri-dependency-direction-violation.md`
- Modify: `docs/ops/` docs that name rootfs/product targets, if present
- Modify: `README.md`
- Modify: `guest/README.md`

**korri repo**
- Modify: `docs/deployment/korri-images.md`

**Approach:**
- Audit remaining references to old nix-on-rocks main-space/rootfs target names.
- Keep historical docs factual but mark old targets as retired where relevant.
- Do not leave active patch-queue or verifier fixes for this unit; those are U5/U6 blockers.
- Document the local override workflow in the new direction: Korri developers override `nix-on-rocks` locally when testing substrate changes, not the reverse.

**Patterns to follow:**
- Existing migration note style for completed structural work.
- Existing docs that distinguish historical evidence from current operational authority.

**Test scenarios:**
- Covers AE1. Grepping live Nix/workflow surfaces finds no active dependency on retired nix-on-rocks main-space target names.
- Covers AE4. Documentation names Korri as the canonical deploy/build authority for Thor/Sobo kiosk appliances.
- Regression: historical evidence remains understandable and is not rewritten as if old targets never existed.

**Verification:**
- Active patch application and SM8550 contract verification already pass from U6.
- Operator docs and migration docs no longer send users to removed product outputs.
- Documentation reflects the S5 state reached in U6.

---

## System-Wide Impact

- **Interaction graph:** The flake dependency graph changes from nix-on-rocks → Korri to Korri → nix-on-rocks. Host promotion and rootfs seed paths must stop assuming nix-on-rocks owns product appliance outputs.
- **Error propagation:** by-compatible selection remains fail-closed for missing/unknown compatible strings. Host promotion must fail closed when no deploy target is configured rather than silently building a retired target.
- **State lifecycle risks:** During coexistence, two buildable targets may exist. Docs and checks must identify which one is canonical and which is fallback.
- **API surface parity:** Korri exposes NixOS configs for deploy-style consumers and package/rootfs aliases for build/rootfs consumers. nix-on-rocks exposes substrate modules/helpers/packages only.
- **Integration coverage:** Unit/eval tests prove shape; Fuji/aarch64 builds prove derivation buildability; device or nspawn smoke remains necessary before production redeploy but is outside this plan's active execution.
- **Unchanged invariants:** Cemu launchers stay in nix-on-rocks; Steam stays substrate-owned for now; Thor/Sobo remain kiosk appliance devices; generic Korri images remain free of RockNix hardware facts.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Removing old nix-on-rocks outputs before Korri replacement is verified breaks Sobo deployability. | Enforce additive sequence: U1-U5 before U6; treat U6 as blocked until Korri target builds and authority docs are updated. |
| Host promoter still builds the removed by-compatible target. | Update host promotion/cutover path in U5 before cleanup, then audit in U7. |
| Substrate module still owns Korri service options after input removal. | Make `rocknix-guest-base` a substrate contract and move Korri option writes into Korri composition; cover with eval/static checks. |
| Server/kiosk user model regresses in constrained RockNix guest. | Add Korri eval tests asserting non-root server and root kiosk session shape. |
| by-compatible package alias becomes an unreliable CI gate. | Use explicit per-device package aliases for Fuji builds; keep by-compatible impure/on-device. |
| Product app selection omits executables launchers expect. | Assert generated appliance system includes Cemu and moonlight-embedded executable postconditions. |
| Static checks lag the architecture. | Add transitional checks for the new substrate contract in U2, then invert live-surface checks in U6. |
| Rootfs seed workflow keeps publishing nix-on-rocks artifacts as canonical. | Move, retarget, disable, or clearly mark that workflow non-canonical before old product outputs are removed. |
| Operators confuse fallback and canonical targets during coexistence. | U5 docs must name exactly one canonical target, one fallback target, and the state in which each applies. |
| U6 lands before active ROCKNIX patch queue is updated. | Make patch queue and contract verification compatibility a U6 prerequisite, not U7 cleanup. |
| Cross-repo locks form a cycle during coexistence. | Keep nix-on-rocks pinned to a pre-inversion Korri revision until the Korri input is removed. |
| Older learning docs conflict with confirmed direction. | Treat the origin requirements and this plan as the current source of truth; update migration docs as the work lands. |

---

## Documentation / Operational Notes

- Update both repos' deployment docs because the operational authority moves from nix-on-rocks to Korri.
- Keep the tactical pin-bump note separate from the inversion note so future readers understand that bun2nix fixed buildability, not architecture.
- Do not document production redeploy as completed by this plan.
- Document local cross-repo overrides in the new direction from Korri to nix-on-rocks.
- Mark retired nix-on-rocks product outputs as historical/fallback during coexistence, then removed after cleanup.
- Rollback before U6 means keeping Korri non-canonical and using the documented nix-on-rocks fallback target/seed.
- Rollback after U6 does not restore removed outputs; fallback becomes the archived pre-cutover seed/revision, previous guest generation, and ROCKNIX recovery path.
- A failed Korri candidate blocks authority cutover; it must not trigger cleanup.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-22-001-korri-dependency-direction-inversion-requirements.md](../brainstorms/2026-05-22-001-korri-dependency-direction-inversion-requirements.md)
- Related migration doc: [docs/migration/2026-05-22-korri-dependency-direction-violation.md](../migration/2026-05-22-korri-dependency-direction-violation.md)
- Related prior plan: [docs/plans/2026-05-22-001-refactor-monorepo-merge-layered-restructure-plan.md](2026-05-22-001-refactor-monorepo-merge-layered-restructure-plan.md)
- nix-on-rocks repo surfaces: `flake.nix`, `guest/profiles/main-space.nix`, `guest/modules/`, `guest/scripts/static-checks.sh`, `patches/rocknix/0006-rocknix-guest-substrate.patch`
- korri repo surfaces: `flake.nix`, `nix/images/`, `nix/modules/`, `tools/testing/nix/`, `docs/deployment/korri-images.md`
