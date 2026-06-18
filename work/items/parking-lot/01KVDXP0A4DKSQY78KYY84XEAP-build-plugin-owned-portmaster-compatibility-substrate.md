---
id: 01KVDXP0A4DKSQY78KYY84XEAP
slug: build-plugin-owned-portmaster-compatibility-substrate
title: Build plugin-owned PortMaster compatibility substrate
origin: parked
status: In Progress
priority: high
labels:
  - plugins
  - portmaster
  - compatibility
  - bandai
  - runtime
created: 2026-06-18
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: ff6ef741
  repo: simonwjackson/korri
---

# Build plugin-owned PortMaster compatibility substrate

## Why it matters

PortMaster catalog search and package acquisition are now first-party, but ready-to-play ports still need manual launch adaptation on Bandai/NixOS. A plugin-owned compatibility substrate would let users install and launch PortMaster entries through generic Korri plugin seams while keeping Korri core unaware of PortMaster-specific layouts, scripts, runtime packs, architecture quirks, and per-port compatibility overrides.

## Acceptance Criteria

- [x] `@korri:portmaster` can install a selected catalog zip into writable Korri storage, verify it, and emit an installed-port manifest without Korri core knowing PortMaster layout details.
- [ ] The PortMaster plugin provides a compatibility launch envelope for original PortMaster scripts, including control.txt, `/roms/ports` semantics, helper functions, shell compatibility, and safe device/helper stubs.
- [ ] Native aarch64 ready-to-run ports such as Wordle SDL install and launch from catalog through plugin-owned normalization, ELF repair, and foreground presentation.
- [ ] x86_64 ready-to-run ports such as Digger launch on Bandai through a plugin-owned FEX lane with bundled `libs.x86_64`, SDL backend handling, and foreground behavior.
- [ ] Runtime-dependent ports launch through plugin-declared dependencies such as gamescope, FEX, RetroArch/libretro, FRT/Godot, Love2D, Mono, Java, GL4ES/WestonPack/GMloader as those runtime plugins land.
- [ ] armhf and 32-bit x86 lanes are either supported through a rootfs/emulation strategy or reported as structured unsupported diagnostics.
- [ ] Installed PortMaster games materialize as normal Korri library entries with launch, stop, logs, diagnostics, and compatibility metadata owned by the plugin.
- [ ] The phased plan in `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md` remains the handoff brief and each phase ends with a real Bandai launch milestone.

## Related

- `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md`
- `product/plugins/portmaster/src/plugin.ts`
- `product/plugins/portmaster/packages/portmaster/default.nix`
- `product/plugins/portmaster/nix/composition.nix`
- `product/plugins/gamescope/src/plugin.ts`
- `product/plugins/fex-runtime/packages/fex-runtime/setup-env`

## Notes

Created after live Bandai smoke tests: Wordle SDL native aarch64 required shebang/ELF/display adaptation, and Digger x86_64 launched through FEX with SDL x11. User explicitly wants a plugin-owned approach where Korri core stays unaware and each phase has a launchable milestone.

2026-06-18 Phase 1 landed locally: added plugin-owned `portmaster.install` normalizer plus ZIP extraction, catalog MD5 verification, safe PortMaster ports-layout extraction, script/binary detection, and installed manifest emission. Live validation installed `wordlesdl.zip` from the packaged catalog, transferred the manifest tree to Bandai, applied the phase-allowed manual ELF patch/wrapper, and captured Wordle rendering from the installed tree.
