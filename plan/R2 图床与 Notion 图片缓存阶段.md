---
name: r2-notion-image-cache-stage
description: 为 Notion 同步链路增加 Cloudflare R2 图床转存、external 图片保留、Notion-hosted 图片缓存与 GitHub Actions 参数注入方案
---

# Plan

本阶段目标是在现有 Notion 文章同步、SSG 构建和两套部署方案之上，补齐图片稳定化能力。当前 Notion 页面中的图片有两种来源：一种是 external 图片，本身已经是外部稳定 URL；另一种是 Notion-hosted file，API 返回的是带时效的临时链接，不能直接写入静态博客产物。

因此本阶段要实现的核心链路是：

```text
external 图片
  -> 原样保留

Notion-hosted 图片
  -> 构建期下载临时 URL
  -> 上传到 Cloudflare R2
  -> 生成稳定 public URL
  -> 替换文章 markdown/html/json 中的图片链接
  -> 使用缓存避免重复上传
```

## Requirements

- external 图片必须直接保留原始 URL，不上传到 R2。
- Notion-hosted 图片不能把 Notion 临时 URL 写入最终 `data/posts.json` 或 `frontend/dist`。
- Notion-hosted 图片必须在构建期上传到 R2，并替换成 `R2_PUBLIC_BASE_URL` 下的稳定 URL。
- 图片处理必须发生在 `pnpm sync:notion` 阶段，浏览器运行时不能请求 Notion API。
- R2 上传凭证只能存在于根 `.env`、服务器环境变量或 GitHub Secrets，不能使用 `VITE_` 前缀。
- GitHub Actions 部署时，R2 参数需要通过 workflow `env` 注入到 Node 构建脚本。
- GitHub Pages 运行时不能依赖 Secrets；最终静态产物里只能出现公开图片 URL。
- 需要支持缓存，避免每次构建都重复上传同一张 Notion-hosted 图片。
- 缓存不能依赖 Notion 临时 URL，因为临时 URL 会变化并过期。
- 单张 Notion-hosted 图片下载、上传或转化失败时，不终止整次同步；该图片输出为空字符串，并记录足够排查的 warn 日志。

## Scope

- In: R2 配置读取、S3 兼容上传客户端、Notion 图片来源识别、external 图片保留、Notion-hosted 图片下载、Content-Type 识别、R2 object key 生成、R2 manifest 缓存读取与写回、图片 URL 替换、GitHub Actions env 注入、自建服务器 `.env` 注入、基础验证和日志。
- Out: 图片压缩、WebP/AVIF 转码、图片裁剪、水印、后台直传、浏览器端上传、图片管理后台、批量清理 R2 历史对象、私有签名访问、多区域对象存储。

## Current State

- `packages/notion-sync` 已经能分页拉取 Notion published pages。
- `packages/notion-sync` 已经能分页拉取 block children。
- Notion block 渲染链路已经能将文章内容写入 `data/posts.json`。
- `pnpm build:site` 已经作为统一构建入口，GitHub Actions 和自建服务器都应复用它。
- R2 bucket 已经手动创建并验证 public development URL 可以访问图片。
- 根 `.env` 已经准备 R2 所需参数。

## R2 Configuration

本地和自建服务器使用根 `.env`：

```env
R2_ACCOUNT_ID=
R2_BUCKET_NAME=blog-images
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
R2_OBJECT_PREFIX=notion-images
R2_CACHE_MANIFEST_KEY=notion-images/cache/notion-image-cache.json
```

变量含义：

- `R2_ACCOUNT_ID`：Cloudflare account id。
- `R2_BUCKET_NAME`：图片 bucket 名，例如 `blog-images`。
- `R2_ACCESS_KEY_ID`：S3 API access key，只给服务端构建脚本使用。
- `R2_SECRET_ACCESS_KEY`：S3 API secret key，只给服务端构建脚本使用。
- `R2_ENDPOINT`：S3 API endpoint，用于上传图片、读取和写回 manifest 缓存。
- `R2_PUBLIC_BASE_URL`：图片最终公开访问域名，目前可以是 `https://pub-xxxx.r2.dev`。
- `R2_OBJECT_PREFIX`：R2 内部目录前缀，例如 `notion-images`。
- `R2_CACHE_MANIFEST_KEY`：R2 中保存图片缓存 manifest 的 object key。

原则：

- `R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY` 是敏感信息。
- `R2_PUBLIC_BASE_URL` 是公开信息，可以出现在最终 HTML/JSON 中。
- 所有 R2 变量都不允许使用 `VITE_` 前缀。

## GitHub Actions Configuration

GitHub Actions 中不要依赖 `.env` 文件。构建 job 需要把 R2 参数通过 `env` 注入给 `pnpm build:site`。

建议 GitHub Secrets：

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

建议 GitHub Variables，或为了省事全部放 Secrets：

```text
R2_ACCOUNT_ID
R2_BUCKET_NAME
R2_ENDPOINT
R2_PUBLIC_BASE_URL
R2_OBJECT_PREFIX
R2_CACHE_MANIFEST_KEY
```

workflow build job 的 env 应补充：

```yaml
env:
  NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
  NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
  GITHUB_TOKEN: ${{ secrets.GH_STATS_TOKEN || github.token }}
  R2_ACCOUNT_ID: ${{ vars.R2_ACCOUNT_ID }}
  R2_BUCKET_NAME: ${{ vars.R2_BUCKET_NAME }}
  R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
  R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
  R2_ENDPOINT: ${{ vars.R2_ENDPOINT }}
  R2_PUBLIC_BASE_URL: ${{ vars.R2_PUBLIC_BASE_URL }}
  R2_OBJECT_PREFIX: ${{ vars.R2_OBJECT_PREFIX }}
  R2_CACHE_MANIFEST_KEY: ${{ vars.R2_CACHE_MANIFEST_KEY }}
```

如果决定全部放 Secrets，则对应改成：

```yaml
env:
  R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
  R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
  R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
  R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
  R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
  R2_PUBLIC_BASE_URL: ${{ secrets.R2_PUBLIC_BASE_URL }}
  R2_OBJECT_PREFIX: ${{ secrets.R2_OBJECT_PREFIX }}
  R2_CACHE_MANIFEST_KEY: ${{ secrets.R2_CACHE_MANIFEST_KEY }}
```

注意：

- GitHub Pages 只是托管 `frontend/dist`，不会在运行时读取 Secrets。
- Secrets 只在 GitHub Actions 构建阶段进入 Node 进程。
- 最终产物里应该只包含 `R2_PUBLIC_BASE_URL` 开头的公开图片 URL。

## Image Source Rules

Notion image block 通常有两种形态：

```text
image.type = "external"
image.external.url = "https://..."
```

处理规则：

```text
直接返回 external.url
不下载
不上传
不写入缓存
```

```text
image.type = "file"
image.file.url = "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/..."
image.file.expiry_time = "..."
```

处理规则：

```text
下载 image.file.url
上传到 R2
返回 R2 public URL
写入 R2 manifest 缓存
```

后续如果处理 page cover，也遵循同样规则：

```text
cover.external -> 原样保留
cover.file -> 上传 R2 后替换
```

## Cache Strategy

缓存不能使用 Notion 临时 URL 作为 key，因为临时 URL 每次可能变化，并且会过期。

缓存只保存在 R2 的 manifest JSON 中，仓库和工作区不保留 cache JSON。GitHub Actions、自建服务器和本地同步都以 R2 manifest 作为共享缓存来源。

```text
构建开始 -> GetObject 下载 R2 manifest
同步过程 -> 在内存中查询和更新 manifest
构建结束 -> PutObject 写回 R2 manifest
```

manifest 默认路径：

```text
notion-images/cache/notion-image-cache.json
```

### Source Fingerprint

Notion-hosted 图片的缓存 key 建议由稳定信息组成：

```text
pageId
blockId
blockType
pageLastEditedTime 或 blockLastEditedTime
```

生成示例：

```text
notion:file:<pageId>:<blockId>:<lastEditedTime>
```

如果 Notion 页面未变，fingerprint 不变。  
如果用户替换图片或编辑页面，`lastEditedTime` 变化，fingerprint 也变化。

### Manifest Key

R2 manifest 是一个普通 JSON object，建议使用 `R2_CACHE_MANIFEST_KEY` 配置：

```text
notion-images/cache/notion-image-cache.json
```

如果 manifest 不存在、读取失败或 JSON 解析失败，本次同步使用空缓存继续；后续新增成功转存的图片会重新写回 manifest。

### Object Key

图片 object key 建议确定性生成，避免 manifest 丢失后无限产生不同文件名：

```text
notion-images/<sourceHash>.<ext>
```

示例：

```text
notion-images/c72a91d8b4f2a0e8.jpg
```

`sourceHash` 可由 `notion:file:<pageId>:<blockId>:<lastEditedTime>` 做 sha256 得到。这样同一张未变化的 Notion-hosted 图片会稳定映射到同一个 R2 object key。

### Manifest Structure

manifest 结构示例：

```json
{
  "version": 1,
  "updatedAt": "2026-04-27T00:00:00.000Z",
  "items": {
    "<sourceHash>": {
      "sourceType": "notion-file",
      "objectKey": "notion-images/<sourceHash>.jpg",
      "publicUrl": "https://pub-xxxx.r2.dev/notion-images/<sourceHash>.jpg",
      "contentType": "image/jpeg",
      "size": 123456,
      "pageId": "<pageId>",
      "blockId": "<blockId>",
      "lastEditedTime": "<lastEditedTime>",
      "uploadedAt": "2026-04-27T00:00:00.000Z"
    }
  }
}
```

缓存命中流程：

```text
1. sync:notion 启动时，从 R2 读取 manifest JSON
2. 读取失败或 manifest 不存在时，使用空 manifest
3. 遇到 Notion-hosted 图片时，根据 source fingerprint 生成 sourceHash
4. 在内存 manifest 中查 sourceHash
5. 命中：直接返回 cached publicUrl
6. 未命中：下载 Notion 图片，上传到 R2，更新内存 manifest
7. sync:notion 结束前，将内存 manifest 写回 R2
```

GitHub Actions 注意点：

- GitHub Actions 每次都是临时环境，但会在构建开始从 R2 拉取 manifest。
- workflow 的 `concurrency` 可以避免同一个 workflow 并发写回 manifest 时互相覆盖。
- manifest 写回失败不影响本次静态页面展示，只会导致下次同步可能重新处理部分图片。

## Upload Behavior

下载 Notion-hosted 图片时：

- 使用构建期 Node `fetch` 下载。
- 检查 HTTP status，非 2xx 时将当前图片视为转存失败，并交给失败策略输出空字符串。
- 读取 `Content-Type`。
- 根据 `Content-Type` 或 URL 推断扩展名。
- 对下载结果设置最大体积限制，避免误拉超大文件。

上传 R2 时：

- 使用 S3 兼容 SDK，例如 `@aws-sdk/client-s3`。
- manifest 命中时不下载、不上传，直接复用 `publicUrl`。
- manifest 未命中时使用 `PutObject` 上传图片。
- 设置 `Content-Type`。
- 设置 `Cache-Control: public, max-age=31536000, immutable`。
- 本次同步结束前使用 `PutObject` 写回 manifest JSON。

public URL 生成：

```text
publicUrl = trimTrailingSlash(R2_PUBLIC_BASE_URL) + "/" + objectKey
```

## Proposed Module Design

建议在 `packages/notion-sync` 内新增独立模块，避免把 R2 逻辑混入 markdown 渲染细节：

```text
packages/notion-sync/src/imageAssets/
  config.ts              # 读取并校验 R2 配置
  manifestCache.ts       # 从 R2 读取/写回 manifest JSON
  r2Client.ts            # GetObject / PutObject
  resolveNotionImage.ts  # external 保留、file 转存
  contentType.ts         # content-type 与扩展名处理
```

核心接口建议：

```ts
interface ImageAssetResolver {
  resolveExternalImage(url: string): Promise<string>
  resolveNotionFileImage(input: NotionFileImageInput): Promise<string>
}
```

渲染 Notion image block 时：

```text
external -> resolver.resolveExternalImage(url)
file     -> resolver.resolveNotionFileImage(...)
```

这样后续如果从 R2 换成 COS/OSS，只需要替换 image asset 模块，不影响 Notion block 渲染主体。

## Failure Strategy

- external 图片 URL 非空即可保留，不主动请求验证，避免构建过慢。
- Notion-hosted 单张图片下载失败时，记录 warn，当前图片输出为空字符串，其他文章和图片继续同步。
- Notion-hosted 单张图片上传 R2 失败时，记录 warn，当前图片输出为空字符串，其他文章和图片继续同步。
- Notion-hosted 单张图片转化或 URL 替换失败时，记录 warn，当前图片输出为空字符串，其他文章和图片继续同步。
- warn 日志必须包含 `pageId`、`pageTitle`、`blockId`、原始图片类型、失败阶段和错误原因，便于上线后排查。
- 不允许在下载或上传失败后回退使用 Notion 临时 URL，避免把过期链接写入静态产物。
- R2 manifest 写回失败时，记录 warn 并继续构建；本次页面仍可使用已生成的图片 URL，下次同步最多只是重新处理相关图片。
- 自建服务器方案中，图片 warn 不阻止 `current` 软链切换，只要站点构建成功就可发布。
- GitHub Actions 方案中，图片 warn 不阻止 Pages artifact 部署，只要站点构建成功就可发布。

## Security Validation

需要检查以下内容不能出现在 `data/` 或 `frontend/dist/`：

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
NOTION_TOKEN
GITHUB_TOKEN
```

允许出现：

```text
R2_PUBLIC_BASE_URL
https://pub-xxxx.r2.dev/notion-images/...
```

因为公开图片 URL 是静态页面正常展示所需内容。

## Action Items

[ ] 梳理 `packages/notion-sync` 当前 image block 转 markdown/html 的位置。  
[ ] 明确 Notion image block 的 external/file 类型结构。  
[ ] 新增 R2 配置读取与校验。  
[ ] 新增 R2 S3 client，支持 `GetObject` 和 `PutObject`。  
[ ] 新增 R2 manifest 缓存读取与写回模块。  
[ ] 设计 source fingerprint 和 object key 生成规则。  
[ ] external 图片直接原样保留。  
[ ] Notion-hosted 图片下载后上传 R2。  
[ ] 上传成功后将图片链接替换为 R2 public URL。  
[ ] `sync:notion` 开始时从 R2 拉取 manifest，结束前写回 manifest。  
[ ] 重复运行同步时验证 R2 manifest 缓存命中，不重复上传。  
[ ] GitHub Actions build job 注入 R2 参数。  
[ ] GitHub Actions secret scan 增加 R2 secret 检查。  
[ ] 自建服务器 `.env` 文档补充 R2 参数。  
[ ] 本地运行 `pnpm sync:notion` 验证 `data/posts.json` 图片 URL。  
[ ] 运行 `pnpm build:frontend` 验证 SSG 输出能访问 R2 图片。  
[ ] 手动触发 GitHub Actions 验证 Pages 部署后的图片加载。

## Testing and Validation

本地验证：

```text
pnpm sync:notion
pnpm build:frontend
```

检查内容：

- external 图片 URL 在 `data/posts.json` 中保持不变。
- Notion-hosted 图片 URL 在 `data/posts.json` 中变成 `R2_PUBLIC_BASE_URL` 开头。
- `data/posts.json` 中不存在 `secure.notion-static.com` 之类 Notion 临时图片链接。
- R2 bucket 中出现 `notion-images/` 下的新对象。
- R2 bucket 中出现 `R2_CACHE_MANIFEST_KEY` 对应的 manifest JSON。
- 第二次运行 `pnpm sync:notion` 时，已有图片命中 R2 manifest 缓存，不重复上传。
- `frontend/dist` 页面中的图片 URL 可打开。

GitHub Actions 验证：

- Secrets/Variables 配置完整。
- 手动触发 workflow。
- `pnpm build:site` 阶段能够上传/复用 R2 图片。
- Pages artifact 中图片 URL 是 R2 public URL。
- 部署后的 GitHub Pages 页面图片正常显示。

安全验证：

```text
grep R2_SECRET_ACCESS_KEY value in data/
grep R2_SECRET_ACCESS_KEY value in frontend/dist/
grep R2_ACCESS_KEY_ID value in data/
grep R2_ACCESS_KEY_ID value in frontend/dist/
```

确认：

- 不存在 R2 secret。
- 不存在 Notion/GitHub token。
- 只存在公开图片 URL。

## Risks and Edge Cases

- R2 `r2.dev` public development URL 适合当前阶段，但长期正式站点建议后续绑定自定义域名。
- Notion 临时图片 URL 过期很快，缓存中不能把它作为最终 URL。
- 如果 Notion 图片被替换但 page/block last edited 信息没有覆盖到 fingerprint，可能误用旧图，需要实现时重点验证。
- GitHub Actions 是临时环境，因此必须在构建开始从 R2 拉取 manifest，不能依赖工作区文件保存缓存。
- 图片很多时，Notion 下载和 R2 上传会拖慢同步，需要控制并发。
- 如果两个不同环境并发写回 R2 manifest，可能互相覆盖；需要依赖 workflow concurrency 和自建服务器 lock 避免并发同步。
- 旧图片对象暂时不会自动清理，后续可以单独做 R2 orphan cleanup 阶段。

## Future Extensions

- 绑定自定义图片域名，例如 `images.example.com`。
- 图片压缩与 WebP/AVIF 转码。
- 生成响应式图片尺寸。
- R2 旧对象清理脚本。
- 上传失败重试和更详细的失败报告。
- 将 R2 适配层抽象为通用 object storage，后续可切换 COS/OSS。
