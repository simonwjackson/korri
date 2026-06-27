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
  desktop = mkSource (
    [
      ../../../../electrobun.config.ts
      ../../../../product/apps/desktop
      # Desktop window options share the companion route path with Shift, so
      # include that route contract without pulling the whole web surface into
      # the desktop package source.
      ../../../../product/surfaces/web/shift/routes/paths.ts
      ../../../../product/surfaces/terminal/korri-cli
    ]
    ++ sharedRuntime
  );
  inputd = mkSource (deviceRuntime ++ [ ../../../../tools/types ]);
  gameStream = mkSource deviceRuntime;
  sessiond = mkSource deviceRuntime;
  cli = mkSource ([ ../../../../product/surfaces/terminal/korri-cli ] ++ deviceRuntime);
  server = mkSource (
    [
      ../../../../product/surfaces/terminal/korri-cli
      ../../../../product/services/server
    ]
    ++ deviceRuntime
  );
}
