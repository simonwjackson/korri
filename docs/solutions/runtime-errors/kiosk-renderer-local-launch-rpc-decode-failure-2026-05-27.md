---
title: Kiosk renderer local-source launches failed with RpcClientDefect via redundant bun bridge
date: 2026-05-27
category: runtime-errors
module: korri/products/app/features/home
problem_type: runtime_error
component: tooling
symptoms:
  - "Pressing A on a local-source game tile surfaced a 'Could not launch <game> / The game's launch command failed' banner in the kiosk UI"
  - "Renderer threw 'RpcClientDefect: Error decoding HTTP response' ~35ms after firing app.desktop.launch"
  - "Bridge handler was never entered for renderer-originated calls, yet curl with the same payload entered it cleanly and launched the game"
  - "app.library.list over the standard /api/rpc path kept working on every page load, isolating the regression to the launch path"
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [kiosk, electrobun, effect-rpc, launcher, federation, rocknix, arm64, renderer]
---

# Kiosk renderer local-source launches failed with RpcClientDefect via redundant bun bridge

## Problem

On the Sobo kiosk (ARM64 RockNIX) every press of `A` on a local-source PICO-8
tile (`celeste-classic`, `porklike`, …) surfaced a *"Could not launch <game> /
The game's launch command failed"* banner in the Korri desktop UI. No game
ever spawned. The same library entries were directly launchable via curl
against the desktop bun's bridge endpoint, which made the failure look
intermittent and confusing.

## Symptoms

- Library tile press → failure banner with subtitle `"The game's launch
  command failed"` (Defect path — no `exitCode`, no `failureKind`).
- `journalctl -u korri-server` showed zero new entries during failing
  presses, even though `app.library.list` requests were arriving fine.
- The desktop bun's `launch-bridge: route entry` pino log fired only for
  manual `curl` requests, never for renderer-driven presses.
- WebKit `console.log` from React produced no output in
  `/storage/.local/state/korri/electrobun.log` — WebKitGTK on Linux does not
  pipe WebView console into Electrobun's stdout.
- After adding a fetch-based POST trace endpoint, the real error finally
  surfaced from the renderer side, ~35 ms after the press:

  ```
  source=launcher-layer-bridge event="run"
  source=launcher-layer-bridge event="client.launchGame threw"
                               data="~effect/rpc/RpcClientError: RpcClientDefect: Error decoding HTTP response"
  ```

- `app.library.list` over the renderer → `/api/rpc` → bun forwarder →
  loopback `korri-server` path kept working on every page load, which
  isolated the regression to the launch-specific bridge path.

## What Didn't Work

1. **Server-side instrumentation** in `app.library.launch` and `sessiond`
   stayed empty. The request never reached the server; the failure was
   upstream of every RPC handler we'd added logs to.
2. **Bun-bridge route-entry logs** (commit `4dd4c0d`) fired cleanly for
   `curl` against `/__korri/desktop/rpc` but stayed empty for real renderer
   presses — strong signal that the renderer's POST was not matching the
   route we thought it was, yet we couldn't see what it *was* matching.
3. **Wiring the `launchLocal` delegate** (commit `b6327f7`) made the
   curl-driven bridge test path succeed and produced a runnable game, but
   did not move the user flow because the renderer's request was failing
   to decode *before* any delegate ran.
4. **Threading the federation `source` through the launch chain** (commit
   `b29ceed`) was necessary so the bridge could route local vs. remote, but
   insufficient on its own — the bridge path itself was the failure site.
5. **WebKit `console.log` diagnostic** (commit `83e72fb`) was silently
   dropped. WebKitGTK on Linux does not capture WebView `console.log` into
   `electrobun.log`, so the diagnostic produced no signal at all and burnt
   a whole deploy round.
6. **Fetch-based POST trace endpoint** `/__korri/desktop/trace` (commit
   `27735e6`) was the diagnostic that finally surfaced the real error and
   identified the bridge's custom Hono `/__korri/desktop/rpc` route as the
   failure site. This endpoint is now permanent observability infra.

## Solution

Stop routing local-source launches through the desktop bridge at all.
Local launches reuse the same RPC path that already works for
`app.library.list`; the bridge stays for remote / Moonlight launches that
genuinely need the desktop bun to spawn gamescope locally.

In `LauncherLayerBridge` (`korri/products/app/features/home/launcher-layer-bridge.ts`):

```ts
// Branch once on federation source.
return Layer.effect(Launcher)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(appClient => ({
      run: (spec, runOptions) => {
        const source = runOptions?.source
        // Local-source / source-absent: server is source of truth.
        // Same path as LauncherLayerRpc — /api/rpc → bun forwarder →
        // loopback korri-server on 127.0.0.1:3001 → sessiond.
        if (!source || source.isLocal !== false) {
          return appClient["app.library.launch"](
            source ? { id: spec.command, source } : { id: spec.command },
          ).pipe(Effect.mapError(toLibraryError))
        }
        // Remote-source: keep the bun-bridge Moonlight pipeline.
        return moonlightClient.launchGame({ id: spec.command, source })
          // …
      },
    })),
  ),
).pipe(Layer.provide(RpcClientLive))
```

The bridge handler now defensively refuses any payload with
`source.isLocal === true`, returning a typed `host-unavailable` failure
with the message `"local-source launches must call app.library.launch,
not the desktop bridge"` so a future regression fails loud rather than
silently mis-decoding.

Deleted as part of the fix (zero backwards compat):

- `korri/deploy/desktop/launch-local-via-server.ts` + test
- `LaunchBridgeOptions.launchLocal` seam in `launch-bridge.ts`
- `main.ts` wiring (`createLaunchLocalViaServer`)
- The bridge's local-source delegation branch

Net diff: **+117 / −685 lines** across 8 files (commit `98c751a`).

## Why This Works

- **Reuses a path proven on every page load.** `app.library.list` was
  already round-tripping renderer → `/api/rpc` → forwarder → loopback
  `korri-server` on every visit to the library view. Putting
  `app.library.launch` on the same path means the launch flow inherits a
  well-exercised transport, decoders, and error handling.
- **Eliminates the unverified custom route.** The desktop bridge's
  `/__korri/desktop/rpc` route used a homemade Hono adapter for
  Effect-RPC, and its decode contract didn't match what the renderer's
  `RpcClient` expected. We never definitively pinned which Hono route the
  renderer's POST actually matched — the bridge route did not log entry,
  yet the client received a body it couldn't decode. Removing the path
  removes the class of failures rather than patching one symptom.
- **Restores the project's source-of-truth posture.** Server owns local
  launches; `sessiond` owns the gamescope + retroarch lifecycle; the
  renderer stays dumb. This matches the documented architecture rather
  than smuggling launch orchestration into the bun bridge.
- **Single responsibility for the bridge.** The bun bridge now exists for
  exactly one reason: remote / Moonlight launches where bun must spawn
  gamescope locally on the client. No more renderer → bun → server → bun
  → sessiond round trips for the local case.

## Prevention

- **Loud failure on regression.** The bridge handler's local-source
  branch returns a typed `host-unavailable` failure with the message
  `"local-source launches must call app.library.launch, not the desktop
  bridge"`. Any future caller that routes a local launch through the
  bridge fails immediately with a named error instead of silently
  mis-decoding.
- **Closed the renderer-side observability gap.** The
  `/__korri/desktop/trace` POST endpoint stays in place permanently. The
  React side can fire-and-forget log events that land in pino's
  `electrobun.log`, independent of WebKitGTK's broken WebView
  `console.log` capture. Any future renderer-side investigation has a
  working channel from day one.
- **Test coverage narrowed to the bridge's real job.**
  `korri/products/app/features/home/launcher-layer-bridge.test.ts` now
  covers only the remote / Moonlight path; every case sets
  `source.isLocal = false`. The local path is exercised through the
  existing RPC tests that cover `app.library.*`.
- **Code-review invariant.** Any "A → B → A" middleware shape (renderer →
  bun → server, when the renderer can call the server directly) should be
  deleted unless B does something A genuinely cannot. Local launches do
  not need bun in the middle; remote / Moonlight launches do.

## Related Issues

- [`best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`](../best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md)
  establishes the same-origin `/api/rpc` contract this fix honors. Worth
  a refresh pass to call out that `/__korri/desktop/rpc` is reserved for
  *desktop-only* concerns (window/system surface, Moonlight spawn) — not
  a transparent middleware for shared `app.*` RPCs.
- [`architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`](../architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md)
  describes the renderer / sessiond seam that the launch flow now plugs
  into directly via the server, no bun middleman.
- [`architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`](../architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md)
  describes `launch-bridge.ts` as the direct Moonlight spawn path; the
  federated / local split this fix introduced means that description now
  applies *only* to remote-source launches.
- Effect-RPC decode-shape failures across a transport boundary are a
  recurring family — keep an eye on any future custom HTTP adapter for
  Effect-RPC outside the standard `/api/rpc` path.
