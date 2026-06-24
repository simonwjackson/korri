---
title: "feat: URL-addressable multi-device Shift lab"
type: feat
status: completed
date: 2026-06-24
verify_command: "just typecheck && just test-unit"
---

# feat: URL-addressable multi-device Shift lab

## Summary

Build a URL-addressable lab where each visible device frame mounts the **real Shift surface** via `mountShift` at its calibrated physical size, so you click through the actual application — not jump between fixture pages — across several devices at once. Device set (`all` / one / several), theme, and the surface route all live in the URL; every visible frame always shows the **same** screen; and every transition (select devices, switch theme, navigate) is a client-side history update with **no page reload** and **no remount** of surviving frames.

---

## Problem Frame

The current `tools/theme-workshop` device-lab renders **fixture screens** (`Screen.render()` chosen from the Gallery) into physically-sized `DeviceFrame`s. That model "mounts pages and jumps between them" — it cannot represent the real application being navigated. Meanwhile `tools/seed-proof` proves the real surface mounts and clicks through via `mountShift` over an in-memory ProseQL seed, but only as a single full-window instance with no device sizing and no device/theme selection. The user wants the two ideas joined: the real, navigable Shift app shown simultaneously at multiple real device sizes, with device-set/theme/route selection that is shareable via URL and never reloads the page.

---

## Requirements

- R1. Each visible device frame renders the **real Shift surface via `mountShift`** at its calibrated physical size; clicking through behaves like the real app, not like switching fixture pages.
- R2. Device-set selection is URL-addressable — `all`, exactly one, or several devices — and changing it updates the visible frame set with no page reload.
- R3. Theme selection is URL-addressable via a surface-adapter registry keyed by theme id; switching themes is a no-reload route change.
- R4. The surface route (current app screen) is URL-addressable and **mirrored across all visible frames** — every frame always shows the same screen; there is never a state with two different screens.
- R5. No transition (device set, theme, surface route) triggers a full page reload; all are client-side history updates.
- R6. Navigating inside any one frame updates the canonical surface route and re-projects it to all frames **without remounting surviving frames** and **without a navigation loop**.
- R7. On-page lab chrome shows and controls the device set, the theme, and the current surface route, and exposes a shareable link.

---

## Scope Boundaries

- Real-application click-through is **Shift only** — Shift is the one theme that exposes a `mountShift` surface adapter today.
- Not changing `mountShift`, the shared Shift route tree, or the in-memory ProseQL seam built previously — the lab consumes them as a host.
- Not touching the portal or Electrobun hosts; this is the design-tool lab surface only.
- Route sync is the contract: only the **surface route** is mirrored. Transient per-frame surface state (focus, launch lifecycle) is per-frame by construction and is not synchronized.

### Deferred to Follow-Up Work

- **Pico / fixture-screen catalog + Parts (atomic stories) conversion**: the existing fixture `theme-workshop` path (`ThemeWorkshop`, `Gallery`, `Parts`, `view-store`) is left intact and untouched; converging or retiring it is separate work.
- **Independent (un-synced) per-frame routes** for side-by-side state comparison: explicitly out this iteration (the "never two different screens" invariant is what removes the active-frame complexity).
- **Device add / remove / resize / calibration editing inside the new lab**: the new lab consumes a device roster read-only; live editing stays in the legacy `Calibrator`.
- **Sharing one atom registry across frames** (so launch/focus could sync): start with one registry per frame; revisit only if a shared-state need appears.
- **Persisting last device-set/theme/route** beyond the URL itself.

---

## Context & Research

### Relevant Code and Patterns

- `product/surfaces/web/shift/mount-shift.tsx` — `mountShift(host, { data, navigation: { history }, input, beforeRouter })` → `{ router, dispose }`. Imperative `createRoot(host).render(<RegistryProvider><ShiftSurfaceApp/></RegistryProvider>)`. The lab is a new caller.
- `product/surfaces/web/shift/routes/route-tree.tsx` — `createShiftRouter({ history })` over the shared `/`, `/game/$id` tree. The inner per-frame router.
- `product/platform/surface/host/SurfaceHost.tsx` — the canonical imperative-mount-into-a-ref pattern (`useEffect` + `hostRef` + `dispose` cleanup + `host.replaceChildren()`); `LabSurfaceMount` mirrors its shape.
- `tools/seed-proof/seed.ts` + `tools/seed-proof/seed-proseql.ts` — `makeSeedInitialValues()` builds the in-memory ProseQL `LibrarySource` + catalog/launcher atom layers. The lab reuses this seed (lifted to a shared module to avoid tool-to-tool coupling).
- `tools/theme-workshop/device-lab/DeviceFrame.tsx` — physical-size frame: `widthMm`/`heightMm` × `pxPerMm`, `container-type: size` screen, fit-to-viewport scale-down. Reused as the physical wrapper around each real surface mount.
- `tools/theme-workshop/device-lab/DeviceLab.tsx` — existing roster persistence (`loadLab`/`saveLab`) and the existing **single**-select `focusId` (null = ALL, or one id). The new lab generalizes this to a URL-driven multi-select set.
- `tools/theme-workshop/device-lab/types.ts` — `DeviceConfig` (id, name, widthMm, heightMm, textPct, padPct, bezel).
- `product/surfaces/web/shift/config.tsx` — `shiftConfig.devices`, the Shift device roster the lab seeds from.
- `tools/seed-proof/{vite.config.mjs,index.html,main.tsx}` — the standalone tools-app boot pattern (code-based router, aliases, `just dev-seed-proof`) the lab entry mirrors.
- `@tanstack/history` — `createBrowserHistory` (outer lab router) and `createMemoryHistory({ initialEntries })` (inner per-frame routers).

### Institutional Learnings

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — anchors "render the real surface, not a fixture stand-in."
- `.pi/git/github.com/simonwjackson/pi-lattice-stack/skills/react/SKILL.md` — Root owns state / context-driven compounds / no boolean-prop forests; the lab Root reads the router and provides a lab context, frames are atoms.

### External References

- `@tanstack/react-router` history types: `createBrowserHistory` / `createHashHistory` / `createMemoryHistory` are the swappable navigation adapters; `RouterHistory.subscribe` exposes location changes for the mirroring lift.

---

## Key Technical Decisions

- **Two cooperating client-side routers.** An **outer** browser-history lab router owns `/lab/$devices/$themeId/*surfacePath`. Each frame runs an **inner** memory-history Shift router. Both update via history APIs — no transition ever hits the server (R5).
- **One canonical surface path; frames are projections.** Because frames may never diverge (R4), there is a single canonical `surfacePath`; each frame is driven from it rather than being an independent app. This deletes the "active frame / follow" complexity entirely.
- **Surface-adapter registry keyed by theme id.** `themeId → { devices, makeSeedInitialValues, mountSurface }`. Shift registers the only adapter now; the theme axis (R3) stays open without forcing pico/fixture conversion.
- **Reuse the device-lab physical frame.** The lab is the existing `DeviceFrame` physical sizing with a **real `mountShift` surface** inside instead of a fixture `screen.render()`.
- **Device set encoded as a path segment.** `$devices` is `all` or a comma-joined id list (`rg353m,odin2`). Human-readable, copy-pasteable, one route pattern. Empty selection snaps back to `all` (never an empty stage).
- **`mountShift` stays the seam.** The lab is a new host adapter composing N independent mounts; no change to surface or seam code.
- **Lift the Shift in-memory seed to a shared tools module.** Both `seed-proof` and the lab import it, so the lab does not depend on `seed-proof` internals.

---

## Open Questions

### Resolved During Planning

- Real surface vs fixture screens? → **Real surface via `mountShift`** (user: "represent the actual application at various sizes simultaneously").
- Synced vs independent frame routes? → **Synced**; never two different screens (user).
- Reload allowed on selection/navigation? → **Never**; all client-side history (user).
- Device-set URL encoding? → **Comma-joined ids with an `all` keyword** in the path segment.
- Which themes get a real surface now? → **Shift only**, via the adapter registry.

### Deferred to Implementation

- Exact loop-guard mechanism for the canonical-path mirroring (diff-on-location vs origin-tagging) — settle against `RouterHistory.subscribe` behavior at code time.
- One atom registry per frame vs one shared across frames — start **per frame** (simplest, correct for route sync); revisit only if shared transient state is needed.
- Whether to repoint `just dev-theme-workshop` or add a new `just dev-lab` recipe — decide when wiring the entry; the legacy fixture workshop must remain runnable either way.
- How the read-only device roster is sourced (adapter `devices` vs persisted `loadLab` blob) and whether selection persists beyond the URL.

---

## Output Structure

    tools/theme-workshop/lab/
      main.tsx                      # standalone entry: boot the lab router
      index.html
      vite.config.mjs               # mirrors seed-proof aliases + tailwind
      lab-route-state.ts            # pure parse/serialize of $devices/$themeId/surfacePath
      lab-route-state.test.ts
      lab-router.tsx                # code-based TanStack router + navigate helpers
      surface-registry.ts          # themeId -> surface adapter
      adapters/
        shift.ts                    # Shift adapter: devices + seed + mountShift
      seed/                         # (or shared) lifted Shift in-memory seed
      LabRoot.tsx                   # composition root: reads router, provides lab context
      Lab.context.tsx               # lab context + guarded hook
      LabSurfaceMount.tsx           # React<->mountShift seam (mount/drive/dispose)
      LabSurfaceMount.test.tsx
      components/
        LabStage.tsx                # renders N DeviceFrame -> LabSurfaceMount
        LabDevicePicker.tsx         # multi-select chips (All / one / several)
        LabThemePicker.tsx          # theme dropdown
        LabRouteBar.tsx             # current route pill + copy-link

    tools/library/ (or tools/theme-workshop/lab/seed/)   # shared Shift seed, imported by seed-proof + lab

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
URL  /lab/rg353m,odin2/shift/game/hollow-knight
         |          |     |
         devices    theme surfacePath (splat)
         |          |     |
   ┌─────▼──────────▼─────▼───────────────────────────────────┐
   │ LabRoot (outer browser-history router)                    │
   │  reads route state -> { devices[], adapter, surfacePath } │
   │  provides Lab context + navigate helpers (pushState only) │
   └─────┬───────────────────────────────────┬────────────────┘
         │ one canonical surfacePath          │
   ┌─────▼─────────┐                    ┌─────▼─────────┐
   │ DeviceFrame   │  rg353m            │ DeviceFrame   │  odin2
   │  LabSurfaceMnt│                    │  LabSurfaceMnt│
   │   mountShift( │                    │   mountShift( │
   │    memory hist│                    │    memory hist│
   │    @surfacePat│                    │    @surfacePat│
   │   )           │                    │   )           │
   └─────┬─────────┘                    └─────┬─────────┘
         │ inner nav (click a game)            │
         └──────────► onNavigate ──────────────┘
                          │
              LabRoot updates URL surfacePath (pushState)
                          │
              re-projects canonical path to every frame
              (diff-guarded: only push frames whose path differs)
```

Two invariants make this tractable: **(1) no reload** — every arrow is a history API call; **(2) one canonical route** — frames are projections, so there is no per-frame route to reconcile, only one path pushed to all.

---

## Implementation Units

### U1. Shared Shift seed + surface-adapter registry

**Goal:** Give the lab a theme-keyed adapter (`devices`, `makeSeedInitialValues`, `mountSurface`) and a Shift adapter, reusing the in-memory ProseQL seed without depending on `seed-proof` internals.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Create: `tools/theme-workshop/lab/surface-registry.ts`
- Create: `tools/theme-workshop/lab/adapters/shift.ts`
- Create (or move): shared Shift seed module imported by both `seed-proof` and the lab (e.g. `tools/theme-workshop/lab/seed/shift-seed.ts` or a neutral `tools/library/shift-seed.ts`)
- Modify: `tools/seed-proof/seed.ts` (import the lifted seed instead of owning it)
- Test: `tools/theme-workshop/lab/adapters/shift.test.ts`

**Approach:**
- Define `LabSurfaceAdapter = { id, devices, makeSeedInitialValues, mountSurface }` where `mountSurface(host, { initialValues, history }) -> { dispose, router }` wraps `mountShift`.
- Shift adapter pulls its device roster from `product/surfaces/web/shift/config.tsx` (`shiftConfig.devices`) and its seed from the lifted module.
- `surface-registry.ts` maps `themeId -> adapter` and resolves with a clear error for unknown ids.

**Patterns to follow:** `tools/seed-proof/seed.ts` (atom initial-values shape), `product/surfaces/web/shift/mount-shift.tsx`.

**Test scenarios:**
- Happy path — registry resolves `"shift"` to an adapter exposing a non-empty `devices` roster and a `makeSeedInitialValues` that yields catalog/library/launcher layer atoms.
- Error path — resolving an unknown theme id surfaces a clear error rather than `undefined`.
- Integration — `seed-proof` still builds its initial values after the seed module is lifted (its existing seed test stays green).

**Verification:** Adapter test green; `bun test tools/seed-proof/seed-proseql.test.ts` still green; no import from `tools/seed-proof/*` inside `tools/theme-workshop/lab/*`.

---

### U2. `LabSurfaceMount` — the React↔mountShift seam

**Goal:** A component that mounts one real Shift surface into a DOM node, drives it to a controlled `surfacePath` without remounting, reports internal navigations upward, and disposes cleanly.

**Requirements:** R1, R4, R6

**Dependencies:** U1

**Files:**
- Create: `tools/theme-workshop/lab/LabSurfaceMount.tsx`
- Test: `tools/theme-workshop/lab/LabSurfaceMount.test.tsx`

**Approach:**
- `useEffect` + `hostRef`: on mount, build a memory history at the initial `surfacePath`, call `adapter.mountSurface(node, { initialValues, history })`, and subscribe to the returned router/history for location changes → `onNavigate(path)`.
- On `surfacePath` **prop** change: push the new path into the existing frame router **only if it differs** from the frame's current location (diff-guard) — never remount.
- On unmount: `dispose()` and clear the node (mirror `SurfaceHost` cleanup).
- Loop-guard: distinguish lab-initiated pushes from user-initiated inner navigations so an inner-nav → `onNavigate` → URL update → prop change → push does not ping-pong.

**Execution note:** Start test-first against the mount/drive/dispose contract (no-remount and loop-guard are the load-bearing behaviors).

**Technical design:** *(directional)* one mount per node; `surfacePath` is a controlled input projected via `router` history pushes, not via React reconciliation of the surface tree.

**Patterns to follow:** `product/platform/surface/host/SurfaceHost.tsx` (ref + effect + dispose), `product/surfaces/web/shift/mount-shift.tsx`.

**Test scenarios:**
- Happy path — mounting at `/game/hollow-knight` renders that detail screen inside the node.
- Edge — changing the `surfacePath` prop pushes the new path and does **not** call `dispose`/remount (assert the surface root is not torn down; mount side-effect runs once).
- Integration — a simulated inner navigation fires `onNavigate` exactly once with the new path (not echoed back into a loop when the lab then re-projects the same path).
- Edge — unmount calls `dispose` and clears the host node.

**Verification:** Component test green; mounting/driving/disposing works under `@testing-library/react` + happy-dom; no remount on path change.

---

### U3. Lab route state + outer router

**Goal:** A code-based browser-history router for `/lab/$devices/$themeId/*surfacePath` with pure parse/serialize and no-reload navigate helpers.

**Requirements:** R2, R3, R4, R5

**Dependencies:** None (parallel with U1/U2)

**Files:**
- Create: `tools/theme-workshop/lab/lab-route-state.ts`
- Create: `tools/theme-workshop/lab/lab-router.tsx`
- Test: `tools/theme-workshop/lab/lab-route-state.test.ts`

**Approach:**
- Pure helpers: parse `$devices` (`all` → sentinel, else split on comma → id list), `$themeId`, and the splat into a `surfacePath` (default `/`); serialize back symmetrically.
- `lab-router.tsx`: code-based TanStack router (browser history, like `seed-proof/main.tsx`), exposing `setDevices`, `setTheme`, `setSurfacePath` helpers that `navigate` (pushState) — never reload.
- Normalization: empty device list serializes as `all`; unknown/duplicate ids are dropped.

**Patterns to follow:** `tools/seed-proof/main.tsx` (code-based router), `@tanstack/history` splat handling.

**Test scenarios:**
- Happy path — `all` parses to the all-sentinel; `rg353m,odin2` parses to `["rg353m","odin2"]`; round-trips back to the same string.
- Edge — empty/whitespace device segment normalizes to `all`; duplicate ids collapse; unknown ids are dropped.
- Happy path — a multi-segment surface path (`game/hollow-knight`) round-trips through the splat without loss.
- Edge — missing splat defaults `surfacePath` to `/`.

**Verification:** Route-state test green; helpers are pure (no router/DOM dependency); typecheck clean.

---

### U4. Lab composition root + canonical-path mirroring

**Goal:** The composition root that reads the router, resolves the adapter + device set, renders N physical frames each mounting the real surface at the canonical path, and lifts any frame's navigation to the URL — synced, no reload, no survivor remount, no loop.

**Requirements:** R1, R2, R4, R5, R6

**Dependencies:** U1, U2, U3

**Files:**
- Create: `tools/theme-workshop/lab/LabRoot.tsx`
- Create: `tools/theme-workshop/lab/Lab.context.tsx`
- Create: `tools/theme-workshop/lab/components/LabStage.tsx`
- Test: `tools/theme-workshop/lab/LabRoot.test.tsx`

**Approach:**
- `LabRoot` reads route state (U3), resolves the adapter (U1), and provides a lab context (`devices`, `themeId`, `surfacePath`, `setDevices`/`setTheme`/`setSurfacePath`). Per the React skill, the Root is the only stateful seam; frames are context-reading atoms.
- `LabStage` maps the selected devices to `DeviceFrame`s, each wrapping a `LabSurfaceMount` keyed by **device id** (so add/remove mounts/unmounts only the changed frame; survivors are never remounted).
- Mirroring: a frame's `onNavigate` calls `setSurfacePath` (pushState); the canonical path re-projects to all frames via the controlled `surfacePath` prop, diff-guarded so only out-of-date frames are pushed and the originating frame does not loop.
- `all` resolves to the adapter's full roster; an empty set is coerced to `all` before render.

**Technical design:** *(directional)* see High-Level Technical Design — one canonical path in, N projections out; the only writer of the URL surface path is `onNavigate`/the route bar.

**Patterns to follow:** `.pi/git/.../skills/react/SKILL.md` (Root owns state, context atoms), `tools/theme-workshop/device-lab/DeviceLab.tsx` (frame mapping + `DeviceFrame` usage).

**Test scenarios:**
- Happy path — with `devices=rg353m,odin2` and `surfacePath=/`, both frames render the Shift home.
- Integration — navigating inside one frame updates the URL `surfacePath` and both frames move to the new screen (mirrored); never a divergent state.
- Edge — removing one device from the set unmounts only that frame; the other frame is **not** remounted (assert its mount side-effect/dispose count is unchanged).
- Edge — deselecting the last device coerces the set to `all` and renders the full roster (no empty stage).
- Integration — a mirrored re-projection does not cause an infinite navigation loop (bounded number of history pushes per user navigation).

**Verification:** `LabRoot` test green; survivor frames are stable across device-set edits; route stays mirrored; no reload (history-only) and no loop.

---

### U5. Lab chrome — device picker, theme picker, route bar

**Goal:** On-page controls outside the surface to select the device set, switch theme, and see/copy the current route.

**Requirements:** R2, R3, R7

**Dependencies:** U3, U4

**Files:**
- Create: `tools/theme-workshop/lab/components/LabDevicePicker.tsx`
- Create: `tools/theme-workshop/lab/components/LabThemePicker.tsx`
- Create: `tools/theme-workshop/lab/components/LabRouteBar.tsx`
- Test: `tools/theme-workshop/lab/components/LabDevicePicker.test.tsx`

**Approach:**
- `LabDevicePicker`: an **All** chip plus one chip per roster device; multi-select writes `$devices` via `setDevices`. Clicking an individual device while in `all` drops to just that one; toggling several builds the comma list; deselecting to empty snaps back to `all`. No boolean-prop branching — selection state is derived from context (react skill).
- `LabThemePicker`: lists registry theme ids; selecting calls `setTheme` (no reload). With a single registered theme it can render inert/hidden.
- `LabRouteBar`: shows `surfacePath`, plus a copy-link affordance for the full lab URL.

**Patterns to follow:** existing `lab-focus` tab cluster in `tools/theme-workshop/device-lab/DeviceLab.tsx` (chip pattern), `tools/theme-workshop/WorkshopControls.tsx` (neutral control chrome).

**Test scenarios:**
- Happy path — clicking **All** sets `$devices=all`; clicking two device chips yields `$devices=rg353m,odin2` in order.
- Edge — from a single selected device, clicking it off coerces back to `all` (never empty).
- Happy path — selecting a theme calls `setTheme` with the chosen id (history push, no reload).
- Happy path — the route bar reflects the current `surfacePath` and copy-link yields the full lab URL.

**Verification:** Device-picker test green; pickers drive route state only (no local source-of-truth divergence from the URL).

---

### U6. Lab entry, Vite config, and dev recipe

**Goal:** A standalone entry that boots the lab router app, plus Vite config and a `just` recipe, leaving the legacy fixture workshop runnable.

**Requirements:** R5, R7

**Dependencies:** U4, U5

**Files:**
- Create: `tools/theme-workshop/lab/main.tsx`
- Create: `tools/theme-workshop/lab/index.html`
- Create: `tools/theme-workshop/lab/vite.config.mjs`
- Modify: `justfile` (add a lab dev recipe; keep `dev-theme-workshop`)

**Approach:**
- `main.tsx` mirrors `tools/seed-proof/main.tsx`: import fonts + theme styles + device-lab CSS, mount `RouterProvider` for the lab router into `#root`.
- `vite.config.mjs` mirrors `tools/seed-proof/vite.config.mjs` (aliases, tailwind, host).
- Add a recipe (e.g. `dev-lab`) running this Vite root on its own port; do not break `dev-theme-workshop`.

**Approach risk:** Default URL with no path must redirect/normalize to a valid `/lab/all/shift/` so a bare visit renders something.

**Test scenarios:** Test expectation: none — wiring/config only; verified by build + browser smoke (load `/lab/all/shift/`, click a tile across two devices, confirm both mirror and the URL updates with no reload).

**Verification:** `bunx vite build --config tools/theme-workshop/lab/vite.config.mjs` succeeds; browser smoke shows real multi-device click-through, mirrored routes, shareable URL, and no full reload on any transition.

---

## System-Wide Impact

- **Interaction graph:** New host adapter composing N `mountShift` instances; the only writer of the canonical surface path is a frame's `onNavigate` or the route bar. No change to `mountShift`, the Shift route tree, or the ProseQL seam.
- **Error propagation:** Unknown theme id (registry) and unknown surface route (`/game/$id` not in seed) must render a clear empty/not-found state, not throw — the not-found path already exists in the Shift detail route.
- **State lifecycle risks:** Per-frame mount/dispose must be leak-free across device-set edits (dispose every removed frame); the mirroring lift must be loop-guarded; survivors must never remount (keyed by device id).
- **API surface parity:** All three real hosts (portal, Electrobun, this lab) now mount through `mountShift`; the lab must not fork surface behavior — it only supplies the adapter triple + a sized container.
- **Integration coverage:** The multi-frame mirror + no-remount + no-loop behavior is the integration proof that unit tests of pure route-state cannot give (covered in U4).
- **Unchanged invariants:** `mountShift`, the shared route tree, the in-memory ProseQL seam, and the legacy fixture `theme-workshop` path are unchanged; shipped bundles remain ProseQL-free (the lab is design-tool-only under `tools/`).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Mirroring causes a navigation loop (inner nav → URL → re-project → inner nav) | Diff-guard projection + loop-guard distinguishing lab-initiated pushes from user navigations; U2/U4 test for bounded pushes per navigation |
| Device-set edits remount surviving frames (flicker / lost transient state) | Key frames by device id; only the added/removed frame mounts/unmounts; explicit no-remount test in U4 |
| N per-frame atom registries multiply seed cost | Seed is small in-memory ProseQL; acceptable now; shared registry deferred |
| Lifting the seed breaks `seed-proof` | Keep the public seed shape; re-run seed-proof's seed test as an integration check in U1 |
| Only Shift has a surface adapter, so theme axis looks empty | Registry + `LabThemePicker` render inert with one theme; pico stays on the untouched fixture path (deferred) |
| Bare `/lab` visit has no devices/theme/path | Normalize/redirect to `/lab/all/shift/` on entry (U6) |

---

## Documentation / Operational Notes

- Update `tools/theme-workshop/device-lab/AGENTS.md` only if the lab changes the device-lab contract it documents; otherwise leave the legacy doc as-is.
- The new recipe should be discoverable in `just --list`; mention it in the final summary rather than adding narrative docs.

---

## Sources & References

- Related code: `product/surfaces/web/shift/mount-shift.tsx`, `product/surfaces/web/shift/routes/route-tree.tsx`, `product/platform/surface/host/SurfaceHost.tsx`, `tools/seed-proof/{seed.ts,seed-proseql.ts,main.tsx,vite.config.mjs}`, `tools/theme-workshop/device-lab/{DeviceFrame.tsx,DeviceLab.tsx,types.ts}`, `product/surfaces/web/shift/config.tsx`
- Related prior work: `work/items/active/01KVX1MRZVR38J3Z5T0WAEZ6EB-seeded-clickthrough-host-ports/plan.md` (mountShift + in-memory ProseQL seam this builds on)
- External: `@tanstack/react-router` / `@tanstack/history` history adapters and splat routes
