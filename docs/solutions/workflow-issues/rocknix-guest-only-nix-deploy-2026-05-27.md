---
title: ROCKNIX nix-on-rocks deploys target the guest store; the host has no /nix
date: 2026-05-27
category: workflow-issues
module: tools/scripts/deploy-sobo + nix-on-rocks
problem_type: workflow_issue
component: tooling
severity: high
applies_when:
  - "Deploying a NixOS guest hosted inside a non-Nix base OS (ROCKNIX, JELOS, generic CFW)"
  - "Writing `nixos-rebuild`-style scripts for two-port devices (host SSH on 22, guest SSH on 2222)"
  - "Resolving the active toplevel via `readlink /nix/var/nix/profiles/system` in shell scripts"
  - "Using `rocknix-guest-generation-import` / `rocknix-guest-generation-switch` helpers"
tags: [nixos, rocknix, nix-on-rocks, deploy, ssh, readlink, korri]
---

# ROCKNIX nix-on-rocks deploys target the guest store; the host has no /nix

## Context

The Korri deploy for Sobo (a SM8550 handheld running nix-on-rocks)
follows a five-step path: build on an aarch64 builder, copy the
toplevel to the guest's `/nix/store`, import a generation, switch, and
warm-restart `rocknix-guest.service`. The first end-to-end attempt
sank time on two avoidable failures:

1. The deploy script copied the toplevel **into the rocknix host's
   store** before importing it as a generation. The rocknix host
   does not have a usable `/nix/store` — `nix copy` either failed
   outright or copied into a path that nothing would ever read.
2. The script resolved the toplevel store path with bare `readlink`,
   which returns the relative `system-XXX-link` target rather than
   the full `/nix/store/...` path, breaking every subsequent step
   that expected an absolute path.

Both are easy to write into a script if you do not internalize that
"the host on port 22" and "the guest on port 2222" are different
machines with different stores.

## Guidance

**The toplevel only needs to exist in the guest store.** The rocknix
host's helpers (`rocknix-guest-generation-import`,
`rocknix-guest-generation-switch`) `nsenter` into the NixOS guest
namespace to do their work — they read paths out of the *guest's*
`/nix/store`, not the host's. `nixos-rebuild boot
--target-host root@guest` already populates that store via ssh-ng on
port 2222.

Concretely:

```bash
# Step 1 — build on aarch64 builder, ssh the closure into the guest store
NIX_SSHOPTS="-F ${ssh_tmpdir}/ssh_config ${NIX_SSHOPTS:-}" \
  nixos-rebuild boot \
    --flake .#korri-odin2portal-kiosk \
    --build-host "${BUILDER}" \
    --target-host root@sobo \
    --no-update-lock-file \
    --impure

# Step 2 — resolve the absolute toplevel from the guest. -f is required.
toplevel="$(ssh -F "${ssh_tmpdir}/ssh_config" -o BatchMode=yes sobo \
  'readlink -f /nix/var/nix/profiles/system')"

# Step 3 — DO NOT copy to the host. nsenter into the guest from the host.
ssh root@${DEVICE_HOST} bash -s "${toplevel}" <<'HOST_EOF'
set -euo pipefail
toplevel="$1"
touch /storage/nix-on-rock/requests/manual-generation-hold
rocknix-guest-generation-import --system "${toplevel}" --source <reason>
rocknix-guest-generation-switch  --to "${toplevel}" --no-restart
HOST_EOF

# Step 4 — warm-restart the unit so the new generation activates.
ssh root@${DEVICE_HOST} 'systemctl restart rocknix-guest.service'
```

The two foot-guns to refuse:

- **`readlink` without `-f`** for `/nix/var/nix/profiles/system`. The
  relative target (`system-NNN-link`) is meaningless outside the
  profile directory.
- **`nix copy --to ssh-ng://root@${DEVICE_HOST}`** (port 22, the host).
  The host has no usable store; the closure is already on the guest
  from step 1.

## Why This Matters

- "nixos-rebuild target-host" makes the GUEST the destination of the
  ssh-ng push. The HOST never sees the closure and does not need to.
  Adding an extra `nix copy` to the host is not "belt and braces" —
  it is a confused dependency that wastes minutes per deploy and
  silently fails on devices with no host store at all.
- `readlink -f` is the absolute-path resolver; bare `readlink` is the
  symlink-target reader. Shell scripts that pipe the result into
  `nix copy` / `nsenter` / `rocknix-guest-generation-*` need the
  absolute form.
- The rocknix host is intentionally tiny — busybox, no nix. Treating
  it as "just another NixOS box" is the whole class of mistake. The
  host runs the *coordination* (nsenter helpers); the guest runs the
  *NixOS*. Keep those roles separate in scripts.

## When to Apply

- Any deploy targeting a NixOS guest inside a non-NixOS base OS, where
  the same IP exposes two SSH endpoints.
- Reviewing or porting `deploy-*.sh` scripts that look like generic
  NixOS deploys but are actually nix-on-rocks deploys.
- Writing CI/automation that builds the closure on a beefy builder and
  pushes to a constrained device.

## Examples

**Before** — the original (broken) deploy script, abridged:

```bash
# Step 2 (broken): copy toplevel into the rocknix host store
toplevel="$(ssh -F ... sobo 'readlink /nix/var/nix/profiles/system')"
NIX_SSHOPTS="-p ${HOST_PORT}" \
  nix copy \
    --to "ssh-ng://root@${DEVICE_HOST}" \
    --substitute-on-destination \
    --no-check-sigs \
    --from "ssh-ng://${BUILDER}" \
    "${toplevel}"
```

Failure mode: `${toplevel}` is `system-42-link`, not
`/nix/store/...-nixos-system-sobo-...`. `nix copy` either rejects it
or copies a bogus path. Even if `toplevel` resolved, the destination
store does not exist.

**After** — fix both at once:

```bash
# Step 2: resolve absolute path on the guest.
toplevel="$(ssh -F ... sobo 'readlink -f /nix/var/nix/profiles/system')"

# Step 2.5: SKIPPED — the host has no nix store; helpers nsenter
# into the guest, which already has the closure from step 1.
```

This shaved the deploy from "fails in step 2, manually recover" down
to "completes in ~90 seconds, federation visible on `avahi-browse`
before the script exits."

## Related

- `/tmp/deploy-sobo-federation.sh` — patched version with both fixes.
- `rocknix-guest-generation-import` / `rocknix-guest-generation-switch`
  are the canonical entry points; treat them as the *only* way the
  rocknix host should mutate the guest's NixOS profiles.
