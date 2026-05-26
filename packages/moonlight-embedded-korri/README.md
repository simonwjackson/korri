# moonlight-embedded-korri

`moonlight-embedded-korri` is Korri's downstream Moonlight Embedded package.

It layers on top of the nix-on-rocks Moonlight Embedded package inputs:

- nix-on-rocks owns the base SM8550/v4l2m2m Moonlight patch stack.
- Korri owns only the patches in this directory.

## Korri patches

### `0004-add-absolutetouch-flag-for-tap-to-click.patch`

Adds `-absolutetouch` for handheld touchscreen tap-to-click over the stream.

### `0005-add-sunshine-runtime-settings-mvp.patch`

Adds an experimental Sunshine runtime-settings request sender and ack logger for the `0x5504` / `0x5505` MVP protocol. It is controlled by:

- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_KBPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S`

This is experimental and should remain gated until Sunshine-side capability negotiation is formalized.
