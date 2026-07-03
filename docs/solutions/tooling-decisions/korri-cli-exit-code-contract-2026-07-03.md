---
title: Canonical korri-cli exit-code contract
date: 2026-07-03
category: docs/solutions/tooling-decisions
module: korri-cli
problem_type: tooling_decision
component: tooling
severity: medium
tags:
  - korri-cli
  - exit-codes
  - cli-contract
applies_when:
  - Adding or changing a korri-cli command that reports success or failure
  - A caller (script, Nix module, test) needs to branch on korri's exit status
  - Deciding what number a new failure mode should return
---

## Problem

The korri CLI previously defined exit codes independently in four-plus command
files with three competing numbering philosophies: sysexits-flavored codes
(64/78/121/124/75) in the control commands, small ad-hoc codes (2–6, 130) in the
streaming commands, and a third scheme (0/2/20/30) in the standalone
foreground-session-status tool. The same human failure returned different
numbers depending on which command produced it — most visibly, "game not found"
was `3` from `stream`/`play` but `2` from `games`/`launch`. Callers could not
trust a number without reading the specific command behind it.

## Decision

There is one canonical exit-code table, owned by
`product/surfaces/terminal/korri-cli/cli-outcome.ts`. Every command produces a
`CliOutcome`; only `renderOutcome` maps an outcome to text plus a number. No
command invents its own codes.

| Code | Name | Meaning |
|------|------|---------|
| 0 | `ok` | Success |
| 1 | `internal` | Unexpected internal error (a korri bug) — the general catch-all |
| 2 | `usage` | Bad flag/value/missing arg (also: an action needing `--yes` in a non-interactive context) |
| 3 | `not-found` | No game matches the id or query |
| 4 | `ambiguous` | Matched several candidates and there is no terminal to pick from |
| 5 | `host-unreachable` | The target Korri machine is not answering |
| 6 | `host-service-off` | The machine is up but its Korri control service is off/disabled |
| 7 | `not-configured` | No library, or sessiond is not configured |
| 8 | `launch-invalid` | Resolved to a broken/unlaunchable target |
| 9 | `host-refused` | Preflight or daemon rejected the launch |
| 10 | `launch-failed` | The game started but exited non-zero (its real code goes in the message, not the process code) |
| 11 | `stop-pending` | `session stop` was accepted but the session is still shutting down |
| 130 | `cancelled` | An interactive prompt was aborted (Ctrl-C convention) |

## Why these numbers, not sysexits

Only four codes carry weight across the ecosystem, and the table honors all
four: `0` (success), `1` (general error), `2` (usage — what argparse/getopt
emit), and `130` (128 + SIGINT, the standard "you hit Ctrl-C" code). Everything
else — the domain failures — has no universal standard. `sysexits.h` is the
closest registry but is sendmail-era and rarely followed, and mapping onto it
forces collisions (an internal bug and a crashed child game both land on `70
EX_SOFTWARE`; "ambiguous" and "bad launch data" both land on `65 EX_DATAERR`).

A small contiguous band avoids those collisions and stays memorable. The whole
table lives in the shell-safe zone: `0/1/2/130` reuse universal conventions,
`3–11` are free application codes (3–125 is unclaimed), and nothing touches the
reserved 126–165 or 255 range. `cli-outcome.test.ts` enforces that invariant.

## Consequences

- Changing a command's failure code is a public-contract change: update the
  table, `renderOutcome`, and the tests together — never silently.
- A failed local launch reports the game's own exit code in the message and
  returns `10`, rather than leaking the child code as korri's process code
  (which used to collide with korri's own numbers).
- The standalone `foreground-session-status` binary still uses its own
  `0/2/20/30` scheme; folding it onto this table is a separate follow-up.
