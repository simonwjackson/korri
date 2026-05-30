---
title: Sessiond SSE stream killed by Bun.serve default idleTimeout phantom-SIGTERMed live launches
date: 2026-05-27
category: runtime-errors
module: tools/device/sessiond + korri/shared/library/session-launcher
problem_type: runtime_error
component: tooling
symptoms:
  - "Gamescope appeared to crash 15-24 seconds into every healthy launch with no error in gamescope's own logs"
  - "strace on the gamescope process group showed `SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=<sessiond pid>}` — the supervisor killed its own supervised process"
  - "Bun runtime logged `[Bun.serve]: request timed out after 10 seconds. Pass 'idleTimeout' to configure.` immediately before the kill"
  - "session-launcher observer reported `sessiond event stream ended before readiness` then called `failAndRelease('readiness')` even though sessiond and the game were both healthy"
  - "Sessiond received a `POST /managed-launch/terminate` from the launcher and ran `killGroup('SIGTERM')` on the live process group with no user input"
root_cause: config_error
resolution_type: code_fix
severity: high
related_components: [sessiond, library/session-launcher, bun-serve, sse-event-stream, gamescope]
tags: [sse, bun-serve, idle-timeout, heartbeat, long-lived-connection, sessiond, session-launcher, supervisor]
---

# Sessiond SSE stream killed by Bun.serve default idleTimeout phantom-SIGTERMed live launches

## Problem

A healthy game launch was being killed by its own supervisor roughly 15–24 seconds after start. Bun's default 10s HTTP `idleTimeout` closed the long-lived `/managed-launch/events` SSE stream during quiet periods; the launching server's observer treated stream-close-before-terminal-event as a launch failure and asked sessiond to terminate the still-running gamescope process group. From the user's seat this looked like "gamescope crashes ~15-24s into every launch."

## Symptoms

- Users reported gamescope "crashing" 15–24 seconds into an otherwise healthy launch, even though the game window had rendered and was idle. Timing varied because of intermediate awaits between SSE close and the eventual terminate call.
- `strace -e signal=SIGTERM,SIGKILL,SIGABRT` on the gamescope pid showed the signal coming from sessiond itself:

  ```
  02:00:13.080300 --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=2404, si_uid=0} ---
  ```

  Pid 2404 was sessiond's own bun process. The `si_pid` field was the breakthrough — it redirected the investigation from the renderer to the supervisor.
- Bun emitted its diagnostic immediately before the kill:

  ```
  [Bun.serve]: request timed out after 10 seconds. Pass 'idleTimeout' to configure.
  ```

- Sessiond journal showed the terminate path firing on its own initiative: an inbound `POST /managed-launch/terminate` from the launcher chain, followed by `killGroup('SIGTERM')` on the launch's pgid, with no user input and no upstream failure event.
- The observer-side log line `sessiond event stream ended before readiness` appeared seconds before the kill — i.e. the "failure" was a transport close, not a game-state event.

## What Didn't Work

- **Mali/Adreno driver instability hypothesis.** The SM8550 device runs freedreno (Mesa 25.2.6) and Mali bugs on gamescope looked plausible. Coredumps couldn't be captured because RockNix had `kernel.core_pattern = |/bin/false` and `sysctl -w` was locked down. The driver was actually fine; the SIGTERM was external.
- **Gamescope-on-Mali sharp edges.** Open upstream issues exist but none reproduced locally and none matched a process-group SIGTERM signature originating from a known pid.
- **Sessiond watchdog / cgroup limits.** Verified `MemoryMax=infinity`, `RuntimeMaxUSec=infinity`, `TasksMax=9238`. No systemd-side limit was firing. Same for OOM cgroups — no oom-kill in the journal.
- **Screensaver / DPMS chain.** sway is not idle-aware in this kiosk config; nothing in the compositor path could have asked for a terminate.
- **Qt thread warning inside gamescope.** Flagged in an earlier handoff as suspicious. Benign — gamescope logs it during normal startup and the timing didn't line up.
- **`--synchronous-x11` diagnostic.** Changed gamescope's timing enough to mask the original SIGTERM-at-T+24s symptom but exposed a separate visibility issue (audio without display), which reinforced the false "driver" reading and delayed finding the real cause.

The breakthrough was the `si_pid` field in the strace SIGTERM record pointing back at sessiond's own bun pid. From there, reading `tools/device/sessiond.ts` revealed `Bun.serve` was using defaults; reading `observe()` in `korri/shared/library/session-launcher.ts` revealed it treated stream-end-before-terminal-event as a launch failure; reading sessiond's terminate handler showed it called `killGroup('SIGTERM')` on the pgid. The causal chain became deterministic.

## Solution

Three layers, all in commit `f6783e2`:

### 1. Sessiond emits SSE heartbeats on the lifecycle event stream

In `tools/device/sessiond.ts`, every `/managed-launch/events` subscriber gets a `setInterval` that writes an SSE comment frame (`: hb\n\n`) on the stream. Comments are ignored by SSE parsers but count as traffic for HTTP idle accounting. Configurable via a new `heartbeatIntervalMs` option (default 5 seconds — comfortably below the 10s Bun default and below any sane intermediate proxy idle timeout).

```ts
const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000
const heartbeatPayload = new TextEncoder().encode(": hb\n\n")
// ...
const heartbeat = setInterval(() => {
  try {
    controller.enqueue(heartbeatPayload)
  } catch {
    // Controller already closed; the close path clears the
    // interval, but a race can deliver one final tick.
  }
}, heartbeatIntervalMs)
subscriber = { launchId, controller, heartbeat }
lifecycleSubscribers.add(subscriber)
// cancel path:
//   lifecycleSubscribers.delete(subscriber)
//   clearInterval(subscriber.heartbeat)
```

### 2. `Bun.serve` declares `idleTimeout: 0` as defense in depth

Same file, at the server construction site. Heartbeats are the correctness mechanism; disabling the idle timeout is the safety net so a missed heartbeat (GC stall, event-loop blocked, future Bun default change) cannot reproduce the original close.

```ts
const server = Bun.serve({
  port: options.port ?? DEFAULT_PORT,
  hostname,
  // The /managed-launch/events SSE stream is intentionally long-lived
  // for the duration of a launch. Heartbeats (see `lifecycleEventStream`)
  // keep most idle windows healthy, but a closed stream is misread by
  // observers as a launch failure and triggers a SIGTERM cascade. The
  // explicit policy here is "this server does not time out idle
  // connections" -- heartbeats are correctness, this is safety net.
  idleTimeout: 0,
  fetch: request => core.handleRequest(request),
})
```

### 3. `observe()` becomes a bounded reconnect loop

In `korri/shared/library/sessiond-managed-launch-event-observer.ts` (originally embedded in `korri/shared/library/session-launcher.ts`). The previous observer ran a single `for await (const event of readSseEvents(...))` and, on clean stream end without a terminal event, called `settleFailure('sessiond event stream ended before readiness')`. The observer contract now splits one stream consumption (`consumeEventStream`, which returns `true` when a terminal event settled the launch and `false` when the stream closed without one) from an outer reconnect loop. Sessiond's existing event replay covers events emitted during the reconnect window.

```ts
const DEFAULT_EVENT_STREAM_MAX_ATTEMPTS = 5
const DEFAULT_EVENT_STREAM_RECONNECT_DELAY_MS = 200

const observe = async () => {
  // Reconnect-tolerant observation. An idle HTTP timeout on either
  // side closes the SSE stream; that is an observability event, not a
  // launch outcome. We retry the events fetch a bounded number of
  // times before settling as failure. Sessiond replays buffered
  // events on reconnect so we never miss a terminal signal that
  // arrived during a reconnect window.
  let attempts = 0
  let lastError: string | undefined
  while (!resultSettled && attempts < DEFAULT_EVENT_STREAM_MAX_ATTEMPTS) {
    attempts += 1
    try {
      const settled = await consumeEventStream()
      if (settled) return
      lastError = "event stream ended before readiness"
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (resultSettled) return
    if (attempts < DEFAULT_EVENT_STREAM_MAX_ATTEMPTS) {
      await new Promise<void>(resolve =>
        setTimeout(resolve, DEFAULT_EVENT_STREAM_RECONNECT_DELAY_MS),
      )
    }
  }
  if (!resultSettled) {
    settleFailure(
      `sessiond event stream unavailable after ${attempts} attempts: ${lastError ?? "unknown"}`,
    )
  }
}
```

## Why This Works

The root cause is a category error: **observability lifetime was treated as launch lifetime.** The SSE connection from launcher to sessiond is a transport detail — its lifetime is governed by HTTP idle timeouts, kernel TCP behavior, GC pauses, intermediate proxies, and network blips. The launch lifetime is governed by the supervised process group and the lifecycle events sessiond emits about it. The two have nothing to do with each other, but the original `observe()` collapsed them: "stream closed" was promoted to "launch failed," which was promoted to "send SIGTERM to the process group." A quiet, healthy game was the worst case, because quietness is exactly what triggered the idle timeout.

The three layers defend at three different scopes:

1. **Heartbeats** fix the proximate cause — Bun's idle accountant now always sees traffic on a healthy launch, so the connection isn't closed in the first place.
2. **`idleTimeout: 0`** removes the timer entirely on the supervisor side, so even a missed heartbeat (event-loop stall, GC pause, scheduling glitch) cannot reproduce the original close.
3. **Reconnect loop** removes the false equivalence at the consumer side. Even if a future deployment introduces an intermediate proxy with its own idle timeout, or the OS resets the TCP connection, the observer treats a closed stream as a transport event and resubscribes. Only a sustained inability to reach sessiond (5 failed attempts at 200ms apart) escalates to a launch failure — and even then, the decision is made on transport health, not on the absence of game-state events.

The general principle: a supervisor must not infer the state of a supervised process from the liveness of a side-channel used to observe it. Side channels can fail independently and frequently; processes cannot.

## Prevention

Tests that ship with the fix:

- `tools/device/sessiond.test.ts` — **"emits SSE heartbeats so a quiet long-running launch keeps the stream alive"**. Opens an events stream with a small `heartbeatIntervalMs`, lets several intervals tick on a quiet launch, then asserts the streamed body contains `: hb\n\n` comments. Locks in that idle launches keep emitting SSE comments.
- `korri/shared/library/sessiond-managed-launch-event-observer.test.ts` — **"reconnects when the event stream closes before a terminal event"**. The harness `fetchImpl` answers the first `/managed-launch/events` request with a non-terminal event and then closes; the test asserts the observer issues a second `/managed-launch/events` request rather than settling the launch as failed.
- `korri/shared/library/sessiond-managed-launch-event-observer.test.ts` — readiness-timeout, rejected-stream, `home-ready`, `idle-ready`, `recovering`, wait-monitor, and anchored-session scenarios. These pin the observer module as the home of the client-side SSE/reconnect/readiness state machine, while `session-launcher.test.ts` keeps integration coverage that the launcher delegates to it correctly.

General principle for any long-lived HTTP / SSE / WebSocket channel that feeds supervisor decisions:

1. The server side emits keep-alive traffic on a cadence shorter than every plausible intermediate idle timeout (Bun.serve default, reverse proxies, load balancers, kernel TCP keepalive).
2. The server explicitly disables HTTP idle timeouts on that route (or on the whole server when no route is short-lived). The default is wrong for long-lived endpoints; silence about it is the bug.
3. The client treats transport close as a transport event, not a domain event. Domain conclusions come from domain messages, with a bounded reconnect/escalation policy for transport failures.

Reviewer rule: when you see `Bun.serve(...)` — or any equivalent `http.createServer`, `serve`, `listen` call — that hosts a long-lived stream (SSE, WebSocket, chunked transfer, long-poll), require an **explicit** `idleTimeout: 0` (or the platform equivalent) and a documented keep-alive strategy at the application layer.

## Related Findings From the Same Investigation

Two corollary bugs were uncovered while diagnosing this and shipped in the same trunk arc. They are separate problems with separate fixes; mentioned here for traceability.

- **Bug #2 — gamescope `--backend auto` fights the outer compositor for DRM master.** `composeGamescopeLaunchSpec` emitted `gamescope -f -b -- <child>` with no `--backend`. Auto-detect picked `drm`, and on a sway-hosted kiosk that meant DRM master contention (`[libseat] Could not make device fd drm master: Device or resource busy` in a loop). Game audio ran through pipewire correctly but no frames reached the panel. Fix: first-class `GamescopePolicy.backend` field; default `backend: "wayland"` for nested deployments. Commit `0854900`.
- **Bug #3 — `launchesNativeWaylandChild` heuristic mis-routed wayland-capable children through XWayland.** `--expose-wayland` was added or omitted by sniffing child env (`SDL_VIDEODRIVER`, `WAYLAND_DISPLAY`, `-platform wayland` in argv). RetroArch with `video_driver = "wayland"` in `retroarch.cfg` didn't match the heuristic, silently routed through XWayland → GLX → freedreno. Fix: first-class `GamescopePolicy.exposeWayland` field; heuristic deleted; moonlight-launcher opts in explicitly when its argv includes `-platform wayland`. Commits `0854900` + `5343ae4`.

Both share a theme with the primary bug: **be explicit about contracts; don't sniff, don't lean on framework defaults that work in the easy case but corrupt the hard one.**

## Related

- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — sibling. The runtime contract this fix extends; the home of the empirical-fixes table that should grow a row for this defect.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` — precedent. Origin of the sessiond observer contract that this transport defect was silently breaking.
- `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md` — sibling. Same `korri-server` Bun.serve process, same shape: upstream default silently breaks a long-lived contract while systemd reports the unit active.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — sibling. Shared invariant: don't let transport / restart / timing artifacts silently corrupt the launch contract.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` — contrast. Symptomatic look-alike (game came up then died unexpectedly) with a different root cause; a useful "this is not that" pointer.
