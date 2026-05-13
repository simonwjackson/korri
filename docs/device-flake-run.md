---
title: Device flake run workflow
date: 2026-05-13
category: development
module: tools/device/flake-command.ts
---

## What this is

A small operator workflow for running the current Korri flake app locally or on a destination device for real-device testing.

Korri owns this command surface only. Durable device upgrades, rollback, NixOS modules, service declarations, Sway/session/input policy, and host-specific substrate concerns belong to the device/guest flake.

## Commands

```bash
just device-print-run-command
just device-run
```

`device-print-run-command` prints the selected command without executing it. `device-run` executes it.

By default, with no local topology configured, Korri runs the device app from the current checkout on the current machine:

```bash
just device-print-run-command
# mode=local
# flake=.
# app=korri-desktop-device
# command=nix run .#korri-desktop-device
```

## Optional local topology

Local topology is optional and ignored by Git. Copy the example when needed:

```bash
cp local.env.example local.env
```

or use a named env file explicitly:

```bash
just --dotenv-path local.device.env device-print-run-command
```

Do not commit real hostnames, private paths, or builder topology.

## Running on a destination

Set `DEVICE_HOST` to run Nix on that destination over SSH:

```bash
DEVICE_HOST=root@example-device just device-print-run-command
```

When `KORRI_FLAKE_REF` is unset, the helper infers a Git SSH flake ref from the current checkout:

```text
git+ssh://<source-host><repo-root>
```

`<repo-root>` comes from `git rev-parse --show-toplevel`. `<source-host>` defaults to the local hostname. If the destination cannot reach that inferred host, set one of:

```bash
KORRI_SOURCE_HOST=source-host.example
# or
KORRI_FLAKE_REF=git+ssh://source-host.example/path/to/korri
```

Example:

```bash
DEVICE_HOST=root@example-device \
KORRI_SOURCE_HOST=source-host.example \
just device-print-run-command

# mode=ssh
# flake=git+ssh://source-host.example/home/me/code/korri
# app=korri-desktop-device
# command=ssh root@example-device 'nix run git+ssh://source-host.example/home/me/code/korri#korri-desktop-device'
```

Extra SSH options belong in `DEVICE_SSH_OPTS`:

```bash
DEVICE_HOST=root@example-device \
DEVICE_SSH_OPTS="-p 2222" \
just device-run
```

## Builder selection

Korri does not model the Nix builder matrix. By default it passes no `--builders` flag, so the machine running Nix uses its own Nix configuration.

- Local run: the current machine's Nix config owns builders.
- `DEVICE_HOST` run: the destination machine's Nix config owns builders.

For an advanced one-off override, pass raw Nix flags through env:

```bash
DEVICE_HOST=root@example-device \
NIX_BUILDERS="ssh://builder.example aarch64-linux - 8 1" \
NIX_MAX_JOBS=0 \
just device-run
```

Prefer configuring builders in Nix rather than encoding the matrix in Korri commands.

## Dirty Git behavior

Remote inferred refs and explicit Git refs such as `git+ssh://...` or `github:...` use committed Git state. They do not include uncommitted local edits.

If the worktree is dirty and a Git flake ref is selected, the helper prompts before proceeding. In non-interactive mode it fails closed unless explicitly overridden:

```bash
KORRI_ALLOW_DIRTY_FLAKE_RUN=1 just device-run
```

Use that override only when you intentionally want to run the committed state while local edits exist. For local-only testing, leaving `DEVICE_HOST` unset uses `.` and can see the working tree through Nix's local path behavior.

## What this replaces

The old Korri-owned mutable deployment loop is gone. Korri no longer rsyncs a source checkout to a device, installs Bun on the target, writes target systemd units, harvests a host session environment, masks host services, or treats a checked-out app directory as the runtime root.

If the target device needs durable service installation, rollback, Sway/session/input policy, or upgrade orchestration, implement that in the device/guest flake.
