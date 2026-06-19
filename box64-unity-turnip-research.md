# Research: Box64 x86_64 Unity Linux games on ARM64 Mesa/Turnip/Freedreno

## Summary
Box64 is plausible for x86_64 Linux Unity games on ARM64 when the game can use Box64’s wrapped native graphics stack: run the x86_64 game/Unity libraries under Box64, but keep Vulkan/OpenGL/Mesa/DRM/LLVM as one coherent native ARM64 Mesa/Turnip/Freedreno stack. The most likely fixes are library-path hygiene: put game x86_64 libraries only in `BOX64_LD_LIBRARY_PATH`, keep native Mesa/loader paths in normal native loader variables, and force the Vulkan loader to the ARM64 Turnip/Freedreno ICD JSON with `VK_DRIVER_FILES`/`VK_ICD_FILENAMES`.

## Findings
1. **Box64 is designed for mixed execution, but only for wrapped system libraries** — Box64 translates x86_64 code while trying native versions of wrapped system libraries such as libc/SDL/OpenGL first; if not found/wrapped it falls back to emulated libraries from the current folder, subfolders, `LD_LIBRARY_PATH`, or `BOX64_LD_LIBRARY_PATH`. This is why graphics can be fast, but it also means Mesa library path contamination can break runs. [Box86/Box64 easy-use explanation](https://box86.org/2022/02/box86-box64-are-easy-to-use/), [Debian box64 manpage](https://manpages.debian.org/testing/box64/box64.1.en.html)
2. **Unity needs conservative Box64 dynarec settings** — Box64’s own usage docs/manpage identify UnityPlayer and apply `BOX64_UNITY=1`; Linux Unity mode applies `BOX64_DYNAREC_STRONGMEM=1`. The README also calls out Unity games and recommends `MESA_GL_VERSION_OVERRIDE=3.2` plus `BOX64_DYNAREC_STRONGMEM=1` on Pi-class devices. [Box64 usage docs](https://github.com/ptitSeb/box64/blob/main/docs/USAGE.md?plain=1), [Box64 README](https://github.com/ptitSeb/box64)
3. **Vulkan ICD selection should be native ARM64, not guest x86_64** — The Vulkan loader uses manifest JSON files to discover ICDs, and `VK_DRIVER_FILES` overrides normal system discovery so only the listed manifests are used; `VK_ICD_FILENAMES` is the older/common equivalent seen in tooling. For Box64+Turnip, point this to the ARM64 Freedreno/Turnip JSON, e.g. `/usr/share/vulkan/icd.d/freedreno_icd.aarch64.json`, `/usr/share/vulkan/icd.d/turnip_icd.aarch64.json`, or the Nix/ROCKNIX equivalent under `/run/opengl-driver/share/vulkan/icd.d/...`. [Khronos Vulkan loader driver interface](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md)
4. **`libLLVM`/`libGLX_mesa` errors usually mean Mesa architecture or closure mixing** — Errors like `libLLVM-*.so: wrong ELF class`, missing `libGLX_mesa.so.0`, or “using libGLX_mesa from provider system for some but not all architectures” are classic symptoms of the loader finding Mesa pieces from different architectures or providers. In this case, `libGLX_mesa.so.0`, `libEGL_mesa.so.0`, DRI drivers, `libLLVM`, `libdrm`, `libgbm`, and Vulkan ICD driver libraries should all come from the same native ARM64 Mesa/Turnip closure. [Steam/Mesa wrong-ELF example](https://www.reddit.com/r/archlinux/comments/ya67g3/steam_libgl_error/?rdt=51374), [Flatpak Steam mixed-provider example](https://github.com/flathub/com.valvesoftware.Steam/issues/1262)
5. **Recommended environment shape** — Start from a narrow environment rather than inheriting host/game paths:

   ```sh
   export BOX64_LD_LIBRARY_PATH="$GAME_DIR:$GAME_DIR/lib:$GAME_DIR/lib64:$GAME_DIR/MonoBleedingEdge/x86_64"
   export BOX64_PATH="$GAME_DIR:$GAME_DIR/bin"
   export BOX64_DYNAREC_STRONGMEM=1
   export BOX64_UNITY=1
   export BOX64_PREFER_EMULATED=0
   # Use only if a wrapped library must be forced to the game's x86_64 copy:
   # export BOX64_EMULATED_LIBS="libsteam_api.so"

   # Native ARM64 graphics stack; exact paths depend on distro/Nix image.
   export VK_DRIVER_FILES="/run/opengl-driver/share/vulkan/icd.d/freedreno_icd.aarch64.json"
   # or: export VK_ICD_FILENAMES="$VK_DRIVER_FILES"
   export LD_LIBRARY_PATH="/run/opengl-driver/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
   export LIBGL_DRIVERS_PATH="/run/opengl-driver/lib/dri"
   export __EGL_VENDOR_LIBRARY_DIRS="/run/opengl-driver/share/glvnd/egl_vendor.d"
   ```

6. **For Nix/ROCKNIX-style systems, prefer absolute Mesa closure paths** — If the ICD JSON’s `library_path` is relative, the native dynamic linker must be able to find `libvulkan_freedreno.so`/Turnip and its native dependencies via `LD_LIBRARY_PATH` or RPATH. If the JSON names an absolute Nix store path, prefer using that generated JSON and keep `LD_LIBRARY_PATH` smaller. Do not add x86_64 Mesa paths to `LD_LIBRARY_PATH`; if guest-only libraries are needed, put them in `BOX64_LD_LIBRARY_PATH` instead.
7. **Plausibility verdict** — Plausible for DRM-free/native-Linux Unity games, especially Vulkan titles or OpenGL titles using Box64’s wrapped GL stack. Risk remains medium-high: failures are likely around Steamworks/launcher dependencies, Unity anti-cheat/DRM, unusual native plugins, GLX/EGL path discovery, or Mesa/LLVM ABI mismatches. Treat it as a viable prototype path, not a guaranteed production runtime without per-game validation.

## Sources
- Kept: Box64 README (https://github.com/ptitSeb/box64) — primary project guidance; mentions Unity, OpenGL needs, and relevant env vars.
- Kept: Box64 usage docs/manpage (https://github.com/ptitSeb/box64/blob/main/docs/USAGE.md?plain=1, https://manpages.debian.org/testing/box64/box64.1.en.html) — authoritative list of `BOX64_*` environment variables and Unity detection behavior.
- Kept: Box86/Box64 easy-use article (https://box86.org/2022/02/box86-box64-are-easy-to-use/) — explains native-vs-emulated library resolution model directly.
- Kept: Khronos Vulkan loader driver interface (https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md) — primary Vulkan loader source for ICD discovery and `VK_DRIVER_FILES` behavior.
- Kept: Mesa/Steam error examples (https://www.reddit.com/r/archlinux/comments/ya67g3/steam_libgl_error/?rdt=51374, https://github.com/flathub/com.valvesoftware.Steam/issues/1262) — not Box64-specific, but useful evidence for diagnosing wrong-architecture/mixed-provider Mesa errors.
- Dropped: Medium install tutorials — useful package lists, but redundant and less authoritative than Box64 docs/manpages.
- Dropped: Reddit/Winlator tuning claims — practical anecdotes, but too noisy for primary recommendations.

## Gaps
- I did not find a primary Box64+Turnip case study for a specific x86_64 Linux Unity game on the target ARM64 device. Validate with one concrete Unity title and capture `BOX64_LOG=1`, `BOX64_DYNAREC_LOG=0`, `VK_LOADER_DEBUG=all`, and `LIBGL_DEBUG=verbose` logs.
- Exact ICD names vary by Mesa packaging (`freedreno_icd.aarch64.json`, `turnip_icd.aarch64.json`, or Nix-generated paths). Next step: inspect the target image’s `/run/opengl-driver/share/vulkan/icd.d/` and Mesa closure before wiring launch env.
