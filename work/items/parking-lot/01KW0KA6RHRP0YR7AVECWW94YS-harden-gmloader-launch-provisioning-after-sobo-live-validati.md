---
id: 01KW0KA6RHRP0YR7AVECWW94YS
slug: harden-gmloader-launch-provisioning-after-sobo-live-validati
title: Harden GMLoader launch provisioning after Sobo live validation
origin: parked
status: To Do
priority: high
labels:
  - gmloader
  - sobo
  - runtime-packaging
  - gamepad
  - portmaster
  - hardening
created: 2026-06-25
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/fix/gmloader-sobo-launch
  branch: fix/gmloader-sobo-launch
  commit: d55272ca
  repo: korri
  invoked_by: user
---

# Harden GMLoader launch provisioning after Sobo live validation

## Why it matters

Sobo proved that GMLoader can launch real GameMaker games through Korri, including a working gamepad-controlled Spelunky session, but the path is not fully productized. Several live-only repairs were needed: manual runtime resource provisioning, manual materialized-cache repair, and manual extraction of PortMaster's nested .port payload. Without hardening, users can see dry-run success but hit runtime/linker/config/input/package-shape failures on first real launch.

## Acceptance Criteria

- [ ] Sobo/RG353M GMLoader launches work from a fresh cache with no manual edits to ~/.local/share/korri/gmloader or /var/lib/korri/plugins/resources.
- [ ] The deployed system provisions or fulfills gmloader-next without relying on a device-local flake in /home/korri; runtime resource result symlink is created reproducibly during deploy/activation or by a robust full flake ref.
- [ ] gmloader-next package wrapper/RPATH includes all host runtime dependencies observed on Sobo: SDL2, zlib, bzip2, and bundled libzip/openal/crypto/support libs; ldd on the runner reports no missing libs on target hardware.
- [ ] Materializer emits a gmloader-next-compatible config using apk_path pointing at a zip/APK file, retains/synthesizes game.apk, and keeps main_apk only as metadata/back-compat.
- [ ] Materializer stages required Android shim libs under lib/arm64-v8a when missing: libm.so, libcompiler_rt.so, and libc++_shared.so from the runtime seed/package as appropriate.
- [ ] Old/broken cache entries are invalidated or repaired automatically when game.apk, apk_path, or required shim libs are missing.
- [ ] PortMaster distribution zips like spelunky.zip and stargrovescramble.zip are either explicitly rejected with a clear message or automatically unwrapped to their nested .port payloads; behavior is covered by tests.
- [ ] At least one controller-friendly title (Spelunky) is documented as a validation fixture and can be launched through Korri with gamepad controls working.
- [ ] If a title is touch-only, the UI/diagnostics distinguish touch-only from gamepad-capable and suggest Remap/touch follow-up instead of implying gamepad support.
- [ ] A Sobo or RG353M validation note is added to docs/research/gmloader-apk-compatibility-matrix.md covering Sacrificio, Last Girl, Kick or Treat, and Spelunky outcomes.

## Related

- `product/plugins/gmloader/packages/gmloader-next/default.nix`
- `product/plugins/gmloader/packages/gmloader-next/check.nix`
- `product/plugins/gmloader/src/gmloader-json.ts`
- `product/plugins/gmloader/src/installer.ts`
- `product/plugins/gmloader/src/path-launch.ts`
- `product/plugins/gmloader/src/materializer.ts`
- `docs/research/gmloader-apk-compatibility-matrix.md`
- `commit d55272ca fix(gmloader): repair sobo native launch materialization`
- `/var/lib/korri/config/local.korri.yaml on Sobo`
- `/var/lib/korri/plugins/resources/x406b6f7272693a676d6c6f61646572/x676d6c6f616465722d6e657874/result on Sobo`

## Notes

Live validation details: Sobo SSH alias was korri-goal-target via /tmp/korri-hostkeymatched-ssh_config. @korri:gmloader was enabled on SM8550 and Sobo config gained gmloader-apks storage plus Sacrificio Inc., Last Girl On Earth, Kick or Treat, and later Spelunky. Sacrificio first proved real rendering after manual launch fixes: the runner reached OpenGL ES 3.2 Mesa/freedreno, RunnerLoadGame assets/game.droid, Entering main loop, and Sway showed a GMLoader window. Initial failures before the live fix were: missing libSDL2-2.0.so.0/libz/libbz2; generated gmloader.json used main_apk while gmloader-next read apk_path and defaulted to game.apk; pointing apk_path at assets/game.droid failed because it is not a zip archive; pointing at the original APK then failed missing lib/arm64-v8a/libm.so; adding libm.so and libcompiler_rt.so from the runtime seed allowed launch. Kick or Treat launched but appeared touch-oriented. Last Girl On Earth launched and logs showed Controller 'Xbox 360 Controller' assigned to player 0, but user wanted a more control-friendly game. Spelunky worked with gamepad after extracting /tmp/spelunky.zip's nested spelunky/spelunky.port, copying it to Sobo as /var/lib/korri/content/gmloader/apks/spelunky.port, adding a spelunky-gmloader config entry, dry-running to materialize, then live-repairing /home/korri/.local/share/korri/gmloader/games/spelunky-ec32a3d801e4 with game.apk, apk_path: game.apk, use_joystick_as_dpad: true, and shim libs. The fixed runtime store path used live was /nix/store/z4dy4shj5gb630ljsxsbaxi7n38pf3y2-gmloader-next-2025-01-14_1009-c2fca354. A code fix was committed in worktree .worktrees/fix/gmloader-sobo-launch as d55272ca, but full Sobo deploy failed because fuji hit transient package tarball ConnectionRefused/FailedToOpenSocket while building unrelated korri-inputd dependencies. That means Sobo still has live/manual repairs plus fixed runtime symlink, not a fully redeployed corrected plugin. Preserve the distinction: generic fixes are game.apk/apk_path/shims/runtime deps; PortMaster-specific gap is unwrapping outer distribution zips to nested .port payloads.
