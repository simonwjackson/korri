{ pkgs }:

let
  fileset = pkgs.lib.fileset;
  common = [
    ../../../../bun.lock
    ../../../../bunfig.toml
    ../../../../package.json
    ../../../../tsconfig.api.json
    ../../../../tsconfig.json
    ../../../../tsconfig.server.json
  ];
  mkSource =
    extra:
    fileset.toSource {
      root = ../../../..;
      fileset = fileset.unions (common ++ extra);
    };
  sharedRuntime = [
    ../../../../product/platform
    ../../../../product/plugins
    ../../../../product/plugin-host
  ];
  deviceRuntime = [
    ../../../../product/apps/portal
    ../../../../product/services/device
    ../../../../tools/library
  ]
  ++ sharedRuntime;
in
{
  portal = mkSource (
    [
      ../../../../components.json
      ../../../../vite.config.mjs
      ../../../../product/apps/desktop/runtime-config-shape.ts
      ../../../../product/apps/portal
      ../../../../product/surfaces/web
      ../../../../packages/intrinsic-design
    ]
    ++ sharedRuntime
  );
  inputd = mkSource (deviceRuntime ++ [ ../../../../tools/types ]);
  gameStream = mkSource deviceRuntime;
  sessiond = mkSource deviceRuntime;
  webSurfaceHost = mkSource (
    deviceRuntime
    ++ [
      ../../../../product/apps/desktop
      ../../../../product/systems/nixos/flake/sources.nix
    ]
  );
  cli = mkSource ([ ../../../../product/surfaces/terminal/korri-cli ] ++ deviceRuntime);
  server = mkSource (
    [
      ../../../../product/surfaces/terminal/korri-cli
      ../../../../product/services/server
    ]
    ++ deviceRuntime
  );
}
