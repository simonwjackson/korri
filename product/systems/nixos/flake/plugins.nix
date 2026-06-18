{
  pkgs,
  src ? null,
  bunDeps ? null,
  enable ? true,
  pluginRoot ? ../../../../product/plugins,
  gamescopePackage ? null,
  controlBridgePackage ? null,
}:

let
  lib = pkgs.lib;
  pluginEntries = builtins.readDir pluginRoot;
  pluginNames = lib.sort lib.lessThan (builtins.attrNames pluginEntries);
  compositionPathFor = name: pluginRoot + "/${name}/nix/composition.nix";
  hasComposition =
    name: pluginEntries.${name} == "directory" && builtins.pathExists (compositionPathFor name);
  compositionPaths = map compositionPathFor (builtins.filter hasComposition pluginNames);

  commonArgs = {
    inherit
      pkgs
      src
      bunDeps
      enable
      gamescopePackage
      controlBridgePackage
      ;
    pluginPackages = packages;
  };

  callComposition =
    path:
    let
      composition = import path;
      acceptedArgs = builtins.functionArgs composition;
    in
    composition (builtins.intersectAttrs acceptedArgs commonArgs);

  compositions = map callComposition compositionPaths;
  mergeAttrs =
    attrsName:
    lib.foldl' lib.recursiveUpdate { } (
      map (composition: composition.${attrsName} or { }) compositions
    );
  concatLists =
    attrsName: lib.concatLists (map (composition: composition.${attrsName} or [ ]) compositions);

  packages = mergeAttrs "packages";
in
{
  enabledPluginIds = concatLists "enabledPluginIds";
  inherit packages;
  apps = mergeAttrs "apps";
  checks = mergeAttrs "checks";
  overlays = concatLists "overlays";
  nixosModules = concatLists "nixosModules";
}
