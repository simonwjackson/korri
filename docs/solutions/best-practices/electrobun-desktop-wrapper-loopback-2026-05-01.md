---
title: Electrobun desktop wrappers should preserve web/API same-origin contracts
date: 2026-05-01
last_updated: 2026-05-01
category: best-practices
module: korri/deploy/desktop + tools/desktop
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Wrapping an existing Vite web UI and Hono/Effect API in Electrobun
  - Browser-side API clients use relative same-origin URLs such as /api/rpc
  - Desktop packaging must remain additive to existing web and API deployment paths
  - Developing Electrobun Linux desktop support from a NixOS flake
related_components:
  - development_workflow
  - testing_framework
tags:
  - electrobun
  - desktop
  - hono
  - same-origin
  - nixos
  - runtime-check
  - smoke-test
  - packaging
---

# Electrobun desktop wrappers should preserve web/API same-origin contracts

## Context

Korri needed an Electrobun desktop target around an existing Vite portal and Hono/Effect RPC API. The web app already sends RPC traffic to the relative path `/api/rpc`, and the existing dev/prod web setup relies on same-origin routing or Vite proxying to satisfy that contract.

The tempting Electrobun path is to load the packaged UI directly from `views://mainview/index.html`. That is fine for static-only apps, but it breaks down for a web UI that expects `/api/*` to exist on the same origin. The desktop wrapper also needed to be safe on NixOS, where Electrobun's downloaded Linux binary can fail before launch with the dynamic linker stub message:

```text
Could not start dynamically linked executable: node_modules/electrobun/bin/electrobun
NixOS cannot run dynamically linked executables intended for generic linux environments out of the box.
```

## Guidance

Use a local loopback HTTP origin as the desktop boundary. Package the Vite output with Electrobun, but have the Electrobun Bun main process serve both static portal assets and the existing API from one `127.0.0.1:<port>` origin.

The useful shape is:

```text
Vite build -> out/build/portal
Electrobun copy -> views/mainview
Electrobun Bun main process:
  - starts a loopback Hono app
  - delegates /api and /api/* to the existing honoApp
  - serves static portal files for non-API paths
  - falls back to index.html for route-like SPA paths
  - opens BrowserWindow at http://127.0.0.1:<port>/
```

Keep the composition thin and additive:

```ts
app.all("/api", c => honoApp.fetch(c.req.raw))
app.all("/api/*", c => honoApp.fetch(c.req.raw))
app.get("*", c => serveStaticAsset(c.req.raw, options))
```

Do not duplicate RPC handlers, middleware, body limits, or health routes in the desktop layer. Reuse the shared API app so `/api`, `/api/health`, and `/api/rpc` behave the same under desktop and the standalone API server.

For static files, treat SPA fallback and assets differently:

- `/` and route-like misses such as `/games/123` may return `index.html`.
- file-like misses such as `/assets/missing.js` should return 404, not `index.html`.
- encoded or plain traversal attempts should be rejected before reading from disk.

For NixOS, add an explicit runtime readiness check instead of hiding native failures in `desktop-dev` or `desktop-build`. The check should verify the package/CLI are installed, run the lightest safe native binary probe, classify the known NixOS dynamic-linker failure, and recommend `nix-ld`, wrapping/patchelf, or a future Nix derivation. Keep native packaging out of default `just build` and `just check` until this probe passes on the target machine.

## Why This Matters

Loading directly from `views://` creates a second application mode: browser/web requests use HTTP semantics, while desktop requests come from a custom scheme with no same-origin `/api/rpc`. That forces special cases into the RPC client or creates a hidden desktop-only API contract.

The loopback-origin pattern avoids that split. The browser-side code keeps using relative URLs, the existing Hono/Effect API remains authoritative, and the desktop wrapper is just another deployment target.

The NixOS guardrail matters for a different reason: Electrobun can download platform-native binaries as part of its CLI flow. On NixOS, a missing dynamic linker path is an environment/runtime compatibility issue, not an application bug. A dedicated `desktop-runtime-check` makes that failure explicit and actionable before someone tries to debug the UI or API layer.

## When to Apply

- You are adding a native desktop shell around an existing web app that already has HTTP API calls.
- Client code uses relative API URLs and should not learn about desktop-specific transports.
- The API server already exists as a reusable Hono app or equivalent fetch-compatible handler.
- The desktop package should be optional and should not perturb existing web, API, E2E, or CI commands.
- Developers run on NixOS or another environment where downloaded native binaries may not execute without wrapping.

## Examples

### Electrobun config should be explicit about generated outputs

```ts
export default {
  build: {
    buildFolder: "out/build/electrobun",
    artifactFolder: "out/artifacts/electrobun",
    bun: {
      entrypoint: "korri/deploy/desktop/main.ts",
    },
    copy: {
      "out/build/portal/index.html": "views/mainview/index.html",
      "out/build/portal/assets": "views/mainview/assets",
    },
    watchIgnore: ["out/**", "node_modules/**"],
  },
}
```

This keeps Electrobun's defaults (`build/`, `artifacts/`) from escaping the repo's `out/` artifact convention.

### Desktop commands should be opt-in

```text
just desktop-runtime-check  # native binary/environment readiness
just desktop-smoke          # build portal and verify HTTP composition
just desktop-dev            # build portal, check runtime, launch Electrobun dev
just desktop-build          # build portal, check runtime, package Electrobun app
```

The smoke test should not need a native window. It can instantiate the desktop Hono composition against `out/build/portal` and verify:

- `GET /` returns the portal shell.
- `GET /api/health` returns the shared API health response.
- a representative file under `/assets/*` returns 200 when assets exist.
- a missing portal build fails with an actionable message.

### NixOS failures should be classified, not disguised

A runtime check can turn the generic native failure into a useful project-level diagnostic:

```text
Electrobun's Linux binary failed under the NixOS dynamic linker stub.
Recommendation: Enable nix-ld for local development, or add a wrapper/patchelf/Nix derivation before treating desktop packaging as supported on NixOS.
```

That keeps the supported surface honest: web/API checks can still pass, desktop HTTP composition can still be smoke-tested, and native packaging remains blocked until the machine can run Electrobun's platform binary.

## Related

- `../../../work/.archive/01KQDTYV05D4Q8T63WBQSHD6A1-feat-electrobun-desktop-wrapper/plan.md` — implementation plan and decisions.
- `korri/deploy/desktop/create-desktop-app.ts` — same-origin desktop Hono composition.
- `korri/deploy/desktop/static-assets.ts` — static serving, SPA fallback, and traversal protection.
- `tools/desktop/desktop-smoke.ts` — non-native desktop HTTP smoke check.
- `tools/desktop/electrobun-runtime-check.ts` — NixOS/native runtime readiness check.
- `electrobun.config.ts` — desktop packaging configuration.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — related invariant: desktop wrapping must not couple product components to navigation or input-library APIs.
