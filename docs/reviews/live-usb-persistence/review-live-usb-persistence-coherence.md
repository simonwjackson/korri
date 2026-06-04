# Coherence Review: Live USB Product/Developer Persistence Plan

Document: `../../../work/.archive/01KSBMG31TA7ZG64667DM6SRQ3-feat-live-usb-product-developer-persistence/plan.md`
Document type: plan
Origin checked: `../../../work/.archive/01KSBMG31TA7ZG64667DM6SRQ3-feat-live-usb-product-developer-persistence/requirements.md`

Traceability note: the plan's cited origin IDs resolve: R1-R13, A1-A4, F1-F3, and AE1-AE4 all exist in the origin document.

## Findings

### COH-001 — U5 adds docs-smoke assertions before U6 updates the docs

- Severity: High
- Confidence: 100
- Category: dependency / sequencing contradiction

**Evidence**

- U5 depends only on U3 and U4 (`Dependencies: U3, U4`, line 335), but U5 says to add docs-smoke assertions: “Add docs/smoke assertions for Product/Developer artifact names, fallback behavior, and the no-internal-disk rule” (line 353), and its test scenario asserts the operator docs mention the new Product/Developer contract (line 364).
- U6 is the unit that updates `docs/deployment/korri-images.md` (lines 382-394), and U6 depends on U5 (`Dependencies: U2, U3, U5`, line 380).

**Why it matters**

Following the declared dependency order, U5 would add assertions against documentation that is not updated until U6. That makes the unit ordering self-contradictory and can create a failing intermediate state.

**Recommended fix**

Move the docs-smoke assertions from U5 into U6, alongside the `docs/deployment/korri-images.md` update. Keep U5 focused on flake/QEMU/validation surfaces. Alternatively, if the docs assertions must remain in U5, move the docs update into U5 or make U5 depend on a docs-update unit that runs first.

---

### COH-002 — R7 is unconditional, but later sections make setup-state categories conditional/no-op

- Severity: Medium
- Confidence: 75
- Category: requirement/detail mismatch

**Evidence**

- R7 says: “Product ISO persists only explicitly scoped setup/continuity state for network, input/device, machine identity, and diagnostics” (line 31).
- Later sections say network/input/log persistence is only added when an owning service/path is identified and enabled (lines 115, 217), and the risk table says to “document the category as no-op until the setup surface exists” (line 431).

**Why it matters**

A reader could implement R7 as requiring persisted entries for every named category now, while the detailed approach allows some categories to have no persisted path in this slice.

**Recommended fix**

Qualify R7 to match the detailed contract, e.g. “Product ISO persists explicitly scoped setup/continuity state for enabled owning services in network/input/device categories, stable machine identity, and bounded diagnostics; categories without an enabled owning service are documented as no-op in this slice.”

---

### COH-003 — The high-level graph routes tmpfs fallback into Developer broad setup

- Severity: Medium
- Confidence: 75
- Category: diagram/detail mismatch

**Evidence**

- The graph sends `Resolver --> ApprovedPersist[Approved USB persistence root or tmpfs]` and then `ApprovedPersist --> DeveloperBroad[Developer broad setup]` and `DeveloperBroad --> GreetdDeveloper` (lines 136-140).
- Elsewhere the plan says Developer missing/unsafe persistence should fail before normal kiosk use (lines 102, 114, 267, 320, 415).

**Why it matters**

The diagram implies Developer setup can proceed from the resolver's tmpfs fallback into the Developer kiosk path, while the detailed text says Developer should visibly fail before normal kiosk startup when retained persistence is unavailable.

**Recommended fix**

Split the diagram path: route approved persistent storage to both Product and Developer setup, route tmpfs fallback only to Product ephemeral setup, and route Developer missing/unsafe persistence to an explicit failure node before `greetd/kiosk`.

---

### COH-004 — R3’s “locked root” scope is unclear against Developer-only broad `/etc` and `/var` persistence

- Severity: Medium
- Confidence: 75
- Category: scope ambiguity

**Evidence**

- R3 is unqualified: “Keep the system image/root behavior effectively locked between upgrades” (line 27).
- Later the plan says broad `/var`, `/etc`, or `/home` persistence remains Developer-only (line 104), while also saying neither ISO becomes a mutable full NixOS install (line 48).

**Why it matters**

Readers can disagree about whether R3 constrains only the delivered Product ISO/root image, or also forbids Developer broad `/etc`/`/var` persistence because those paths affect system behavior.

**Recommended fix**

Qualify R3 and the Developer persistence description: state that the delivered Product ISO/root image remains locked, and that Developer broad persistence may retain investigation state under its namespace but must not make the ISO/Nix store a mutable full NixOS install.
