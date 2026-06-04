#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  version="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.dependencies.electrobun.replace(/^v/, ""))')"
fi
version="${version#v}"

declare -A arch_by_system=(
  [x86_64-linux]=x64
  [aarch64-linux]=arm64
)

echo "Electrobun version: $version" >&2
if command -v bun >/dev/null 2>&1; then
  echo "pkgs.bun equivalent in this shell: $(bun --version)" >&2
fi

prefetch() {
  local kind="$1"
  local system="$2"
  local arch="${arch_by_system[$system]}"
  local url="https://github.com/blackboardsh/electrobun/releases/download/v${version}/electrobun-${kind}-linux-${arch}.tar.gz"

  if ! curl -fsI -L "$url" >/dev/null; then
    echo "Missing Electrobun asset: $url" >&2
    return 1
  fi

  nix store prefetch-file --json "$url" | bun -e '
    const input = await new Response(Bun.stdin.stream()).json();
    console.log(input.hash);
  '
}

echo
printf '  electrobun.version = "%s";\n' "$version"
echo
printf '  electrobun.cli.x86_64-linux = "%s";\n' "$(prefetch cli x86_64-linux)"
printf '  electrobun.cli.aarch64-linux = "%s";\n' "$(prefetch cli aarch64-linux)"
echo
printf '  electrobun.core.x86_64-linux = "%s";\n' "$(prefetch core x86_64-linux)"
printf '  electrobun.core.aarch64-linux = "%s";\n' "$(prefetch core aarch64-linux)"
echo
echo 'Next steps:' >&2
echo '  1. Paste the hashes above into product/apps/desktop/nix/versions.nix.' >&2
echo '  2. Run `just refresh-bun-deps` to regenerate tools/nix/generated/bun.nix from bun.lock.' >&2
echo '  3. Verify with `nix build .#korri-desktop --no-link`.' >&2
