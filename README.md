# Korri

Korri is being rebuilt from an empty mainline, one end-to-end slice at a time.

The first target is Android, built around the Artemis streaming client
(`~/code/sandbox/artemis`). Each slice brings in only the code it needs.

## Branches

- `main` — the new mainline. Orphan branch; history starts here.
- `legacy` — the previous product in full: NixOS kiosk, ROCKNIX/SM8550 device
  payloads, x86 live USB, web portal, plugin ecosystem. Kept as reference and
  as the source to harvest code from. Nix-on-ROCKS device support is paused,
  not deleted.
