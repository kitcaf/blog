# Self-hosted deployment

The self-hosted flow keeps `/srv/blog/current` as the only web root and only switches it after `pnpm build:site` succeeds.

```text
/srv/blog
  source/
  releases/
  current -> releases/20260427-020000
  logs/
```

Recommended setup:

```bash
git clone <repo-url> /srv/blog/source
cd /srv/blog/source
cp .env.example .env
chmod +x scripts/deploy-self-hosted.sh
```

Configure secrets in `/srv/blog/source/.env` or service-level environment variables:

```env
NOTION_TOKEN=
NOTION_DATABASE_ID=
GITHUB_TOKEN=
GH_STATS_TOKEN=
IMAGE_ASSET_PROVIDER=cloudflare-r2
R2_ACCOUNT_ID=
R2_BUCKET_NAME=blog-images
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
R2_OBJECT_PREFIX=notion-images
R2_CACHE_MANIFEST_KEY=notion-images/cache/notion-image-cache.json
BLOG_DATA_CONFIG_PATH=
SITE_BASE_PATH=/
```

`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are build-time only. They are read by `pnpm sync:notion` on the server and must not use a `VITE_` prefix.

Run once manually:

```bash
BLOG_HEALTHCHECK_URL=https://example.com/ \
BLOG_RELOAD_COMMAND="systemctl reload nginx" \
/srv/blog/source/scripts/deploy-self-hosted.sh
```

Then choose one scheduler:

```bash
crontab deploy/self-hosted/crontab.example
```

or:

```bash
sudo cp deploy/self-hosted/blog-deploy.service /etc/systemd/system/
sudo cp deploy/self-hosted/blog-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blog-deploy.timer
```

Use `deploy/self-hosted/nginx.conf` or `deploy/self-hosted/Caddyfile` as the static server template.
