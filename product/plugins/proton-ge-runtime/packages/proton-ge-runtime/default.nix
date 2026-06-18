{
  lib,
  stdenvNoCC,
  fetchurl,
  coreutils,
}:

let
  version = "GE-Proton10-34";
  protonRoot = "share/korri/proton-ge-runtime/${version}";
  src = fetchurl {
    url = "https://github.com/GloriousEggroll/proton-ge-custom/releases/download/${version}/${version}.tar.gz";
    hash = "sha256-UcWAtmqDPHOZj+APBxfurFcZdlQECi8u1RiePuaNdz0=";
  };
in
stdenvNoCC.mkDerivation {
  pname = "korri-proton-ge-runtime";
  inherit version src;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out/${protonRoot}" "$out/share/korri/proton-ge-runtime"
    cp -R --no-preserve=ownership . "$out/${protonRoot}"
    chmod -R u=rwX,go=rX "$out/${protonRoot}"

    test -x "$out/${protonRoot}/files/bin/wine64"
    test -d "$out/${protonRoot}/files/lib/wine/dxvk/x86_64-windows"
    test -d "$out/${protonRoot}/files/lib/vkd3d/x86_64-windows"

    install -m644 ${./setup-env} "$out/share/korri/proton-ge-runtime/setup-env"
    substituteInPlace "$out/share/korri/proton-ge-runtime/setup-env" \
      --replace-fail '@coreutils@' '${coreutils}/bin' \
      --replace-fail '@protonGeRoot@' "$out/${protonRoot}"

    cat > "$out/share/korri/proton-ge-runtime/manifest.txt" <<EOF
    pname=korri-proton-ge-runtime
    version=${version}
    upstream=https://github.com/GloriousEggroll/proton-ge-custom/releases/tag/${version}
    asset=${version}.tar.gz
    asset-sha256=51c580b66a833c73998fe00f0717eeac57197654040a2f2ed5189e3ee68d773d
    release-notes=import-aarch64-build-changes-from-upstream
    runtime-root=$out/${protonRoot}
    EOF

    runHook postInstall
  '';

  passthru = {
    inherit version;
    setupEnv = "share/korri/proton-ge-runtime/setup-env";
    runtimeRoot = protonRoot;
    assetSha256 = "51c580b66a833c73998fe00f0717eeac57197654040a2f2ed5189e3ee68d773d";
  };

  meta = {
    description = "Pinned GE-Proton runtime for optional Korri Windows game launches";
    homepage = "https://github.com/GloriousEggroll/proton-ge-custom";
    license = lib.licenses.bsd3;
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
