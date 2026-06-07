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
      ../../../../product/themes
    ]
    ++ sharedRuntime
  );
  desktop = mkSource (
    [
      ../../../../electrobun.config.ts
      ../../../../product/apps/desktop
      ../../../../product/apps/cli
    ]
    ++ sharedRuntime
  );
  inputd = mkSource (deviceRuntime ++ [ ../../../../tools/types ]);
  gameStream = mkSource deviceRuntime;
  sessiond = mkSource deviceRuntime;
  cli = mkSource ([ ../../../../product/apps/cli ] ++ deviceRuntime);
  server = mkSource (
    [
      ../../../../product/apps/cli
      ../../../../product/services/server
    ]
    ++ deviceRuntime
  );
}
