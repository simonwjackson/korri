inputs:

{
  overlays = import ./overlays.nix inputs;
  nixosConfigurations = import ./configurations.nix inputs;
  nixosModules = import ./modules.nix inputs;
}
