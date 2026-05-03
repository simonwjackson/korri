---
title: Product-owned composition keeps shared layers reusable
date: 2026-05-03
category: best-practices
module: korri/shared boundaries + korri/products/app/api
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - A shared module imports product routes, RPC contracts, handlers, or app wiring
  - A composition file looks reusable but only works for one product
  - New architecture standards need executable drift guards
  - Refactoring app-specific infrastructure out of shared runtime code
tags: [boundaries, shared-code, product-code, rpc, hono, testing, standards]
---

# Product-owned composition keeps shared layers reusable

## Context

After the Effect v4 migration, the codebase standards said shared runtime code must be product-agnostic, but the app RPC composition still lived under `korri/shared/api/*` and imported product endpoints through `@app/*`:

```ts
// korri/shared/api/rpc/app-rpc-group.ts
import { GetHelloRpc as appHelloGet } from "@app/api/hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "@app/api/library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "@app/api/library/list.rpc"
```

That made `korri/shared` look reusable while actually depending on one product's API surface. The same cleanup also revealed related standards drift: legacy `Mock*` / `Fake*` / `stub*` names in test infrastructure, component-local rail pixel constants, and no executable guard to prevent shared/product boundary regressions.

## Guidance

Treat files that **choose a product's endpoints, handlers, live layers, or HTTP app routes** as product-owned composition, even when they are plumbing-like.

### Keep generic transport in shared

Shared code should contain reusable primitives that do not know which product is being served:

- `korri/shared/api/rpc/client.ts` — generic RPC client transport layer
- `korri/shared/api/rpc/serialization.ts` — transport serialization
- `korri/shared/api/rpc/errors.ts` — shared typed error classes
- `korri/shared/api/http/media-assets.ts` — generic media-serving helper

These modules are reusable because another product can import them without also inheriting Korri app endpoints.

### Move app selection into the product

The app-owned API surface now lives under `korri/products/app/api/*`:

```text
korri/products/app/api/
  app-rpc-group.ts
  handlers.ts
  hono-app.ts
  rpc-server.ts
```

Those files are allowed to import app endpoints and compose live app infrastructure:

```ts
// korri/products/app/api/app-rpc-group.ts
import { FeatureGatesMiddleware } from "@shared/gates/middleware"
import { RpcGroup } from "effect/unstable/rpc"
import { GetHelloRpc as appHelloGet } from "./hello/rpc"
import { LaunchLibraryRpc as appLibraryLaunch } from "./library/launch.rpc"
import { ListLibraryRpc as appLibraryList } from "./library/list.rpc"

export const appRpcGroup = RpcGroup.make(
  appHelloGet,
  appLibraryList,
  appLibraryLaunch,
).middleware(FeatureGatesMiddleware)
```

Dev server, desktop wrapper, and test harnesses import the product Hono app:

```ts
import { honoApp } from "@app/api/hono-app"
```

This makes the dependency direction honest: deployment/tooling hosts the app, the app composes shared primitives, and shared primitives never reach back into product code.

### Add executable standards guards

Architecture rules drift when they live only in prose. Add narrow scan tests for the high-signal rules:

```ts
it("keeps shared runtime code product-agnostic", () => {
  const violations = sourceFiles(SHARED_ROOT)
    .filter(file => importsProductCode(readFileSync(file, "utf8")))
    .map(file => relative(REPO_ROOT, file))

  expect(violations).toEqual([])
})
```

A second guard keeps faux-double names out of source identifiers:

```ts
it("keeps source identifiers free of faux-double prefixes", () => {
  const violations = SCAN_ROOTS.flatMap(root =>
    sourceFiles(root)
      .filter(file => !ALLOWLISTED_FILES.has(repoRelative(file)))
      .filter(file => hasConfiguredDoublePrefix(readFileSync(file, "utf8")))
      .map(repoRelative),
  )

  expect(violations).toEqual([])
})
```

Keep these guards narrow. They are standards tripwires, not a full custom linter.

### Make exceptions explicit

Some apparent violations are valid when they are named and documented:

- `@shared/logger` is an intentional module entrypoint even though barrels are otherwise forbidden.
- Feature-gate ids may use `localStorage` because they are non-sensitive local preference state; credentials and private data still must not.
- Tilegrid sentinel styles remain inline because CSS-length measurement needs runtime DOM styles; the exception is tied to the sentinel-resolution pattern.

## Why This Matters

**Shared code stays reusable.** A module under `korri/shared` that imports `@app/*` can only be used inside that app. Moving product composition into `korri/products/app/api` restores the meaning of the shared boundary.

**Dependency direction becomes readable.** Tooling and deploy code host a product app; product code composes shared primitives; shared primitives provide product-agnostic capabilities. Reviewers no longer have to infer hidden coupling from file names.

**Refactors become safer.** When shared/product import drift and faux-double naming are executable checks, future migrations get immediate feedback instead of rediscovering the same standards mismatch during review.

**Exceptions stop weakening the rule.** A documented module entrypoint or non-sensitive storage seam is different from an accidental barrel or sensitive `localStorage` leak. Naming the exception keeps the rule strict everywhere else.

## When to Apply

- A file under `korri/shared/*` imports `@app/*` or relative paths into `korri/products/*`.
- A shared-looking file chooses concrete app RPCs, routes, handlers, live layers, or product feature wiring.
- A new development standard has a small, high-signal predicate that can be tested with a repo scan.
- A style or boundary rule needs a real exception; document the exception and keep it narrow.

## Examples

**Before — shared composition imports product code:**

```text
korri/shared/api/rpc/app-rpc-group.ts   # imports @app/api/*
korri/shared/api/rpc/handlers.ts        # imports @app/api/* handlers
korri/shared/api/http/hono-app.ts       # mounts app-specific RPC routes
```

**After — product composition owns product choices:**

```text
korri/shared/api/rpc/client.ts          # generic transport
korri/shared/api/rpc/serialization.ts   # generic serialization
korri/shared/api/http/media-assets.ts   # generic helper

korri/products/app/api/app-rpc-group.ts # app RPC list
korri/products/app/api/handlers.ts      # app handler mapping
korri/products/app/api/rpc-server.ts    # app live RPC server
korri/products/app/api/hono-app.ts      # app HTTP composition
```

**Configured-real naming cleanup:**

```ts
// Before
class MockResizeObserver {}
function stubRect(element: Element, rect: Partial<DOMRect>) {}
interface FakeClock {}

// After
class ResizeObserverShim {}
function setElementRect(element: Element, rect: Partial<DOMRect>) {}
interface ControlledClock {}
```

## Related

- `docs/development/standards.md` — canonical shared/product boundary and testing posture.
- `docs/development/style-guide.md` — no-barrel and configured-real naming conventions.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — same composition-root principle applied to Effect atom UI layers.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — background for avoiding `Mock*` / `Stub*` / `Fake*` seams.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — why some Tilegrid inline styles are justified dynamic layout exceptions.
