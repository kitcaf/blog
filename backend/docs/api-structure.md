# API 结构文档

## API 设计原则

- RESTful 风格
- 统一的响应格式
- 清晰的错误码体系
- 版本化管理（/api/v1）
- 幂等性保证

## 统一响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

## 数据库架构说明

### 核心表结构：blocks

本系统采用**单表设计**，使用**物化路径 + 邻接表 + 子节点排序数组**的混合模式。

**核心字段**:
- `id`: UUID（前端生成，支持本地优先架构）
- `parent_id`: UUID（邻接表，快速找直系父级）
- `path`: VARCHAR(1000)（物化路径，如 `/uuid-1/uuid-2/`）
- `type`: VARCHAR(50)（块类型：page、heading、paragraph、code_block 等）
- `content_ids`: UUID[]（子节点排序数组，严格决定展示顺序）
- `properties`: JSONB（存储所有动态属性：文本、样式、图片 URL、发布状态等）
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP
- `deleted_at`: TIMESTAMP（软删除标识）

**核心索引**:
```sql
CREATE INDEX idx_blocks_path ON blocks USING btree (path varchar_pattern_ops);
CREATE INDEX idx_blocks_parent_id ON blocks(parent_id);
CREATE INDEX idx_blocks_type ON blocks(type);
CREATE INDEX idx_blocks_deleted_at ON blocks(deleted_at);
```

**设计优势**:
1. 物化路径支持高效的子树查询（`WHERE path LIKE '/uuid-1/%'`）
2. content_ids 数组解决同层级的严格排序问题
3. JSONB properties 提供极高的扩展性
4. 软删除保证数据安全和可恢复性
5. 前端生成 UUID 支持离线编辑和本地优先架构

## API 路由结构

### 路由分组

- `/api/admin/*` - 管理端接口（需要认证）
- `/api/public/*` - 公开访问接口（无需认证）
- `/api/health` - 健康检查接口

## 管理端 API

### 认证模块 `/api/admin/auth`

#### POST /api/admin/auth/login

**用途**: 管理员登录

**请求体**:
```json
{
  "username": "admin",
  "password": "***"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "jwt_string",
    "user": {
      "id": 1,
      "username": "admin",
      "name": "管理员"
    }
  }
}
```

**错误码**:
- 400: 参数错误
- 401: 用户名或密码错误

---

#### GET /api/admin/auth/me

**用途**: 验证 Token 并获取当前管理员信息

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "name": "管理员",
    "email": "admin@example.com"
  }
}
```

**错误码**:
- 401: Token 无效或已过期

---

#### POST /api/admin/auth/logout

**用途**: 退出登录

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "code": 200,
  "message": "退出成功"
}
```

---

### 页面管理模块 `/api/admin/pages`

#### GET /api/admin/pages

**用途**: 获取后台侧边栏的目录树（仅返回 type='page' 的 Block）

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `include_unpublished`: boolean（是否包含未发布页面，默认 true）
- `level`: string（可选，如 'root' 只返回顶层页面）

**SQL 查询示例**:
```sql
SELECT id, parent_id, path, content_ids, properties 
FROM blocks 
WHERE type = 'page' 
  AND deleted_at IS NULL;
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid-1",
      "parent_id": null,
      "path": "/uuid-1/",
      "type": "page",
      "content_ids": ["uuid-2", "uuid-3"],
      "properties": {
        "title": "首页",
        "slug": "home",
        "icon": "🏠",
        "cover_image": "https://...",
        "is_published": true
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": "uuid-10",
      "parent_id": "uuid-1",
      "path": "/uuid-1/uuid-10/",
      "type": "page",
      "content_ids": [],
      "properties": {
        "title": "子页面",
        "slug": "child-page",
        "icon": "📄",
        "is_published": false
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**性能优化**:
- 使用物化路径索引快速查询
- 前端通过 parent_id 在内存中组装树形结构
- 如需查询特定文件夹下的子页面：`WHERE path LIKE '/uuid-1/%'`

---

#### POST /api/admin/pages

**用途**: 新建页面（前端生成 UUID）

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "id": "uuid-new-page",
  "parent_id": "uuid-1",
  "type": "page",
  "properties": {
    "title": "新文章",
    "icon": "📝",
    "slug": "new-article",
    "is_published": false
  }
}
```

**响应**:
```json
{
  "code": 201,
  "message": "创建成功",
  "data": {
    "id": "uuid-new-page",
    "parent_id": "uuid-1",
    "path": "/uuid-1/uuid-new-page/",
    "type": "page",
    "content_ids": [],
    "properties": {
      "title": "新文章",
      "icon": "📝",
      "slug": "new-article",
      "is_published": false
    },
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**后端处理**:
- 接受前端生成的 UUID
- 自动计算 path（基于 parent_id）
- 初始化 content_ids 为空数组
- 如果有 parent_id，需要更新父页面的 content_ids

---

#### PUT /api/admin/pages/:id

**用途**: 修改页面元数据或移动页面

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "properties": {
    "title": "修改后的标题",
    "slug": "updated-slug",
    "icon": "✨",
    "cover_image": "https://...",
    "is_published": true
  },
  "parent_id": "uuid-99"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "更新成功",
  "data": {
    "id": "uuid-2",
    "parent_id": "uuid-99",
    "path": "/uuid-99/uuid-2/",
    "properties": {
      "title": "修改后的标题"
    },
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**移动页面的特殊处理**:
当 parent_id 发生变化时，需要批量更新路径：
```sql
UPDATE blocks
SET 
    parent_id = 'uuid-99',
    path = REPLACE(path, '/uuid-1/uuid-2/', '/uuid-99/uuid-2/')
WHERE path LIKE '/uuid-1/uuid-2/%';
```

**错误码**:
- 404: 页面不存在
- 400: 参数错误（如 slug 重复、循环引用）

---

#### DELETE /api/admin/pages/:id

**用途**: 软删除页面（级联软删除所有子 Block）

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "code": 200,
  "message": "删除成功"
}
```

**后端处理（软删除）**:
```sql
-- 使用物化路径批量软删除该页面及所有子孙节点
UPDATE blocks
SET deleted_at = CURRENT_TIMESTAMP
WHERE path LIKE '/uuid-2/%' OR id = 'uuid-2';
```

**注意**:
- 使用软删除（设置 deleted_at），不物理删除数据
- 利用物化路径一次性标记所有子孙节点
- 需要从父页面的 content_ids 中移除该页面 ID

**错误码**:
- 404: 页面不存在或已删除

---

### Block 管理模块 `/api/admin/blocks`

#### GET /api/admin/blocks/:workspace_id/:page_id

**用途**: 获取指定页面的所有 Block（扁平数组）

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid-1",
      "parent_id": null,
      "path": "/uuid-1/",
      "type": "page",
      "content_ids": ["uuid-2", "uuid-3"],
      "properties": {
        "title": "Go 并发编程",
        "icon": "🚀",
        "cover_image": "https://...",
        "is_published": true
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "deleted_at": null
    },
    {
      "id": "uuid-2",
      "parent_id": "uuid-1",
      "path": "/uuid-1/uuid-2/",
      "type": "heading",
      "content_ids": [],
      "properties": {
        "text": "什么是 Goroutine",
        "level": 1
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "deleted_at": null
    },
    {
      "id": "uuid-3",
      "parent_id": "uuid-1",
      "path": "/uuid-1/uuid-3/",
      "type": "paragraph",
      "content_ids": [],
      "properties": {
        "text": "Goroutine 是 Go 语言的轻量级线程..."
      },
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "deleted_at": null
    }
  ]
}
```

**注意**:
- 使用物化路径（path）+ 邻接表（parent_id）混合模式
- content_ids 数组严格决定子块的展示顺序
- properties 字段存储所有动态属性（JSONB）

---

#### POST /api/admin/blocks/sync

**用途**: 增量同步 Block 数据（核心接口，支持本地优先架构）

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "updated_blocks": [
    {
      "id": "uuid-5",
      "parent_id": "uuid-1",
      "path": "/uuid-1/uuid-5/",
      "type": "paragraph",
      "content_ids": [],
      "properties": {
        "text": "Gin 是一个非常快的 Web 框架..."
      }
    },
    {
      "id": "uuid-1",
      "parent_id": null,
      "path": "/uuid-1/",
      "type": "page",
      "content_ids": ["uuid-2", "uuid-3", "uuid-5"],
      "properties": {
        "title": "Go 并发编程"
      }
    }
  ],
  "deleted_blocks": ["uuid-6"]
}
```

**响应**:
```json
{
  "code": 200,
  "message": "同步成功",
  "data": {
    "updated_count": 2,
    "deleted_count": 1,
    "synced_at": "2024-01-01T00:00:00Z"
  }
}
```

**处理逻辑**:
1. 开启数据库事务
2. 遍历 `updated_blocks` 执行 UPSERT（存在则更新，不存在则插入）
   - 前端生成 UUID，后端直接接受
   - 更新 path、parent_id、content_ids、properties 等字段
3. 对 `deleted_blocks` 执行软删除（设置 deleted_at 时间戳）
   - 不物理删除，保留数据用于可能的恢复或审计
4. 清除相关页面的 Redis 缓存
5. 提交事务

**关键设计**:
- 前端生成 UUID（本地优先，离线编辑支持）
- 使用 dirty_set 追踪变更的 Block ID
- 批量同步减少网络请求
- 软删除保证数据安全

**错误码**:
- 400: 数据格式错误（如缺少必需字段）
- 401: Token 无效
- 500: 事务失败

---

## 公开访问 API

### 页面模块 `/api/public/pages`

#### GET /api/public/pages

**用途**: 获取博客导航菜单/目录树（仅返回已发布页面）

**SQL 查询示例**:
```sql
SELECT id, parent_id, path, properties 
FROM blocks 
WHERE type = 'page' 
  AND properties->>'is_published' = 'true'
  AND deleted_at IS NULL;
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid-1",
      "parent_id": null,
      "properties": {
        "title": "首页",
        "slug": "home",
        "icon": "🏠"
      }
    },
    {
      "id": "uuid-10",
      "parent_id": "uuid-1",
      "properties": {
        "title": "子页面",
        "slug": "child-page",
        "icon": "📄"
      }
    }
  ]
}
```

**注意**: 
- 自动过滤 `properties->>'is_published' = 'false'` 的页面
- 自动过滤 `deleted_at IS NOT NULL` 的页面
- 不返回敏感字段（如 created_at、updated_at、content_ids）
- 前端通过 parent_id 在内存中组装树形结构

---

#### GET /api/public/pages/:slug/blocks

**用途**: 获取指定页面的所有 Block（用于博客前端渲染）

**路径参数**:
- `slug`: 页面的 URL 别名

**可选查询参数**:
- `id`: 使用页面 ID 查询（优先级高于 slug）

**SQL 查询示例**:
```sql
-- 先通过 slug 找到页面
SELECT * FROM blocks 
WHERE type = 'page' 
  AND properties->>'slug' = 'article-slug'
  AND properties->>'is_published' = 'true'
  AND deleted_at IS NULL;

-- 然后获取该页面下的所有子孙 Block
SELECT * FROM blocks
WHERE path LIKE '/uuid-1/%'
  AND deleted_at IS NULL
ORDER BY path, array_position(
  (SELECT content_ids FROM blocks WHERE id = parent_id), 
  id
);
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "page": {
      "id": "uuid-1",
      "type": "page",
      "properties": {
        "title": "文章标题",
        "slug": "article-slug",
        "cover_image": "https://...",
        "icon": "📝"
      }
    },
    "blocks": [
      {
        "id": "uuid-2",
        "parent_id": "uuid-1",
        "type": "heading",
        "content_ids": [],
        "properties": {
          "text": "标题",
          "level": 1
        }
      },
      {
        "id": "uuid-3",
        "parent_id": "uuid-1",
        "type": "paragraph",
        "content_ids": [],
        "properties": {
          "text": "段落内容..."
        }
      }
    ]
  }
}
```

**缓存策略**:
- 首次请求时从数据库查询，并缓存到 Redis
- 缓存 Key: `page:blocks:{page_id}`
- 缓存过期时间: 1 小时
- 当页面通过 `/api/admin/blocks/sync` 更新时，自动清除缓存
- 利用物化路径实现高效的子树查询

**错误码**:
- 404: 页面不存在或未发布

---

## 辅助接口

### GET /api/health

**用途**: 健康检查

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "database": "connected",
  "redis": "connected"
}
```

---

### GET /api/version

**用途**: 获取 API 版本信息

**响应**:
```json
{
  "version": "1.0.0",
  "build": "20240101",
  "go_version": "1.21.0"
}
```

---

## 错误码规范

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（Token 无效或缺失） |
| 403 | 禁止访问（权限不足） |
| 404 | 资源不存在 |
| 409 | 冲突（如 slug 重复） |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

---

## 认证机制

### JWT Token 结构

**Header**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload**:
```json
{
  "user_id": 1,
  "username": "admin",
  "exp": 1704067200,
  "iat": 1704063600
}
```

**使用方式**:
- 客户端在请求头中携带: `Authorization: Bearer <token>`
- 后端中间件验证 Token 有效性
- Token 有效期: 24 小时

---

## 中间件链

### 管理端接口中间件顺序
1. CORS 中间件
2. 日志中间件
3. 错误恢复中间件
4. JWT 认证中间件
5. 权限验证中间件
6. 业务处理器

### 公开接口中间件顺序
1. CORS 中间件
2. 日志中间件
3. 错误恢复中间件
4. 限流中间件（可选）
5. 业务处理器

---

## 性能优化策略

### 缓存策略
- 已发布页面的 Block 数据缓存到 Redis
- 页面目录树缓存（公开接口）
- 缓存失效: 内容更新时主动清除

### 数据库优化
- 为 `blocks.path` 创建 B-tree 索引（支持 LIKE 查询）
- 为 `blocks.parent_id` 创建索引
- 为 `blocks.type` 创建索引
- 为 `blocks.deleted_at` 创建部分索引
- 为 `properties->>'slug'` 创建唯一索引（针对 type='page'）
- 使用数据库连接池
- 利用物化路径实现 O(1) 复杂度的子树查询

### 批量操作
- 增量同步接口使用事务批量处理
- 避免 N+1 查询问题

---

## API 版本管理

当前版本: v1

未来版本升级策略:
- 保持向后兼容
- 新版本使用新路径（如 /api/v2）
- 旧版本保留至少 6 个月


---

## 数据流架构集成

### 前后端数据流

```
[ PostgreSQL / Go API ] 
        ↑ ↓ (HTTP 网络请求)
====================================================== 边界：网络层
[ React Query (useQuery / useMutation) ]  
  数据形态：DbBlock (原始数据库结构)
        ↑ ↓
     hydrate() / dehydrate()              
        ↑ ↓
====================================================== 边界：内存/UI层
[ Zustand Store / Tiptap 内部状态 ]         
  数据形态：Block (前端强类型结构)
        ↑ ↓
[ React 编辑器 UI ]                       
```

### 增量同步机制（Dirty Tracking）

前端使用 Zustand 维护两个集合：
- `dirty_set = new Set<string>()`（记录被修改/新增的 Block ID）
- `deleted_set = new Set<string>()`（记录被删除的 Block ID）

**四种操作的处理**:

1. **改 (Update)**: 用户在 block-5 打字
   - `dirty_set.add('block-5')`
   - 防抖后提取 block-5 最新数据发送

2. **增 (Create)**: 用户按 Enter 新建 block-6
   - `dirty_set.add('block-6')`（新段落）
   - `dirty_set.add('page-root')`（父页面的 content_ids 变化）

3. **移 (Move)**: 拖拽 block-5 到 block-2 前面
   - `dirty_set.add('page-root')`（只需更新父级的 content_ids）

4. **删 (Delete)**: 删除 block-5
   - `deleted_set.add('block-5')`
   - `dirty_set.add('page-root')`（父页面的 content_ids 变化）

### 防抖同步策略

- 用户停止编辑 1.5-2 秒后触发同步
- 批量发送 dirty_set 中的所有变更
- 同步成功后清空 dirty_set 和 deleted_set
- 失败时保留状态，等待下次重试

---

## 特殊场景处理

### 移动页面（拖拽文件夹）

当用户将整个页面（及其子内容）移动到另一个父页面下时：

**前端操作**:
1. 更新被移动页面的 parent_id
2. 将该页面 ID 加入 dirty_set
3. 更新新父页面和旧父页面的 content_ids

**后端处理**:
```sql
-- 批量更新路径（该页面及所有子孙节点）
UPDATE blocks
SET 
    parent_id = 'uuid-99',
    path = REPLACE(path, '/uuid-1/uuid-2/', '/uuid-99/uuid-2/')
WHERE path LIKE '/uuid-1/uuid-2/%';
```

### 排序变更（拖拽段落）

用户拖拽段落改变顺序时：

**前端操作**:
1. 只更新父节点的 content_ids 数组
2. `dirty_set.add('parent-id')`
3. 被拖拽的段落本身数据不变

**后端处理**:
```sql
-- 只需更新父节点的 content_ids
UPDATE blocks 
SET content_ids = '{"uuid-4", "uuid-3", "uuid-5"}'
WHERE id = 'parent-id';
```

### 软删除恢复（可选功能）

如需支持"撤销删除"功能：

```sql
-- 恢复被软删除的页面及其子内容
UPDATE blocks
SET deleted_at = NULL
WHERE path LIKE '/uuid-2/%' OR id = 'uuid-2';
```

---

## 性能优化关键点

### 1. 物化路径查询优化

```sql
-- 高效：使用索引的 LIKE 查询
SELECT * FROM blocks 
WHERE path LIKE '/uuid-1/%' 
  AND deleted_at IS NULL;

-- 避免：递归 CTE（性能差）
WITH RECURSIVE tree AS (
  SELECT * FROM blocks WHERE parent_id = 'uuid-1'
  UNION ALL
  SELECT b.* FROM blocks b JOIN tree t ON b.parent_id = t.id
)
SELECT * FROM tree;
```

### 2. 批量操作事务

```go
// 伪代码示例
tx := db.Begin()
for _, block := range updatedBlocks {
    tx.Clauses(clause.OnConflict{
        UpdateAll: true,
    }).Create(&block)
}
for _, id := range deletedBlocks {
    tx.Model(&Block{}).Where("id = ?", id).Update("deleted_at", time.Now())
}
tx.Commit()
```

### 3. Redis 缓存策略

**缓存键设计**:
- `page:blocks:{page_id}`: 存储页面的完整 Block 数据
- `page:tree:public`: 存储公开页面的目录树
- `page:tree:admin`: 存储管理端的完整目录树

**缓存失效**:
- 调用 `/api/admin/blocks/sync` 时，清除相关页面缓存
- 修改页面元数据时，清除目录树缓存
- 使用 Redis 的 EXPIRE 设置 1 小时过期时间

---

## 前端集成要点

### 1. UUID 生成

前端必须使用标准的 UUID v4 生成库：
```typescript
import { v4 as uuidv4 } from 'uuid';
const newBlockId = uuidv4();
```

### 2. Path 计算

前端在创建新 Block 时需要计算 path：
```typescript
const parentPath = parentBlock.path; // '/uuid-1/'
const newPath = `${parentPath}${newBlockId}/`; // '/uuid-1/uuid-new/'
```

### 3. Content IDs 维护

父节点的 content_ids 必须严格维护：
```typescript
// 添加子节点
parentBlock.content_ids.push(newChildId);

// 删除子节点
parentBlock.content_ids = parentBlock.content_ids.filter(id => id !== deletedId);

// 重新排序
parentBlock.content_ids = newOrderedIds;
```

### 4. 同步 Payload 构建

```typescript
const syncPayload = {
  updated_blocks: Array.from(dirtySet).map(id => {
    const block = store.getBlock(id);
    return {
      id: block.id,
      parent_id: block.parent_id,
      path: block.path,
      type: block.type,
      content_ids: block.content_ids,
      properties: block.properties
    };
  }),
  deleted_blocks: Array.from(deletedSet)
};
```

---

## 扩展功能接口（可选）

### GET /api/admin/pages/tree

**用途**: 获取特定层级的页面树（性能优化）

**查询参数**:
- `level`: 'root' | 'all' | UUID（root 只返回顶层，UUID 返回该节点的子树）

**响应**:
```json
{
  "code": 200,
  "data": [...]
}
```

### POST /api/admin/blocks/restore

**用途**: 恢复软删除的 Block

**请求体**:
```json
{
  "block_ids": ["uuid-1", "uuid-2"]
}
```

### GET /api/admin/blocks/search

**用途**: 全文搜索（结合 PostgreSQL 全文搜索或 pgvector）

**查询参数**:
- `q`: 搜索关键词
- `type`: 过滤 Block 类型

**响应**:
```json
{
  "code": 200,
  "data": {
    "results": [...],
    "total": 42
  }
}
```
