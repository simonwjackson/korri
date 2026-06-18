{
  lib,
  stdenv,
  fetchurl,
  unzip,
  patchelf,
  bash,
  coreutils,
  gnused,
  python3,
  SDL2,
  SDL2_image,
  SDL2_ttf,
}:

let
  version = "2026.05.24-0035";
  runtimeLibs = [
    SDL2
    SDL2_image
    SDL2_ttf
    stdenv.cc.cc.lib
  ];
  runtimeLibraryPath = lib.makeLibraryPath runtimeLibs;
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    builtins.readFile "${stdenv.cc}/nix-support/dynamic-linker"
  );
  hostElfFiles =
    if stdenv.hostPlatform.isAarch64 then
      [
        "7zzs.aarch64"
        "astcenc.aarch64"
        "gptokeyb"
        "gptokeyb2"
        "innoextract.aarch64"
        "sdl2imgshow.aarch64"
        "sdl_resolution.aarch64"
        "xdelta3"
      ]
    else if stdenv.hostPlatform.isx86_64 then
      [
        "7zzs.x86_64"
        "gptokeyb.x86_64"
        "gptokeyb2.x86_64"
        "innoextract.x86_64"
        "sdl2imgshow.x86_64"
        "sdl_resolution.x86_64"
        "xdelta3.x86_64"
      ]
    else
      [ ];
in
stdenv.mkDerivation rec {
  pname = "portmaster";
  inherit version;

  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-GUI/releases/download/${version}/PortMaster.zip";
    hash = "sha256-8qZF7JOJr0Uy4yi72kjpertiaDm90eMWPIVkBZ+Xay4=";
  };

  nativeBuildInputs = [
    unzip
    patchelf
  ];

  unpackPhase = ''
    runHook preUnpack
    unzip -q "$src"
    runHook postUnpack
  '';

  installPhase = ''
    runHook preInstall

    install -d "$out/share/korri/portmaster"
    cp -a PortMaster "$out/share/korri/portmaster/"

    portmaster_dir="$out/share/korri/portmaster/PortMaster"
    chmod -R u+rwX "$portmaster_dir"
    chmod +x \
      "$portmaster_dir/PortMaster.sh" \
      "$portmaster_dir/harbourmaster" \
      "$portmaster_dir/pugwash" \
      "$portmaster_dir/gptokeyb" \
      "$portmaster_dir/gptokeyb2" \
      "$portmaster_dir/xdelta3" \
      "$portmaster_dir"/*.aarch64 \
      "$portmaster_dir"/*.armhf \
      "$portmaster_dir"/*.x86_64

    substituteInPlace "$portmaster_dir/PortMaster.sh" \
      --replace-fail 'if [ -d "/opt/system/Tools/PortMaster/" ]; then' 'if [ -n "''${KORRI_PORTMASTER_HOME:-}" ] && [ -d "''${KORRI_PORTMASTER_HOME}" ]; then
  controlfolder="''${KORRI_PORTMASTER_HOME}"
elif [ -d "/opt/system/Tools/PortMaster/" ]; then' \
      --replace-fail 'export PYSDL2_DLL_PATH="/usr/lib"' 'export PYSDL2_DLL_PATH="''${PYSDL2_DLL_PATH:-@runtimeLibraryPath@}"'

    substituteInPlace "$portmaster_dir/control.txt" \
      --replace-fail 'if [ -d "/PortMaster/" ]; then' 'if [ -n "''${KORRI_PORTMASTER_HOME:-}" ] && [ -d "''${KORRI_PORTMASTER_HOME}" ]; then
  export controlfolder="''${KORRI_PORTMASTER_HOME}"
elif [ -d "/PortMaster/" ]; then' \
      --replace-fail 'export directory="roms"
fi' 'export directory="roms"
fi

if [ -n "''${KORRI_PORTMASTER_DIRECTORY:-}" ]; then
  export directory="''${KORRI_PORTMASTER_DIRECTORY#/}"
fi'

    substituteInPlace "$portmaster_dir/PortMaster.sh" \
      --subst-var-by runtimeLibraryPath '${runtimeLibraryPath}'

    patchShebangs "$portmaster_dir/PortMaster.sh" "$portmaster_dir/control.txt" "$portmaster_dir/harbourmaster" "$portmaster_dir/pugwash" "$portmaster_dir"/*.py

    ${lib.optionalString (stdenv.hostPlatform.isLinux && hostElfFiles != [ ]) ''
      host_rpath="${runtimeLibraryPath}:$portmaster_dir"
      dynamic_linker="${linuxInterpreter}"
      for elf_name in ${lib.escapeShellArgs hostElfFiles}; do
        elf_path="$portmaster_dir/$elf_name"
        if [ -f "$elf_path" ]; then
          patchelf --set-interpreter "$dynamic_linker" --set-rpath "$host_rpath" "$elf_path" || true
        fi
      done
    ''}

    install -d "$out/bin"
    cat > "$out/bin/portmaster" <<'EOF'
#!@bash@/bin/bash
set -euo pipefail

source_dir="@out@/share/korri/portmaster/PortMaster"
data_home="''${KORRI_PORTMASTER_HOME:-''${XDG_DATA_HOME:-$HOME/.local/share}/PortMaster}"
source_version="@version@"
marker="$data_home/.korri-portmaster-source-version"

mkdir -p "$data_home"
if [ ! -f "$marker" ] || [ "$(cat "$marker" 2>/dev/null || true)" != "$source_version" ]; then
  chmod -R u+rwX "$data_home" 2>/dev/null || true
  cp -a "$source_dir"/. "$data_home"/
  chmod -R u+rwX "$data_home"
  printf '%s\n' "$source_version" > "$marker"
fi

ports_root="''${KORRI_PORTMASTER_PORTS_ROOT:-''${XDG_DATA_HOME:-$HOME/.local/share}/korri/portmaster-roms}"
mkdir -p "$ports_root/ports"
export KORRI_PORTMASTER_HOME="$data_home"
export KORRI_PORTMASTER_DIRECTORY="''${KORRI_PORTMASTER_DIRECTORY:-''${ports_root#/}}"
export PATH="@pythonBin@:@coreutilsBin@:@gnusedBin@:$PATH"
export LD_LIBRARY_PATH="@runtimeLibraryPath@''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$data_home/PortMaster.sh" "$@"
EOF
    substituteInPlace "$out/bin/portmaster" \
      --subst-var-by bash '${bash}' \
      --subst-var-by out "$out" \
      --subst-var-by version '${version}' \
      --subst-var-by pythonBin '${python3}/bin' \
      --subst-var-by coreutilsBin '${coreutils}/bin' \
      --subst-var-by gnusedBin '${gnused}/bin' \
      --subst-var-by runtimeLibraryPath '${runtimeLibraryPath}'
    chmod +x "$out/bin/portmaster"

    runHook postInstall
  '';

  meta = {
    description = "PortMaster handheld port manager packaged for Korri with writable app data";
    homepage = "https://portmaster.games/";
    license = lib.licenses.mit;
    mainProgram = "portmaster";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
