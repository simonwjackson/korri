{
  pkgs,
  pkgs2405,
  host,
  device,
  x86Kiosk,
  unwrapped,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  containsStorePath =
    haystack: needle:
    let
      hay = toString haystack;
      wanted = toString needle;
      hayLen = builtins.stringLength hay;
      wantedLen = builtins.stringLength wanted;
      indices = builtins.genList (i: i) (hayLen - wantedLen + 1);
      matches = builtins.filter (i: builtins.substring i wantedLen hay == wanted) indices;
    in
    hayLen >= wantedLen && matches != [ ];

  hostInstall = host.installPhase or "";
  deviceInstall = device.installPhase or "";
  x86KioskInstall = x86Kiosk.installPhase or "";

  checks = [
    (check "host wrapper must derive from the shared unwrapped package" (
      host.passthru.unwrapped.drvPath == unwrapped.drvPath
    ))
    (check "device wrapper must derive from the shared unwrapped package" (
      device.passthru.unwrapped.drvPath == unwrapped.drvPath
    ))
    (check "host and device wrappers must share the same unwrapped drvPath" (
      host.passthru.unwrapped.drvPath == device.passthru.unwrapped.drvPath
    ))
    (check "host and device wrappers must produce distinct derivations" (
      host.drvPath != device.drvPath
    ))
    (check "x86 kiosk wrapper must produce a distinct derivation from host" (
      x86Kiosk.drvPath != host.drvPath
    ))
    (check "x86 kiosk wrapper must produce a distinct derivation from device" (
      x86Kiosk.drvPath != device.drvPath
    ))
    (check "device wrap must pin pkgs2405 webkitgtk_4_1" (
      containsStorePath deviceInstall pkgs2405.webkitgtk_4_1.outPath
    ))
    (check "device wrap must pin pkgs2405 gtk3" (containsStorePath deviceInstall pkgs2405.gtk3.outPath))
    (check "device wrap must pin pkgs2405 libsoup_3" (
      containsStorePath deviceInstall pkgs2405.libsoup_3.outPath
    ))
    (check "device wrap must pin pkgs2405 librsvg" (
      containsStorePath deviceInstall pkgs2405.librsvg.outPath
    ))
    (check "device wrap must pin pkgs2405 at-spi2-core" (
      containsStorePath deviceInstall pkgs2405.at-spi2-core.outPath
    ))
    (check "host wrap must not leak pkgs2405 webkitgtk_4_1" (
      !(containsStorePath hostInstall pkgs2405.webkitgtk_4_1.outPath)
    ))
    (check "host wrap must not leak pkgs2405 gtk3" (
      !(containsStorePath hostInstall pkgs2405.gtk3.outPath)
    ))
    (check "device wrap must export the broker-only inputd URL" (
      builtins.match ".*KORRI_DESKTOP_INPUTD_URL.*" deviceInstall != null
    ))
    (check "device wrap must not expose the raw native bridge URL" (
      builtins.match ".*KORRI_NATIVE_BRIDGE_URL.*" deviceInstall == null
    ))
    (check "x86 kiosk wrap must export the broker-only inputd URL" (
      builtins.match ".*KORRI_DESKTOP_INPUTD_URL.*" x86KioskInstall != null
    ))
    (check "host wrap must provide moonlight-embedded on PATH" (
      containsStorePath hostInstall pkgs.moonlight-embedded.outPath
    ))
    (check "host wrap must not provide Moonlight Qt on PATH" (
      !(containsStorePath hostInstall pkgs.moonlight-qt.outPath)
    ))
    (check "device wrap must provide moonlight-embedded on PATH" (
      containsStorePath deviceInstall pkgs.moonlight-embedded.outPath
    ))
    (check "device wrap must not provide Moonlight Qt on PATH" (
      !(containsStorePath deviceInstall pkgs.moonlight-qt.outPath)
    ))
    (check "x86 kiosk wrap must provide moonlight-embedded on PATH" (
      containsStorePath x86KioskInstall pkgs.moonlight-embedded.outPath
    ))
    (check "x86 kiosk wrap must not provide Moonlight Qt on PATH" (
      !(containsStorePath x86KioskInstall pkgs.moonlight-qt.outPath)
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri desktop build graph check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-desktop-build-graph-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri desktop build graph invariants passed.
    EOF
  ''
