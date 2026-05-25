# Scope review: default Gamescope foreground launch plan

## P1 findings

### P1. Remote intent cancellation/quarantine is active scope that the origin did not ask for

**Evidence:** The origin asks for default-on wrapping, opt-out inheritance, and visible diagnostics: “Gamescope is enabled by default,” “Any launch can opt out,” and “make it clear enough from resolved launch policy whether a launch used Gamescope or opted out.” It does not require remote prepared-intent cleanup. The plan adds active cross-host cleanup work in U5: “attempt a session-id-bound remote cancellation/quarantine,” plus System-Wide Impact says the plan “requires explicit cancellation/expiry behavior,” and U8 validates that the remote runner “does not replay stale ones.”

**Why this matters:** This turns a default policy/foreground-launch change into a remote lifecycle/API cleanup project. That extra contract can be valuable, but it is not required to satisfy the origin requirements and increases implementation surface across prepare RPCs, remote clients, runner state, and tests.

**Recommendation:** Defer cancellation/quarantine to follow-up unless there is an existing stale-intent bug that must block this feature. Keep only preflight-before-prepare plus visible prepared-no-local-launch diagnostics in active scope; rely on existing intent expiry/requeue behavior unless implementation discovers a real blocker.

**Confidence:** 75

---

### P1. The new local foreground-client policy resolver looks like an unearned config abstraction for one current consumer

**Evidence:** The origin says this work should ride on the existing cascade: “No replacement of the existing config cascade model; this requirement rides on that model.” The plan introduces a separate “local foreground-client policy resolver” over “local global, named foreground-client/launcher policy, and local launch override,” with U5 modifying cascade/resolved-context files specifically so local Moonlight can resolve policy without a game id. In the active units, this resolver has one concrete current consumer: local Moonlight.

**Why this matters:** This creates a second policy-resolution path beside the game launch cascade before the plan demonstrates multiple current consumers. It risks inventing new profile/override semantics for foreground clients while the origin only required default-on Gamescope and normal opt-out inheritance.

**Recommendation:** Right-size U5 to the smallest local-client policy needed now: local global default plus an existing launcher/client opt-out for Moonlight. Defer generalized foreground-client profile/override resolution until at least a second local foreground client needs it, or explicitly route all such clients through the existing cascade with real launch records.

**Confidence:** 75
