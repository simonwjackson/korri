{
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  targetSystem = "aarch64-linux";
  targetPackages = flake.packages.${targetSystem} or { };
  hostPackages = flake.packages.${system} or { };
  configs = flake.nixosConfigurations or { };

  summarize = eval: {
    assertionsPassed = builtins.filter (a: !a.assertion) eval.config.assertions == [ ];
    assertionMessages = map (a: a.message) (builtins.filter (a: !a.assertion) eval.config.assertions);
    serverEnabled = eval.config.services.korri.server.enable or false;
    serverUser = eval.config.services.korri.server.user or null;
    serverServiceMode = eval.config.services.korri.server.serviceMode or null;
    clientEnabled = eval.config.services.korri.client.enable or false;
    kioskEnabled = eval.config.services.korri.kiosk.enable or false;
    inputdEnabled = eval.config.services.korri.inputd.enable or false;
    kioskUser = eval.config.services.korri.kiosk.user or null;
    kioskCreateUser = eval.config.services.korri.kiosk.createUser or null;
    kioskRuntimeDir = eval.config.services.korri.kiosk.runtimeDir or null;
    kioskSessionBusMode = eval.config.services.korri.kiosk.sessionBus.mode or null;
    kioskSessionBusServices = eval.config.services.korri.kiosk.sessionBus.services or [ ];
    inputProviderName = eval.config.services.korri.kiosk.input.provider.name or null;
    inputProviderServices = eval.config.services.korri.kiosk.input.provider.services or [ ];
    systemName = eval.config.system.name;
    hostName = eval.config.networking.hostName;
    systemPackages = map (pkg: pkg.name or "") (eval.config.environment.systemPackages or [ ]);
  };

  byCompatibleResult = builtins.tryEval configs.korri-rocknix-kiosk-by-compatible.config.system.build.toplevel.drvPath;
in
{
  configAttrs = builtins.attrNames configs;
  targetPackageAttrs = builtins.attrNames targetPackages;
  hostPackageAttrs = builtins.attrNames hostPackages;
  packageDrvPaths = {
    thorSystem = (targetPackages.korri-rocknix-kiosk-system-thor or null).drvPath or null;
    soboSystem = (targetPackages.korri-rocknix-kiosk-system-odin2portal or null).drvPath or null;
    thorRootfs = (hostPackages.korri-rocknix-rootfs-thor or null).drvPath or null;
    soboRootfs = (hostPackages.korri-rocknix-rootfs-odin2portal or null).drvPath or null;
  };
  thor = summarize configs.korri-rocknix-kiosk-thor;
  sobo = summarize configs.korri-rocknix-kiosk-odin2portal;
  byCompatibleWithoutEnv = {
    success = byCompatibleResult.success;
    value = if byCompatibleResult.success then byCompatibleResult.value else null;
  };
}
