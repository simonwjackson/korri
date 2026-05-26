# sunshine-korri

`sunshine-korri` is Korri's downstream Sunshine package for carried patches that are useful to Korri before they are upstreamed, redesigned, or retired.

The package is intentionally an umbrella, not a single-feature fork. Patches may be unrelated. Each patch should explain:

- what behavior it changes,
- whether it is experimental or intended for upstreaming,
- what evidence exists,
- when it can be removed.

## Current patches

### `0001-runtime-bitrate-restart-mvp.patch`

Experimental live bitrate-control MVP:

- Adds Sunshine control packet `0x5504` for runtime settings requests.
- Adds Sunshine control packet `0x5505` for structured acks.
- Supports operation `1`: set stream bitrate in kbps.
- Supports operation `2`: set effective stream FPS at or below the launch FPS.
- Supports operation `3`: set stream resolution to same-or-smaller same-aspect even dimensions.
- Requires `SUNSHINE_LIVE_SETTINGS_MVP=1`.
- Only `h264_vaapi` via Sunshine's AVCodec/VAAPI path is currently supported.
- Recreates the active AVCodec/VAAPI encoder session with the requested bitrate or resolution.
- Applies runtime FPS as experimental frame pacing without renegotiating stream resolution or client capabilities.
- Runtime resolution remains experimental until client-side decode/render survival evidence is recorded.
- Does not use the failed AVCodec field/AVOption mutation fallback.
- Verified on `aka` with `h264_vaapi` and Moonlight receiving `status=0` acks.

Runtime settings status contract:

- `0` — applied
- `1` — failed or unsupported
- `2` — invalid
- `3` — disabled

Evidence is recorded in:

- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`

## Removal/upstream policy

Remove or replace a carried patch when one of these becomes true:

1. Sunshine upstream accepts an equivalent feature.
2. Korri no longer needs the behavior.
3. A cleaner patch supersedes the current one.
4. The evidence shows the approach is unsafe or too narrow for continued carrying.
