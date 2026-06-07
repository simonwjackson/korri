{
  pkgs,
  commonPackages,
  commonShellHook,
  desktop,
  ...
}:

{
  ci = pkgs.mkShell {
    buildInputs = commonPackages;
    shellHook = commonShellHook + ''
      export CI=true
    '';
  };

  default = pkgs.mkShell {
    buildInputs =
      commonPackages
      ++ (with pkgs; [
        gum
        concurrently
        hivemind
        watchexec
        lsof
        curl
        nodejs_20
        playwright-driver.browsers
      ])
      ++ desktop.devShell.packages;

    shellHook = commonShellHook + desktop.devShell.shellHook;
  };
}
