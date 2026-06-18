{ fake-08-src }:

final: _prev: {
  libretro-fake-08 = final.callPackage ../packages/libretro-fake-08/package.nix {
    inherit fake-08-src;
  };
}
