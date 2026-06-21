# CDP Input Bridge

Launch-owned controller-to-keyboard bridge for keyboard-only Chromium games.

## Safety contract

- Reads only the InputPlumber normalized virtual controller selected by policy.
- Does not read raw `/dev/input/.inputplumber/sources/*` gamepads.
- Does not use InputPlumber profile switching.
- Does not start `ydotoold`, write `/dev/uinput`, or create a host-seat virtual keyboard.
- Dispatches keyboard events only to one matching Chromium CDP page.
- Stops before session cleanup and exits when the watched Chromium pid or CDP websocket exits.

## Annotation

Launches opt in with `launchMetadata.annotations["@korri:cdp-input-bridge"]`:

```json
{
  "enable": true,
  "cdpPort": 9333,
  "mapping": "yfs-default",
  "sourcePreference": {
    "names": ["Microsoft Xbox Series S|X Controller"]
  },
  "target": { "type": "page", "urlPattern": "index.html" }
}
```

Malformed annotations fail launch closed.

## Sobo validation matrix

After launching YFS through Korri/sessiond:

1. Confirm gameplay responds to D-pad, left stick, right stick, `Z`, `A`, `X`, `S`, and `P` mappings.
2. Confirm no `ydotoold` process exists.
3. Confirm `/proc/bus/input/devices` has no new `ydotoold virtual device` or other host-seat virtual keyboard from this feature.
4. Confirm the selected source is the InputPlumber virtual controller, not a raw source device.
5. Kill the watched Chromium pid and verify `korri-cdp-input-bridge` exits.
6. Return to Korri UI and verify controller input is not converted into keyboard events.
