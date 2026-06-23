# Yoshi's Fabrication Station (community Construct web game by Level Share Square),
# packaged as a static Chromium-launched web app with Unix-style level input.
#
# The upstream public release is an itch.io web export. The source is therefore
# treated as an opaque static bundle: this derivation copies the web export,
# beautifies Construct's generated event payload so small patches are readable,
# applies launch-setting hooks, and installs a `yfs` command that accepts level
# JSON via path/stdin/LSS ID without requiring a background HTTP server.
{
  lib,
  stdenvNoCC,
  makeWrapper,
  nodejs,
  nodePackages,
  chromium,
  bun,
  jq,
  python3,
  curl,
  unzip,
  cacert,
}:

let
  version = "3.13.1";
  prettier = nodePackages.prettier;

  upstreamZip = stdenvNoCC.mkDerivation {
    pname = "yoshis-fabrication-station-upstream-zip";
    inherit version;

    nativeBuildInputs = [
      curl
      jq
      cacert
    ];
    dontUnpack = true;
    dontConfigure = true;
    dontBuild = true;

    outputHashMode = "flat";
    outputHashAlgo = "sha256";
    outputHash = "sha256-Tmmunxjo0yapYDI0cT9WA6/9uJtspaTI0dAXcM0lQMo=";

    installPhase = ''
      runHook preInstall
      export SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt
      cookieJar=$TMPDIR/itch-cookies.txt

      # Public itch.io downloads are a short multi-step browser flow:
      # 1. Ask the game page for a signed download landing URL.
      # 2. Load that landing page to receive CSRF + session cookie.
      # 3. POST the selected upload id to the file endpoint.
      # 4. Download the short-lived object-storage URL returned in JSON.
      downloadPageResponse=$(curl -fsSL \
        -c "$cookieJar" \
        -X POST \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        --data 'upload_id=14671701' \
        'https://levelsharesquare.itch.io/yoshis-fabrication-station/download_url')
      downloadPageUrl=$(printf '%s' "$downloadPageResponse" | jq -r '.url // empty')
      test -n "$downloadPageUrl"

      curl -fsSL -b "$cookieJar" -c "$cookieJar" "$downloadPageUrl" -o download-page.html
      csrf=$(sed -n 's/.*<meta name="csrf_token" value="\([^"]*\)".*/\1/p' download-page.html | head -1)
      test -n "$csrf"

      fileResponse=$(curl -fsSL \
        -b "$cookieJar" \
        -c "$cookieJar" \
        -X POST \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        --data-urlencode "csrf_token=$csrf" \
        'https://levelsharesquare.itch.io/yoshis-fabrication-station/file/14671701?source=view_game&as_props=1&after_download_lightbox=true')
      fileUrl=$(printf '%s' "$fileResponse" | jq -r '.url // empty')
      test -n "$fileUrl"

      curl -fL "$fileUrl" -o "$out"
      runHook postInstall
    '';
  };
in
stdenvNoCC.mkDerivation {
  pname = "yoshis-fabrication-station";
  inherit version;

  src = upstreamZip;

  nativeBuildInputs = [
    makeWrapper
    nodejs
    prettier
    unzip
  ];

  dontConfigure = true;
  dontBuild = true;

  unpackPhase = ''
    runHook preUnpack

    mkdir -p upstream source
    unzip -q "$src" -d upstream
    if [ -d upstream/www ]; then
      cp -R --no-preserve=mode,ownership upstream/www/. source/
    elif [ -f upstream/index.html ]; then
      cp -R --no-preserve=mode,ownership upstream/. source/
    else
      echo "yoshis-fabrication-station: upstream zip must contain www/ or a web root containing index.html" >&2
      find upstream -maxdepth 2 -type f | sort | head -50 >&2
      exit 1
    fi

    runHook postUnpack
  '';

  patchPhase = ''
    runHook prePatch

    cd source

    # Construct export target was Windows WebView2; running in Chromium/Linux
    # should expose the normal HTML5 environment.
    substituteInPlace scripts/main.js \
      --replace 'exportType:"windows-webview2"' 'exportType:"html5"' \
      --replace 'self.chrome.webview.postMessage' 'self.chrome && self.chrome.webview && self.chrome.webview.postMessage'

    # Preserve the working direct-launch event seam discovered in prototyping:
    # TitleScreen transition state 0; LoadLevel transition state 7.
    substituteInPlace data.json \
      --replace '"TitleScreen",832,448,true,false,1,' '"TitleScreen",832,448,true,false,0,' \
      --replace '"LoadLevel",1664,448,false,false,1,' '"LoadLevel",1664,448,false,false,7,'

    # Replace the minified Construct event payload with a beautified version,
    # then apply targeted setting-read hooks. This intentionally ships the
    # readable file: the +~1.5MiB cost is worth stable reviewable patches.
    prettier --parser babel scripts/c3main.js > scripts/c3main.pretty.js
    node ${./tools/patch-c3main.mjs} scripts/c3main.pretty.js scripts/c3main.js
    rm scripts/c3main.pretty.js

    cp ${./scripts/direct-launch-pre.js} direct-launch-pre.js
    cp ${./scripts/direct-launch.js} direct-launch.js

    if ! grep -q 'direct-launch-pre.js' index.html; then
      substituteInPlace index.html \
        --replace '<script src="scripts/main.js" type="module"></script>' $'<script src="direct-launch-pre.js"></script>\n\t<script src="scripts/main.js" type="module"></script>'
    fi
    if ! grep -q 'direct-launch.js' index.html; then
      substituteInPlace index.html \
        --replace '</body>' $'\t<script src="direct-launch.js"></script>\n</body>'
    fi

    # Guard the important launch hooks.
    grep -q 'direct-launch-pre.js' index.html
    grep -q 'direct-launch.js' index.html
    grep -q '__YFSGetSetting' scripts/c3main.js
    grep -q 'code_url' direct-launch.js
    grep -q 'samplelevels.json' direct-launch.js

    cd ..
    runHook postPatch
  '';

  installPhase = ''
    runHook preInstall

    install -d "$out/bin" "$out/share/yoshis-fabrication-station" "$out/share/yoshis-fabrication-station-launcher/plugins" "$out/nix-support/yoshis-fabrication-station"
    cp -R source/. "$out/share/yoshis-fabrication-station/"

    install -m755 ${./yfs} "$out/bin/yfs.unwrapped"
    makeWrapper "$out/bin/yfs.unwrapped" "$out/bin/yfs" \
      --set YFS_APP_DIR "$out/share/yoshis-fabrication-station" \
      --set-default YFS_BROWSER ${lib.getExe chromium} \
      --prefix PATH : ${
        lib.makeBinPath [
          jq
          python3
          curl
        ]
      }

    mkdir -p \
      "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station" \
      "$out/share/yoshis-fabrication-station-launcher/plugins/web-canvas" \
      "$out/share/yoshis-fabrication-station-launcher/plugins/webpage"
    cp -R ${./src} "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/src"
    mkdir -p "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/scripts"
    cp ${./scripts/yfs-launch-settings.js} "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/scripts/yfs-launch-settings.js"
    cp ${./scripts/yfs-level-loader.js} "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/scripts/yfs-level-loader.js"
    cp -R ${../web-canvas/src} "$out/share/yoshis-fabrication-station-launcher/plugins/web-canvas/src"
    cp -R ${../webpage/src} "$out/share/yoshis-fabrication-station-launcher/plugins/webpage/src"
    makeWrapper ${lib.getExe bun} "$out/bin/yfs-launch" \
      --add-flags "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/src/launcher/yfs-launch.ts" \
      --add-flags "--webroot=$out/share/yoshis-fabrication-station" \
      --add-flags "--chromium=${lib.getExe chromium}" \
      --set-default KORRI_YFS_WEBROOT "$out/share/yoshis-fabrication-station" \
      --set-default KORRI_YFS_SHIM_DIR "$out/share/yoshis-fabrication-station-launcher/plugins/yoshis-fabrication-station/scripts" \
      --set-default KORRI_WEBPAGE_CHROMIUM ${lib.getExe chromium}

    cat > "$out/nix-support/yoshis-fabrication-station/manifest.txt" <<EOF
    pname=yoshis-fabrication-station
    version=${version}
    upstream=Yoshi's Fabrication Station public itch.io web export
    upstream-page=https://levelsharesquare.itch.io/yoshis-fabrication-station
    upstream-upload-id=14671701
    source-sha256=4e69ae9f18e8d326a9603234713f5603affdb89b6ca5a4c8d1d01770cd2540ca
    engine=construct3-html5
    browser=${chromium.pname or "chromium"} ${chromium.version or "unknown"}
    direct-launch=code_url sample code_b64 code stdin lss
    yfs-launch=level-file code_url=level.json web-canvas
    launch-settings=enableAudio enableGBASounds enableQuickDeath enablePlayTimer VolumeBGM VolumeSFX
    yfs-launch-settings=audio gbaSounds quickDeath playTimer bgmVolume sfxVolume debug metrics viewport zoom
    license=unlicensed-upstream-binary-export
    EOF

    runHook postInstall
  '';

  passthru = {
    inherit version;
    appDir = "share/yoshis-fabrication-station";
    launchSettings = [
      "enableAudio"
      "enableGBASounds"
      "enableQuickDeath"
      "enablePlayTimer"
      "VolumeBGM"
      "VolumeSFX"
    ];
  };

  meta = {
    description = "Yoshi's Fabrication Station web export with Unix-style direct level launch";
    homepage = "https://levelsharesquare.itch.io/yoshis-fabrication-station";
    license = lib.licenses.unfreeRedistributable;
    mainProgram = "yfs-launch";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
