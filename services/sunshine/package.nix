{ sunshine }:

let
  sunshineWithCuda = sunshine.override { cudaSupport = true; };
in
sunshineWithCuda.overrideAttrs (
  old:
  let
    approved = import ./approved-patches.nix;
    baseSunshineSource = builtins.unsafeDiscardStringContext (toString sunshineWithCuda.src);
    baseSunshineSourceHash = sunshineWithCuda.src.outputHash;
    baseSunshineDerivation = builtins.unsafeDiscardStringContext sunshineWithCuda.drvPath;
    basePatches = old.patches or [ ];
    cudaEnabled =
      !(builtins.elem "-DSUNSHINE_ENABLE_CUDA:BOOL=FALSE" sunshineWithCuda.cmakeFlags)
      && builtins.any (
        input: builtins.match ".*cuda_nvcc.*" (toString input) != null
      ) sunshineWithCuda.nativeBuildInputs
      && builtins.any (
        input: builtins.match ".*(cuda_cudart|cuda-merged).*" (toString input) != null
      ) sunshineWithCuda.buildInputs;
    approvedBaseSunshineDerivation = builtins.head (
      builtins.filter (
        candidate: candidate == baseSunshineDerivation
      ) approved.approvedBaseDerivations
    );
    provenanceRelativePath = "share/korri/sunshine-korri/provenance";
    patchRecords = map (record: {
      inherit (record) name path sha256;
      actualName = builtins.baseNameOf record.path;
      actualSha256 = builtins.hashFile "sha256" record.path;
    }) approved.patches;
    patchesApproved = builtins.all (
      record: record.name == record.actualName && record.sha256 == record.actualSha256
    ) patchRecords;
    patchSetMaterial =
      builtins.concatStringsSep "\n" (map (record: "${record.name} ${record.sha256}") patchRecords)
      + "\n";
    actualPatchSetSha256 = builtins.hashString "sha256" patchSetMaterial;
    patchNames = map (record: record.name) patchRecords;
    patchLines = builtins.concatStringsSep "\n" (
      map (record: "patch=${record.name} sha256=${record.sha256}") patchRecords
    );
    provenance = ''
      format=1
      package=sunshine-korri
      base_sunshine_version=${approved.baseSunshineVersion}
      approved_base_sunshine_source_hash=${approved.approvedBaseSourceHash}
      base_sunshine_source=${baseSunshineSource}
      base_sunshine_derivation=${baseSunshineDerivation}
      approved_base_sunshine_derivation=${approvedBaseSunshineDerivation}
      reviewed_libavcodec_version=${approved.reviewedLibavcodecVersion}
      reviewed_ffmpeg_commit=${approved.reviewedFfmpegCommit}
      reviewed_ffmpeg_source_hash=${approved.reviewedFfmpegSourceHash}
      reviewed_nvenc_api=${toString approved.reviewedNvencApiMajor}.${toString approved.reviewedNvencApiMinor}
      executable=bin/sunshine
      patch_set_sha256=${approved.patchSetSha256}
      ${patchLines}
    '';
  in
  if old.version != approved.baseSunshineVersion then
    throw "sunshine-korri base version changed; review the approved patch set before building"
  else if baseSunshineSourceHash != approved.approvedBaseSourceHash then
    throw "sunshine-korri base source hash changed; review the approved source before building"
  else if !cudaEnabled then
    throw "sunshine-korri CUDA support is not present in the actual build inputs"
  else if !(builtins.elem baseSunshineDerivation approved.approvedBaseDerivations) then
    throw "sunshine-korri CUDA base derivation changed; review the complete upstream recipe before building"
  else if basePatches != [ ] then
    throw "sunshine-korri base derivation carries unapproved patches"
  else if !patchesApproved then
    throw "sunshine-korri patch content differs from services/sunshine/approved-patches.nix"
  else if actualPatchSetSha256 != approved.patchSetSha256 then
    throw "sunshine-korri ordered patch-set digest differs from services/sunshine/approved-patches.nix"
  else
    {
      pname = "sunshine-korri";
      version = "${approved.baseSunshineVersion}-korri";
      __intentionallyOverridingVersion = true;

      patches = map (record: record.path) approved.patches;

      postInstall = (old.postInstall or "") + ''
        install -d -m755 "$out/${builtins.dirOf provenanceRelativePath}"
        cat > "$out/${provenanceRelativePath}" <<'EOF'
        ${provenance}EOF
        chmod 0444 "$out/${provenanceRelativePath}"
      '';

      passthru = (old.passthru or { }) // {
        korriProvenanceRelativePath = provenanceRelativePath;
        korriPatchNames = patchNames;
        korriPatchSetSha256 = approved.patchSetSha256;
        korriBaseSunshineVersion = approved.baseSunshineVersion;
        korriApprovedBaseSunshineSourceHash = approved.approvedBaseSourceHash;
        korriBaseSunshineSource = baseSunshineSource;
        korriBaseSunshineDerivation = baseSunshineDerivation;
        korriApprovedBaseSunshineDerivation = approvedBaseSunshineDerivation;
        korriReviewedLibavcodecVersion = approved.reviewedLibavcodecVersion;
        korriReviewedFfmpegCommit = approved.reviewedFfmpegCommit;
        korriReviewedFfmpegSourceHash = approved.reviewedFfmpegSourceHash;
        korriReviewedNvencApiMajor = approved.reviewedNvencApiMajor;
        korriReviewedNvencApiMinor = approved.reviewedNvencApiMinor;
        korriCudaEnabled = cudaEnabled;
      };

      meta = old.meta // {
        description = "Korri downstream Sunshine build with carried experimental patches";
      };
    }
)
