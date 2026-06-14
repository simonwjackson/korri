---
title: Steam Input needs writable uinput to create virtual XInput on Bandai
date: 2026-06-13
category: docs/solutions/integration-issues
module: korri-steam
problem_type: integration_issue
component: tooling
symptoms:
  - 30XX launched with Vulkan/Freedreno but controller input did not reach the game.
  - Steam detected the physical Xbox controller and loaded the 30XX controller config.
  - /dev/uinput was owned by root:root, so the Korri user could not create Steam's virtual XInput device.
root_cause: missing_permission
resolution_type: code_fix
severity: high
related_components:
  - SM8550 InputPlumber normalization
  - Steam Runtime / Proton launch path
tags: [steam, bandai, 30xx, controller, uinput, xinput, nixos, sm8550]
---

# Steam Input needs writable uinput to create virtual XInput on Bandai

## Problem

Bandai could launch Steam/30XX with Vulkan/Freedreno, but controller input did not work in-game. Steam saw the physical Xbox controller and loaded the 30XX controller config, but the Korri user could not create Steam's virtual XInput device because `/dev/uinput` remained owned by `root:root`.

The durable fix is commit `ad343ec` (`fix(steam): grant steam input access to uinput`) in `product/systems/nixos/modules/korri-steam.nix`.

## Symptoms

- 30XX launched successfully through the Steam/FEX/Proton path.
- Freedreno/Vulkan rendering worked.
- Steam detected the physical Xbox controller.
- Steam loaded the 30XX controller configuration.
- In-game controls did not respond.
- `/dev/uinput` converged to `root:root`, leaving the Korri/Steam user unable to create the virtual XInput device.

## What Didn't Work

- **Trusting Steam's physical-controller detection.** Steam seeing the Xbox controller was only the raw input side of the chain. It still needed permission to open `/dev/uinput` and create the virtual XInput device.
- **Setting only the mode on `/dev/uinput`.** `chmod 0660 /dev/uinput` was not enough when the node stayed in group `root`; the Korri user needed access through the `input` group.
- **Conflating this with InputPlumber normalization.** The earlier InputPlumber/raw-gamepad-hider fixes made the SM8550 normalized-controller contract healthier, but this failure was specifically the Steam uinput permission path.

## Solution

Update the Steam uinput prep helper in `product/systems/nixos/modules/korri-steam.nix` so `/dev/uinput` converges to group `input` and mode `0660` both when the character device already exists and when Korri creates it from the kernel-reported major/minor pair.

The key shape is a shared accessibility helper:

```sh
make_accessible() {
  chgrp input /dev/uinput 2>/dev/null || true
  chmod 0660 /dev/uinput 2>/dev/null || true
}

if [ -c /dev/uinput ]; then
  make_accessible
  exit 0
fi

# ...resolve uinput major/minor from /sys/devices/virtual/misc/uinput/dev
# or /proc/misc...

mknod /dev/uinput c "$major" "$minor" 2>/dev/null || {
  warn "could not create /dev/uinput c $major:$minor"
  exit 0
}

make_accessible
```


Validation used the Steam module check and a real Bandai smoke:

```sh
nix build .#checks.x86_64-linux.korri-steam-module
```

After deployment:

- `/dev/uinput` converged to `root:input 0660`.
- Steam was restarted.
- Steam opened `/dev/uinput`.
- 30XX launched with Freedreno.
- The user confirmed controls worked.

## Why This Works

Steam Input is a two-part path on Bandai:

```text
physical/controller side
  InputPlumber / raw-gamepad hider / Steam controller detection
      ↓
Steam Input synthesis side
  Steam opens /dev/uinput
      ↓
  Steam creates a virtual XInput controller
      ↓
30XX consumes the virtual XInput device
```

The physical controller being visible to Steam only proves the first half. Games such as 30XX consume the virtual XInput device, so Steam must be able to open `/dev/uinput` and issue uinput ioctls as the Korri runtime user.

`0660 root:root` still blocks that user. Changing the node to `root:input 0660` makes the existing Korri input-group access model apply to Steam's virtual controller creation too.

Handling both device states matters:

- after normal boot/device-manager setup, `/dev/uinput` may already be a character device;
- after stale placeholders or missing nodes, the prep helper may need to recreate `/dev/uinput` from the kernel-reported misc-device number.

Both paths must end with the same ownership/mode policy.

## Prevention

Use a short controller-bearing Steam validation checklist:

1. Build the module check:

   ```sh
   nix build .#checks.x86_64-linux.korri-steam-module
   ```

2. Verify the device node shape on the target:

   ```sh
   ls -l /dev/uinput
   # expect: crw-rw---- root input ... /dev/uinput
   ```

3. Restart Steam so it reopens `/dev/uinput`.
4. Launch a controller-bearing game and confirm input reaches the game, not just that Steam detects the physical controller.

## Related Issues

- `docs/handoffs/bandai-inputplumber-xb360-controller-normalization-2026-06-09.md` — adjacent Bandai controller-normalization work. Same hardware/input area, but that handoff is about InputPlumber/Moonlight controller identity and mapping, not Steam's `/dev/uinput` permission path.
- `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md` — broader ROCKNIX ARM64 Steam launch background, refreshed with this uinput precondition.
