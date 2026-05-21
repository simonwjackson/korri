{
  pkgs,
  lib,
  bash,
  patchelf,
  file,
  korri-desktop-unwrapped,
  # callPackage-style library set. The host variant inherits everything
  # from pkgs by name; the device variant overrides each entry below
  # with its pkgs2405 counterpart (see flake.nix). glibc and stdenv.cc.cc.lib
  # explicitly stay on current nixpkgs in both variants — they share an ABI
  # with bun and the launcher's interpreter.
  webkitgtk_4_1,
  gtk3,
  libsoup_3,
  glib,
  gdk-pixbuf,
  cairo,
  pango,
  libayatana-appindicator,
  librsvg,
  at-spi2-core,
  glib-networking,
  gsettings-desktop-schemas,
  glibc,
  stdenvCcLib,
  moonlightQt ? pkgs.moonlight-qt,
  profile ? "host",
}:

let
  isDevice = profile == "device";
  binName = if isDevice then "korri-desktop-device" else "korri-desktop";
  gdkBackend = if isDevice then "" else "x11";
  desktopProfileEnv = if isDevice then "device" else "";

  runtimeLibraries = [
    webkitgtk_4_1
    gtk3
    libayatana-appindicator
    librsvg
    libsoup_3
    glib
    gdk-pixbuf
    at-spi2-core
    pango
    cairo
    glib-networking
    glibc
    stdenvCcLib
  ];

  # XDG_DATA_DIRS feeds GLib's GSettings schema discovery — the data path
  # must point at the gtk3 + gsettings-desktop-schemas .gschema sets matching
  # the WebKit/GTK version, so it follows the variant's library set.
  desktopDataDirs = [
    gsettings-desktop-schemas
    gtk3
  ];

  runtimeLibraryPath = lib.makeLibraryPath runtimeLibraries;
  desktopDataPath = lib.makeSearchPath "share" desktopDataDirs;
  gioExtraModulesPath = "${glib-networking}/lib/gio/modules";
in
pkgs.stdenv.mkDerivation {
  pname = "korri-desktop";
  version = "1.0.0";

  dontUnpack = true;
  dontBuild = true;

  nativeBuildInputs = [
    patchelf
    file
  ];

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-desktop" "$out/bin"
    cp -R ${korri-desktop-unwrapped}/share/korri-desktop/. "$out/share/korri-desktop/"
    chmod -R u+w "$out/share/korri-desktop"

    launcher="$(find "$out/share/korri-desktop" -path '*/bin/launcher' -type f -perm -0100 | head -n 1)"
    if [ -z "$launcher" ]; then
      echo "Could not find Electrobun launcher in unwrapped desktop output" >&2
      exit 1
    fi
    chmod +x "$launcher"

    # File-type-branched patchelf, mirroring the unwrapped step. Shared
    # objects get --set-rpath with the variant's library set; executables
    # already have their interpreter from unwrapped and are left alone.
    # Adding RPATH to bun/launcher binaries is a semantic change explicitly
    # avoided here — see plan U6 Key Technical Decisions.
    find "$out/share/korri-desktop" -type f -print | while IFS= read -r f; do
      file_type="$(${file}/bin/file "$f")"
      if echo "$file_type" | grep -q 'ELF' && echo "$file_type" | grep -q 'shared object' && ! echo "$file_type" | grep -q 'interpreter '; then
        chmod u+w "$f"
        ${patchelf}/bin/patchelf --set-rpath "\$ORIGIN:${runtimeLibraryPath}" "$f"
      fi
    done

    # libNativeWrapper.so's RPATH now points at the variant's WebKitGTK +
    # GTK chain, so the wrapper does NOT export LD_LIBRARY_PATH. The two
    # env vars that still need to be set are runtime-discovery paths the
    # dynamic linker does not honor: GLib reads XDG_DATA_DIRS to find
    # compiled .gschema schemas, and GIO reads GIO_EXTRA_MODULES to find
    # the TLS/HTTP module set (glib-networking). RPATH alone cannot
    # replace these.
    cat > "$out/bin/${binName}" <<EOF
    #!${bash}/bin/bash
    export XDG_DATA_DIRS="${desktopDataPath}\''${XDG_DATA_DIRS:+:\$XDG_DATA_DIRS}"
    export GIO_EXTRA_MODULES="${gioExtraModulesPath}\''${GIO_EXTRA_MODULES:+:\$GIO_EXTRA_MODULES}"
    export PATH="${moonlightQt}/bin\''${PATH:+:\$PATH}"
    ${lib.optionalString (gdkBackend != "") ''
    export GDK_BACKEND="\''${GDK_BACKEND:-${gdkBackend}}"
    ''}
    ${lib.optionalString (desktopProfileEnv != "") ''
    export KORRI_DESKTOP_PROFILE="${desktopProfileEnv}"
    # Inputd lives behind a local-loopback WebSocket consumed by Electrobun
    # main. The renderer receives only brokered semantic actions over preload
    # IPC, never this raw URL.
    export KORRI_DESKTOP_INPUTD_URL="\''${KORRI_DESKTOP_INPUTD_URL:-ws://127.0.0.1:3002}"
    if [ -z "\''${HOME:-}" ] && { [ -z "\''${XDG_DATA_HOME:-}" ] || [ -z "\''${XDG_CONFIG_HOME:-}" ] || [ -z "\''${XDG_CACHE_HOME:-}" ]; }; then
      echo "korri-desktop: HOME is required when XDG home directories are not set" >&2
      exit 126
    fi
    export XDG_DATA_HOME="\''${XDG_DATA_HOME:-\$HOME/.local/share}"
    export XDG_CONFIG_HOME="\''${XDG_CONFIG_HOME:-\$HOME/.config}"
    export XDG_CACHE_HOME="\''${XDG_CACHE_HOME:-\$HOME/.cache}"
    export KORRI_DEVICE_STATE_ROOT="\''${KORRI_DEVICE_STATE_ROOT:-\$XDG_DATA_HOME/korri}"
    export KORRI_LIBRARY_ROOT="\''${KORRI_LIBRARY_ROOT:-\$XDG_DATA_HOME/korri/library}"
    export CHROME_CONFIG_HOME="\''${CHROME_CONFIG_HOME:-\$XDG_CONFIG_HOME}"
    ''}
    exec "$launcher" "\$@"
    EOF
    chmod +x "$out/bin/${binName}"

    runHook postInstall
  '';

  # Expose the unwrapped derivation per nixpkgs convention so downstream
  # consumers (and the U8 test fixture) can walk the build graph.
  passthru.unwrapped = korri-desktop-unwrapped;

  meta = {
    description = "Korri Electrobun desktop app (${profile} variant)";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
