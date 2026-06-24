---
id: 01KVX589XXVGE3MM0G5GHY042Y
slug: blockbuster-ps1-launcher-browsing-ux
title: Blockbuster PS1 prototype — launcher browsing UX
origin: ideated
status: To Do
date: 2026-06-24
topic: blockbuster-ps1-launcher-browsing-ux
focus: the blockbuster-ps1 R3F prototype as a proxy for Korri's pico (art-forward, content-first) launcher
mode: repo-grounded
---

# Ideation: Blockbuster PS1 prototype — launcher browsing UX

## Grounding Context (Codebase)

The subject is the prototype at `work/prototypes/blockbuster-ps1/`: a walkable PS1-style 3D
"Blockbuster video store" in React Three Fiber. You move first-person (pointer-lock) through
three gondola aisles of double-sided VHS boxes showing real cover art (NES→modern, SteamGridDB),
pick up a tape, flip to read the back (screenshots + blurb), drop it, and carry it to a "console"
in a separate viewing room to "load" it (TV powers on). PS1 shader: vertex snap, affine UVs,
Gouraud, fog, Bayer dither, low-res framebuffer upscaled nearest-neighbor.

It is a **proxy for Korri's pico launcher surface**, whose mandate is art-forward / content-first:
explicitly no front-loaded A–Z list, no system-first navigation. Current phase is UI-mockup only
(no backend / architecture / networking design).

**Known rough edges:** pure RNG shelf seeding (no curation, continue-playing, or favorites); bare
console load (no metadata or real launch intent); MOUSE-ONLY navigation (no gamepad/LRUD/keyboard-
directional, which Korri's decoupled spatial-nav stack requires); no fast index/search; PS1
dithering hurts text legibility.

**Korri learnings available:** decoupled spatial-navigation stack (LRUD + semantic-action bus via
`@platform/input`; see `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`),
pointer-aware nav, intrinsic design (fluid tokens, container queries, density-over-zoom), platform/
theme architecture (themes are autonomous experiences consuming platform capabilities). No documented
R3F/WebGL/LOD learnings — that terrain is new.

**External signal:** Diegetic browsing is well-precedented and emotionally proven (Google WebGL
Bookcase, PS3 XMB, Off-Peak / Haunted PS1, vaporwave malls). Apple Cover Flow delighted users but was
abandoned for being slow/animation-heavy at scale → diegetic browse must NEVER be the only way in;
pair with a fast index/jump + reduced-motion, high-contrast fallback. Library shelf-adjacency raises
discovery ~9×; record-store bin-flipping serendipity; bookshop face-out vs spine-out merchandising.
Emulator frontends (WiiFlow, EmulationStation) already do cover-first — differentiate via the
diegetic STORE, not a prettier carousel. Accessibility: stylized low-res 3D + dithering actively
hurts legibility, so a flat parity view is a hard requirement.

## Ranked Ideas

### 1. The store merchandises itself — a deterministic function of your library
**Description:** Kill RNG seeding. Floorplan is a pure deterministic function of `(library, play-state,
seed)`: the same library always produces the same walkable store (spatial memory accrues across
visits), and library state is encoded as physical placement — continue-playing as a "return cart" by
the door, favorites in a glass staff-picks case, recents as a new-releases wall, popularity as box
wear/crowding, never-played dusty at the back. Curation is geometry — no A–Z list, no badges.
**Warrant:** `direct:` rough edge "pure RNG shelf seeding (no curation/continue/favorites)" + recent
repo work already "seeds the home from an in-memory seed". `external:` shelf-adjacency raises discovery
~9× and face-out/spine-out merchandising — both demand intentional, stable placement RNG can't give.
**Rationale:** The single move that turns the store from random scenery into a content-first
information architecture (more than a prettier carousel); stable layout makes spatial browse fast on
the second visit.
**Downsides:** Needs a placement model + state inputs (edges toward architecture, fakeable with a
static seed in the mockup); determinism-vs-freshness tension; missing/wrong cover art (~half of
catalogs) breaks cover-first unless gaps lean into a generic "rental clamshell" style.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

### 2. Zone the diegesis — ambient PS1 world, stabilized functional panel
**Description:** Draw an explicit line where the lo-fi look stops paying off. The walkable PS1 store
stays an ambient set; decision-critical work (reading a blurb, confirming a pick) happens on a
stabilized, dither-suppressed, high-contrast diegetic surface (a counter screen, or the held box's
focus-read inset) rendered from the same library state. That panel doubles as the reduced-motion /
high-contrast parity view. The store is never the only way in.
**Warrant:** `external:` VR media rooms keep the picker as a flat panel (signal of where diegesis
stops helping); Cover Flow died partly from being animation-heavy at scale. `direct:` rough edges
"PS1 dithering hurts text legibility" + "MOUSE-ONLY nav" + the explicit reduced-motion fallback
requirement.
**Rationale:** Resolves legibility, accessibility, and the historical cover-first failure mode with
one decision: one state, two renderings.
**Downsides:** Risks feeling like "two UIs"; the ambient/functional line must be drawn carefully or
the magic leaks out.
**Confidence:** 82%
**Complexity:** Medium
**Status:** Unexplored

### 3. Diegetic summon — the fast index as an act, not a list
**Description:** Give the mandated fast-find path without betraying no-A–Z/content-first: express an
intent or trait ("horror," "something short," "unfinished," a known title) and matching boxes
physically eject / a drawer slides out / the clerk bags three — results materialize as objects on a
counter, not rows of text.
**Warrant:** `direct:` rough edges "no fast index/search" + no escape hatch for "I know exactly what
I want." `external:` Cover Flow's lesson (cover-first must pair with a fast jump). `reasoned:` pharmacy
"state a need → prepared handful" and seed-bank "request a trait → drawer pulls" beat catalog overwhelm
by substituting authority-mediated retrieval for shelf-walking.
**Rationale:** The fast path keeps cover-first viable at scale; expressing it diegetically keeps the
identity intact.
**Downsides:** Needs trait/metadata tagging (leans toward a data model); summon animations risk
gimmickry if overused.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 4. Redesign the launch moment — collapse the trip, keep the commit
**Description:** The carry-to-console-in-another-room trip is the most spatially expensive step and ends
in a bare cover-on-TV with no metadata. Fork: (a) collapse — the held box powers on as a live diorama
preview and a single declare/confirm beat is the launch (no second room); or (b) enrich — keep the room
but make the TV the moment real metadata arrives (resume point, last-played, controller hints,
confirm-to-launch). Either way the highest-intent moment carries the most information + a deliberate
commit.
**Warrant:** `direct:` rough edge "bare console load (no metadata, no real launch intent)." `external:`
customs "declare what you're carrying" supplies a ceremonial single-item commit; VR rooms suggest the
long carry-trip is a low-value diegetic step.
**Rationale:** The payoff of the entire browse is currently empty; this is where browse becomes play.
**Downsides:** Collapsing discards a bit of theater (the viewing room); enriching keeps the walk-tax.
**Confidence:** 78%
**Complexity:** Medium
**Status:** Unexplored

### 5. Dignified at N=5, navigable at N=50,000 — on a handheld and a TV
**Description:** Three fixed aisles are charming at 30 games, embarrassing at 5, impossible at 5,000.
Make layout scale-adaptive: at tiny N, museum-style spotlit pedestals; at huge N, the far field becomes
a non-itemized "spine-wall" mosaic navigated by colored strata/era/genre, resolving to titles only on
approach. Drive the same scene across devices via intrinsic-design density-over-zoom: walk-to-browse on
a handheld, gaze/spotlight-sweep from the couch on a TV.
**Warrant:** `direct:` fixed "three gondola aisles" vs a NES→modern catalog + Korri intrinsic design
(density-over-zoom, handheld→TV). `external:` LaunchBox lags past ~1000 covers and Cover Flow died at
scale — honest large-library nav must aggregate before it itemizes.
**Rationale:** Scale and device-range are existential for a launcher.
**Downsides:** Spine-wall LOD is real rendering work; the empty/first-run state needs as much design
love as the power-user state.
**Confidence:** 80%
**Complexity:** High
**Status:** Unexplored

### 6. Controller-native traversal — drive the scene from the semantic-action bus
**Description:** Mouse-only pointer-lock contradicts Korri's hard requirement for device-agnostic
directional input. Re-anchor traversal on discrete focus targets (shelf slots, endcaps) the LRUD bus
hops between — `direction` moves focus/steers, `confirm` picks up, `back` reshelves, `options` reads
the box — with free-look as an optional layer, not the contract. Concrete scheme worth prototyping:
stand fixed and let the aisle glide past on a rail (XMB's "world moves around you"), which maps cleanly
to a d-pad. Pairs with #2's panel as the two halves of the input story.
**Warrant:** `direct:` rough edge "MOUSE-ONLY nav (no gamepad/LRUD…which Korri's decoupled spatial-nav
stack requires)" + AGENTS.md mandate + `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`.
`external:` XMB's fixed-you/moving-world metaphor aged well as non-grid nav.
**Rationale:** The line between a tech demo and a shippable Korri surface — the concept can't be a
launcher on the platform's primary input model until the scene subscribes to the bus.
**Downsides:** Discrete-focus traversal trades away some free-roam immersion; reconciling "walk
anywhere" with "hop between focusable slots" is a real tension.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Explored

### 7. Resume-first — open on the one obvious next play
**Description:** Most launcher sessions are "get me back into the thing I was playing," yet the spatial
fantasy taxes that with a walk. Open already focused on your continue-playing tape (the "tape still in
the deck" / a single lit box in an after-hours store), one action to resume. Browsing the aisles becomes
a deliberate opt-in for discovery, not a toll on every launch.
**Warrant:** `direct:` rough edges "no continue-playing" + "bare console load." `external:` Cover Flow
abandoned for being slow at scale (delight must be skippable). `reasoned:` on a handheld you open the
launcher to play, not to tour.
**Rationale:** Protects the highest-frequency real use case so the art-forward browse stays a joy you
choose, not a chore you endure.
**Downsides:** Lean too hard and the beautiful store rarely gets seen; needs a graceful "nothing in
progress yet" first-run variant.
**Confidence:** 80%
**Complexity:** Low-Medium
**Status:** Unexplored

## Rejection Summary

| # | Idea(s) | Reason Rejected |
|---|---------|-----------------|
| 1 | Stable-layout, generator, deterministic-seed, state-as-fixtures, self-sorting, salience cues, crowd/wear, tides, operator-authoring | Same merchandising cluster — folded into Idea #1 |
| 2 | Focus-read, reduced-motion parity, read-only-diegesis | Folded into Idea #2 |
| 3 | No-text store | Interesting extreme but too purist to be a product |
| 4 | Speak-to-eject, pharmacy, seed-bank, directory kiosk | Folded into Idea #3 |
| 5 | Clerk-as-character, confessional booth | A character-as-interface is a bigger product bet → brainstorm, not near-term |
| 6 | Implicit-load, no-viewing-room, live-diorama-box, customs-declare | Folded into Idea #4 |
| 7 | N=5 museum, N=50k spine-wall, long-walk warp, intrinsic-density, TV-spotlight, store-rearranges-around-you | Folded into Idea #5 |
| 8 | Pointer-lock rework, conveyor aisles, hover snap-to-slot | Folded into Idea #6 |
| 9 | Drop-box/return chute, after-hours-single-tape, 3-second-store | Folded into Idea #7 |
| 10 | Neighbor-graph service, cover-art asset resolver, theme-contract proof | Backend/architecture — out of scope for the UI-mockup phase |
| 11 | "Whole industry not your library", "channel you tune" theme-switching | Scope expansion beyond a single experience → brainstorm variant |
| 12 | Falconry companion, vinyl plinth always-playing, wine-flight, spine-out-on-gaze, ambient-pre-flip, 4fps teleport-step | Flourishes / perf stress-tests — strong brainstorm detail, below the bar as standalone directions |
| 13 | No-cover-art clamshell | Real defensive need, but tactical — noted as a downside on Idea #1 |
