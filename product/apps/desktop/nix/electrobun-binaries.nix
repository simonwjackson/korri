{
  pkgs,
  lib,
  system,
  versions,
}:

let
  archBySystem = {
    x86_64-linux = "x64";
    aarch64-linux = "arm64";
  };

  arch =
    archBySystem.${system}
      or (throw "Electrobun desktop binaries are only pinned for x86_64-linux and aarch64-linux");
  version = versions.electrobun.version;

  fetchElectrobun =
    kind: hash:
    pkgs.fetchurl {
      url = "https://github.com/blackboardsh/electrobun/releases/download/v${version}/electrobun-${kind}-linux-${arch}.tar.gz";
      sha256 = hash;
    };

  unpackTarball =
    {
      name,
      tarball,
      assertions,
    }:
    pkgs.stdenv.mkDerivation {
      pname = name;
      inherit version;
      src = tarball;

      nativeBuildInputs = [
        pkgs.gnutar
        pkgs.gzip
      ];
      dontConfigure = true;
      dontBuild = true;
      dontFixup = true;

      unpackPhase = ''
        mkdir -p source
        tar -xzf "$src" -C source
      '';

      installPhase = ''
        mkdir -p "$out"
        cp -R source/. "$out/"

        ${lib.concatMapStringsSep "\n" (path: ''
          if [ ! -e "$out/${path}" ]; then
            echo "Expected ${path} in ${name}" >&2
            find "$out" -maxdepth 3 -type f | sort >&2
            exit 1
          fi
        '') assertions}
      '';

      meta.description = "Pinned upstream Electrobun ${name} binaries for ${system}";
    };

  cliTarball = fetchElectrobun "cli" versions.electrobun.cli.${system};
  coreTarball = fetchElectrobun "core" versions.electrobun.core.${system};
in
{
  cli = unpackTarball {
    name = "electrobun-cli-${system}";
    tarball = cliTarball;
    assertions = [ "electrobun" ];
  };

  core = unpackTarball {
    name = "electrobun-core-${system}";
    tarball = coreTarball;
    assertions = [
      "bun"
      "bsdiff"
      "bspatch"
      "zig-zstd"
      "libNativeWrapper.so"
    ];
  };

  inherit arch version;
}
