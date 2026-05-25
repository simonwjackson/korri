---
title: "Set up the Odin for iterative Korri validation"
date: 2026-05-02
status: ready
audience: coding-agent
---

# Prompt: Set up the AYN Odin 2 Portal for iterative Korri validation

You are picking up a task in this repo. Read this whole file before doing
anything. Then read the files it points at, then act.

## Goal

Establish a fast iterate-build-test loop where:

- The **API server** (Hono + Effect RPC) runs **on the Odin** so real
  `runemu.sh` launches against the real ROCKNIX library and the developer
  sees actual games appear on the handheld's screen.
- The **renderer** runs **on the dev machine** via Vite (so HMR is instant)
  and proxies `/api/*` to the Odin's API server through an SSH tunnel.
- A code change on the dev machine reaches the Odin in one command and
  rebooting the loop is one command.

This is "Level 2" of the deployment ladder discussed in
`docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md` Unit 13
and the brainstorm. Level 3 (everything on the Odin under a kiosk browser)
is **out of scope here** — it is a separate task.

## Read first (in this order)

1. `AGENTS.md` (repo root) — working agreements you must honor. Specifically:
   placement & ownership, no `console.log`, no docs unless requested, design
   tokens not hardcoded values, etc.
2. `docs/deployment/device-report.md` — everything probed about the Odin: SSH
   target, filesystem layout, services, ROCKNIX-specific tooling, gotchas.
   The rootfs is read-only squashfs; only `/storage` is writable.
3. `docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md` — the
   product scope this iteration loop serves.
4. `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`
   Unit 13 (on-device smoke verification) and the Risks table — what the
   loop must enable.
5. `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`
   — confirms Hono `/api/rpc` semantics are identical in dev and on-device,
   which is what makes the tunneled loop work without code changes.
6. `korri/shared/library/library-context.ts` — the env vars the API server
   reads on startup: `KORRI_LIBRARY_SOURCE`, `KORRI_LAUNCHER`,
   `KORRI_ROCKNIX_GAMELIST_ROOTS` (colon-separated), `KORRI_ROCKNIX_ES_SYSTEMS`.
7. `tools/http/server.ts` — the Hono entrypoint you'll run on the device.
8. `justfile` — current recipes; you will add new ones following the
   existing style.

## Non-goals (do not "fix")

- Cross-arch builds for the renderer or Electrobun packaging. Renderer stays
  on the dev machine for now.
- Replacing `runemu.sh`, EmulationStation, or any ROCKNIX-owned file. The
  API server reads `/storage/.config/emulationstation/es_systems.cfg`
  read-only.
- Any change to `/etc/*` or `/usr/*` on the Odin. Those don't survive
  reboot. Everything goes under `/storage/`.
- A systemd unit for Korri. Use `tmux` for the MVP loop; systemd
  integration is a follow-up if the manual loop proves itself.
- Rewriting test infrastructure or production code to make this work. The
  loop should rely on the env vars and seams the personal-MVP plan
  already shipped.

## Constraints worth memorizing

- **SSH target:** `root@192.168.1.104`. Key-based auth, no password.
- **Hostname / mDNS:** `SM8550` / `SM8550.local`.
- **Architecture:** `aarch64` (Snapdragon 8 Gen 2). Bun ships native
  aarch64 Linux binaries; download to `/storage/bin/`.
- **No `apt`/`pacman`.** Anything you need must be self-contained under
  `/storage/`.
- **Wayland session.** ROCKNIX runs Sway via `essway`. `runemu.sh` needs
  the right `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, and possibly
  `DBUS_SESSION_BUS_ADDRESS` to render; an SSH session by default does not
  inherit them. You discover these by reading the live env of the
  `emulationstation` process and writing them to a `.env` file the API
  server sources before spawning children.
- **EmulationStation owns the screen** when it's running. Stopping it is
  needed if you want Korri to render fullscreen later (Level 3); for this
  task you only need `runemu.sh` spawns to land on the screen, which they
  do regardless because `runemu.sh` itself drives the emulator.
- **Bun on the device** is the only runtime you need. No Node, no npm.
- **`tools/testing/fake-game.sh`** is a real, executable in-repo script
  used by automated tests. It is not used in this loop — the loop uses
  the real `runemu.sh` from `/usr/bin/`. Confirm by setting
  `KORRI_LIBRARY_SOURCE` defaults (or leaving unset) so
  `RocknixConfig.launchCommand` falls back to the value declared in
  `es_systems.cfg`.

## What to deliver

### 1. Three new `just` recipes

Add to `justfile`, in the same comment-then-recipe style as the existing
ones. Resolve the SSH target and remote project path from environment
variables with sensible defaults:

```
ODIN_HOST     := env_var_or_default("ODIN_HOST", "root@192.168.1.104")
ODIN_PROJECT  := env_var_or_default("ODIN_PROJECT", "/storage/korri")
ODIN_API_PORT := env_var_or_default("ODIN_API_PORT", "3001")
```

Recipes:

- `just bootstrap-odin` — one-time setup. Installs Bun under
  `/storage/bin/bun`, ensures `/storage/.profile` puts it on PATH, runs an
  initial `rsync` of the project (excluding `node_modules`, `out`,
  `.worktrees`, `.direnv`, `.tanstack`, `.git`), runs `bun install` on the
  device, and writes `/storage/korri/.env` containing the Wayland session
  variables harvested from a running `emulationstation` process. Idempotent
  — re-running upgrades Bun and re-syncs without breaking a running session.

- `just sync-odin` — incremental. Just the rsync; no Bun install, no env
  rewrite. This is the recipe the inner iteration loop calls.

- `just dev-odin` — the iteration loop. Runs `sync-odin`, then restarts a
  tmux session named `korri-api` on the device that runs
  `bun run tools/http/server.ts` with `PORT=$ODIN_API_PORT` and the
  Wayland env sourced from `/storage/korri/.env`. After the API is up,
  opens an SSH tunnel forwarding `localhost:$ODIN_API_PORT` →
  `localhost:$ODIN_API_PORT` on the device, and starts the local Vite dev
  server with `KORRI_API_PROXY_TARGET=http://localhost:$ODIN_API_PORT`.
  Trapping Ctrl-C should stop the tunnel and the local Vite, but **not**
  kill the remote tmux — the user will often restart only the local side.

  If the existing `just dev-web` recipe has a `KORRI_API_PROXY_TARGET`
  pathway already, reuse it; do not invent a parallel proxy mechanism.
  Inspect `vite.config.mjs` first.

Recipes must be **idempotent** and **safe to interrupt**. A second run of
`bootstrap-odin` must not corrupt a partially-installed device.

### 2. A one-page reference doc

Create `docs/development/odin-iterative-loop.md` with frontmatter
matching the conventions used in `docs/solutions/best-practices/*.md`
(`title`, `date`, etc.).

Sections:

- **What this is** (two sentences).
- **Prerequisites** — SSH key authorized on the Odin, Odin reachable on
  the LAN, `tmux` available on the dev machine.
- **Setup (run once)** — `just bootstrap-odin`. Note the recovery flow if
  the env-harvest step finds no running `emulationstation` (instruct the
  user to start ES first or pass envvars manually).
- **Daily loop** — `just dev-odin`, what to expect (renderer at
  `http://localhost:3000`, real launches happening on the handheld
  screen).
- **Editing server code** — incremental change → `just sync-odin` is
  enough; the `dev-odin` recipe re-runs it on each invocation.
- **Editing renderer code** — Vite HMR, no action needed.
- **Where logs live** — the API server's stdout/stderr inside the remote
  tmux session (`ssh $ODIN_HOST tmux attach -t korri-api`).
- **Tearing down** — Ctrl-C the local recipe; the remote tmux survives.
  Killing the remote: `ssh $ODIN_HOST tmux kill-session -t korri-api`.
- **Known limitations** — Level 3 not implemented; Korri's renderer not
  yet running on the Odin's screen; cross-build deferred.

Keep it under ~120 lines. Concise, scannable, no analogies.

### 3. A small probe / smoke script

Create `tools/scripts/odin-smoke.sh` (executable, `#!/usr/bin/env bash`,
`set -euo pipefail`). It should:

1. `ssh $ODIN_HOST` and verify Bun is installed and on PATH.
2. Hit `http://localhost:$ODIN_API_PORT/api/health` through an ephemeral
   tunnel and assert `{"status":"ok"}`.
3. Hit `http://localhost:$ODIN_API_PORT/api/rpc` with a real
   `app.library.list` request and assert the response decodes to a valid
   `{ games: [...] }` shape with at least one entry.
4. Print a summary and exit `0` on success, non-zero with a clear message
   on failure.

This is the equivalent of `just desktop-runtime-check` for the Odin loop.
Wire it into the `justfile` as `just check-odin`.

## Acceptance criteria

The task is done when **all** of these are true:

- [ ] `just bootstrap-odin` from a fresh checkout succeeds on a previously
      un-bootstrapped device.
- [ ] `just dev-odin` opens a Korri renderer at `http://localhost:3000` on
      the dev machine, the rail populates with the real games from the
      developer's Odin (the same names visible in
      `/storage/.config/emulationstation/es_systems.cfg`-referenced
      `gamelist.xml` files), sorted by `lastPlayed` desc with the most
      recently played leftmost.
- [ ] Pressing **confirm** on the leftmost tile causes a real game to
      appear on the handheld's screen via `runemu.sh`. Quitting the game
      returns control; the renderer either reflects success or the
      failure banner if `runemu.sh` exited non-zero.
- [ ] `just check-odin` exits 0 against the running stack.
- [ ] Editing `korri/shared/themes/shift/molecules/ShiftHomeCaption.tsx`
      and saving updates the renderer instantly via Vite HMR with no
      manual step.
- [ ] Editing `korri/products/app/api/library/list.rpc-handler.ts`,
      saving, and running `just sync-odin` is enough to make the next
      `app.library.list` reflect the change after one
      `bun run` restart on the device. Document the restart command in
      the doc.
- [ ] `just typecheck`, `bun test`, and `just lint` all pass on the
      branch. The new recipes do not introduce TypeScript files outside
      `tools/scripts/` and `tools/`.
- [ ] No new file under `korri/products/*` or `korri/shared/*` (the loop
      is repo tooling and lives under `tools/` per AGENTS.md placement
      rules).
- [ ] A single commit `feat(tooling): add Odin iterative-validation loop`
      (or break into 2–3 logical commits if it cleans the diff).

## Important gotchas

- **`tmux` on the device.** ROCKNIX should have it; if not, you will need
  to install it under `/storage/bin/`. Probe with
  `ssh $ODIN_HOST 'command -v tmux'` during bootstrap and fail loudly if
  it is missing, with a clear next-step message — do not silently fall
  back to `nohup &` because losing the server's stdout makes debugging
  much harder.
- **Wayland env discovery.** Read the live env of the running
  `emulationstation` process:
  ```
  ssh $ODIN_HOST 'cat /proc/$(pgrep -f emulationstation | head -1)/environ \
    | tr "\0" "\n" \
    | grep -E "^(WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DISPLAY|DBUS_SESSION_BUS_ADDRESS)="'
  ```
  Write the output verbatim to `/storage/korri/.env`. The API server
  must source this file (or have these passed via the recipe) before
  spawning `runemu.sh`. Without `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY`,
  the emulator will start but render to nowhere.
- **Bun aarch64 zip layout.** The release archive extracts to
  `bun-linux-aarch64/bun`. Move the binary itself to `/storage/bin/bun`
  and remove the wrapper directory.
- **`/flash` is 93% full.** Do not write there. Everything under
  `/storage/`.
- **Path aliases.** TypeScript path aliases (`@app/*`, `@shared/*`,
  `@deploy/*`, `@korri/*`) work because Bun reads `tsconfig.json`.
  Confirm by importing `@shared/logger` in the API server and watching
  it resolve on the device. If aliases break, run
  `bun install` on the device to ensure `node_modules` is populated.
- **Don't sync `node_modules`.** It must be installed natively on the
  Odin (aarch64 binaries differ from the dev machine's). Always exclude
  it from rsync.
- **Don't run `bun run tools/http/server.ts` directly over SSH without
  tmux** — the moment the SSH connection blips, the server dies. Always
  go through the tmux session.
- **Don't write to `/storage/.config/emulationstation/`** from this
  loop. The whole point is that Korri reads ROCKNIX's data without
  modifying it. The brainstorm's R7 forbids modifying ROCKNIX-owned
  files.
- **`runemu.sh` blocks until the game exits** (per
  `korri/shared/library/shell-launcher.ts` Unit 4 design). The
  renderer's RPC call will appear stuck during gameplay. This is
  expected for the personal MVP; if it turns out to break the round-trip
  under sleep/suspend, escalate to the plan's option (c) (start +
  status-poll) — that's a code change, **not** a loop change.

## How to verify before declaring done

Run, in order:

1. `just typecheck`
2. `bun test`
3. `just lint`
4. `just bootstrap-odin` against a real Odin (have the developer confirm).
5. `just dev-odin` and exercise the loop manually:
   - Renderer loads
   - Tile shows the developer's most-recently-played game
   - Confirm on a known-good game launches it on the handheld screen
   - Quitting the game leaves the renderer stable
   - Confirm on a deliberately-broken id (e.g., rename a ROM in a
     scratch system) shows the failure banner
6. `just check-odin` returns 0.

If any step fails, debug it on the spot (or pause and report); do not
ship the loop with known issues.

## Working agreements (re-emphasized)

- Use `@shared/logger`, never `console.log`, in any TypeScript that lands
  in `tools/` or runtime code.
- New scripts that are obviously test/dev tooling go under `tools/`, not
  `korri/`.
- Generated files (`out/generated/*`) are read-only. Do not edit them.
- Never create README/SUMMARY/REPORT markdown unless explicitly requested.
  This file (the prompt) is the one piece of documentation that was
  requested; the doc you create at `docs/development/odin-iterative-loop.md`
  is the second.
- Read at least one nearby existing recipe (`just desktop-runtime-check`,
  `just dev`, `just dev-web`) before writing new ones, and follow that
  shape.
- Run `just format` before committing.

## Hand-off

When the work is complete:

1. Branch off the current branch (`feat/personal-mvp-rocknix-launch`) or
   off `main` if that branch has merged. The choice depends on whether
   the personal-MVP work is still in flight when you start; if it is,
   stack on top of it.
2. Open a PR with a description summarizing what landed, how to use the
   loop in two commands, and which acceptance criteria you verified
   manually vs. on a real device. Use the project's PR-description
   conventions; if `gh pr create` is available, use it.
3. Stop. Do not start Level 3 work in the same PR.

## You will know you're succeeding when

The developer can plug the Odin in via Wi-Fi, run `just dev-odin`, change
a line in a Shift molecule, see it update instantly in their browser, and
press confirm on a real tile to see Mario start on the handheld. Total
loop: under ten seconds for a renderer change, under thirty seconds for
a server change.
