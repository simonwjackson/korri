{
  pkgs,
  melonDsPackage,
  melonDsPresenterPackage,
}:

pkgs.runCommand "korri-melonds-package-check" { } ''
  test -x ${melonDsPackage}/bin/melonDS
  test -x ${melonDsPresenterPackage}/bin/korri-melonds-presenter
  ${melonDsPresenterPackage}/bin/korri-melonds-presenter --help >/dev/null

  cat > valid-payload.json <<'JSON'
  {
    "version": 1,
    "melonDs": {
      "command": "/run/current-system/sw/bin/melonDS",
      "args": ["-stylesheet", "/var/lib/korri/melonDS/presentation/hide-menubar.qss", "/games/Tetris DS.nds"]
    },
    "selectors": {
      "appId": "net.kuribo64.melonDS",
      "topTitlePrefix": "[w1]",
      "bottomTitlePrefix": "[w2]"
    },
    "secondaryOutput": { "output": "DSI-1", "restore": "observed" },
    "windows": {
      "top": { "output": "DSI-2", "x": 407, "y": 250, "width": 1106, "height": 830 },
      "bottom": { "output": "DSI-1", "x": 0, "y": 0, "width": 1240, "height": 930 }
    },
    "stylesheet": "/var/lib/korri/melonDS/presentation/hide-menubar.qss"
  }
  JSON
  ${melonDsPresenterPackage}/bin/korri-melonds-presenter --validate-only --payload valid-payload.json

  cat > unsafe-payload.json <<'JSON'
  {
    "version": 1,
    "melonDs": { "command": "/run/current-system/sw/bin/melonDS", "args": ["/games/Tetris DS.nds"] },
    "selectors": { "appId": "net.kuribo64.melonDS", "topTitlePrefix": "[w1]", "bottomTitlePrefix": "[w2]" },
    "secondaryOutput": { "output": "DSI-1; exec bad", "restore": "observed" },
    "windows": {
      "top": { "output": "DSI-2", "x": 407, "y": 250, "width": 1106, "height": 830 },
      "bottom": { "output": "DSI-1", "x": 0, "y": 0, "width": 1240, "height": 930 }
    }
  }
  JSON
  if ${melonDsPresenterPackage}/bin/korri-melonds-presenter --validate-only --payload unsafe-payload.json; then
    echo "unsafe secondary output payload was accepted" >&2
    exit 1
  fi

  cat > unsafe-window-payload.json <<'JSON'
  {
    "version": 1,
    "melonDs": { "command": "/run/current-system/sw/bin/melonDS", "args": ["/games/Tetris DS.nds"] },
    "selectors": { "appId": "net.kuribo64.melonDS", "topTitlePrefix": "[w1]", "bottomTitlePrefix": "[w2]" },
    "secondaryOutput": { "output": "DSI-1", "restore": "observed" },
    "windows": {
      "top": { "output": "DSI-2; exec bad", "x": 407, "y": 250, "width": 1106, "height": 830 },
      "bottom": { "output": "DSI-1", "x": 0, "y": 0, "width": 1240, "height": 930 }
    }
  }
  JSON
  if ${melonDsPresenterPackage}/bin/korri-melonds-presenter --validate-only --payload unsafe-window-payload.json; then
    echo "unsafe window output payload was accepted" >&2
    exit 1
  fi

  touch "$out"
''
