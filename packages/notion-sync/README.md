# Notion sync

这个包是博客内容编译器：从 Notion 读取 `Published` 页面，转换成前端 SSG 直接消费的本地文章 JSON。

## 使用方式

```bash
pnpm sync:notion
```

外部只需要提供两个配置：

```bash
NOTION_TOKEN=
NOTION_DATABASE_ID=
```

`NOTION_DATABASE_ID` 可以是纯数据库 ID，也可以是 Notion 复制出来的完整数据库链接。

## 固定写作约定

Notion 数据库默认使用这些字段：

- `Title`：文章标题，必填。
- `Status`：发布状态，只同步 `Published`。
- `Category`：文章分类，缺省时使用 `General`。
- `Tags`：文章标签，缺省时为空数组。
- `PublishedAt`：发布时间，缺省时使用 Notion 页面创建时间。
- `Slug`：文章 URL 标识，缺省时由标题和页面 ID 自动生成。
- `Description`：文章摘要，缺省时从正文纯文本自动截取。

## 支持的正文块

当前支持 paragraph、heading、list、quote、code、divider 和外部图片链接。
不支持的 block 会降级处理并输出 warning，不会中断整次同步。

Notion 上传图片的链接会过期，所以暂时跳过；正式图片迁移放到后续阶段。

