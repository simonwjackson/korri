#!/usr/bin/env bash
# Mint a locally-trusted TLS cert so the design lab can be served over HTTPS to a
# phone. This gives the phone a REAL secure context, so the PWA installs as a
# stable fullscreen app with NO chrome://flags. Uses mkcert from nixpkgs.
#
# Pass every hostname/IP the phone will use to reach this machine, e.g.
#   ./make-cert.sh zao 192.168.1.50
#
# Then install the printed rootCA.pem on the phone once (Android: Settings >
# Security > Encryption & credentials > Install a certificate > CA certificate)
# and run `just dev-lab-device` — HTTPS is auto-detected from pwa/.certs.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
certs="$here/.certs"
mkdir -p "$certs"

mk() { nix run nixpkgs#mkcert -- "$@"; }

# Create + install the local CA into this machine's trust store (idempotent).
mk -install

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  echo "No hostnames given. Re-run with your LAN name/IP, e.g.:"
  echo "  $0 zao 192.168.1.50"
  exit 1
fi

# Always include loopback so desktop testing over HTTPS works too.
mk -cert-file "$certs/dev-cert.pem" -key-file "$certs/dev-key.pem" \
  "${names[@]}" localhost 127.0.0.1

caroot="$(mk -CAROOT)"
echo
echo "Wrote cert + key to:"
echo "  $certs/dev-cert.pem"
echo "  $certs/dev-key.pem"
echo
echo "Install THIS root CA on the phone (one time), then browse https://<name>:3130 :"
echo "  $caroot/rootCA.pem"
