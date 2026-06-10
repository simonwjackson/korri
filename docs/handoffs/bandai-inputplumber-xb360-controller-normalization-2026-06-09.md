# Bandai InputPlumber Xbox 360 controller normalization handoff

## Summary

Bandai runtime-resolution validation reached a working direct-Moonlight path after Aka's rootless/user-session runtime became healthy, but gamepad input did not map correctly. Moonlight saw the InputPlumber virtual controller as a `Microsoft Xbox Series S|X Controller` with GUID `030000005e040000120b000001000000`; the packaged Moonlight mapping DB did not provide a correct semantic mapping for that GUID.

A temporary Moonlight `gamecontrollerdb.txt` overlay made the controller usable, but the first overlay had D-pad hat bits rotated. The better permanent product fix is to make the SM8550 InputPlumber package emit the intended Xbox 360 virtual target so Moonlight and other consumers see one stable normalized controller contract.

## Current lab state / evidence

- Device: `bandai` guest via `ssh -p 2222 root@bandai`.
- Source machine: `aka`.
- Aka rootless/session runtime was healthy before testing:
  - `korri-session.target` active
  - `korrid.service` active
  - `korri-compositor.service` active
  - `korri-sunshine.service` active
  - Sunshine listeners up on `3001`, `47984`, `47989`, `47990`, `48010`
- Steam Big Picture was started on Aka to provide a visible/moving source surface.
- Standard `tools/scripts/live-runtime-resolution-gate.sh` was blocked by a separate gamescope-wrapper issue: gamescope stayed alive but Moonlight never reached local-control.
- Direct Moonlight on Bandai did work and exposed local-control:
  - Local-control socket: `/storage/probe-a-resolution/run/control.sock`
  - Runtime resolution `1280x720` was accepted and applied.
  - Moonlight state changed from `1920x1080` to `1280x720`.
  - Sunshine logged `status=0 reason=0 server_applied=1`.
  - Bandai DSI-2 screenshots changed before/after.
- Attempting `320x180` was rejected as out of bounds by runtime settings.
- Follow-up `640x360` was started but the user observed the current gamepad mapping problem before completing that validation.

Relevant artifact directory:

```text
/tmp/live-runtime-resolution-gate/direct-bp-720-170649/
```

Adjacent backlog captured during validation:

```text
task-003 Fix Bandai runtime-resolution gate gamescope launch stall
```

## Observed Bandai input devices

From `/dev/input` on Bandai:

```text
/dev/input/event10 InputPlumber Keyboard
/dev/input/event11 InputPlumber Mouse
/dev/input/event12 Microsoft Xbox Series S|X Controller
```

Moonlight log showed:

```text
Failed to open device /dev/input/event3
No mapping available for Microsoft Xbox Series S|X Controller (030000005e040000120b000001000000) on /dev/input/event12
```

The virtual gamepad of interest is therefore:

```text
/dev/input/event12
GUID: 030000005e040000120b000001000000
Name: Microsoft Xbox Series S|X Controller
```

## Temporary Moonlight mapping overlay

A temporary overlay was written under the Bandai probe harness:

```text
/storage/probe-a-resolution/run/gamecontrollerdb-xbox-series-overlay.txt
```

The first attempted mapping used the wrong SDL hat bit assignments:

```text
dpup:h0.4,dpdown:h0.2,dpleft:h0.8,dpright:h0.1
```

User-observed result:

```text
L = L
R = D
U = R
D = U
analog fine
```

Correct SDL hat convention is:

```text
dpup:h0.1,dpright:h0.2,dpdown:h0.4,dpleft:h0.8
```

A corrected temporary mapping line for the observed Series S/X GUID would be:

```text
030000005e040000120b000001000000,Microsoft Xbox Series S|X Controller,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,guide:b8,leftstick:b9,rightstick:b10,leftshoulder:b4,rightshoulder:b5,dpup:h0.1,dpright:h0.2,dpdown:h0.4,dpleft:h0.8,leftx:a0,lefty:a1,rightx:a3,righty:a4,lefttrigger:a2,righttrigger:a5,platform:Linux,
```

This is useful as a probe, but it is not the preferred permanent product fix.

## Why this happened

There are two distinct normalization layers:

1. **InputPlumber normalization**
   - Converts Bandai's physical controls into a virtual evdev controller.
   - In the observed session it emitted a virtual `Microsoft Xbox Series S|X Controller`.

2. **Moonlight semantic mapping**
   - Converts an evdev controller GUID/name into semantic buttons and axes (`A`, `B`, D-pad, triggers, sticks, etc.) using `gamecontrollerdb.txt`.
   - The packaged DB did not know the observed InputPlumber-emitted GUID, so Moonlight could not map it without a temporary overlay.

InputPlumber did normalize the raw hardware into an Xbox-class virtual controller, but it did not normalize to the product contract Korri expects.

## Existing Korri intent

SM8550 platform code already appears to intend Xbox 360 normalization:

```text
product/systems/nixos/images/platforms/rocknix-sm8550.nix
```

Relevant shape:

```nix
inputplumberPackage =
  pkgs.runCommand "korri-rocknix-inputplumber-xb360"
    {
      meta.mainProgram = "inputplumber";
    }
    ''
      cp -a ${substratePackages.inputplumber} $out
      chmod -R u+w $out
      substituteInPlace $out/share/inputplumber/devices/02-ayn-controller.yaml \
        --replace-fail "  - xbox-series" "  - xb360"
    '';
```

However, physical Bandai still emitted `Microsoft Xbox Series S|X Controller`, which suggests one of:

- the deployed Bandai generation is not using this package override,
- the substitution is hitting the wrong file or wrong string,
- InputPlumber uses another device/profile file for this hardware,
- `xb360` changes an output mode setting but not the advertised Linux event name/GUID,
- or the active virtual device came from a stale/other InputPlumber path.

## Permanent fix options

### Option A — preferred: fix InputPlumber to emit the expected Xbox 360 virtual target

Make SM8550 InputPlumber really produce the expected Xbox 360 virtual controller shape.

Pros:

- Keeps InputPlumber as Korri's normalization boundary.
- Moonlight and all downstream consumers see a single stable virtual controller contract.
- Avoids carrying per-device Moonlight mapping patches for Bandai/Sobo.
- Matches Korri's existing architecture docs: raw hardware quirks belong in the platform/InputPlumber layer; Moonlight consumes the normalized virtual gamepad.

Costs/risks:

- Changes virtual device identity; tests/tools expecting `Microsoft Xbox Series S|X Controller` need adjustment.
- Must validate the full virtual output shape: buttons, triggers, sticks, D-pad, guide/back/start, axis ranges.
- Must confirm Korri inputd still resolves the normalized gamepad and axis metadata.
- Requires deployment and physical device validation.

### Option B — acceptable tactical fix: patch Korri's packaged Moonlight mapping DB

Append the corrected Series S/X GUID mapping to `${pkgs.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt` via `product/vendor/moonlight-embedded-korri`.

Pros:

- Directly fixes the observed Moonlight failure.
- Smaller change if InputPlumber output identity is intentionally Series S/X.

Costs/risks:

- Moonlight becomes responsible for a platform-normalization quirk.
- Other consumers may still see the unexpected Series S/X identity.
- Device-specific mappings can accumulate in Moonlight packaging.

## Recommended next implementation slice

1. Inspect the active Bandai InputPlumber package and config:

   ```bash
   ssh -p 2222 root@bandai 'systemctl cat inputplumber.service; systemctl show inputplumber.service -p Environment; readlink -f $(command -v inputplumber); find /run/current-system/sw /nix/store -path "*inputplumber*" -name "02-ayn-controller.yaml" 2>/dev/null | head -20'
   ```

2. Confirm the actual profile content in the running package:

   ```bash
   ssh -p 2222 root@bandai 'grep -R "xbox-series\|xb360\|output" -n /nix/store/*inputplumber*/share/inputplumber/devices /run/current-system/sw/share/inputplumber/devices 2>/dev/null | sed -n "1,160p"'
   ```

3. Fix `product/systems/nixos/images/platforms/rocknix-sm8550.nix` or the substrate InputPlumber package overlay so the deployed config truly emits the intended Xbox 360 virtual target.

4. Add/adjust a Nix check proving the package/profile contains the desired target and does not retain the undesired `xbox-series` target for the SM8550 platform.

   Candidate existing checks to update:

   ```text
   tools/testing/nix/korri-rocknix-sm8550-config-check.nix
   tools/testing/nix/korri-image-outputs-check.nix
   tools/testing/nix/korri-live-usb-config-check.nix
   ```

5. Deploy to Bandai and validate:

   ```bash
   ssh -p 2222 root@bandai 'cat /proc/bus/input/devices | grep -A8 -E "InputPlumber|Xbox|Microsoft"'
   ```

6. Relaunch Moonlight using the product/generic mapping DB and explicit normalized input device. Do **not** rely on the temporary overlay.

7. Validate D-pad and analog behavior:

   ```text
   L = L
   R = R
   U = U
   D = D
   analog axes correct
   A/B/X/Y correct
   L/R shoulders correct
   triggers correct enough for the target app
   ```

8. Re-run runtime-resolution validation after input is fixed:

   - Start from a fresh stream.
   - Use Steam Big Picture or another visible interactive surface.
   - Send `1280x720` and a lower accepted same-aspect resolution such as `640x360`.
   - Send Bandai-originated physical input after each switch.
   - Capture Bandai DSI-2 with explicit `SWAYSOCK` and `grim -o DSI-2`.
   - Capture host view with a working capture method; current X root/window capture failed during the direct run.

## Related files

```text
product/systems/nixos/images/platforms/rocknix-sm8550.nix
product/vendor/moonlight-embedded-korri/package.nix
product/platform/stream/moonlight-launch-spec.ts
tools/scripts/live-runtime-resolution-gate.sh
docs/deployment/korri-images.md
docs/handoffs/live-runtime-resolution-journey.md
tools/testing/fixtures/proc/bus-input-devices-inputplumber-xbox-series-virtual.txt
tools/testing/fixtures/proc/bus-input-devices-inputplumber-renumbered.txt
```

## Known adjacent issue

The standard Bandai runtime-resolution gate currently stalls in the gamescope-wrapped launcher: gamescope starts and connects to Wayland/DRI, but Moonlight does not reach local-control. Direct Moonlight works. This is tracked separately as `task-003 Fix Bandai runtime-resolution gate gamescope launch stall` and should not be conflated with the controller mapping/normalization issue.
