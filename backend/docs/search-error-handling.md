# 搜索功能错误处理文档

## 错误码设计

搜索功能使用统一的错误码系统（`backend/pkg/errors`），所有错误都经过标准化处理。

### 搜索业务错误码 (6400-6499)

| 错误码 | 常量名 | 内部消息 | 用户消息 | HTTP状态码 |
|--------|--------|----------|----------|-----------|
| 6401 | `ErrSearchQueryEmpty` | Search query is empty | 请输入搜索关键词 | 400 |
| 6402 | `ErrSearchQueryTooLong` | Search query is too long | 搜索关键词过长，请缩短后重试 | 400 |
| 6403 | `ErrSearchIndexFailed` | Search index creation failed | 搜索失败，请稍后重试 | 500 |
| 6404 | `ErrSearchQueryFailed` | Search query failed | 搜索失败，请稍后重试 | 500 |
| 6405 | `ErrSearchNoResults` | No search results found | 未找到相关内容 | 404 |
| 6406 | `ErrSearchInvalidPath` | Invalid path format | 搜索失败，请稍后重试 | 500 |
| 6407 | `ErrSearchContentExtract` | Content extraction failed | 搜索失败，请稍后重试 | 500 |

## 错误处理流程

### 1. Service 层错误处理

```go
// SearchService 中的错误处理示例
func (s *SearchService) SearchPages(ctx context.Context, userID uuid.UUID, query string) ([]*models.PageSearchResult, error) {
    // 参数验证错误（用户可见）
    if strings.TrimSpace(query) == "" {
        return nil, errors.New(errors.ErrSearchQueryEmpty, "search query is empty")
    }

    // 数据库查询错误（内部错误）
    blocks, err := s.searchRepo.SearchBlocks(ctx, userID, query, 1000)
    if err != nil {
        return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to search blocks")
    }

    // 业务逻辑错误（内部错误）
    if err := s.enrichPageInfo(ctx, pageResults); err != nil {
        return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to enrich page info")
    }

    return pageResults, nil
}
```

### 2. Handler 层错误处理

```go
// SearchHandler 中的错误处理示例
func (h *SearchHandler) SearchPages(c *gin.Context) {
    // 认证错误
    userID, exists := c.Get("user_id")
    if !exists {
        response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "user not authenticated"))
        return
    }

    // 执行搜索
    results, err := h.searchService.SearchPages(c.Request.Context(), uid, query)
    if err != nil {
        // 统一错误处理（自动判断错误类型并返回合适的响应）
        response.HandleError(c, err)
        return
    }

    response.Success(c, results)
}
```

## 错误响应格式

### 用户可见错误（1000-1999）

```json
{
  "code": 6401,
  "message": "请输入搜索关键词"
}
```

### 内部错误（5000-5999, 6000-6999）

```json
{
  "code": 6404,
  "message": "搜索失败，请稍后重试"
}
```

**注意**：内部错误的详细信息不会返回给用户，只会记录到日志文件 `logs/error.log`。

## 日志记录

### 日志格式

```
[ERROR] 2024/01/01 12:00:00 search_service.go:45: Code: 6404 (Search query failed), Detail: failed to search blocks, Error: database connection timeout
```

### 日志级别

- **用户可见错误（1000-1999）**：不记录到日志（正常业务流程）
- **内部错误（5000-5999）**：记录到 `logs/error.log`
- **业务错误（6000-6999）**：记录到 `logs/error.log`

### 日志轮转

- 单个日志文件最大 100MB
- 保留最近 30 个备份
- 保留 30 天
- 自动压缩旧日志

## 错误处理最佳实践

### 1. 参数验证

```go
// ✅ 好的做法：在 Service 层验证参数
if strings.TrimSpace(query) == "" {
    return nil, errors.New(errors.ErrSearchQueryEmpty, "search query is empty")
}

if len(query) > 200 {
    return nil, errors.New(errors.ErrSearchQueryTooLong, "search query exceeds 200 characters")
}
```

### 2. 包装底层错误

```go
// ✅ 好的做法：包装底层错误并添加上下文
blocks, err := s.searchRepo.SearchBlocks(ctx, userID, query, 1000)
if err != nil {
    return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to search blocks")
}
```

### 3. 统一错误处理

```go
// ✅ 好的做法：使用 response.HandleError 统一处理
results, err := h.searchService.SearchPages(c.Request.Context(), uid, query)
if err != nil {
    response.HandleError(c, err)  // 自动判断错误类型并返回合适的响应
    return
}
```

### 4. 避免的做法

```go
// ❌ 不好的做法：直接返回 fmt.Errorf
return nil, fmt.Errorf("search failed: %w", err)

// ❌ 不好的做法：在 Handler 中手动判断错误类型
if err != nil {
    if strings.Contains(err.Error(), "empty") {
        response.BadRequest(c, "搜索关键词不能为空")
    } else {
        response.Error(c, 500, "搜索失败")
    }
    return
}

// ❌ 不好的做法：暴露内部错误细节给用户
response.Error(c, 500, "Database query failed: "+err.Error())
```

## 错误监控

### 查看错误日志

```bash
# 实时查看错误日志
tail -f logs/error.log

# 查看搜索相关错误
grep "Search" logs/error.log

# 统计错误类型
grep "Code: 64" logs/error.log | wc -l
```

### 错误统计

```bash
# 统计各类搜索错误的数量
grep "Code: 6401" logs/error.log | wc -l  # 空查询
grep "Code: 6402" logs/error.log | wc -l  # 查询过长
grep "Code: 6403" logs/error.log | wc -l  # 索引失败
grep "Code: 6404" logs/error.log | wc -l  # 查询失败
```

## 常见错误场景

### 1. 用户输入错误

**场景**：用户未输入搜索关键词

```
请求：GET /api/admin/search?q=
响应：400 Bad Request
{
  "code": 6401,
  "message": "请输入搜索关键词"
}
```

### 2. 数据库查询失败

**场景**：数据库连接超时

```
请求：GET /api/admin/search?q=React
响应：500 Internal Server Error
{
  "code": 6404,
  "message": "搜索失败，请稍后重试"
}

日志：[ERROR] Code: 6404 (Search query failed), Detail: failed to search blocks, Error: database connection timeout
```

### 3. 索引创建失败

**场景**：Worker 处理索引任务时失败

```
日志：[ERROR] Code: 6403 (Search index creation failed), Detail: failed to upsert index, Error: invalid content format
```

### 4. 路径格式错误

**场景**：Block 的 path 字段格式不正确

```
日志：[ERROR] Code: 6406 (Invalid path format), Detail: invalid block path, Error: path must have at least 2 segments
```

## 错误恢复策略

### 1. 索引失败重试

Worker 会自动重试失败的索引任务（Redis Stream 特性）：

- 失败的消息不 ACK
- Redis 自动重新投递
- 最多重试 3 次（可配置）

### 2. 搜索降级

如果搜索服务不可用，可以：

- 返回空结果（不影响用户使用其他功能）
- 提示用户稍后重试
- 记录错误日志供运维排查

### 3. 索引重建

如果索引数据损坏，可以手动重建：

```go
// 重建所有索引
searchService.RebuildIndex(ctx, nil)

// 重建某个用户的索引
searchService.RebuildIndex(ctx, &userID)
```

## 总结

搜索功能的错误处理遵循以下原则：

1. ✅ **用户友好**：用户可见错误返回清晰的提示信息
2. ✅ **安全性**：内部错误不暴露敏感信息
3. ✅ **可追溯**：所有错误都记录到日志文件
4. ✅ **统一性**：使用统一的错误码和处理流程
5. ✅ **可维护**：错误码集中管理，易于扩展
