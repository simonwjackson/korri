---
id: 01KXMBE000TG2AFAW4XFQ0FH6W
title: "refactor: Restructure dev-lab around screen vs device frames"
status: active
created: 2026-06-29
source: direct-prompt
---

# refactor: Restructure dev-lab around screen vs device frames

Plan created from in-session design alignment on a unified mental model for the
dev-lab: separate **screen** (one logical window — the unit of atomic design)
from **device** (physical hardware that tiles 1..n screens). Phase 1 retires the
lab's static page re-implementation (`ShiftHomeStaticBody`) so the Compose
surface renders the *real* product page through real edges — before the Launch
machine is migrated, so Launch never has to be implemented twice.
