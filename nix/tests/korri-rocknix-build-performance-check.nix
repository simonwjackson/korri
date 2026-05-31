{
  pkgs,
  runtimeSource,
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

    test -e ${runtimeSource}/argo.config.mjs
    test -e ${runtimeSource}/bun.lock
    test -e ${runtimeSource}/bunfig.toml
    test -e ${runtimeSource}/components.json
    test -e ${runtimeSource}/electrobun.config.ts
    test -e ${runtimeSource}/package.json
    test -e ${runtimeSource}/tsconfig.api.json
    test -e ${runtimeSource}/tsconfig.json
    test -e ${runtimeSource}/tsconfig.server.json
    test -e ${runtimeSource}/vite.config.mjs
    test -e ${runtimeSource}/korri
    test -e ${runtimeSource}/tools
    test ! -e ${runtimeSource}/docs
    test ! -e ${runtimeSource}/backlog

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
