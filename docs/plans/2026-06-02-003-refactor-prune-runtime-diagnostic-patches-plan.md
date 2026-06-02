---
title: refactor: Prune runtime diagnostic patches
type: refactor
status: completed
date: 2026-06-02
verify_command: "nix build .#checks.x86_64-linux.korri-moonlight-control-protocol-patch --no-link && nix build .#checks.x86_64-linux.korri-sunshine-runtime-bitrate-patch --no-link; Bandai manual Moonlight runtime controls validation"
---

# refactor: Prune runtime diagnostic patches

## Summary

This plan removes obsolete Sunshine/Moonlight runtime-resolution diagnostics from the active Nix patch stacks while preserving the patches that make the proven runtime-resolution path work. The cleanup treats build success as necessary but not sufficient: it also requires checking for diagnostic side-effect dependencies and revalidating the Bandai physical resolution gate after pruning.

---

## Problem Frame

The working stream-resolution path is now known, but the active downstream patch stacks still apply failed diagnostics and verbose instrumentation. Leaving those patches active creates risk: some diagnostics mutate frame/copy/sync behavior, add log/file overhead, and can mislead future investigations by masking the actual runtime state.

---

## Requirements

- R1. Remove failed Sunshine runtime-resolution diagnostic and experiment patches from the active package patch list and repository tree.
- R2. Remove Moonlight frame-content hash diagnostics from the active package patch list and repository tree unless a non-diagnostic behavior inside the patch is intentionally preserved elsewhere.
- R3. Preserve the known working runtime-resolution mechanism: Sunshine runtime-settings protocol/control/application patches and Moonlight decoder/context/presenter reset patches must remain applied.
- R4. Keep Nix package metadata and generated package manifest output aligned with the resulting active Moonlight patch stack.
- R5. Confirm the pruned patch stacks compile through the project’s native Nix checks/package builds.
- R6. Confirm no production or validation path depends on diagnostic side effects such as injected log lines, frame dumps, forced copy/reimport behavior, or hash output.
- R7. Revalidate the physical Bandai resolution gate after pruning: 1080p steady state, downshift to 360p/576p-class output, and return to 1080p with visible settled DSI-2 captures.

---

## Scope Boundaries

- No new runtime-resolution product behavior.
- No broad Sunshine/Moonlight patch consolidation; preserve that for dedicated follow-up tasks.
- No new diagnostics to replace the removed patches.
- No Gamescope quality-profile abstraction or automated product scaling policy changes.
- No `flake.lock` or upstream dependency bump unless implementation unexpectedly requires it.

### Deferred to Follow-Up Work

- `backlog/task-083`: consolidate the surviving Sunshine runtime-resolution mechanism patches once the diagnostic patches are gone.
- `backlog/task-084`: right-size the surviving Sunshine fresh-IDR window in `0010` after this cleanup lands.
- `backlog/task-095`: consolidate the surviving Moonlight runtime-resolution patches after diagnostic pruning.
- `backlog/task-111`: fix the Bandai Gamescope acceptance harness command ordering and capture settle behavior before relying on it for unattended future gates.
- Optional debug-build diagnostics: if frame-content hashes are needed again, reintroduce them behind an explicit debug-only gate in a separate task rather than keeping them active in the production package stack.

---

## Context & Research

### Relevant Code and Patterns

- `packages/sunshine-korri/package.nix` appends Korri-owned Sunshine patches to the upstream Sunshine derivation. Removing a Sunshine diagnostic requires removing its patch-list entry and deleting the patch file.
- `packages/moonlight-embedded-korri/package.nix` owns three Moonlight sync points: the applied `patches` list, the selected nix-on-rocks base patches, and the hardcoded `postInstall` `korri-patches=` manifest string.
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix` and `nix/tests/korri-moonlight-control-protocol-patch-check.nix` check stable protocol/control patch invariants and package buildability, but they do not enumerate the diagnostic patches being removed.
- `docs/handoffs/live-runtime-resolution-journey.md` records rejection evidence for failed runtime-resolution diagnostics, including VAAPI reimport and GL finish candidates, and explains why physical proof matters more than logs or hashes.
- `docs/acceptance/gamescope-control-bandai-2026-06-02.md` documents the Bandai bridge acceptance envelope and the need for physical `DSI-2` captures.
- `docs/acceptance/gamescope-scaling-policy.md` separates Gamescope inner-mode scaling from Moonlight/Sunshine stream-resolution changes and keeps physical captures as the visual source of truth.

### Institutional Learnings

- `docs/solutions/tooling-decisions/vendor-sdl2-mali-fbdev-for-moonlight-on-fbdev-only-handhelds-2026-05-28.md`: Moonlight’s Korri runtime-settings and local-control patches are load-bearing product functionality; do not remove protocol/control patches while pruning diagnostics.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: validation should use a fresh launch/session path and authoritative status artifacts rather than stale user-side configuration or stale session state.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: delete stale heuristics and diagnostics once explicit policy exists; first check that no code depends on diagnostic side effects.
- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`: unit/protocol checks cannot substitute for physical Bandai captures when the claim is visual/product behavior.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`: stale diagnostics can actively alter timing and mask real defects, so remove them as behavioral mutations, not harmless log noise.

### External References

- None. Local patch history, acceptance docs, and repo patterns are the relevant source of truth for this cleanup.

---

## Key Technical Decisions

- Delete obsolete diagnostic patch files rather than leaving unapplied archives in the package directories: git history and `docs/handoffs/live-runtime-resolution-journey.md` preserve investigation history, while the runtime package tree should only carry active downstream patches.
- Keep the surviving Sunshine mechanism patches intact: `0001` through `0005`, plus `0010`, `0012`, `0013`, and `0014`. These carry protocol, control-plane, runtime apply, fresh-IDR, config persistence, async capture reinit, and VAAPI teardown safety behavior. `0011` is intentionally removed by this cleanup because it forces source-copy behavior and must be validated as a risky diagnostic removal.
- Keep the surviving Moonlight mechanism patches intact: `0004` through `0011`. These carry absolute touch, runtime-settings sender/outcome/env/adaptation, local control, runtime resolution command, decoder/context reopen, and SDL presenter reset behavior.
- Treat `packages/moonlight-embedded-korri/package.nix` manifest output as an active contract, not incidental metadata: the current manifest string is stale because it omits active `0011`, so this cleanup must add `0011` to the manifest and ensure `0012` remains absent.
- Preserve confirmed non-diagnostic runtime behavior from Moonlight `0012` by moving it into the appropriate surviving mechanism patch. The post-reset SDL event pump belongs with `0011` unless implementation proves through physical validation that dropping it is safe.
- Accept manual Bandai validation as an interim gate while `task-111` is unresolved, but require corrected CLI ordering, post-mode settle, and timestamped physical capture artifacts. Do not call the checked-in harness authoritative until `task-111` lands.

---

## Open Questions

### Resolved During Planning

- Should this cleanup redesign the patch stack? No. It prunes diagnostics and keeps consolidation for `task-083`, `task-084`, and `task-095`.
- Should Sunshine `0008` be removed here? No direct action is required because the crashy target-surface rotation patch is already absent from the active package list and repository tree.
- Is green Nix CI enough to close this task? No. The checks prove build/package invariants; the visual/product claim still needs Bandai physical evidence.
- Should Moonlight hash diagnostics remain active for future investigations? No. If needed again, they should return behind an explicit debug-only gate in a separate task.

### Deferred to Implementation

- Exact evidence for Sunshine `0011` rejection: before deleting it, search for prior forced-source-copy evidence. If evidence is absent, still treat `0011` as the riskiest removal and require transition-focused physical validation after removal; if that gate fails, defer `0011` removal rather than masking the regression.
- Exact Moonlight event-pump handling: preserve the post-reset SDL event-pump behavior from `0012` in `0011` by default; only drop it if implementation captures explicit evidence that it is not load-bearing.
- Exact Bandai command invocation while `task-111` is open: use the known corrected ordering and settle behavior from `backlog/task-111`, but allow the implementer to adapt to the current bridge CLI.

---

## Implementation Units

### U3. Audit diagnostic side-effect dependencies

**Goal:** Prove the cleanup does not remove a diagnostic side effect that current runtime code, validation tooling, or operator procedures still consume.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Inspect: `packages/sunshine-korri/package.nix`
- Inspect: `packages/moonlight-embedded-korri/package.nix`
- Inspect: `tools/scripts/gamescope-control-bandai-acceptance.ts`
- Inspect: `tools/device/`
- Inspect: `korri/shared/`
- Inspect: `korri/products/app/`
- Test expectation: none -- this unit is an audit/verification gate unless it discovers an active dependency that must be converted into explicit policy or deferred.

**Approach:**
- Search for references to deleted patch names and diagnostic symbols/log terms across runtime code, scripts, Nix tests, and package metadata.
- Treat historical docs/backlog references as allowed, but active code/tooling references as blockers.
- If an active dependency exists because tooling relies on diagnostic logs/hashes/dumps, do not silently preserve the diagnostic patch. Either convert that dependency to an explicit supported signal within this task if it is tiny and necessary, or defer it with a backlog item.

**Patterns to follow:**
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` for replacing incidental diagnostic signals with explicit policy.

**Test scenarios:**
- Happy path: active runtime code and scripts have no dependency on deleted diagnostic logs, frame dumps, forced copy/reimport flags, or patch file names.
- Edge case: historical documentation and backlog references remain acceptable because they document prior investigations rather than active runtime dependency.
- Error path: if active code consumes a deleted diagnostic side effect, the implementer either removes/rewires that dependency or stops for scope review before merging the cleanup.

**Verification:**
- The implementation evidence identifies the search surface and confirms no active diagnostic side-effect consumers remain.
- Any discovered active consumer is resolved or explicitly deferred with owner/context.

---

### U1. Prune obsolete Sunshine diagnostics

**Goal:** Remove failed Sunshine runtime-resolution diagnostic/experiment patches from the active package stack and repository tree while preserving the known working Sunshine mechanism patches.

**Requirements:** R1, R3, R5, R6

**Dependencies:** U3

**Files:**
- Modify: `packages/sunshine-korri/package.nix`
- Delete: `packages/sunshine-korri/patches/0006-diagnose-vaapi-convert-sequence.patch`
- Delete: `packages/sunshine-korri/patches/0007-finish-vaapi-gl-convert-before-encode.patch`
- Delete: `packages/sunshine-korri/patches/0009-diagnose-avcodec-packet-content-after-resolution.patch`
- Delete: `packages/sunshine-korri/patches/0011-force-vaapi-vram-source-copy-before-convert.patch`
- Test/reference: `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`

**Approach:**
- Remove only the diagnostic/failed entries from the Sunshine `patches` list.
- Preserve Sunshine `0001` through `0005`, then `0010`, `0012`, `0013`, and `0014` in their existing relative order.
- Confirm `0008` remains absent and do not introduce a placeholder for it.
- Treat `0011` as behavior-bearing because it forces source-copy behavior; remove it in an isolated step with explicit transition-focused physical validation, and defer its removal if that validation points to it being load-bearing.

**Execution note:** Start with a characterization diff of the active patch list so the implementer can prove only the intended Sunshine entries disappeared.

**Patterns to follow:**
- `packages/sunshine-korri/package.nix` ordered patch-list style.
- Rejection/evidence trail in `docs/handoffs/live-runtime-resolution-journey.md`.

**Test scenarios:**
- Happy path: applying the remaining Sunshine patches to upstream Sunshine succeeds after `0006`, `0007`, `0009`, and `0011` are removed from the derivation.
- Happy path: the package still includes runtime-settings protocol/control/apply patches and the surviving runtime-resolution mechanism patches.
- Edge case: no code or package metadata still references deleted Sunshine patch file names after deletion.
- Error path: if patch application fails because a surviving patch depended on removed diagnostic context, the failure is treated as an implementation blocker rather than solved by re-adding diagnostics.
- Integration: Sunshine package build/check completes with the pruned patch stack, proving the derivation no longer needs the deleted files.

**Verification:**
- The Sunshine derivation no longer applies the four obsolete diagnostic patches.
- The Sunshine package builds with the remaining patch stack.
- The repository has no active references to the deleted Sunshine patch files outside historical docs/backlog entries.

---

### U2. Prune Moonlight hash diagnostics and align manifest output

**Goal:** Remove Moonlight frame-content hash diagnostics while preserving the runtime-resolution client mechanism and correcting package manifest output to describe the surviving active patches.

**Requirements:** R2, R3, R4, R5, R6

**Dependencies:** U3

**Files:**
- Modify: `packages/moonlight-embedded-korri/package.nix`
- Modify: `packages/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch`
- Modify: `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`
- Delete: `packages/moonlight-embedded-korri/patches/0012-diagnose-v4l2m2m-frame-content-hash.patch`
- Test/reference: `nix/tests/korri-moonlight-control-protocol-patch-check.nix`
- Test/reference: `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`

**Approach:**
- Remove `0012-diagnose-v4l2m2m-frame-content-hash.patch` from the Moonlight `patches` list and delete the patch file.
- Preserve Moonlight `0004` through `0011` as the active Korri-owned patch set.
- Update the `postInstall` `korri-patches=` manifest string by adding the currently missing `0011-reset-sdl-presenter-on-output-size-change.patch` entry and keeping `0012` absent.
- Add or extend a Nix check assertion so manifest content is verified, not just manifest-file existence: the generated manifest should include `0011-reset-sdl-presenter-on-output-size-change.patch` and should not include `0012-diagnose-v4l2m2m-frame-content-hash.patch`.
- Move the post-reset SDL event-pump behavior from `0012` into `0011-reset-sdl-presenter-on-output-size-change.patch`; do not keep hash logging or frame dumps active.

**Execution note:** Characterize `0012` before deleting it so non-diagnostic behavior is not lost accidentally with the hash instrumentation.

**Patterns to follow:**
- `packages/moonlight-embedded-korri/package.nix` patch list plus `postInstall` manifest style.
- Existing Moonlight patch split: protocol/env/local-control patches are separated from decoder/context/presenter patches.

**Test scenarios:**
- Happy path: Moonlight builds with `0012` removed and surviving `0004` through `0011` still applied.
- Happy path: generated `nix-support/moonlight-embedded-korri/manifest.txt` reports the same Korri patch set that the derivation applies.
- Happy path: the Nix check fails if the generated manifest omits `0011-reset-sdl-presenter-on-output-size-change.patch` or includes `0012-diagnose-v4l2m2m-frame-content-hash.patch`.
- Edge case: no production code, validation script, or package metadata references `sample_frame_hash`, frame-content hash logs, or `frame-dumps` paths after removal.
- Edge case: post-reset SDL event-pump behavior lives in `0011` and hash/file-dump diagnostics remain deleted.
- Integration: Moonlight package build/check completes with the pruned patch stack and the local-control/runtime-settings protocol checks still pass.

**Verification:**
- The Moonlight derivation no longer applies `0012`.
- The manifest output lists active Korri patches accurately.
- The Moonlight package builds with the remaining patch stack.

---

### U4. Run package and physical validation gates

**Goal:** Verify the pruned patch stacks build and still satisfy the Bandai physical runtime-resolution/scaling acceptance envelope.

**Requirements:** R5, R7

**Dependencies:** U1, U2, U3

**Files:**
- Test/reference: `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`
- Test/reference: `nix/tests/korri-moonlight-control-protocol-patch-check.nix`
- Test/reference: `tools/scripts/gamescope-control-bandai-acceptance.ts`
- Test/reference: `tools/scripts/gamescope-control-bandai-acceptance.test.ts`
- Reference: `docs/acceptance/gamescope-control-bandai-2026-06-02.md`
- Reference: `docs/acceptance/gamescope-scaling-policy.md`

**Approach:**
- First prove build/package safety with the native Nix checks and explicit Sunshine/Moonlight package builds for the relevant host/device systems.
- Then run a steady-state 1080p smoke before the transition gate, and treat Sunshine `0011` removal as unresolved if the subsequent transition-focused physical gate fails.
- For the Bandai physical gate, use settled `DSI-2` captures and corrected bridge CLI ordering while `task-111` is unresolved.
- Record artifact paths and outcomes in the implementation/PR evidence rather than creating a new documentation file unless explicitly requested.

**Patterns to follow:**
- Physical capture criteria in `docs/acceptance/gamescope-control-bandai-2026-06-02.md`.
- Scaling separation rules in `docs/acceptance/gamescope-scaling-policy.md`.
- Stream validation sequencing from `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`.

**Test scenarios:**
- Happy path: pruned Sunshine and Moonlight packages build successfully on the relevant Nix targets.
- Happy path: native Nix check suite passes with the pruned package stack, including manifest-content assertions for Moonlight `0011` present and `0012` absent.
- Happy path: Bandai captures show visible settled content before downshift, at 360p/576p-class inner mode, and after return to 1080p.
- Edge case: capture timing includes settle after mode changes so transient black frames are not mistaken for gate failures or passes.
- Error path: if the checked-in harness emits incompatible CLI ordering, use the corrected manual ordering from `task-111` and classify the harness issue separately rather than calling the cleanup failed.
- Error path: if steady-state 1080p content regresses after removing Sunshine `0011`, stop and re-evaluate whether `0011` was a diagnostic or a required mechanism patch.
- Integration: the same session remains alive across the resolution sequence; no restart/reconnect is accepted as evidence for the physical gate.

**Verification:**
- Build/check gates pass.
- Bandai physical artifacts prove settled visible content across the required sequence.
- Any harness workaround is documented as an interim validation note tied to `backlog/task-111`.

---

## System-Wide Impact

- **Interaction graph:** The change affects Nix package composition for Sunshine and Moonlight, plus downstream device validation that consumes those package outputs. It should not change TypeScript runtime APIs or React/UI code.
- **Error propagation:** Patch-apply or build failures should surface as Nix build/check failures. Physical validation failures should remain categorized separately from harness command-ordering failures.
- **State lifecycle risks:** Removing diagnostics can unmask timing/content issues that were hidden by forced copy, reimport, GL finish, or SDL event-pump side effects. The plan addresses this with side-effect audit plus steady-state/physical validation.
- **API surface parity:** No public API, CLI flag, or control protocol shape should change. Runtime-settings and local-control protocols remain carried by the surviving patches.
- **Integration coverage:** Unit/Nix checks prove package/build invariants only. Bandai physical captures prove the visual/runtime claim.
- **Unchanged invariants:** Runtime resolution remains a proven hardware-gated path, not a generic product automation claim. Gamescope scaling and Moonlight/Sunshine stream resolution remain separate control surfaces.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A “diagnostic” patch contains behavior the working path relies on | Inspect patch content before deletion; preserve only confirmed non-diagnostic behavior in a surviving mechanism patch; strengthen physical validation when evidence is thin. |
| Moonlight manifest output remains stale | Treat the `postInstall` manifest string as part of U2, not incidental cleanup. |
| Nix checks pass while runtime behavior regresses | Require Bandai physical validation because checks do not cover the removed diagnostic patches’ runtime effects. |
| Bandai harness gives misleading results while `task-111` is open | Use corrected manual ordering and settle delay as interim evidence; keep `task-111` deferred for unattended harness repair. |
| Deleted diagnostics are needed for a future investigation | Rely on git history and the journey doc; reintroduce debug instrumentation behind an explicit debug gate if future work needs it. |

---

## Documentation / Operational Notes

- No new durable documentation file is required for this cleanup unless the user explicitly asks for captured evidence to be archived.
- PR/commit evidence should reference `docs/handoffs/live-runtime-resolution-journey.md` for why the removed patches are obsolete.
- PR/commit evidence should include build/check outcomes and Bandai artifact paths.
- If implementation discovers an active dependency on diagnostic output, capture the follow-up in the backlog rather than expanding this cleanup into a broader control-signal redesign.

---

## Sources & References

- Backlog origin: `backlog/task-082 - prune-obsolete-live-resolution-diagnostic-patches.md`
- Related blocker: `backlog/task-111 - fix-bandai-gamescope-acceptance-harness-command-ordering-and.md`
- Sunshine package: `packages/sunshine-korri/package.nix`
- Moonlight package: `packages/moonlight-embedded-korri/package.nix`
- Runtime-resolution journey: `docs/handoffs/live-runtime-resolution-journey.md`
- Bandai acceptance: `docs/acceptance/gamescope-control-bandai-2026-06-02.md`
- Scaling policy: `docs/acceptance/gamescope-scaling-policy.md`
- Gamescope runtime-control contract: `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
