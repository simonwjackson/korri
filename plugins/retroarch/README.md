# `@korri:retroarch`

This plugin owns the Android RetroArch launcher:

- `plugin.ts` declares `@korri:retroarch/retroarch` and its Android component.
- `android/` obtains, patches, builds, verifies, and installs the signed
  `com.korri.retroarch` APK.

Libretro cores are independent plugins. A library route selects this launcher
and a compatible runtime such as `@korri:mgba/mgba`; korrid composes them using
the runtime's explicit launcher and system compatibility declarations.

The APK temporarily carries the independently built mGBA `.so` so Android can
install it into RetroArch's private executable core directory. This packaging
bridge does not make mGBA part of the RetroArch plugin.
