# Pure-Nix module-evaluation check for `services.korri.server`.
#
# Covers the boot-scoped vs session-scoped control plane (serviceMode),
# the streaming sub-tree (renamed from streamHost in this refactor), and
# the new cross-tree assertions that `streaming.enable = true` requires
# both `services.korri.compositor.enable` and
# `services.korri.input.provider.enable`. Also asserts that streaming
# writes the default Sunshine gamepad backend (Xbox 360 over uinput).
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-server-module --no-link
{
  pkgs,
  korriServerModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.systemd-boot.enable = false;
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "server-test";
      users.users.testuser = {
        isNormalUser = true;
        home = "/home/testuser";
        group = "users";
      };
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriServerModule
        baseModule
        overrides
      ];
    }).config;

  korriFailedAssertions =
    cfg:
    builtins.filter (a: builtins.match ".*korri.*" a.message != null) (
      builtins.filter (a: !a.assertion) cfg.assertions
    );

  korriFailedAssertionMessages = cfg: map (a: a.message) (korriFailedAssertions cfg);

  serverSystemUnit = cfg: cfg.systemd.services.korri-server or { };
  serverUserUnit = cfg: cfg.systemd.user.services.korri-server or { };

  sunshineApps = cfg: cfg.services.sunshine.applications.apps or [ ];
  sunshineAppNames = cfg: map (app: app.name) (sunshineApps cfg);
  sunshineAppByName =
    cfg: name:
    let
      matches = builtins.filter (app: app.name == name) (sunshineApps cfg);
    in
    if matches == [ ] then null else builtins.elemAt matches 0;
  sunshineSettings = cfg: cfg.services.sunshine.settings or { };
  firstAppWrapper =
    cfg:
    let
      apps = sunshineApps cfg;
    in
    if apps == [ ] then null else builtins.readFile (builtins.elemAt apps 0).cmd;

  # Shared minimal config that satisfies the new streaming cross-tree
  # assertions: compositor + input.provider must both be on.
  streamingPrereqs = {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
    };
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
    };
  };

  # ---------------------------------------------------------------- scenarios
  defaultUserMode = evaluateWith {
    services.korri.server.enable = true;
  };

  explicitSystemMode = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        group = "users";
        streaming.enable = true;
      };
    }
  );

  publicApiBaseUrl = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "http://192.168.1.117:3001";
    };
  };

  publicApiBaseUrlLoopback = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "http://127.0.0.1:3001";
    };
  };

  publicApiBaseUrlPublicHttps = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "https://korri.example.com";
    };
  };

  publicApiBaseUrlPublicHttp = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "http://korri.example.com";
    };
  };

  publicApiBaseUrlCredentials = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "https://user:pass@korri.example.com";
    };
  };

  publicApiBaseUrlQuery = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "https://korri.example.com?token=secret";
    };
  };

  publicApiBaseUrlFragment = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "https://korri.example.com#asset";
    };
  };

  publicApiBaseUrlWhitespace = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = " https://korri.example.com";
    };
  };

  publicApiBaseUrlInvalid = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "not a url";
    };
  };

  publicApiBaseUrlMissingHost = evaluateWith {
    services.korri.server = {
      enable = true;
      publicApiBaseUrl = "https:///assets";
    };
  };

  missingUser = evaluateWith {
    services.korri.server = {
      enable = true;
      serviceMode = "system";
      library.root = "/var/lib/korri/library";
    };
  };

  rootUser = evaluateWith {
    services.korri.server = {
      enable = true;
      serviceMode = "system";
      user = "root";
      library.root = "/var/lib/korri/library";
    };
  };

  userSpecifierPath = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          runtimeDir = "%t/korri-game-stream";
        };
      };
    }
  );

  relativePath = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          runtimeDir = "relative-dir";
        };
      };
    }
  );

  mismatchedParent = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          statusPath = "/tmp/status.json";
        };
      };
    }
  );

  globalFirewall = evaluateWith {
    services.korri.server = {
      enable = true;
      serviceMode = "system";
      user = "testuser";
      host = "0.0.0.0";
      openFirewall = true;
    };
  };

  scopedFirewall = evaluateWith {
    services.korri.server = {
      enable = true;
      serviceMode = "system";
      user = "testuser";
      host = "0.0.0.0";
      openFirewall = true;
      firewallInterfaces = [ "tailscale0" ];
    };
  };

  # New cross-tree assertion: streaming.enable without compositor.enable
  # is rejected at evaluation time.
  streamingWithoutCompositor = evaluateWith {
    services.korri.server = {
      enable = true;
      streaming.enable = true;
    };
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
    };
  };

  # New cross-tree assertion: streaming.enable without input.provider.enable
  # is rejected at evaluation time.
  streamingWithoutInputProvider = evaluateWith {
    services.korri.server = {
      enable = true;
      streaming.enable = true;
    };
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
    };
  };

  # Cross-tree assertion: streaming.enable with services.sunshine.enable
  # explicitly off must fail (korri-sunshine.service depends on the
  # upstream module's config rendering + supporting plumbing).
  streamingWithSunshineDisabled = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        streaming.enable = true;
      };
      services.sunshine.enable = lib.mkForce false;
    }
  );

  # New: streaming.enable does NOT auto-enable input.inputd (the local
  # kiosk bridge). Streaming hosts (aka) use input.provider directly.
  streamingDoesNotEnableInputd = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        streaming.enable = true;
      };
    }
  );

  # Streaming default gamepad backend (Xbox 360 over uinput, the
  # InputPlumber-validated working path on aka).
  streamingDefaultGamepad = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming.enable = true;
      };
    }
  );

  streamingDesktopDisabled = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          desktop.enable = false;
        };
      };
    }
  );

  # Host override for gamepad backend takes precedence (mkDefault precedence).
  streamingHostGamepadOverride = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming.enable = true;
      };
      services.sunshine.settings.gamepad = "ds5";
    }
  );

  audioDisabled = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming.enable = true;
      };
    }
  );

  audioEnabledWithServer = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          audio = {
            enable = true;
            pulseServer = "unix:/run/user/1000/pulse/native";
          };
        };
      };
    }
  );

  audioEnabledMissingServer = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming = {
          enable = true;
          audio.enable = true;
        };
      };
    }
  );

  displayCompatDefaults = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming.enable = true;
      };
    }
  );

  displayCompatDisabled = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streaming.enable = true;
      };
      services.korri.gameStream.displayCompat.enable = false;
    }
  );

  systemModeAbsolutePathOverrides = evaluateWith (
    lib.recursiveUpdate streamingPrereqs {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        group = "users";
        streaming = {
          enable = true;
          runtimeDir = "/var/run/korri";
          intentPath = "/var/run/korri/next-launch.json";
          statusPath = "/var/run/korri/status.json";
        };
      };
    }
  );

  cliSystemMode = evaluateWith {
    services.korri.server = {
      enable = true;
      serviceMode = "system";
      user = "testuser";
      group = "users";
    };
  };

  cliOptedOut = evaluateWith {
    services.korri.server.enable = true;
    services.korri.cli.enable = false;
  };

  # uinput is now owned by services.korri.input.provider (U3). Verify the
  # legacy gameStream.uinput.enable defaults to false so we do not load
  # uinput from two sources.
  serverEnabledNoStreaming = evaluateWith {
    services.korri.server.enable = true;
  };

  serverWithSessiondPaired = evaluateWith {
    services.korri.server = {
      enable = true;
      sessiond = {
        url = "http://127.0.0.1:3003";
        tokenFile = "/run/korri-sessiond/token";
      };
    };
  };

  serverWithSessiondUrlOnly = evaluateWith {
    services.korri.server = {
      enable = true;
      sessiond.url = "http://127.0.0.1:3003";
    };
  };

  serverWithSessiondTokenOnly = evaluateWith {
    services.korri.server = {
      enable = true;
      sessiond.tokenFile = "/run/korri-sessiond/token";
    };
  };

  # ------------------------------------------------------------------ checks
  check = message: assertion: { inherit message assertion; };

  checks = [
    # ---- default user mode (serviceMode = "user")
    (check "default user mode: emits user unit, no system unit" (
      defaultUserMode.systemd.user.services ? korri-server
      && !(defaultUserMode.systemd.services ? korri-server)
    ))
    (check "default user mode: wantedBy default.target" (
      (serverUserUnit defaultUserMode).wantedBy or [ ] == [ "default.target" ]
    ))
    (check "default user mode: %t runtime path defaults" (
      let
        env = (serverUserUnit defaultUserMode).environment or { };
      in
      env.KORRI_GAME_STREAM_RUNTIME_DIR or null == "%t/korri-game-stream"
      && env.KORRI_GAME_STREAM_INTENT_PATH or null == "%t/korri-game-stream/next-launch.json"
      && env.KORRI_GAME_STREAM_STATUS_PATH or null == "%t/korri-game-stream/status.json"
    ))
    (check "default user mode: %h library default" (
      let
        env = (serverUserUnit defaultUserMode).environment or { };
      in
      env.KORRI_LIBRARY_ROOT or null == "%h/.local/share/korri/library"
    ))
    (check "default user mode: conservative LAN defaults" (
      let
        env = (serverUserUnit defaultUserMode).environment or { };
      in
      env.HOST or null == "127.0.0.1"
      && env.KORRI_STREAM_CONTROL_ENABLED or null == "0"
      # KORRI_SERVER_ADVERTISE_ENABLED retired in federation v1 (R14);
      # the env var no longer exists on any user mode.
      && !((serverUserUnit defaultUserMode).environment or { } ? KORRI_SERVER_ADVERTISE_ENABLED)
      && (defaultUserMode.networking.firewall.allowedTCPPorts or [ ]) == [ ]
    ))
    (check "default user mode: KORRI_PUBLIC_API_BASE_URL omitted by default" (
      !((serverUserUnit defaultUserMode).environment or { } ? KORRI_PUBLIC_API_BASE_URL)
    ))
    (check "default user mode: NixOS assertions pass" (korriFailedAssertions defaultUserMode == [ ]))

    # ---- explicit system mode + streaming
    (check "system mode: emits boot-scoped system unit" (
      explicitSystemMode.systemd.services ? korri-server
      && !(explicitSystemMode.systemd.user.services ? korri-server)
    ))
    (check "system mode: wantedBy multi-user.target" (
      (serverSystemUnit explicitSystemMode).wantedBy or [ ] == [ "multi-user.target" ]
    ))
    (check "system mode: runs as configured non-root user/group" (
      (serverSystemUnit explicitSystemMode).serviceConfig.User or null == "testuser"
      && (serverSystemUnit explicitSystemMode).serviceConfig.Group or null == "users"
    ))
    (check "system mode: /run/korri-game-stream defaults" (
      let
        env = (serverSystemUnit explicitSystemMode).environment or { };
      in
      env.KORRI_GAME_STREAM_RUNTIME_DIR or null == "/run/korri-game-stream"
      && env.KORRI_GAME_STREAM_INTENT_PATH or null == "/run/korri-game-stream/next-launch.json"
      && env.KORRI_GAME_STREAM_STATUS_PATH or null == "/run/korri-game-stream/status.json"
    ))
    (check "system mode: library.root derived from configured user home" (
      let
        env = (serverSystemUnit explicitSystemMode).environment or { };
      in
      env.KORRI_LIBRARY_ROOT or null == "/home/testuser/.local/share/korri/library"
    ))
    (check "system mode: RuntimeDirectory + tmpfiles for /run/korri-game-stream" (
      (serverSystemUnit explicitSystemMode).serviceConfig.RuntimeDirectory or null == "korri-game-stream"
      && (serverSystemUnit explicitSystemMode).serviceConfig.RuntimeDirectoryMode or null == "0700"
      &&
        (explicitSystemMode.systemd.tmpfiles.settings."10-korri-server"."/run/korri-game-stream".d or null)
        != null
    ))
    (check "system mode: writable state and cache directories under hardening" (
      let
        env = (serverSystemUnit explicitSystemMode).environment or { };
      in
      (serverSystemUnit explicitSystemMode).serviceConfig.StateDirectory or null == "korri-server"
      && (serverSystemUnit explicitSystemMode).serviceConfig.StateDirectoryMode or null == "0700"
      && (serverSystemUnit explicitSystemMode).serviceConfig.CacheDirectory or null == "korri-server"
      && (serverSystemUnit explicitSystemMode).serviceConfig.CacheDirectoryMode or null == "0700"
      && env.HOME or null == "/var/lib/korri-server"
      && env.XDG_CACHE_HOME or null == "/var/cache/korri-server"
      && env.BUN_RUNTIME_TRANSPILER_CACHE_PATH or null == "/var/cache/korri-server/bun-transpiler-cache"
    ))
    (check "system mode: conservative systemd hardening" (
      (serverSystemUnit explicitSystemMode).serviceConfig.NoNewPrivileges or null == true
      && (serverSystemUnit explicitSystemMode).serviceConfig.ProtectSystem or null == "strict"
      && (serverSystemUnit explicitSystemMode).serviceConfig.Restart or null == "on-failure"
    ))
    (check "system mode: gameStream wired to system runtime paths" (
      explicitSystemMode.services.korri.gameStream.runtimeDir == "/run/korri-game-stream"
      &&
        explicitSystemMode.services.korri.gameStream.intentPath == "/run/korri-game-stream/next-launch.json"
      && explicitSystemMode.services.korri.gameStream.statusPath == "/run/korri-game-stream/status.json"
    ))
    (check "system mode: NixOS assertions pass" (korriFailedAssertions explicitSystemMode == [ ]))

    # ---- publicApiBaseUrl propagates into env and rejects unsafe URLs
    (check "publicApiBaseUrl: RFC1918 HTTP env var reflects override" (
      (serverUserUnit publicApiBaseUrl).environment.KORRI_PUBLIC_API_BASE_URL or null
      == "http://192.168.1.117:3001"
    ))
    (check "publicApiBaseUrl: loopback HTTP assertions pass" (
      korriFailedAssertions publicApiBaseUrlLoopback == [ ]
    ))
    (check "publicApiBaseUrl: public HTTPS assertions pass" (
      korriFailedAssertions publicApiBaseUrlPublicHttps == [ ]
    ))
    (check "publicApiBaseUrl: public HTTP assertion fires" (
      builtins.any (m: lib.hasInfix "must use https outside loopback or RFC1918 private networks" m) (
        korriFailedAssertionMessages publicApiBaseUrlPublicHttp
      )
    ))
    (check "publicApiBaseUrl: credentials assertion fires" (
      builtins.any (m: lib.hasInfix "must not contain credentials" m) (
        korriFailedAssertionMessages publicApiBaseUrlCredentials
      )
    ))
    (check "publicApiBaseUrl: query assertion fires" (
      builtins.any (m: lib.hasInfix "must not contain query or fragment data" m) (
        korriFailedAssertionMessages publicApiBaseUrlQuery
      )
    ))
    (check "publicApiBaseUrl: fragment assertion fires" (
      builtins.any (m: lib.hasInfix "must not contain query or fragment data" m) (
        korriFailedAssertionMessages publicApiBaseUrlFragment
      )
    ))
    (check "publicApiBaseUrl: whitespace assertion fires" (
      builtins.any (m: lib.hasInfix "must not contain whitespace" m) (
        korriFailedAssertionMessages publicApiBaseUrlWhitespace
      )
    ))
    (check "publicApiBaseUrl: invalid URL assertion fires" (
      builtins.any (m: lib.hasInfix "must be an absolute http or https URL" m) (
        korriFailedAssertionMessages publicApiBaseUrlInvalid
      )
    ))
    (check "publicApiBaseUrl: missing host assertion fires" (
      builtins.any (m: lib.hasInfix "must include a host" m) (
        korriFailedAssertionMessages publicApiBaseUrlMissingHost
      )
    ))

    # ---- system mode safety assertions
    (check "system mode: requires services.korri.server.user" (
      builtins.any (m: lib.hasInfix "requires services.korri.server.user" m) (
        korriFailedAssertionMessages missingUser
      )
    ))
    (check ''system mode: rejects user = "root"'' (
      builtins.any (m: lib.hasInfix "root" m) (korriFailedAssertionMessages rootUser)
    ))
    (check "system mode: rejects %t paths" (
      # Assertion message contains a literal newline between "systemd" and
      # "user specifier", so split substring match across both fragments.
      builtins.any (m: lib.hasInfix "systemd" m && lib.hasInfix "user specifier" m) (
        korriFailedAssertionMessages userSpecifierPath
      )
    ))
    (check "system mode: rejects relative streaming runtime paths" (
      builtins.any (m: lib.hasInfix "absolute path" m) (korriFailedAssertionMessages relativePath)
    ))
    (check "system mode: rejects mismatched streaming file parents" (
      builtins.any (m: lib.hasInfix "must live under" m) (korriFailedAssertionMessages mismatchedParent)
    ))

    # ---- LAN exposure warnings
    (check "global firewall warning fires for non-loopback host" (
      builtins.any (w: lib.hasInfix "global firewall" w) globalFirewall.warnings
    ))
    (check "scoped firewall does not trigger global-firewall warning" (
      !(builtins.any (w: lib.hasInfix "global firewall" w) scopedFirewall.warnings)
      && scopedFirewall.networking.firewall.interfaces ? "tailscale0"
    ))

    # ---- streaming cross-tree assertions
    (check "streaming.enable without compositor.enable: assertion fires" (
      builtins.any (m: lib.hasInfix "services.korri.compositor.enable" m) (
        korriFailedAssertionMessages streamingWithoutCompositor
      )
    ))
    (check "streaming.enable without input.provider.enable: assertion fires" (
      builtins.any (m: lib.hasInfix "services.korri.input.provider.enable" m) (
        korriFailedAssertionMessages streamingWithoutInputProvider
      )
    ))

    # ---- streaming does NOT auto-enable inputd
    (check "streaming.enable does NOT mkDefault-enable services.korri.input.inputd" (
      !streamingDoesNotEnableInputd.services.korri.input.inputd.enable
    ))
    (check "streaming.enable does NOT emit korri-inputd.service" (
      !(streamingDoesNotEnableInputd.systemd.services ? korri-inputd)
    ))

    # ---- Sunshine gamepad backend
    (check "streaming default: services.sunshine.settings.gamepad = \"x360\"" (
      (sunshineSettings streamingDefaultGamepad).gamepad or null == "x360"
    ))
    (check "streaming default: Sunshine app entry generated" (
      sunshineApps streamingDefaultGamepad != [ ]
    ))
    (check "streaming default: Sunshine exposes the intent runner app" (
      builtins.elem "Korri Stream" (sunshineAppNames streamingDefaultGamepad)
    ))
    (check "streaming default: Sunshine exposes a persistent Desktop app" (
      builtins.elem "Desktop" (sunshineAppNames streamingDefaultGamepad)
    ))
    (check "streaming default: Desktop app keeps the compositor stream alive" (
      let
        app = sunshineAppByName streamingDefaultGamepad "Desktop";
        wrapper = if app == null then "" else builtins.readFile app.cmd;
      in
      app != null
      && app."auto-detach" == false
      && app."wait-all" == true
      && app.output == "$HOME/.local/state/korri/desktop-stream.log"
      && lib.hasInfix "keeping existing compositor session alive" wrapper
      && lib.hasInfix "sleep 3600" wrapper
    ))
    (check "streaming desktop app can be disabled" (
      !(builtins.elem "Desktop" (sunshineAppNames streamingDesktopDisabled))
    ))
    (check "streaming default: host can override gamepad backend (mkDefault precedence)" (
      (sunshineSettings streamingHostGamepadOverride).gamepad or null == "ds5"
    ))

    # ---- Korri-owned system-mode Sunshine unit
    (check "streaming.enable defaults services.sunshine.enable to true" (
      streamingDefaultGamepad.services.sunshine.enable
    ))
    (check "streaming.enable forces services.sunshine.autoStart to false" (
      streamingDefaultGamepad.services.sunshine.autoStart == false
    ))
    (check "streaming.enable emits systemd.services.korri-sunshine" (
      streamingDefaultGamepad.systemd.services ? korri-sunshine
    ))
    (check "korri-sunshine unit is boot-scoped (wantedBy multi-user.target)" (
      streamingDefaultGamepad.systemd.services.korri-sunshine.wantedBy or [ ] == [ "multi-user.target" ]
    ))
    (check "korri-sunshine requires korri-compositor.service" (
      builtins.elem "korri-compositor.service" (
        streamingDefaultGamepad.systemd.services.korri-sunshine.requires or [ ]
      )
    ))
    (check "korri-sunshine is ordered After korri-compositor.service" (
      builtins.elem "korri-compositor.service" (
        streamingDefaultGamepad.systemd.services.korri-sunshine.after or [ ]
      )
    ))
    (check "korri-sunshine ExecStart points at sunshine-korri" (
      lib.hasInfix "sunshine-korri" (
        streamingDefaultGamepad.systemd.services.korri-sunshine.serviceConfig.ExecStart or ""
      )
    ))
    (check "korri-sunshine ExecStart includes a rendered sunshine.conf" (
      lib.hasInfix "sunshine.conf" (
        streamingDefaultGamepad.systemd.services.korri-sunshine.serviceConfig.ExecStart or ""
      )
    ))
    (check "korri-sunshine ExecStartPre waits for the wayland socket" (
      lib.hasInfix "korri-sunshine-wait-for-wayland" (
        streamingDefaultGamepad.systemd.services.korri-sunshine.serviceConfig.ExecStartPre or ""
      )
    ))
    (check "korri-sunshine runs as the compositor user (root in streamingPrereqs)" (
      streamingDefaultGamepad.systemd.services.korri-sunshine.serviceConfig.User or null == "root"
    ))
    (check "korri-sunshine inherits WAYLAND_DISPLAY = wayland-1 from compositor" (
      (streamingDefaultGamepad.systemd.services.korri-sunshine.environment or { }).WAYLAND_DISPLAY or null
      == "wayland-1"
    ))
    (check "korri-sunshine inherits XDG_RUNTIME_DIR from compositor" (
      lib.hasPrefix "/run/" (
        (streamingDefaultGamepad.systemd.services.korri-sunshine.environment or { }).XDG_RUNTIME_DIR or ""
      )
    ))
    (check "audio: disabled by default leaves korri-sunshine without PULSE_SERVER" (
      !((audioDisabled.systemd.services.korri-sunshine.environment or { }) ? PULSE_SERVER)
    ))
    (check "audio: enabled pulseServer appears in korri-sunshine environment" (
      (audioEnabledWithServer.systemd.services.korri-sunshine.environment or { }).PULSE_SERVER or null
      == "unix:/run/user/1000/pulse/native"
    ))
    (check "audio: enabled without pulseServer assertion names both option paths" (
      builtins.any (
        m:
        lib.hasInfix "services.korri.server.streaming.audio.enable" m
        && lib.hasInfix "services.korri.server.streaming.audio.pulseServer" m
      ) (korriFailedAssertionMessages audioEnabledMissingServer)
    ))
    (check "audio: pulse server is sunshine-only plumbing" (
      let
        wrapper = firstAppWrapper audioEnabledWithServer;
        serverEnv = (serverSystemUnit audioEnabledWithServer).environment or { };
      in
      !lib.hasInfix "PULSE_SERVER" (if wrapper == null then "" else wrapper)
      && !(serverEnv ? PULSE_SERVER)
    ))
    (check "streaming.enable + services.sunshine.enable = false: assertion fires" (
      builtins.any (m: lib.hasInfix "services.sunshine.enable = true" m) (
        korriFailedAssertionMessages streamingWithSunshineDisabled
      )
    ))

    # ---- uinput now owned by input.provider, gameStream defaults to NOT loading it
    (check "server-only (no streaming): gameStream.uinput.enable defaults to false" (
      !serverEnabledNoStreaming.services.korri.gameStream.uinput.enable
    ))
    (check "server-only (no streaming): uinput is NOT in boot.kernelModules" (
      !(builtins.elem "uinput" (serverEnabledNoStreaming.boot.kernelModules or [ ]))
    ))
    (check "streaming + provider: uinput IS in boot.kernelModules (via provider)" (
      builtins.elem "uinput" explicitSystemMode.boot.kernelModules
    ))
    (check "streaming + provider: udev rules cover /dev/uinput (via provider)" (
      lib.hasInfix ''KERNEL=="uinput"'' explicitSystemMode.services.udev.extraRules
    ))

    # ---- displayCompat preserved through rename
    (check "displayCompat: defaults still enabled" (
      displayCompatDefaults.services.korri.gameStream.displayCompat.enable
    ))
    (check "displayCompat: Sunshine wrapper bakes in display compat exports" (
      let
        script = firstAppWrapper displayCompatDefaults;
      in
      script != null
      && lib.hasInfix "\"\${SDL_VIDEODRIVER:=wayland,x11}\"" script
      && lib.hasInfix "export SDL_VIDEODRIVER" script
    ))
    (check "displayCompat: disable opt-out removes exports" (
      let
        script = firstAppWrapper displayCompatDisabled;
      in
      script != null && !lib.hasInfix "SDL_VIDEODRIVER" script
    ))

    # ---- absolute path overrides
    (check "system mode absolute overrides: env reflects overrides" (
      let
        env = (serverSystemUnit systemModeAbsolutePathOverrides).environment or { };
      in
      env.KORRI_GAME_STREAM_RUNTIME_DIR or null == "/var/run/korri"
      && env.KORRI_GAME_STREAM_INTENT_PATH or null == "/var/run/korri/next-launch.json"
      && env.KORRI_GAME_STREAM_STATUS_PATH or null == "/var/run/korri/status.json"
    ))
    (check "system mode absolute overrides: gameStream wired to overrides" (
      systemModeAbsolutePathOverrides.services.korri.gameStream.runtimeDir == "/var/run/korri"
      &&
        systemModeAbsolutePathOverrides.services.korri.gameStream.intentPath
        == "/var/run/korri/next-launch.json"
      &&
        systemModeAbsolutePathOverrides.services.korri.gameStream.statusPath == "/var/run/korri/status.json"
    ))
    (check "system mode absolute overrides: no RuntimeDirectory or tmpfiles for non-default" (
      (serverSystemUnit systemModeAbsolutePathOverrides).serviceConfig.RuntimeDirectory or null == null
      && !(systemModeAbsolutePathOverrides.systemd.tmpfiles.settings ? "10-korri-server")
    ))

    # ---- korri CLI auto-enable
    (check "server.enable mkDefaults services.korri.cli.enable in user mode" (
      defaultUserMode.services.korri.cli.enable
    ))
    (check "server.enable mkDefaults services.korri.cli.enable in system mode" (
      cliSystemMode.services.korri.cli.enable
    ))
    (check "cli opt-out (cli.enable = false) is honored" (!cliOptedOut.services.korri.cli.enable))

    # ---- sessiond wiring (Phase 4C completion: korri-server delegates managed launches)
    (check "sessiond paired: KORRI_SESSIOND_URL exported" (
      let env = (serverUserUnit serverWithSessiondPaired).environment or { }; in
      env.KORRI_SESSIOND_URL or null == "http://127.0.0.1:3003"
    ))
    (check "sessiond paired: KORRI_SESSIOND_TOKEN_FILE exported" (
      let env = (serverUserUnit serverWithSessiondPaired).environment or { }; in
      env.KORRI_SESSIOND_TOKEN_FILE or null == "/run/korri-sessiond/token"
    ))
    (check "sessiond defaults absent: no sessiond env exported" (
      let env = (serverUserUnit serverEnabledNoStreaming).environment or { }; in
      !(env ? KORRI_SESSIOND_URL) && !(env ? KORRI_SESSIOND_TOKEN_FILE)
    ))
    (check "sessiond url-only: assertion fires (both-or-neither)" (
      builtins.any (m: lib.hasInfix "sessiond.url and" m)
        (korriFailedAssertionMessages serverWithSessiondUrlOnly)
    ))
    (check "sessiond token-only: assertion fires (both-or-neither)" (
      builtins.any (m: lib.hasInfix "sessiond.url and" m)
        (korriFailedAssertionMessages serverWithSessiondTokenOnly)
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-server module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-server-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-server module checks passed."
    touch $out
  ''
