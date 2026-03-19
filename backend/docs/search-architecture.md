# 搜索架构设计文档

## 架构概览

```
┌─────────────┐
│   用户编辑   │
│  (Frontend) │
└──────┬──────┘
       │ HTTP POST /api/admin/blocks
       ▼
┌─────────────────────────────────────────┐
│         BlockHandler.SyncBlocks         │
│  (立即返回，不阻塞用户操作)              │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         BlockService.SyncBlocks         │
│  1. UPSERT blocks 到数据库               │
│  2. 发布索引任务到 Redis Stream (异步)   │
│  3. 立即返回 200 OK                      │
└──────┬──────────────────────────────────┘
       │
       │ 异步发布消息
       ▼
┌─────────────────────────────────────────┐
│         Redis Stream                    │
│  stream:block:index                     │
│  - action: "upsert" / "delete"          │
│  - block_id: UUID                       │
└──────┬──────────────────────────────────┘
       │
       │ 后台 Worker 消费
       ▼
┌─────────────────────────────────────────┐
│       SearchIndexer (Worker)            │
│  1. 从 Redis Stream 读取消息             │
│  2. 调用 SearchService.IndexBlock()     │
│  3. 提取内容 → 生成 search_vector        │
│  4. UPSERT 到 block_search_index 表     │
│  5. ACK 消息                             │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│    PostgreSQL: block_search_index       │
│  - 全文搜索索引 (GIN)                    │
│  - 向量索引 (pgvector, 未来)             │
└─────────────────────────────────────────┘
```

## 核心设计原则

### 1. 用户体验优先
- **绝对不阻塞用户编辑操作**
- SyncBlocks 立即返回，索引异步处理
- 即使索引失败，也不影响 Block 保存

### 2. 性能优化
- **批量处理**：Worker 每次读取 10 条消息
- **并发发布**：使用 goroutine 并发发布索引任务
- **超时控制**：每个索引操作最多 10 秒
- **自动重试**：失败的消息不 ACK，Redis 自动重新投递

### 3. 数据一致性
- **最终一致性**：索引可能有几百毫秒延迟
- **幂等性**：UPSERT 操作天然幂等，重复执行无副作用
- **错误隔离**：索引失败只记录日志，不影响主流程

## 数据流详解

### 1. Block 更新流程

```go
// 用户编辑 → BlockService.SyncBlocks()
func (s *BlockService) SyncBlocks(userID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
    // 1. 立即保存到数据库（同步）
    s.blockRepo.Upsert(userID, updatedBlocks)
    
    // 2. 异步发布索引任务（不等待）
    for _, block := range updatedBlocks {
        go s.searchIndexer.PublishIndexTask(ctx, "upsert", block.ID)
    }
    
    // 3. 立即返回（用户无感知）
    return nil
}
```

### 2. 索引处理流程

```go
// Worker 后台消费 → SearchIndexer.consumeLoop()
func (si *SearchIndexer) consumeLoop() {
    for {
        // 1. 从 Redis Stream 读取消息（阻塞 5 秒）
        messages := si.rdb.XReadGroup(...)
        
        // 2. 处理每条消息
        for _, msg := range messages {
            // 3. 执行索引操作
            si.searchService.IndexBlock(ctx, msg.BlockID)
            
            // 4. ACK 消息
            si.rdb.XAck(...)
        }
    }
}
```

### 3. 搜索查询流程

```go
// 用户搜索 → SearchService.SearchPages()
func (s *SearchService) SearchPages(ctx context.Context, userID uuid.UUID, query string, limit int) {
    // 1. Block 级搜索（PostgreSQL 全文搜索）
    blocks := s.searchRepo.SearchBlocks(ctx, userID, query, 100)
    
    // 2. 按 Page 聚合
    pageMap := aggregateByPage(blocks)
    
    // 3. 计算 Page 分数
    // PageScore = MaxScore * 0.7 + BonusScore * 0.3
    pageResults := calculatePageScores(pageMap)
    
    // 4. 排序并限制数量
    sort(pageResults)
    pageResults = pageResults[:limit]
    
    // 5. JOIN 补充 Page 信息（title/icon/path）
    enrichPageInfo(pageResults)
    
    return pageResults
}
```

## Redis Stream 配置

### Stream 名称
- `stream:block:index` - 索引任务队列

### Consumer Group
- `indexer-group` - 消费者组
- `indexer-1` - 消费者名称（可扩展为多个）

### 消息格式
```json
{
  "action": "upsert",  // 或 "delete"
  "block_id": "uuid"
}
```

### 性能参数
- **Count**: 10 - 每次读取 10 条消息
- **Block**: 5s - 阻塞等待 5 秒
- **Timeout**: 10s - 单个索引操作超时

## 数据库表结构

### block_search_index 表

```sql
CREATE TABLE block_search_index (
    block_id UUID PRIMARY KEY,           -- Block ID（主键）
    page_id UUID NOT NULL,               -- 所属 Page ID
    user_id UUID NOT NULL,               -- 所属用户 ID
    block_type VARCHAR(50) NOT NULL,     -- Block 类型
    block_order INT NOT NULL DEFAULT 0,  -- 在 Page 中的顺序
    content TEXT NOT NULL,               -- 提取的纯文本
    search_vector TSVECTOR,              -- 全文搜索向量
    source_updated_at TIMESTAMPTZ NOT NULL,  -- 来自 blocks.updated_at
    published_at TIMESTAMPTZ,            -- 来自 blocks.published_at
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- 索引
CREATE INDEX idx_page_user ON block_search_index (page_id, user_id);
CREATE INDEX idx_search_gin ON block_search_index USING gin(search_vector);
CREATE INDEX idx_published ON block_search_index (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX idx_source_updated_desc ON block_search_index (source_updated_at DESC);
```

## API 接口

### 管理后台搜索
```
GET /api/admin/search?q=关键词&limit=10
Authorization: Bearer <token>

Response:
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "page_id": "uuid",
      "page_title": "文章标题",
      "page_icon": "📝",
      "page_path": "/uuid/uuid/",
      "max_score": 0.85,
      "match_count": 3,
      "page_score": 0.62,
      "updated_at": "2024-01-01T00:00:00Z",
      "representative_block": {
        "block_id": "uuid",
        "block_type": "paragraph",
        "content": "匹配的内容...",
        "score": 0.85
      },
      "top_blocks": [...]
    }
  ]
}
```

### 前台搜索（已发布）
```
GET /api/public/search?q=关键词&limit=10

Response: 同上（只返回已发布的内容）
```

## 监控与调试

### 查看 Redis Stream 状态
```bash
# 查看 Stream 长度
redis-cli XLEN stream:block:index

# 查看 Consumer Group 信息
redis-cli XINFO GROUPS stream:block:index

# 查看待处理消息
redis-cli XPENDING stream:block:index indexer-group
```

### 查看索引状态
```sql
-- 查看索引总数
SELECT COUNT(*) FROM block_search_index;

-- 查看某个 Page 的索引
SELECT * FROM block_search_index WHERE page_id = 'uuid';

-- 查看最近索引的 Block
SELECT * FROM block_search_index ORDER BY updated_at DESC LIMIT 10;
```

### 日志监控
```bash
# 查看 Worker 日志
tail -f logs/error.log | grep "Search indexer"

# 查看索引失败日志
tail -f logs/error.log | grep "Failed to process message"
```

## 性能指标

### 预期性能
- **索引延迟**: < 500ms（P99）
- **搜索响应**: < 100ms（P95）
- **吞吐量**: 1000+ 索引任务/秒

### 瓶颈分析
1. **PostgreSQL 全文搜索**: GIN 索引性能优秀，支持百万级数据
2. **Redis Stream**: 单机可支持百万级消息/秒
3. **Worker 并发**: 可启动多个 Worker 实例（修改 ConsumerNameIndex）

## 未来优化

### 1. 向量搜索（Embedding）
- 安装 pgvector 扩展
- 集成 OpenAI/本地 Embedding API
- 实现混合搜索（RRF 融合）

### 2. 多 Worker 扩展
```go
// 启动多个 Worker
for i := 1; i <= 3; i++ {
    indexer := NewSearchIndexer(rdb, db)
    indexer.consumerName = fmt.Sprintf("indexer-%d", i)
    indexer.Start()
}
```

### 3. 批量索引
```go
// 批量处理消息（减少数据库连接）
func (si *SearchIndexer) processBatch(messages []redis.XMessage) {
    blockIDs := extractBlockIDs(messages)
    si.searchService.BatchIndexBlocks(ctx, blockIDs)
}
```

## 故障处理

### 1. Redis 不可用
- Worker 自动停止
- 索引任务丢失（可接受，因为是异步）
- 搜索功能正常（查询历史索引）

### 2. 索引失败
- 消息不 ACK，自动重试
- 超过重试次数后移入死信队列
- 记录错误日志，人工介入

### 3. 数据不一致
- 提供手动重建索引接口
```go
// 重建某个用户的所有索引
searchService.RebuildIndex(ctx, userID)
```

## 总结

这个架构的核心优势：
1. ✅ **用户体验**: 编辑操作零延迟
2. ✅ **性能**: 异步处理，不阻塞主流程
3. ✅ **可靠性**: 消息队列保证不丢失
4. ✅ **可扩展**: 支持多 Worker 并发
5. ✅ **可维护**: 代码清晰，易于调试
