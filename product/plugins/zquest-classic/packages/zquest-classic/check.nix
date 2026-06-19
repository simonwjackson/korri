{
  pkgs,
  zquestClassicPackage,
}:

pkgs.runCommand "zquest-classic-check" { nativeBuildInputs = [ pkgs.file ]; } ''
  test -x ${zquestClassicPackage}/bin/zplayer
  test -x ${zquestClassicPackage}/bin/zlauncher
  test -f ${zquestClassicPackage}/share/zquestclassic/base_config/zc.cfg
  test -f ${zquestClassicPackage}/share/zquestclassic/modules/classic/default.qst
  file ${zquestClassicPackage}/bin/.zplayer-wrapped | grep -q 'ELF'
  mkdir -p "$out"
''
