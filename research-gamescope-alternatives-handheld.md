# Research: Gamescope alternatives & forks for Mali-G52 / RK3566 / RG353M

## Summary
On Mali-G52 / RK3566 hardware (RG353M class), gamescope is effectively blocked by two
independent issues: (1) wlroots cannot share buffers with the libmali blob Wayland stack
because the blob requires the proprietary `mali_buffer_sharing` protocol, and (2) the only
fully-conformant Vulkan path on this SoC family today is llvmpipe / lavapipe, which gamescope
rejects via its DRM-modifier / device-suitability checks. No active handheld distro (ROCKNIX,
JELOS, ArkOS, ANBERNIX, Batocera, RetroDeck) is known to run gamescope on a Mali-G52 device;
ROCKNIX's gamescope packaging is in practice exercised only on the SM8550 (Adreno) Thor. The
credible bypasses are kiosk compositors that do not require Vulkan WSI on the host (`cage`,
`weston kiosk-shell`) or going compositor-less with RetroArch in `kmsdrm`, accepting the loss
of FSR, MangoHud overlay layer, and the gamescope-specific frame-pacing / scaling pipeline.

## Findings

1. **ROCKNIX itself flags the wlroots × libmali incompatibility on Mali GPUs.** The
   `mesa-panfork` mirror README states: "Panfrost wlroots + Blob Wayland does not work because
   wlroots does not expose the `mali_buffer_sharing` protocol." This is the proximate reason
   gamescope (a wlroots-based compositor) cannot consume the libmali Wayland surface on
   RK3566/RK3568 hardware that still ships the blob. [Source](https://github.com/ROCKNIX/mesa-panfork)

2. **Panfrost / PanVK Vulkan support for Mali-G52 is not production-ready.** Mesa's Panfrost
   docs declare PanVK conformant only on Mali-G610 (Valhall / v10, RK3588); Mali-G52 is
   non-conformant. Vulkan 1.2/1.4 milestones explicitly reference G610. So on RG353M there is
   no upstream, conformant Vulkan ICD — leaving llvmpipe/lavapipe as the only option for
   gamescope, which gamescope itself rejects.
   [Source](https://docs.mesa3d.org/drivers/panfrost.html) ·
   [Source](https://www.khronos.org/news/archives/panvk-reaches-vulkan-1.2-conformance-on-mali-g610) ·
   [Source](https://www.collabora.com/news-and-blog/news-and-events/panvk-now-supports-vulkan-1.4.html)

3. **ROCKNIX carries a gamescope patch series, but the only device that actually consumes it
   is the Qualcomm SM8550 (AYN Thor, Adreno 740).** The thorch README spells this out: it
   reuses "ROCKNIX-patched Gamescope, MangoHud SM8550 GPU support/config, and InputPlumber
   maps", and notes the project "would not boot on Thor without ROCKNIX". RK3566 / Mali-G52
   targets are not part of ROCKNIX's gamescope enablement.
   [Source](https://github.com/thorch-os/thorch)

4. **ROCKNIX nightly changelogs show ongoing gamescope work, but no Mali-G52 bring-up.**
   Recent entries: `gamescope: enable pipewire support (Gianni Spadoni)`, `bugfix: gamescope:
   fix mouse cursor invisibility (tiopex)`. None reference Mali, Panfrost, PanVK, libmali, or
   RK3566.
   [Source](https://github.com/ROCKNIX/distribution-nightly/releases)

5. **No public "gamescope-korri" fork could be located.** Searches for `gamescope-korri`,
   `"3.16.23-korri"`, and a `Korri` GitHub org returned zero hits. The name is not a known
   public gamescope fork. This is likely a private build, a misremembered name, or a
   downstream packaging suffix that has not been published. Treat as unverified until the user
   supplies a repo URL. (Negative result: Brave search returned `No results found` for the
   literal strings.)

6. **The de-facto "launcher contract" used by Steam-Deck-style sessions is ChimeraOS
   gamescope-session, and it hard-calls the `gamescope` binary.** Its
   `gamescope-session-plus` script builds a literal `gamescope` command line (`GAMESCOPECMD`)
   with flags like `--prefer-vk-device`, `--adaptive-sync`, `--hdr-enabled`, etc. There is no
   abstraction over the compositor: swapping in `cage` or `weston` requires replacing the
   session script, not flipping a config flag. Korri-style sessions on handheld distros that
   imitate this layout will have the same coupling.
   [Source](https://github.com/ChimeraOS/gamescope-session/blob/main/usr/share/gamescope-session-plus/gamescope-session-plus) ·
   [Source](https://github.com/ChimeraOS/gamescope-session)

7. **Cage is the closest drop-in kiosk compositor for "fullscreen single app on wlroots".**
   It "displays a single maximized application at a time and prevents the user from
   interacting with anything but this application", and v0.3 explicitly retargets toward
   embedded use cases. It does not implement FSR, integer upscale, MangoHud-style overlays,
   adaptive-sync policy, or gamescope's WSI-bypass nested-Vulkan pipeline — but it boots on
   any wlroots-capable stack, including ones where gamescope's checks fail. Same wlroots ×
   `mali_buffer_sharing` caveat applies: works with Panfrost+Mesa, not with the libmali blob
   Wayland surface.
   [Source](https://github.com/cage-kiosk/cage) ·
   [Source](https://www.phoronix.com/news/Cage-0.3-Released) ·
   [Source](https://events.opensuse.org/conferences/oSLO/program/proposals/3143)

8. **Weston's `kiosk-shell` is the libweston-native equivalent, with a documented
   single-app/per-output app-id binding.** It is "a simple shell targeted at
   single-app/kiosk use cases" and "makes all top-level application windows fullscreen". On
   Mali this is the more pragmatic path: Weston historically integrates with vendor Wayland
   stacks (including libmali) more reliably than wlroots because it does not assume the
   `mali_buffer_sharing` issue away. No FSR, no frame-limit policy, no MangoHud layer; you
   get fullscreen composition and KMS/DRM output. Suitable for a launcher that runs one
   target at a time.
   [Source](https://wayland.pages.freedesktop.org/weston/toc/kiosk-shell.html) ·
   [Source](https://man.archlinux.org/man/weston.ini.5.en) ·
   [Source](https://www.phoronix.com/news/Wayland-Weston-Kiosk-Shell)

9. **Arcan has an experimental gamescope fork (SHMIF backend).** A
   GameScope-on-Arcan fork at codeberg integrates Arcan's SHMIF and folds in NixOS gamescope
   patches. It is interesting as prior art for "gamescope without wlroots WSI" but is not a
   handheld solution and not Mali-targeted.
   [Source](https://codeberg.org/sashabjorkman/GameScope)

10. **A no-compositor escape hatch exists: RetroArch directly on `kmsdrm`.** This is the
    long-standing path used by ArkOS / JELOS-class distros for emulator-first handhelds —
    RetroArch drives the framebuffer through DRM/KMS, EGL via GBM (Panfrost OpenGL ES), no
    Wayland compositor in the stack. Sacrifices: no per-window FSR, no MangoHud Wayland
    overlay (RetroArch's own overlay only), no app sandboxing, only one app at a time. It is
    what most Mali-G52 handhelds actually ship in practice. (General Mesa/Panfrost stack
    described in the upstream docs above; this is documented behavior of the Mesa Panfrost
    OpenGL ES driver, not a Mali-specific gamescope replacement.)
    [Source](https://docs.mesa3d.org/drivers/panfrost.html)

11. **Capability matrix vs. gamescope (qualitative, based on the above sources):**

    | Capability                          | gamescope | cage    | weston kiosk-shell | RetroArch kmsdrm |
    |-------------------------------------|-----------|---------|--------------------|------------------|
    | Fullscreen single-app kiosk         | yes       | yes     | yes                | yes              |
    | Works on libmali blob Wayland       | no (wlroots issue) | no (wlroots) | likely (libweston) | n/a (no compositor) |
    | Works on Panfrost OpenGL only       | no (Vulkan-required) | yes | yes               | yes              |
    | FSR / integer upscale / sharpness   | yes       | no      | no                 | partial (RA shaders) |
    | Frame-limiter / pacing policy       | yes       | no      | minimal            | no               |
    | Per-app input remap                 | yes (via Steam Input) | no | no             | yes (RA core)    |
    | MangoHud Wayland overlay layer      | yes       | as Wayland client | as Wayland client | no (RA-only OSD) |
    | Adaptive-sync / HDR plumbing        | yes       | no      | partial            | no               |
    | Nested Wayland (run another comp)   | yes       | limited | no                 | no               |

## Sources

- Kept:
  - ROCKNIX `mesa-panfork` README (https://github.com/ROCKNIX/mesa-panfork) — direct statement
    of the wlroots × `mali_buffer_sharing` blocker.
  - Mesa Panfrost docs (https://docs.mesa3d.org/drivers/panfrost.html) — authoritative
    conformance status for Mali-G52 vs G610.
  - Khronos / Collabora PanVK announcements — Vulkan version & GPU scope, dated and primary.
  - ROCKNIX nightly release notes (https://github.com/ROCKNIX/distribution-nightly/releases)
    — confirms which gamescope changes are landing and the absence of Mali bring-up.
  - thorch-os README (https://github.com/thorch-os/thorch) — confirms ROCKNIX's gamescope
    patch series is consumed on SM8550, not RK3566.
  - ChimeraOS `gamescope-session` (https://github.com/ChimeraOS/gamescope-session) —
    real-world session-launcher contract; demonstrates hard binary coupling.
  - cage repo and Phoronix release coverage — concrete capability + maintenance signal.
  - Weston `kiosk-shell` upstream docs — authoritative description of its scope.
  - Codeberg `sashabjorkman/GameScope` (Arcan) — prior art for non-wlroots gamescope backend.

- Dropped:
  - Various Reddit threads about Rockchip GPU drivers — anecdotal, no signal beyond what the
    Mesa docs already state.
  - Arch Linux ARM package index pages for gamescope — confirms a build exists, says nothing
    about whether it functions on Mali-G52.
  - General "ChimeraOS/gamescope" mirror — a downstream mirror, not a distinct fork with
    Mali-relevant patches.

## Gaps

- **`gamescope-korri` / `3.16.23-korri` was not found in public search.** If this is a real
  fork, please provide the upstream URL (GitHub/Codeberg/GitLab) so its patch series can be
  read directly. The literal strings returned zero hits, which usually means private repo,
  vanity-branded tarball, or a name mismatch.
- **No primary evidence that any handheld distro has gamescope working on Mali-G52.** Absence
  of evidence is not proof, but the combination of (a) Panfrost non-conformance on G52, (b)
  wlroots × libmali incompatibility, and (c) ROCKNIX confining its gamescope work to SM8550
  is strongly consistent with "no one has shipped this".
- **The exact gamescope code path that rejects llvmpipe / lavapipe on Mali was not
  re-confirmed in this pass** (the prior `progress.md` was tracking it in `rendervulkan.cpp`).
  If a fork upstream relaxes that check, the patch is small in principle; worth opening
  `rendervulkan.cpp` `chooseVulkanDevice` / DRM-modifier validation in a follow-up.
- **Suggested next steps:**
  1. Ask the requester for the canonical URL of "gamescope-korri" and the Korri launcher
     repo(s); confirm whether the launcher is a ChimeraOS-style hard-coupled session or a
     thinner contract.
  2. Prototype `cage` + RetroArch and `weston kiosk-shell` + RetroArch on RG353M with the
     existing Panfrost stack, treating FSR/MangoHud as deferred follow-up work, to validate
     the "credible bypass" hypothesis end-to-end.
  3. If FSR / scaling is load-bearing for the product UX, consider running RetroArch in
     `kmsdrm` and using RetroArch's slang shader pipeline (CRT / AA / sharpen) as the
     stand-in, rather than chasing gamescope on Mali.
