# Coherence Review: foreground session lifecycle Phase 1

## Findings

### P2 — U4 uses the typed busy result before depending on the unit that defines it

- **Confidence:** 75
- **Disposition:** proposed
- **Evidence:** U2 is the unit that adds the typed desktop busy outcome: “Add typed busy results to the desktop launch contract” and “Add a stable busy/not-ready failure category to the desktop-local launch response union.” U4 then says the owner should “Reject all not-idle states with the typed busy result and no adapter invocation,” but U4 lists dependencies only as `U1, U3`.
- **Why it matters:** The unit graph leaves two incompatible readings: either U4 depends on U2’s desktop RPC result and should declare `U2`, or U4 should remain generic and return U1 lifecycle rejection data for U5 to map into the typed RPC result. As written, implementers could either introduce a hidden dependency from the owner to desktop launch result types or implement U4 without the typed result the approach names.
- **Suggested fix:** Either add `U2` to U4’s dependencies, or change U4 wording to “generic busy rejection data” and state that U5 maps it to the typed desktop-local busy result.

### P2 — U3 traces to AE5 while its stated test language implies a second child can still be started

- **Confidence:** 75
- **Disposition:** proposed
- **Evidence:** U3 lists `AE5` under requirements, but origin AE5 requires rejection “without preparing another host stream or spawning another local child.” U3’s integration scenario says: “desktop diagnostic runner does not terminate an existing child as part of starting a new one,” while owner-based rejection is not introduced until U4/U5.
- **Why it matters:** This makes U3’s acceptance traceability and sequencing ambiguous. AE5 is about rejecting re-entry with no second spawn; U3 appears to cover only removing replacement/kill behavior in the spawn seam. Read literally, U3 could produce the opposite unsafe behavior temporarily: preserving the old child while starting another one.
- **Suggested fix:** Remove `AE5` from U3 or clarify that U3 is only a prerequisite for AE5 and that U5 owns the “no second spawn” acceptance. Rephrase the U3 test to avoid implying active-child re-entry is allowed at that layer.
