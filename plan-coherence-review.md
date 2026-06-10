# Coherence Review: feat-korri-config-graph/plan.md

**Document:** `work/items/active/01KTSH1K3DTG1B6CN4T1CNKHCJ-feat-korri-config-graph/plan.md`  
**Reviewed:** 2026-06-10  
**Type:** Implementation plan

---

## Findings

### F1. Event payload structure ambiguity in U3

**Severity:** P2  
**Confidence:** 75  
**Autofix class:** gated_auto

**Issue:**
U3 (Replace library SSE with config events) describes the event payload as: "`generation` for active valid graph, `attempt` for rebuild attempt, `status`, `files` on valid events, `message` on invalid events, and `changedPath` when available without leaking unnecessary absolute server paths."

This is a single prose list, but the three event types (`config.ready`, `config.changed`, `config.invalid`) each have different payload shapes. An implementer reading this would not know which fields apply to which event.

**Evidence:**
- U3 Approach, fourth paragraph: "Use the agreed payload model: `generation` for active valid graph, `attempt` for rebuild attempt, `status`, `files` on valid events, `message` on invalid events..."
- U3 Test scenarios do clarify implicitly:
  - `config.ready`: "generation/attempt/status"
  - `config.changed`: "generation/attempt/status, files"
  - `config.invalid`: "current generation retained and error message present"
- But the main payload description doesn't use per-event formatting.

**Why it matters:**
Implementers may guess at payload shape or end up with mismatched contracts between SSE sender and GUI listener, causing silent drops or parse failures.

**Suggested fix:**
Replace the comma-separated payload description with a structure like:

```
- config.ready payload: generation, attempt, status
- config.changed payload: generation, attempt, status, files, changedPath (optional)
- config.invalid payload: generation, attempt, status, message
```

---

### F2. U2 file modifications not described in Approach

**Severity:** P2  
**Confidence:** 75  
**Autofix class:** gated_auto

**Issue:**
U2 (Add KORRID config graph lifecycle) lists two runtime files in the Files section that are not explained in the Approach:

- `product/apps/portal/api/hono-app.ts` (Modify)
- `product/apps/portal/api/server/rpc-server.ts` (Modify)

The Approach section describes introducing a config graph service and opening ProseQL for the daemon lifetime, but does not explain what changes are required in the HTTP routing layer (`hono-app.ts`) or RPC handler layer (`rpc-server.ts`).

**Evidence:**
- U2 Files section lists both files as Modify.
- U2 Approach section mentions: "Introduce a daemon-scoped config graph service that exposes the active last-known-good graph to repository/RPC code."
- But Approach does not say: "wire the service into RPC handlers via Hono" or "inject config graph into request context" or any other specific change.

**Why it matters:**
An implementer would not know whether to:
- Add a new endpoint in `hono-app.ts` (U3 already does that)?
- Inject a service into RPC handler scope?
- Add middleware?
- Or if these modifications are actually needed or should be deferred.

**Suggested fix:**
Expand U2 Approach with a sentence like: "Wire the config graph service into RPC handlers via Effect context injection in `rpc-server.ts` so list/launch handlers can consume the active graph. Ensure `hono-app.ts` does not break when the old `/api/library/events` endpoint is deleted in U3."

---

### F3. Overlapping file modifications across units create ambiguity

**Severity:** P2  
**Confidence:** 50  
**Autofix class:** advisory

**Issue:**
Several files appear in multiple units' file lists, creating ambiguity about whether changes should be made together or separately:

- `product/platform/library/library-source-layer-live.ts`: appears in U1 (parse `KORRI_CONFIG_ROOTS`) and U2 (service seam integration)
- `product/apps/portal/api/hono-app.ts`: appears in U2 (service wiring) and U3 (endpoint replacement)
- `product/platform/library/library-source-layer-live.test.ts`: appears in U1 and U5 (test helpers)

When files are touched by multiple sequenced units, it is unclear whether:
1. Each unit makes its own changes and the file is touched multiple times during implementation.
2. One unit owns the file and another is a duplicate listing.
3. Changes should be combined into a single coherent edit.

**Evidence:**
- U1 and U2 both list `product/platform/library/library-source-layer-live.ts` as Modify.
- U2 and U3 both list `product/apps/portal/api/hono-app.ts` as Modify.
- U1 and U5 both list `product/platform/library/library-source-layer-live.test.ts` as Modify.
- Dependencies show U2 depends on U1, U3 depends on U2, etc., so the units are sequenced, not parallel.

**Why it matters:**
An implementer might make changes in the wrong order, lose track of what was already changed, or create merge/edit conflicts in their working copy if the plan is not clear about ownership.

**Suggested fix:**
For each multiply-listed file, add a note in the Files section indicating which units modify it and in what sequence, or consolidate ownership to one unit. Example:

```
Files:
- Modify: `product/platform/library/library-source-layer-live.ts`
  (U1: parse KORRI_CONFIG_ROOTS env; U2: wire config graph service into source layer)
```

---

### F4. Ambiguous semantics of `attempt` field

**Severity:** P2  
**Confidence:** 50  
**Autofix class:** advisory

**Issue:**
The term "attempt" is used in two different contexts with slightly different meanings:

- **U2 service state** describes it as a counter: "attempt: increments on every rebuild attempt"
- **U3 event payload** describes it as a field to include: "`attempt` for rebuild attempt"

These are not contradictory, but the phrasing is ambiguous. In U2, `attempt` is clearly a monotonic counter. In U3, it is unclear whether `attempt` in the payload refers to:
1. The attempt counter value (a number), or
2. An object describing the current rebuild attempt (e.g., `{ count, status, error }`), or
3. A timestamp or reference to the attempt event itself.

**Evidence:**
- U2 High-Level Technical Design state shape: "attempt: increments only on every rebuild attempt"
- U3 Approach: "Use the agreed payload model: … `attempt` for rebuild attempt …"
- U2 test scenario: "Happy path: valid reload advances generation and subsequent RPC calls observe new config-derived library entries." (does not test attempt field semantics)
- U3 test scenario: "Happy path: `GET /api/config/events` immediately streams `config.ready` with active generation/attempt/status." (lists attempt alongside other primitives, implying it's a scalar, but does not say what type)

**Why it matters:**
If implementer interprets `attempt` as a counter (number), the SSE payload is one shape. If it is interpreted as an object, the payload is different. This will cause a contract mismatch.

**Suggested fix:**
Clarify in U3 Approach: "`attempt` is the monotonically incrementing rebuild attempt counter (number), matching U2's state definition."

---

### F5. ProseQL documentGraph configuration specifics deferred to implementation

**Severity:** P3  
**Confidence:** 50  
**Autofix class:** advisory

**Issue:**
U1 (Wire ProseQL documentGraph) says in Approach: "Exact ProseQL reload event integration point: Implementation should use the 0.14.0 API surface available in the installed package and avoid duplicating documentGraph internals."

This defers a key technical decision (how ProseQL watches changes and triggers reloads) to implementation time. While reasonable for a plan, it leaves ambiguity about whether:
1. The implementation will use ProseQL's built-in watcher and event API, or
2. The implementation will add custom file-system watching and manually trigger rebuilds, or
3. Something in between.

**Evidence:**
- U1 Deferred to Implementation section: "Exact ProseQL reload event integration point..."
- U2 Approach mentions: "Open the ProseQL documentGraph for the daemon lifetime, not per RPC call, so ProseQL watchers stay alive."
- But does not say: "using ProseQL's documentGraph.watch()" or equivalent.

**Why it matters:**
An implementer unfamiliar with ProseQL might build custom file watching instead of consuming ProseQL's built-in watcher, leading to duplicate complexity or missed ProseQL semantics (e.g., codec reload behavior, document graph invalidation).

**Suggested fix (not required if original author is implementing):**
Add a brief note in U1 Approach: "Trigger config rebuilds via ProseQL's documentGraph reload hook when available in the 0.14.0 API; do not build custom filesystem watching."

---

### F6. "host" singleton double-wrap concern lacks full explanation

**Severity:** P3  
**Confidence:** 50  
**Autofix class:** advisory

**Issue:**
U1 Approach mentions: "Apply the plain `host` singleton transform exactly once. Avoid combining codec-level wrapping and documentGraph transform wrapping in a way that double-wraps `host`."

And U1 Test scenarios include: "Error path: `host` singleton appears in a fragment and is not double-wrapped in the runtime collection."

This shows awareness of a potential pitfall, but does not explain:
1. **Where** the double-wrap could occur (which two layers?).
2. **Why** it happens (what is the interaction between ProseQL's document codec and Korri's schema transform?).
3. **How** to detect and prevent it during implementation.

**Evidence:**
- U1 Approach: "Apply the plain `host` singleton transform exactly once."
- U1 Execution note: "Start with characterization tests around current readable schema behavior (`host`, strict canonical sections) before swapping the source kind." (This is good practice but does not explain the risk.)
- Test scenario is a pass/fail outcome, not a description of the mechanism.

**Why it matters:**
An implementer unfamiliar with ProseQL's codec handling and Korri's existing schema transforms might not recognize the double-wrap until tests fail. A brief explanation would help them understand the boundary.

**Suggested fix (not required, explains known risk):**
Add a clarification in U1 Approach: "ProseQL documents may include a `host` singleton for each document. Korri's readable schema transform merges all `host` values into one canonical `host`. Avoid applying this merge at both the document-codec level and the documentGraph-collection level; use documentGraph's transform hook for the single merge point."

---

## Summary

**Total findings:** 6  
**P0 (critical):** 0  
**P1 (high):** 0  
**P2 (moderate):** 4 findings (F1, F2, F3, F4) require review and likely clarification.  
**P3 (low):** 2 findings (F5, F6) are advisory and document deferred/complex technical choices.

**Passing checks:**
- ✓ All requirements (R1–R10) are mapped to implementing units.
- ✓ Unit dependencies form a valid DAG (U1 → U2 → U3; U1 → U4 → U6; U1,U2,U3,U4 → U5 → U6).
- ✓ All scope boundaries and deferred items are consistent; no contradictions with stated limitations.
- ✓ Event API breaking change is explicit and consistent across sections.
- ✓ Platform root ordering and empty baseline semantics are consistent.
- ✓ Terminology (config graph, config roots, config events) is stable across the document.
- ✓ No broken cross-references to sections or backlog items; all cited IDs resolve.
- ✓ Test scenarios are comprehensive and represent happy/edge/error paths.
- ✓ Risk table and decision rationale align with the technical approach.

---

## Recommendations

**Before implementation:**

1. **Resolve F1 (event payload):** Restructure the payload description in U3 Approach to list fields per event type.
2. **Resolve F2 (U2 scope):** Clarify in U2 Approach what changes are made to `hono-app.ts` and `rpc-server.ts`.
3. **Clarify F3 (file ownership):** For files modified by multiple units, add notes indicating which unit owns which changes.
4. **Clarify F4 (attempt semantics):** State explicitly that `attempt` in the event payload is a number matching U2's counter.

**Nice-to-have (not blocking):**

5. **F5 & F6 (deferred notes):** If the original author is not implementing, add brief explanations of the ProseQL watcher API and host singleton merge point.

---

*Coherence review complete. All critical/high findings are resolved. Document is ready for implementation with recommended clarifications.*
