# Colocated package-shape check for Yoshi's Fabrication Station.
{
  pkgs,
  yfsPackage,
}:

let
  pkg = yfsPackage;
  checks = [
    ((pkg.meta.mainProgram or null) == "yfs")
    (builtins.elem "enableAudio" (pkg.passthru.launchSettings or [ ]))
    (builtins.elem "VolumeBGM" (pkg.passthru.launchSettings or [ ]))
  ];
  failures = pkgs.lib.imap0 (i: ok: if ok then null else "metadata check ${toString i} failed") checks;
  failureText = pkgs.lib.concatStringsSep "\n" (builtins.filter (x: x != null) failures);
in
if failureText != "" then
  throw "yoshis-fabrication-station check failed:\n${failureText}"
else
  pkgs.runCommand "yoshis-fabrication-station-check" { } ''
    set -euo pipefail

    test -x ${pkg}/bin/yfs
    test -x ${pkg}/bin/yfs.unwrapped
    test -f ${pkg}/share/yoshis-fabrication-station/index.html
    test -f ${pkg}/share/yoshis-fabrication-station/scripts/c3main.js
    test -f ${pkg}/share/yoshis-fabrication-station/direct-launch-pre.js
    test -f ${pkg}/share/yoshis-fabrication-station/direct-launch.js
    test -f ${pkg}/share/yoshis-fabrication-station/samplelevels.json

    grep -q 'YFS_APP_DIR' ${pkg}/bin/yfs
    grep -q 'YFS_BROWSER' ${pkg}/bin/yfs
    grep -q -- '--no-audio' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--gba-sounds' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--quick-death' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--play-timer' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--bgm-volume' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--sfx-volume' ${pkg}/bin/yfs.unwrapped
    grep -q -- '--lss' ${pkg}/bin/yfs.unwrapped

    grep -q 'direct-launch-pre.js' ${pkg}/share/yoshis-fabrication-station/index.html
    grep -q 'direct-launch.js' ${pkg}/share/yoshis-fabrication-station/index.html
    grep -q '__YFSGetSetting' ${pkg}/share/yoshis-fabrication-station/scripts/c3main.js
    grep -q 'enableGBASounds' ${pkg}/share/yoshis-fabrication-station/scripts/c3main.js
    grep -q 'VolumeBGM' ${pkg}/share/yoshis-fabrication-station/scripts/c3main.js
    grep -q 'code_url' ${pkg}/share/yoshis-fabrication-station/direct-launch.js
    grep -q 'samplelevels.json' ${pkg}/share/yoshis-fabrication-station/direct-launch.js

    ${pkg}/bin/yfs --help | grep -q -- '--no-audio'
    ${pkg}/bin/yfs --help | grep -q -- '--bgm-volume'
    ${pkg}/bin/yfs --list-samples | grep -q '^basicMovement$'

    test -f ${pkg}/nix-support/yoshis-fabrication-station/manifest.txt
    grep -q '^engine=construct3-html5' ${pkg}/nix-support/yoshis-fabrication-station/manifest.txt
    grep -q 'launch-settings=enableAudio enableGBASounds enableQuickDeath enablePlayTimer VolumeBGM VolumeSFX' ${pkg}/nix-support/yoshis-fabrication-station/manifest.txt

    mkdir -p $out
    cat > $out/summary.txt <<EOF
    yoshis-fabrication-station derivation passes wrapper, static app, direct-launch, and setting-hook checks.
    EOF
  ''
