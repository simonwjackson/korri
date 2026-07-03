---
title: "refactor: Unify the korri-cli surface and exit-code contract"
type: refactor
status: active
date: 2026-07-03
verify_command: "just typecheck && just test-unit && just lint"
---

# refactor: Unify the korri-cli surface and exit-code contract

## Summary

Collapse the `korri` CLI's transport-split verbs into a single `launch` (streaming
becomes an invisible implementation detail), unify the meaning of `--host`, adopt
"prompt when ambiguous" as the one selection mechanism for box/release/app/profile,
move the confirmation prompt off the verb and onto the consequence ("this will close
a running game"), and replace three competing exit-code schemes with one canonical
0–10 (plus 130) table that every command reads from a shared seam. The plan sequences
behavior-preserving cleanups first, then the shared reporting/exit-code seam, then the
user-facing surface redesign, so each observable-behavior change lands in a small,
reviewable step.

---

## Problem Frame

Today the CLI is three tools wearing one name. Running a game has three verbs
(`launch`, `play`, `stream launch`/`stream remote-launch`) whose choice depends on
transport, so the mental model flips between "verb" and "namespace". `--host` means
"control that machine" on some commands and "stream from that machine" on others.
Naming toward a specific game has three different grammars. Exit codes are defined
independently in four-plus files with three different numbering philosophies, and the
same human failure ("game not found") returns different numbers depending on which
command produced it — a live, user-facing inconsistency. Each new command reinvents
its own printing + numbering, so the surface drifts a little more with every addition.

---

## Requirements

- R1. One top-level `launch` verb runs a game regardless of where it physically runs; `play`, `stream launch`, and `stream remote-launch` are removed and their behavior folded into `launch`.
- R2. Prompt-on-ambiguity is the single selection mechanism: when a selectable dimension is unspecified **and** the resolver reports it as required, `launch` prompts interactively; the matching flag skips the prompt; no TTY + no flag yields the `ambiguous` outcome rather than a silent default. Today only **box** and **release** surface a required-signal (`ReleaseRequired`), so those prompt; `--app-id`/`--profile-id` are honored as pre-selection but cannot yet trigger a prompt (no platform signal exists) — the shared prompt path accepts them the moment the platform reports them.
- R3. `--host` has exactly one meaning — "a Korri machine on the network" — used identically on `games`, `launch`, and `session`.
- R4. Naming follows Rule A: plural for collections you browse (`games`, `artifacts`), singular for subsystems you operate (`session`, `stream`, `scout`).
- R5. Confirmation follows consequence, not verb: `launch` prompts only before an action reported to **terminate** a running game; `--yes` skips it. Multi-game futures turn the prompt off without CLI changes.
- R6. `stream` retains only the live-tuning verbs (`show`, `bitrate`, `fps`, `resolution`) that adjust an already-running stream.
- R7. One canonical exit-code table (0–10 plus 130), defined once and consumed by every command; it replaces every ad-hoc per-command mapping.
- R8. Every command reports through one `outcome → (text, exit code)` seam instead of printing and numbering inline.
- R9. Duplicated CLI helpers (error-message formatting, remote-client fallback, interactive game picking) exist exactly once.

**Origin actors:** operator at a terminal (local box), operator targeting a remote box.
**Origin flows:** run a game (local or streamed), find/list games, inspect/stop a session, tune a live stream, scout/import content.

---

## Scope Boundaries

- Only the `korri` CLI surface under `product/surfaces/terminal/korri-cli/` is in scope. Platform/control/library/stream services are consumed as-is; no new platform contracts are introduced.
- No change to the RPC wire protocol, the control-result ADTs, or sessiond behavior.
- No new streaming/latency selection logic — "prompt on ambiguity" now; latency-ranked auto-pick is explicitly future.
- `bazzar`, `scout`, and `artifacts` command *behavior* is unchanged; they are only touched where they consume the shared exit-code/reporting seam and to confirm Rule A naming already holds.

### Deferred to Follow-Up Work

- **Latency-ranked / preference-based box auto-selection**: replaces the box-ambiguity prompt later; the resolver seam in U5 is designed to accept it without a rewrite.
- **Session-layer "will-terminate" signal**: U7 reads `sessionStatus()` to infer termination interim; a first-class control-layer signal is a later platform change and would let the prompt logic drop its inference.
- **`foreground-session-status` standalone binary** (`foreground-session-status.ts`, codes 20/30): a separate tool with its own `import.meta.main`, not wired into `korri`. Fold it onto the canonical table in a follow-up rather than expanding this plan's blast radius.
- **Multi-game suspend/switch**: the consequence-driven confirmation (R5) is the forward-compatible hook; the actual concurrent-session capability is out of scope here.
- **App/profile required-signals**: no `AppRequired`/`ProfileRequired` exists in the platform today (only `ReleaseRequired`). `--app-id`/`--profile-id` work as pre-selection now; prompting-when-required for those two dimensions is a later platform change that plugs into U6's generic path.

---

## Context & Research

### Relevant Code and Patterns

- `product/surfaces/terminal/korri-cli/korri-cli.ts` — command tree, runtime layer wiring, inline input validation, `controlForHost`/`streamQualityIo` helpers, the two run shapes (Effect+renderer vs `Effect.promise(async …)`).
- `product/surfaces/terminal/korri-cli/control-renderers.ts` — the clean pattern to converge on: result ADT → `render*` + `*ExitCode` pair. Uses sysexits-flavored numbers (64/78/121/124/75).
- `product/surfaces/terminal/korri-cli/stream-launch.ts`, `remote-stream-launch.ts`, `source-aware-play.ts` — the three hand-rolled "pick a game, handle outcomes, print, return a number" flows with duplicated `errorMessage`, `exitCodeForPrepareFailure`, and client-fallback helpers; small ad-hoc codes (2–6, 130).
- `product/surfaces/terminal/korri-cli/stream-quality.ts` — the live-tuning IO the retained `stream` verbs use.
- `product/platform/control/control-results.ts` — `ControlSessionStatusResult.active` (`launchId`, `gameId?`, `title?`) grounds the confirmation prompt; launch result ADT (`Launched`/`PreflightRejected`/`DaemonRejected`/…).
- `product/platform/library/launch-state.ts` — already models `Launchable` / `ReleaseRequired` / `NotLaunchable`, the hook for release prompting.
- `product/platform/stream/lan-stream-discovery.ts` — `discoverStreamHosts` used for remote resolution.
- `product/surfaces/terminal/korri-cli/source-aware-games.ts` — local+remote entry merge already exists; reuse for the unified `launch` resolver rather than re-deriving.

### Institutional Learnings

- `docs/solutions/` has no prior CLI-surface refactor writeup; this plan introduces the first canonical exit-code contract. Capturing the table as a durable reference (U9) is the compounding artifact.

### External References

- Bash/POSIX reserved exit-code ranges (0–2 conventional, 3–125 free, 126–165 + 255 reserved, 128+n signals) validated in-session; the canonical table stays in the safe zone and reuses only conventional codes (0/1/2/130).

---

## Key Technical Decisions

- **Exit codes are a public contract, changed deliberately.** ~40 test assertions, the `pi-korrid-tools` docs, and `korri-cli.nix` depend on today's numbers. The change is intentional (systemic consistency), so tests are updated *as the spec* alongside each migration, never silently.
- **One shared reporting seam over per-command printing.** A single `CliOutcome` ADT + renderer maps outcome → text + code, so no command invents numbers. This is the seam that also kills the two-command-shapes split.
- **Prompt-on-ambiguity is one mechanism applied four times** (box, release, app, profile), not four bespoke flows. The resolver returns "need a choice" and a single picker path handles all four.
- **Confirmation is derived from session state, not hardcoded to `launch`.** The CLI asks "what happens to the current session?" (via `sessionStatus()` interim) and prompts only on "would terminate". Keeps the multi-game future free of CLI edits.
- **Rule A naming is already satisfied** by the current tree (`games`/`artifacts` plural; `session`/`stream`/`scout` singular). The work is ratifying and documenting the rule, plus deleting `play` — not renaming existing verbs.
- **Streaming as implementation detail** means the resolver decides local-run vs stream after the box is known; the user never types "stream" to play.

---

## Open Questions

### Resolved During Planning

- Automatic vs explicit box selection: **prompt on ambiguity now**, `--host` to skip, latency auto-pick deferred.
- Release/app/profile precision: **all flags available**, prompt when unspecified and needed.
- Plural vs singular: **Rule A**.
- Confirmation trigger: **session-reported termination**, `--yes` skips.
- `--host` naming: keep **`--host`**, single unified meaning.
- Exit-code scheme: **canonical 0–10 + 130** (Option A with B's host/service split folded in).

### Deferred to Implementation

- Exact picker UX for release/app/profile (reuse `createEffectGamePicker` vs a lighter chooser) — decided when wiring U6.
- Whether remote launch surfaces a distinct `host-service-off` (6) vs `host-unreachable` (5) in every discovery path or only where the client can tell them apart — settled against real client responses in U5.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Target surface

```text
korri games      list [--host] · find <query> [--host]
korri launch     <game> [--host --release-id --app-id --profile-id --yes]
                 (no game → interactive pick; ambiguous box/release/app/profile → prompt)
                 dry-run <game> [same flags]
korri session    status [--host] · stop [--host --force --yes]
korri stream     show [--socket] · bitrate <kbps> · fps <fps> · resolution <WxH>   (each [--socket])
korri scout      scan releases [...] · scan configured [...]
korri artifacts  import-file <path> [...] · import-staged <path> [...]
korri bazzar     search|details|plugins|validate|acquire|resolve-download …
```

Removed: `play`, `stream launch`, `stream remote-launch` (folded into `launch`).

### Canonical exit-code table (the shared seam)

| Code | Name | Meaning |
|---|---|---|
| 0 | `ok` | Success |
| 1 | `internal` | Unexpected internal error (korri bug) |
| 2 | `usage` | Bad flag/value/missing arg |
| 3 | `not-found` | No game matches id/query |
| 4 | `ambiguous` | Matched several; no TTY to pick |
| 5 | `host-unreachable` | Target machine not answering |
| 6 | `host-service-off` | Machine up, Korri control off/disabled |
| 7 | `not-configured` | No library / sessiond not configured |
| 8 | `launch-invalid` | Resolved to a broken/unlaunchable target |
| 9 | `host-refused` | Preflight/daemon rejected the launch |
| 10 | `launch-failed` | Game started but exited non-zero (its code in the message) |
| 130 | `cancelled` | Aborted an interactive prompt |

### `launch` resolution (decision matrix)

| Situation | Behavior | Terminal outcome |
|---|---|---|
| game omitted, TTY | prompt game picker | proceeds or `cancelled` |
| game omitted, no TTY | — | `usage` |
| game given, not found | — | `not-found` |
| one location has it | run local / stream remote automatically | proceeds |
| multiple locations, TTY | prompt box picker | proceeds or `cancelled` |
| multiple locations, no TTY, no `--host` | — | `ambiguous` |
| release/app/profile needed, unspecified, TTY | prompt | proceeds or `cancelled` |
| release/app/profile needed, unspecified, no TTY | — | `ambiguous` |
| active session would be terminated, no `--yes`, TTY | confirm | proceeds or `cancelled` |
| host unreachable / service off | — | `host-unreachable` / `host-service-off` |
| daemon/preflight refuses | — | `host-refused` |
| game runs, exits non-zero | report child code in message | `launch-failed` |

### Reporting seam shape

```text
run<Command>(...) : Effect/Promise<CliOutcome>
renderOutcome(CliOutcome) : { text: string[]; code: ExitCode }
main: print text to the right stream, set process.exitCode = code
```

All commands (control-backed and launch/stream) produce a `CliOutcome`; only
`renderOutcome` knows numbers and formatting.

---

## Implementation Units

### Phase 1 — Behavior-preserving cleanup

### U1. Extract shared CLI helpers

**Goal:** Remove the copy-pasted `errorMessage`, remote-client fallback (`clientForHost`), and any other verbatim helpers into one module, with no behavior change.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Create: `product/surfaces/terminal/korri-cli/cli-helpers.ts`
- Create: `product/surfaces/terminal/korri-cli/cli-helpers.test.ts`
- Modify: `product/surfaces/terminal/korri-cli/source-aware-play.ts`
- Modify: `product/surfaces/terminal/korri-cli/remote-stream-launch.ts`
- Modify: `product/surfaces/terminal/korri-cli/stream-launch.ts`

**Approach:**
- Move the identical `errorMessage(error: unknown): string` and the `clientForHost`/`createRemoteStreamControlClient` fallback into `cli-helpers.ts`; import at call sites. Pure move; existing tests stay green.

**Execution note:** Behavior-preserving refactor — rely on existing command tests to prove no change; add focused unit tests only for the extracted helpers.

**Patterns to follow:** existing private helpers in the three source files.

**Test scenarios:**
- Happy path: `errorMessage` returns `.message` for `Error`, the string for a string, `String(x)` otherwise.
- Happy path: client fallback returns the injected client when provided, else constructs from `controlUrl`.

**Verification:** All existing korri-cli tests pass unchanged; the three source files no longer define local copies of the moved helpers.

### U2. Extract the shared interactive game-pick flow

**Goal:** Collapse the three hand-rolled "is this a TTY? is a picker present? run it, handle cancelled / vanished" sequences into one helper the future `launch` will reuse.

**Requirements:** R9, R2

**Dependencies:** U1

**Files:**
- Create: `product/surfaces/terminal/korri-cli/interactive-pick.ts`
- Create: `product/surfaces/terminal/korri-cli/interactive-pick.test.ts`
- Modify: `product/surfaces/terminal/korri-cli/source-aware-play.ts`
- Modify: `product/surfaces/terminal/korri-cli/remote-stream-launch.ts`
- Modify: `product/surfaces/terminal/korri-cli/stream-launch.ts`

**Approach:**
- One helper takes candidate choices + `{ stdinIsTty, gamePicker }` and returns a small ADT: `Picked(choice) | NoTty | NoPicker | Cancelled`. Call sites map that ADT to their current outcomes (unchanged numbers for now — the seam swap happens in Phase 2/3).

**Execution note:** Behavior-preserving; keep current exit numbers at call sites until their migration unit.

**Patterns to follow:** the tagged-union + self-selecting pattern in `control-renderers.ts` / `launch-state.ts`.

**Test scenarios:**
- Happy path: choices + TTY + picker returns `Picked` with the selection.
- Edge case: `stdinIsTty === false` → `NoTty`.
- Edge case: no picker → `NoPicker`.
- Edge case: picker returns undefined → `Cancelled`.

**Verification:** The three commands delegate selection to the helper; behavior and exit codes unchanged; existing tests green.

### Phase 2 — Shared reporting seam and exit-code contract

### U3. Define the canonical exit-code table and `CliOutcome` seam

**Goal:** Introduce the one place that owns exit numbers and outcome→text rendering.

**Requirements:** R7, R8

**Dependencies:** None (parallel to Phase 1)

**Files:**
- Create: `product/surfaces/terminal/korri-cli/cli-outcome.ts`
- Create: `product/surfaces/terminal/korri-cli/cli-outcome.test.ts`

**Approach:**
- Define the exit-code enum/constants exactly per the table (0–10, 130) with named members, and a `CliFailure` tagged union covering every failure kind. Provide `renderOutcome(outcome) → { text, code }`. No command consumes it yet; this unit is the contract + its tests.

**Technical design:** *(directional)* the enum names double as the machine-readable failure vocabulary; `renderOutcome` is the only function that returns a number.

**Patterns to follow:** `control-renderers.ts` render/exit-code pairing, promoted to a single reusable seam.

**Test scenarios:**
- Happy path: each named failure maps to its documented code (table-driven; one assertion per row).
- Edge case: `ok` → 0; `cancelled` → 130.
- Edge case: `launch-failed` carries the child exit code in `text` but still returns 10.
- Guard: no code falls in the reserved 126–165/255 band (assert the set of emitted codes ⊆ {0,1,2,3,4,5,6,7,8,9,10,130}).

**Verification:** Table fully covered by tests; importable by other units.

### U4. Migrate the control-backed commands onto the canonical codes

**Goal:** Point `games`, `launch` (control path), `launch dry-run`, and `session` at the canonical table, replacing the sysexits-flavored numbers, and update their tests as the new spec.

**Requirements:** R7, R8

**Dependencies:** U3

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/control-renderers.ts`
- Modify: `product/surfaces/terminal/korri-cli/control-renderers.test.ts`
- Modify: `product/surfaces/terminal/korri-cli/korri-cli.test.ts`

**Approach:**
- Rewrite each `*ExitCode` to return canonical codes: `HostUnavailable → host-unreachable (5)` (or `host-service-off (6)` where the result distinguishes a disabled control service), `GameNotFound → not-found (3)`, `MissingQuery/AmbiguousGame → usage (2)/ambiguous (4)`, `LaunchConfigFailed → launch-invalid (8)`, `Preflight/DaemonRejected → host-refused (9)`, `LaunchFailed → launch-failed (10)` (child code into the message), session states mapped accordingly. Update every touched assertion to the new numbers.

**Execution note:** This is an intentional public-contract change — update assertions to the canonical numbers, do not preserve old ones.

**Patterns to follow:** existing `render*`/`*ExitCode` structure; swap only the number source.

**Test scenarios:**
- Happy path per command: each result `_tag` renders the expected text and canonical code (extend existing table tests).
- Covers R7: "game not found" returns 3 from both `games find` and `launch` (the former inconsistency is gone).
- Edge case: `LaunchFailed` returns 10 and surfaces the child exit code in text.
- Edge case: host reachable-but-disabled returns 6, not 5, where the control result exposes the distinction.

**Verification:** `control-renderers.test.ts` and control-path cases in `korri-cli.test.ts` assert only canonical codes; whole-repo typecheck and unit tests pass.

### Phase 3 — Surface redesign

### U5. Build the unified `launch` resolver (game + location + execution)

**Goal:** Create one `launch` command that resolves the game, resolves where it runs (local vs remote, prompting on box ambiguity), and executes (run locally or stream) — producing a `CliOutcome`. This is the core that replaces `play` and the two `stream` launch verbs.

**Requirements:** R1, R2, R3, R7, R8

**Dependencies:** U2, U3, U4

**Files:**
- Create: `product/surfaces/terminal/korri-cli/launch-command.ts`
- Create: `product/surfaces/terminal/korri-cli/launch-command.test.ts`
- Modify: `product/surfaces/terminal/korri-cli/korri-cli.ts`
- Modify: `product/surfaces/terminal/korri-cli/korri-cli.test.ts`

**Approach:**
- Reuse `source-aware-games.ts` (local+remote merge) and `lan-stream-discovery` for location resolution; reuse the U2 pick helper for interactive game/box selection; reuse `moonlight-launch-policy`/`moonlight-launcher` for the stream path and `Launcher`/`LibrarySource` for local. Decision matrix in HLD governs outcomes. `--host` scopes resolution to one machine. Emit `CliOutcome` only.
- Keep `launch dry-run` (control path) as the resolve-without-spawn subcommand.

**Execution note:** Start from the decision-matrix rows as failing tests for outcome/code, then wire resolution.

**Patterns to follow:** `source-aware-play.ts` local/remote branch (being subsumed), `control-renderers.ts` outcome shape.

**Test scenarios:**
- Happy path: game resolvable only locally → runs locally → `ok`.
- Happy path: game resolvable only remotely → prepares + opens Moonlight → `ok`.
- Edge case: no game arg + TTY → picker invoked; selection launches; cancel → `cancelled` (130).
- Edge case: no game arg + no TTY → `usage` (2).
- Edge case: multiple locations + no TTY + no `--host` → `ambiguous` (4).
- Edge case: multiple locations + `--host` names one → no prompt, launches there.
- Error path: unknown game → `not-found` (3).
- Error path: host unreachable → `host-unreachable` (5); control disabled → `host-service-off` (6).
- Error path: local game exits non-zero → `launch-failed` (10) with child code in text.
- Integration: remote path calls prepare then Moonlight launcher in order; failure to open Moonlight still reports remote staging succeeded.

**Verification:** `launch` handles every decision-matrix row; codes are canonical; `play`/`stream launch`/`stream remote-launch` no longer needed by any test.

### U6. Prompt-on-ambiguity for release (and the shared path app/profile plug into)

**Goal:** When a resolved game reports a required release that wasn't supplied, `launch` prompts interactively (or returns `ambiguous` with no TTY); `--release-id` skips it. Build the prompt path generically so `--app-id`/`--profile-id` pre-selection flows through it and a future app/profile required-signal needs no new wiring.

**Requirements:** R2

**Dependencies:** U5

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/launch-command.ts`
- Modify: `product/surfaces/terminal/korri-cli/launch-command.test.ts`

**Approach:**
- Catch `ReleaseRequired` from `launch-state.ts` and route it through the U2 pick helper. `--release-id/--app-id/--profile-id` pre-resolve and bypass any prompt. **Only release has a required-signal today** (verified: no `AppRequired`/`ProfileRequired` exists), so only release can trigger a prompt; app/profile are accepted as flags and wired into the same generic path so no rework is needed when the platform later reports their requirement.

**Execution note:** Extend the decision matrix rows as tests before wiring; keep the required-dimension handling generic (dimension + candidate ids + pre-selected flag) rather than release-specific branches.

**Patterns to follow:** `launch-state.ts` `ReleaseRequired`; reuse the same pick-ADT as box/game selection.

**Test scenarios:**
- Edge case: release required, none given, TTY → prompt → chosen release launches.
- Edge case: release required, none given, no TTY → `ambiguous` (4).
- Edge case: `--release-id` given → no prompt.
- Happy path: `--app-id`/`--profile-id` given → passed through as pre-selection (no prompt; no required-signal exists to trigger one).

**Verification:** Release shares the box/game prompt path; all three flags consistently skip/pre-select; the required-dimension handler is generic enough that adding an app/profile signal later is a platform change, not a CLI redesign.

### U7. Consequence-driven confirmation before termination

**Goal:** `launch` prompts before an action that would terminate a running game; `--yes` skips. Confirmation is derived from session state, never from the verb.

**Requirements:** R5

**Dependencies:** U5

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/launch-command.ts`
- Modify: `product/surfaces/terminal/korri-cli/launch-command.test.ts`

**Approach:**
- Before executing, consult `control.sessionStatus()`; if `active` is present and launching would replace it, prompt "This closes <title/gameId>. Continue?" unless `--yes`. If the session layer reports nothing active or a non-terminating outcome, proceed silently. Decline → `cancelled` (130).

**Execution note:** Test-first on the "active session present" branch; keep the check behind a single predicate so a future session-layer "will-terminate" signal can replace the inference without touching call sites.

**Patterns to follow:** `session stop` `--yes` gating; `ControlSessionActive` fields.

**Test scenarios:**
- Happy path: no active session → no prompt → launches.
- Edge case: active session, TTY, confirm → launches.
- Edge case: active session, TTY, decline → `cancelled` (130).
- Edge case: active session, `--yes` → no prompt → launches.
- Edge case: active session, no TTY, no `--yes` → prompt cannot be shown → `cancelled` (or documented non-interactive outcome), asserted explicitly.

**Verification:** Prompt fires strictly on would-terminate; `--yes` and "nothing running" both bypass it.

### U8. Retire old verbs, scope `stream` to tuning, ratify naming and `--host`

**Goal:** Remove `play` and the `stream launch`/`stream remote-launch` verbs, leave `stream` with only `show`/`bitrate`/`fps`/`resolution`, confirm `--host` reads identically across `games`/`launch`/`session`, and confirm Rule A naming holds. Relocate the inline input validation (bitrate/fps/resolution/empty-id) out of the command wiring.

**Requirements:** R1, R3, R4, R6

**Dependencies:** U5, U6, U7

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/korri-cli.ts`
- Delete: `product/surfaces/terminal/korri-cli/source-aware-play.ts` (+ its test)
- Delete: `product/surfaces/terminal/korri-cli/remote-stream-launch.ts` (+ its test)
- Modify/Delete: `product/surfaces/terminal/korri-cli/stream-launch.ts` (fold surviving prepare logic into `launch-command.ts`; delete if fully subsumed)
- Modify: `product/surfaces/terminal/korri-cli/stream-quality.ts` (validation relocation only)
- Modify: `product/surfaces/terminal/korri-cli/korri-cli.test.ts`

**Approach:**
- Rewire `streamCommand` to the four tuning subcommands; drop `playCommand`, `streamLaunchCommand`, `streamRemoteLaunchCommand`. Move `bitrate ≤ 0` / resolution-format / empty-id checks into the feature functions returning `usage (2)` via `CliOutcome`. Verify `--host` is a single unified flag definition consumed the same way everywhere.

**Execution note:** Deletion-heavy; lean on the U5–U7 tests now covering the folded behavior before removing the old files.

**Patterns to follow:** `stream-quality.ts` existing IO; `cli-outcome.ts` for `usage`.

**Test scenarios:**
- Happy path: `stream show/bitrate/fps/resolution` still work; `bitrate 0` / bad resolution → `usage` (2) via the shared seam.
- Edge case: `korri play` and `korri stream launch` no longer exist (assert command tree).
- Edge case: `--host` parsed identically on `games list`, `launch`, `session status`.
- Regression: no test references the deleted verbs.

**Verification:** Command tree matches the HLD target surface; deleted files gone; whole-repo typecheck + unit tests pass; `just lint`/`just format` clean.

### Phase 4 — Documentation

### U9. Document the canonical exit-code contract

**Goal:** Publish the one exit-code table where callers and future commands find it, and align the `pi-korrid-tools` docs that describe CLI behavior.

**Requirements:** R7

**Dependencies:** U4, U8

**Files:**
- Create: `docs/solutions/tooling-decisions/korri-cli-exit-codes-2026-07-03.md`
- Modify: `packages/pi-korrid-tools/README.md` (only where it states CLI exit semantics, if present)

**Approach:**
- Record the table, the reserved-range rationale, and the "one seam owns the numbers" rule as a durable institutional learning; update tool docs that quote specific codes.

**Test scenarios:** Test expectation: none — documentation only.

**Verification:** The table in docs matches `cli-outcome.ts` exactly; no doc quotes a retired number.

---

## System-Wide Impact

- **Interaction graph:** `korri-cli.ts` command tree, `control-renderers`, the three (soon two-fewer) stream/play flows, and `stream-quality` all route through the new `cli-outcome` seam. `korri-cli.nix` invokes the binary but only cares about zero/non-zero.
- **Error propagation:** every failure becomes a `CliFailure` tag at the seam; `renderOutcome` is the sole place mapping to a number + stream.
- **State lifecycle risks:** `launch` remote path writes a one-shot stream intent and may open Moonlight; confirmation gating (U7) guards termination of an active session. Cleanup of launch artifacts on prepare failure must be preserved when folding `stream-launch.ts` into `launch-command.ts`.
- **API surface parity:** exit codes are the external contract — tests, `pi-korrid-tools` docs, and any operator scripts. All must move together to the canonical table.
- **Integration coverage:** `korri-cli.test.ts` end-to-end command runs prove the tree shape, code mapping, and prompt/no-TTY branches that unit tests of individual helpers cannot.
- **Unchanged invariants:** RPC protocol, control-result ADTs, sessiond, and `bazzar`/`scout`/`artifacts` behavior are untouched except for reading the shared codes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Exit-code change breaks an operator script or the Nix wrapper | Codes move as one contract with tests updated as the spec; `korri-cli.nix` only checks zero/non-zero; documented in U9. |
| Folding `stream-launch.ts` drops artifact cleanup on prepare failure | Preserve `cleanupLaunchArtifacts` path explicitly in U5/U8; add a test for prepare-failure cleanup. |
| Release/app/profile "required" signals not uniformly exposed by the control layer | U6 routes only the signals that exist (`ReleaseRequired` confirmed); missing ones deferred with a note rather than faked. |
| Non-interactive launch semantics ambiguous (no TTY + needs a choice) | Decision matrix fixes each no-TTY branch to `usage`/`ambiguous` explicitly and asserts it. |
| Large deletion in U8 removes coverage prematurely | Sequence deletions after U5–U7 tests cover the folded behavior; assert no test references retired verbs. |

---

## Documentation / Operational Notes

- U9 adds the durable exit-code reference under `docs/solutions/tooling-decisions/`.
- No rollout/migration beyond the CLI; the device consumes the binary via `korri-cli.nix` unchanged.
- Whole-repo `just typecheck` is required (path aliases); `just test-unit`, `just lint`, `just format` before each unit is considered complete.

---

## Sources & References

- Related code: `product/surfaces/terminal/korri-cli/*`, `product/platform/control/control-results.ts`, `product/platform/library/launch-state.ts`, `product/platform/stream/lan-stream-discovery.ts`
- Consumers of the contract: `product/systems/nixos/modules/korri-cli.nix`, `packages/pi-korrid-tools/`
- Design decisions: settled in-session (see this plan's Key Technical Decisions and Open Questions → Resolved).
