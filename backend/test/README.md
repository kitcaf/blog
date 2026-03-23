# 测试说明

## 测试结构

```
backend/test/
├── testutil/           # 测试工具
│   ├── db.go          # 数据库初始化
│   └── fixtures.go    # 测试数据创建
└── search/            # 搜索功能测试
    ├── index_test.go     # 索引管理测试
    ├── query_test.go     # 查询功能测试
    ├── ranking_test.go   # 排序功能测试
    └── workflow_test.go  # 完整流程测试
```

## 快速开始

```bash
# 1. 配置测试环境（二选一）
# 方式1: 创建 .env.test（推荐）

# 2. 创建测试数据库
make setup-test-db

# 3. 运行测试
make test
```

## 配置说明

### 方式 1：使用 .env.test（推荐）

创建独立的测试配置文件 `.env.test`：

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=blog
DB_SSLMODE=disable

# Test Database（测试专用）
TEST_DB_NAME=blog_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Test Redis（测试专用，使用不同 DB 避免冲突）
TEST_REDIS_DB=1
```

### 方式 2：使用 .env

如果没有 `.env.test`，测试会自动使用 `.env` 文件。

在 `.env` 中添加测试配置：

```env
# 在现有配置基础上添加
TEST_DB_NAME=blog_test
TEST_REDIS_DB=1
```

**加载优先级**：`.env.test` > `.env`

## 运行测试

```bash
# 运行所有测试
make test

# 运行特定模块
go test ./test/search/... -v

# 运行特定测试
go test ./test/search/... -v -run TestDeletePageRemovesIndexes

# 查看覆盖率
make test-coverage
```

## 测试用例

### 索引管理 (index_test.go)
- TestDeletePageRemovesIndexes - 删除页面后索引被删除
- TestPublishedAtFromPage - 索引的 published_at 来自页面
- TestBatchDeleteBlockIndexes - 批量删除索引

### 查询功能 (query_test.go)
- TestPublicSearchOnlyShowsPublished - 公开搜索只显示已发布内容
- TestUnpublishPageHidesFromPublicSearch - 撤回发布后不可见
- TestEmptyQueryReturnsEmptyResults - 空查询返回空数组
- TestChineseSearch - 中文搜索

### 排序功能 (ranking_test.go)
- TestSearchResultsSortedCorrectly - 结果正确排序
- TestMultiBlockMatchBonus - 多块命中加分

### 完整流程 (workflow_test.go)
- TestFullWorkflow - 完整工作流测试

## 添加新测试

1. 在对应模块文件中添加测试函数
2. 使用 `testutil` 工具函数创建测试数据
3. 使用 `defer testutil.CleanupTestDB(t, db)` 清理数据

示例：

```go
func TestNewFeature(t *testing.T) {
    db := testutil.SetupTestDB(t)
    defer testutil.CleanupTestDB(t, db)
    
    userID, rootID := testutil.CreateTestUser(t, db)
    page := testutil.CreateTestPage(t, db, userID, rootID, "Title", true)
    
    // 测试代码...
}
```

## 环境隔离

- **测试数据库**: 使用独立的 `TEST_DB_NAME`（默认 blog_test）
- **测试 Redis**: 使用独立的 `TEST_REDIS_DB`（默认 1）
- **自动清理**: 每个测试后自动清理数据

## 常见问题

### Q: 如何使用独立的测试配置？

创建 `.env.test` 文件，测试会优先使用它。

### Q: 测试会影响生产数据吗？

不会。测试使用独立的数据库和 Redis DB。

### Q: 如何调试测试？

```bash
go test ./test/search/... -v -run TestDeletePageRemovesIndexes
```
