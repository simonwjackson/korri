# Deep document review — coherence

Document: `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`  
Origin: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`

## Findings

### P1 — Plan narrows origin profile/preset opt-out semantics without making the traceability change explicit

**Evidence:** Origin R4 says the default applies to “all foreground app launch surfaces, including local stream clients such as Moonlight,” and origin R5 says policy can be overridden by “host-machine/system, launcher, game, profile/preset, or launch-time override policy.” Origin AE3 also says “Given a game inherits Gamescope enabled and a selected preset disables it, when that preset is launched, the preset opt-out wins.” The plan then narrows this: plan R5 says “local foreground clients use host-local global/launcher/override policy,” terminology says “Local Moonlight policy is host-local and does not inherit remote game presets,” and U5 says “remote game/preset opt-out disables the remote runner wrapper but does not automatically disable local Moonlight wrapping.”

**Why it matters:** The plan may be intentionally refining two-host behavior, but as written it still claims direct traceability to origin R5/AE3 while changing how profile/preset opt-outs apply to Moonlight. An implementer could reasonably satisfy the plan by omitting local Moonlight profile/preset opt-outs, while an origin-doc reader could expect profile/preset opt-outs to apply to every foreground surface including Moonlight.

**Suggested fix:** Add an explicit “planning refinement of origin R5/AE3” note in `## Requirements` or `## Key Technical Decisions`, e.g. “For two-host stream launches, game/preset policy applies to the remote game-runner surface only; local Moonlight uses local host/launcher/override policy unless a future local profile UI supplies a local preset.” Alternatively, revise R5/U5 to include local profile/preset policy if that is still required.

---

### P2 — “foreground-client”, “client/launcher”, and “launcher” policy terminology drifts

**Evidence:** Plan R5 says local foreground clients use “host-local global/launcher/override policy.” The key decision says local Moonlight policy comes from “global policy, the named foreground client/launcher policy, and any local launch override.” U5 says the resolver folds “global policy, a named Moonlight/foreground-client launcher policy, and any local launch override.” The terminology section defines “Local foreground owner,” but does not define “foreground-client policy” or whether “client” is a new config layer distinct from the existing launcher layer.

**Why it matters:** This is not just naming style: the plan also says “No broad rewrite of the config cascade” and “No new physical host-machine cascade layer,” so readers need to know whether local Moonlight policy reuses an existing launcher record, introduces a policy-only foreground-client concept, or adds another layer.

**Suggested fix:** Normalize to one term. If this reuses the existing launcher layer, replace “foreground-client/client policy” phrasing with “local Moonlight launcher policy” throughout. If it is a new policy-only concept, define it explicitly in `### Terminology` and update R5/U5 to name the layer consistently.

---

### P2 — The high-level diagram routes local/direct launches through “remote runner policy” before splitting by surface

**Evidence:** The diagram has the shared path `Launch request -> Resolve launch context -> Normalize Gamescope policy -> Carry remote runner policy -> Launch surface`, then branches to `Local Moonlight` and `Direct library launch`. Elsewhere the plan says policy is separate per host/surface: “Remote game-runner policy resolves on the source host; local Moonlight policy resolves on the local kiosk/client host,” and “local Moonlight policy comes from a local foreground-client policy resolver.”

**Why it matters:** The prose and diagram disagree about where the remote runner policy applies. A reader following the diagram could infer that local Moonlight and direct library launches first carry or depend on remote runner policy, contradicting the two-host separation.

**Suggested fix:** Split the diagram before policy resolution, or relabel the shared node to something surface-neutral like “Carry resolved policy for current surface,” then show the remote branch resolving/carrying remote runner policy and the local Moonlight branch resolving local client policy separately.
