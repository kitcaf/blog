# Notion sync

This script compiles Published Notion pages into the local SSG article JSON consumed by the frontend.

## Usage

```bash
pnpm sync:notion
```

Required variables live in `frontend/.env`:

```bash
NOTION_TOKEN=
NOTION_DATABASE_ID=
```

`NOTION_DATABASE_ID` can be either the raw Notion database id or a full Notion database URL.

## Notion properties

The default database fields are:

- `Title`: required title property.
- `Status`: required status or select property. Only `Published` pages are synced.
- `Category`: optional select/status/rich text property. Defaults to `General`.
- `Tags`: optional multi-select property. Defaults to an empty list.
- `PublishedAt`: optional date property. Defaults to the Notion page creation time.
- `Slug`: optional rich text/formula/select value. Empty values are generated from the title and page id.
- `Description`: optional rich text/formula/select value. Empty values are generated from the page body text.

If your Notion database uses different property names, override them in `frontend/.env`; see `frontend/.env.example`.

## Supported blocks

The converter currently renders paragraph, heading, list, quote, code, divider, and external image blocks.
Unsupported blocks are simplified with a console warning instead of stopping the whole sync.

Notion-hosted image file URLs are skipped because they expire. Use stable external image URLs until the image migration phase is implemented.
