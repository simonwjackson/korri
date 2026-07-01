{
  lib,
  stdenv,
  fetchFromGitHub,
  cmake,
  ninja,
  pkg-config,
  flex,
  bison,
  python3,
  makeWrapper,
  perl,
  curl,
  freetype,
  gtk3,
  libGL,
  libGLU,
  freeglut,
  libX11,
  libXcursor,
  libXext,
  libXfixes,
  libXinerama,
  libXrandr,
  libXrender,
  alsa-lib,
  libpulseaudio,
  openssl,
  util-linux,
  zlib,
  sse2neon,
}:

let
  stduuidSrc = fetchFromGitHub {
    owner = "mariusbancila";
    repo = "stduuid";
    rev = "3afe7193facd5d674de709fccc44d5055e144d7a";
    sha256 = "1y7jgf45dydq0jlac5clnanwcc22la4y8c83d5i0rp87x2zll6ij";
  };
  allegro5Src = fetchFromGitHub {
    owner = "connorjclark";
    repo = "allegro5";
    rev = "7fe12cad20d57e79273af0e51dbda897d60d8dfd";
    sha256 = "143ydhf1kig7hab3wg5li5v56x3aiy7wyf0sihbamx112rw5jivc";
  };
  gameMusicEmuSrc = fetchFromGitHub {
    owner = "libgme";
    repo = "game-music-emu";
    rev = "05a2aa29e8eae29316804fdd28ceaa96c74a1531";
    sha256 = "0hn5fvfnrcgsyg5k0ls17dcph9h7cr34q9pyjbawvw16qjl6v3sf";
  };
  poolSTLSrc = fetchFromGitHub {
    owner = "alugowski";
    repo = "poolSTL";
    rev = "26d95b90aea7c36732a2df50df1c6fa26c96f93e";
    sha256 = "1likzpanrhlqsvdji1dy0ya067knb7ixq4hnw5rl7m87qrj1cjr5";
  };
in
stdenv.mkDerivation rec {
  pname = "zquest-classic";
  version = "unstable-2026-06-18";

  src = fetchFromGitHub {
    owner = "ZQuestClassic";
    repo = "ZQuestClassic";
    rev = "882c906b17e35b4105188e6305ae2929aeba30e3";
    sha256 = "02fs0fm9wih9ly23ivxcvr346cj0dkg7yxsf97q7xzyw6vk36n2y";
  };

  patches = lib.optional stdenv.hostPlatform.isAarch64 ./aarch64-disable-x86-tile-simd.patch;
  patchFlags = [ "-p0" ];

  nativeBuildInputs = [
    cmake
    ninja
    pkg-config
    flex
    bison
    python3
    makeWrapper
    perl
  ];

  buildInputs = [
    curl
    freetype
    gtk3
    libGL
    libGLU
    freeglut
    libX11
    libXcursor
    libXext
    libXfixes
    libXinerama
    libXrandr
    libXrender
    alsa-lib
    libpulseaudio
    openssl
    util-linux
    zlib
  ];

  postPatch = ''
    cat > cmake/FindLibuuid.cmake <<'EOF'
    add_library(Libuuid::Libuuid UNKNOWN IMPORTED)
    set_target_properties(Libuuid::Libuuid PROPERTIES
      IMPORTED_LOCATION "${lib.getLib util-linux}/lib/libuuid.so"
      INTERFACE_INCLUDE_DIRECTORIES "${util-linux.dev}/include"
    )
    set(Libuuid_FOUND TRUE)
    EOF

    substituteInPlace CMakeLists.txt \
      --replace-fail '-Werror=format' '-Werror=format -Wno-error=format-truncation'
    substituteInPlace packaging/CMakeLists.txt \
      --replace-fail 'list(APPEND ZC_INSTALL_TARGETS zlauncher zplayer zeditor zscript zcsound)' \
                     'list(APPEND ZC_INSTALL_TARGETS zlauncher zplayer zcsound)'

    perl -0pi -e 's/#include <iterator>/#include <iterator>\n#include <cstdlib>/' src/zc/saves.cpp
    perl -0pi -e 's/return zc_get_config\("zeldadx", "save_folder", "saves"\);/if (const char* save_folder = std::getenv("ZQUEST_CLASSIC_SAVE_FOLDER"))\n\t\treturn save_folder;\n\treturn zc_get_config("zeldadx", "save_folder", "saves");/' src/zc/saves.cpp
  ''
  + lib.optionalString stdenv.hostPlatform.isAarch64 ''
    perl -0pi -e 's/if\(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID MATCHES "Clang"\)\r?\n\tadd_compile_options\(-mssse3\)\r?\nendif\(\)/if((CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64|i.86") AND (CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID MATCHES "Clang"))\n\tadd_compile_options(-mssse3)\nendif()/g' CMakeLists.txt
  '';

  cmakeGenerator = "Ninja Multi-Config";
  NIX_LDFLAGS = [
    "-L${lib.getLib util-linux}/lib"
    "-luuid"
  ];

  NIX_CFLAGS_COMPILE = lib.optional stdenv.hostPlatform.isAarch64 "-fsigned-char";

  cmakeFlags = [
    "-DCOPY_RESOURCES=ON"
    "-DCMAKE_POLICY_VERSION_MINIMUM=3.5"
    "-DWANT_NFD=OFF"
    "-DWANT_ZUPDATER=OFF"
    "-DWANT_WEBSOCKETS=OFF"
    "-DWANT_GIT_HOOKS=OFF"
    "-DWANT_ZC_TESTS=OFF"
    "-DJIT_BACKEND=none"
    "-DFETCHCONTENT_SOURCE_DIR_STDUUID=${stduuidSrc}"
    "-DFETCHCONTENT_SOURCE_DIR_ALLEGRO5=${allegro5Src}"
    "-DFETCHCONTENT_SOURCE_DIR_GME_EXTERNAL=${gameMusicEmuSrc}"
    "-DFETCHCONTENT_SOURCE_DIR_POOLSTL=${poolSTLSrc}"
  ];

  buildPhase = ''
    runHook preBuild
    cmake --build . --config Release --target zplayer zlauncher
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    cmake --install . --config Release --prefix $out
    sed -i \
      -e 's/^midi = .*/midi = 0/' \
      "$out/share/zquestclassic/base_config/zc.cfg" \
      "$out/share/zquestclassic/base_config/zquest.cfg"
    runHook postInstall
  '';

  postFixup = ''
    zquestEnvUnset=(
      --unset KORRI_CONFIG_ROOTS
      --unset KORRI_CONFIG_ROOTS_DIR
      --unset KORRI_DESKTOP_INPUTD_URL
      --unset KORRI_ENABLED_PLUGINS
      --unset KORRI_KIOSK
      --unset KORRI_LAUNCH_ARTIFACTS_DIR
      --unset KORRI_LIBRARY_ROOT
      --unset KORRI_LIBRARY_SOURCE
      --unset KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER
      --unset KORRI_NATIVE_BRIDGE_URL
      --unset KORRI_SESSIOND_ESSWAY_CONTROL
      --unset KORRI_SESSIOND_PORT
      --unset KORRI_SESSIOND_ROLE
      --unset KORRI_SESSIOND_SOCKET
      --unset GAMESCOPE_FSR_FEEDBACK
      --unset GAMESCOPE_SCALING_FILTER
      --unset GAMESCOPE_SHARPNESS
      --unset GAMESCOPE_XWAYLAND_MODE_CONTROL
      --unset WAYLAND_DISPLAY
      --unset XDG_CURRENT_DESKTOP
      --unset XDG_SESSION_TYPE
    )

    for exe in zplayer zlauncher; do
      if [ -x "$out/bin/$exe" ]; then
        wrapProgram "$out/bin/$exe" \
          --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath buildInputs} \
          "''${zquestEnvUnset[@]}"
      fi
    done
  '';

  meta = {
    description = "Open-source Zelda Classic / ZQuest Classic player";
    homepage = "https://github.com/ZQuestClassic/ZQuestClassic";
    license = lib.licenses.gpl3Plus;
    platforms = lib.platforms.linux;
    mainProgram = "zplayer";
  };
}
