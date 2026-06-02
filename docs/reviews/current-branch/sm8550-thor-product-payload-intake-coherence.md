---
type: coherence
document: docs/plans/2026-05-28-001-feat-sm8550-thor-product-payload-intake-plan.md
reviewed_at: 2026-05-28
---

# Coherence Review: SM8550 Thor Product-Payload Intake Plan

## Executive Summary

The plan is well-structured with clear U-ID enumerations and a valid dependency DAG. However, three moderately-confident inconsistencies and one stale forward reference require fixes before implementation:

1. **U5 terminology drift** (P1, confidence 75): GitHub Actions matrix variable named `device` but consistently called `product` everywhere else, creating confusion about the selector variable name during implementation.
2. **File-path context ambiguity** (P1, confidence 75): Units U1–U6 list file paths without `.worktrees/refactor/rocknix-product-payload/` prefix, leaving implementer uncertain whether paths are relative to branch root or repo root post-merge.
3. **Stale forward reference to U13** (P0, confidence 100): Key Technical Decisions section references "U13" but Implementation Units section only defines U1–U12.
4. **R10 traceability gap** (P2, confidence 50): Requirement R10 (fail-closed on wrong-compatible payload) mentioned in Impact but not explicitly traced to U7, despite U7 modifying verify scripts that implement R10.

---

## Detailed Findings

### P0: Forward References to Non-Existent U13 (confidence: 100)

**Locations:** 
- Key Technical Decisions, final bullet: "Device IP confirmation is a hard precondition for U13."
- U10 (CI proof: image-only build), Files: "can be inlined into U13 acceptance"

**Issue:** The Implementation Units section defines U1 through U12. U13 does not exist. Both locations reference U13, but the final device-acceptance unit is U12, not U13. The references should be corrected to U12.

**Why it matters:** An implementer reading Key Technical Decisions or reviewing U10's files will see U13 referenced twice and look for it among the units, creating false confusion about unit completeness or whether a unit was omitted. This also creates ambiguity about whether U10 was meant to generate content for a separate U13 unit (e.g., a device-acceptance decision gate) or whether the U10 artifact should be folded into U12.

**Recommended fix:** 
1. In Key Technical Decisions, change "Device IP confirmation is a hard precondition for U13." to "...for U12."
2. In U10 Files, change "can be inlined into U13 acceptance" to "can be inlined into U12 acceptance".

**Confidence:** 100 (textual error, unambiguous; U12 is explicitly titled "Device acceptance for `bandai` (Thor)")

**Classification:** safe_auto

---

### P1: GitHub Actions Matrix Variable Naming vs. Semantic "Product" (confidence: 75)

**Locations:** 
- Key Technical Decisions: "Use `strategy: matrix: device: [odin2portal, thor]`..."
- U5 Approach: "Add `strategy: matrix: device: [odin2portal, thor]`..."
- U5 Approach: "Replace hardcoded references with `korri-rocknix-product-payload-${{ matrix.device }}`..."
- Throughout the plan: "product` workflow/build input" (R5, U9 Approach, U9 Files)

**Inconsistency:** 

Requirements and other units consistently use "product" as the semantic name for the Korri/nix-on-rocks selector:
- R5: "an explicit `product` workflow/build input selects which one is consumed"
- U7 goal: "define the `--product` selector contract"
- U8 goal: "teach `scripts/build-sm8550` ... to honor the `--product` selector"
- U9 Approach: "Add `inputs.product` (required, no default, choices `odin2portal` and `thor`)"

But U5's Key Technical Decision and implementation guidance uses "device" for the GitHub Actions matrix variable:
- "Use `strategy: matrix: device: [odin2portal, thor]`"
- "Rename the job... to 'Candidate ${{ matrix.device }} payload'"
- "Replace hardcoded... references with `korri-rocknix-product-payload-${{ matrix.device }}`"

**Why it matters:** An implementer in U5 will create a `strategy: matrix: device: [...]` block, then in U9 will need to plumb `inputs.product` through the workflows. The variable names diverge (matrix.device vs inputs.product), creating a mismatch that could cause copy-paste errors or confusion about which variable name is canonical in CI contexts.

The natural expectation is that "product" (the semantic concept) maps to `matrix.product` or `inputs.product`, not to `matrix.device`. The term "device" is already used for physical hardware (bandai, sobo) and for Korri configurations (ayn,thor, ayn,odin2portal).

**Recommended fix:** Standardize on `matrix.product` in U5's Key Technical Decisions and U5 Approach sections. The GitHub Actions examples should use `${{ matrix.product }}` consistently with `inputs.product` in U9.

**Confidence:** 75 (implementer divergence likely; two careful readers would probably standardize on "product" since R5 establishes it as the semantic selector name)

**Classification:** gated_auto (fixable via terminology normalization)

---

### P1: File-Path Context Ambiguity (confidence: 75)

**Locations:**
- U1 Files: Lists paths like `nix/korri-rocknix-product-payload.nix` (no `.worktrees` prefix)
- U2 Files: "Modify: `nix/tests/korri-rocknix-product-payload-check.nix`"
- U3 Files: "Modify: `flake.nix` (add Thor instantiation...)" and "`nix/tests/korri-rocknix-product-payload-check.nix`"
- U4 Files: "Modify: `tools/artifacts/rocknix-product-payload-finalize.ts`"
- U5 Files: "Modify: `.github/workflows/rocknix-product-payload.yml`"
- Context Research: All references use full `.worktrees/refactor/rocknix-product-payload/nix/...` prefix

**Inconsistency:**

The Context & Research section consistently refers to the branch worktree with full paths:
- ".worktrees/refactor/rocknix-product-payload/nix/korri-rocknix-product-payload.nix"
- ".worktrees/refactor/rocknix-product-payload/nix/tests/korri-rocknix-product-payload-check.nix"

But the Implementation Units (U1–U6) list file paths WITHOUT the worktree prefix:
- "nix/tests/korri-rocknix-product-payload-check.nix"
- "tools/artifacts/rocknix-product-payload-finalize.ts"

U1's Approach says: "`git rebase trunk` from `.worktrees/refactor/rocknix-product-payload`" — the rebase operation happens from the branch, but the branch remains a worktree; it is not merged to trunk.

**Ambiguity:** An implementer reading U2 Files "Modify: `nix/tests/korri-rocknix-product-payload-check.nix`" faces three possible interpretations:

1. The path is relative to the `.worktrees/refactor/rocknix-product-payload/` branch root (implicitly the working context for U1–U6).
2. The path is relative to the repo root and the file will be modified on trunk after U1's rebase merges the branch (but U1 doesn't mention merging).
3. The path refers to a future state where the file exists on trunk (but U1 only rebases, doesn't merge).

**Why it matters:** An implementer could misunderstand whether to:
- Work inside the branch worktree (correct), or
- Check out the file from trunk and modify it there (incorrect, would lose branch changes), or
- Wait for U1 to merge the branch to trunk before starting U2 (incorrect, U1 doesn't state a merge).

This ambiguity could cause implementers to perform edits in the wrong location or at the wrong time in the unit sequence.

**Recommended fix:** Either:
- Add a preamble to Implementation Units: "All Units U1–U6 assume the working context is the `.worktrees/refactor/rocknix-product-payload/` branch. File paths are relative to that branch root," OR
- Consistently prefix all file paths in U1–U6 with `.worktrees/refactor/rocknix-product-payload/` to remove ambiguity.

**Confidence:** 75 (two implementers would likely diverge on whether to edit in the branch or on trunk)

**Classification:** gated_auto (fixable via path clarification)

---

### P2: R10 Traceability Gap (confidence: 50, FYI)

**Locations:**
- Requirements section: R10 states "The substrate must continue to fail closed when a wrong-compatible payload is presented..."
- U7 Requirements: Lists only "R5"
- System-Wide Impact: "Error propagation: ... wrong-compatible payloads continue to be rejected... (R10)"

**Issue:** R10 (fail-closed for wrong-compatible payload) is a requirement that affects the nix-on-rocks substrate verify scripts. U7 modifies those scripts (`scripts/verify-product-payload`, `scripts/verify-sm8550-locks`, `scripts/verify-sm8550-payloads`), yet U7's Requirements section lists only R5, not R10.

U7's Test scenarios do cover R10 implicitly: "Verifier reject paths produce expected non-zero exit codes with clear messages" and "`scripts/tests/product-payload-contract.sh --product odin2portal` and `--product thor` both pass."

**Why it matters:** A reader of U7 might not realize that the unit is also responsible for ensuring R10 coverage (fail-closed for both products). The traceability chain is incomplete: R10 → U7 is stated only in the Impact section, not in U7's own metadata.

**Recommended fix:** Add R10 to U7's Requirements section, or add a note in U7 that R10 is verified passively through test scenarios.

**Confidence:** 50 (FYI level; R10 is covered by U7's test scenarios, but the traceability is incomplete)

**Classification:** FYI (no action required, but improves readability)

---

## Cross-Checks

### U-ID Enumeration and Dependency DAG
- Units U1–U12 are all defined and numbered without gaps.
- Dependency chain forms a valid DAG (no cycles):
  - U1 (rebase) → U2, U3, U4 (parallel work on rebased branch)
  - U2 → U3 (parameterization prerequisite)
  - U3, U4 → U5 (both needed for multi-product matrix)
  - U3, U5 → U6 (docs)
  - U3 → U7 (nix-on-rocks payload exists)
  - U7 → U8 → U9 (selector chain)
  - U9 → U10 → U11 (CI proofs, image-only first)
  - U11 → U12 (device acceptance after full build)
- ✓ All dependencies explicitly stated and resolvable

### Requirements Traceability
- R1 → U3 ✓
- R2 → U3 ✓
- R3 → U3, U4, U5 ✓
- R4 → U1 ✓
- R5 → U7 ✓
- R6 → U8, U9 ✓
- R7 → U10, U11 ✓
- R8 → U12 ✓
- R9 → U12 ✓ (mentioned as hard precondition)
- R10 → U7 (implicit, not listed) ⚠ (see P2 above)

### Terminology Consistency
- "product" vs "device": Mostly consistent except for the U5 matrix variable (see P1)
- "Korri" vs "korri": Consistently used (capitalized for product/project, lowercase for paths)
- "nix-on-rocks" vs "substrate": Consistently distinguished (repo name vs role)
- "product-payload": Consistently used for the artifact type

---

## Summary Table

| Finding | P-Level | Confidence | Type | Locations |
|---------|---------|-----------|------|-----|
| U13 forward references (2 occurrences) | P0 | 100 | safe_auto | Key Technical Decisions, U10 Files |
| U5 matrix variable named `device` vs semantic `product` | P1 | 75 | gated_auto | ~5 line changes in U5 approach |
| U1–U6 file paths missing `.worktrees` context | P1 | 75 | gated_auto | Add preamble or prefix all paths |
| R10 not listed in U7 Requirements | P2 | 50 | FYI | Add to Requirements or Test Scenarios note |

---

## Recommendation

### Priority Actions (before implementation begins)

1. **Fix P0 (safe_auto, confidence 100)**: Correct two stale U13 references to U12:
   - Key Technical Decisions: "Device IP confirmation is a hard precondition for U13" → "U12"
   - U10 Files: "inlined into U13 acceptance" → "U12 acceptance"

2. **Fix P1a (gated_auto, confidence 75)**: Standardize matrix variable naming:
   - U5 Key Technical Decisions: change `matrix: device:` to `matrix: product:`
   - U5 Approach: change all `${{ matrix.device }}` references to `${{ matrix.product }}`
   - Rationale: R5 establishes "product" as the semantic selector name; it should be consistent in GitHub Actions matrix syntax.

3. **Fix P1b (gated_auto, confidence 75)**: Clarify file-path context for U1–U6:
   - **Option A (recommended):** Add a preamble before Implementation Units: "All Units U1–U6 operate within the `.worktrees/refactor/rocknix-product-payload/` branch. File paths listed are relative to that branch root."
   - **Option B:** Consistently prefix all file paths in U1–U6 with `.worktrees/refactor/rocknix-product-payload/`.
   - Rationale: Current paths are ambiguous; implementers may edit on trunk instead of the branch, causing loss of changes.

### Post-Implementation Enhancement

4. **Note P2 (FYI, confidence 50)**: Add R10 to U7's Requirements section or add a test-scenario callout that R10 is verified by the contract tests. Currently R10 is covered but not explicitly traced in U7's metadata.

---

## Conclusion

No contradictions between Requirements and Scope Boundaries were detected. The U-ID enumeration (U1–U12) is complete and the dependency DAG is valid. The plan is well-structured and internally consistent. **It is ready for implementation after the three fixes above** (one P0 + two P1 options; P2 is optional enhancement).
