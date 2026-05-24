import {
  isRuntimeConfig,
  type RuntimeConfig,
} from "../desktop/runtime-config-shape"

/**
 * Read the runtime-config snapshot that the desktop's bun-side Hono
 * composition inlines into the served `index.html` as a
 * `<script>window.__korriRuntimeConfig = {…}</script>` tag.
 *
 * Synchronous and pure — `portal/main.tsx` calls this once at boot,
 * before any React work, and seeds the launcher / library-source atoms
 * accordingly via `<RegistryProvider initialValues={…}>`.
 *
 * Falls back to `{ desktopInput: false }` when the global is absent
 * (portal deploy served by nginx, Storybook, unit tests) or when the
 * inlined value has the wrong shape. Same default the previous
 * bridge-subscription path returned.
 */
export function readInlinedRuntimeConfig(target: Window): RuntimeConfig {
  const value = (target as { __korriRuntimeConfig?: unknown })
    .__korriRuntimeConfig
  if (isRuntimeConfig(value)) return value
  return { desktopInput: false }
}
