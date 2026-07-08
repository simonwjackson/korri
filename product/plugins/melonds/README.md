# melonDS plugin

`@korri:melonds` is Korri's first-party Nintendo DS launcher plugin for standalone melonDS.

## Scope

- Discovers `.nds` ROM files.
- Launches standalone melonDS with the ROM path as the positional argument.
- Uses HLE/direct boot by default, so user BIOS files are not required for v1 `.nds` launches.
- Materializes a Korri-managed `melonDS.toml` before launch for display, input, and state behavior.
- Keeps melonDS config, saves, savestates, cheats, and presentation support files under the configured plugin state root.
- Provides two generic first-party Nintendo DS launchers:
  - `@korri:melonds/melonds` for normal melonDS layouts such as vertical, horizontal, hybrid, top-only, bottom-only, and dual-window.
  - `@korri:melonds/matched-dual-screen` for device-owned matched dual-screen presentation.

## Matched dual-screen presentation

The matched dual-screen launcher is device-neutral. User/game config chooses the generic intent (`matched-dual-screen`); platform/device defaults provide physical output names, rectangles, Wayland/Sway control, and secondary-output power policy.

On dual-panel SM8550 devices, platform defaults provide the matched geometry and disable `@korri:gamescope` for the matched launcher so Sway can place melonDS' native Wayland windows independently. Single-panel SM8550 devices do not receive bottom-screen geometry, so explicit matched launches without complete platform geometry fail before spawn instead of opening unusable off-screen windows.

The materializer owns managed presentation files on every launch:

- `melonDS.toml` is rewritten for managed keys, including dual-window mode and the InputPlumber/Xbox-style joystick profile when selected.
- `presentation/hide-menubar.qss` is generated when menu suppression is enabled.
- `presentation/matched-dual-screen.json` is generated for the packaged `korri-melonds-presenter` helper.

`korri-melonds-presenter` reads the generated payload, forces direct Wayland/Sway presentation, powers the secondary output on for the launch, waits for exactly one top and bottom melonDS window, makes them floating, places them at the configured rectangles, and restores the observed secondary-output power state when melonDS exits.

## Operational cleanup after deployment

After a device image/config with the first-party matched launcher has been deployed and a dual-panel smoke test passes, remove any temporary Bandai prototype files that were used before this product path existed:

- `/var/lib/korri/config/melonds-local.korri.yaml`
- local Tetris-only overrides that select a process launcher instead of `@korri:melonds/matched-dual-screen`
- `/var/lib/korri/bin/melonds-dual-screen`

Do not remove those files before dry-run and device smoke prove the first-party matched launcher is being used.

## Out of scope for v1

- RetroArch `melonDS DS` core support.
- DSi mode, DSiWare, DSi NAND, and `.dsi` discovery.
- Archive-member discovery for zipped DS collections.
- Portal UI controls for choosing layout presets.
