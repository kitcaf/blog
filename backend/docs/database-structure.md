# 数据库结构设计

## 核心表结构

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

-- Block 表：核心内容块表，支持物化路径的树形结构
CREATE TABLE blocks (
    -- 身份锚点：由前端 Tiptap 生成的 UUID，保证前端与数据库 ID 绝对一致
    id UUID PRIMARY KEY, 

    -- 父级指针：真正的顶层节点：parent_id IS NULL
    parent_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
    
    -- 核心优化：物化路径 (Materialized Path)
    -- 格式: '/{page_id}/{parent_id}/{id}/'
    -- 作用: 破除递归查询诅咒！使用 `path LIKE '/page_id/%'` 即可 O(1) 捞出整篇文章所有嵌套区块
    path VARCHAR(1000) NOT NULL,
    
    -- 区块类型标识：'folder' 'page', 'paragraph', 'imageBlock', 'codeBlock' 等
    type VARCHAR(100) NOT NULL,
    
    -- 第一层子节点排序数组：["uuid-1", "uuid-2"]，拖拽排序时仅更新父节点的此字段, 只是排序作用，不要用来查询避免并发查询错误
    content_ids JSONB DEFAULT '[]'::jsonb,
    
    -- 核心动态数据载体 (无模式设计)
    -- Page块存: {"title": "新文章", "slug": "my-post", "is_published": true, "cover": "url"}
    -- 文本块存: {"content": [{"text": "Hello", "styles": {"bold": true}}], "textAlign": "left"}
    properties JSONB DEFAULT '{}'::jsonb,
    
    slug VARCHAR(255), -- 路由别名 (例如: 'my-first-post') "用户输入的有意义短语" + "一小段随机哈希串/短UUID"
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
CREATE INDEX idx_blocks_parent_id ON blocks(parent_id);
CREATE INDEX idx_blocks_type ON blocks(type);

-- 🚀 物化路径前缀索引：让 LIKE '/page-uuid/%' 查询快如闪电
-- varchar_pattern_ops 是 PG 特有的，专门用于优化 LIKE 'prefix%' 前缀匹配查询
CREATE INDEX idx_blocks_path ON blocks USING btree (path varchar_pattern_ops);

-- 🚀 博客前台拉取文章列表的专属索引 (基于 JSONB 内部字段提取)
-- 让博客前台瞬间查出已发布且 slug 匹配的 Page
CREATE INDEX idx_blocks_page_published ON blocks ((properties->>'is_published')) WHERE type = 'page';
CREATE INDEX idx_blocks_page_slug ON blocks (slug) WHERE type = 'page';

-- 审计字段索引
CREATE INDEX idx_blocks_created_by ON blocks(created_by);
CREATE INDEX idx_blocks_last_edited_by ON blocks(last_edited_by);

-- 时间戳索引
CREATE INDEX idx_blocks_created_at ON blocks(created_at);
CREATE INDEX idx_blocks_published_at ON blocks(published_at);
CREATE INDEX idx_blocks_deleted_at ON blocks(deleted_at);
```

## 设计说明

### 1. 用户表 (users)
- 存储用户基本信息
- 每个用户可以创建多个页面（blocks）
- 通过 created_by 和 last_edited_by 关联到 blocks 表

### 2. Block 表 (blocks)
- **核心设计**：使用物化路径（Materialized Path）实现高效的树形结构查询
- **无工作空间概念**：所有用户的内容都在同一张表中，通过 created_by 区分所有者
- **类型系统**：
  - `page`: 顶层页面/文章
  - `folder`: 文件夹（用于组织页面）
  - `paragraph`, `heading`, `imageBlock`, `codeBlock` 等：内容块

### 3. 物化路径优势
- **O(1) 查询**：通过 `path LIKE '/page_id/%'` 一次查询获取整篇文章的所有嵌套内容
- **无需递归**：避免传统树形结构的递归查询性能问题
- **索引优化**：使用 `varchar_pattern_ops` 优化前缀匹配

### 4. JSONB 灵活存储
- **properties 字段**：存储块的动态属性
  - Page: `{title, slug, is_published, cover, description}`
  - 文本块: `{content: [{text, styles}], textAlign}`
  - 图片块: `{url, caption, width, height}`
- **无需预定义 schema**：适应不同类型块的不同属性需求

### 5. 软删除机制
- 使用 `deleted_at` 字段标记删除
- 保留历史数据，支持恢复和审计
- 增量同步时只标记删除，不物理删除

## 数据隔离

- **用户级隔离**：通过 `created_by` 字段区分内容所有者
- **查询过滤**：所有查询都应该加上用户过滤条件（在应用层实现）
- **权限控制**：在应用层通过 JWT token 中的 user_id 进行权限验证

## 性能优化

1. **索引策略**：
   - 父子关系索引：`idx_blocks_parent_id`
   - 路径前缀索引：`idx_blocks_path`
   - 类型索引：`idx_blocks_type`
   - Slug 索引：`idx_blocks_page_slug`

2. **查询优化**：
   - 使用物化路径避免递归查询
   - JSONB 字段索引支持快速过滤
   - 软删除索引加速过滤已删除内容

3. **缓存策略**：
   - Redis 缓存页面内容（key: `page:blocks:{slug}`）
   - 缓存时间：1小时
   - 更新时自动清除相关缓存
