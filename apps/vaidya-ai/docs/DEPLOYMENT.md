# GCP hosting and Cloudflare

VedAI runs on a dedicated Compute Engine VM in project `tribe-v2-host`:

- VM: `vedai-web`, zone `us-central1-a`, machine `e2-small`, 20 GB standard persistent disk.
- Network: `vedai-net`, subnet `vedai-us-central1` (`10.67.0.0/24`).
- The only inbound firewall rule permits SSH through Google IAP. The VM has no attached GCP service account.
- `vedai.service` runs the application as an unprivileged user on `127.0.0.1:8765`.
- `vedai-tunnel.service` connects outbound to Cloudflare and exposes the HTTPS demo address. The app and connector start at boot.
- The deployed OpenRouter model is `openai/gpt-5.6-sol`, reasoning `medium`.

The VM, disk, outbound connectivity, and OpenRouter requests incur ongoing charges while in use. This setup does not use a GPU.

## Access and address

Current demo: [Open VedAI](https://matt-dining-outcomes-settlement.trycloudflare.com). [Manage the GCP VM](https://console.cloud.google.com/compute/instancesDetail/zones/us-central1-a/instances/vedai-web?project=tribe-v2-host).

The demo is public: anyone with the link can open it and run queries without logging in. The current URL and access mode are in the local, Git-ignored `data/runtime/deployment-access.json`. The hosted environment has no `VEDAI_ACCESS_PASSWORD` or `VEDAI_REQUIRE_AUTH` setting. `/etc/vedai.env` on the VM is root-owned with mode `0600`; the API key is never included in the release archive or browser responses.

The initial address is a Cloudflare Quick Tunnel. It is a temporary demonstration address and can change when the connector restarts; it is not a permanent domain or an uptime guarantee. The connector remains running when only the application restarts. A permanent hostname requires a Cloudflare account/domain and a named tunnel. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Long readings

The browser submits `POST /ask` with `Prefer: respond-async`. The server reserves its single query slot, returns `202` with an opaque job ID, and runs the same retrieval/answer/translation pipeline in a background thread. The browser polls `GET /jobs/{id}` using short requests. This avoids holding a Cloudflare request open throughout model generation.

Completed results are held in memory for up to 15 minutes, capped at 20 readings. Jobs are lost on application restart. “Stop waiting” stops browser polling; it does not cancel a model request already in progress. Clients without the Prefer header retain the synchronous `/ask` API. The single-query gate is shared by both modes.

## Release and operations

`python deploy/package.py` creates `data/runtime/vedai-release.tar.gz` and a SHA256 manifest. The archive contains code, the full pinned SARIT ZIP, source metadata, processed source/chunk files, and indexes. It excludes the local `.env`, runtime logs, saved user readings, and deployment credentials. Vocabulary-expanded retrieval remains active; the embedding index is included, but the hosted app does not run Ollama or use the experimental vector modes.

Bootstrap uses Debian 12 and cloudflared 2026.9.1 with a verified SHA256. The application dependencies follow the constraints in `pyproject.toml`.

Connect with:

```powershell
gcloud compute ssh vedai-web --project=tribe-v2-host --zone=us-central1-a --tunnel-through-iap
```

On the VM:

```bash
sudo systemctl status vedai vedai-tunnel
sudo journalctl -u vedai -n 40 --no-pager
sudo journalctl -u vedai-tunnel -n 40 --no-pager
sudo systemctl restart vedai
```

To deploy an updated package, copy the archive, a private environment file, and `deploy/install.sh` into `/tmp`, verify the release SHA256, then run `sudo bash /tmp/install.sh` followed by `sudo systemctl restart vedai`. Do not restart the connector unnecessarily if keeping the current temporary address matters.

For code changes that reuse the existing corpus, `python deploy/package.py --code-only` creates `data/runtime/vedai-code.tar.gz` and `code-manifest.json`. Copy that archive and `deploy/update-code.sh` to `/tmp`, then run `sudo bash /tmp/update-code.sh SHA256`. This checks the archive, runs available unit tests in a staging directory, saves the previous runtime code, installs the update and restarts only the app. It preserves `/etc/vedai.env`, corpus/index files and the running tunnel. The clinical update exposes `answer_contract: clinical-v1` in `/health`.

`python tests/live_hosted.py --case-id deep-06` checks a Hindi clinical reading through the public URL, including priority placement, findings, citations, translations and contained scrolling. Its separate report is `reports/clinical-hosted-checks.json`.

Browser verification runs without credentials for the public demo:

```powershell
python tests/browser_smoke.py --url HTTPS_URL --output data/runtime/browser-hosted
```

`python tests/live_hosted.py` performs one explicitly paid end-to-end reading through Cloudflare. The verified deployment report is [hosted checks](../reports/hosted-checks.json). It checks background completion, the configured model, source text/locators, translation display, and viewport containment.

To stop compute billing when the demo is no longer needed:

```powershell
gcloud compute instances stop vedai-web --project=tribe-v2-host --zone=us-central1-a
```

Persistent disk storage remains billable while the VM is stopped. Starting it again starts both services and may produce a new Cloudflare demo address.
