# `@korri:mgba`

This plugin owns the pinned mGBA source/build pipeline and declares the
`@korri:mgba/mgba` `libretro-core` runtime for `gba`.

The runtime explicitly targets `@korri:retroarch/retroarch`; korrid composes
the two independently enabled plugins through that declaration. The same
runtime identity selects the Android core packaged by Korri or the Linux core
supplied by Nix, depending on the device doing the launch.

## Temporary Android packaging

Android currently requires the core in RetroArch's private executable core
directory. Until a separate authenticated core-import path exists, the
RetroArch APK temporarily carries the mGBA plugin's built `.so` and installs
it there. This is a packaging bridge only: mGBA remains a separate plugin and
owns the source, build output, system, and runtime identity.

Build the core directly with `nix run .#mgba-build`.
