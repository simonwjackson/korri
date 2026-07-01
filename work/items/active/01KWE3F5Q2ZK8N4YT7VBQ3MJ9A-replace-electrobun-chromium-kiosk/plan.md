---
title: "refactor: Replace Electrobun with a decoupled web-surface host + Chromium kiosk"
type: refactor
status: active
date: 2026-06-30
verify_command: "bun test product/services/device product/platform/input product/apps/desktop"
---

# refactor: Replace Electrobun with a decoupled web-surface host + Chromium kiosk

## Summary

Retire Electrobun entirely. Split its two conflated jobs — *serving the web UI* and *rendering it* — into (1) a standalone, network-bound **web-surface host** service that serves the front-ends and proxies `/api` to korrid, and (2) a **Chromium kiosk** renderer that is just a client pointing at that host's URL. korrid stays the surface-agnostic brain. The Electrobun `executeJavascript` input-injection workaround is deleted; the physical controller reaches the page through a page-side WebSocket to inputd (native keyboard and the browser Gamepad API keep working). Sequenced so the device keeps booting a working kiosk at every step: the Chromium renderer lands as a non-default variant, is flipped to default only after on-device parity, and Electrobun code/binaries are removed last.

---

## Problem Frame

Electrobun's Linux renderer is WebKitGTK in a forced **X11** window (`gdk_x11_*` hardcoded), which on SM8550 leaves the GPU idle at 220 MHz while `WebKitWebProcess` + Electrobun-main + Xwayland pin ~3 CPU cores through an X11 present blit, and — separately — renders the intrinsic-scale UI at the wrong size in any bare WebKit context. Live on-device validation this session proved Chromium (same Blink engine CEF uses) renders the UI **pixel-correct**, feels like the native desktop experience, runs a **native Wayland (`xdg_shell`)** surface, holds render-node fds, and drives the Adreno to **max 680 MHz** — on both Wayland and the X11/Xwayland path. The serving layer is also wrongly bundled inside the renderer, which blocks the "pull the UI up on my phone as a remote control" goal: if the UI is a network service, phone and kiosk are the same kind of client for free.

---

## Requirements

- R1. The on-device kiosk renders the Korri web UI via Chromium, matching Electrobun/desktop-browser fidelity and fluidity (validated: pixel-correct, native feel, GPU-accelerated).
- R2. UI serving is a standalone network service with **zero** knowledge of the renderer; the renderer is a thin, swappable client pointing at a URL.
- R3. korrid remains surface-agnostic (data/state/rpc/events); the web-surface host proxies `/api` to it. No korrid coupling to the web surface.
- R4. Keyboard and gamepad continue to funnel into the one unified semantic action bus (`@platform/browser/navigation` fed by `@platform/input` adapters). Components keep using `useInputAction(...)` unchanged.
- R5. The Electrobun `executeJavascript` input-injection path (`input-broker.ts` → `window.__korriInputDispatch`, the `__korriInput` preload) is removed; the device's physical controller reaches the page without renderer-native IPC.
- R6. The kiosk is **locked down** — no reachable full-browser affordances (new tab/window, address bar, devtools, context menu, exit-to-windowed). This is a hard requirement.
- R7. sessiond keeps owning the renderer lifecycle through the existing `KorriRendererController` interface and its status-file readiness contract; game-exit relaunch behavior is preserved.
- R8. The device boots a working kiosk at every step of the migration; Electrobun is removed only after Chromium is the validated default.
- R9. Electrobun is fully removed: code, npm dependency, Nix build (binaries/unwrapped/wrap/config), and package variants.
- R10. The renderer choice is the baseline for every Korri device that displays web UIs, not a Bandai one-off.

---

## Scope Boundaries

- Not building phone-as-remote end-to-end. The decoupling *enables* it; actually exposing the host on the LAN with discovery + auth is follow-up.
- Not changing the web app's UI, the Shift theme, korrid's rpc surface, or the input *core* (adapters/bus/gamepad mapper) beyond swapping one adapter source.
- Not adopting Electrobun-CEF. The decision is standalone Chromium; CEF-in-Electrobun was the fallback if a full replace were rejected.
- Not implementing additional surfaces (framebuffer, terminal). The architecture must not preclude them, but only the web surface is built here.
- Not changing InputPlumber/inputd normalization semantics; only how the page *receives* inputd's already-normalized actions.

### Deferred to Follow-Up Work

- **LAN exposure + discovery + auth for phone-as-remote:** bind the host beyond loopback, mDNS advertise, and a pairing/PIN gate (precedent: `/api/install-control/session` PIN cookie in `product/apps/portal/api/hono-app.ts`). Separate item — capture via `se-backlog`.
- **Native Gamepad API hardening** (Option A): rely on evdev exposure of the controller to Chromium as a *bonus* path; do not depend on it. Follow-up if we want to drop the inputd-ws hop for directly-attached pads.
- **Dual-screen / companion** parity under Chromium (`createDesktopDualScreenWindowOptions`, `KORRI_DESKTOP_DUAL_SCREEN`) — dev/lab feature, revisit after the single-window kiosk lands.

---

## Context & Research

### Relevant Code and Patterns

- **Renderer controller seam:** `product/services/device/sessiond-renderer.ts` (`KorriRendererController`: `kind`, `launch()`, `stop()`), implemented today by `product/services/device/sessiond-electrobun.ts` (`createElectrobunController`, `buildElectrobunCommand`, `waitForStatusFile`, `forbiddenElectrobunProductionEnv`). Swap the implementation, keep the interface.
- **Web-surface host seed:** `product/apps/desktop/headless-server.ts` (already written this session) serves the SPA + inlines runtime config + proxies `/api`, renderer-free. It composes `product/apps/desktop/create-desktop-app.ts` (`createDesktopApp` = static assets + `inlineRuntimeConfig` + `/api/*` → `createApiForwarder`) and `forwarder-upstream.ts` (loopback korrid `:3001`). These move out of `apps/desktop/`.
- **korrid / brain:** `product/services/device/korrid.ts` + `product/services/server/http/server.ts` run the shared `createHonoApp` (`product/apps/portal/api/hono-app.ts`) on `:3001` (rpc, `/api/game-assets`, `/api/config/events`, health). Unchanged.
- **Unified input:** `product/platform/input/{keyboard-adapter,gamepad-adapter,desktop-bridge-adapter}.ts` feed `product/platform/browser/navigation/` (focus engine + spatial nav); `product/platform/react/input/use-input-action.ts` is the component API; `product/apps/portal/spatial-navigation-config.ts` selects adapters from `runtime.desktopInput`. The `desktop-bridge-adapter` already takes an injectable `bridge` with `subscribeAction` — repoint its source.
- **inputd:** `product/services/device/inputd.ts` is a `Bun.serve` WebSocket server on `:3002` (`DEFAULT_PORT`) that clients subscribe to by device class and it `broadcast(...)`s normalized input — the page can be a direct subscriber.
- **Nix desktop build:** `product/apps/desktop/nix/{electrobun-binaries,unwrapped,wrap,versions}.nix`, `electrobun.config.ts`, and the desktop package variants in `product/apps/desktop/default.nix` (`host`/`device`/`deviceCurrent`/`x86Kiosk`).
- **NixOS integration:** `product/systems/nixos/images/kiosk.nix` (`kioskRendererEnvironment`, `GDK_BACKEND=x11`, `DISPLAY=:0`, `services.korri.client.package`), `product/systems/nixos/images/platforms/rocknix-sm8550.nix` (sessiond `DISPLAY`/`GDK_BACKEND`, client path), `product/services/device/nix/sessiond.nix`.
- **Chromium availability:** `chromium-149.x` already in the Bandai Nix store; validated live with `--ozone-platform=wayland --kiosk --no-sandbox --app`.

### Institutional Learnings

- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md` — the WebKitGTK path "rendered but felt less fluid than Chromium kiosk scrolling"; corroborates the fluidity delta.
- `docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md` — the cohesive-closure discipline that made Electrobun render at all; the Chromium package must likewise be a coherent closure (Chromium already is, via nixpkgs).
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` + work item `01KQR4HQ0SWEDH40PGZKQ3YEJ1-feat-odin-chromium-session-supervisor` — **prior art** for a sessiond-owned Chromium kiosk session supervisor (launch/stop via injected runners, dedicated profile, home/game/restoring states). Reuse its shape for `createChromiumController`.
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` and `physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond is the authoritative renderer lifecycle owner; the new controller must honor that contract.
- Input lineage: `refactor-inputplumber-normalized-input`, `refactor-inputplumber-korri-ownership`, `refactor-controller-input-profiles`, `refactor-desktop-input-broker`, `feat-focus-gated-native-input` — the normalization/ownership already exists; this plan only changes the last hop into the page.

### External References

- Chromium kiosk lockdown is a solved enterprise problem via **managed policies** (`ManagedPolicies`/`/etc/chromium/policies/managed/*.json`): disable `DeveloperToolsAvailability`, `NewTabPageLocation`/new windows, `URLBlocklist`, incognito, context menus, printing, etc. This is how R6 is met with standalone Chromium.
- Chromium Ozone/Wayland (`--ozone-platform=wayland`) is mature (unlike WebKitGTK's X11-only wrapper) — validated on-device.

---

## Key Technical Decisions

- **Decouple serving from rendering (the spine):** the web-surface host is a standalone service; the renderer and any phone are interchangeable clients. Rationale: R2/R10 and the phone-as-remote goal fall out for free; the renderer becomes throwaway.
- **korrid stays surface-agnostic; host proxies `/api`:** keep a single origin for the SPA (cookies/CORS/phone-story) and leave korrid as the pure brain that other surfaces (framebuffer/terminal) could consume directly. Considered folding SPA-serving into korrid (simpler, one port) — rejected to keep surfaces as peers per the stated architecture intent.
- **Standalone Chromium kiosk, native Wayland:** `--ozone-platform=wayland`, chromeless (`--app`/`--kiosk`), GPU. Validated. Rationale: R1; native Wayland + GPU is exactly what WebKitGTK could not do.
- **Lockdown via Chromium managed policy, not trust in `--kiosk`:** meet R6 explicitly with a managed-policy JSON shipped in the Nix closure + a dedicated profile, verified on-device (no devtools/new-window/context-menu/address-bar). This is the honest answer to "can't ever become a full browser."
- **Input: delete the injection, add an inputd-ws page adapter:** repoint the existing injectable `desktop-bridge-adapter` from `window.__korriInput` (Electrobun-fed) to a page-opened WebSocket to inputd (same host). Keyboard/gamepad adapters unchanged. Native Gamepad API kept as a bonus path. Rationale: R4/R5, renderer-agnostic, reuses inputd normalization, and works for the phone later.
- **Readiness beacon → status file:** Chromium won't self-report readiness like Electrobun's status.json. The web-surface host exposes a readiness endpoint the SPA pings on first paint; the Chromium controller (or host) writes the sessiond status file on that signal. Preserves sessiond's `waitForStatusFile` contract (R7). Fallback: compositor-window presence poll. (Exact mechanism resolved in U3.)
- **Migration safety via a non-default renderer variant first:** land Chromium as an additive `client` package/renderer option, flip the image only after on-device parity, remove Electrobun last (R8). Mirrors the `deviceCurrent`/CEF-variant pattern used this session.
- **Renderer kind `"chromium"`:** new `createChromiumController` implements `KorriRendererController`; sessiond wiring and state machine unchanged.

---

## Open Questions

### Resolved During Planning

- Does Chromium render the UI correctly and fluidly on-device, on the X11 path CEF/Electrobun would use? **Yes** — validated live (pixel-correct, native feel, GPU 680 MHz, `xdg_shell` on Wayland and correct on Xwayland).
- Is the input unification already renderer-agnostic? **Yes** — the semantic bus + adapters live in `@platform`; only the Electrobun-fed bridge source changes.
- Where should the web-surface host live? **A standalone service** under `product/services/device/` (peer to korrid/inputd), promoted from `headless-server.ts`.
- Can the page receive inputd events directly? **Yes** — inputd is already a broadcast WebSocket server on `:3002`.

### Deferred to Implementation

- **Readiness signal shape** (SPA beacon endpoint vs compositor-window poll) — pick during U3 against the real sessiond timeout behavior.
- **Same-origin path for the inputd ws** — page connects to `localhost:3002` directly vs the host proxies `/inputd` → `:3002`. Decide in U5 (proxy is cleaner for a single origin and the future phone case, but adds a host route).
- **Chromium flag/profile exact set** for kiosk stability on SM8550 (sandbox handling, `--user-data-dir`, `--password-store=basic`, crash-bubble suppression, GPU flags) — tune in U4 on-device.
- **Managed-policy exact key set** for full lockdown — enumerate in U6 and verify no escape on-device.
- **Whether `create-desktop-app.ts` / `forwarder-upstream.ts` move or are re-homed under the new service** vs imported from their current path — decide in U1 to minimize churn.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                 ┌─────────────────────────────────────────────┐
                 │ korrid  (brain: rpc / game-assets / events)  │  :3001  (unchanged)
                 └───────────────▲─────────────────────────────┘
                                 │ /api proxy
                 ┌───────────────┴─────────────────────────────┐
                 │ web-surface host  (serves SPA + runtime cfg) │  network-bindable
                 │  product/services/device/web-surface-host    │  (loopback for now)
                 └───────▲───────────────────────▲──────────────┘
                         │ http (SPA + /api)      │ http
        ┌────────────────┴───────┐        ┌───────┴───────────────┐
        │ Chromium kiosk (client)│        │ phone browser (later) │
        │  --ozone-platform=      │        │  same URL, no build   │
        │  wayland --app + policy │        └───────────────────────┘
        └───────▲────────────────┘
                │ ws  (page subscriber)
        ┌───────┴────────────────┐
        │ inputd  :3002 (broadcast)│  physical controller → normalized actions
        └─────────────────────────┘

  sessiond owns the kiosk process via KorriRendererController(kind="chromium"):
    launch → wait for readiness (SPA beacon → status file) → running → stop/relaunch
```

Migration order keeps a working kiosk at each step: **U1–U2** (host, additive) → **U3–U4** (Chromium renderer as non-default variant) → **U5** (input adapter, additive/gated) → **U6** (flip the image to Chromium + lockdown) → **U7–U8** (remove Electrobun, migrate tests).

---

## Implementation Units

### U1. Promote the web-surface host into a standalone service

**Goal:** A renderer-free, network-bindable service that serves the SPA (+ inlined runtime config) and proxies `/api` to korrid, living beside korrid/inputd — not inside any renderer app.

**Requirements:** R2, R3, R10

**Dependencies:** None

**Files:**
- Create: `product/services/device/web-surface-host.ts` (promote from `product/apps/desktop/headless-server.ts`)
- Create: `product/services/device/web-surface-host.test.ts`
- Modify: `product/apps/desktop/create-desktop-app.ts`, `product/apps/desktop/forwarder-upstream.ts`, `product/apps/desktop/runtime-config.ts` — re-home or re-export into the new service's import surface (decide move vs import in-place)
- Remove (later, U7): `product/apps/desktop/headless-server.ts`

**Approach:**
- Bind host/port from env (`KORRI_WEB_SURFACE_HOST`/`_PORT`), default loopback; keep `idleTimeout` for the `/api/config/events` SSE stream (precedent: the 255s window in `main.ts`).
- Keep the `createDesktopApp` composition (static assets + `inlineRuntimeConfig` + `/api/*` forwarder). Rename desktop-specific identifiers to surface-neutral ones where cheap; do not rewrite the Hono app.
- Add a readiness endpoint stub (`/__ready` POST) reserved for U3's beacon; no behavior yet beyond 204.

**Patterns to follow:** `product/services/device/inputd.ts` and `korrid.ts` service shape; existing `headless-server.ts`.

**Test scenarios:**
- Happy path: `GET /` returns the SPA HTML with an inlined `__korriRuntimeConfig` script.
- Happy path: `GET /assets/<hashed>` serves the static bundle with correct content-type.
- Integration: `POST /api/rpc` proxies to the configured korrid upstream and returns its status (stub upstream).
- Edge case: no upstream reachable → `/api/*` surfaces 503 (rail treats as empty), `/` still serves the SPA.
- Edge case: binds the configured host/port; loopback by default.

**Verification:** Chromium (or curl) against the host URL returns the SPA and a proxied `/api` response with korrid running; no Electrobun/renderer symbols imported.

---

### U2. Package the web-surface host + systemd user service

**Goal:** A Nix package for the host binary and a Korri systemd user unit that runs it, wired into the device image (loopback default), so it is a first-class managed service.

**Requirements:** R2, R7, R10

**Dependencies:** U1

**Files:**
- Create: `product/services/device/nix/web-surface-host.nix` (bun bundle package; mirror `nix/inputd.nix`/sessiond packaging)
- Modify: `product/systems/nixos/flake/default.nix`, `packages.nix` (expose the package)
- Modify: `product/systems/nixos/modules/korri-*.nix` (new `systemd.user.services.korri-web-surface-host` with env: korrid upstream URL, asset root, port; ordering before sessiond)
- Test: `product/services/device/nix/web-surface-host.test.ts` or a flake check for the unit's env contract

**Approach:**
- Bundle with `bun build --target bun` (the host has no native deps), point `KORRI_ASSET_ROOT` at the built portal bundle output.
- Order the unit before `korri-sessiond` so the URL is live when the renderer launches; `after`/`wants` korrid.

**Patterns to follow:** `product/services/device/nix/inputd.nix`, the korrid unit wiring in `product/systems/nixos/modules/`.

**Test scenarios:**
- Happy path: package evaluates for aarch64; unit env carries asset root + upstream URL + port.
- Edge case: eval on x86_64 (build host parity).
- Test expectation: Nix eval/flake-check only — no behavioral unit beyond U1's server tests.

**Verification:** `systemctl --user status korri-web-surface-host` active on a booted image; host reachable at the configured loopback URL before sessiond starts.

---

### U3. Chromium renderer controller (`kind: "chromium"`)

**Goal:** A `createChromiumController` implementing `KorriRendererController` that launches/stops a chromeless Wayland Chromium kiosk pointed at the host URL and satisfies sessiond's readiness contract.

**Requirements:** R1, R7, R8

**Dependencies:** U1

**Files:**
- Create: `product/services/device/sessiond-chromium.ts`
- Create: `product/services/device/sessiond-chromium.test.ts`
- Modify: `product/services/device/sessiond.ts` (select the renderer controller by kind/env; keep the abstraction)

**Approach:**
- Build the Chromium command: `--ozone-platform=wayland`, chromeless (`--app=<host-url>` or `--kiosk`), `--user-data-dir` (dedicated ephemeral profile), sandbox handling, crash-bubble/first-run suppression, GPU-on. Keep flags in one normalized builder (mirror the archived `sessiond-chromium` supervisor shape).
- Launch via the injected process runner (same pattern as `realElectrobunRunner`); `stop(pid)` kills the process group.
- **Readiness:** wait for the SPA beacon (`POST /__ready` on the host, U1) → write the sessiond status file; fallback to a compositor-window presence poll with the existing timeout. Preserve `waitForStatusFile` semantics so `/control/start` gates correctly.
- Require a Nix-managed Chromium binary (mirror `classifyElectrobunBinaryOrigin`).

**Execution note:** Start with a failing test for the command builder + readiness contract before wiring the real runner.

**Patterns to follow:** `product/services/device/sessiond-electrobun.ts` (controller shape, runner injection, status-file wait, binary-origin guard); archived `01KQR4HQ0SWEDH40PGZKQ3YEJ1` supervisor decisions.

**Test scenarios:**
- Happy path: builds a Wayland chromeless command with the host URL, dedicated profile, and lockdown-compatible flags.
- Happy path: `launch()` resolves after the readiness signal and returns `{ pid, command, metadata }`.
- Error path: readiness never arrives → times out, kills the child, throws (parity with the Electrobun timeout test).
- Error path: non-Nix Chromium binary → refuses to launch.
- Integration: `stop(pid)` terminates the process group; a subsequent `launch()` starts a fresh profile.

**Verification:** sessiond `/control/start` brings up the Chromium kiosk showing the home, and `status().renderer.kind === "chromium"`.

---

### U4. Package Chromium kiosk client + launch env

**Goal:** A `client` package that provides the Chromium kiosk binary/wrapper (flags + Wayland env) so sessiond can launch it as a Nix-managed renderer, as a **non-default** option initially.

**Requirements:** R1, R8, R10

**Dependencies:** U3

**Files:**
- Create: `product/apps/desktop/nix/chromium-kiosk.nix` (or `product/services/device/nix/chromium-kiosk.nix`) — wrap `pkgs.chromium` with the kiosk flag set + Wayland env
- Modify: `product/systems/nixos/flake/default.nix`, `packages.nix` (expose `korri-desktop-chromium` / `client` variant)
- Modify: `product/services/device/nix/sessiond.nix` (renderer app path + env for the chromium variant)

**Approach:**
- Wrapper script sets `--ozone-platform=wayland` + the normalized flag set from U3 and the Wayland session env (`XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`), and points at the host URL. Keep the default image on Electrobun until U6.
- No `GDK_BACKEND`/`DISPLAY` for this variant — Chromium runs Wayland.

**Patterns to follow:** the `deviceCurrent`/CEF non-default variant pattern in `product/apps/desktop/default.nix`; existing wrapper-script style in `product/apps/desktop/nix/wrap.nix`.

**Test scenarios:**
- Happy path: package evaluates for aarch64; wrapper carries Wayland platform + host URL + kiosk flags.
- Edge case: x86_64 eval parity.
- Test expectation: Nix eval + on-device launch smoke (covered operationally in U6); no behavioral unit here.

**Verification:** on Bandai, launching the packaged wrapper shows the chromeless kiosk at the host URL (matches the manual validation done this session).

---

### U5. Input: replace the injection with an inputd-ws page adapter

**Goal:** The page receives the device's normalized controller actions through a page-opened WebSocket to inputd, feeding the existing semantic bus — deleting the Electrobun `executeJavascript` injection while keyboard/gamepad adapters keep working.

**Requirements:** R4, R5

**Dependencies:** U1 (for the optional same-origin `/inputd` proxy)

**Files:**
- Create: `product/platform/input/inputd-ws-adapter.ts` (page-side WebSocket subscriber → `InputAction`s)
- Create: `product/platform/input/inputd-ws-adapter.test.ts`
- Modify: `product/apps/portal/spatial-navigation-config.ts` (select the ws adapter instead of the desktop bridge when in kiosk/device mode)
- Modify: `product/apps/portal/main.tsx` / start wiring as needed to pass the inputd URL/origin to the adapter
- Modify (optional): `product/services/device/web-surface-host.ts` add `/inputd` ws proxy → `:3002` for single-origin
- Remove (in U7): `product/apps/desktop/input-broker.ts`, `input-dispatch-bootstrap.ts`, `preload.ts` `__korriInput` install path

**Approach:**
- Reuse the injectable-`bridge` shape of `desktop-bridge-adapter.ts`: the ws adapter exposes `subscribeAction`, connecting to inputd, subscribing by device class, decoding via the existing `desktop-bridge-wire` / native wire schema, and emitting `InputAction`s onto the bus.
- Keep `keyboard-adapter` and `gamepad-adapter` untouched; native Gamepad API remains a bonus path (no dependency on it).
- Decide same-origin proxy vs direct `localhost:3002` (Open Question). Prefer the host `/inputd` proxy for one origin and future phone reuse.

**Execution note:** Implement the adapter test-first against a fake ws emitting recorded inputd frames.

**Patterns to follow:** `product/platform/input/desktop-bridge-adapter.ts` (injectable bridge, retry-until-available), `product/platform/input/gamepad-adapter.ts` (adapter contract), `desktop-bridge-wire.ts` decoding.

**Test scenarios:**
- Happy path: a decoded inputd action frame emits the matching semantic `InputAction` on the bus.
- Happy path: keyboard adapter still emits directions/confirm/back with no bridge present.
- Edge case: ws drops → adapter reconnects and resumes without duplicate emissions.
- Edge case: malformed frame → dropped, no throw, status reflects a drop.
- Integration: with the ws adapter active and the desktop-bridge source absent, `useInputAction("confirm")` fires from a controller action end-to-end (fake ws).

**Verification:** on the Chromium kiosk, the physical controller drives rail navigation with no Electrobun bridge present; keyboard also works.

---

### U6. Flip the device image to Chromium + kiosk lockdown

**Goal:** Make Chromium the default renderer on the SM8550 image, drop the X11 renderer env, wire the web-surface host, and lock the kiosk down via Chromium managed policy — verified no full-browser escape.

**Requirements:** R1, R6, R7, R8, R10

**Dependencies:** U2, U4, U5

**Files:**
- Create: managed-policy JSON + its Nix install (e.g. `product/apps/desktop/nix/chromium-policies.nix` → `/etc/chromium/policies/managed/korri-kiosk.json`)
- Modify: `product/systems/nixos/images/kiosk.nix` (`services.korri.client.package` → chromium kiosk; remove `GDK_BACKEND=x11`/`DISPLAY` from `kioskRendererEnvironment`; add `korri-web-surface-host`; sessiond renderer kind=chromium + host URL + status file)
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` (drop sessiond `DISPLAY`/`GDK_BACKEND`; client path)
- Modify: `product/systems/nixos/modules/korri-compositor.nix` / `korri-game-stream.nix` if they assume the X11 renderer

**Approach:**
- Managed policy disables: DeveloperTools, new tabs/windows/incognito, URL bar/omnibox navigation, context menu, printing, downloads, and pins the kiosk URL — the explicit answer to R6. Dedicated profile; `--kiosk`/`--app` in addition, not instead.
- Keep sessiond ownership + the game-exit relaunch path; only the renderer command changes.
- Verify on Bandai: no key combo or gesture reaches tabs/address-bar/devtools/new-window; game launch + return still restores the kiosk.

**Test scenarios:**
- Integration (on-device smoke): fresh boot lands the Chromium kiosk at the home; GPU-accelerated; native feel.
- Integration: attempt escape (new tab/window, devtools, address bar, context menu) → all blocked by policy.
- Integration: launch a game, exit → kiosk relaunches (sessiond contract intact).
- Test expectation: image-level smoke + policy assertion; unit coverage lives in U3/U5.

**Verification:** Bandai boots the Chromium kiosk by default, locked down (no escape), with the physical controller working and game-exit relaunch intact.

---

### U7. Remove Electrobun (code, deps, Nix build, variants)

**Goal:** Delete all Electrobun-specific code, its npm dependency, its Nix build, and the dead desktop variants — only after U6 proves Chromium as the default.

**Requirements:** R5, R9

**Dependencies:** U6

**Files:**
- Remove: `product/apps/desktop/main.ts` (Electrobun window/IPC/menu/focus-blur bits), `input-broker.ts`, `input-dispatch-bootstrap.ts`, `preload.ts`/`preload-entry.ts` (`__korriInput` install), `window-options.ts` Electrobun renderer specifics, `status-file.ts` if superseded, `electrobun.config.ts`, `headless-server.ts` (superseded by U1)
- Remove: `product/apps/desktop/nix/{electrobun-binaries,unwrapped,wrap,versions}.nix` and the `host`/`device`/`deviceCurrent`/`x86Kiosk`/CEF variants in `default.nix`
- Modify: `package.json`/`bun.lock` (drop `electrobun@1.16.0`)
- Remove: `product/services/device/sessiond-electrobun.ts` (superseded by `sessiond-chromium.ts`)
- Modify: any `product/systems/nixos/**` references to the electrobun package/env

**Approach:**
- Delete in dependency order (image no longer references the electrobun package → remove package → remove build → remove app code → drop npm dep). Keep `create-desktop-app`/`forwarder-upstream`/`runtime-config` only in their U1 re-homed form.
- Grep-sweep for `electrobun`, `Electrobun`, `__korriInput`, `KORRI_ELECTROBUN_*`, `GDK_BACKEND`, `libNativeWrapper` to confirm removal.

**Test scenarios:**
- Test expectation: none (removal). Verified by build + the migrated test suite (U8) staying green and a clean grep.

**Verification:** repo builds with no `electrobun` dependency or symbols; SM8550 image builds and boots the Chromium kiosk; `git grep -i electrobun` returns only historical docs/work items.

---

### U8. Migrate the test suite

**Goal:** Replace Electrobun-coupled tests with Chromium-controller + inputd-ws-adapter coverage; keep the surviving input-core, server, and web-app tests.

**Requirements:** R4, R7, R9

**Dependencies:** U3, U5, U7

**Files:**
- Remove: `product/services/device/sessiond-electrobun.test.ts`, `product/apps/desktop/input-broker.test.ts`, `input-dispatch-bootstrap` tests, Electrobun preload tests
- Ensure present: `sessiond-chromium.test.ts` (U3), `inputd-ws-adapter.test.ts` (U5), `web-surface-host.test.ts` (U1)
- Modify: `product/services/device/sessiond*.test.ts` that assert `renderer.kind === "electrobun"` → `"chromium"`

**Approach:**
- Preserve the `sessiond` state-machine tests by swapping the renderer stub kind; keep `desktop-input-broker-core` and adapter tests (framework-agnostic, still valid).

**Test scenarios:**
- Happy path: full device + input + host suites pass with the chromium renderer kind.
- Edge case: no lingering references to Electrobun test fixtures.

**Verification:** `bun test product/services/device product/platform/input product/apps/desktop` green; no Electrobun test references remain.

---

## System-Wide Impact

- **Interaction graph:** sessiond (renderer owner) → `KorriRendererController` (kind swap) → Chromium process; web-surface host → korrid `/api`; page → inputd ws. Compositor (sway) hosts the Chromium `xdg_shell` surface instead of an Xwayland window.
- **Error propagation:** renderer launch/readiness failures still surface through sessiond's existing timeout/relaunch; host `/api` upstream failures surface as 503 to the SPA (unchanged rail empty-state).
- **State lifecycle risks:** the readiness contract is the highest-risk seam — a wrong signal makes `/control/start` hang or flap. Keep the compositor-window poll fallback; preserve the game-exit relaunch invariant.
- **API surface parity:** dropping `GDK_BACKEND`/`DISPLAY` from the renderer env must not affect *game* launches (gamescope/Xwayland paths for emulators are separate — do not remove their X11 env). Scope the env change to the renderer only.
- **Integration coverage:** on-device smoke (U6) is required — unit tests cannot prove Wayland surface, GPU acceleration, lockdown, or controller passthrough.
- **Unchanged invariants:** korrid rpc surface, the input semantic bus + `useInputAction`, sessiond's lifecycle/state machine and `KorriRendererController` interface, the Shift UI, and the already-landed `perf(library)`/`fix(shift)` commits.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Readiness signal wrong → `/control/start` hangs/flaps | Beacon endpoint + compositor-window poll fallback; keep the existing timeout/relaunch; test the timeout path (U3). |
| Kiosk escapable to a full browser (violates R6) | Chromium managed policy (devtools/new-window/omnibox/context-menu off) + dedicated profile; on-device escape testing in U6, not trust in `--kiosk`. |
| Removing `GDK_BACKEND`/X11 env breaks emulator/game launches | Scope the env change to the renderer only; leave gamescope/Xwayland game-launch env intact; verify a game launch in U6. |
| Chromium kiosk flags unstable on SM8550 (sandbox/GPU) | Tune the flag/profile set on-device in U4 (validated base already works with `--no-sandbox --ozone-platform=wayland`). |
| Physical controller not reaching Chromium | Baseline is the inputd-ws adapter (works regardless of evdev exposure); native Gamepad API is only a bonus. |
| Disk/memory increase from Chromium | Accepted per decision (fluidity/correctness > memory); Chromium already in the store; quantify in U6. |
| Dual-screen/companion regressions | Explicitly deferred; single-window kiosk first. |

---

## Documentation / Operational Notes

- Add a `docs/solutions/` entry capturing the Electrobun→Chromium decision, the decoupled web-surface-host architecture, and the on-device validation numbers (GPU 680 MHz, native Wayland, pixel-correct) — supersedes the WebKitGTK renderer best-practice doc.
- Capture the deferred phone-as-remote (LAN bind + mDNS + auth) and native-Gamepad-API items via `se-backlog`.
- Rollout: flip is per-image; keep the Chromium variant non-default until U6 so any image can build a working kiosk mid-migration.

---

## Sources & References

- Origin: this session's live design + on-device validation (no upstream requirements doc); `work/items/active/01KWE3F5Q2ZK8N4YT7VBQ3MJ9A-replace-electrobun-chromium-kiosk/work.md`.
- Prior art: `work/items/active/01KQR4HQ0SWEDH40PGZKQ3YEJ1-feat-odin-chromium-session-supervisor/`, `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`.
- Renderer seam: `product/services/device/sessiond-renderer.ts`, `sessiond-electrobun.ts`.
- Host seed: `product/apps/desktop/headless-server.ts`, `create-desktop-app.ts`, `forwarder-upstream.ts`.
- Input: `product/platform/input/*-adapter.ts`, `product/platform/browser/navigation/`, `product/services/device/inputd.ts`, `product/apps/portal/spatial-navigation-config.ts`.
- Renderer history: `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`, `docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md`, `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`.
