# Feasibility Review: stream startup/preflight/handoff plan

## P1 — Add a real launch/RPC boundary contract before U2/U4

The plan treats `floor..startup..ceiling` as the source of launch intent, but the RPC/control surfaces that the portal and remote-source path use cannot carry that intent today. `LaunchLibraryPayload` only has `override`, `ControlLaunchRequest` only has `override`, and `EphemeralOverride.moonlight.stream` only allows scalar `bitrateKbps`, `fps`, and `resolution` fields. In the portal remote-source implementation, `handleRemoteSourceLaunch` composes Moonlight from `localPolicy.moonlight` and registers runtime control without passing `adaptiveBoundaries`, so startup boundaries parsed in CLI code would not apply to that path.

Evidence:
- `product/apps/portal/api/library/launch.rpc.ts:20-28`
- `product/platform/control/control-requests.ts:10-18`
- `product/platform/library/config/ephemeral-override.ts:78-82`
- `product/apps/portal/api/library/launch.rpc-handler.ts:533-543`, `:603-607`
- `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts:76-93`

Suggested fix: make U2 explicitly introduce one schema-backed stream quality policy field, e.g. structured `streamBoundaries` or `streamBoundaryArgs`, on `ControlLaunchRequest`, `LaunchLibraryPayload`, `RemotePrepareOptions` if needed, and the launch RPC schemas. Then build a shared `composeMoonlightStartupPolicy(boundaries, foldedMoonlightPolicy, preflight?)` helper used by both `launchMoonlight()` and `handleRemoteSourceLaunch()` / `composeMoonlightLaunchSpec()`, and pass the same `adaptiveBoundaries` into `registerMoonlightControlRuntimeSession()` for portal remote-source launches.

## P1 — Define cleanup/order for preflight-required failure after source prepare

The current remote-source launch sequence prepares the source before local Moonlight launch composition. `prepareStreamLaunch()` writes a `next-launch.json` intent. If U4 runs a required preflight after that prepare step and rejects the launch, the source-side launch intent remains queued until claimed or aged out, so a later Moonlight connection can launch stale content.

Evidence:
- `product/apps/portal/api/library/launch.rpc-handler.ts:416-434` prepares the peer before local Moonlight composition.
- `product/apps/portal/api/stream/prepare.rpc-handler.ts:104-109` enqueues the launch intent.
- `product/services/device/game-stream-launch-intent.ts` exposes `enqueue`/`claim`, but no cancel/delete operation for an unclaimed prepared intent.

Suggested fix: move network preflight before `app.server.stream.prepare` when it only needs peer reachability/probe facts, or add a source-side cancel/cleanup RPC keyed by the returned `sessionId` and call it on required-preflight rejection and local launch-composition failure. Add a test that a required preflight failure leaves no pending source intent.

## P2 — Add an event-driven health hook for “before next tick” downshift

U5 says the runner should interrupt normal tick cadence when early-downshift evidence appears, but the current runner only evaluates inside `tick()` / `setInterval`, and `StreamHealthMonitor` only exposes `latestSummary()`. With the default adaptive tick interval, U5 cannot satisfy “before the next scheduled tick” without adding a new event seam.

Evidence:
- `product/platform/stream/stream-adaptive-runner.ts:76-103` computes decisions only on scheduled/manual ticks.
- `product/platform/stream/stream-health-monitor.ts:22-39` ingests samples internally and exposes no `onSample`/`onSummary` subscription.

Suggested fix: add an explicit monitor subscription or runner trigger, e.g. `StreamHealthMonitor.onSample` / `onSummary` or `StreamAdaptiveRunnerOptions.onUrgentSignal`, and gate it through the same pending-command serialization path. Include duplicate-suppression/stabilization tests so event-driven downshift cannot create command storms.
