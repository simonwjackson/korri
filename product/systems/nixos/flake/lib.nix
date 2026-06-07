{
  pkgs,
  isSupportedDesktopSystem,
  korriImages,
  desktop,
  ...
}:

{
  korriImages = korriImages;
}
// pkgs.lib.optionalAttrs isSupportedDesktopSystem {
  # Downstream consumers (mountainous, future device profiles) can
  # build their own variants without vendoring build logic:
  #   inputs.korri.lib.${system}.wrapKorriDesktop {
  #     korri-desktop-unwrapped =
  #       inputs.korri.packages.${system}.korri-desktop-unwrapped;
  #     webkitgtk_4_1 = customPkgs.webkitgtk_4_1;
  #     ...
  #     profile = "steamdeck";
  #   }
  wrapKorriDesktop = desktop.lib.wrap;
}
