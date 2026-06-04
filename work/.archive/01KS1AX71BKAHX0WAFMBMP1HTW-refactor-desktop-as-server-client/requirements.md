---
date: 2026-05-20
topic: desktop-as-server-client
---

# Desktop as a Pure korri-server Client

## Summary

The electrobun desktop stops embedding an in-process API server and becomes a pure renderer that discovers and connects to `korri-server` instances on the LAN. The React shell stays bundle-local; only RPC traffic crosses the network. Today's behavior is single-server (auto-pick first discovered, persist last-connected); the connection layer is shaped so a future multi-server library federation can land without changing the React side. As a sub-cleanup, the headless `korri-server` Nix output stops shipping electrobun's npm files.

---

## Problem Frame

The `korri-server` package and its NixOS module were recently refactored into a boot-scoped system service that owns library state, RPC, and game-stream orchestration on a host like `aka`. The electrobun desktop (`korri/deploy/desktop/main.ts`) predates that work — it still imports `@app/api/hono-app`, mounts the full Hono app under its own `Bun.serve` on `127.0.0.1`, and points the BrowserWindow at that local port.

When a desktop is co-located with a host running the system service (today: aka itself when sitting at it; tomorrow: any device that wants to act as a thin client to a household server), the result is two copies of the same API running side-by-side, with no way to point the desktop at the canonical one. The desktop also can't talk to a server on a different machine — there is no client-side discovery wiring, no configuration surface, and no transport indirection. Library state on the desktop is whatever the desktop's embedded server happens to read from its local filesystem.

A second, smaller pain: the Nix derivation that builds `korri-server` copies the hermetic `bunDeps` `node_modules` into its output verbatim, which includes electrobun's npm files even though the runtime never imports them. The headless server closure carries a desktop-only dependency it never executes.

---

## Actors

- A1. **Desktop user (odin handheld and similar)**: launches the electrobun desktop, expects the library and launch surfaces to "just work" without naming or selecting a server.
- A2. **`korri-server` instance**: announces itself on the LAN via mDNS (`_korri-stream._tcp`) with `caps=stream,source`. May run as a system service on a host like aka or alongside the desktop on the same machine.
- A3. **React shell** (renderer process): consumes the desktop-provided connection boundary to make RPC calls; never sees server URLs, hostnames, or selection state.
- A4. **Desktop bun process** (host): runs discovery, owns the connection state, and exposes the boundary the React shell talks to.

---

## Key Flows

- F1. **Cold boot with no remembered server**
  - **Trigger:** Desktop launched; no `lastConnectedServer` in config.
  - **Actors:** A4, A2, A3, A1.
  - **Steps:** Desktop bun starts mDNS browse for `_korri-stream._tcp`. React shell renders an always-searching state ("Looking for Korri servers…"). When the first candidate appears, desktop bun records it as `lastConnectedServer` and wires the connection boundary to that candidate. React shell transitions out of the searching state and renders the library.
  - **Outcome:** Desktop is connected to a discovered server; config has been persisted.
  - **Covered by:** R1, R2, R4, R5, R6, R8, R10.

- F2. **Cold boot with a remembered server that is reachable**
  - **Trigger:** Desktop launched; `lastConnectedServer` is set and the server is advertising / reachable.
  - **Actors:** A4, A2, A3, A1.
  - **Steps:** Desktop bun starts mDNS browse and shows a brief "Reconnecting to *name*…" state. If the remembered server appears (or responds), desktop bun wires the connection boundary to it directly without waiting for other candidates.
  - **Outcome:** Desktop reconnects to the remembered server with minimal delay.
  - **Covered by:** R3, R5, R6.

- F3. **Cold boot with a remembered server that is unreachable**
  - **Trigger:** Desktop launched; `lastConnectedServer` is set but the server is not on the LAN.
  - **Actors:** A4, A2, A3, A1.
  - **Steps:** Desktop bun briefly attempts the remembered server, then falls through to the always-searching state. mDNS browse stays open. When any server appears, the desktop auto-connects; if the remembered server reappears during discovery, it is preferred over other candidates that arrive in the same window.
  - **Outcome:** Desktop connects to the first server that becomes available, preferring the remembered one when present.
  - **Covered by:** R3, R5, R6, R7, R10.

- F4. **Cold boot with no server reachable for an extended time**
  - **Trigger:** Desktop launched; nothing on the LAN is advertising.
  - **Actors:** A4, A3, A1.
  - **Steps:** Always-searching state persists. Discovery continues in the background. After a delay (~30s), help text appears suggesting the user check that a server is running on the LAN. No timeout, no error wall, no retry button — the desktop auto-connects the moment a server appears.
  - **Outcome:** Desktop remains in a searching state indefinitely until a server is found.
  - **Covered by:** R7, R8.

---

## Requirements

**Desktop runtime shape**
- R1. The electrobun desktop binary does not start an in-process API server. The current `Bun.serve` mount of the Hono app is removed.
- R2. The desktop bun process discovers servers via the existing mDNS service type `_korri-stream._tcp` using the project's discovery primitives.
- R3. The desktop bun process maintains a stable connection boundary that the React shell talks to. Server identity, URL, and selection state are invisible to the React shell.
- R4. The connection boundary is shaped so that today's single-server behavior is the N=1 case of a future N-server federation. Adding federation later must not require changes on the React side of the boundary.

**Connection lifecycle and selection**
- R5. When the desktop has no `lastConnectedServer` recorded, it auto-connects to the first server discovered.
- R6. When the desktop has a `lastConnectedServer` recorded, it briefly tries that server first; if it appears during discovery, it is preferred over other candidates.
- R7. If a remembered server is unreachable, the desktop falls through to general discovery and connects to whatever appears, without surfacing the failure as an error state.
- R8. When no server is reachable, the desktop shows an always-searching state that never times out. Discovery runs continuously. Help text appears after a delay (~30s) to suggest checking the LAN. The desktop auto-connects the moment a server appears.

**Configuration**
- R9. Desktop configuration is persisted as YAML. The config file location follows XDG conventions and contains at minimum a `lastConnectedServer` record (identifier and control URL or equivalent address).

**Server package cleanup**
- R10. The headless `korri-server` Nix derivation does not ship electrobun's npm files in its output. `bunDeps` continues to include electrobun for the desktop derivation; only the server output is cleaned.

---

## Acceptance Examples

- AE1. **Covers R1, R3.** Given the desktop is running and connected to a server, when you inspect the desktop process's listening sockets, no `Bun.serve` or Hono `/api/*` listener is bound on `127.0.0.1`. RPC traffic from the React shell reaches the discovered server, not a local process.
- AE2. **Covers R5.** Given a fresh install with no `lastConnectedServer` and exactly one `korri-server` advertising on the LAN, when the desktop boots, it connects to that server without prompting and persists it as `lastConnectedServer`.
- AE3. **Covers R6.** Given `lastConnectedServer` points at server `A` and both `A` and `B` are advertising at boot, when the desktop discovers both, it connects to `A`.
- AE4. **Covers R7.** Given `lastConnectedServer` points at server `A` which is not on the LAN, and server `B` is advertising, when the desktop boots, it connects to `B` without showing an error.
- AE5. **Covers R8.** Given no server is advertising at boot, when the desktop runs for a minute, the searching state remains loud and the help text has appeared. When a server starts advertising at any later time, the desktop connects automatically without user action.
- AE6. **Covers R10.** Given a `korri-server` derivation has been built and installed, when you inspect the installed `node_modules` directory under the server's share path, no `electrobun/` package is present.

---

## Success Criteria

- A desktop launched on the same host as a system `korri-server` shows exactly one API process listening (the server's), and the library/launch flows in the desktop are powered by the server's state.
- A desktop launched on a host with no `korri-server` instance presents a clear, calm "looking for servers" experience that resolves automatically when a server appears — without retry friction.
- The `korri-server` Nix derivation closure no longer contains electrobun's npm files.
- A planner picking up this brainstorm has enough to choose a transport for the React-to-host boundary (electrobun IPC vs in-process RPC dispatcher) without needing further product input.
- Adding multi-server federation later does not require revisiting the React shell's calling conventions.

---

## Scope Boundaries

- Server-hosted React shell (the desktop loading the UI from `korri-server` over HTTP) is rejected outright. The React shell ships in the desktop bundle.
- Splitting `bunDeps` into headless/desktop variants, marking electrobun as `optionalDependencies`, or restructuring the npm workspace are not in scope. R10 is satisfied by stripping in the Nix derivation.
- Per-server pairing, TLS, signed mDNS TXT records, or any other transport security work is out of scope for this brainstorm.
- The actual multi-server federation implementation (library merge, ID-collision policy, partial-failure semantics, federated launch routing) is deferred. Only the indirection that makes federation possible is in scope here.
- Manual server entry, server picker UI, and any user-facing server-selection surface are deliberately excluded.
- No changes to `korri-server.ts`, the NixOS server module, the game-stream runner, RPC schemas, or RPC handlers. The server side is unchanged.
- The existing CLI tools that already perform their own discovery (`tools/cli/source-aware-play.ts`, `tools/cli/remote-stream-launch.ts`, etc.) are not modified.
- Visual design of the "looking for servers" state (exact copy, animation, help-text content) is left to implementation. R8 fixes the behavioral shape, not the visual treatment.

---

## Key Decisions

- **Hard cut, not soft fallback.** The embedded `Bun.serve` is removed outright rather than kept as a fallback. Rationale: a soft fallback would leave electrobun coupled to the full API surface forever and would mask deployment misconfigurations (desktop silently running standalone when it was supposed to be a client).
- **React shell stays bundle-local.** The desktop loads the UI from its own bundle, not from the server. Rationale: a network blip should not leave the user with a blank window; UI release cadence stays per-device, not per-server.
- **Federation indirection lands now, federation logic does not.** The connection boundary is designed for N servers from day one; today's implementation behind it serves N=1. Rationale: avoids a later React-side refactor and lets the federation work proceed as a host-process-only change.
- **Auto-pick first found + persist last-known + prefer last-known on re-discovery.** Avoids any server-selection UI today while staying robust to a remembered server temporarily disappearing.
- **Always-searching, no timeout.** mDNS browse stays open at near-zero cost; an idle desktop that becomes useful the moment a server appears is a better experience than a retry button.
- **YAML for desktop config.** Matches the project's existing YAML libraries (`games.yaml`, `launcher-profiles.yaml`, `launch-targets.yaml`).
- **Strip electrobun in the Nix derivation, don't restructure npm.** One-line change in the server's `installPhase`; no workspace topology disruption.

---

## Dependencies / Assumptions

- The existing mDNS discovery primitive in `tools/cli/lan-stream-discovery.ts` is reusable from the desktop bun process. The discovery API surface (a single `discoverStreamHosts` call returning candidates with `controlUrl`) is treated as adequate; if the always-on browse model needs a streaming-callback API instead of a one-shot promise, that adaptation is a planning concern, not a product gap.
- `korri-server` advertises with a `controlUrl` TXT record (or equivalent address derivation) sufficient for an HTTP-RPC client. This is already true.
- The Effect-RPC schemas the React shell consumes are stable enough that swapping the transport (today: local `fetch` to `/api`; tomorrow: host-mediated boundary) does not require schema changes.
- `bunDeps` continues to require electrobun for the desktop derivation. The cleanup only affects the server output.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3, R4][Technical] Transport for the host ↔ React-shell boundary: electrobun's `webview.rpc` IPC vs a loopback HTTP/RPC dispatcher inside the desktop bun process. Both can satisfy the scope; the choice depends on Effect-RPC transport options and electrobun's IPC ergonomics.
- [Affects R8][UX] Exact delay, copy, and visual treatment of the always-searching state and the LAN help-text affordance.
- [Affects R6][Technical] How quickly the "try the remembered server first" attempt yields to general discovery (e.g., is it a probe with a short timeout, or just a "prefer this if it appears within N ms" rule).
- [Affects R9][Needs research] Exact YAML config schema beyond `lastConnectedServer` (e.g., should it carry a hint for future federation preferences, last-known-good capabilities, etc.).
- [Affects R10][Technical] Whether the strip happens via a single `rm -rf` in `installPhase` or via a small derivation helper, and whether any other unused packages should be stripped at the same time.
