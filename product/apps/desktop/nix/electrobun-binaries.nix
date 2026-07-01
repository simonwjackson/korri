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
  cefTarball = fetchElectrobun "cef" versions.electrobun.cef.${system};
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
      # The CEF native wrapper ships in core alongside the WebKit one; the
      # CEF renderer variant selects it. Assert its presence so a core-tarball
      # regression that drops it surfaces at build time.
      "libNativeWrapper_cef.so"
    ];
  };

  # CEF (Chromium) engine runtime: the `cef/` directory (libcef.so + Chromium
  # .pak/locale/swiftshader/vulkan payload) that Electrobun's `libNativeWrapper_cef.so`
  # loads. Only the CEF renderer variant consumes this; the default WebKitGTK
  # variant ignores it. `electrobun build` normally downloads this tarball; we
  # pin it so the sandboxed Nix build stays offline.
  cef = unpackTarball {
    name = "electrobun-cef-${system}";
    tarball = cefTarball;
    assertions = [
      "cef/libcef.so"
      "cef/icudtl.dat"
      "cef/resources.pak"
    ];
  };

  inherit arch version;
}
