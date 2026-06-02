---
title: "feat: SM8550 Thor product-payload intake (bandai)"
type: feat
status: completed
date: 2026-05-28
origin: docs/plans/2026-05-26-002-refactor-rocknix-product-payload-emission-plan.md
verify_command: "just check"
---

# feat: SM8550 Thor product-payload intake (bandai)

## Summary

Bring the AYN Thor (`ayn,thor`, host `bandai`) through the Korri-owned product-payload contract that shipped for Odin2Portal on branch `refactor/rocknix-product-payload`. The plan rebases that unmerged branch on trunk and extends it so Odin2Portal and Thor are emitted as sibling product-payload artifacts from the same PR, then teaches the nix-on-rocks SM8550 substrate to select which product-payload lock to consume per image build, then exercises the new lane through CI image-only and full builds, and finally writes a Thor device acceptance record patterned on the Sobo boot-hint acceptance.

---

## Problem Frame

The dependency-direction inversion established Korri as the SM8550 product authority and nix-on-rocks as the substrate. The 2026-05-26-002 plan shipped the Odin2Portal product-payload emission on branch `refactor/rocknix-product-payload`, but that branch never merged and its `Deferred to Follow-Up Work` lists "Later explicit-device expansion: add Thor product-payload artifacts as a separate explicit device output." Today's Thor lane is still pre-product-payload: Thor is wired at the Korri Nix config layer (`korri-rocknix-kiosk-thor`, `korri-rocknix-rootfs-thor`, `korri-rocknix-kiosk-system-thor` on trunk) and at the substrate explicit-device layer (`thor|odin2portal` static checks), but no end-to-end Korri→nix-on-rocks→device payload handoff has been proven for Thor. Bringing Thor through the same contract that Sobo now consumes is the load-bearing test that the substrate is actually product-blind.

---

## Requirements

- R1. Korri must emit a Thor product-payload bundle (`korri-rocknix-product-payload-thor`) using the same `PRODUCT_*` vocabulary the Odin2Portal payload uses, wrapping the existing `korri-rocknix-rootfs-thor` rootfs without renaming or removing existing aliases. (origin R1, R2, deferred-Thor line)
- R2. Korri must ship Odin2Portal and Thor product-payload outputs side-by-side from the same merged PR; the payload-emission seam must be product-parameterized rather than per-device duplicated. (architectural decision: compound at first merge, do not retrofit)
- R3. The Korri payload Nix wrapper, contract fixture, native check, finalize CLI, and CI lane must all support both products with no Odin2-specific hardcodes left at the seam.
- R4. The Korri branch must be rebased onto trunk before extension, preserving trunk's `nixos-25.11` nixpkgs pin, trunk's expanded `standardChecks` list, trunk's sessiond/RetroArch/Moonlight check additions, and trunk's new `fake-08-src` flake input shape.
- R5. The nix-on-rocks SM8550 substrate must accept a per-product lock at image-build time: `product-payload-odin2portal.lock` and `product-payload-thor.lock` coexist in the substrate repo, and an explicit `product` workflow/build input selects which one is consumed for a given image cut.
- R6. `scripts/render-product-payload`, `scripts/verify-product-payload`, `scripts/verify-sm8550-locks`, `scripts/verify-sm8550-payloads`, and the `build-image-only.yml`/`build-sm8550.yml` workflows must all honor the per-product selector and fail closed when the selector does not match a published lock.
- R7. A Thor image must be built end-to-end via `build-sm8550.yml` and the artifact verified before any device traffic.
- R8. The Thor device `bandai` must be observed through the same three-pass acceptance shape used for the Sobo boot-hint U3 acceptance (happy / no-op / recovery) plus a Phase-4-style payload-facts probe, and an acceptance record must be written patterned on `docs/acceptance/sm8550-product-payload-full-build-sobo-2026-05-27.md` and `docs/acceptance/sm8550-post-update-boot-hint-sobo-2026-05-28.md`.
- R9. The device acceptance step must be gated on positive confirmation that the SSH host responding at `192.168.1.239` (or wherever Thor lives) actually reports `ayn,thor` in `/proc/device-tree/compatible`. The IP-slot question raised in the handoff is a hard precondition for any device-side mutation.
- R10. The substrate must continue to fail closed when a wrong-compatible payload is presented at a device — the existing `scripts/verify-sm8550-locks` and on-device `rocknix-guest-root-ensure` gates must keep covering this for both Thor and Odin2Portal.

**Origin actors:** A1 Korri product maintainer; A2 nix-on-rocks substrate maintainer; A3 Sobo/Thor deploy operator; A4 future implementation agent (the work-loop driving this plan); A5 Fuji/aarch64 verifier.

**Origin flows:** F2 additive Korri-side replacement; F3 deploy cutover preparation; F4 nix-on-rocks cleanup preparation.

**Origin acceptance examples:** AE2 Korri replacement target builds on aarch64; AE4 no deploy no-go window; AE5 substrate/product split remains reviewable.

---

## Scope Boundaries

- Do not retire the `guest.lock` *abstraction* in this plan. U7 does split it into per-product files (`guest-odin2portal.lock` + `guest-thor.lock`) because coexistence with a single-product `guest.lock` is structurally impossible — `verify-product-payload` cross-validates `PRODUCT_ROOTFS_SEED_*` against `GUEST_*`. Full retirement of the `GUEST_*` vocabulary in favor of `PRODUCT_*` alone remains a separate phase (5) per the handoff.
- Do not change runtime per-product behavior (Moonlight Embedded variant, branding payload, gamepad mappings). The handoff explicitly raises this as a separate scope question; this plan only carries the product-payload seam.
- Do not re-introduce a `by-compatible` runtime dispatcher on the substrate. The substrate explicitly retired that path in favor of explicit per-device targets; per-product image selection happens at build time in CI.
- Do not modify Sobo's currently-running Odin2Portal image as part of Thor acceptance. Sobo stays untouched; its boot-hint U3 acceptance is the green-state baseline.
- Do not publish release assets automatically as part of this plan. Candidate artifacts plus a finalize step performed by an operator-approved release flow remain the acceptable handoff shape (consistent with origin plan scope boundary).
- Do not change the underlying Korri appliance composition for either product. The payload is a wrapper around the existing `korri-rocknix-kiosk-{thor,odin2portal}` configurations.

### Deferred to Follow-Up Work

- Retire the `GUEST_*` vocabulary entirely in favor of `PRODUCT_*` (folding `guest-${id}.lock` into `product-payload-${id}.lock`): separate plan in the nix-on-rocks repo, after this plan's seam ships. This plan ships the per-product split; retirement of the abstraction is its own work.
- Per-device Moonlight Embedded / branding payload divergence for Thor: separate plan once a concrete need surfaces.
- Migration of the `rocknix-product-payload.yml` workflow's `push.branches` filter off `refactor/rocknix-product-payload` once the branch lands on trunk: follow-up PR.
- Adding a third device to the seam (e.g., a future SM8550 product): follow-up; the seam this plan ships should make it cheap.

---

## Context & Research

### Relevant Code and Patterns

**Korri repo (cwd):**

- `.worktrees/refactor/rocknix-product-payload/nix/korri-rocknix-product-payload.nix` — already device-parameterized; `device`, `compatible`, `authorityRepo`, `sourceSubdir`, `buildTarget`, `productRevision*`, `substrateRevision` all flow in as arguments. No internal changes needed.
- `.worktrees/refactor/rocknix-product-payload/nix/product-payload-contract.nix` — checked fixture of `PRODUCT_*` and `PKG_NIX_GUEST_*` field vocabulary; already product-agnostic.
- `.worktrees/refactor/rocknix-product-payload/nix/tests/korri-rocknix-product-payload-check.nix` — currently carries 8 Odin2-specific assertion strings; must be parameterized via a `checkPayload { device, compatible, expectedBuildTarget, expectedRootfsAlias, expectedKioskSystemAlias, expectedConfigAlias }` helper called twice. Follow the `checkSystem name: system: [...]` idiom from `nix/tests/korri-rocknix-sm8550-config-check.nix`.
- `.worktrees/refactor/rocknix-product-payload/tools/artifacts/rocknix-product-payload-finalize.ts` — has 3 device-specific guards in `validateCandidate` (checks `PRODUCT_ROOTFS_SEED_DEVICE === "odin2portal"`, `PRODUCT_ROOTFS_SEED_COMPATIBLE === "ayn,odin2portal"`, archive prefix). These must be replaced with device-derived validation: read `PRODUCT_ROOTFS_SEED_DEVICE` from the candidate lock, validate the archive prefix matches, validate fields are non-empty.
- `.worktrees/refactor/rocknix-product-payload/.github/workflows/rocknix-product-payload.yml` — single-device CI lane today; will become a matrix on `device: [odin2portal, thor]`.
- Trunk `flake.nix` — adds `fake-08-src` input, `nixos-25.11` pin, sessiond/libretro-fake-08 wiring, expanded `standardChecks` to 19 items, expanded `ownerMatrix`. The rebased payload PR must merge both the branch's payload additions and trunk's broader expansions.
- Trunk `nix/tests/korri-rocknix-sm8550-config-check.nix` — already exercises `thorSystem` through `checkSystem "Thor" thorSystem`; this plan does not modify it (the payload check is its own file).
- Trunk `tools/artifacts/paths.ts` — already pattern-matches `runtimeWatchArtifactPath` addition; if a `rocknixProductPayloadCandidatePath` constant is useful for the finalize tooling, follow that shape.

**nix-on-rocks repo (`/home/simonwjackson/code/sandbox/nix-on-rocks/.worktrees/refactor/product-payload-image-consumption`):**

- `product-payload.lock` — single flat set of `PRODUCT_*` shell vars; currently Odin2Portal-only. Will become `product-payload-odin2portal.lock` (rename) + new `product-payload-thor.lock`.
- `guest.lock` — single-device today; left in place by this plan (retirement is deferred work).
- `scripts/render-product-payload` — produces the rendered package vocabulary; must learn a `--product <id>` selector and source the matching `product-payload-${id}.lock`.
- `scripts/verify-product-payload`, `scripts/verify-sm8550-locks`, `scripts/verify-sm8550-payloads`, `scripts/tests/product-payload-contract.sh` — all must accept the same `--product` selector and verify the corresponding lock.
- `scripts/build-sm8550`, `.github/workflows/build-sm8550.yml`, `.github/workflows/build-image-only.yml` — current shape consumes the single `product-payload.lock` implicitly; will gain a `product` workflow input (`odin2portal` | `thor`) plumbed through the build script.
- `work/rocknix/projects/ROCKNIX/packages/tools/rocknix-guest-substrate/tests/guest-substrate-static-checks.sh` — already covers `thor|odin2portal` as an allow-list; remains untouched.

### Institutional Learnings

- `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md` — Korri's `flake.nix` must stay pinned to `nixos-25.11`; any rebase that restores `nixpkgs-unstable` silently rebuilds aarch64 closures from source on Fuji. Verify alignment with nix-on-rocks's `original.ref` after rebase, before any aarch64 build.
- `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` (§P8) — "One device first, then a second, then breakaway." Thor is the second device; the seam ships now in shape that makes a hypothetical third device cheap, but does not pre-build for it.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md` — per-device divergence belongs in `nix/images/platforms/rocknix-sm8550.nix`, not in shared modules. This plan does not introduce per-device runtime divergence, so the platform file is unchanged; but any future Thor-only Moonlight pin or resolution default lands there.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` — for any device-side `nix copy`, use port 2222 (guest store), never port 22 (host has no usable `/nix/store`). Use `readlink -f`, not bare `readlink`. Applies identically to Thor.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — new module options should `assertions` / `lib.throwIf` at eval time, not at boot. The payload-contract check follows this posture.
- `docs/acceptance/sm8550-product-payload-full-build-sobo-2026-05-27.md` and `docs/acceptance/sm8550-post-update-boot-hint-sobo-2026-05-28.md` — the acceptance-record template for Thor; structure mirrors `Build evidence → CI artifact verification → Device apply → Three-pass acceptance → Payload-facts probe → Caveats`.
- Carried operational notes from the handoff: `/flash` is mounted `ro,noatime` — remount `rw` before writing recovery flags, remount `ro` afterwards. Multi-GB transfer to BusyBox SSH uses `rsync -av --progress -e 'ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=20'` to `/storage/.update/`, not `scp`. `gh` not on PATH — use `nix run nixpkgs#gh -- ...`.

### External References

None. This work is fully internal tooling, fully patterned by prior in-repo solutions.

---

## Key Technical Decisions

- **Compound at first merge.** Odin2Portal and Thor product-payloads ship in the same rebased PR rather than landing Odin2 first and Thor as a follow-up. Rationale: the payload seam (Nix wrapper, check, finalize CLI, CI lane) goes product-aware on day one rather than being retrofitted for multi-product on a second pass. The wrapper derivation is already generic; the rest of the seam is the actual product-parameterization work and is the load-bearing test of "the seam is genuinely product-blind."
- **Parameterize the check file rather than duplicate it.** Extract a `checkPayload { device, compatible, expectedBuildTarget, ... }` helper inside `nix/tests/korri-rocknix-product-payload-check.nix` and call it twice. Follows the `checkSystem` idiom already in `korri-rocknix-sm8550-config-check.nix`. Avoids the maintenance fork that duplication would create.
- **GitHub Actions matrix for the CI lane.** Use `strategy: matrix: device: [odin2portal, thor]` on the candidate-payload job rather than two explicit steps. Scales for a future third device with no further workflow churn.
- **nix-on-rocks selector via `--product` input, per-product lock files.** `product-payload-odin2portal.lock` + `product-payload-thor.lock` coexist in the substrate repo. `scripts/render-product-payload`, `scripts/verify-product-payload`, `build-sm8550.yml`, and `build-image-only.yml` all gain a `product` (or `--product`) input. No symlink games, no single mutable lock. Either product's image is reproducible by name from any commit.
- **Generalize the finalize CLI rather than fork it.** Remove the 3 device-specific guards in `validateCandidate`; read `PRODUCT_ROOTFS_SEED_DEVICE` from the candidate lock and validate consistency (archive prefix match, non-empty fields) device-agnostically. One CLI handles both products.
- **Plan scope deliberately stops short of `guest.lock` retirement.** Deferred to a separate plan in nix-on-rocks; coupling it here would entangle a substrate change with a multi-product expansion and inflate review surface.
- **Device IP confirmation is a hard precondition for U12.** Per R9; non-negotiable. The substrate fails closed for wrong-compatible payloads, but the plan does not rely on that as the only gate.

---

## Open Questions

### Resolved During Planning

- **One image with both seeds vs per-device images vs swap-the-pointer?** Resolved: per-device images, picked at Korri build time (user confirmation, this session). Matches the substrate's already-committed explicit-device direction.
- **Same PR or sibling PR for Thor on Korri side?** Resolved: same PR after rebase (user confirmation, this session). Compounds the seam to product-aware on first merge.
- **Selector mechanism on nix-on-rocks side?** Resolved: explicit `--product` input + per-product lock files (key technical decision above).
- **Check file: parameterize vs duplicate?** Resolved: parameterize via a `checkPayload { ... }` helper (key technical decision above).
- **CI lane: matrix vs two steps?** Resolved: GH Actions matrix (key technical decision above).

### Deferred to Implementation

- Exact merge resolution for `flake.nix` between the branch's payload additions and trunk's sessiond/libretroFake08/gamescope-pin/`fake-08-src` expansions. The conflict surface is known (see Repo Research §Trunk Rebase Conflict Surface); the exact resolution is execution-time work, not plan-time.
- Whether to add a new `tools/artifacts/paths.ts` constant for the payload candidate dir. Pattern-matches trunk's `runtimeWatchArtifactPath` addition; decide at implementation time based on whether finalize/CI code references the path more than once.
- Whether to add a `just` recipe for local payload builds (e.g. `just rocknix-product-payload device=odin2portal`). Convenience; defer the decision until the matrix workflow is in place and operator ergonomics are clear.
- Exact shape of the per-product lock file split on nix-on-rocks side: rename existing `product-payload.lock` to `product-payload-odin2portal.lock` in the same commit that adds `product-payload-thor.lock`, or keep `product-payload.lock` as a compatibility symlink for one cycle. Defer to U7 implementation; depends on whether `guest.lock` retirement is staged adjacently.
- Image-only run target base run id at execution time: handoff lists `26505366012` (sha `887b1aa4`) as the last known good prepare-base; verify it is still recent enough when U10 runs. If newer, prefer the newer one.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
    subgraph Korri["Korri repo (PR1, this plan U1-U6)"]
        K1[korri-rocknix-product-payload.nix<br/>generic, no changes]
        K2[flake.nix<br/>+ thor sibling alongside odin2portal]
        K3[product-payload-check.nix<br/>parameterized via checkPayload helper]
        K4[finalize.ts<br/>device guards removed]
        K5[rocknix-product-payload.yml<br/>matrix device: odin2portal | thor]
        K2 --> K1
        K2 --> K3
        K5 --> K4
    end

    subgraph NoR["nix-on-rocks repo (PR2, this plan U7-U9)"]
        N1[product-payload-odin2portal.lock]
        N2[product-payload-thor.lock]
        N3[render-product-payload --product]
        N4[verify-product-payload --product]
        N5[build-sm8550.yml<br/>product input]
        N3 -.reads.-> N1
        N3 -.reads.-> N2
        N5 --> N3
        N5 --> N4
    end

    subgraph CI["CI proofs (this plan U10-U11)"]
        C1[image-only Thor<br/>vs base 26505366012]
        C2[build-sm8550 Thor<br/>full]
    end

    subgraph Device["Thor device (this plan U12)"]
        D1[apply update tar]
        D2[happy / no-op / recovery]
        D3[payload-facts probe]
        D4[acceptance record]
    end

    Korri -- "publish payloads" --> NoR
    NoR --> CI
    CI --> Device
```

The payload wrapper derivation in Korri is already generic. The work this plan ships is making the *seam around it* — check, finalize, workflow — product-aware, then teaching nix-on-rocks to pick at the image-build boundary.

---

## Implementation Units

*File-path context for U1–U6:* all repo-relative paths in U1–U6 resolve against the Korri worktree `.worktrees/refactor/rocknix-product-payload/`, not against trunk. U1 rebases the branch in place; U2–U6 edit files in the same worktree. The branch is what eventually opens as the PR.

*File-path context for U7–U9:* all repo-relative paths resolve against the `nix-on-rocks` repo. The current substrate worktree is `/home/simonwjackson/code/sandbox/nix-on-rocks/.worktrees/refactor/product-payload-image-consumption`; U7–U9 may extend that worktree or open a fresh one depending on the substrate maintainer's preference.

### U1. Rebase `refactor/rocknix-product-payload` on trunk

**Goal:** Bring the unmerged Odin2Portal payload-emission branch up to trunk so subsequent units extend a current branch rather than a stale one.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `flake.nix` (resolve conflicts: keep trunk's `nixos-25.11` pin, `fake-08-src` input, sessiond and libretro-fake-08 wiring, expanded `standardChecks` 19 items, expanded `ownerMatrix`; carry forward branch's `productRevision*`, `nixOnRocksRevision`, `korri-rocknix-product-payload-odin2portal` package, payload check)
- Modify (resolve via accept-trunk only, no branch changes): `nix/tests/korri-rocknix-sm8550-config-check.nix`, `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`, `nix/tests/korri-moonlight-control-protocol-patch-check.nix`, `nix/images/common.nix`, `nix/images/kiosk.nix`, `nix/images/platforms/rocknix-sm8550.nix`, `nix/modules/korri-compositor.nix`, `nix/modules/korri-server.nix`, `nix/overlays/korri-packages.nix`, `tools/artifacts/paths.ts`, `tools/artifacts/paths.test.ts`
- Bring forward cleanly from branch: `nix/korri-rocknix-product-payload.nix`, `nix/product-payload-contract.nix`, `nix/tests/korri-rocknix-product-payload-check.nix`, `tools/artifacts/rocknix-product-payload-finalize.ts`, `tools/artifacts/rocknix-product-payload-finalize.test.ts`, `.github/workflows/rocknix-product-payload.yml`

**Approach:**
- `git rebase trunk` from `.worktrees/refactor/rocknix-product-payload`. Resolve conflicts in `flake.nix` by accepting the union of both expansions for `standardChecks` and `ownerMatrix`, and accepting trunk's input shape (`fake-08-src`, `nixpkgs → nixos-25.11`).
- For files trunk modified that the branch did not, accept trunk verbatim.
- After rebase, verify the worktree's `flake.lock` `original.ref` matches `nix-on-rocks`'s lock file `original.ref` for `nixpkgs`. If they diverge, fix `flake.nix` before any aarch64 build.
- Run `just typecheck`, `just lint`, `just test-unit`, `just test-nix` locally to confirm trunk's checks still pass after rebase.
- Push the rebased branch to remote.

**Patterns to follow:**
- `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md` for the channel-pin check.
- Existing branch payload commits as the source-of-truth for what to preserve.

**Test scenarios:**
- Test expectation: none new in this unit. Existing trunk checks must continue to pass. The unit's verification is "trunk's tests + branch's payload check both green after rebase."

**Verification:**
- `just check` passes locally on the rebased branch.
- `flake.lock` `nixpkgs` `original.ref` matches `nixos-25.11` and matches the nix-on-rocks pin.
- `nix build .#packages.x86_64-linux.korri-rocknix-product-payload-odin2portal --dry-run` succeeds (eval, not build).
- `nix build .#checks.x86_64-linux.korri-rocknix-product-payload --dry-run` succeeds.

---

### U2. Parameterize the product-payload check via a `checkPayload` helper

**Goal:** Generalize `nix/tests/korri-rocknix-product-payload-check.nix` so it accepts a `{ device, compatible, expectedBuildTarget, expectedRootfsAlias, expectedKioskSystemAlias, expectedConfigAlias }` argument shape and exposes a `checkPayload` helper that can be called once per device.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `nix/tests/korri-rocknix-product-payload-check.nix`

**Approach:**
- Extract a `checkPayload = { device, compatible, expectedBuildTarget, expectedRootfsAlias, expectedKioskSystemAlias, expectedConfigAlias, payloadPackage, fixturePayloadPackage, fixtureArchiveName }: [ checks ]` function inside the let block.
- Replace the 8 hardcoded Odin2-specific assertion strings with formatted strings derived from the device argument (e.g. `"${device} product payload package must be exposed"`).
- Replace the hardcoded shell-runtime asserts with parameterized expected values.
- For U2 the file only exercises Odin2 (Thor wiring comes in U3); the parameterization is what U2 ships.

**Patterns to follow:**
- `nix/tests/korri-rocknix-sm8550-config-check.nix` — `checkSystem name: system: [ ... ]` helper called once per device. Same idiom.
- Existing `checks` list shape; preserve the local check-record pattern.

**Test scenarios:**
- Happy path: parameterized check on Odin2 still passes with all the same assertions as before. (Verification: run `nix build .#checks.x86_64-linux.korri-rocknix-product-payload`.)
- Edge case: if a caller passes an empty `device` string, the assertion messages still render meaningfully (cosmetic, not load-bearing).

**Verification:**
- `nix build .#checks.x86_64-linux.korri-rocknix-product-payload --no-link` passes.
- All 8 previously-hardcoded assertion strings now derive from the `device` / `compatible` arguments.

---

### U3. Add Thor product-payload flake output + check coverage

**Goal:** Add `korri-rocknix-product-payload-thor` as a sibling flake package and call the parameterized `checkPayload` helper a second time for Thor.

**Requirements:** R1, R2

**Dependencies:** U2

**Files:**
- Modify: `flake.nix` (add Thor instantiation, extend `standardChecks` + `ownerMatrix`)
- Modify: `nix/tests/korri-rocknix-product-payload-check.nix` (call helper for Thor)

**Approach:**
- In `flake.nix`, mirror the Odin2Portal `korri-rocknix-product-payload-odin2portal` instantiation with Thor: `rootfsPackage = self.packages.${system}.korri-rocknix-rootfs-thor`, `device = "thor"`, `compatible = "ayn,thor"`, `buildTarget = ".#nixosConfigurations.korri-rocknix-kiosk-thor.config.system.build.toplevel"`.
- Add a `korri-rocknix-product-payload-thor` check entry to `standardChecks` (owner `"package-output"`).
- In the check file, call `checkPayload` for Thor with the corresponding fixture rootfs + archive name.
- The fixture revision can be shared between products (it's a synthetic rootfs, not real-device).

**Patterns to follow:**
- The existing Odin2Portal instantiation in `flake.nix`.
- The `Thor` entries already in `nix/tests/korri-rocknix-sm8550-config-check.nix` — they assert configuration/system/rootfs aliases identically. Mirror that exhaustiveness.

**Test scenarios:**
- Happy path: `nix build .#packages.x86_64-linux.korri-rocknix-product-payload-thor.drvPath --raw` eval succeeds; `passthru.productPayload.device == "thor"`; `passthru.productPayload.compatible == "ayn,thor"`; archive name has the `rocknix-guest-rootfs-thor-` prefix.
- Happy path: native check asserts Thor configuration/system/rootfs/payload all exposed.
- Edge case: payload build emits the candidate lock with `PRODUCT_ROOTFS_SEED_DEVICE="thor"` and `PRODUCT_ROOTFS_SEED_COMPATIBLE="ayn,thor"`.
- Integration: `korri-standard-native` now exercises both products' payload checks.

**Verification:**
- `nix build .#packages.x86_64-linux.korri-rocknix-product-payload-thor --no-link` succeeds (on a linux host where the rootfs is available; on Fuji it produces the real aarch64 archive).
- `nix build .#checks.x86_64-linux.korri-standard-native --no-link` passes with both payload checks included.

---

### U4. Genericize the finalize CLI device guards and device-name its outputs

**Goal:** Remove Odin2-specific guards in `tools/artifacts/rocknix-product-payload-finalize.ts` so it finalizes any product's candidate lock based on what the candidate itself declares, and derive the output filename from the candidate's device so Odin2 and Thor finalizations do not collide.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `tools/artifacts/rocknix-product-payload-finalize.ts`
- Modify: `tools/artifacts/rocknix-product-payload-finalize.test.ts`

**Approach:**
- In `validateCandidate`, replace the three hardcoded checks (`PRODUCT_ROOTFS_SEED_DEVICE === "odin2portal"`, `PRODUCT_ROOTFS_SEED_COMPATIBLE === "ayn,odin2portal"`, archive-prefix-against-odin2portal) with:
  - Assert `PRODUCT_ROOTFS_SEED_DEVICE` is non-empty.
  - Assert `PRODUCT_ROOTFS_SEED_COMPATIBLE` is non-empty.
  - Assert `PRODUCT_ROOTFS_SEED_ARCHIVE` starts with `rocknix-guest-rootfs-${candidate.PRODUCT_ROOTFS_SEED_DEVICE}-`.
- Keep all existing field-consistency checks (revision match, sha format, URL shape).
- Replace the hardcoded `product-payload.lock` / `product-payload.env` output filenames with device-derived names: `product-payload-${device}.lock` and `product-payload-${device}.env`. The `device` is read from the validated `PRODUCT_ROOTFS_SEED_DEVICE` field of the candidate, so the finalize step's output drops directly into the substrate's per-product lock seam from U7 without an operator-rename step.
- Rewrite the test that previously asserted "rejects an archive whose device does not match Odin2Portal" into "rejects an archive whose device prefix does not match the declared device field" using both an Odin2 and a Thor fixture lock.
- Add positive happy-path test for Thor.
- Add a test that an Odin2 candidate produces `product-payload-odin2portal.lock` and a Thor candidate produces `product-payload-thor.lock`.

**Patterns to follow:**
- Existing test structure in `tools/artifacts/rocknix-product-payload-finalize.test.ts`.
- The repo's `bun test` conventions; biome formatting.

**Execution note:** Test-first. Write the Thor happy-path test and the mismatched-device-prefix test before deleting the Odin2 guards.

**Test scenarios:**
- Happy path: finalize an Odin2 candidate lock with valid inputs; output `product-payload.lock` has all fields filled and matches expected shape.
- Happy path: finalize a Thor candidate lock with valid inputs; same output shape, `PRODUCT_ROOTFS_SEED_DEVICE="thor"` in the final lock.
- Error path: candidate lock with `PRODUCT_ROOTFS_SEED_DEVICE="thor"` but archive name `rocknix-guest-rootfs-odin2portal-...` is rejected with a "device prefix mismatch" error.
- Error path: candidate lock with empty `PRODUCT_ROOTFS_SEED_DEVICE` is rejected.
- Error path: revision mismatch between candidate and `--product-rev` still rejected (regression coverage for existing behavior).

**Verification:**
- `bun test tools/artifacts/rocknix-product-payload-finalize.test.ts` passes.
- `just lint` clean.
- No grep hits for `"odin2portal"` literal in the finalize source (only the test fixtures may contain it as data).

---

### U5. Convert the CI lane to a product matrix

**Goal:** Make `.github/workflows/rocknix-product-payload.yml` emit candidate payloads for both `odin2portal` and `thor` in a single workflow run via a job matrix keyed on `product`.

**Requirements:** R3

**Dependencies:** U3, U4

**Files:**
- Modify: `.github/workflows/rocknix-product-payload.yml`

**Approach:**
- Add `strategy: matrix: product: [odin2portal, thor]` to the `candidate-payload` job (using `product` to align with the R5/U7–U9 selector vocabulary, not `device`). Rename the job from "Candidate Odin2Portal payload" to "Candidate ${{ matrix.product }} payload".
- Replace hardcoded `korri-rocknix-product-payload-odin2portal` references with `korri-rocknix-product-payload-${{ matrix.product }}`.
- Replace artifact names with `rocknix-product-payload-${{ matrix.product }}-candidate` and `rocknix-product-payload-${{ matrix.product }}-final-metadata`.
- Keep the existing eval-only behavior on push; build-and-upload only on `workflow_dispatch` with `build_payload=true`.
- Consider adding a Thor-specific `workflow_dispatch` skip toggle if matrix-wide opt-in is too coarse; defer to implementation judgment.

**Patterns to follow:**
- Existing job structure; preserve `concurrency`, `timeout-minutes`, `maximize-build-space`, `install-nix` shape.
- Trunk's `desktop-stage2.yml` for matrix usage examples.

**Test scenarios:**
- Test expectation: none at unit level. Verification is the CI run itself (executed under U10).
- Static check: `actionlint` or `gh workflow view` on the modified workflow shows no syntax errors.

**Verification:**
- The workflow file passes `nix run nixpkgs#actionlint -- .github/workflows/rocknix-product-payload.yml` (or whatever lint the repo uses).
- A subsequent push to the rebased branch triggers two parallel eval jobs (one per device) and both pass.

---

### U6. Update `docs/deployment/korri-images.md` for the multi-product payload lane

**Goal:** Document the multi-product product-payload lane in the deployment doc.

**Requirements:** R1, R2

**Dependencies:** U3, U5

**Files:**
- Modify: `docs/deployment/korri-images.md`

**Approach:**
- Update the section describing `korri-rocknix-product-payload-*` to mention both products and the matrix CI lane.
- Add a short paragraph naming the per-product flake outputs and showing the per-device `nix build` command shape.
- Cross-link the nix-on-rocks-side selector seam (introduced in U7–U9) once those land; if not yet landed at U6 time, leave a forward reference labeled "see follow-up: nix-on-rocks selector seam."

**Patterns to follow:**
- Existing structure of `docs/deployment/korri-images.md`.

**Test scenarios:**
- Test expectation: none -- documentation-only.

**Verification:**
- Doc renders sensibly; no broken cross-links; both `odin2portal` and `thor` mentioned by name.

---

### U7. nix-on-rocks: introduce per-product lock files + `--product` selector contract

**Target repo:** `nix-on-rocks` (`/home/simonwjackson/code/sandbox/nix-on-rocks/.worktrees/refactor/product-payload-image-consumption` or a fresh worktree).

**Goal:** Split `product-payload.lock` and `guest.lock` into per-product files (`product-payload-odin2portal.lock` + `product-payload-thor.lock`, plus parallel `guest-odin2portal.lock` + `guest-thor.lock`); define the `--product` selector contract; replace the hardcoded Odin2 `case` allow-list in `scripts/verify-sm8550-locks` with a contract that derives the expected build target from the active product lock.

**Requirements:** R5, R6, R10

**Dependencies:** U3 (Thor payload must exist as a Korri artifact to populate the lock)

**Files:**
- Rename: `product-payload.lock` → `product-payload-odin2portal.lock`
- Create: `product-payload-thor.lock` (populated from the Thor candidate payload that U3 emits, then finalized by the U4 CLI — which now writes device-named outputs — against the operator-published Thor release URLs)
- Rename: `guest.lock` → `guest-odin2portal.lock` (this rename is part of *this* plan, distinct from full `guest.lock` retirement which remains deferred; coexistence with a single `guest.lock` is structurally impossible because `scripts/verify-product-payload` cross-validates `PRODUCT_ROOTFS_SEED_*` against `GUEST_*`)
- Create: `guest-thor.lock`
- Modify: `scripts/render-product-payload` (accept `--product <id>` and source the matching `product-payload-${id}.lock` + `guest-${id}.lock`; fail with a clear message when either file is missing)
- Modify: `scripts/verify-product-payload`, `scripts/verify-sm8550-locks`, `scripts/verify-sm8550-payloads` (same `--product` plumbing; cross-validate against the matching per-product `guest-${id}.lock`)
- Modify: `scripts/tests/product-payload-contract.sh` (test both products end-to-end)

**Approach:**
- Define the selector contract once: `--product odin2portal` or `--product thor`, no default, fail closed on unrecognized values. The legacy single-file `product-payload.lock` becomes a symlink to `product-payload-odin2portal.lock` for one cycle to keep historical CI invocations working; the symlink is removed in a follow-up plan. Behavior contract: when `--product` is supplied, the symlink is not consulted; when `--product` is omitted, scripts fall back to the symlink only if it exists and warn loudly. This resolves the apparent contradiction between "no default, fail closed" and "compatibility symlink" — the symlink is a transition-period escape hatch, not a default.
- Update every script's `set -euo pipefail` preamble to include a `require_product` check.
- Replace the hardcoded `case "${PKG_NIX_GUEST_BUILD_TARGET:-}" in ...odin2portal...) : ;; *) fail ...` block in `scripts/verify-sm8550-locks` (lines ~62–64) with a check that `PKG_NIX_GUEST_BUILD_TARGET` equals `PRODUCT_BUILD_TARGET` from the active product lock. This makes the substrate's build-target validation product-blind — the lock declares the target; the verifier just checks consistency.
- Per-product `guest-${id}.lock` keeps R10's fail-closed posture intact for both products: `verify-product-payload --product thor` cross-validates the Thor product lock against the Thor guest lock; same for Odin2.

**Patterns to follow:**
- Existing script shape; `set -euo pipefail`, `require_nonempty`, `require_equal` helpers.

**Test scenarios:**
- Happy path: `scripts/render-product-payload --product odin2portal` produces the same rendered output as the current single-lock flow.
- Happy path: `scripts/render-product-payload --product thor` produces a rendered output with `PKG_NIX_GUEST_ROOTFS_SEED_DEVICE=thor`.
- Error path: `--product` omitted → fails with a clear "no product selected" error.
- Error path: `--product moon` (unknown) → fails closed with a "no matching lock file" error.
- Error path: matching lock file missing → same fail-closed shape.

**Verification:**
- `scripts/tests/product-payload-contract.sh --product odin2portal` and `--product thor` both pass.
- Verifier reject paths produce expected non-zero exit codes with clear messages.

---

### U8. nix-on-rocks: plumb the selector through `build-sm8550` script and every `render-product-payload` caller

**Target repo:** `nix-on-rocks`

**Goal:** Teach `scripts/build-sm8550` and every other script that invokes `render-product-payload` to honor the `--product` selector, sourcing the right lock and passing the right `PKG_NIX_GUEST_*` vars into the image build.

**Requirements:** R6

**Dependencies:** U7

**Files:**
- Modify: `scripts/build-sm8550`
- Modify: `scripts/apply-rocknix-patches` (calls `render-product-payload` to stage the rendered env into the working directory before every job in `build-sm8550.yml` — must accept and forward `--product`)
- Modify: `scripts/verify-product-payload-fetches` (also calls `render-product-payload` internally when `--payload-env` is omitted — must accept and forward `--product`)
- Modify: any `package.mk` / `Makefile` / build-config files that hardcode the lock path

**Approach:**
- Thread `--product` from the top-level build entry through to the rendering step. The selector should appear in build provenance (e.g. `provenance.json` or whatever the existing equivalent is) so artifacts are self-identifying.
- Image artifact filenames should include the product id (e.g. `rocknix-sm8550-thor-<build-id>.img.gz`) so a Thor image cannot be mistaken for an Odin2Portal image during operator handoff.

**Patterns to follow:**
- Existing `scripts/build-sm8550` structure; existing artifact-naming conventions in `scripts/render-product-payload` output.

**Test scenarios:**
- Happy path: `scripts/build-sm8550 --product odin2portal --dry-run` (or equivalent) shows the rendered package vars all sourced from `product-payload-odin2portal.lock` and the image filename includes `odin2portal`.
- Happy path: `scripts/build-sm8550 --product thor --dry-run` shows Thor vars and `thor` in the image filename.
- Error path: `--product` omitted → build fails before any expensive step.

**Verification:**
- Dry-run for both products produces distinct rendered vars and distinct artifact filenames.
- Provenance output identifies the product.

---

### U9. nix-on-rocks: plumb the selector through `build-image-only.yml` + `build-sm8550.yml`

**Target repo:** `nix-on-rocks`

**Goal:** Add a `product` workflow input (`odin2portal` | `thor`) to both CI workflows and pass it through to the build script from U8.

**Requirements:** R6

**Dependencies:** U8

**Files:**
- Modify: `.github/workflows/build-sm8550.yml`
- Modify: `.github/workflows/build-image-only.yml`

**Approach:**
- Add `inputs.product` (required, no default, choices `odin2portal` and `thor`).
- Pass `--product ${{ inputs.product }}` to all build/verify steps.
- Update the workflow's display name template to include the product so workflow-run listings are unambiguous.
- Keep `packaging_only_accept_stale_base` semantics unchanged; it stays a per-product concern (the base run id refers to substrate, which is product-blind).

**Patterns to follow:**
- Existing workflow input shape; `workflow_dispatch.inputs` choice fields elsewhere in the repo.

**Test scenarios:**
- Happy path: `gh workflow run build-image-only.yml -f product=odin2portal -f base_run_id=...` succeeds and produces an Odin2Portal image.
- Happy path: `gh workflow run build-image-only.yml -f product=thor -f base_run_id=...` succeeds and produces a Thor image.
- Error path: missing `product` input → workflow refuses to dispatch.

**Verification:**
- Workflow input validation passes for both products.
- Workflow-run listings show `odin2portal` or `thor` in the display name.

---

### U10. CI proof: image-only Thor build against base `26505366012`

**Target repo:** `nix-on-rocks` (CI dispatch + acceptance evidence both land there)

**Goal:** Run `build-image-only.yml` for Thor against the most recent known-good prepare-base, verify the resulting image artifact.

**Requirements:** R7

**Dependencies:** U9

**Files:**
- Create: `docs/acceptance/sm8550-product-payload-thor-image-only-<date>.md` (lightweight evidence note, optional; can be inlined into U12 acceptance)

**Approach:**
- Dispatch `gh workflow run build-image-only.yml -f product=thor -f base_run_id=26505366012 -f packaging_only_accept_stale_base=true` (or the current latest base if newer).
- On success, download the Thor image artifact via `gh run download` and run `rocknix_artifact_verify` (already available in this environment) to confirm FAT label and seed manifest.

**Patterns to follow:**
- The handoff's operational notes for `gh` and `rocknix_artifact_verify`.

**Test scenarios:**
- Test expectation: none in the unit-test sense. The CI run is the test.
- Verification scenario: artifact verify passes with expected ROCKNIX FAT label and the candidate seed sha matches the Thor candidate emitted by U3.

**Verification:**
- Image artifact downloaded and verified.
- Seed sha matches the Thor payload candidate from the corresponding Korri release.

---

### U11. CI proof: full `build-sm8550.yml` for Thor (authoritative)

**Target repo:** `nix-on-rocks` (CI dispatch)

**Goal:** Run `build-sm8550.yml` for Thor end-to-end. This is the authoritative build proof before device acceptance.

**Requirements:** R7

**Dependencies:** U10 (cheap confidence first), U9

**Files:** None (the workflow run is the artifact)

**Approach:**
- Dispatch `gh workflow run build-sm8550.yml -f product=thor` (and whatever other inputs the workflow currently requires).
- Use `github_actions_supervise` to drive it; expect ~5h.
- On success, verify the resulting image with `rocknix_artifact_verify`.

**Test scenarios:**
- Test expectation: none in the unit-test sense.
- Verification scenario: full build succeeds; image verify passes; the published image's embedded product-payload lock matches `product-payload-thor.lock`.

**Verification:**
- `build-sm8550.yml` Thor run completes successfully.
- Resulting image verified clean.
- Image carries Thor compatible string and Thor seed.

---

### U12. Device acceptance for `bandai` (Thor)

**Target repo:** `nix-on-rocks` (`docs/acceptance/` and `docs/acceptance/sm8550-acceptance.md` index both live in the substrate repo)

**Goal:** Apply the Thor update tar to the actual Thor device and run the same three-pass acceptance shape used for the Sobo boot-hint U3 acceptance, plus a payload-facts probe.

**Requirements:** R8, R9

**Dependencies:** U11 (no device traffic until the full build is proven), plus R9 IP confirmation handshake.

**Files:**
- Create: `docs/acceptance/sm8550-product-payload-thor-bandai-<date>.md`
- Modify: `docs/acceptance/sm8550-acceptance.md` (add Thor entry to acceptance index)

**Approach:**
- Block on R9 IP confirmation: SSH to the candidate IP, `cat /proc/device-tree/compatible | tr '\0' '\n'`. Must return `ayn,thor`. If it returns `ayn,odin2portal` (still Sobo) — stop. Surface to the user.
- Transfer the Thor update tar to `/storage/.update/` via `rsync -av --progress -e 'ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=20'` (handoff op note).
- Trigger the on-device update mechanism; expect the substrate to reach `rocknix-main-space.target` with no failed units and guest active.
- Use `device_recovery_supervise` to observe post-update state (it gates on portal env, Settings.Read, failed units, etc.).
- Run the three passes:
  - **Happy:** fresh apply + boot, verify generations, payload-facts probe (`PRODUCT_ROOTFS_SEED_DEVICE`, `PRODUCT_ROOTFS_SEED_COMPATIBLE`, archive sha, product rev).
  - **No-op:** re-apply same update; verify boot-hint hardening (no spurious recovery, no failed units, no double-import).
  - **Recovery:** corrupt or remove boot hint manually (mount `/flash` rw, edit, remount ro), reboot, verify recovery promotion works as designed for Thor identically to Sobo.
- Write the acceptance doc patterned on `docs/acceptance/sm8550-post-update-boot-hint-sobo-2026-05-28.md` and `docs/acceptance/sm8550-product-payload-full-build-sobo-2026-05-27.md`. Include build evidence, image verify, three-pass evidence, payload-facts probe, caveats.
- Update `docs/acceptance/sm8550-acceptance.md` with the new Thor entry.

**Patterns to follow:**
- `docs/acceptance/sm8550-product-payload-full-build-sobo-2026-05-27.md` for the build evidence + payload facts shape.
- `docs/acceptance/sm8550-post-update-boot-hint-sobo-2026-05-28.md` for the three-pass acceptance shape.
- Handoff's operational notes for SSH transport, `/flash` remount dance, `gh` path.

**Test scenarios:**
- Test expectation: device evidence captured in the acceptance doc; not a unit-test deliverable.

**Verification:**
- Thor device reaches `rocknix-main-space.target` on the new image with no failed units.
- All three acceptance passes produce expected evidence.
- Payload-facts probe shows Thor seed and Thor compatible.
- Acceptance doc lands on trunk; acceptance index updated.

---

## System-Wide Impact

- **Interaction graph:** the Korri payload-emission lane (`rocknix-product-payload.yml`) now produces two artifacts per run; downstream consumers of those artifacts (operators finalizing release URLs, nix-on-rocks build pipeline) must learn the per-product naming. The finalize CLI is now product-agnostic and may be invoked twice per release cycle.
- **Error propagation:** the new `--product` selector contract fails closed on the substrate side (R6); wrong-compatible payloads continue to be rejected at the existing `rocknix-guest-root-ensure` gate (R10).
- **State lifecycle risks:** the rename `product-payload.lock` → `product-payload-odin2portal.lock` is a one-cycle breakage for any external consumer that hardcoded the old path. Mitigated by the compatibility symlink in U7. Real risk: an out-of-tree fork that grep'd for `product-payload.lock` will need to learn the new contract — this is documented in U7's commit message and in `docs/deployment/korri-images.md`.
- **API surface parity:** the finalize CLI's `validateCandidate` is now device-agnostic; all callers see the same field-consistency rules.
- **Integration coverage:** the U3 native check exercises both products' wrapper output; U7 contract test exercises both products' rendered vars; U9 workflow input validation exercises both products' image-build path. Cross-layer integration ("a Thor payload published from Korri can be consumed end-to-end by nix-on-rocks") is proven by U11.
- **Unchanged invariants:** the `korri-rocknix-rootfs-{thor,odin2portal}` derivations are untouched; `korri-rocknix-kiosk-{thor,odin2portal}` configurations are untouched; the substrate's explicit-device static checks (`thor|odin2portal`) are untouched; `guest.lock` is untouched (deferred).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Rebase silently restores `nixpkgs-unstable`, causing aarch64 source rebuilds | U1 explicit verification step: compare `flake.lock` `original.ref` to nix-on-rocks before any aarch64 build |
| `flake.nix` rebase merge accidentally drops trunk's `standardChecks` expansion (sessiond/libretroFake08/etc.) | U1 verification: `just test-nix` must run all of trunk's checks plus the new payload check |
| The 162-commit gap surfaces a conflict deeper than the listed files (e.g., a moved helper) | Resolution surface is enumerated; if a deeper conflict surfaces during U1, pause and surface it before continuing rather than absorbing complexity silently |
| nix-on-rocks lock-file rename breaks an unknown external consumer | Compatibility symlink in U7 buys one cycle; `docs/deployment/korri-images.md` documents the new contract |
| Thor device at `192.168.1.239` turns out to be Sobo (or vice versa) | R9 hard precondition + explicit `cat /proc/device-tree/compatible` check before any mutation in U12 |
| Full build (U11) takes ~5h and hits transient infra failure | Re-dispatch is cheap; the image-only proof from U10 confirms the inputs are good before committing to the long build |
| `/flash` 93% full constraint on Sobo extrapolates to Thor → boot partition tight | U12 acceptance writes the new rootfs to `/storage`, not `/flash`; explicit verification in the acceptance doc |
| Workflow `push.branches` filter on `rocknix-product-payload.yml` still pinned to the branch name post-merge | Recorded as deferred follow-up; not blocking for this plan since `workflow_dispatch` still works |

---

## Documentation / Operational Notes

- `docs/deployment/korri-images.md` updated in U6.
- New acceptance doc in U12: `docs/acceptance/sm8550-product-payload-thor-bandai-<date>.md`.
- `docs/acceptance/sm8550-acceptance.md` index updated in U12.
- Suggested follow-up doc note (out of scope this plan): a `docs/solutions/architecture-patterns/per-product-payload-selector-on-sm8550-substrate-<date>.md` solution writeup once the seam has been exercised end-to-end. Defer to compounding the learning after U12 lands rather than pre-documenting.

---

## Sources & References

- **Origin plan:** [docs/plans/2026-05-26-002-refactor-rocknix-product-payload-emission-plan.md](2026-05-26-002-refactor-rocknix-product-payload-emission-plan.md) — the completed Odin2Portal payload-emission plan whose `Deferred to Follow-Up Work` line for Thor this plan executes.
- **Origin requirements (transitive):** `docs/brainstorms/2026-05-22-001-korri-dependency-direction-inversion-requirements.md`
- **Substrate worktree:** `/home/simonwjackson/code/sandbox/nix-on-rocks/.worktrees/refactor/product-payload-image-consumption` (HEAD `d9c3bc5`)
- **Korri branch worktree:** `.worktrees/refactor/rocknix-product-payload` (HEAD `a3fabfd`, 162 commits behind trunk)
- **Thor Nix config (already on trunk):** `flake.nix` `nixosConfigurations.korri-rocknix-kiosk-thor`; `nix/tests/korri-rocknix-sm8550-config-check.nix` Thor coverage block
- **Sobo acceptance templates:** `docs/acceptance/sm8550-product-payload-full-build-sobo-2026-05-27.md`, `docs/acceptance/sm8550-post-update-boot-hint-sobo-2026-05-28.md`
- **Acceptance index:** `docs/acceptance/sm8550-acceptance.md`
- **Channel-pin learning:** `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md`
- **Staged-layer adoption learning:** `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` §P8
- **Architectural posture learning:** `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- **Rocknix deploy learning:** `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- **Last known good prepare-sm8550-base run:** `26505366012` (sha `887b1aa4`) — verify at U10 dispatch time that no newer is preferred
- **Previous Thor device evidence (pre-product-payload, background only):** `docs/acceptance/sm8550-device-acceptance-2026-05-22-thor.md`
- **Handoff:** `/tmp/handoff-ENiIeq.md` (this session's intake doc)
