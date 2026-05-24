/**
 * Browser-bundled bootstrap for the waiting-page polling loop.
 *
 * Bundled by `bun build --target=browser` and copied into the desktop
 * app bundle at `Resources/app/views/mainview/waiting-polling-loop.js`.
 * The rendered waiting page references this file via a single
 * `<script src="/waiting-polling-loop.js">` tag — no inline JS in the
 * page body. All logic lives in `./polling-loop.ts` and is unit-tested
 * separately; this file just wires browser primitives into it.
 */

import { createPollingLoop } from "./polling-loop"

createPollingLoop({
  fetch: globalThis.fetch.bind(globalThis),
  reload: () => window.location.reload(),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  url: "/__korri/desktop/connection-status",
  intervalMs: 750,
}).start()
