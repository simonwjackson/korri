---
date: 2026-05-25
topic: korri-nixos-module-boundary
artifact: brief
---

# Korri NixOS Module Boundary

## Chosen Thing

A single public NixOS namespace, `services.korri`, with four product-level
sub-trees: `compositor`, `input`, `server`, and `client` (plus the
already-shared `cli`). The current top-level peer modules
(`kiosk`, `inputd`, `gameStream`, `headlessSource`, `server.streamHost`)
collapse into this shape, separating the **graphical substrate** (Sway/Wayland
session) from the **local Korri GUI surface**, the **input substrate**, and the
**server capabilities** (control plane + optional streaming). Host consumers
express what they want at the product level; lower-level wiring
(InputPlumber, uinput/uhid permissions, Sunshine app registration, game-stream
runner) is owned by Korri.

## Users and Context

Two appliance shapes, plus general-purpose installs:

1. **Sobo/handheld kiosk** — Korri-managed Sway session with the local
   Korri GUI as the default surface, native input bridge wired in, server
   running, streaming enabled so the device can also host games.
2. **aka/headless gaming box** — Korri-managed Sway session with **no** local
   GUI, server running, streaming enabled, host-side controller normalization
   via InputPlumber so Sunshine-streamed games receive stable input.
3. **General desktop install** — just the `korri-desktop` package available on
   an existing user session (no Korri-managed compositor, no server).

The boundary problem motivating this change: `mountainous/hosts/aka` writes a
shell script, a Sway config fragment, a `systemd.tmpfiles` entry, and starts
Sunshine from Sway startup — all of which is "graphical session substrate"
that the existing `services.korri.kiosk` module already owns but does not
expose without also forcing a local GUI. The result is drift between host
config and Korri.

## Goals

- One public top-level namespace: `services.korri`.
- Separate the **compositor** substrate from the **local kiosk surface** so
  headless hosts (aka) can reuse Korri's Sway lifecycle without enabling a
  local GUI.
- Make **input** an orthogonal concern. Sunshine-streamed input
  (InputPlumber + uinput + udev) and the local Korri UI's native input
  bridge (korri-inputd) are different things and must not be conflated.
- Express the host-side input requirements for streaming as Korri-owned
  defaults so hosts like aka stop accumulating host-local input tweaks.
- Default Sunshine to **Xbox 360 over /dev/uinput** (InputPlumber-normalized),
  not the upstream DS5/uhid default. This is the only currently-validated
  path on aka.
- Auto-enable downstream dependencies via `mkDefault` where one option
  implies another (kiosk → client, kiosk → inputd); use **assertions**, not
  silent enable, for cross-tree preconditions (kiosk → compositor,
  streaming → compositor, streaming → input.provider).
- Delete `services.korri.headlessSource` (already deprecated).
- Make the path from `mountainous/hosts/aka` to Korri-managed defaults
  mechanical: most aka-local Sway/Sunshine boilerplate disappears.

## Non-Goals

- Backwards-compatible aliases. **Clean break in one PR**: no forwarders,
  no deprecation period. In-tree callers, eval-test fixtures, and aka are
  updated in lockstep.
- Owning the upstream Sunshine NixOS service. Korri configures Sunshine's
  application list and gamepad backend; it does not replace
  `services.sunshine.*`.
- A general "compositor adapter" framework. Sway is the substrate today;
  the option lives at `services.korri.compositor.package` so a future swap
  is mechanical, but no second compositor is wired in this change.
- Multiple input providers. `services.korri.input.provider.name` accepts
  `"inputplumber"` today; other names are an assertion target for later.
- Rewriting `gameStream`/`inputd` runtime code. This is a module-boundary
  refactor; the wrappers, scripts, and TypeScript runners stay where they
  are. Only their NixOS option surface moves.
- Sobo Gamescope/runtime work currently in flight on this branch. That
  work stays separate.

## Constraints

- One public top-level namespace: `services.korri`.
- Implementation modules (`korri-cli.nix`, `korri-inputd.nix`,
  `korri-game-stream.nix`, and a new `korri-compositor.nix`) are imported
  internally by the product-level modules. They are not the public API but
  remain accessible for the rare consumer that needs to disable an
  auto-enabled piece.
- `services.korri.client.package` must remain platform-overridable (e.g.
  ROCKNIX sm8550 swaps it for `korri-desktop-device`).
- `services.korri.compositor.package` swaps Sway implementations without
  renaming the option.
- `compositor.kiosk` must read `services.korri.client.package` (not
  duplicate the choice) so platforms keep one place to declare the desktop
  package.
- The clean-break migration touches three caller groups in one PR:
  - in-tree images (`nix/images/kiosk.nix`, `headless.nix`,
    `platforms/{x86,rocknix-sm8550}.nix`, `live-usb-runtime.nix`)
  - eval-test fixtures (`tools/testing/nix/korri-{kiosk,server}-module-eval`)
  - out-of-tree `mountainous/hosts/aka`
- Existing runtime behavior is preserved bit-for-bit on Sobo and live-USB
  kiosk hosts. The eval fixtures must show the same effective values for
  generated service units, environment, and udev rules before and after
  the rename.
- aka must boot with zero host-local Sway config, zero host-local Sunshine
  app registration, and zero host-local input udev rules after the change
  — only `services.korri = { ... }` declarations and existing
  `mountainous.features` toggles.
- `nixosModules` flake exports are kept stable in name where possible
  (`korri-kiosk`, `korri-server`, `korri`); only the **options** they
  declare change. New module files get new export names
  (`korri-compositor`, `korri-input`).

## Success Criteria

- aka boots a Korri-managed Sway session, runs Sunshine with the Korri
  Stream app, normalizes streamed controller input to Xbox 360 over
  `/dev/uinput`, and streams a known-working game to a Moonlight client —
  all from a config that declares only:
  ```nix
  services.korri = {
    compositor.enable = true;
    input.provider = { enable = true; name = "inputplumber"; };
    server.enable = true;
    server.streaming.enable = true;
  };
  ```
- Sobo's effective configuration (units, environment, udev rules, Sway
  config, Sunshine apps) is unchanged before/after the refactor, as
  measured by the existing module-eval fixture snapshots.
- `services.korri.headlessSource` no longer exists; in-tree headless image
  uses `services.korri.server` directly.
- `services.korri.compositor.kiosk.enable = false` (the aka shape) does
  **not** start `korri-inputd`. The streaming path does not require it.
- `services.korri.compositor.kiosk.enable = true` (the Sobo shape) auto-
  enables `services.korri.input.inputd.enable` and
  `services.korri.client.enable` via `mkDefault`.
- `just typecheck`, `just test-unit`, `just lint`, `just format`, the
  module-eval test suites, and the live-USB config-check test all pass.
- A general desktop install (just `services.korri.client.enable = true`)
  installs `korri-desktop` and nothing else, with no errors and no
  `compositor`/`input`/`server` units.

## Candidate Shapes

### Shape A — flatter top-level peers (REJECTED)

`services.korri.{client, kiosk, session, streamHost, inputd, gameStream,
server, headlessSource}` — keep adding peer top-level options. Rejected
during shaping: too many top-level concepts, no clear taxonomy, no obvious
relationship between session substrate and the surfaces that consume it,
and "streaming" is a server capability not a peer role.

### Shape B — role enum (REJECTED)

`services.korri.role = "kiosk" | "stream-host" | "client"` plus shared
sub-trees. Rejected during shaping: closed enum is an anti-pattern;
real deployments mix capabilities (Sobo is both kiosk and stream-host); a
mode switch hides composition rather than expressing it.

### Shape C — `services.korri.session` (NEAR-MISS)

Same shape as the chosen one, but with `session` instead of `compositor`.
Rejected because `session` is heavily overloaded in NixOS
(systemd-logind session, D-Bus session) and doesn't convey "this owns the
graphical substrate." Reviewer hesitation about the name was the explicit
trigger for picking `compositor`.

### Shape D — `services.korri.{compositor, input, server, client}` (CHOSEN)

Four product-level sub-trees. `compositor` owns Sway/Wayland substrate.
`compositor.kiosk` is the optional local Korri GUI surface. `input` owns
both the normalized-input provider (InputPlumber + uinput/uhid + udev) and
the local UI semantic bridge (korri-inputd) as separate sub-options.
`server` is the control plane; `server.streaming` is the optional
Sunshine + game-stream capability. `client` stays as the standalone "just
install the Korri desktop package" path.

## Chosen Shape

**Shape D.** Sketch:

```nix
services.korri = {
  client = {
    enable = false;              # opt-in for standalone desktop installs
    package = pkgs.korri-desktop; # platform-overridable
  };

  cli = {
    enable = false;              # auto-enabled by compositor.kiosk and server
    package = pkgs.korri-cli;
  };

  compositor = {
    enable = false;
    package = pkgs.sway;         # swap-friendly
    # owns: user, home, runtimeDir, XDG envs, D-Bus mode, sway config,
    #       systemd ordering. Does NOT own input.
    kiosk = {
      enable = false;
      # mkDefault services.korri.client.enable = true
      # mkDefault services.korri.input.inputd.enable = true
      # assert services.korri.compositor.enable = true
      # reads services.korri.client.package to build the launcher
    };
  };

  input = {
    provider = {
      enable = false;
      name = "inputplumber";     # currently the only supported provider
      # when enable && name == "inputplumber":
      #   - enable services.inputplumber
      #   - load uinput kernel module
      #   - apply udev rules for /dev/uinput
      #   - order downstream consumers after the provider service
      # uhid is NOT loaded; Xbox/uinput is the default streaming backend.
    };
    inputd = {
      enable = false;            # korri-inputd; auto-enabled by compositor.kiosk
      package = pkgs.korri-inputd;
      # owns: WebSocket bridge daemon for local UI semantic actions
    };
  };

  server = {
    enable = false;
    # (existing server options: host, port, library, advertise, ...)
    streaming = {
      enable = false;
      # assert services.korri.compositor.enable = true
      # assert services.korri.input.provider.enable = true
      # writes Sunshine application registration for the game-stream runner
      # writes Sunshine config: gamepad backend = "xbox" (uinput)
      # does NOT touch services.korri.input.inputd
    };
  };
};
```

### Composition rules (encoded as mkDefault + assertions)

```text
compositor.kiosk.enable
  ⇒ assert compositor.enable = true
  ⇒ mkDefault client.enable = true
  ⇒ mkDefault input.inputd.enable = true

server.streaming.enable
  ⇒ assert compositor.enable = true
  ⇒ assert input.provider.enable = true
  ⇒ writes Sunshine app entry + Sunshine gamepad config
  ⇒ does NOT touch input.inputd

server.enable
  ⇒ mkDefault cli.enable = true

compositor.kiosk.enable
  ⇒ mkDefault cli.enable = true
```

### Mapping example — Sobo handheld

```nix
services.korri = {
  compositor = {
    enable = true;
    kiosk.enable = true;
  };
  input.provider = { enable = true; name = "inputplumber"; };
  server = {
    enable = true;
    streaming.enable = true;
  };
};
```

### Mapping example — aka headless

```nix
services.korri = {
  compositor.enable = true;           # kiosk left disabled
  input.provider = { enable = true; name = "inputplumber"; };
  server = {
    enable = true;
    streaming.enable = true;
  };
};
```

The only practical difference between the two is
`compositor.kiosk.enable`. Server, streaming, compositor, and provider are
identical.

## Key Decisions

### Top-level shape

- **One public namespace: `services.korri`.** Four product-level sub-trees:
  `client`, `compositor`, `input`, `server`. Plus the shared `cli`.
- **`session` was rejected as a sub-tree name.** Replaced with `compositor`,
  which names the abstract role (Sway today, swap-friendly tomorrow) and
  avoids collision with systemd-logind/D-Bus "session" terminology.
- **`role` enums were rejected.** Deployments express what they want via
  composition, not via a mode switch.

### Compositor / kiosk split

- **The graphical substrate is `services.korri.compositor`.** It owns
  Sway lifecycle, the kiosk user/home/runtimeDir, XDG envs
  (`XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `SWAYSOCK`), D-Bus session bus
  mode (`private` vs `existing`), Sway config generation, and systemd
  ordering. It does not assume a local GUI surface exists.
- **`services.korri.compositor.kiosk` is the local Korri GUI surface.**
  It auto-enables the client package and the native input bridge via
  `mkDefault`. It asserts the compositor is enabled. It writes the
  `exec` lines in the generated Sway config that launch the desktop
  binary as the default surface.
- **Sway-config fragments** still come from platform modules via
  `compositor.sway.extraConfig` (same shape as today's
  `kiosk.sway.extraConfig`).

### Input is orthogonal

- **`services.korri.input` is a peer sub-tree, not part of `compositor`.**
  Input belongs to neither the compositor nor the kiosk; both consume it.
- **`services.korri.input.provider`** is the shared normalized-input
  substrate. When `name = "inputplumber"`, the module enables
  `services.inputplumber`, loads `uinput`, applies udev rules, and orders
  consumers after the provider. **uhid is NOT loaded by default.**
- **`services.korri.input.inputd`** is the local UI semantic bridge
  (`korri-inputd`). It maps local evdev events into Korri UI actions
  via WebSocket. It is auto-enabled by `compositor.kiosk` only. It is
  **not** implied by `server.streaming` — streaming uses
  Sunshine's own virtual input plus the normalized provider, not the
  Korri UI bridge.

### Server / streaming

- **`server.streamHost` renames to `server.streaming`.** The current
  option set under `streamHost` (intentPath, statusPath, appName,
  runtimeDir, ...) moves under `streaming` with the same shapes.
- **`server.streaming.enable`** asserts both
  `compositor.enable` and `input.provider.enable`. It does not silently
  enable them — the host expresses intent explicitly.
- **Sunshine gamepad backend defaults to Xbox/uinput.** The module
  writes a Sunshine config fragment selecting the xbox backend so that
  InputPlumber-normalized controllers are the supported path. DS5/uhid is
  not the default and not currently wired by Korri.

### Client and CLI

- **`services.korri.client` stays.** Standalone "install korri-desktop"
  is a real use case; it must not require enabling the compositor.
- **`services.korri.client.package` is the only place** the desktop
  package is declared. `compositor.kiosk` reads it; platforms override it.
- **`services.korri.cli`** stays as today, auto-enabled by both
  `compositor.kiosk` and `server` via `mkDefault`.

### Removals

- **`services.korri.headlessSource` is deleted.** The existing
  `services.korri.server` warning about port collision becomes a hard
  removal. The in-tree `nix/images/headless.nix` already uses
  `services.korri.server`.
- **`services.korri.gameStream` becomes an internal implementation
  module.** Its option surface is consumed only by `server.streaming`,
  not by host configs directly. The file moves under a clearer name (or
  stays where it is and is just no longer imported by users).

### Migration

- **Clean break in one PR.** No alias forwarders, no deprecation
  warnings, no phased rollout. The in-tree images, eval fixtures, and
  aka are updated together.
- **No `kiosk.*` → `compositor.*` rewrite tool.** The surface is small
  enough to hand-update.

## Open Questions

- Should the new module files live under `nix/modules/` as
  `korri-compositor.nix` and `korri-input.nix`, with the old
  `korri-kiosk.nix` and `korri-inputd.nix` files deleted, or should the
  old files be repurposed in place? Default assumption: new files,
  delete old ones, update `flake.nix` `nixosModules` exports.
- Exact `flake.nix` `nixosModules` export names. Default assumption:
  add `korri-compositor` and `korri-input`; keep `korri-kiosk` as an
  alias that imports `korri-compositor` plus `korri-input`; keep
  `korri-server` and aggregate `korri` as today.
- Exact set of `services.inputplumber.*` options needed in current
  nixpkgs (the handoff flagged this). Implementation must inspect the
  upstream module before wiring. If `services.inputplumber` is missing
  or insufficient, fall back to a hand-rolled
  `systemd.services.inputplumber` with the upstream binary; document
  the gap so it can be replaced when nixpkgs catches up.
- Sunshine config writing strategy for the gamepad backend. Two paths:
  (a) merge into `services.sunshine.settings` via lib.recursiveUpdate;
  (b) require host configs to set the field explicitly with a Korri-
  documented value. Default assumption: (a), so aka inherits the
  Korri-supported default automatically.
- Whether `services.korri.compositor.sway.*` stays as a sub-namespace
  (matching today's `kiosk.sway.*`) or is renamed for compositor-
  agnosticism (e.g. `compositor.config`). Default assumption: keep
  `compositor.sway.*` for now; rename only when a second compositor
  appears.
- Eval-fixture rename strategy:
  `korri-kiosk-module-eval` → `korri-compositor-module-eval`,
  `korri-server-module-eval` → unchanged. Default assumption: rename
  to match new option paths so the test names track the public API.

## Next Step

- Run `/se-plan` using this brief as the primary input to produce an
  atomic-commit plan with U-IDs.
- Suggested sequencing for the plan to consider (not prescriptive):
  1. New eval-fixture scaffolding for `compositor`, `input.provider`,
     `input.inputd`, and `server.streaming` (red tests as the spec).
  2. New module files: `korri-compositor.nix`, `korri-input.nix`.
  3. Rewire `korri-server.nix`: rename `streamHost` → `streaming`;
     assert `compositor.enable` and `input.provider.enable`; write
     Sunshine gamepad backend config.
  4. Delete `korri-kiosk.nix`, `korri-inputd.nix`, `korri-headless-
     source.nix`. Update `flake.nix` `nixosModules` exports.
  5. Update in-tree callers (`nix/images/kiosk.nix`, `headless.nix`,
     `platforms/{x86,rocknix-sm8550}.nix`, `live-usb-runtime.nix`).
  6. Update eval-fixture call sites to the new option paths; confirm
     effective-config snapshots match the pre-refactor Sobo and live-
     USB baselines.
  7. Update `mountainous/hosts/aka` (out-of-tree) — delete
     `korriSwayStartup`, the Sway config fragment, the host-local
     `systemd.tmpfiles` entry, and the inline Sunshine app
     registration. Express everything via `services.korri.*` only.
  8. Verify aka actually boots and streams with Sobo as the Moonlight
     client; close the loop on the original runtime bug
     (Sunshine + InputPlumber + Xbox/uinput on aka).
