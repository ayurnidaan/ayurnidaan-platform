#!/bin/bash
set -euo pipefail
test -f /opt/vedai/bootstrap-ready
test -f /tmp/vedai-release.tar.gz
test -f /tmp/vedai.env
install -d -o vedai -g vedai /opt/vedai/app
tar --extract --gzip --file /tmp/vedai-release.tar.gz --directory /opt/vedai/app --no-same-owner
install -m 600 -o root -g root /tmp/vedai.env /etc/vedai.env
rm /tmp/vedai.env
python3 -m venv /opt/vedai/venv
/opt/vedai/venv/bin/pip install --disable-pip-version-check '/opt/vedai/app[rag]'
chown -R vedai:vedai /opt/vedai/app
install -m 644 /opt/vedai/app/deploy/vedai.service /etc/systemd/system/vedai.service
install -m 644 /opt/vedai/app/deploy/vedai-tunnel.service /etc/systemd/system/vedai-tunnel.service
systemctl daemon-reload
systemctl enable --now vedai.service
# Starting the tunnel is a separate step after checking origin health.
