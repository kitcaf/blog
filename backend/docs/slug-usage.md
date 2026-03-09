# Slug 使用指南

## 概述

Slug 是用于 SEO 友好 URL 的路由别名，仅用于 `page` 类型的 Block。

## 设计原则

1. **全局唯一**：使用 UNIQUE INDEX 确保不会有重复的 slug
2. **SEO 友好**：使用有意义的单词而不是 UUID
3. **防冲突**：添加随机哈希后缀避免标题重复导致的冲突
4. **可读性**：保留标题的语义信息

## Slug 格式

```
标题转换-随机哈希
```

示例：
- 标题：`我的第一篇文章` → Slug：`wo-de-di-yi-pian-wen-zhang-a3f2`
- 标题：`Hello World` → Slug：`hello-world-b7e9`
- 标题：`React 最佳实践` → Slug：`react-zui-jia-shi-jian-c4d1`

## 生成规则

1. 转小写
2. 替换空格和特殊字符为连字符 `-`
3. 移除首尾的连字符
4. 限制长度（最多50字符）
5. 添加4位随机十六进制哈希

## 使用场景

### 1. 创建页面时（可选）

创建页面时 slug 为 NULL（草稿状态）：

```go
page := &models.Block{
    ID:         uuid.New(),
    Type:       "page",
    Properties: json.RawMessage(`{"title": "我的文章"}`),
    Slug:       nil, // 草稿状态不需要 slug
}
```

### 2. 发布页面时（必需）

发布页面时自动生成 slug：

```go
import "blog-backend/pkg/utils"

// 从 properties 中提取标题
var props map[string]interface{}
json.Unmarshal(page.Properties, &props)
title := props["title"].(string)

// 生成 slug
slug := utils.GenerateSlug(title)
page.Slug = &slug
page.PublishedAt = &time.Now()

// 保存到数据库
db.Save(page)
```

### 3. 前台访问

博客前台通过 slug 访问文章：

```
GET /api/public/pages/:slug/blocks
```

例如：
```
GET /api/public/pages/hello-world-b7e9/blocks
```

## 唯一性保证

### 数据库层面

使用部分唯一索引（只对非 NULL 的 slug）：

```sql
CREATE UNIQUE INDEX idx_blocks_slug_unique 
ON blocks (slug) 
WHERE slug IS NOT NULL;
```

### 应用层面

如果生成的 slug 已存在（极小概率），重新生成：

```go
func GenerateUniqueSlug(db *gorm.DB, title string) string {
    maxRetries := 5
    for i := 0; i < maxRetries; i++ {
        slug := utils.GenerateSlug(title)
        
        // 检查是否已存在
        var count int64
        db.Model(&models.Block{}).Where("slug = ?", slug).Count(&count)
        
        if count == 0 {
            return slug
        }
    }
    
    // 降级方案：使用 UUID
    return uuid.New().String()[:8]
}
```

## 验证规则

使用 `utils.ValidateSlug()` 验证 slug 格式：

```go
if !utils.ValidateSlug(slug) {
    return errors.New("invalid slug format")
}
```

规则：
- 长度：3-100 字符
- 字符：小写字母、数字、连字符、中文
- 格式：`^[a-z0-9\u4e00-\u9fa5]+(-[a-z0-9\u4e00-\u9fa5]+)*$`

## 最佳实践

1. **草稿不生成 slug**：只有发布时才生成，避免浪费
2. **标题变更不更新 slug**：保持 URL 稳定性，避免 SEO 损失
3. **删除后不复用 slug**：使用软删除，保留历史记录
4. **自定义 slug**：允许用户手动指定 slug（需验证唯一性）

## 示例代码

### 发布页面的完整流程

```go
func (s *BlockService) PublishPage(userID, pageID uuid.UUID, customSlug *string) error {
    // 1. 查询页面
    page, err := s.blockRepo.FindByID(userID, pageID)
    if err != nil {
        return err
    }

    // 2. 生成或验证 slug
    var slug string
    if customSlug != nil {
        // 用户自定义 slug
        if !utils.ValidateSlug(*customSlug) {
            return errors.New("invalid slug format")
        }
        slug = *customSlug
    } else {
        // 自动生成 slug
        var props map[string]interface{}
        json.Unmarshal(page.Properties, &props)
        title := props["title"].(string)
        slug = GenerateUniqueSlug(s.db, title)
    }

    // 3. 更新页面
    now := time.Now()
    page.Slug = &slug
    page.PublishedAt = &now
    
    // 4. 保存
    return s.blockRepo.Update(userID, page)
}
```

## 注意事项

1. **Folder 类型不需要 slug**：只有 page 类型才需要
2. **Slug 不能为空字符串**：要么是 NULL，要么是有效的 slug
3. **唯一性冲突处理**：虽然有随机哈希，但仍需处理极小概率的冲突
4. **国际化支持**：当前支持中文，可扩展支持其他语言
