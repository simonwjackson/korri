# Code Context

## Files Retrieved
1. `flake.nix` (lines 31-36, 52-74, 103-132, 144-180, 184-196) - declares aarch64 support, runtime libraries, portal variants, desktop outputs, and app launch entries.
2. `nix/korri-portal.nix` (lines 1-63) - hermetic Vite portal derivation that builds static frontend assets.
3. `nix/korri-desktop.nix` (lines 1-201) - Electrobun desktop derivation that packages the portal into Linux desktop launchers.
4. `nix/electrobun-binaries.nix` (lines 1-89) - fetches pinned upstream Electrobun CLI/core binaries by system/arch.
5. `nix/versions.nix` (lines 1-20) - pins Electrobun and Bun dependency hashes for `aarch64-linux`.
6. `nix/bun-deps.nix` (lines 1-65) - fixed-output Bun `node_modules` derivation reused by portal and desktop builds.
7. `vite.config.mjs` (lines 1-46) - Vite root/output/alias configuration for the portal build.
8. `electrobun.config.ts` (lines 1-31) - Electrobun app metadata, Bun entrypoint, and portal asset copy map.
9. `korri/deploy/portal/main.tsx` (lines 1-48) - frontend composition root; reads native bridge env and starts spatial navigation.
10. `korri/deploy/desktop/main.ts` (lines 1-124) - desktop runtime entrypoint; starts local Bun/Hono server and opens Electrobun BrowserWindow(s).
11. `korri/deploy/desktop/create-desktop-app.ts` (lines 1-24) - composes static portal serving with in-process API routes.
12. `korri/deploy/desktop/static-assets.ts` (lines 1-106) - static asset resolver, content types, SPA fallback, and path traversal guard.
13. `korri/deploy/desktop/window-options.ts` (lines 1-90) - desktop/Odin window profiles and dimensions.
14. `korri/products/app/api/hono-app.ts` (lines 1-64) - API app reused in desktop packaging for `/api/*`.
15. `justfile` (lines 31-50, 75-89, 91-99) - local build, desktop smoke/runtime checks, and Odin validation recipes.
16. `tools/desktop/desktop-smoke.ts` (lines 81-170) - validates built portal root, API health, and one asset through desktop HTTP composition.
17. `tools/desktop/electrobun-runtime-check.ts` (lines 51-67, 73-115, 161-209, 211-230) - checks local Electrobun native runtime and NixOS linker failure mode.
18. `scripts/odin/deploy.sh` (lines 1-79) - one-command device deploy path; installs `.#korri-desktop-odin` into `/storage/.nix-profile`.
19. `scripts/odin/desktop-preflight.sh` (lines 1-117) - read-only Odin readiness check for Nix/Electrobun runtime.
20. `scripts/odin/smoke-electrobun.sh` (lines 1-79) - Odin Electrobun launch smoke using status file and proof script.
21. `scripts/odin/run-sessiond.sh` (lines 1-40) - session supervisor launcher with Wayland/session env and default Electrobun app path.
22. `scripts/odin/install-sessiond-service.sh` (lines 1-102) - installs persistent sessiond service pointed at the Nix-managed Electrobun app.
23. `tools/odin/sessiond-electrobun.ts` (lines 29-85, 89-180) - sessiond Electrobun command/env construction and Nix-managed binary enforcement.
24. `tools/odin/sessiond.ts` (lines 248-263) - wires real sessiond renderer controller from `KORRI_ELECTROBUN_*` env.
25. `tools/odin/electrobun-proof-smoke.ts` (lines 81-110) - validates status URL, health, WebKit/Sway window, fallback flags, and GPU evidence.

## Key Code

Existing Nix outputs to reuse:

- `flake.nix` supports desktop systems `x86_64-linux` and `aarch64-linux` (lines 31-36).
- `packages.korri-portal` is the plain Vite static frontend output; `korriPortalOdin` is an internal portal variant with `nativeBridgeUrl = "ws://127.0.0.1:3002"` (lines 122-132).
- `packages.korri-desktop-odin` reuses `nix/korri-desktop.nix`, Electrobun binaries, and the Odin portal variant (lines 157-180).
- `apps.korri-desktop-odin.program` points to `${korriDesktopOdin}/bin/korri-desktop-odin` (lines 193-196).

Critical package flow:

```nix
# nix/korri-portal.nix lines 40-52
export VITE_KORRI_NATIVE_BRIDGE_URL=...
node node_modules/vite/bin/vite.js build --mode production
cp -R out/build/portal/. "$out/"
```

```nix
# nix/korri-desktop.nix lines 85-90, 129-133, 188-189
cp -R ${electrobunBinaries.core}/. node_modules/electrobun/dist-${platform.os}-${platform.arch}/
cp -R ${portal}/. out/build/portal/
bun build korri/deploy/desktop/index.ts --target bun --outdir "$app_bundle/Resources/app/bun"
write_wrapper "$out/bin/korri-desktop" x11 "" "${runtimeLibraryPath}"
write_wrapper "$out/bin/korri-desktop-odin" "" odin "${odinRuntimeLibraryPath}"
```

Pinned aarch64 inputs:

- `nix/electrobun-binaries.nix` maps `aarch64-linux` to Electrobun arch `arm64` (lines 9-17) and fetches `electrobun-cli-linux-arm64.tar.gz` / `electrobun-core-linux-arm64.tar.gz` (lines 19-23, 66-84).
- `nix/versions.nix` has `aarch64-linux` hashes for Electrobun CLI/core and Bun deps (lines 5-18).

Runtime launch shape:

- Electrobun wrapper sets `LD_LIBRARY_PATH`, `XDG_DATA_DIRS`, `GIO_EXTRA_MODULES`, optional `GDK_BACKEND`, optional `KORRI_DESKTOP_PROFILE`, then execs the packaged launcher (`nix/korri-desktop.nix` lines 167-183).
- Desktop runtime serves the app from a local ephemeral loopback server and opens BrowserWindow(s): `Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch })`, then `new BrowserWindow(options)` (`korri/deploy/desktop/main.ts` lines 63-85).
- The desktop Hono app routes `/api` and `/api/*` to the product `honoApp`; all other GETs serve static portal assets (`korri/deploy/desktop/create-desktop-app.ts` lines 10-23).
- Static asset serving uses the bundled `PATHS.VIEWS_FOLDER/mainview` asset root, validates paths stay inside root, serves direct assets, and falls back to `index.html` for extensionless SPA routes (`korri/deploy/desktop/static-assets.ts` lines 71-106).
- Odin profile uses `KORRI_DESKTOP_PROFILE=odin`, hidden title bar, 1920x1080 frame (`korri/deploy/desktop/window-options.ts` lines 36-57).
- Portal code reads `VITE_KORRI_NATIVE_BRIDGE_URL`; when present it subscribes to native inputd `gamepad` and `system` channels (`korri/deploy/portal/main.tsx` lines 28-44).

Runtime dependencies to preserve:

- General Linux desktop runtime libs from `flake.nix`: `gtk3`, `webkitgtk_4_1`, `libayatana-appindicator`, `librsvg`, `libsoup_3`, `glib`, `glibc`, `gdk-pixbuf`, `at-spi2-core`, `pango`, `cairo`, `gsettings-desktop-schemas`, `glib-networking`, and `stdenv.cc.cc.lib` (lines 52-69).
- Odin wrapper uses a smaller `odinRuntimeLibraryPath` with `nixpkgs-2405` `webkitgtk_4_1` and `gtk3` (flake lines 71-74; `nix/korri-desktop.nix` lines 28-29, 188-189), while wrapper still exports schema/network module paths from current `pkgs` (`nix/korri-desktop.nix` lines 174-176).
- Build-time native tools for desktop packaging: `bun`, `nodejs_20`, `patchelf`, `file`, `makeWrapper` (`nix/korri-desktop.nix` lines 37-43).
- Electrobun core asserts presence of `bun`, `bsdiff`, `bspatch`, `zig-zstd`, and `libNativeWrapper.so` (`nix/electrobun-binaries.nix` lines 76-85).
- Odin deployment/runtime also expects `/storage/bin/bun`, `/storage/.nix-profile/bin`, a Wayland/Sway environment, and a Nix-managed app binary (`scripts/odin/run-sessiond.sh` lines 25-40; `tools/odin/sessiond-electrobun.ts` lines 64-85, 119-125).

Validation commands already present:

- Local portal build: `just build-web` (`justfile` lines 34-36).
- Local desktop HTTP composition smoke: `just desktop-smoke` (`justfile` lines 48-50), which probes `/`, `/api/health`, and one static asset (`tools/desktop/desktop-smoke.ts` lines 81-154).
- Local Electrobun runtime probe: `just desktop-runtime-check` (`justfile` lines 44-46); detects NixOS dynamic linker failures and recommends Nix dev shell/nix-ld/patchelf path (`tools/desktop/electrobun-runtime-check.ts` lines 51-67, 161-209).
- Local Electrobun package path: `just desktop-build` (`justfile` lines 96-99), after `build-web` and runtime check.
- Nix package build/evaluation targets: `nix build .#packages.aarch64-linux.korri-portal` and `nix build .#packages.aarch64-linux.korri-desktop-odin` from a machine with an aarch64 builder/emulation, or on the Odin use `nix profile install --profile /storage/.nix-profile .#korri-desktop-odin` as `scripts/odin/deploy.sh` does (lines 36-56).
- Odin preflight: `just odin-desktop-preflight` (`justfile` lines 83-85), gathering architecture, Nix store/profile, app origin, Sway/ES state, and storage facts (`scripts/odin/desktop-preflight.sh` lines 91-108).
- Odin deployment: `just deploy-odin` (`justfile` lines 56-58), which syncs, installs `.#korri-desktop-odin`, refreshes services, starts Korri, and runs sessiond smoke (`scripts/odin/deploy.sh` lines 30-79).
- Odin Electrobun proof smoke: `just check-odin-electrobun` (`justfile` lines 87-89), launches the app, waits for the status file, then runs proof checks (`scripts/odin/smoke-electrobun.sh` lines 48-76; `tools/odin/electrobun-proof-smoke.ts` lines 81-110).
- Supervised renderer smoke/status: `just check-odin-sessiond` and `just odin-sessiond-status` (`justfile` lines 75-81).

## Architecture

The frontend packaging is already a two-layer Nix composition:

1. `bun-deps` is a fixed-output dependency layer from only `package.json` and `bun.lock`.
2. `korri-portal` builds the Vite React portal into static files. The Odin variant injects `VITE_KORRI_NATIVE_BRIDGE_URL=ws://127.0.0.1:3002` at build time.
3. `korri-desktop-odin` packages that portal into an Electrobun Linux app using pinned arm64 Electrobun CLI/core binaries, patches ELF interpreters/rpaths, copies the portal under `views/mainview`, and emits two wrappers. The Odin wrapper defaults `KORRI_DESKTOP_PROFILE=odin`.
4. At runtime, Electrobun runs `korri/deploy/desktop/index.ts` -> `main.ts`. That starts a loopback Bun/Hono server, serves static frontend assets and in-process API/RPC routes, opens an Electrobun BrowserWindow to the loopback URL, and optionally writes `KORRI_DESKTOP_STATUS_FILE` for smoke/readiness.
5. On Odin, `sessiond` is the durable launcher. Its systemd unit points to `/storage/.nix-profile/bin/korri-desktop-odin`, sanitizes env/PATH, requires the resolved app path to be Nix-managed, waits for the status file, and controls stop/relaunch.

## Start Here

Start with `flake.nix`, then `nix/korri-desktop.nix`. `flake.nix` explains the available aarch64 outputs and which portal/runtime variants are wired; `nix/korri-desktop.nix` contains the actual packaging, ELF patching, wrapper env, and install layout.

## Supervisor coordination

No blocker. Main risk is host architecture: `.#packages.aarch64-linux.korri-desktop-odin` needs an aarch64 builder/emulation unless built directly on the Odin. The existing deploy path builds/installs on-device via `nix profile install .#korri-desktop-odin`.
