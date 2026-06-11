# Research: Running gamescope on a GPU without VK_EXT_physical_device_drm (Mali-G52 / RK3566 / llvmpipe)

## Summary
The hard reject lives in `src/rendervulkan.cpp` inside the `CVulkanDevice` Vulkan-device init path: gamescope unconditionally requires `VK_EXT_physical_device_drm` (and, for the DRM/atomic backend, working `VK_EXT_image_drm_format_modifier` import) before it will create a logical device. There is **no upstream meson option, env var, or CLI flag that bypasses this check** — `--allow-deferred-backend` only relaxes the per-format *modifier-set match* against the backend's advertised modifiers, not the `VK_EXT_physical_device_drm` requirement. No known fork (including ROCKNIX's own gamescope patches, ChimeraOS gamescope-session, Frogging-Family/gamescope-git, or the Arcan fork) has shipped a "software-only / texture-copy" fallback; the consistent prior-art answer on ARM SBCs is "wait for PanVK / pick a device whose Vulkan driver implements `VK_EXT_physical_device_drm`," and llvmpipe/lavapipe-only systems (QEMU, etc.) consistently fail with the exact error string you see. A patch to convert the reject into a warn + headless/SDL/shm fallback is technically small at the call site (one branch + a few `supportsModifiers()`/`hasDrmPrimaryDevId()` guard insertions), but the realistic blast radius is large because dmabuf import/export for XWayland clients, the DRM backend, and PipeWire capture all assume modifier-tagged images.

## Findings

1. **Exact source location of the reject** — In `src/rendervulkan.cpp` on master, the device-init path checks `drmProps.hasPrimary`; the `#else` / fallthrough branch emits the literal error and returns false:
   ```cpp
       if ( drmProps.hasPrimary ) {
           m_bHasDrmPrimaryDevId = true;
           m_drmPrimaryDevId = makedev( drmProps.primaryMajor, drmProps.primaryMinor );
       }
   }
   else
   #endif
   {
       vk_log.errorf( "physical device doesn't support VK_EXT_physical_device_drm" );
       return false;
   }
   ```
   This sits inside `CVulkanDevice` initialization (the `BInit`/`createDevice` path; the same TU also contains the assertion `gamescope: ../gamescope/src/rendervulkan.cpp:241: bool CVulkanDevice::BInit(VkInstance, VkSurfaceKHR): Assertion 'instance' failed.` reported by users, confirming `BInit` is the entry method and that the check is in the few-hundred-line range that drives logical-device creation). [rendervulkan.cpp on master (snippet)](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.cpp) · [Arch BBS stack trace pinning BInit](https://bbs.archlinux.org/viewtopic.php?id=291482)

2. **The `--allow-deferred-backend` flag does NOT bypass the extension check** — Its help text says "Allows initting the backend in a deferred way, if it doesn't work immediately. (Note: This has some very minor correctness compromises that you should consider wrt. your platform with modifiers, etc)." In `rendervulkan.cpp` the only place `g_bAllowDeferredBackend` is consulted is per-format modifier filtering:
   ```cpp
   // The deferred backend exposes all sample-able formats as supported modifiers.
   if ( !g_bAllowDeferredBackend ) {
       if ( GetBackend()->UsesModifiers() && !gamescope::Algorithm::Contains(
              GetBackend()->GetSupportedModifiers( drmFormat ), modifier ) )
           continue;
   }
   ```
   That is, the flag relaxes "is this `(format,modifier)` advertised by the backend" — it does not loosen the `VK_EXT_physical_device_drm` requirement nor the requirement that the driver expose `VK_EXT_image_drm_format_modifier`. [main.cpp help text](https://github.com/ValveSoftware/gamescope/blob/master/src/main.cpp) · [rendervulkan.cpp deferred-backend branch](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.cpp)

3. **Meson options do not have a "software fallback" knob** — `meson_options.txt` exposes `drm_backend`, `pipewire`, `rt_cap`, `enable_openvr_support`, etc. You can `-Ddrm_backend=disabled` to drop the KMS atomic backend, but the Vulkan-device init (and thus the `VK_EXT_physical_device_drm` check) is in the renderer, which builds unconditionally. [meson_options.txt](https://github.com/ValveSoftware/gamescope/blob/master/meson_options.txt) · [Build System docs](https://deepwiki.com/ValveSoftware/gamescope/6.1-build-system)

4. **Upstream issue tracker: many reports of the same error, all closed as "fix your ICD"** — Affected issues:
   - [#581 Get VK_EXT_physical_device_drm on Vega 64](https://github.com/ValveSoftware/gamescope/issues/581) — closed; fix is to force RADV via `VK_ICD_FILENAMES`/`AMD_VULKAN_ICD=RADV` (i.e. switch *away* from a driver that doesn't expose the extension).
   - [#727 VK_EXT_physical_device_drm (RX 6750 XT)](https://github.com/ValveSoftware/gamescope/issues/727) — same resolution.
   - [#1454 vkCreateDevice failed (-8) with gamescope ≥ 3.13.0](https://github.com/ValveSoftware/gamescope/issues/1454) — confirms 3.13 hardened the check; older 3.12.5 would log "physical device does not support DRM format modifiers" but still proceed. So pre-3.13 builds are slightly more permissive on the *modifier* warning but still reject on `VK_EXT_physical_device_drm`.
   - [#1515 Doesn't work in QEMU with AMD GPU (llvmpipe)](https://github.com/ValveSoftware/gamescope/issues/1515) — exact same llvmpipe failure you're seeing on RK3566; no maintainer fix offered.
   - [#1945 Gamescope fails vkCreateDevice on Raspberry Pi 5 (VideoCore VII / V3DV)](https://github.com/ValveSoftware/gamescope/issues/1945) — closest ARM-SBC analogue; V3DV does expose the extension but other gamescope expectations (queue priorities, swapchain_maintenance1, etc.) still fail.
   - [#1610 OpenGL ES backend (Spotify Car Thing, Mali-G31)](https://github.com/ValveSoftware/gamescope/issues/1610) — explicit request to support Mali-class devices without a Vulkan driver; left open, no GLES backend planned.
   No PR (open or closed) on `ValveSoftware/gamescope` adds a "no-modifiers / texture-copy" fallback for this check.

5. **No "gamescope-korri" fork exists publicly** — Search across GitHub, Codeberg, and general web for "gamescope-korri", "Korri gamescope", "Korri handheld" returns no fork. The closest non-Valve forks are: [Frogging-Family/gamescope-git](https://github.com/Frogging-Family/gamescope-git) (tracks master, no fallback patches — issue #4 there is the same DRM-modifier error with the same outcome), [ChimeraOS/gamescope-session](https://github.com/ChimeraOS/gamescope-session) (session wiring only, no renderer patches), and [sashabjorkman/GameScope (Arcan SHMIF backend)](https://codeberg.org/sashabjorkman/GameScope) which adds an Arcan backend but still goes through the same Vulkan init. The fork that *is* relevant for RK3566 is ROCKNIX's in-tree gamescope package (referenced by thorch-os/thorch as "ROCKNIX-patched Gamescope") — its patches are handheld quirks (mouse cursor visibility, pipewire enable, input mapping) rather than relaxing the DRM-modifier requirement. [thorch-os/thorch README](https://github.com/thorch-os/thorch) · [ROCKNIX/distribution-nightly release notes](https://github.com/ROCKNIX/distribution-nightly/releases)

6. **PanVK is the realistic path on Mali-G52 / RK3566** — Panfrost is OpenGL/GLES; PanVK is the Vulkan driver. Mesa docs: "PanVK … is currently conformant on Mali-G610, **but non-conformant on other GPUs**" (G52 is Bifrost, not Valhall, and gets at best Vulkan 1.0 on PanVK). The Mesa 26.1 PanVK extension-sprint blog enumerates new extensions PanVK is adding but does not yet list `VK_EXT_physical_device_drm` as exposed across Bifrost. The ROCKNIX nightly that "adds Vulkan to RK3566 handhelds" enables PanVK for emulator cores (PPSSPP) — those run as normal Vulkan apps, not under gamescope. [Mesa Panfrost docs](https://docs.mesa3d.org/drivers/panfrost.html) · [PanVK extension sprint](https://christian-gmeiner.info/2026-04-20-panvk-extensions/) · [ROCKNIX Vulkan-on-RK3566 thread](https://www.reddit.com/r/SBCGaming/comments/1r8eatc/recent_rocknix_release_adds_vulkan_to_rk3566/) · [ODROID forum note: "PanVK is our only hope … probably a ways off"](https://forum.odroid.com/viewtopic.php?t=48978)

7. **No documented success running gamescope on llvmpipe/lavapipe** — Every QEMU / no-GPU / software-Vulkan attempt traced (issue #1515 plus the Reddit threads below) fails at exactly the line in finding (1). There is no thread reporting a working `gamescope -- vkcube` under lavapipe at any frame rate. The Raspberry Pi 5 community runs Steam *without* gamescope (`STEAM_MULTIPLE_XWAYLANDS=1 gamescope … steam -gamepadui` works only when the V3DV ICD is used, and even then issue #1945 shows it's fragile). [Reddit linux_gaming thread](https://www.reddit.com/r/linux_gaming/comments/xbtbg8/gamescope_vulkan_error/) · [Steam-on-Pi-5 forum](https://steamcommunity.com/app/221410/discussions/0/4635985982183752247/) · [issue #1945](https://github.com/ValveSoftware/gamescope/issues/1945)

8. **What `m_bHasDrmPrimaryDevId` and `supportsModifiers()` are actually used for downstream** — In `rendervulkan.hpp`:
   ```cpp
   inline bool supportsModifiers()      { return m_bSupportsModifiers; }
   inline bool hasDrmPrimaryDevId()     { return m_bHasDrmPrimaryDevId; }
   inline dev_t primaryDevId()          { return m_drmPrimaryDevId; }
   ```
   Downstream consumers:
   - **dmabuf import/export queue ownership**: `externalQueue = m_device->supportsModifiers() ? VK_QUEUE_FAMILY_FOREIGN_EXT : VK_QUEUE_FAMILY_EXTERNAL_KHR;` already has a non-modifier branch — so the texture-import code is already partly modifier-agnostic.
   - **DRM backend scanout**: the DRM/atomic backend needs `primaryDevId` to match the KMS node; on an SBC where you want headless or SDL backend, this is irrelevant.
   - **XWayland dmabuf-feedback to clients**: gamescope reports `main_device = primaryDevId` to Mesa clients via `zwp_linux_dmabuf_feedback_v1`; without it, clients fall back to a non-dmabuf path.
   [rendervulkan.hpp](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.hpp) · [rendervulkan.cpp externalQueue branch](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.cpp)

9. **Patch-size estimate to turn the reject into a warn + non-modifier path** —
   - **Trivial part (≈ 5–15 LOC at the call site in finding 1)**: change `vk_log.errorf(...); return false;` to `vk_log.infof("VK_EXT_physical_device_drm not supported; running in degraded no-modifier mode"); m_bHasDrmPrimaryDevId = false; m_bSupportsModifiers = false;` and skip pulling `drmProps`.
   - **Required guards to add (~10–25 sites, mostly one-liners)**: every place that reads `m_drmPrimaryDevId`, calls `GetBackend()->UsesModifiers()`, or stuffs `VkImageDrmFormatModifierListCreateInfoEXT` into a `VkImageCreateInfo` `pNext` chain has to gate on `supportsModifiers()` first. Search hits show the main clusters in `rendervulkan.cpp` (`vulkan_create_texture_from_dmabuf`, `vulkan_create_texture_from_wlr_buffer`, the deferred-backend branch already shown, the `externalQueue` branch already shown) and in `wlserver.cpp` / dmabuf-feedback emission.
   - **Backend selection (~20 LOC)**: force `--backend sdl` or `--backend headless` when `!supportsModifiers()`; the DRM backend cannot work without modifiers and a primary devid.
   - **Effective realistic scope**: a single-file patch around 60–120 LOC against `src/rendervulkan.cpp` plus a 10–30 LOC change in `src/main.cpp` (force backend) and a similar small change in `src/wlserver.cpp` to suppress dmabuf-feedback when there's no primary devid. Total: **roughly 100–200 LOC, 3 files**.
   - **What you give up**: zero-copy dmabuf composition for XWayland Vulkan/GL clients (they go through a CPU read-back / shm path → big perf hit, exactly the framework you'd run on llvmpipe anyway), HDR scanout, color-managed scanout, and the DRM atomic backend. You keep XWayland window management, FSR/NIS shaders (they're plain compute shaders), and the SDL/headless output path.
   - **Why nobody has merged this upstream**: Valve's target is Steam Deck (RADV + KMS); a degraded path is dead weight in their CI matrix and would mask real driver bugs.

## Sources

Kept:
- [ValveSoftware/gamescope src/rendervulkan.cpp (master)](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.cpp) — primary source of the reject and of `supportsModifiers()` usage.
- [ValveSoftware/gamescope src/rendervulkan.hpp (master)](https://github.com/ValveSoftware/gamescope/blob/master/src/rendervulkan.hpp) — public surface of `supportsModifiers`/`hasDrmPrimaryDevId`.
- [ValveSoftware/gamescope src/main.cpp (master)](https://github.com/ValveSoftware/gamescope/blob/master/src/main.cpp) — help text for `--allow-deferred-backend`, `--backend` enumeration.
- [ValveSoftware/gamescope meson_options.txt](https://github.com/ValveSoftware/gamescope/blob/master/meson_options.txt) — confirms no software-fallback option exists.
- [Issue #1515 (QEMU/llvmpipe)](https://github.com/ValveSoftware/gamescope/issues/1515) — exact same log line on a software-Vulkan-only system.
- [Issue #1610 (GLES backend / Mali-G31)](https://github.com/ValveSoftware/gamescope/issues/1610) — explicit Mali-class request, no upstream fix.
- [Issue #1945 (Raspberry Pi 5)](https://github.com/ValveSoftware/gamescope/issues/1945) — nearest ARM-SBC datapoint.
- [Issue #1454 (3.13.0 hardened the check)](https://github.com/ValveSoftware/gamescope/issues/1454) — pinpoints when the check became stricter.
- [Frogging-Family/gamescope-git issue #4](https://github.com/Frogging-Family/gamescope-git/issues/4) — confirms popular tracking fork has no fallback patch either.
- [Arch BBS BInit assertion](https://bbs.archlinux.org/viewtopic.php?id=291482) — pins `CVulkanDevice::BInit` as the entry function.
- [Mesa Panfrost docs](https://docs.mesa3d.org/drivers/panfrost.html) — PanVK conformance status: only Mali-G610 conformant.
- [PanVK extension sprint blog (Christian Gmeiner, Apr 2026)](https://christian-gmeiner.info/2026-04-20-panvk-extensions/) — current PanVK extension coverage.
- [thorch-os/thorch](https://github.com/thorch-os/thorch) — confirms ROCKNIX maintains gamescope patches but for SM8550-class hardware, not RK3566 fallback.
- [ROCKNIX/distribution-nightly releases](https://github.com/ROCKNIX/distribution-nightly/releases) — ROCKNIX gamescope changes (pipewire enable, cursor fix), no DRM-check relaxation.
- [Collabora: Implementing DRM format modifiers in NVK](https://www.collabora.com/news-and-blog/news-and-events/implementing-drm-format-modifiers-in-nvk.html) — context on why drivers must implement this for gamescope to work.

Dropped:
- Reddit user threads about RADV vs amdvlk fix — same as issue #581, redundant.
- Generic Anbernic / RG35XX hardware listing pages — no engineering content.
- Haiku lavapipe threads — unrelated platform.
- DeepWiki overview pages — useful for orientation but secondary to the actual source files cited above.

## Gaps
- **Exact line numbers on `master` HEAD** could not be pinned without raw-file fetch (search snippets confirm the function and surrounding code but not the current line range). On the commit tip you target you should `git grep -n "doesn't support VK_EXT_physical_device_drm" src/rendervulkan.cpp` — expect a single hit, function `CVulkanDevice::BInit` / its `createDevice` helper, roughly within the first ~600 lines of the file.
- **Whether PanVK on Mali-G52 / RK3566 plans to expose `VK_EXT_physical_device_drm`** is not stated in the Mesa 26.1 sprint blog; need to check `panvk_physical_device.c` in mesa upstream and Collabora's panfrost feature-parity ticket directly.
- **No first-hand benchmark exists** for a degraded "no-modifier, SHM-readback" gamescope on llvmpipe or PanVK; expect well under 30 fps at 640×480 on RK3566 even for a trivial XWayland client, because every frame becomes a CPU copy.
- **Suggested next steps**:
  1. Clone gamescope at the version ROCKNIX packages, `git grep` the error string to pin the exact line.
  2. Prototype the 3-file patch in finding 9 against `--backend sdl --backend headless` first (no DRM scanout to worry about).
  3. Measure on RG353M with PanVK *before* committing to the patch — if PanVK on G52 advertises `VK_EXT_physical_device_drm` and `VK_EXT_image_drm_format_modifier`, you don't need the patch at all, only a PanVK rebuild.
  4. If a patch is required, propose it upstream behind a meson option (e.g. `-Drelaxed_modifiers=enabled`) so it doesn't enter Valve's default CI matrix — that's the only realistic path to merge.

## Supervisor coordination
No blocking decisions needed; returning research brief.
