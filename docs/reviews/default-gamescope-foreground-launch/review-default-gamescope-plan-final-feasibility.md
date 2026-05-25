# Final feasibility review — default Gamescope foreground launch plan

## P1 — Two-host launches do not define how local Moonlight policy composes with remote runner policy

**Confidence:** 75

The revised plan still has a blocking architecture gap for the remote-stream path: it says each host's existing `global` config is the host-machine default, but then makes the local Moonlight wrapper use policy returned by the remote prepare call. In the current desktop flow, that prepare call is executed against the connected upstream host, then Moonlight is launched on the local kiosk/client host. Without a plan-level policy-composition rule, a local host-machine opt-out for Sobo Moonlight cannot work unless the remote source host's game library config happens to encode Sobo's client policy.

Evidence:

- The plan defines the host-machine default as local to a host: “**Host-machine default:** represented by the current host's `global` config.”
- The plan also decides: “Carry resolved policy back to local launchers on remote prepare: Local Moonlight needs the same resolved policy as the remote intent...”
- Current desktop composition prepares on the remote host, then launches Moonlight locally: `korri/deploy/desktop/main.ts` constructs `createRemoteStreamControlClient(controlUrl)` and calls `client.prepareGame(id)`, while `korri/deploy/desktop/launch-bridge.ts` then calls `options.launchMoonlight({ host: moonlightHostForConnection(connection) })`.
- The remote prepare client calls the upstream server RPC: `korri/products/app/stream/remote-stream-client.ts` invokes `client["app.server.stream.prepare"]({ id: gameId })`; the server handler resolves and enqueues on that host via `prepareStreamLaunch(payload.id)` in `korri/products/app/api/server/prepare.rpc-handler.ts`.

Impact: this would force the implementer to invent a major architectural decision the plan should make: whether Gamescope policy has one shared scope or separate scopes for the remote game runner and the local foreground client, and how local host defaults merge with remote game/preset opt-outs. It directly affects R3/R4/R5/R8 because the local Moonlight app is a foreground launch surface, but the proposed data flow does not consult the local host's global opt-out.

Required plan fix: define the two-host policy model explicitly. For example, remote runner policy can be resolved by the upstream source host, while local foreground-client policy is resolved on the kiosk/client host from its own global/launcher defaults, with any remote game/preset contribution merged only if the plan defines that as intentional and gives precedence rules. Then assign implementation units/files for that local policy resolution and merge point.
