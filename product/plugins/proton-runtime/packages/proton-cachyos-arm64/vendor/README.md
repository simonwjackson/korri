# proton-cachyos-arm64 vendored input

This directory is the self-contained source input for the `proton-cachyos-arm64`
Nix derivation. Replace `proton-cachyos-11.0-20260601-slr-arm64/` with the
validated Bandai ARM64-native proton-cachyos payload when producing a device
image. The derivation strips `require_tool_appid` from `toolmanifest.vdf` during
installation so Steam can use it as a locally-provisioned compatibility tool.
