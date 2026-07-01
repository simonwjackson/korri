{
  pkgs,
  lib,
}:

let
  chromium = pkgs.chromium;
  policies = pkgs.runCommand "korri-chromium-kiosk-policies" { } ''
    mkdir -p "$out/etc/chromium/policies/managed"
    cat > "$out/etc/chromium/policies/managed/korri-kiosk.json" <<'JSON'
    {
      "DeveloperToolsAvailability": 2,
      "IncognitoModeAvailability": 1,
      "PrintingEnabled": false,
      "DownloadRestrictions": 3,
      "DefaultPopupsSetting": 2,
      "URLBlocklist": ["chrome://*", "chrome-untrusted://*", "devtools://*", "view-source:*"],
      "TranslateEnabled": false,
      "BrowserAddPersonEnabled": false,
      "BrowserSignin": 0,
      "PasswordManagerEnabled": false,
      "AutofillAddressEnabled": false,
      "AutofillCreditCardEnabled": false
    }
    JSON
  '';
in
pkgs.writeShellApplication {
  name = "korri-chromium-kiosk";

  runtimeInputs = [ chromium ];

  text = ''
    set -eu

    url="''${KORRI_WEB_SURFACE_URL:-http://127.0.0.1:8099/}"
    user_data_dir="''${KORRI_CHROMIUM_USER_DATA_DIR:-''${XDG_STATE_HOME:-$HOME/.local/state}/korri/chromium/profile}"

    exec ${chromium}/bin/chromium \
      --ozone-platform=wayland \
      --app="$url" \
      --user-data-dir="$user_data_dir" \
      --no-first-run \
      --no-default-browser-check \
      --noerrdialogs \
      --disable-infobars \
      --disable-session-crashed-bubble \
      --disable-features=Translate \
      "$@"
  '';

  derivationArgs = {
    passthru.policies = policies;
    meta = {
      description = "Korri locked-down Chromium kiosk client";
      platforms = lib.platforms.linux;
      mainProgram = "korri-chromium-kiosk";
    };
  };
}
