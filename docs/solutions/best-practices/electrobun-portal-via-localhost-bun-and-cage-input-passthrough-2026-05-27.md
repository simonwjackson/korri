---
title: Electrobun loads the real portal via co-resident bun HTTP, and gamepad input arrives for free through cage libinput
module: nix/korri-desktop
date: 2026-05-27
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - "Shipping a real (non-hello-world) Electrobun bundle to an aarch64 handheld where bun is already running a Hono+RPC server in the same process tree"
  - "The webview needs to reach a same-origin RPC endpoint and the SPA uses relative URLs like `/api/rpc`"
  - "Reusing an x86-built Electrobun bundle for aarch64 by swapping binaries from the upstream `electrobun-core-linux-arm64.tar.gz`"
  - "Running under a cage Wayland compositor on a device that has physical gamepad buttons wired to `/dev/input/event*` via `gpio-keys` or evdev"
tags:
  - electrobun
  - bun-server
  - cage
  - libinput
  - gamepad
  - http-localhost
  - aarch64
  - handheld
related_components:
  - development_workflow
  - tooling
---

# Electrobun loads the real portal via co-resident bun HTTP, and gamepad input arrives for free through cage libinput

## Context

The cohesive-closure recipe in
[electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure](./electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md)
got an Electrobun **hello-world** rendering on the R36T MAX. That validated
the layer cake (cage on libmali → bwrap → glibc-2.39 ld-linux wrapper →
GTK3 + webkit2gtk-4.1 closure → Electrobun launcher/bun/libNativeWrapper).

Moving from "hello world" to "the actual KORRI portal" introduced two
fresh decisions and surfaced two fresh landmines. The decisions both
turned out to be good. The landmines both have one-line fixes once you
know to look. This is that note.

This learning also documents the unsolicited bonus: gamepad buttons on
the R36T MAX panel produced focus moves and click events inside the
webview **without any additional code on the KORRI side and without
configuring an input bridge**. Cage's libinput already routed them.

## Guidance

### 1. Point the webview at `http://localhost:<api-port>/` and serve the SPA from the same bun process that hosts the api

Electrobun's default template builds a `views/` directory with an
`index.html` and uses a custom `views://` scheme that the native wrapper
resolves out of the bundle. That works fine for "isolated" apps. It does
**not** play well with a SPA that hits a same-origin RPC endpoint via
relative URLs, because relative `/api/rpc` from a `views://` page
resolves to `views:///api/rpc` — not the bun server.

Instead, in `electrobun.config.ts` and `src/bun/index.ts`, point the
BrowserWindow at `http://localhost:8181/`:

```ts
// src/bun/index.ts
import { BrowserWindow } from "electrobun/bun";

const mainWindow = new BrowserWindow({
  title: "KORRI",
  url: "http://localhost:8181/",
  frame: { width: 680, height: 680, x: 0, y: 0 },
});

console.log("KORRI Electrobun app started!");
```

The bun process that bun-serves the same origin is the one already
hosting the api. A small `Bun.serve()` wrapper around the Hono `honoApp`
mounts the RPC at `/api/*` and serves the portal's `vite build`
output as static files with SPA fallback:

```ts
// out/tmp/portal-and-api.ts (bundled with `bun build --target=bun`)
import { honoApp } from "@app/api/server"; // Hono+RPC app
const portalDir = "./portal";

Bun.serve({
  port: 8181,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return honoApp.fetch(req);
    // static file with SPA fallback
    const candidate = `${portalDir}${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(candidate);
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(`${portalDir}/index.html`));
  },
});
```

The shared origin (`http://localhost:8181`) means:

- the portal's RPC client's `HttpClientRequest.prependUrl("/api/rpc")` just works
- no CORS preflights, no `Origin` header gymnastics
- the entire frontend ships as plain static assets, no view-scheme bundling
- the webview can hot-load any new portal build by reloading the URL

### 2. Bundle layout, but with three caveats the recipe omitted

The cross-arch swap procedure from the existing recipe still applies: build
the bundle on x86 with `bunx electrobun build`, then overwrite the
`bin/{launcher,bun,libNativeWrapper.so,libasar.so,bspatch,zig-zstd}`
binaries from the upstream aarch64 tarball.

After moving from hello-world to the real portal, three things bit us
that the prior recipe did not call out:

- **The `bin/bun` wrapper must spoof argv0 to its own bundle path, not a
  neighbor bundle's path.** Electrobun's `Resources/main.js` does
  `dirname(process.argv0)` to find Resources, libNativeWrapper.so, AND
  `Resources/app/bun/index.js`. If a wrapper from another bundle
  (`/storage/eb-hello-world-arm64/bin/bun`) is reused, the runtime
  silently loads the WRONG bundle's app code with no diagnostic — just
  the wrong banner string and no webview. Always regenerate the wrapper
  per-bundle so its `--argv0` and first `LD_LIBRARY_PATH` entry point at
  the bundle's own `bin/`.

- **`libNativeWrapper.so` from the upstream tarball is NOT
  patchelf-ready.** The tarball ships it with no RPATH set. The cohesive
  closure recipe requires patchelf'ing in three RPATH entries — glibc,
  gcc-13.2.0-lib (libstdc++), and the cohesive aggregator — or `dlopen`
  fails with `libstdc++.so.6: cannot open shared object file` even
  though that exact file is present elsewhere in the closure. Either
  re-run patchelf on the new copy or `cp` a previously-patched copy
  from another bundle. The pattern:

  ```sh
  patchelf --set-rpath \
    "<glibc>/lib:<gcc-13.2.0-lib>/lib:<cohesive-aggregator>/lib" \
    bundle/bin/libNativeWrapper.so
  ```

- **The bundle is the same `dev-linux-x64` tree with binaries swapped.**
  No need for a separate `dev-linux-arm64` electrobun build target;
  Electrobun's bundle metadata (Info.plist, Resources/main.js, app code)
  is arch-agnostic. Only `bin/*` and `bin/lib*.so` change.

### 3. Cage's libinput already routes gamepad events to GTK applications

The R36T MAX has its hat buttons wired through `gpio-keys` to
`/dev/input/event*`. Cage initializes libinput on every input device
under `seat0` and translates evdev events into Wayland pointer/keyboard
events for the focused surface. WebKit2GTK on the webview surface
receives those as standard GTK key/pointer events.

Concretely, pressing D-pad up/down/left/right on the device while the
portal was open moved focus around the SPA's focusable elements and
A/B/Start translated into Enter/Escape/Tab in the webview — without
adding gamepad code anywhere in KORRI, without an evdev→keymap shim,
and without configuring cage beyond `WLR_BACKENDS=drm` and `--seat`
defaults.

This means the **B4 (spatial nav) and I1 (gamepad) spikes are partially
validated by the K1 milestone itself**. The remaining B4 work is
verifying the SPA's focus ring works under the resulting keymap; no
device-level bridge is needed.

The reason it works: libinput's `LIBINPUT_DEVICE_GROUP` treats any evdev
device exposing key codes 0x130–0x13F (gamepad buttons) as a gamepad.
Cage subscribes to all libinput events on the seat without filtering.
GTK3's wayland backend converts the Wayland `wl_keyboard.key` events
into standard `GdkEventKey` deliveries. WebKit dispatches those as DOM
keyboard events. The path is "default everywhere".

The thing that could break this path on a different device:

- Kernel `gpio-keys` mapping the hats to keycodes outside 0x130–0x13F
  (some handhelds use `KEY_LEFT`/`KEY_RIGHT` directly — that still
  works, just as arrow keys not gamepad keys).
- libinput tagging the device with `tags=joystick` and excluding it
  from the seat — check `libinput list-devices` on a new device.
- Cage being launched with `--allow-vt-switch` and an explicit
  `--input` filter (do not do this).

### 4. Memory budget — empirical numbers

Measured on R36T MAX, 970 MB physical, panel 680×680, after the
portal has rendered the full federated game list:

| Process | RSS | Role |
|---|---:|---|
| `WebKitWebProcess` | 157 MB | KORRI portal renders here, grew from 128 → 157 MB as art loaded |
| `WebKitNetworkProcess` | 44 MB | RPC + asset fetches |
| `cage` compositor | 56 MB | Wayland on Mali-G31 |
| bun api+portal | 79 MB | Hono+RPC and static portal serve |
| Electrobun `launcher` | 140 KB | static parent process |
| **Total Electrobun+bun stack** | **~336 MB** | |

System totals: 310 MB used, 528 MB available, 580 MB cache. Comfortably
under the 970 MB wall with the api and renderer co-resident. The 157 MB
WebKitWebProcess number sets the budget ceiling for portal-side
features (textures, audio decoders, IndexedDB) — assume +50–100 MB
headroom remains.

## Why This Matters

The K1 milestone — real KORRI portal rendering on the device — was the
single biggest "is this real" gate for the R36T MAX track. Until the
portal rendered, every prior validation (libmali, cage, Bun on
aarch64, federation discovery) was a partial result. Crossing K1 turns
the platform from a series of demos into one continuous app.

The HTTP-localhost decision is the architectural lever. The existing
electrobun recipe correctly fixated on the per-frame closure mechanics.
This learning adds the orthogonal axis: **the application surface is a
plain HTTP origin served by the same bun that runs the api**. This
choice unlocks the rest of KORRI's web posture (relative RPC URLs,
SPA routing, dev/prod parity with `vite preview`) without inventing
device-specific scheme handlers. Get this wrong and every RPC call
becomes a CORS conversation.

The gamepad-for-free finding is the larger surprise. It means a future
NixOS-on-the-device track does not need to invent an input bridge, an
evdev daemon, or a JavaScript gamepad-API polyfill. The standard cage
+ GTK + webkit2gtk path is already the right answer. That collapses
several open spikes (I1, B4) into "test the SPA's focus order".

The two landmines (argv0 spoof per-bundle, libNativeWrapper patchelf
required) are not theoretical. Each silently produced the WRONG outcome
without crashing: argv0 spoofing the neighbor bundle loaded
hello-world's app code while the launcher correctly identified the
KORRI bundle's Resources; libNativeWrapper without patched RPATH failed
to find libstdc++ even though every closure path was on
LD_LIBRARY_PATH. The diagnostics named the wrong cause in each case.
Document them so the next bringup of a new bundle doesn't relive the
debugging.

## When to Apply

- Shipping any non-hello-world Electrobun bundle to an aarch64 handheld
- Composing an Electrobun renderer with a same-process Bun api so the
  whole app fits in one process tree and one origin
- Bringing up new handheld hardware where input is `gpio-keys`-backed
  (R36T MAX, R36S, Anbernic family) — expect the gamepad to just work
  through cage; check with `libinput list-devices` on day one if not
- Bundling a fresh Electrobun release; patchelf the
  `libNativeWrapper.so` and regenerate the bun wrapper as a checklist
  step, not an afterthought

## Examples

### Before — hello world in a `views://` scheme bundle

`src/bun/index.ts`:

```ts
const mainWindow = new BrowserWindow({
  title: "Hello Electrobun!",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 800, x: 200, y: 200 },
});
```

`electrobun.config.ts`:

```ts
build: {
  views: { mainview: { entrypoint: "src/mainview/index.ts" } },
  copy: { "src/mainview/index.html": "views/mainview/index.html" },
},
```

This loads from the bundle's `Resources/app/views/mainview/`. No bun
server is contacted. Relative `/api/rpc` from the page would resolve to
`views:///api/rpc` and 404.

### After — real KORRI portal served by the co-resident bun

`src/bun/index.ts`:

```ts
const mainWindow = new BrowserWindow({
  title: "KORRI",
  url: "http://localhost:8181/",
  frame: { width: 680, height: 680, x: 0, y: 0 },
});
```

`electrobun.config.ts` keeps a stub `views/mainview` to satisfy
electrobun's build pipeline but the portal is **not** served from
there. The portal is whatever the bun server returns at `/`. To swap
in a new portal build, replace the static directory the bun server
points at and reload the window. No bundle rebuild needed.

### Cage→child env handoff (unchanged from the prior recipe)

```sh
# in launch-electrobun.sh, after the cage compositor is up
exec "$CAGE_BIN" -D -- "$CLOSURE_BASH" -c "
  unset LD_LIBRARY_PATH
  export HOME=/storage
  export WAYLAND_DISPLAY=wayland-0
  export XDG_RUNTIME_DIR=/tmp/wayland
  export GDK_BACKEND=wayland
  exec /storage/eb-korri-arm64/bin/launcher
"
```

This is repeated here only so the gamepad-passthrough section makes
sense: there is no extra input flag on the cage line. The defaults
already did the work.

## Related

- [electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure](./electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md) — the closure + wrapper + bwrap recipe this builds on
- [korri-api-on-aarch64-handheld-via-bun-bundle](./korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md) — the bun-side bundling that lets api and portal share a process
- [wayland-userspace-on-mali-g31-handheld-via-newer-libmali](./wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md) — the cage + libmali path under everything
- [staged-layer-adoption-for-constrained-handheld-bringup](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md) — the B0→B7 staging that frames why K1+K2 land where they do
