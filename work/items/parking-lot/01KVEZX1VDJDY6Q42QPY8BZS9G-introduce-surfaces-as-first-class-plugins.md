---
id: 01KVEZX1VDJDY6Q42QPY8BZS9G
slug: introduce-surfaces-as-first-class-plugins
title: Introduce surfaces as first-class plugins
origin: parked
status: To Do
priority: medium
labels:
  - architecture
  - surfaces
  - plugins
  - ui
  - korrid
  - electrobun
created: 2026-06-19
source: user
context:
  cwd: .
  branch: trunk
  commit: 9a710abe49d4f7dd1a5dcfcd7b33353ba8933cf8
  repo: simonwjackson/korri
  invoked_by: user
---

# Introduce surfaces as first-class plugins

## Why it matters

Korri is outgrowing the term "theme": Shift, Evier, Vigie, CLI, future phone remotes, and Charm-style TUI/SSH interfaces are all human-facing ways to present Korri capabilities. Treating them as first-class surfaces gives the project one vocabulary for web, CLI, TUI, SSH, native, kiosk, phone, and operator interfaces while preserving the core boundary: backend plugins provide capabilities; surfaces present capabilities; KORRID owns the contract between them.

## Acceptance Criteria

- [ ] Define canonical terminology and boundaries for Surface, Web surface/theme, CLI surface, TUI/SSH surface, backend plugin, and surface host.
- [ ] Add a typed SurfaceManifest / registry shape that supports runtime kinds such as web, cli, tui, ssh-tui, and native without forcing every surface into one folder layout.
- [ ] Reframe existing web themes (Shift, Evier, Vigie, eventually Pico) as web surfaces while keeping them autonomous and limited to platform/control contracts.
- [ ] Reframe product/apps/cli as the @korri:cli surface without adding an unnecessary product/surfaces/cli/korri abstraction unless multiple CLI/TUI surfaces justify it.
- [ ] Clarify KORRID versus Electrobun ownership: KORRID discovers/serves/advertises/authorizes LAN surfaces; Electrobun remains a thin local WebKit/input surface host.
- [ ] Describe how a Charm Bubble Tea or Wish SSH UI would register as a surface and consume KorriControl/Effect RPC without becoming a backend plugin.
- [ ] Add capability declarations for surfaces, especially around mutating actions such as library.launch, session.stop, and stream-control.write.
- [ ] Identify and preserve current integration points: product/platform/control, product/platform/theme/bridge, product/apps/cli, product/apps/portal/themes, product/apps/desktop, and KORRID static/RPC serving.
- [ ] Include security considerations for LAN-accessible surfaces: Host-header validation, avoiding permissive production CORS, and optional pairing/token auth for mutating remote controls.
- [ ] Verify the final design against the repo conventions and with at least typecheck/lint or equivalent plan validation before implementation lands.

## Related

- `product/apps/cli/korri-cli.ts`
- `product/apps/cli/control-renderers.ts`
- `product/platform/control/korri-control.ts`
- `product/platform/control/korri-control-live.ts`
- `product/platform/theme/bridge.ts`
- `product/apps/portal/themes/ThemeHost.tsx`
- `product/apps/portal/themes/theme-registry.ts`
- `product/apps/desktop`
- `product/services/device/korrid.ts`
- `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`
- `docs/research/plugin-architecture/synthesis-2026-05-31.md`

## Notes

## Full briefing

### Direction

The desired direction is to stop treating the current web UI layer only as "themes" and instead introduce **surfaces** as the canonical top-level concept.

A **surface** is a human-facing interface for Korri capabilities. It may be web, terminal, SSH, native, kiosk, phone, operator cockpit, or another runtime. "Theme" becomes a narrower subtype or styling/layout concept within web surfaces rather than the architecture itself.

Core rule:

> Backend plugins provide capabilities. Surfaces present capabilities. KORRID owns the contract between them.

### Vocabulary

- **Surface**: any human-facing interface over Korri capabilities.
- **Web surface**: DOM/React/Vite/WebKit/browser surface. Existing Shift, Evier, Vigie, and future Pico fit here.
- **Theme**: visual identity/layout package for a web surface; avoid using it as the universal architecture term.
- **CLI surface**: command-line interface; current `product/apps/cli` is already this.
- **TUI surface**: terminal UI, e.g. Charm Bubble Tea.
- **SSH surface**: server-side terminal UI exposed over SSH, e.g. Charm Wish.
- **Native surface**: future non-web native UI, framebuffer/SDL/GTK/etc.
- **Surface host**: runtime wrapper that runs or serves surfaces, e.g. Electrobun for local WebKit, KORRID for LAN web UI, SSH daemon/Wish for SSH TUI.
- **Backend plugin**: contributes catalog, launchers, runtimes, resources, stream-control, acquisition, or other capabilities; it should not own UI rendering.

### Important modeling correction

Do **not** force every surface into a new `product/surfaces/...` tree prematurely.

For the CLI, the abstraction `product/apps/cli` as separate host plus `product/surfaces/cli/korri` did not land. The cleaner model is:

```text
product/apps/cli
  = the CLI surface
```

The CLI executable is the surface. It can declare itself with a surface manifest, but it does not need to be moved or split until there are multiple CLI/TUI surfaces or the current folder becomes crowded.

For web, more separation may be needed because the same web surface can be hosted by Electrobun, KORRID, an ordinary browser, or a phone browser. For CLI, runtime + executable + interface are one unit.

### Current CLI fit

The current CLI already largely follows the surface model:

```text
product/apps/cli/
  korri-cli.ts
  control-renderers.ts
  game-picker.ts
  stream-launch.ts
  remote-stream-launch.ts
  source-aware-play.ts
  ...
```

Its stable capability contract is already `KorriControlService`:

```text
product/platform/control/
  korri-control.ts
  korri-control-live.ts
  control-requests.ts
  control-results.ts
```

`KorriControlService` exposes:

- `listGames`
- `findGame`
- `dryRunLaunch`
- `launchGame`
- `sessionStatus`
- `stopSession`
- `daemonStatus`
- `streamRuntimeSettingsStatus`

That means the CLI should be considered a surface that consumes `product/platform/control`, not a domain owner.

Possible minimal manifest:

```ts
export const korriCliSurface = {
  id: "@korri:cli",
  kind: "surface",
  runtime: "cli",
  name: "Korri CLI",
  targets: ["terminal", "developer", "operator"],
  capabilities: [
    "catalog.read",
    "library.launch",
    "session.read",
    "session.stop",
    "stream-control.read",
  ],
} as const
```

Possible folder shape without premature relocation:

```text
product/apps/
  cli/          # surface: @korri:cli
  portal/       # web surface host / web composition root
  desktop/      # Electrobun host for local web surfaces

product/themes/ or future product/surfaces/web/
  shift/        # web surface
  evier/        # web surface/control panel
  vigie/        # web surface/developer cockpit

product/platform/
  control/      # shared capability contract consumed by all surfaces
  surface/      # manifest/types/registry vocabulary
```

A future rename from `product/themes` to `product/surfaces/web` may be appropriate, but should not be required for the first slice.

### Non-web UI support

Charm-style UIs can still be expressed as surfaces/plugins, but they should not mount through `KorriPlatformBridge` because that bridge is web/DOM-shaped.

Instead, they should consume lower-level stable contracts:

```text
KORRID
  owns: catalog, launch, session, stream-control, status

UI surface plugin
  consumes: KorriControlService / Effect RPC schemas
  renders: web / terminal / ssh / native
```

Example Charm variants:

```text
korri-tui
  runtime: Go binary
  UI: Bubble Tea / Lip Gloss
  transport: HTTP RPC to KORRID

korri-ssh-control
  runtime: Wish SSH server
  UI: Bubble Tea over SSH
  transport: local KORRID RPC/control API
```

These should present capabilities and call existing contracts. They should not contribute backend launchers/session logic directly.

### Surface manifest direction

A general manifest might support entrypoints by runtime:

```ts
type SurfaceManifest = {
  readonly id: `@${string}:${string}`
  readonly kind: "surface"
  readonly name: string
  readonly version: string
  readonly runtime: "web" | "cli" | "tui" | "ssh-tui" | "native"
  readonly targets: readonly (
    | "tv"
    | "phone"
    | "desktop"
    | "terminal"
    | "operator"
    | "developer"
  )[]
  readonly capabilities: readonly (
    | "catalog.read"
    | "library.launch"
    | "session.read"
    | "session.stop"
    | "stream-control.read"
    | "stream-control.write"
    | "input.subscribe"
  )[]
  readonly entrypoint:
    | { readonly runtime: "web"; readonly assetPath: string }
    | { readonly runtime: "cli"; readonly command: string }
    | { readonly runtime: "tui"; readonly command: string }
    | { readonly runtime: "ssh-tui"; readonly command: string; readonly port?: number }
    | { readonly runtime: "native"; readonly command: string }
}
```

Do not overfit this shape before reading the existing plugin manifest/registry and Nix package patterns.

### KORRID / Electrobun boundary

Prior research strongly recommended:

- **KORRID** should be the LAN-facing origin for web/phone/control-panel surfaces.
- **Electrobun** should stay thin and local-only: WebKit, window lifecycle, input bridge/preload, maybe local loopback static/proxy.
- A separate LAN UI service is not justified unless KORRID static serving creates measurable operational problems.

Desired shape:

```text
Phone / browser on LAN
  → http://korri-device:3001/remote or /surface/<id>
  → same-origin /api/rpc
  → KORRID

Electrobun on device
  → local WebKit window
  → http://127.0.0.1:<local-port>/
  → local input bridge / preload
  → proxies or talks to KORRID
```

### Security considerations

Remote/LAN surfaces change the threat model. Before exposing remote launch/control in a product-facing way, design should address:

- Host-header validation to reduce DNS rebinding risk.
- Avoid permissive production CORS; prefer same-origin KORRID-served UI.
- Pairing token or local shared secret for mutating actions if the LAN is not fully trusted.
- Capability declarations that distinguish read-only surfaces from mutating surfaces.
- Never expose Electrobun debug endpoints like `/__korri/desktop/*` through KORRID.

### Prior-art signals from research

Useful analogies:

- Pegasus Frontend: host provides data model; themes render.
- Batocera web server: embedded game OS serving mobile remote launch UI.
- Moonraker/Mainsail/Fluidd: stable daemon/API with multiple independent frontends.
- Plex Companion: discovery, capabilities, subscribed state updates, command IDs.
- Tauri: thin native wrapper plus explicit capabilities.
- Charm/Bubble Tea/Wish: non-web interactive surfaces that can still consume the same service contracts.

Avoid overlearning from:

- VS Code extension host as a security model; useful manifest idea but not sandboxed.
- Kodi addons, because rendering/backend/system behavior are too mixed.
- RetroArch overlays, because they are framebuffer-specific rather than capability-surface architecture.

### Likely first implementation slice

1. Add `product/platform/surface` with schema/types for first-party surface metadata.
2. Add a `surface.ts` manifest to `product/apps/cli` declaring `@korri:cli`.
3. Add manifests for existing web themes/surfaces without moving folders.
4. Teach KORRID or an internal registry to list first-party surfaces.
5. Keep all existing runtime behavior unchanged.
6. Only after the vocabulary proves useful, consider KORRID static serving for web/phone surfaces and Charm/Wish TUI surfaces.

### Non-goals for first slice

- Do not move `product/apps/cli` into a new `product/surfaces/cli/korri` folder.
- Do not make UI surfaces backend plugins that contribute launchers or RPC handlers.
- Do not introduce third-party/user-installed surface loading yet.
- Do not expose LAN mutating controls without an explicit security decision.
- Do not rename `product/themes` immediately unless the implementation slice specifically owns that migration.
