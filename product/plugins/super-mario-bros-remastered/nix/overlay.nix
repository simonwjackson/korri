{
  nixpkgs-godot ? null,
}:

final: prev: {
  smb-remastered = final.callPackage ../package.nix {
    inherit nixpkgs-godot;
  };
}
