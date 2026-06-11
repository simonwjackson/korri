# Bandai input handoff — Korri vs nix-on-rocks boundary

## Current state

Bandai has been deployed and cold-booted onto:

```text
/nix/store/l775b4dx0japb4s9rhkkl97r6bd8rf9j-nixos-system-bandai-25.11pre-git
```

Validated after deploy/reboot:

- `korri-compositor.service`, `korri-sessiond.service`, `korri-inputd.service`, `korrid.service` active.
- Root/main-space PipeWire services are masked/inactive.
- Korri user PipeWire/Pulse/WirePlumber active under `/run/user/2000`.
- `pactl` is now present in `korri-inputd` PATH.
- Yoshi launches through the real `app.library.launch` path into sessiond/gamescope/RetroArch.
- Generated Yoshi RetroArch config is correct:
  - `aspect_ratio_index = 22`
  - `video_force_aspect = "true"`
  - `input_driver = "udev"`
  - `input_joypad_driver = "udev"`
  - expected `input_player1_*` binds present.
- Sessiond reports active game correctly during launch:
  - `mode=game`
  - `phase=running`

## Remaining issue

After a cold boot, `korri-inputd` logs repeated `EACCES` while discovering some raw/touch input nodes:

```text
EACCES: permission denied, open '/dev/input/event4'
EACCES: permission denied, open '/dev/input/event5'
```

Observed nodes:

```text
/dev/input/event4 -> ft5x06-bottom touchscreen, root:104 crw-rw----, no korri ACL
/dev/input/event5 -> ft5x06-top touchscreen,    root:104 crw-rw----, no korri ACL
/dev/input/event10 -> headset jack/power-ish input, root:104 with user:korri:rw ACL
```

A permissive per-device `udevadm trigger --action=change` proved that the existing udev rule can fix event4/event5 live, but relying on a broad boot-time re-ACL service would be a workaround and should not be the long-term design.

## Important decision

Do **not** solve this by globally chmod/chown/setfacl-ing every `/dev/input/event*` at boot.

That would fight InputPlumber and reopen raw/source devices that the substrate may intentionally hide or restrict.

## Recommended ownership split

### Korri-owned fix

`korri-inputd` should not require readable access to every visible `/dev/input/event*`.

It should:

1. Skip unreadable devices during discovery.
2. Treat irrelevant raw/touch/source devices as debug/ignored, not recurring warning/error failures.
3. Explicitly consume only the devices Korri owns:
   - normalized InputPlumber virtual controller
   - hardware shortcut devices Korri intentionally handles
4. Continue requiring/validating access to the normalized controller path needed for gameplay input.

This is the immediate product fix and belongs in this repo.

### `../nix-on-rocks` follow-up

Audit the SM8550/InputPlumber substrate contract:

1. Why guest-visible input nodes are `root:104` while guest `input` is gid `174`.
2. Which raw devices InputPlumber should hide/move vs expose.
3. Whether InputPlumber should emit a stable xb360-compatible virtual controller target.
4. Whether normalized devices should have stable, guest-consistent permissions.

This is substrate/platform hygiene, but it should not block the Korri-side inputd robustness fix.

## Avoid

Avoid adding either of these as the durable answer:

```sh
chmod 666 /dev/input/event*
setfacl -m u:korri:rw /dev/input/event*
```

They are acceptable as live incident recovery only, not architecture.

## Suggested next task

Implement and deploy a Korri `inputd` discovery/filtering fix:

- unreadable non-required devices are skipped quietly
- required normalized controller absence remains actionable
- logs distinguish required-device failure from ignored-device discovery noise
- add a focused test fixture covering unreadable touch/raw event nodes plus readable normalized controller

Then open a separate `../nix-on-rocks` follow-up for the InputPlumber/udev gid and virtual-controller contract.
