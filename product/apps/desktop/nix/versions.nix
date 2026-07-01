{
  electrobun = {
    version = "1.16.0";

    cli = {
      x86_64-linux = "sha256-lBKJBx4oSEl/mo67cKrlbuwd07dQYJrgxjQxZzZe5m0=";
      aarch64-linux = "sha256-xq8GWc+P67m9YsQ8xr069BP83VayNPkuSi/Kzl1+woE=";
    };

    core = {
      x86_64-linux = "sha256-p0aLbSaT4OV2jajdU+ecSC1D0rU5dykqbU1RwBIpYIQ=";
      aarch64-linux = "sha256-NrkUkPrl0BZVuqNn3OaDnrtbW+rFNCotAES07p07T7E=";
    };

    # CEF (Chromium Embedded Framework) engine binaries. Optional — only the
    # CEF renderer variant consumes these; the default WebKitGTK variant does
    # not fetch them. CEF renders identically to Chromium (the reference
    # browser) and is Electrobun's recommended Linux renderer, at the cost of a
    # larger closure. See docs on the CEF variant.
    cef = {
      x86_64-linux = "sha256-z5Qwlj1bZ41DggtlntqUbgog2MgRh3BzNKGm4ty+2cI=";
      aarch64-linux = "sha256-/jfXrLVCwFPw17ZBtd2GT9Wv6VT8DY76rJsK3jjP0uM=";
    };
  };
}
