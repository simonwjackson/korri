# Coherence review: default Gamescope foreground launch plan

## Findings

### P1 — U5 leaves direct library launch as an implementation-time scope decision

**Evidence:** The Summary commits to bringing “local Moonlight plus direct foreground launches onto the same policy-aware foreground-session lifecycle.” U5 is titled “Make direct library launches policy-aware or explicitly non-foreground,” then says to “Treat direct library launch as a foreground launch surface unless implementation discovers it is dead or intentionally internal-only” and “If implementation proves this endpoint should not be foreground-capable, explicitly document and test that exclusion.”

**Why this matters:** The plan offers two different acceptable outcomes for a requirement-bearing path. One implementer could make direct library launch policy-aware; another could exclude it after local discovery. That changes the scope and traceability for R1/R5/R7/R9 and the Summary’s “direct foreground launches” commitment.

**Suggested fix:** Decide in the plan whether direct library launch is in scope. If it is, rename U5 to require policy-aware direct launches and remove the “or explicitly non-foreground” escape hatch. If it is out of scope, move it to Scope Boundaries / Deferred Follow-Up and remove U5’s active requirements and verification language.

---

### P1 — Remote opt-out launches cite R7/AE4 but do not specify how foreground ownership survives without Gamescope

**Evidence:** R7 says disabling Gamescope must not disable focus/fullscreen/workspace ownership or restore behavior. U2 claims R7 and AE4, but its disabled-path test only says “disabled policy spawns the raw child command and does not require Gamescope-specific repair prerequisites.” The high-level diagram’s remote branch is “Runner wraps when enabled” → “Runner repairs stream surface,” which leaves the no-Gamescope branch unclear.

**Why this matters:** Implementers could read Gamescope-disabled remote streams as “raw child, no Gamescope selector, no repair,” which would satisfy the U2 test as written while violating R7/AE4. This is exactly the product boundary the requirements are trying to preserve.

**Suggested fix:** Add an explicit U2 approach/test scenario for the disabled remote path: either generic foreground repair still runs without Gamescope, or the plan states that Sunshine owns the foreground invariant for remote opt-out launches and defines the observable validation for that claim.

---

### P1 — “Foreground owner” is named in several incompatible ways without a single authoritative boundary

**Evidence:** The plan uses “foreground session owner,” “foreground owner,” “local foreground-owner seam,” “foreground-owner abstraction,” and “sessiond or an equivalent foreground launcher.” Context says the desktop path needs “a non-blocking foreground owner rather than directly reusing sessiond's current synchronous renderer-stop launch behavior,” while U5 says “Ensure sessiond or an equivalent foreground launcher receives enough policy.” U4’s file list modifies launch bridge/main and Sway helpers, but not `tools/device/sessiond.ts`.

**Why this matters:** Implementers can diverge on whether to extend sessiond, build a desktop-local abstraction, or add policy to existing Sway helpers. That affects lifecycle, blocking behavior, restore behavior, and where tests belong.

**Suggested fix:** Define one authoritative plan term, e.g. “local foreground owner,” and state its boundary: whether it is a new desktop-side abstraction, a sessiond extension, or a wrapper around existing Sway helpers. Then align U4/U5 wording and file lists to that choice.

---

### P2 — Host/global/system/profile terminology is easy to misread

**Evidence:** R5 says each host’s global config is the host-machine default, and Scope Boundaries says there is no new physical host-machine cascade layer. The origin requirements refer to “host-machine/system” and “profile/preset,” while the existing cascade also has a `system` layer that means a game/content system. The plan alternates between “host,” “global config,” “system,” “profile,” and “preset” without a glossary or mapping.

**Why this matters:** A planner/implementer could interpret “system” as the existing game-system layer, a physical host, or a platform module. Likewise “profile” may mean preset, user profile, or a future UI concept. This affects where opt-outs are applied.

**Suggested fix:** Add a short terminology note near Requirements or Key Technical Decisions: host-machine defaults are represented by the current host’s `global` config; existing `system` remains the game/content-system layer; “profile” in the brainstorm maps to preset for this plan unless explicitly deferred.

---

### P2 — U6 test paths and Nix verification target are underspecified compared with the rest of the plan

**Evidence:** U6 lists `nix/tests/*` and `tools/testing/nix/*` as test paths, while other units name concrete test files. The Open Questions section also defers the “Final Nix evaluation target” to implementation and points at another plan to inspect later.

**Why this matters:** U6 is the unit that proves local kiosk images actually have Gamescope available. With only globs plus a deferred target, implementers can choose different Nix checks and still appear to follow the plan.

**Suggested fix:** Replace the globs with the specific expected fixture/test files to update, or explicitly state that U6 must first reconcile with the Nix test-harness plan and then update this plan before implementation continues.
