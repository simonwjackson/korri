# Handoff: Korri-owned NixOS module for ROCKNIX guest consumption

## User intent

The user wants Korri (`/home/simonwjackson/code/sandbox/korri`) to own the NixOS module for the Korri frontend. The ROCKNIX guest repo (`/home/simonwjackson/code/sandbox/rocknix-nix-guest`) should consume that module and supply guest/device-specific variables. ROCKNIX should not own Korri packaging/module logic.

## Current conversation summary

The initial ask was: “give me a list of things that need to happen to add a module to `../rocknix-nix-guest/`; the module should be the frontend here: `../korri/`.”

After repo inspection and two scout subagents, the boundary was corrected by the user:

- **Korri owns:** frontend package, launch wrapper, NixOS module, Korri-specific environment/config contract.
- **ROCKNIX owns:** importing the Korri module, setting guest/device vars, Sway launch/autostart policy, rootfs inclusion.

Do not proceed with a ROCKNIX-owned `modules/korri.nix` unless the user changes direction.

## Existing research artifacts

Do not duplicate the scout details; read these if needed:

- Korri frontend/package scout: `korri-frontend-scout.md`
- ROCKNIX guest/module scout: `../rocknix-nix-guest/rocknix-nix-guest-scout.md`

## Key technical facts

From Korri:

- Existing Nix outputs already include a Linux/aarch64 desktop package path:
  - `packages.${system}.korri-portal`
  - `packages.${system}.korri-desktop`
  - `packages.${system}.korri-desktop-odin`
- `korri-desktop-odin` packages the Vite portal into Electrobun and defaults `KORRI_DESKTOP_PROFILE=odin`.
- The Odin portal currently bakes `VITE_KORRI_NATIVE_BRIDGE_URL = "ws://127.0.0.1:3002"` at build time.
- Relevant Korri files:
  - `flake.nix`
  - `nix/korri-portal.nix`
  - `nix/korri-desktop.nix`
  - `nix/electrobun-binaries.nix`
  - `nix/versions.nix`
  - `korri/deploy/desktop/main.ts`
  - `korri/deploy/portal/main.tsx`

From ROCKNIX guest:

- Main-space profile is in `../rocknix-nix-guest/profiles/main-space.nix`.
- Sway launch/session policy lives there and should remain ROCKNIX-owned.
- Current validated guest env includes `/storage`, `/run/user/0`, root session D-Bus, PipeWire Pulse socket, and Home-chord Sway bindings.
- Relevant ROCKNIX files:
  - `../rocknix-nix-guest/flake.nix`
  - `../rocknix-nix-guest/profiles/main-space.nix`
  - `../rocknix-nix-guest/scripts/static-checks.sh`
  - `../rocknix-nix-guest/README.md`

## Recommended next implementation shape

In Korri:

1. Add a Korri-owned NixOS module export from `flake.nix`, e.g.:
   - `nixosModules.default`
   - `nixosModules.korri-frontend`
2. Add a module file, likely under `nix/nixos-module.nix` or `nix/modules/korri-frontend.nix`.
3. Define a module API such as:
   - `services.korri.enable`
   - `services.korri.package`
   - `services.korri.home`
   - `services.korri.xdgRuntimeDir`
   - `services.korri.desktopProfile`
   - `services.korri.statusFile`
   - `services.korri.nativeBridgeUrl` if build/runtime config allows it
   - `services.korri.extraEnvironment`
   - `services.korri.launcherName`
4. Have the module install a wrapper/launcher that sets guest runtime env and execs the configured Korri package binary.
5. Add a Nix check that evaluates the module enabled in a minimal NixOS config, if practical.

In ROCKNIX guest later:

1. Add Korri as a flake input, initially maybe `path:../korri` for local iteration, later pinned Git URL/rev.
2. Import `inputs.korri.nixosModules.korri-frontend`.
3. Set `services.korri` vars for the guest environment.
4. Wire the Sway launch surface in ROCKNIX, likely first via Home-chord rather than autostart.
5. Extend ROCKNIX static checks/docs.

## Open design question

`nativeBridgeUrl` is currently build-time for the portal. If ROCKNIX must supply this as a variable, Korri needs either:

- runtime config support, e.g. served JSON or env injected by the desktop server, or
- module/package options that choose/build a package variant with the requested URL.

This is the most important boundary question before implementing a clean module API.

## Suggested skills for next session

- Use `se-plan` if the next session should turn this into a formal implementation plan.
- Use `se-work` if the user wants to implement directly.
- Use `se-debug` if Nix eval/build or Electrobun runtime packaging fails.
- Use `se-code-review` after changes are made, especially because this crosses flake/module/package boundaries.
