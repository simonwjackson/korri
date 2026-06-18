# Colocated package check for the SRB2 plugin package surface.
{
  pkgs,
  srb2Package,
}:

let
  lib = pkgs.lib;
  pkg = srb2Package;
  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "srb2 exposes the expected pinned version" ((pkg.version or null) == "2.2.15"))
    (check "srb2 exposes the expected mainProgram" ((pkg.meta.mainProgram or null) == "srb2"))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "srb2 check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "srb2-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/srb2
      test -x ${pkg}/bin/.srb2-wrapped
      test -f ${pkg}/share/applications/'Sonic Robo Blast 2.desktop'

      grep -q '^export SRB2WADDIR=' ${pkg}/bin/srb2
      wad_dir=$(sed -n "s/^export SRB2WADDIR='\(.*\)'/\1/p" ${pkg}/bin/srb2)
      if [ -z "$wad_dir" ]; then
        echo "error: could not parse SRB2WADDIR from wrapper" >&2
        exit 1
      fi

      test -f "$wad_dir/srb2.pk3"
      test -f "$wad_dir/zones.pk3"
      test -f "$wad_dir/characters.pk3"
      test -f "$wad_dir/music.pk3"
      test -f "$wad_dir/models.dat"

      magic=$(head -c4 ${pkg}/bin/.srb2-wrapped | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "7f454c46" ]; then
        echo "error: .srb2-wrapped is not an ELF binary (magic: $magic)" >&2
        exit 1
      fi

      file -b ${pkg}/bin/.srb2-wrapped > "$out/srb2-file.txt"
      grep -q '^Exec=srb2' ${pkg}/share/applications/'Sonic Robo Blast 2.desktop'

      cat > "$out/summary.txt" <<'SUMMARY'
      srb2 package surface passes wrapper, data-directory, ELF, and desktop-entry checks.
      SUMMARY
    ''
