# Framework research: Impermanence + NixOS live ISO persistence modes

Date: 2026-05-24

## Summary

Korri's requirement matches the Impermanence model: boot a locked/ephemeral system and persist only explicitly declared state. The main integration caveat is ordering: `nix-community/impermanence` is designed for persistent storage that is mounted by NixOS filesystem/initrd/local-fs machinery. Korri currently resolves and mounts the same-stick persistence root with a custom systemd oneshot after `local-fs.target`, so direct use of Impermanence's generated bind mounts/files will need an earlier mount authority or a project-local bind/link phase that runs after the same-stick resolver.

## Version information

- Korri root `nixpkgs` input is `nixpkgs-unstable`, locked to `NixOS/nixpkgs` rev `6368eda62c9775c38ef7f714b2555a741c20c72d` in `flake.lock`.
- Korri does not currently have an `impermanence` flake input.
- Current Korri live USB imports NixOS `installer/cd-dvd/iso-image.nix` and sets `isoImage.makeUsbBootable = true` and `isoImage.makeEfiBootable = true` in `nix/images/live-usb.nix`.
- Current same-stick persistence is in `nix/images/live-usb-runtime.nix` and `nix/images/live-usb-persistence-resolver.sh`: it derives the boot USB from `/iso`, requires parent transport `usb`, scans sibling partitions for label `KORRI-PERSIST`, otherwise mounts tmpfs and writes an ephemeral marker.

## Key concepts from official docs/source

### Impermanence module model

- Purpose: choose which files/directories persist between reboots; everything else is thrown away.
- Required shape:
  - an ephemeral/wiped root filesystem, commonly tmpfs;
  - at least one mounted persistent volume;
  - Impermanence NixOS/Home Manager modules to create bind mounts or links.
- NixOS module option: `environment.persistence."/persistent-root"` with:
  - `directories`: directories to bind mount from persistent storage;
  - `files`: files to bind mount or symlink;
  - `users.<name>.directories/files`: paths relative to that user's configured home;
  - `hideMounts`: adds `x-gvfs-hide` to directory bind mounts;
  - `allowTrash`: adds `x-gvfs-trash` to directory bind mounts.
- Important official note: all persistent and ephemeral storage volumes involved should be marked `neededForBoot`; the module also asserts this for declared filesystems.
- Directories are real bind mounts. Files use method `auto` by default: bind mount if the persistent target exists, symlink otherwise. `/etc/machine-id` is special-cased to create an `uninitialized` target and bind mount it.

### NixOS live ISO model

- NixOS `iso-image.nix` already gives live media an ephemeral root:
  - `/` is tmpfs;
  - `/iso` mounts the ISO by label/root device and is `neededForBoot`;
  - `/nix/.ro-store` is squashfs from the ISO;
  - `/nix/.rw-store` is tmpfs;
  - `/nix/store` is overlay lower=`/nix/.ro-store`, upper tmpfs.
- Live ISO kernel params are assembled into both BIOS/syslinux and UEFI/GRUB entries from `boot.kernelParams` plus per-entry params.
- `boot.kernelParams` is the normal option for adding kernel command-line parameters. Values must be strings without unquoted whitespace.
- ISO menu generation automatically includes NixOS `specialisation` entries. `iso-image.nix` asserts that all specialisations keep the same `isoImage.volumeID`.
- The ISO module has built-in option submenus that append params such as `copytoram`, `nomodeset`, `debug`, `console=ttyS0,115200n8`, and `systemd.mask=display-manager.service`.
- NixOS installation media has precedent for parsing custom live-media kernel args from `/proc/cmdline` (`live.nixos.passwd=*` in `installation-cd-base.nix`).

## Actionable constraints for Korri planning

### Same-stick persistence root

- Keep Korri's resolver as the authority for the approved persistence device. A generic `fileSystems."/persist".device = "/dev/disk/by-label/KORRI-PERSIST"` pattern is simpler but does not enforce “sibling partition of the booted USB” and weakens R2/R12.
- If using Impermanence directly, the persistence root must be available before Impermanence's generated file services and mount units run. Impermanence directory mounts are wanted by and run before `local-fs.target`; file link/bind services are also wired before `local-fs.target`.
- Current Korri resolver runs as a normal oneshot wanted by `multi-user.target` after `local-fs.target`; that is too late for direct `environment.persistence` mounts.
- Therefore the plan must choose one of these integration shapes:
  - move same-stick resolution early enough to satisfy Impermanence/local-fs ordering; or
  - keep the resolver at the current boot stage and implement/use an Impermanence-style allowlist phase after the resolver instead of relying on `environment.persistence` units; or
  - use Impermanence only for declarations/mental model and generate project-local mounts/links with explicit ordering before `greetd`/kiosk.

### Product allowlist

- Product mode should not persist broad `HOME`, broad `/etc`, broad `/var`, or the whole persistence root as the kiosk home.
- Good allowlist candidates from official/community Impermanence examples:
  - `/etc/machine-id` for stable machine identity, with the machine-id special-case caveat above;
  - `/etc/NetworkManager/system-connections` only if NetworkManager is actually enabled;
  - `/var/lib/nixos` or fixed uid/gid values if ownership of persisted files must remain stable while users/groups are dynamically assigned;
  - `/var/log` or a narrower diagnostic path only if product diagnostics require it.
- Korri-specific candidate state from repo evidence:
  - Korri desktop settings: `XDG_CONFIG_HOME/korri/desktop.yaml`;
  - selected Korri data/state under `XDG_DATA_HOME/korri` and `XDG_STATE_HOME/korri`, not necessarily all library/cache content;
  - Moonlight state currently routed to `home/.cache/moonlight` via `KORRI_MOONLIGHT_STATE_HOME`;
  - network/input setup paths must be service-specific; do not persist all of `/var/lib` just to catch unknown InputPlumber or network state.
- Permissions matter: Impermanence creates missing persistent directories with the declared user/group/mode, but changing those declarations later does not change already-created directories.

### Debug/broad persistence mode

- Use an explicit, namespaced kernel arg such as a `korri.*` argument; do not reuse the generic ISO `debug` option because the ISO already has a “Debug Console Output” menu that appends `debug` for boot debugging.
- Default boot entry must remain product mode. Debug should be a non-default menu entry or manually supplied kernel arg.
- If NixOS `specialisation` is used for the debug menu entry, it is a supported way for the ISO generator to add another bootable configuration, and its `boot.kernelParams` can distinguish debug. Caveat: the specialisation must keep the same `isoImage.volumeID`.
- If not using specialisation, plan a focused check against generated `/EFI/BOOT/grub.cfg` and `/isolinux/isolinux.cfg`; `iso-image.nix` does not expose a simple documented “extra arbitrary ISO menu entry” option in the source reviewed.
- Debug mode should still use the same same-stick approval path. It may broaden what is persisted after approval, but must not fall back to internal disks or unrelated labels.
- Debug SSH is currently separately gated by `services.korri.liveUsbPersistence.debugSsh.authorizedKeys`; broad persistence should not imply open SSH unless explicitly configured.

### Tmpfs/locked root caveats

- The live ISO already provides the locked-system baseline: root and writable store overlay are tmpfs, while the system closure is from squashfs on the ISO.
- tmpfs root can run out of memory/disk space under large downloads, logs, browser caches, or debug activity. Product allowlist should keep cache growth bounded.
- Data not copied/bound into persistence before crash/power loss is lost. This matters for custom post-boot copy-out schemes; bind/link allowlists avoid that class of loss for selected paths.
- The ISO “Copy ISO Files to RAM” option may break Korri's current resolver assumption that `/iso` points to the USB block device. After `copytoram`, `/iso` may be tmpfs, causing the resolver to fall back to ephemeral state unless the design captures boot-device identity earlier.

## Common issues and caveats

- Boot ordering is the highest-risk integration point. Community issue #202 reports services observing paths before some Impermanence home/system mounts are available; service ordering must be explicit for anything that reads persisted config early.
- Persisting `/etc/machine-id` has known systemd edge cases; current Impermanence includes a workaround merged in PR #242.
- If users/groups do not have fixed uid/gid values and `/var/lib/nixos` is not persisted, NixOS may reassign IDs across boots/config changes; this can corrupt ownership expectations on the USB persistence filesystem.
- NixOS wiki Impermanence page is marked outdated. Prefer the GitHub README/source for current option semantics.
- `hideMounts` is mainly for desktop file-manager presentation. Korri currently force-disables `udisks2` and `gvfs`, so it should not be treated as a safety mechanism.

## References

- Impermanence README: https://github.com/nix-community/impermanence/blob/master/README.org
- Impermanence NixOS module source: https://github.com/nix-community/impermanence/blob/master/nixos.nix
- Impermanence submodule options: https://github.com/nix-community/impermanence/blob/master/submodule-options.nix
- Impermanence file mount helper: https://github.com/nix-community/impermanence/blob/master/mount-file.bash
- NixOS live ISO source at Korri-pinned nixpkgs rev: https://github.com/NixOS/nixpkgs/blob/6368eda62c9775c38ef7f714b2555a741c20c72d/nixos/modules/installer/cd-dvd/iso-image.nix
- NixOS installation CD base custom cmdline parsing example: https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/installer/cd-dvd/installation-cd-base.nix
- NixOS `boot.kernelParams` option source: https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/system/boot/kernel.nix
- NixOS specialisation option source: https://github.com/NixOS/nixpkgs/blob/master/nixos/modules/system/activation/specialisation.nix
- Community issue on Impermanence mount timing: https://github.com/nix-community/impermanence/issues/202
- Machine-id workaround PR: https://github.com/nix-community/impermanence/pull/242
- Official NixOS Wiki page, marked outdated: https://wiki.nixos.org/wiki/Impermanence
