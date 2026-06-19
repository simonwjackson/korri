# Box64 runtime plugin

`@korri:box64-runtime` provides Korri's first-party Box64 runtime and launch companion for aarch64 systems running x86_64 Linux payloads.

The plugin keeps game-side x86_64 library lookup separate from native ARM64 graphics/system libraries:

- `BOX64_LD_LIBRARY_PATH` is for the game directory and bundled x86_64 libraries.
- Native graphics paths such as Mesa, Vulkan, GL, EGL, and DRM stay in normal native environment variables owned by graphics plugins such as `@korri:turnip`.

Game integrations opt in explicitly with `launch.with."@korri:box64-runtime"`; Korri does not sniff binaries or environment variables to decide when Box64 applies.
