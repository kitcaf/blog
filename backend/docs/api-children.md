# 侧边栏目录树 API 文档

## 接口信息

```
GET /api/admin/workspaces/:workspace_id/blocks/children
```

## 功能说明

获取某个节点的直接子节点（第一层），用于侧边栏目录树的懒加载。

## 请求参数

### 路径参数
- `workspace_id` (必填): 工作空间 ID

### 查询参数
- `parent_id` (可选): 父节点 ID
  - 不传或传 `null`: 返回根节点（parent_id IS NULL）
  - 传具体 UUID: 返回该节点的直接子节点

## 请求示例

### 1. 获取根节点
```bash
GET /api/admin/workspaces/uuid-123/blocks/children
```

### 2. 获取某个文件夹的子节点
```bash
GET /api/admin/workspaces/uuid-123/blocks/children?parent_id=folder-uuid
```

## 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid-1",
      "workspace_id": "workspace-uuid",
      "parent_id": null,
      "type": "folder",
      "path": "/uuid-1/",
      "content_ids": ["page-1", "page-2"],
      "properties": {
        "title": "项目文档",
        "icon": "📁"
      },
      "created_at": "2024-03-07T10:00:00Z",
      "updated_at": "2024-03-07T10:00:00Z"
    },
    {
      "id": "uuid-2",
      "workspace_id": "workspace-uuid",
      "parent_id": null,
      "type": "page",
      "path": "/uuid-2/",
      "content_ids": [],
      "properties": {
        "title": "快速开始",
        "icon": "📝",
        "is_published": true
      },
      "published_at": "2024-03-07T10:00:00Z",
      "created_at": "2024-03-07T10:00:00Z",
      "updated_at": "2024-03-07T10:00:00Z"
    }
  ]
}
```

## 数据库查询

```sql
-- 查询根节点
SELECT id, parent_id, type, properties, content_ids, path
FROM blocks
WHERE workspace_id = $1
  AND parent_id IS NULL
  AND type IN ('page', 'folder')
  AND deleted_at IS NULL
ORDER BY created_at ASC;

-- 查询某个节点的子节点
SELECT id, parent_id, type, properties, content_ids, path
FROM blocks
WHERE workspace_id = $1
  AND parent_id = $2
  AND type IN ('page', 'folder')
  AND deleted_at IS NULL
ORDER BY created_at ASC;
```

## 前端处理

1. 接收无序的子节点数组
2. 如果父节点有 `content_ids`，根据其顺序排序
3. 如果没有 `content_ids`，按 `created_at` 排序
4. 构建树形结构用于渲染

## 性能优化

- 利用 `(workspace_id, parent_id, deleted_at)` 复合索引
- 查询速度 O(1)
- 支持懒加载，避免一次性加载大量数据
- 返回数据量小，网络传输快

## 使用场景

- 侧边栏初始加载：获取根节点
- 点击文件夹展开：获取该文件夹的子节点
- 支持无限层级嵌套
