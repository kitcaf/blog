```sql
-- 用户表：存储所有注册用户的基础账号信息
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(1024),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 工作空间表（站点）：数据隔离的绝对物理边界
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,             -- 例如: "前端架构师的客栈"
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- 空间的所有者
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 协作成员表：RBAC 权限控制，为未来多人协同编辑铺路
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer', -- 'owner', 'admin', 'editor', 'viewer'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, user_id)           -- 确保同一个用户在一个空间只有一个角色
);

-- API 密钥表：Headless CMS 的钥匙，供用户的前端博客无状态调用
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key_string VARCHAR(100) UNIQUE NOT NULL, -- 例如: "sk_live_abc123..."
    name VARCHAR(255) NOT NULL,              -- 例如: "我的 Next.js 博客生产环境"
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE blocks (
    -- 身份锚点：由前端 Tiptap 生成的 UUID，保证前端与数据库 ID 绝对一致
    id UUID PRIMARY KEY, 

    -- 数据隔离墙：所有查询必须带上它，防止租户数据越权
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- 父级指针：顶层文章(Page)的 parent_id 为 NULL
    parent_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
    
    -- 🚀 核心优化：物化路径 (Materialized Path)
    -- 格式: '/{page_id}/{parent_id}/{id}/'
    -- 作用: 破除递归查询诅咒！使用 `path LIKE '/page_id/%'` 即可 O(1) 捞出整篇文章所有嵌套区块
    path VARCHAR(1000) NOT NULL,
    
    -- 区块类型标识：'page', 'paragraph', 'imageBlock', 'codeBlock' 等
    type VARCHAR(100) NOT NULL,
    
    -- 子节点排序数组：["uuid-1", "uuid-2"]，拖拽排序时仅更新父节点的此字段
    content_ids JSONB DEFAULT '[]'::jsonb,
    
    -- 🚀 核心动态数据载体 (无模式设计)
    -- Page块存: {"title": "新文章", "slug": "my-post", "is_published": true, "cover": "url"}
    -- 文本块存: {"content": [{"text": "Hello", "styles": {"bold": true}}], "textAlign": "left"}
    properties JSONB DEFAULT '{}'::jsonb,
    
    slug VARCHAR(255), -- 路由别名 (例如: 'my-first-post') “用户输入的有意义短语” + “一小段随机哈希串/短UUID”
    published_at TIMESTAMPTZ, -- 发布时间控制：NULL 表示草稿，非 NULL 表示已发布！

    -- 审计字段：记录追踪，支撑未来的协同冲突解决
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- 时间戳与软删除
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ -- 增量同步引擎的灵魂：软删除标志，绝不物理删除，方便历史回溯
);

-- 高频基础查询索引
CREATE INDEX idx_blocks_workspace_id ON blocks(workspace_id);
CREATE INDEX idx_blocks_parent_id ON blocks(parent_id);

-- 🚀 物化路径前缀索引：让 LIKE '/page-uuid/%' 查询快如闪电
-- varchar_pattern_ops 是 PG 特有的，专门用于优化 LIKE 'prefix%' 前缀匹配查询
CREATE INDEX idx_blocks_path ON blocks USING btree (path varchar_pattern_ops);

-- 🚀 博客前台拉取文章列表的专属索引 (基于 JSONB 内部字段提取)
-- 让博客前台瞬间查出某个 Workspace 下已发布且 slug 匹配的 Page
CREATE INDEX idx_blocks_page_published ON blocks ((properties->>'is_published')) WHERE type = 'page';
CREATE INDEX idx_blocks_page_slug ON blocks ((properties->>'slug')) WHERE type = 'page';
```