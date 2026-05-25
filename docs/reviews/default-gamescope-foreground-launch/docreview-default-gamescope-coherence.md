# Coherence review: default Gamescope foreground launch plan

Applied edits: none.

## P1 findings

### P1. Local Moonlight policy drops the plan's own profile/preset opt-out requirement

**Evidence:** The plan requires profile/preset policy to participate: R5 says Gamescope policy can be overridden by “host-machine/system, launcher, game, profile/preset, or launch-time override policy,” and Terminology says “Profile maps to selected preset for this plan” and request/transport paths “must be able to carry selected preset policy when provided.” But the local Moonlight decision and U5 define local policy as only “global policy, the named foreground client/launcher policy, and any local launch override,” with U5 repeating that the resolver folds only global, Moonlight/foreground-client launcher policy, and local override.

**Why it matters:** A planner/implementer following U5 would not implement profile/preset opt-outs for local Moonlight, contradicting R5 and the origin scope that profiles/presets can opt out. This especially muddies AE3 traceability for local stream-client launches.

**Suggested fix:** Either add selected profile/preset to the local foreground-client policy resolver, or explicitly narrow R5/Terminology to say profile/preset opt-outs apply only to game-runner launches and not to local Moonlight.

### P1. The high-level diagram routes local Moonlight through “remote runner policy,” contradicting the separate-policy decision

**Evidence:** Summary and Key Technical Decisions say remote game-runner policy resolves on the source host while local Moonlight policy resolves on the local kiosk/client host. However the diagram routes every launch through `Resolve launch context` → `Normalize Gamescope policy` → `Carry remote runner policy` before branching to `Local Moonlight` → `Resolve local client policy`.

**Why it matters:** The diagram makes the local Moonlight path appear downstream of remote runner policy, exactly the coupling the plan says to avoid. Implementers could carry remote game/preset opt-outs into local Moonlight despite the explicit two-host policy decision.

**Suggested fix:** Split the diagram so the remote branch resolves/carries remote runner policy, while the local Moonlight branch starts from local foreground-client policy resolution; or rename the shared nodes to surface-specific policy resolution instead of “remote runner policy.”

### P1. U2 claims local wrapper/foreground preflight work before the unit that introduces the local foreground owner

**Evidence:** U2 depends only on U1 and is scoped to carrying remote runner policy through prepare/client/CLI paths, but its Approach says to “Add local wrapper/foreground preflight before remote prepare.” U5, which depends on U2/U3/U4, is the unit that introduces the “local foreground-owner seam” and defines the local preflight/remote-prepare/local-foreground-launch ordering.

**Why it matters:** The implementation sequence is internally inconsistent: U2 asks for foreground-owner behavior before the foreground owner exists. This can cause duplicated preflight logic in U2 or block U2 on later units despite its declared dependencies.

**Suggested fix:** Move the local wrapper/foreground preflight bullet and related tests out of U2 into U5, or change U2’s dependencies/scope so it explicitly waits for the local Moonlight composition and foreground-owner units.
