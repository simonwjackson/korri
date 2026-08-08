#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash git nix
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
export CARGO_TARGET_DIR="$ROOT/.cache/inputd-target"

cd "$ROOT/services/inputd"
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo check --manifest-path core/Cargo.toml --target wasm32-unknown-unknown

cd "$ROOT"
nix build --no-link \
  .#checks."$(nix eval --raw --impure --expr builtins.currentSystem)".inputplumber-korri-package \
  .#checks."$(nix eval --raw --impure --expr builtins.currentSystem)".korri-input-module \
  .#checks."$(nix eval --raw --impure --expr builtins.currentSystem)".korrid-linux-host-module \
  .#checks."$(nix eval --raw --impure --expr builtins.currentSystem)".korri-inputd-package
