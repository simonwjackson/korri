---
id: 01KVXYT66Y5YXED3PE247PNDDF
slug: self-merchandising-store-deterministic-layout
title: Self-merchandising store — layout as a deterministic function of your library
origin: ideated
status: To Do
date: 2026-06-24
topic: blockbuster-ps1-launcher-browsing-ux
focus: blockbuster-ps1 prototype / pico launcher browsing UX
mode: repo-grounded
parent: work/items/parking-lot/01KVX589XXVGE3MM0G5GHY042Y-blockbuster-ps1-launcher-browsing-ux.md
---

# Self-merchandising store — a deterministic function of your library

> Split from the blockbuster-ps1 ideation (idea #1). Full grounding context lives in the parent
> ideation doc: `work/items/parking-lot/01KVX589XXVGE3MM0G5GHY042Y-blockbuster-ps1-launcher-browsing-ux.md`.

**Description:** Kill RNG seeding. The floorplan becomes a pure, deterministic function of
`(library, play-state, seed)`: the same library always produces the same walkable store (so spatial
memory accrues — you *know* where the new-releases wall is on visit two), and library state is encoded
as physical placement. Continue-playing as a "return cart" by the door; favorites in a glass
staff-picks case; recents as a new-releases wall; popularity as box wear/crowding; never-played dusty
at the back. Curation is geometry — no A–Z list, no badges.

**Warrant:** `direct:` rough edge "pure RNG shelf seeding (no curation/continue/favorites)" + recent
repo work already "seeds the home from an in-memory seed". `external:` shelf-adjacency raises discovery
~9× and face-out/spine-out merchandising — both demand intentional, stable placement that RNG
structurally can't give.

**Rationale:** The single move that turns the store from random scenery into a content-first
information architecture — the thing that makes it more than a prettier carousel; stable layout makes
spatial browse fast on the second visit.

**Downsides:** Needs a placement model + state inputs (edges toward architecture, fakeable with a
static seed in the mockup). Determinism-vs-freshness tension — a store that never changes feels dead;
pair with slow reflow or timed "tides". Missing/wrong cover art (~half of catalogs) breaks cover-first
unless gaps lean into a generic "rental clamshell" style.

**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored
