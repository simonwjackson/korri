# theme-workshop

Dev-only design tooling that renders real product surfaces without the live app
runtime. Never bundled with `product/apps/*`. The canonical tool is the dev-lab
(`just dev-lab`); see `lab/AGENTS.md` for its mechanisms.

## First principle: the tool is the app unwrapped, never a simulation

The tool is the product app **unwrapped**; production is the same app **wrapped**.
The mechanisms are byte-identical end to end — the same components, the same
composition, the same wiring, the same way every piece reads and reacts to state.
What you build and see in the tool must be a true picture of what ships, because
nothing about how it runs is different.

**The one and only thing allowed to differ is the data, swapped at the last-mile
edge.** Plugging in fixture data instead of a live backend/database is the
blessed seam (a remote source may be an option later). Everything else is the
real app.

Rules that follow from this:

- **Swap the data, never the mechanism.** A tool control must drive the *real*
  state the live app already reads, through the *real* wiring — by changing the
  data fed in at the edge. It must never be a switch bolted onto a component, and
  never a path that production does not also use.
- **A "dial" is just edge data.** Turning a state dial = changing the data at the
  edge and letting the real app react through its real wiring. It is not a
  tool-only side channel.
- **The test of correctness:** if a piece can be changed in the tool but the
  mechanism doing the changing is not present in production, it is wrong. If the
  app hard-codes a value today, then giving that value a real edge to be fed from
  is real-app work that ships unchanged — not tool work.
- **Known debt this principle is driving out:** any remaining `preview ?? live`
  preview-singleton seam is a tool-only path — production carries a branch only
  the tool ever exercises. It is a transitional mechanism, not the destination.
  The target is a single real edge that updates live (no reload), fed by
  production from the live source and by the tool from chosen data, with no
  second machinery. Shift now follows the real-edge pattern; do not reintroduce
  preview branches there.

## Two object types: live devices and placed parts

The lab workspace is organized around two object types that keep screen and
physical-device concerns cleanly separated:

- **Placed part object** — one logical window or atomic design part. A page fills
  exactly one screen and never spans across screens. Pages are device-agnostic;
  cross-screen relationships are never a page concern.
- **Live device object** — physical hardware that tiles 1..n screens. A device is
  where bezels, millimetre sizing, and cross-screen wiring (e.g. Thor's
  primary↔companion handoff) live.

Both object types sit in one workspace canvas. Users select a workspace object,
or pick a named inner product part inside it, and the Inspector routes from that
selection. There is no user-facing Device/Compose canvas mode.

Live device objects reuse the same real page renderer and mounted-surface path as
production. Placed part objects reuse discovered product part/story seams and
adapter-owned real edge data. There is one product mechanism, not two.

### The one-renderer rule

The lab **always renders the real page** — the same component production renders,
driven through real edges. There is **no static re-implementation** of a page in
the tool. A re-implemented page is a second mechanism at the render layer, which
is the first-principle violation surfacing as render code instead of data.

Consequences:

- A page's state machines (Shift Home's Data, Foreground, Launch) are **the
  page's own state**, driven by swapping data at the real edge. Live device
  objects share live dials/screen inputs for now; placed part object inputs stay
  object-local. These are scoped views of the same real state-driving capability,
  not duplicated logic.
- Adding a new state machine to a page requires **no** second display
  implementation in the lab: it appears in every frame by virtue of the shared
  renderer. (This is why the real renderer is unified *before* Launch migrates.)
- Render and capture are separate: a render-only host (many Compose objects at
  once) renders the real page but does **not** publish to the capture seam; only
  a single running surface (Device/Preview) owns and publishes the coordinate.
