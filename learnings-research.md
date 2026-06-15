# Institutional Learnings: Steam Launch Observability

## Institutional Learnings Search Results

### Search Context
- **Feature/Task**: Build first-class Steam launch observability for Korri — a Steam-only parser / tailer / observer / status layer sourced from Bandai Steam log fixtures, preserving raw evidence and Steam facets (AppID, state transitions, Proton chain, readiness signals).
- **Keywords Used**: steam, appid, launch, gamescope, sessiond, lifecycle, observer, observability, log, parse, tail, foreground, device, proton, wrapper, fixture, artifact, nix-ts boundary, runtime-error, sse, heartbeat
- **Files Scanned**: 40 total files across all `docs/solutions/` subdirectories
- **Relevant Matches**: 8 files (strong); 2 files (adjacent/moderate)

---

### Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

### Relevant Learnings

---

#### 1. Steam `content_log.txt` is the canonical AppID launch/exit truth — not process tables

- **File**: `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md`
- **Module**: Korri manual Steam launcher and compositor (`tools/scripts/steam-manual-launch/`)
- **Problem Type**: `runtime_error`
- **Relevance**: The file documents what the team used as the *final acceptance bar* when building repeatable Steam launches — and it is directly the signal that a Steam observability parser should extract. `pgrep`-based readiness was proven wrong; Steam's own log is the ground truth.
- **Key Insight**: Steam writes definitive AppID lifecycle events to `~/.local/share/Steam/logs/content_log.txt` in the form:

  ```
  AppID 2379780 state changed : Fully Installed,App Running,
  AppID 2379780 state changed : Fully Installed,
  ```

  The team validated four consecutive launch/exit cycles by tailing this file — it is the only signal that proved ground truth after pgrep, D-Bus, and process-tree inspection all proved insufficient. Two additional points:

  - **`pgrep -x steam` is not a readiness signal.** It matches the Steam wrapper process before Steam's runtime-launcher service can service game launches. The real readiness gate is the D-Bus name `com.steampowered.PressureVessel.LaunchAlongsideSteam` being owned on the session bus (query via `gdbus call --session … org.freedesktop.DBus.NameHasOwner`).
  - **Cleanup must target `gamescope-wl` and `gamescopereaper`, not just `gamescope`.** `pkill -x gamescope` misses the actual long-running worker processes; leftover processes from prior cycles contaminated later launch observations and made them misleadingly fail.

- **Severity**: high

---

#### 2. Do not treat SSE / transport lifetime as launch lifetime — or a healthy game will be killed

- **File**: `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`
- **Module**: `tools/device/sessiond` + `korri/shared/library/session-launcher`
- **Problem Type**: `runtime_error`
- **Relevance**: This is the most immediately dangerous failure mode for any new observability / log-tailer layer. If the observer interprets a closed log stream or a dropped SSE connection as a launch failure and responds by killing the supervised process, the user sees a healthy game die 15–24 seconds in with no error. This exact failure happened in production.
- **Key Insight**: A supervisor (or observer) **must not infer the state of a supervised process from the liveness of a side-channel used to observe it.** The team's fix has three layers that a new observer must replicate:

  1. **Server-side heartbeats**: emit SSE comment frames (`": hb\n\n"`) every ≤5 seconds so idle-accountants don't close the stream. Applies equally to a log-tailer's SSE/WebSocket or chunked transfer.
  2. **Explicit `idleTimeout: 0`** on the Bun.serve instance that hosts the stream — safety net if a heartbeat is missed.
  3. **Bounded reconnect loop on the consumer side**: treat stream-close as a transport event, not a domain event. Reconnect up to N times (default 5, 200ms apart) before escalating. Domain conclusions (game running / game exited) come only from domain messages (Steam state-change lines, sessiond lifecycle events), not from transport liveness.

  The `si_pid` field in a `strace -e signal=SIGTERM` output was how the team identified the cascade — the signal originated from sessiond's own bun pid, not a driver crash. This is the debugging pattern if something similar happens again.

- **Severity**: high

---

#### 3. Sessiond is the sole foreground lifecycle authority — any observability layer plugs in, not alongside

- **File**: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
- **Module**: `korri/shared/stream` + `korri/products/app/api` + `tools/device/sessiond`
- **Problem Type**: `architecture_pattern`
- **Relevance**: A Steam observability feature that tracks AppID lifecycle must not build a parallel foreground-session authority. The team closed the split-brain between `ForegroundSessionOwner` and sessiond explicitly; adding a new parallel source would re-open it.
- **Key Insight**: The architectural rule is: **sessiond owns the truth about whether the host can launch, what is currently running, and whether the host is back to idle**. Everything else reads sessiond. Concrete rules for the observability feature:

  - The observer reads sessiond's `/managed-launch/status` and `/managed-launch/events` — it does not maintain its own copy of "is the game running."
  - `app.server.status` is the canonical *renderer-facing* proxy for sessiond state (polled at 1 Hz over `/api/rpc`). The renderer should not talk to sessiond directly.
  - Launch rejections are discriminated by `_tag`: `Accepted | PreflightRejected | DaemonRejected | HostUnavailable | LaunchFailed`. `PreflightRejected` further carries `reason.source: 'owner-local' | 'sessiond'`. Do not collapse these into a single error string.
  - **SEC-003**: sessiond's `failureReason` is redacted before it reaches the `app.server.status` wire (absolute paths replaced with `<path>`, clamped to 256 chars). The unredacted version lives in the sessiond-local journal. Build diagnostics against the journal, not the wire payload.

- **Severity**: high

---

#### 4. Sessiond operator map — managed-launch protocol, event sequences, role vocabulary

- **File**: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- **Module**: `tools/device/sessiond` + `korri/shared/library` + `nix/modules` + `nix/images`
- **Problem Type**: `architecture_pattern`
- **Relevance**: The observability layer will consume sessiond's managed-launch protocol. This document is the consolidated operator map of its endpoints, event sequences, identity correlators, and role-specific idle vocabulary.
- **Key Insight**: Critical details for the Steam observability implementation:

  **Protocol endpoints:**
  | Verb | Path | Purpose |
  |---|---|---|
  | `GET` | `/managed-launch/status` | Mode + capabilities + active-launch snapshot |
  | `GET` | `/managed-launch/events` | SSE stream, filterable by `launchId` |

  **Expected foreground launch event sequence:**
  ```
  child-running → (game runs) → child-exited { exitCode, signal }
    → restoring → home-ready | idle-ready
  ```

  **Identity correlator**: `launchId` appears on every event, on the status response, and on busy rejections (`preflightReason.currentSessionId`). Process identity (`processId`, `processGroupId`) is **daemon-private** — the observer correlates by `launchId`, not by PID.

  **Role-specific idle vocabulary:**
  - Kiosk role idle = `home`, terminal readiness event = `home-ready`
  - Source-machine idle = `idle`, terminal readiness event = `idle-ready`

  **Failure stages** (`ForegroundSessionFailureStage`): `prepare | spawn | foreground | exit | teardown | readiness | restore | adapter` — use these exact values in status facets, not ad-hoc strings.

  **Lifecycle vocabulary projection** lives at `korri/shared/library/sessiond-lifecycle-projections.ts` — the canonical place to update mappings from sessiond internal mode/phase to managed-launch status JSON and renderer snapshots. Extend here, not in per-feature switch tables.

- **Severity**: high

---

#### 5. Steam AppID launch architecture on x86 — the `applaunch` path with Gamescope via `LaunchOptions`

- **File**: `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`
- **Module**: Korri Steam launch chain on x86 AKA (`tools/scripts/steam-manual-launch/`)
- **Problem Type**: `architecture_pattern`
- **Relevance**: Defines the actual process tree emitted by a Bandai/AKA Steam launch — exactly what a Steam log parser and process observer needs to understand. Also documents validated timing for each phase (Steam ready, `App Running`, game window visible), which sets expectations for observability thresholds and timeouts.
- **Key Insight**: The verified runtime process tree after `steam -applaunch <appid>` with Gamescope in `LaunchOptions`:

  ```
  gamescope
  └── steam-launch-wrapper
      └── reaper SteamLaunch AppId=<appid>
          └── _v2-entry-point --verb=waitforexitandrun
              └── proton waitforexitandrun <GAME.exe>
  ```

  The Sway tree node at this point is `class=steam_app_<appid>`. Steam itself has **no visible window** (`swaymsg -t get_tree | grep -i steam` returns nothing outside `steam_app_<id>` class).

  **Validated phase timings (warm Steam, AKA x86):**
  | Phase | Elapsed |
  |---|---|
  | `App Running` event in `content_log.txt` after `applaunch` | 5–6 s |
  | Game window appears in Sway tree | 8–10 s |
  | Cold-Steam to game window worst case | ~14 s |

  **`localconfig.vdf` write window**: Steam reads `~/.local/share/Steam/userdata/<steam-id>/config/localconfig.vdf` **once at startup** and clobbers external edits on shutdown (ValveSoftware/steam-for-linux#6443). The safe write window is between `steam -shutdown` (wait for `steamwebhelper` to fully exit, not just the main `steam` process) and the next `steam` start. Mid-session edits are **silently lost**. Use a real VDF parser (Python `vdf` package) for atomic rewrites — not string substitution.

  **Why env mirroring cannot replace a live Steam client**: `SteamAPI_Init` in Proton's `steam.exe` stub requires a live Steam client owned by the same UID, reachable over `~/.steam/steam.pipe`. No combination of environment variables can substitute. If the steam pipe is absent, Steamworks-heavy titles (Sonic Mania) die in ~2 seconds with a clean exit — no crash, no log error. IPC-light titles (Balatro) can survive without it.

- **Severity**: high

---

#### 6. Prefer explicit classification fields over env/argv sniffing heuristics in log parsers

- **File**: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module**: `korri/shared/library/config` + `tools/device/game-stream-fullscreen`
- **Problem Type**: `design_pattern`
- **Relevance**: When a log parser or observer needs to classify Steam launch state, it will be tempted to sniff process names, argv, env vars, or timing to infer what is happening. This pattern documents why that approach fails silently and what to do instead. It has burned Korri three times in different subsystems.
- **Key Insight**: **Make intent explicit; don't sniff.** The pattern: a wrapper or consumer whose behavior depends on knowledge it doesn't own should receive that knowledge as a named, explicitly set field, not infer it from incidental signals.

  Applied to Steam observability:
  - **Don't classify launch state from process presence**: `pgrep`-based readiness is documented as unreliable (matches wrapper process before runtime-launcher service is up).
  - **Don't classify game state from Gamescope window visibility**: a window can disappear or not appear yet while the game is healthy (audio runs, no frames rendered — this was a real failure mode).
  - **Do parse the definitive sources**: Steam `content_log.txt` state transitions and sessiond managed-launch events are the ground truth. These are written by the systems that actually own the knowledge.
  - **Do emit explicit `_tag` facets** on every status object the observer produces — never boolean forests (`isRunning`, `hasWindow`, `isReady`) that require callers to infer the composite state.

  The recurring failure shape: heuristic guesses wrong → no error path → no log line → downstream symptoms observed in production (degraded performance, wrong renderer, wrong state). Explicit fields are inspectable, testable, and traceable to the source.

- **Severity**: medium

---

#### 7. Steam Input needs `/dev/uinput` as `root:input 0660` on Bandai before controller tests are valid

- **File**: `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
- **Module**: `korri-steam` (`product/systems/nixos/modules/korri-steam.nix`)
- **Problem Type**: `integration_issue`
- **Relevance**: If the observability feature includes integration tests using controller-bearing games on Bandai (e.g. 30XX), this is a mandatory precondition. 30XX launched with Vulkan/Freedreno but had non-functional controller input until this was fixed. Steam detecting the physical controller is *not* sufficient — it also needs to create the virtual XInput device via `/dev/uinput`.
- **Key Insight**: Steam Input on Bandai is a two-part path:
  ```
  physical controller → InputPlumber / raw-gamepad hider / Steam detection
    ↓
  Steam opens /dev/uinput → creates virtual XInput → game consumes it
  ```
  Both parts must work. If `/dev/uinput` is `root:root` (the pre-fix state), `chmod 0660` alone is insufficient — the node must be in group `input` and the Korri/Steam user must be in that group. The durable fix is in `product/systems/nixos/modules/korri-steam.nix` (commit `ad343ec`).

  **Validation checklist** before controller-bearing Steam tests:
  ```sh
  ls -l /dev/uinput
  # expect: crw-rw---- root input ... /dev/uinput
  nix build .#checks.x86_64-linux.korri-steam-module
  ```
  Then restart Steam so it reopens `/dev/uinput`, and confirm controls reach the game — not just that Steam detected the physical controller.

- **Severity**: high

---

#### 8. ARM64 Steam log signals and fixture shape (Bandai / ROCKNIX)

- **File**: `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md`
- **Module**: ROCKNIX Steam ARM64 manual game launching (last updated 2026-06-13)
- **Problem Type**: `best_practice`
- **Relevance**: Documents the ARM64-specific process tree, log signals, and observable facts that differ from x86. The observability parser/tailer needs to account for these when running on Bandai (SM8550 / ROCKNIX ARM64).
- **Key Insight**: ARM64-specific facets for a fixture-backed parser:

  **Verified process tree on ARM64 (ROCKNIX + Gamescope SDL/X11 path):**
  ```
  Sway desktop
  ├── Steam desktop UI (steamwebhelper … -uimode=7 -buildid=<id>)
  └── Gamescope (--backend sdl, or wayland) fullscreen window titled "Balatro"
      └── SteamLinuxRuntime_sniper/_v2-entry-point
          └── pressure-vessel-wrap / Box64/FEX path
              └── Proton (10.0 or GE-Proton10-34) compatibility tool
                  └── Balatro.exe (or Game.exe)
  ```

  **Canonical success signals** (same pattern as x86, confirm both appear):
  ```
  AppID 2379780 state changed : Fully Installed,App Running,
  ```
  followed later by:
  ```
  AppID 2379780 state changed : Fully Installed,
  ```

  **Noise vs. signal:**
  - Box64 wrong-ELF-class warnings and `winegstreamer.so` symbol warnings: treat as suspicious but **not fatal** if `<Game>.exe` remains alive.
  - `ntsync: up and running` in early Proton output: normal, not a launch-ready signal.
  - `steamwebhelper … -buildid=0` at startup: ARM64 manifest problem (see `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md`), blocks desktop UI from functioning.

  **ARM64 caveat on `steam -applaunch`**: `steam -applaunch <appid>` and `steam://rungameid/<id>` were documented as **unreliable** on ROCKNIX ARM64 (desktop Steam stayed usable but did not consistently transition Balatro to `App Running`). The working manual path on ARM64 is the nested Gamescope + SteamLinuxRuntime + Proton command chain — not the `applaunch` URL method that works on x86. This is the reason the ARM64 path is excluded from the LaunchOptions/silent-Steam architecture (learning #5).

- **Severity**: medium

---

### Recommendations

1. **Use `content_log.txt` as the primary parse target, not process observation.** Tail `~/.local/share/Steam/logs/content_log.txt` and parse `AppID <id> state changed : Fully Installed,App Running,` as the authoritative `Running` event and the absence of `App Running,` as the authoritative `Stopped` event. This is what the team used as the final acceptance bar across all Steam launch validation work.

2. **Plug into sessiond's managed-launch event stream; do not build a parallel lifecycle source.** The observer should map `content_log.txt` state transitions and process-tree evidence *into* the sessiond managed-launch event vocabulary (`child-running`, `child-exited`, etc.) — not expose a separate "is the game running" truth. Identity correlate by `launchId`, not by PID (PID is daemon-private by design).

3. **Implement heartbeats + `idleTimeout: 0` + bounded reconnect loop before the first production deployment.** The SSE idle-timeout failure (learning #2) was a production defect that killed healthy games. Any long-lived stream (SSE, chunked transfer, WebSocket) must have all three defenses. Treat transport-close as a transport event; escalate only after bounded reconnects fail.

4. **Emit explicit `_tag` discriminated-union status objects from the observer.** Never expose `{ isRunning: boolean, hasError: boolean, … }` boolean forests. Follow the `ForegroundSessionFailureStage` vocabulary (`prepare | spawn | foreground | exit | teardown | readiness | restore | adapter`) for failure phases, and follow the `Accepted | PreflightRejected | DaemonRejected | HostUnavailable | LaunchFailed` vocabulary for launch outcomes. Extend `korri/shared/library/sessiond-lifecycle-projections.ts` for new mappings rather than adding switch tables in the observability layer.

5. **Classify from explicit sources; don't sniff processes or env.** The cascade-policy pattern (learning #6) has burned three separate subsystems. `pgrep`, argv inspection, and env-var sniffing all failed in production. Use `content_log.txt` state transitions and sessiond events as the authoritative inputs; annotate each status emission with the source that drove it.

6. **Verify `/dev/uinput` ownership before any Bandai controller-bearing fixture tests.** Run `ls -l /dev/uinput` (expect `root:input 0660`) and `nix build .#checks.x86_64-linux.korri-steam-module` before running observability tests against a controller-bearing title like 30XX on Bandai (learning #7).

7. **Account for ARM64 vs x86 fixture differences.** On ARM64 (Bandai/ROCKNIX), `steam -applaunch` is documented unreliable; the working path is the nested Gamescope + SteamLinuxRuntime chain. The `content_log.txt` state-transition signal is the same across architectures, but the process tree shape, the presence of Box64/FEX, and the `steamwebhelper -uimode=7` background session differ. When building fixture snapshots, capture both archs separately and label them.

8. **Guard Steam `localconfig.vdf` writes with the shutdown-write-restart sequence.** If the observability feature ever needs to set per-app `LaunchOptions` (e.g., to inject a tracing wrapper), it must write the VDF only while Steam is fully shut down (including `steamwebhelper` fully exited, not just the main `steam` process), use a real VDF parser for atomic rewrite, and then restart. Mid-session edits are silently clobbered on next Steam shutdown.
