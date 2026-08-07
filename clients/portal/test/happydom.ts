import { plugin } from "bun"
import { createRequire } from "node:module"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

/**
 * Shift is compiled from source by its host but installs its own toolchain, so
 * files under `surfaces/shift/src` would otherwise resolve React from Shift's
 * own `node_modules`. Two React copies in one tree make every hook the surface
 * renders throw, so the host pins React to the single copy it owns.
 */
const requireFromPortal = createRequire(import.meta.url)
const pinned = new Map(
  [
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "react-dom",
    "react-dom/client",
  ].map(specifier => [specifier, requireFromPortal.resolve(specifier)]),
)

plugin({
  name: "pin-host-react",
  setup(build) {
    build.onResolve({ filter: /^react(-dom)?(\/.+)?$/ }, ({ path }) => {
      const resolved = pinned.get(path)
      return resolved === undefined ? undefined : { path: resolved }
    })
  },
})
