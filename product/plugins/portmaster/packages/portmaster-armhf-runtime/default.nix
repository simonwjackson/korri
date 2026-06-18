{
  lib,
  stdenvNoCC,
  fetchurl,
  dpkg,
  qemu,
}:

let
  debs = [
    (fetchurl {
      name = "libc6_2.36-9+deb12u14_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/glibc/libc6_2.36-9+deb12u14_armhf.deb";
      hash = "sha256-dYxouSZUdHAltIR2pFwxW/Ft8TISJKvdm+Zyv9EgvkU=";
    })
    (fetchurl {
      name = "libgcc-s1_12.2.0-14+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/gcc-12/libgcc-s1_12.2.0-14+deb12u1_armhf.deb";
      hash = "sha256-9YVivwHv1hErkUGCFH7hSeDUyQhpBG4xhE2ogDZp7rM=";
    })
    (fetchurl {
      name = "libstdc++6_12.2.0-14+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/gcc-12/libstdc++6_12.2.0-14+deb12u1_armhf.deb";
      hash = "sha256-ZtU93rEKN/IuRVYRwsUV+dRE5SO1XYc/9IveRyZ5Y9s=";
    })
    (fetchurl {
      name = "zlib1g_1_1.2.13.dfsg-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/z/zlib/zlib1g_1.2.13.dfsg-1_armhf.deb";
      hash = "sha256-tS/MRDCF/5xnZki00PyXzTG48Rm91OdTTlC26ThlAro=";
    })
    (fetchurl {
      name = "libsdl2-2.0-0_2.26.5+dfsg-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsdl2/libsdl2-2.0-0_2.26.5+dfsg-1_armhf.deb";
      hash = "sha256-t2q9shTnIToeplQt1hjJQNO1YBwU3PiFd9sdE9aoDsc=";
    })
    (fetchurl {
      name = "libsdl2-image-2.0-0_2.6.3+dfsg-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsdl2-image/libsdl2-image-2.0-0_2.6.3+dfsg-1_armhf.deb";
      hash = "sha256-ho/O1S3XH6ONnmYXuacu8TfTUHjE/xABlJObvolOZQc=";
    })
    (fetchurl {
      name = "libsdl2-mixer-2.0-0_2.6.2+dfsg-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsdl2-mixer/libsdl2-mixer-2.0-0_2.6.2+dfsg-2_armhf.deb";
      hash = "sha256-reOPHeX5dBAj6pL8RJwpUFCA2Ibzx9nnUOIkwQMeJFY=";
    })
    (fetchurl {
      name = "libsdl2-ttf-2.0-0_2.20.1+dfsg-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsdl2-ttf/libsdl2-ttf-2.0-0_2.20.1+dfsg-2_armhf.deb";
      hash = "sha256-5YJZiYtbw0w6RSpGclKZ4Lp70pDWt9Oh0Qhr3y/Pmyg=";
    })
    (fetchurl {
      name = "libopusfile0_0.12-4_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/o/opusfile/libopusfile0_0.12-4_armhf.deb";
      hash = "sha256-cZ0Dn/7vtIsAznJD0XCxJvLvAoybKyIDcH5fxdXA3E8=";
    })
    (fetchurl {
      name = "libharfbuzz0b_6.0.0+dfsg-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/h/harfbuzz/libharfbuzz0b_6.0.0+dfsg-3_armhf.deb";
      hash = "sha256-qRQyVgLCdyDgJvdKBNzvCg2k9WPYZrBgcnDjiMQI4EI=";
    })
    (fetchurl {
      name = "gcc-12-base_12.2.0-14+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/gcc-12/gcc-12-base_12.2.0-14+deb12u1_armhf.deb";
      hash = "sha256-qlD5DEQDd7khmDDtPmWK7csKHBu0dzPrBc9lVFAS9WM=";
    })
    (fetchurl {
      name = "libasound2_1.2.8-1+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/a/alsa-lib/libasound2_1.2.8-1+b1_armhf.deb";
      hash = "sha256-l3GP9eVSyae5536N674hmwBoqatdyr7dCADGndjw65Y=";
    })
    (fetchurl {
      name = "libdecor-0-0_0.1.1-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libd/libdecor-0/libdecor-0-0_0.1.1-2_armhf.deb";
      hash = "sha256-wMDQbt+w1cTq8+x+gGwTxFIIF/o0JEMyw2rr+hJ+Yz8=";
    })
    (fetchurl {
      name = "libdrm2_2.4.114-1+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libd/libdrm/libdrm2_2.4.114-1+b1_armhf.deb";
      hash = "sha256-+OrSlK8pdZcAYgOF+POAvCkPlM8aF8MH5yqQmLbEiEY=";
    })
    (fetchurl {
      name = "libgbm1_22.3.6-1+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/m/mesa/libgbm1_22.3.6-1+deb12u1_armhf.deb";
      hash = "sha256-nX14zSZfeBSyg3VWjD0rNTnsab7gNKDu5BNlp/uEvok=";
    })
    (fetchurl {
      name = "libpulse0_16.1+dfsg1-2+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/p/pulseaudio/libpulse0_16.1+dfsg1-2+b1_armhf.deb";
      hash = "sha256-hCAeNSm9Ld9XlyYSJke0I8i5Fpi6Zx1jqoKI2QvxaQw=";
    })
    (fetchurl {
      name = "libsamplerate0_0.2.2-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsamplerate/libsamplerate0_0.2.2-3_armhf.deb";
      hash = "sha256-Qam4PM+PF9xu7pvChV/1fVSvxUIr8PDcdSL5GZZ1udg=";
    })
    (fetchurl {
      name = "libwayland-client0_1.21.0-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/w/wayland/libwayland-client0_1.21.0-1_armhf.deb";
      hash = "sha256-YfJtr/w4rEwMzAvbwOptst0lA+gB0NrP3FzgsS72uU4=";
    })
    (fetchurl {
      name = "libwayland-cursor0_1.21.0-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/w/wayland/libwayland-cursor0_1.21.0-1_armhf.deb";
      hash = "sha256-hP96TyxbCeXsq4yOzOHMA6/qJgTAT8U6euxBuIik4B8=";
    })
    (fetchurl {
      name = "libwayland-egl1_1.21.0-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/w/wayland/libwayland-egl1_1.21.0-1_armhf.deb";
      hash = "sha256-Gz7yxBLpajhiR3jrUgeSpIFFFtEj4obWsO1jbPDfou8=";
    })
    (fetchurl {
      name = "libx11-6_2_1.8.4-2+deb12u2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libx11/libx11-6_1.8.4-2+deb12u2_armhf.deb";
      hash = "sha256-23BsylWLetkZE0iDuyQvffvteITyd1OkU2F09jHdvFI=";
    })
    (fetchurl {
      name = "libxcursor1_1_1.2.1-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxcursor/libxcursor1_1.2.1-1_armhf.deb";
      hash = "sha256-JQiNXQH59Bo5oreBzZNfDSdrqOSwZhOpU61Nj0096OA=";
    })
    (fetchurl {
      name = "libxext6_2_1.3.4-1+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxext/libxext6_1.3.4-1+b1_armhf.deb";
      hash = "sha256-cg4cCeyhIioC9wzRHh1+BCFxYYvYet15c5Khr+3ZdD8=";
    })
    (fetchurl {
      name = "libxfixes3_1_6.0.0-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxfixes/libxfixes3_6.0.0-2_armhf.deb";
      hash = "sha256-d/qdW/o8FA+uGhXDQMYzZuUDqtcp52C3U2kHba16HvE=";
    })
    (fetchurl {
      name = "libxi6_2_1.8-1+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxi/libxi6_1.8-1+b1_armhf.deb";
      hash = "sha256-qB41Mu4opT6T8UaOi/tBNaY4VRXEOJNzRvkpTuABNcg=";
    })
    (fetchurl {
      name = "libxkbcommon0_1.5.0-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxkbcommon/libxkbcommon0_1.5.0-1_armhf.deb";
      hash = "sha256-LvUezP0i3GYLKPaNthKOFi56/M8ETbCkDJmrOkHaksY=";
    })
    (fetchurl {
      name = "libxrandr2_2_1.5.2-2+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxrandr/libxrandr2_1.5.2-2+b1_armhf.deb";
      hash = "sha256-F2TJbe4tPYNF1zPR441GxiseQ67G7D6FPHnnD3Zb9RM=";
    })
    (fetchurl {
      name = "libxss1_1_1.2.3-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxss/libxss1_1.2.3-1_armhf.deb";
      hash = "sha256-9SGZYrZHZ2kSwljH/qeLDSXZn7H4kAAAoFGgnBfDxrI=";
    })
    (fetchurl {
      name = "libjpeg62-turbo_1_2.1.5-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libj/libjpeg-turbo/libjpeg62-turbo_2.1.5-2_armhf.deb";
      hash = "sha256-lj2SbCGNSIqHP99oos0XgA/r2Rrt37e3MaxtsWyML0Y=";
    })
    (fetchurl {
      name = "libpng16-16_1.6.39-2+deb12u5_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libp/libpng1.6/libpng16-16_1.6.39-2+deb12u5_armhf.deb";
      hash = "sha256-4ueZSQhG1ZUzf5//FfLJzaTVV08jS54fil4Bl0Yuk+Q=";
    })
    (fetchurl {
      name = "libtiff6_4.5.0-6+deb12u4_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/t/tiff/libtiff6_4.5.0-6+deb12u4_armhf.deb";
      hash = "sha256-EbTmwhQ0mx3bU4KJVKna+g6AUIDwS7PmeoxhCupESWg=";
    })
    (fetchurl {
      name = "libwebp7_1.2.4-0.2+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libw/libwebp/libwebp7_1.2.4-0.2+deb12u1_armhf.deb";
      hash = "sha256-8VR956ivboRt5mYU0iQTDavt9gZa87NkY9bInKZ/JKI=";
    })
    (fetchurl {
      name = "libflac12_1.4.2+ds-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/f/flac/libflac12_1.4.2+ds-2_armhf.deb";
      hash = "sha256-TJTR3rC8E6D1GM83KgdlW80i8W4KJO8uxAyy1wyhYmM=";
    })
    (fetchurl {
      name = "libfluidsynth3_2.3.1-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/f/fluidsynth/libfluidsynth3_2.3.1-2_armhf.deb";
      hash = "sha256-1Y8RU+8Zm2nByfpA68ZzYN1LM/QZ1xs6z3Qfg6S/+AE=";
    })
    (fetchurl {
      name = "libmodplug1_1_0.8.9.0-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libm/libmodplug/libmodplug1_0.8.9.0-3_armhf.deb";
      hash = "sha256-lsOYN2QE43b2aA6YP8/xYFK19ByipF0s/bSyGXlnEY8=";
    })
    (fetchurl {
      name = "libmpg123-0_1.31.2-1+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/m/mpg123/libmpg123-0_1.31.2-1+deb12u1_armhf.deb";
      hash = "sha256-Kuvf593DI8t1mbHmwiKJyB4nweoDteZumNkcP71Lesk=";
    })
    (fetchurl {
      name = "libvorbisfile3_1.3.7-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libv/libvorbis/libvorbisfile3_1.3.7-1_armhf.deb";
      hash = "sha256-gT5H4p+LpRAmEasW+Wtabs3CoHMWPFXyB05T0qFji+E=";
    })
    (fetchurl {
      name = "libfreetype6_2.12.1+dfsg-5+deb12u4_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/f/freetype/libfreetype6_2.12.1+dfsg-5+deb12u4_armhf.deb";
      hash = "sha256-FPu78XJ5j3mhMGgf2eywyNELgassi89YRaWWzTIOPBk=";
    })
    (fetchurl {
      name = "libogg0_1.3.5-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libo/libogg/libogg0_1.3.5-3_armhf.deb";
      hash = "sha256-O+iCMYZx/Lfd3Y8FePFZJUjF/0manZ4K4ywgH+WWYWg=";
    })
    (fetchurl {
      name = "libopus0_1.3.1-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/o/opus/libopus0_1.3.1-3_armhf.deb";
      hash = "sha256-nezxiPtuAqx50YCh26tGOijHVaddZHGg4y3jHgqbQWA=";
    })
    (fetchurl {
      name = "libssl3_3.0.20-1~deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/o/openssl/libssl3_3.0.20-1~deb12u1_armhf.deb";
      hash = "sha256-l+wbX8HtQnNR5jZXtaFHAoaJ7n5TWgvlVSNLAcfMi/4=";
    })
    (fetchurl {
      name = "libglib2.0-0_2.74.6-2+deb12u9_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/glib2.0/libglib2.0-0_2.74.6-2+deb12u9_armhf.deb";
      hash = "sha256-C2h+/YlbSWNEW4SKCsuTE1j4X2NjZYJMMIaJsekgIjs=";
    })
    (fetchurl {
      name = "libgraphite2-3_1.3.14-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/graphite2/libgraphite2-3_1.3.14-1_armhf.deb";
      hash = "sha256-+pilg1qruPoW/5+ckbbq3lhOQMhh+R4XYbFuU5ZK35I=";
    })
    (fetchurl {
      name = "libasound2-data_1.2.8-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/a/alsa-lib/libasound2-data_1.2.8-1_all.deb";
      hash = "sha256-/geA0tNnSyl34Kyw1ItEitcroWQlZLfcU39V6DmYTC0=";
    })
    (fetchurl {
      name = "libdrm-common_2.4.114-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libd/libdrm/libdrm-common_2.4.114-1_all.deb";
      hash = "sha256-MvlmQTiziyJDg8aYZFfVrS7I79VZsaDOd0lAX3pFGq0=";
    })
    (fetchurl {
      name = "libexpat1_2.5.0-1+deb12u2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/e/expat/libexpat1_2.5.0-1+deb12u2_armhf.deb";
      hash = "sha256-4cv4sA40KVzZKGV0er+AmZIYtlEd3Gja/9aw5fn+DWM=";
    })
    (fetchurl {
      name = "libwayland-server0_1.21.0-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/w/wayland/libwayland-server0_1.21.0-1_armhf.deb";
      hash = "sha256-8/Uq7ok22Qu5A+VRU59rEpm/hDRHrzQtdWHEDL+fPAo=";
    })
    (fetchurl {
      name = "libasyncns0_0.8-6+b3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/liba/libasyncns/libasyncns0_0.8-6+b3_armhf.deb";
      hash = "sha256-sB4y0Dpr71o6OT8SrFbjm+ajCCbzFpgIzNV8stF727E=";
    })
    (fetchurl {
      name = "libdbus-1-3_1.14.10-1~deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/d/dbus/libdbus-1-3_1.14.10-1~deb12u1_armhf.deb";
      hash = "sha256-dY5InC+TfkodJyyAeel1BbsOdfTb1L+aq6ve/nEB6MQ=";
    })
    (fetchurl {
      name = "libsndfile1_1.2.0-1+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libsndfile/libsndfile1_1.2.0-1+deb12u1_armhf.deb";
      hash = "sha256-dte9aQvj+0qb36qB1RT0Bt6zCPnzVgsBaNpmxfAfo/8=";
    })
    (fetchurl {
      name = "libsystemd0_252.39-1~deb12u2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/s/systemd/libsystemd0_252.39-1~deb12u2_armhf.deb";
      hash = "sha256-/knZyqdsHryQIQk2w6qFrrbpuyg9QSi4JVGYhxF/200=";
    })
    (fetchurl {
      name = "libx11-xcb1_2_1.8.4-2+deb12u2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libx11/libx11-xcb1_1.8.4-2+deb12u2_armhf.deb";
      hash = "sha256-h2ODYkdgAHSWn63vYGJXwxllDrqBmYgxysizpd9MlwQ=";
    })
    (fetchurl {
      name = "libxcb1_1.15-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxcb/libxcb1_1.15-1_armhf.deb";
      hash = "sha256-cjVEGc+tOh5APpmK90c0E074HA0Ic+wOng0lPNutFVE=";
    })
    (fetchurl {
      name = "libffi8_3.4.4-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libf/libffi/libffi8_3.4.4-1_armhf.deb";
      hash = "sha256-xwm2ZmpvFmt6r5jJ6JqxcUPVsdM+a1ReWCtrXaMewr0=";
    })
    (fetchurl {
      name = "libx11-data_2_1.8.4-2+deb12u2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libx11/libx11-data_1.8.4-2+deb12u2_all.deb";
      hash = "sha256-mHqEiuscNY5BhjaIcbBSbxC7FMa1MhSrO/i2mruDAZE=";
    })
    (fetchurl {
      name = "libxrender1_1_0.9.10-1.1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxrender/libxrender1_0.9.10-1.1_armhf.deb";
      hash = "sha256-3vwQjONkgaNb7PMQnU8wk9WqB2Oy58iJPi+/zo3/dgY=";
    })
    (fetchurl {
      name = "xkb-data_2.35.1-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/x/xkeyboard-config/xkb-data_2.35.1-1_all.deb";
      hash = "sha256-KKecYbeF9APak69Yw5rtE8AiAyk14+VDYsZwcWnP6YI=";
    })
    (fetchurl {
      name = "x11-common_1_7.7+23_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/x/xorg/x11-common_7.7+23_all.deb";
      hash = "sha256-/JfC9Eleszp3UBx5YJKMDSAB5cSyqkOPFxPiCCwjus0=";
    })
    (fetchurl {
      name = "libdeflate0_1.14-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libd/libdeflate/libdeflate0_1.14-1_armhf.deb";
      hash = "sha256-jeakGVkVA9Y5iNyZhfU+b+Fbis2rOLmN+FnwgdX0yuI=";
    })
    (fetchurl {
      name = "libjbig0_2.1-6.1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/j/jbigkit/libjbig0_2.1-6.1_armhf.deb";
      hash = "sha256-PElia9XquYlvqCtLTUyhYn1tcIlASLOpZQ0u5LkvU9A=";
    })
    (fetchurl {
      name = "liblerc4_4.0.0+ds-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/l/lerc/liblerc4_4.0.0+ds-2_armhf.deb";
      hash = "sha256-p7qRHjj7CNWhpkh9V4gKutnln9/ktXAbphmj98iryrY=";
    })
    (fetchurl {
      name = "liblzma5_5.4.1-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/x/xz-utils/liblzma5_5.4.1-1_armhf.deb";
      hash = "sha256-GYRYjkzT974U7yov6WsrHMYTcmpfbLWiL5AN4p8+1kU=";
    })
    (fetchurl {
      name = "libzstd1_1.5.4+dfsg2-5_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libz/libzstd/libzstd1_1.5.4+dfsg2-5_armhf.deb";
      hash = "sha256-ospIvEO7UdPLxr6weu/T/iUoWYaKTMucHtv8lCeG5LE=";
    })
    (fetchurl {
      name = "libgomp1_12.2.0-14+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/g/gcc-12/libgomp1_12.2.0-14+deb12u1_armhf.deb";
      hash = "sha256-MadYoTneaDM0heA2ecxHIdSlomUrZKlAKwsfQB84zoU=";
    })
    (fetchurl {
      name = "libinstpatch-1.0-2_1.1.6-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libi/libinstpatch/libinstpatch-1.0-2_1.1.6-1_armhf.deb";
      hash = "sha256-GGGx7L3gGvJPtkPngiIopZ+KBATx5jJFGjTT1FSUdoA=";
    })
    (fetchurl {
      name = "libjack-jackd2-0_1.9.21~dfsg-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/j/jackd2/libjack-jackd2-0_1.9.21~dfsg-3_armhf.deb";
      hash = "sha256-da+jxzKYy4V0lIzraMJnZgHxsZYOqmDIN5nTFBQAxP0=";
    })
    (fetchurl {
      name = "libreadline8_8.2-1.3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/r/readline/libreadline8_8.2-1.3_armhf.deb";
      hash = "sha256-pOtKSTEBLllwgDlqI+0Q3wGeJoaL9m2WlOq1XJj2pcI=";
    })
    (fetchurl {
      name = "timgm6mb-soundfont_1.3-5_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3-5_all.deb";
      hash = "sha256-A0q9+yltk1NDNRPa1dvcq0ZCXuYAj8Av5wObRude3FQ=";
    })
    (fetchurl {
      name = "libvorbis0a_1.3.7-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libv/libvorbis/libvorbis0a_1.3.7-1_armhf.deb";
      hash = "sha256-dFMOOIngTKsIdRqtH1P1EPnbYwd7syvK/2dIvCPTDUU=";
    })
    (fetchurl {
      name = "libbrotli1_1.0.9-2+b6_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/b/brotli/libbrotli1_1.0.9-2+b6_armhf.deb";
      hash = "sha256-zV9xt/dNVngeGeAYZDXEbh0KRUHjJh8rwVr3UeMU0MI=";
    })
    (fetchurl {
      name = "libmount1_2.38.1-5+deb12u3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/u/util-linux/libmount1_2.38.1-5+deb12u3_armhf.deb";
      hash = "sha256-nHd1VYaHoHb5EKAwoLHsv7OErKEtZvGTQ0znK6v1wlA=";
    })
    (fetchurl {
      name = "libpcre2-8-0_10.42-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/p/pcre2/libpcre2-8-0_10.42-1_armhf.deb";
      hash = "sha256-caKpHPjCJmXFluBCbEXuUIFUBeIK7t12J+3e7iC7ekI=";
    })
    (fetchurl {
      name = "libselinux1_3.4-1+b6_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libs/libselinux/libselinux1_3.4-1+b6_armhf.deb";
      hash = "sha256-ylGqrFEb2DKR0tcBzQixKovcTGRtTW9+7YacDcGI69g=";
    })
    (fetchurl {
      name = "libmp3lame0_3.100-6_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/l/lame/libmp3lame0_3.100-6_armhf.deb";
      hash = "sha256-A/QaFOwwCobG+EScPWOn1DunK3vpXCiEbcOuQLE9sCI=";
    })
    (fetchurl {
      name = "libvorbisenc2_1.3.7-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libv/libvorbis/libvorbisenc2_1.3.7-1_armhf.deb";
      hash = "sha256-v2bXXnneyTjdvjDe9GTd7K49VsgxDq05WWBNeaw/MvQ=";
    })
    (fetchurl {
      name = "libcap2_1_2.66-4+deb12u3+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libc/libcap2/libcap2_2.66-4+deb12u3+b1_armhf.deb";
      hash = "sha256-JsWZCV9b2sIoOF6pn/gjRKsTlcgoyyTn5V2oI/PKLow=";
    })
    (fetchurl {
      name = "libgcrypt20_1.10.1-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libg/libgcrypt20/libgcrypt20_1.10.1-3_armhf.deb";
      hash = "sha256-hy1vkYgHeqV19t/wKODfQFQb6x1rgibD2DswGeXuA4A=";
    })
    (fetchurl {
      name = "liblz4-1_1.9.4-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/l/lz4/liblz4-1_1.9.4-1_armhf.deb";
      hash = "sha256-pkaBmmVEBMOMIZ9d9FBLocIUMm2spqAM5K2bsHNEf70=";
    })
    (fetchurl {
      name = "libxau6_1_1.0.9-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxau/libxau6_1.0.9-1_armhf.deb";
      hash = "sha256-X50IOV723RZ1QczFAhsZv+C5/ahgrJVW/aya7lJSBg4=";
    })
    (fetchurl {
      name = "libxdmcp6_1_1.1.2-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libx/libxdmcp/libxdmcp6_1.1.2-3_armhf.deb";
      hash = "sha256-rUeFjtxkafgoihMjjuU8EvV0Vja/DcEvznmNsnGGAr0=";
    })
    (fetchurl {
      name = "lsb-base_11.6_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/l/lsb/lsb-base_11.6_all.deb";
      hash = "sha256-+L7dFnKA52Y23zobwCPNKQbUWJFsGvTB15EsW5cfxkI=";
    })
    (fetchurl {
      name = "libdb5.3_5.3.28+dfsg2-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/d/db5.3/libdb5.3_5.3.28+dfsg2-1_armhf.deb";
      hash = "sha256-zTgWt2VGwuOd51hj6WFdQkTcFz4VdnKilw4i7mBglL4=";
    })
    (fetchurl {
      name = "readline-common_8.2-1.3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/r/readline/readline-common_8.2-1.3_all.deb";
      hash = "sha256-aTF1I/5WQpqjYVRUFq0znROMFQDlpgSFaoDdkHS041w=";
    })
    (fetchurl {
      name = "libtinfo6_6.4-4_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/n/ncurses/libtinfo6_6.4-4_armhf.deb";
      hash = "sha256-WZDQEMwfltFmwfsbzgaCLxRmXcnYPlKLFm4SmYKwnXs=";
    })
    (fetchurl {
      name = "libblkid1_2.38.1-5+deb12u3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/u/util-linux/libblkid1_2.38.1-5+deb12u3_armhf.deb";
      hash = "sha256-8jmpMvkbmGRhaI/kYnXLlREwomhTdbPDMrd50B+HRn0=";
    })
    (fetchurl {
      name = "libgpg-error0_1.46-1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libg/libgpg-error/libgpg-error0_1.46-1_armhf.deb";
      hash = "sha256-yqbuL50eXXzSGiv3Er6Mg2dmz6T8doU/7KfE5p7Jt6w=";
    })
    (fetchurl {
      name = "libbsd0_0.11.7-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libb/libbsd/libbsd0_0.11.7-2_armhf.deb";
      hash = "sha256-kwgNVKs7uimSshPzcfNDbXBFM8OSoeoeNmmvqDX8Yao=";
    })
    (fetchurl {
      name = "sysvinit-utils_3.06-4_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/s/sysvinit/sysvinit-utils_3.06-4_armhf.deb";
      hash = "sha256-7cG9kN44o69lj6H7Pc1cZSdHLzu3vPFmEE4Z7us06ZE=";
    })
    (fetchurl {
      name = "dpkg_1.21.23_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/d/dpkg/dpkg_1.21.23_armhf.deb";
      hash = "sha256-U8ZrpuZF5aS33wv9nWVZ2JBfHUGQ7okfxTCUC0p+sDg=";
    })
    (fetchurl {
      name = "libmd0_1.0.4-2_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/libm/libmd/libmd0_1.0.4-2_armhf.deb";
      hash = "sha256-B2lkiNFdwJ2mVDv/cThGtpKRJQtWU9d/Gdjb0KejIBI=";
    })
    (fetchurl {
      name = "libbz2-1.0_1.0.8-5+b1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/b/bzip2/libbz2-1.0_1.0.8-5+b1_armhf.deb";
      hash = "sha256-ru1ecg60G632q4sOcZAH/kRsE86TqNdco30c36r39bQ=";
    })
    (fetchurl {
      name = "tar_1.34+dfsg-1.2+deb12u1_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/t/tar/tar_1.34+dfsg-1.2+deb12u1_armhf.deb";
      hash = "sha256-DBdfUcZm7tsMqswCEykzB3rTA3iIlrjXgnTnQipf7/k=";
    })
    (fetchurl {
      name = "libacl1_2.3.1-3_armhf.deb";
      url = "https://deb.debian.org/debian/pool/main/a/acl/libacl1_2.3.1-3_armhf.deb";
      hash = "sha256-glqVW8AP4tDfKkqR0GSV3+8CsxIRgNHzlOxzHeHyZuc=";
    })
  ];
  libraryPath = lib.concatStringsSep ":" [
    "$out/share/korri/portmaster-armhf-runtime/rootfs/lib/arm-linux-gnueabihf"
    "$out/share/korri/portmaster-armhf-runtime/rootfs/usr/lib/arm-linux-gnueabihf"
    "$out/share/korri/portmaster-armhf-runtime/rootfs/lib"
    "$out/share/korri/portmaster-armhf-runtime/rootfs/usr/lib"
  ];
in
stdenvNoCC.mkDerivation {
  pname = "portmaster-armhf-runtime";
  version = "bookworm-sdl2-2026-06-18";

  srcs = debs;
  dontUnpack = true;
  dontFixup = true;
  nativeBuildInputs = [ dpkg ];

  installPhase = ''
    runHook preInstall

    rootfs="$out/share/korri/portmaster-armhf-runtime/rootfs"
    install -d "$rootfs" "$out/nix-support"
    for deb in $srcs; do
      dpkg-deb -x "$deb" "$rootfs"
    done

    qemu_arm="${qemu}/bin/qemu-arm"
    test -x "$qemu_arm"

    printf '%s
' "$rootfs" > "$out/nix-support/armhf-rootfs"
    printf '%s
' "${libraryPath}" > "$out/nix-support/library-path"
    printf '%s
' "$qemu_arm" > "$out/nix-support/qemu-arm"
    cat > "$out/nix-support/env" <<EOF
export KORRI_PORTMASTER_ARMHF_ROOTFS="$rootfs"
export KORRI_PORTMASTER_ARMHF_LIBRARY_PATH="${libraryPath}"
export KORRI_PORTMASTER_ARMHF_QEMU_ARM="$qemu_arm"
EOF

    runHook postInstall
  '';

  passthru = {
    armhfRootfs = "$out/share/korri/portmaster-armhf-runtime/rootfs";
    inherit libraryPath;
  };

  meta = {
    description = "Minimal Debian armhf SDL runtime libraries for PortMaster qemu-arm launches";
    homepage = "https://www.debian.org/";
    license = lib.licenses.free;
    platforms = lib.platforms.linux;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
