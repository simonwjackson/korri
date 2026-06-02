# Scope review: foreground session lifecycle Phase 1

No P0/P1/P2 scope findings.

## Findings

### SG-001 — Add the missing Gamescope policy/config non-goal

- **Severity:** P3
- **Confidence:** 75
- **Disposition:** safe_auto

**Evidence**

- Origin scope boundary: “No default scaling, filters, FSR, frame pacing, resolution forcing, or quality profiles.”
- Origin scope boundary: “No replacement of the existing config cascade model; this requirement rides on that model.”
- Current plan scope says it will “Preserve default-on Gamescope behavior” and “Preserve current prepare, Moonlight launch, Gamescope wrapping, and foreground repair behavior,” but its Scope Boundaries do not explicitly rule out Gamescope policy/cascade/tuning edits while U3/U5 touch `moonlight-launcher`, `launch-bridge`, and Gamescope policy resolution paths.

**Why this matters**

Phase 1 is the lifecycle contract plus typed re-entry rejection. Because the implementation touches the same files that carry local Moonlight Gamescope policy, the plan should explicitly prevent implementation from drifting back into the already-separate default-Gamescope policy work.

**Suggested fix**

Add a Scope Boundary such as: “No Gamescope policy/cascade/default-wrapper changes in Phase 1 beyond preserving existing behavior; no scaling, filters, FSR, frame pacing, resolution forcing, quality profiles, or new opt-out semantics.”
