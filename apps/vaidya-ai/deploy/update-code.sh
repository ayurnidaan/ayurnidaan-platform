#!/bin/bash
# Reuse the existing corpus and private environment. Keep the Quick Tunnel alive.
set -euo pipefail
checksum="${1:?Provide the code archive SHA256}"
[[ "$checksum" =~ ^[a-f0-9]{64}$ ]]
printf '%s  /tmp/vedai-code.tar.gz\n' "$checksum" | sha256sum --check --status
release="/opt/vedai/releases/$checksum"
install -d "$release"
tar --extract --gzip --file /tmp/vedai-code.tar.gz --directory "$release" --no-same-owner
cd "$release"
/opt/vedai/venv/bin/python -m unittest discover -s tests -q
# Keep an independent copy of the previous runtime code for rollback.
tar --create --gzip --file "$release/previous-code.tar.gz" --directory /opt/vedai/app vedai pyproject.toml
tar --extract --gzip --file /tmp/vedai-code.tar.gz --directory /opt/vedai/app --no-same-owner
chown -R vedai:vedai /opt/vedai/app/vedai
systemctl restart vedai.service
for attempt in {1..20}; do
    if curl --fail --silent http://127.0.0.1:8765/health; then
        exit 0
    fi
    sleep 1
done
exit 1
