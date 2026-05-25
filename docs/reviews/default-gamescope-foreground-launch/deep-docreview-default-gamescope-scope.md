# Scope review: default Gamescope foreground launch plan

Plan: `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`  
Origin: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`

## Findings

### P1 — The generic local foreground-client policy resolver looks over-abstracted for the current consumers

**Why this matters:** The origin requires default-on Gamescope and opt-out through the existing cascade, including local stream clients such as Moonlight. The plan turns the local-client side into a new generic “foreground-client policy resolver” abstraction even though the only explicitly current non-game local client is Moonlight. That adds plan-time abstraction before it has multiple current consumers.

**Evidence:**
- Origin R4: “The default applies to all foreground app launch surfaces, including local stream clients such as Moonlight.”
- Origin dependency: “The launch config cascade described in `docs/briefs/2026-05-21-korri-config-cascade-brief.md` is the intended inheritance model for policy resolution.”
- Plan Key Technical Decision: “local Moonlight policy comes from a local foreground-client policy resolver over the local host's global policy, the named foreground client/launcher policy, and any local launch override.”
- Plan U5 files include shared cascade changes: `korri/shared/library/config/cascade-resolver.ts` and `korri/shared/library/config/resolved-launch-context.ts`.

**Suggested fix:** Narrow U5 to a Moonlight/local-launch adapter that uses the existing `GamescopePolicy` type and host-global default without introducing a named generic foreground-client resolver. Keep the abstraction seam only where there are current consumers: remote game runner, local Moonlight, and direct library/game launch. Add a deferred follow-up note for a generic foreground-client resolver once a second local non-game foreground client exists.

---

### P2 — Returning remote runner policy through prepare RPCs for diagnostics may be more API surface than R9 requires

**Why this matters:** After the two-host clarification, local Moonlight no longer consumes the remote game-runner policy. That leaves “remote runner policy diagnostics/status” as the main reason to expand prepare responses. R9 requires enough visibility to debug whether Gamescope was used or opted out, but that can likely be satisfied with intent contents, logs/status, and runner diagnostics without adding more wire-surface in the first slice.

**Evidence:**
- Origin R9: “The system should make it clear enough from resolved launch policy whether a launch used Gamescope or opted out, so debugging does not depend on guessing hidden defaults.”
- Plan U2 approach: “Extend prepare responses only as needed for remote runner policy diagnostics/status; local Moonlight must not use remote game policy as its host default.”
- Plan Open Questions: “Exact data shape for remote policy diagnostics returned by prepare RPCs...”
- Plan U8 already covers diagnostics: “Add concise logging/status detail at launch boundaries that reports resolved Gamescope enabled/disabled and whether extra args were present.”

**Suggested fix:** Re-scope U2 so prepare response expansion is only required if a current caller needs it for behavior, not just diagnostics. Move pure visibility to U8 via structured logs/status and launch-intent inspection. If a prepare response field remains, frame it as a minimal status convenience, not a core requirement for the default-on policy.

## No P0 findings

I did not find a blocker-level scope issue. The plan is large, but the origin is also broad: default-on Gamescope, opt-out inheritance, local Moonlight, foreground ownership, and visible resolved policy all interact across multiple current launch paths.
