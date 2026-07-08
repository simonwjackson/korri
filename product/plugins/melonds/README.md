# melonDS plugin

`@korri:melonds` is Korri's first-party Nintendo DS launcher plugin for standalone melonDS.

## Scope

- Discovers `.nds` ROM files.
- Launches standalone melonDS with the ROM path as the positional argument.
- Uses HLE/direct boot by default, so user BIOS files are not required for v1 `.nds` launches.
- Materializes a Korri-managed `melonDS.toml` before launch for display and state behavior.
- Keeps melonDS config, saves, savestates, and cheats under the configured plugin state root.

## Out of scope for v1

- RetroArch `melonDS DS` core support.
- DSi mode, DSiWare, DSi NAND, and `.dsi` discovery.
- Archive-member discovery for zipped DS collections.
- UI controls for choosing layout presets.
- Physical multi-monitor placement of melonDS windows.
