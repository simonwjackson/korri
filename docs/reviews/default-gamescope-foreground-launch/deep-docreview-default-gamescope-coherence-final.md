# Final coherence review — default Gamescope plan

## Findings

### P1 — U3 still assigns a local Moonlight test to the remote runner unit

**Classification:** safe_auto  
**Confidence:** 100

**Evidence:**
- U3 is scoped to the remote stream runner: `### U3. Generalize runner wrapping and foreground repair for enabled and disabled policies` and `Goal: Ensure remote stream runner launches wrap by default...`.
- U3's files are runner-only: `tools/device/game-stream-launch-intent.ts`, `tools/device/game-stream-runner.ts`, and `tools/device/game-stream-fullscreen.ts`.
- U3 still includes a local Moonlight test scenario: `Happy path: local Moonlight/native-Wayland child includes the Gamescope Wayland exposure path by default.`
- U4 is the unit that owns local Moonlight: `### U4. Add managed, Gamescope-aware local Moonlight launch composition`.

**Why it matters:** This reintroduces the prior two-surface/terminology drift: local Moonlight is a local client surface, while U3 is the remote runner surface. Leaving the Moonlight wording in U3 can make implementers add the test to the wrong unit/files and blur the separate-policy model the rest of the plan now establishes.

**Suggested fix:** In U3, change that test scenario to refer only to a generic native-Wayland child, e.g. `Happy path: a native-Wayland child includes the Gamescope Wayland exposure path by default.` Keep the Sobo/Moonlight-specific Wayland scenario in U4, where it already exists.
