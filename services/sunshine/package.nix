{ sunshine }:

sunshine.overrideAttrs (
  old:
  let
    approved = import ./approved-patches.nix;
    baseSunshineSource = builtins.unsafeDiscardStringContext (toString sunshine.src);
    baseSunshineSourceHash = sunshine.src.outputHash;
    baseSunshineDerivation = builtins.unsafeDiscardStringContext sunshine.drvPath;
    basePatches = old.patches or [ ];
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
      approved_base_sunshine_derivation=${approved.approvedBaseDerivation}
      reviewed_libavcodec_version=${approved.reviewedLibavcodecVersion}
      executable=bin/sunshine
      patch_set_sha256=${approved.patchSetSha256}
      ${patchLines}
    '';
  in
  if old.version != approved.baseSunshineVersion then
    throw "sunshine-korri base version changed; review the approved patch set before building"
  else if baseSunshineSourceHash != approved.approvedBaseSourceHash then
    throw "sunshine-korri base source hash changed; review the approved source before building"
  else if baseSunshineDerivation != approved.approvedBaseDerivation then
    throw "sunshine-korri base derivation changed; review the complete upstream recipe before building"
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
        korriApprovedBaseSunshineDerivation = approved.approvedBaseDerivation;
        korriReviewedLibavcodecVersion = approved.reviewedLibavcodecVersion;
      };

      meta = old.meta // {
        description = "Korri downstream Sunshine build with carried experimental patches";
      };
    }
)
