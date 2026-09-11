#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv ca-certificates curl
id vedai >/dev/null 2>&1 || useradd --system --home-dir /opt/vedai --shell /usr/sbin/nologin vedai
install -d -o vedai -g vedai /opt/vedai
curl --fail --location --retry 3 --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/download/2026.9.1/cloudflared-linux-amd64.deb
echo '3be76adc4185d36a0bfb4c2dd8663292f0ed363797f2180333b513b43c81d419  /tmp/cloudflared.deb' | sha256sum --check
dpkg -i /tmp/cloudflared.deb
touch /opt/vedai/bootstrap-ready
