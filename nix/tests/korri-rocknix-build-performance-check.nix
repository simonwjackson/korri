{
  pkgs,
  runtimeSources,
  productionBunPackageNames,
  rootfsBuilder,
}:

let
  fixtureToplevel = pkgs.runCommand "korri-rootfs-structure-fixture-toplevel" { } ''
        mkdir -p "$out/etc"
        cat > "$out/init" <<'EOF'
    #!/bin/sh
    exit 0
    EOF
        chmod +x "$out/init"
  '';

  fixtureRootfs = import rootfsBuilder {
    inherit pkgs;
    configuration = {
      config.system.build.toplevel = fixtureToplevel;
    };
  };

  forbiddenBunNames = [
    "playwright"
    "storybook"
    "@cucumber/"
    "@vitest/"
    "@testing-library/"
    "fallow"
    "@argo-video/cli"
    "@tiptap/"
    "@xyflow/"
  ];

  productionBunNamesFile = pkgs.writeText "production-bun-package-names.txt" (
    pkgs.lib.concatStringsSep "\n" productionBunPackageNames
  );
in
pkgs.runCommand "korri-rocknix-build-performance-check"
  {
    nativeBuildInputs = [
      pkgs.coreutils
      pkgs.gnugrep
      pkgs.gnutar
      pkgs.zstd
    ];
  }
  ''
    set -euo pipefail

    test -e ${runtimeSources.portal}/bun.lock
    test -e ${runtimeSources.portal}/bunfig.toml
    test -e ${runtimeSources.portal}/components.json
    test -e ${runtimeSources.portal}/package.json
    test -e ${runtimeSources.portal}/tsconfig.json
    test -e ${runtimeSources.portal}/vite.config.mjs
    test -e ${runtimeSources.portal}/korri/deploy/desktop/runtime-config-shape.ts
    test -e ${runtimeSources.portal}/korri/deploy/portal
    test -e ${runtimeSources.portal}/korri/products
    test -e ${runtimeSources.portal}/korri/shared
    test ! -e ${runtimeSources.portal}/korri/deploy/desktop/runtime-config.ts
    test ! -e ${runtimeSources.portal}/tools/testing
    test ! -e ${runtimeSources.portal}/korri/deploy/storybook
    test ! -e ${runtimeSources.portal}/docs
    test ! -e ${runtimeSources.portal}/backlog

    test -e ${runtimeSources.desktop}/electrobun.config.ts
    test -e ${runtimeSources.desktop}/korri/deploy/desktop
    test -e ${runtimeSources.desktop}/product/apps/cli
    test ! -e ${runtimeSources.desktop}/tools/cli
    test ! -e ${runtimeSources.desktop}/tools/testing
    test ! -e ${runtimeSources.desktop}/korri/deploy/storybook

    test -e ${runtimeSources.inputd}/product/services/device
    test -e ${runtimeSources.inputd}/tools/types
    test -e ${runtimeSources.inputd}/korri/products
    test ! -e ${runtimeSources.inputd}/tools/device
    test ! -e ${runtimeSources.inputd}/tools/testing
    test ! -e ${runtimeSources.inputd}/tools/playwright

    test -e ${runtimeSources.gameStream}/product/services/device
    test -e ${runtimeSources.gameStream}/korri/products
    test ! -e ${runtimeSources.gameStream}/tools/device
    test ! -e ${runtimeSources.gameStream}/tools/http
    test ! -e ${runtimeSources.gameStream}/tools/types
    test ! -e ${runtimeSources.gameStream}/tools/testing
    test ! -e ${runtimeSources.gameStream}/tools/playwright

    test -e ${runtimeSources.sessiond}/product/services/device
    test -e ${runtimeSources.sessiond}/tools/library
    test -e ${runtimeSources.sessiond}/korri/shared
    test ! -e ${runtimeSources.sessiond}/tools/device
    test ! -e ${runtimeSources.sessiond}/tools/types
    test ! -e ${runtimeSources.sessiond}/tools/testing
    test ! -e ${runtimeSources.sessiond}/tools/playwright

    test -e ${runtimeSources.server}/product/services/device
    test -e ${runtimeSources.server}/product/services/server
    test -e ${runtimeSources.server}/korri/shared
    test ! -e ${runtimeSources.server}/tools/device
    test ! -e ${runtimeSources.server}/tools/http
    test ! -e ${runtimeSources.server}/tools/types
    test ! -e ${runtimeSources.server}/tools/testing
    test ! -e ${runtimeSources.server}/tools/playwright
    test ! -e ${runtimeSources.server}/tools/generators

    test -e ${runtimeSources.cli}/product/apps/cli
    test -e ${runtimeSources.cli}/product/services/device
    test ! -e ${runtimeSources.cli}/tools/cli
    test ! -e ${runtimeSources.cli}/tools/device
    test ! -e ${runtimeSources.cli}/tools/testing
    test ! -e ${runtimeSources.cli}/tools/playwright

    cp ${productionBunNamesFile} production-bun-package-names.txt
    grep -E '^vite@' production-bun-package-names.txt
    grep -E '^@vitejs/plugin-react@' production-bun-package-names.txt
    grep -E '^electrobun@' production-bun-package-names.txt
    grep -E '^effect@' production-bun-package-names.txt

    for forbidden in ${pkgs.lib.escapeShellArgs forbiddenBunNames}; do
      if grep -F "$forbidden" production-bun-package-names.txt; then
        echo "production Bun package set contains dev/test dependency: $forbidden" >&2
        exit 1
      fi
    done

    tarball=${fixtureRootfs}/tarball/rocknix-layer10b-guest-rootfs-aarch64-linux.tar.zst
    tar --zstd -tf "$tarball" > entries.txt
    tar --zstd -tvf "$tarball" > verbose-entries.txt

    if grep -q '^/nix/store/' entries.txt; then
      echo "rootfs tarball contains absolute /nix/store members" >&2
      exit 1
    fi

    grep -Eq '^nix/store/[^/]+-korri-rootfs-structure-fixture-toplevel/init$' entries.txt
    grep -Fx './sbin/init' entries.txt
    grep -Fx './usr/bin/nix' entries.txt
    grep -Eq ' ./sbin/init -> /nix/store/[^/]+-korri-rootfs-structure-fixture-toplevel/init$' verbose-entries.txt
    grep -Eq ' ./usr/bin/nix -> /run/current-system/sw/bin/nix$' verbose-entries.txt

    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri RockNix build-performance invariants passed.
    EOF
  ''
