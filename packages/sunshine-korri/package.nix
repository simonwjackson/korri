{ sunshine }:

sunshine.overrideAttrs (old: {
  pname = "sunshine-korri";
  version = "${old.version}-korri";
  __intentionallyOverridingVersion = true;

  patches = (old.patches or [ ]) ++ [
    ./patches/0001-runtime-bitrate-restart-mvp.patch
  ];

  meta = old.meta // {
    description = "Korri downstream Sunshine build with carried experimental patches";
  };
})
