# kitcaf ingest

`kitcaf-ingest` 是一个将 Markdown 文章写入 Notion 的轻量 Cloudflare Worker。

```text
ChatGPT -> Article JSON -> POST /v1/ingest -> Notion -> existing blog sync
```

ChatGPT 负责生成最终文章和 Markdown；Worker 只负责鉴权、协议校验以及 Notion metadata mapping。Worker 不解析 Markdown、不转换 blocks、不触发 GitHub Actions。

Notion 官方已经支持在 `POST /v1/pages` 中直接传入 [`markdown` 字段](https://developers.notion.com/guides/data-apis/working-with-markdown-content)。Worker 将请求中的 `content` 原样传给该字段。

## 文章写入协议

```json
{
  "type": "article",
  "title": "Talking About My Weekend",
  "category": "English Learning",
  "tags": ["English", "Speaking"],
  "content": "# Talking About My Weekend\n\nMarkdown content..."
}
```

字段职责：

- `title` -> Notion `Title`。
- `category` -> Notion `Category`。
- `tags` -> Notion `Tag`。
- `content` -> Notion `markdown`，不修改内容。
- Worker 接收请求的时间 -> Notion `日期`。
- Worker 固定写入 Notion `Status = Published`。

`Slug` 不由 Worker 写入，继续由现有 `notion-sync` 根据标题和 Notion 页面 ID 生成。

## Notion 数据源约定

目标数据源需要包含以下字段：

- `Title`：title。
- `Status`：select，并包含 `Published`。
- `Category`：select。
- `Tag`：multi-select。
- `日期`：date。

## 本地开发

复制本地变量模板：

```powershell
Copy-Item apps/ingest/.dev.vars.example apps/ingest/.dev.vars
```

填写：

```text
INGEST_TOKEN=自定义的同步口令
NOTION_TOKEN=Notion integration token
NOTION_DATA_SOURCE_ID=文章数据库对应的 data source id
```

确保目标 Notion 数据源已经连接到该 integration，并授予 Insert content 和 Insert property 权限。

```bash
pnpm dev:ingest
pnpm test:ingest
pnpm --filter @blog/ingest type-check
```

## 部署

首次部署前写入 Cloudflare Secrets：

```bash 
pnpm --filter @blog/ingest exec wrangler secret put INGEST_TOKEN
pnpm --filter @blog/ingest exec wrangler secret put NOTION_TOKEN
pnpm --filter @blog/ingest exec wrangler secret put NOTION_DATA_SOURCE_ID
```
or 
```直接读取配置的
pnpm exec wrangler secret bulk .dev.vars
```

部署到 Cloudflare 提供的 `workers.dev` 地址：

```bash
pnpm run deploy:ingest
```

当前 Cloudflare Workers 子域为 `kitcaf.workers.dev`，部署后的服务地址为 `https://kitcaf-ingest.kitcaf.workers.dev`。

## HTTP 请求

```http
POST https://kitcaf-ingest.kitcaf.workers.dev/v1/ingest
Content-Type: application/json
X-Kitcaf-Token: <INGEST_TOKEN>
```

成功响应为 `201`：

```json
{
  "success": true,
  "pageId": "notion-page-id",
  "url": "https://www.notion.so/notion-page-id"
}
```

只有收到 `success: true` 时，调用方才应报告写入成功。
