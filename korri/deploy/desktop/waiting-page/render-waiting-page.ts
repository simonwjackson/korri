/**
 * Pure HTML renderer for the bun-served "waiting for server" page.
 *
 * Used by the catch-all serve handler when the connection controller is
 * not yet in the `connected` state. The renderer never reaches React in
 * this case: bun ships this small static page, the page polls
 * `/__korri/desktop/connection-status`, and the page reloads (which
 * causes bun to serve the React bundle) once the controller flips to
 * `connected`.
 *
 * Help-text timing is a request-time decision: the renderer compares
 * `now` against the `helpAfter` ISO string and either includes or omits
 * the help block. The polling reload (~750 ms cadence) means a
 * transition from "help-hidden" to "help-visible" lands on the device
 * within one poll. Keeps this page truly static (no client timer).
 *
 * Theme parity: a co-located `waiting.css` is loaded via `<link>`. We do
 * not link the Tailwind-compiled portal stylesheet here because that
 * file is fingerprinted on every Vite build and we would couple this
 * page to a moving filename.
 */

import type { ConnectionStateSnapshot } from "../connection-state-snapshot"

const WAITING_CSS_HREF = "/waiting.css"
const POLLING_LOOP_HREF = "/waiting-polling-loop.js"

export function renderWaitingPage(
  snapshot: ConnectionStateSnapshot,
  now: number,
): string {
  const title = buildTitle(snapshot)
  const showHelp = isHelpVisible(snapshot, now)
  const help = showHelp ? renderHelpBlock() : ""
  const bootstrap = renderBootstrapScript()

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${WAITING_CSS_HREF}" />
  </head>
  <body data-status="${escapeHtml(snapshot.status)}">
    <main class="waiting" role="status">
      <h1 class="waiting-title">${escapeHtml(title)}</h1>
      <p class="waiting-body">
        Make sure Ethernet is connected and a Korri server is running on the
        same network.
      </p>
      ${help}
    </main>
    ${bootstrap}
  </body>
</html>
`
}

function buildTitle(snapshot: ConnectionStateSnapshot): string {
  if (snapshot.status === "reconnecting") {
    return `Looking for ${snapshot.server.hostId}…`
  }
  if (snapshot.status === "searching") {
    return "Looking for a Korri server…"
  }
  // "connected" is unexpected here (the catch-all should serve the React
  // bundle in that case) but render a sane fallback rather than throw.
  return "Connected"
}

function isHelpVisible(
  snapshot: ConnectionStateSnapshot,
  now: number,
): boolean {
  if (snapshot.status === "connected") return false
  const helpAfter = parseHelpAfter(snapshot.helpAfter)
  return now >= helpAfter
}

function parseHelpAfter(iso: string): number {
  const ms = Date.parse(iso)
  // Unparseable string → help shows immediately (fail open: better than
  // hiding help forever when timestamps drift).
  return Number.isFinite(ms) ? ms : 0
}

function renderHelpBlock(): string {
  return `<aside class="waiting-help" data-testid="waiting-help">
        Still searching. Confirm the wired network is connected and that a
        Korri server is reachable on this network, then try again.
      </aside>`
}

function renderBootstrapScript(): string {
  // The bundled polling-loop bootstrap calls `createPollingLoop(...)`
  // and `.start()` on import — see `polling-loop-bootstrap.ts`. The
  // page just has to load it.
  return `<script type="module" src="${POLLING_LOOP_HREF}"></script>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
