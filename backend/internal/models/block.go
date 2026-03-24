package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Block 核心内容块表：支持物化路径的树形结构
type Block struct {
	// 身份锚点：由前端 Tiptap 生成的 UUID
	ID uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`

	// 父级指针：树形结构的核心字段
	// - root 类型：parent_id = NULL（每个用户有且仅有一个 root 节点）
	// - 根目录的 folder/page：parent_id = root_id
	// - 其他所有节点：parent_id = 父节点的 id
	ParentID *uuid.UUID `gorm:"type:uuid;index:idx_blocks_parent_id" json:"parent_id,omitempty"`

	// 物化路径：格式 '/{root_id}/{folder_id}/{page_id}/{block_id}/'
	// - root 类型：path = /{root_id}/
	// - 根目录节点：path = /{root_id}/{id}/
	// - 子节点：path = {parent.path}{id}/
	// 使用 `path LIKE '/root_id/%'` 即可 O(1) 查询用户的所有内容
	Path string `gorm:"type:varchar(1000);not null;index:idx_blocks_path,type:btree,option:varchar_pattern_ops" json:"path"`

	// 区块类型：
	// - 'root'：每个用户的根容器（自动创建，维护根目录的 content_ids 排序）
	// - 'folder'：文件夹容器（可嵌套）
	// - 'page'：页面容器（可包含内容块）
	// - 'paragraph', 'heading', 'imageBlock', 'codeBlock' 等：内容块
	Type string `gorm:"type:varchar(100);not null;index" json:"type"`

	// 子节点排序数组：拖拽排序时仅更新父节点的此字段
	ContentIDs json.RawMessage `gorm:"type:jsonb;default:'[]'::jsonb" json:"content_ids"`

	// 核心动态数据载体（无模式设计）
	/**
	容器类 (Folder/Page) 的 Properties 预设：
	// Type: "folder"
	{
	  "title": "前端架构设计",   // 文件夹名称
	  "icon": "📁",            // emoji图标 或 iconfont class
	  "color": "blue"          // 文件夹颜色标识（可选）
	}

	// Type: "page"
	{
	  "title": "2024年React性能优化指南",
	  "icon": "🚀",
	  "cover_url": "https://cdn.example.com/images/react-cover.png", // 顶部封面图
	  "description": "这是一篇关于 React 性能优化的深度好文...",     // 文章摘要 (用于SEO description或列表页预览)
	  "tags": ["React", "Performance", "Frontend"]                   // 文章标签
	}

	注意：slug 和 published_at 是数据库独立字段，不在 properties 中！

	内容块 (Content Blocks) 的 Properties 预设：
	它们的数据结构必须严格契合 Tiptap (ProseMirror) 的 JSON 输出格式

	// Type: "paragraph" 或 "heading"
	{
	  "level": 2,              // 仅 heading 类型有此字段 (1=H1, 2=H2, 3=H3)
	  "textAlign": "left",     // 对齐方式: left, center, right
	  "content": [             // Tiptap 原生的 content 数组
	    {
	      "type": "text",
	      "text": "Hello "
	    },
	    {
	      "type": "text",
	      "text": "World",
	      "marks": [
	        { "type": "bold" },
	        { "type": "textStyle", "attrs": { "color": "red" } }
	      ]
	    }
	  ]
	}

	// Type: "code"
	{
	  "language": "typescript", // 语法高亮语言
	  "content": [
	    { "type": "text", "text": "const x = 1;" }
	  ]
	}

	// Type: "image"
	{
	  "url": "https://example.com/image.png",
	  "caption": "图片说明",
	  "width": 100,            // 宽度百分比
	  "alignment": "center"    // left, center, right, full
	}
	**/
	Properties json.RawMessage `gorm:"type:jsonb;default:'{}'::jsonb" json:"properties"`

	// 路由别名（仅 Page 类型使用，必须全局唯一）
	// 格式：用户输入的有意义短语 + 短随机哈希（例如：my-first-post-a3f2）
	// 用于 SEO 友好的 URL：/blog/my-first-post-a3f2
	// 使用部分唯一索引：只对非 NULL 值生效，避免多个 NULL 值冲突
	// 只需要修改这里：在 where 条件里补上 deleted_at IS NULL
	Slug *string `gorm:"type:varchar(255);uniqueIndex:idx_blocks_slug_unique,where:deleted_at IS NULL AND slug IS NOT NULL" json:"slug,omitempty"`

	// 发布时间控制：NULL 表示草稿，非 NULL 表示已发布
	PublishedAt *time.Time `gorm:"type:timestamptz;index" json:"published_at,omitempty"`

	// 审计字段：记录追踪
	CreatedBy    *uuid.UUID `gorm:"type:uuid;index" json:"created_by,omitempty"`
	LastEditedBy *uuid.UUID `gorm:"type:uuid;index" json:"last_edited_by,omitempty"`

	// 回收站元数据：
	// - trash_root_id：当前软删记录所属的回收站根项
	// - deleted_parent_id：根项删除前的父节点，用于恢复挂回原位置
	// - deleted_order：根项删除前在父节点 content_ids 中的位置
	// - deleted_by：最近一次删除操作者
	TrashRootID     *uuid.UUID `gorm:"type:uuid;index" json:"trash_root_id,omitempty"`
	DeletedParentID *uuid.UUID `gorm:"type:uuid" json:"deleted_parent_id,omitempty"`
	DeletedOrder    *int       `json:"deleted_order,omitempty"`
	DeletedBy       *uuid.UUID `gorm:"type:uuid;index" json:"deleted_by,omitempty"`

	// 时间戳与软删除
	CreatedAt time.Time  `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP;index" json:"created_at"`
	UpdatedAt time.Time  `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt *time.Time `gorm:"type:timestamptz;index" json:"deleted_at,omitempty"`
}

// PageTreeNode 侧边栏目录树节点结构
type PageTreeNode struct {
	ID         string          `json:"id"`
	ParentID   *string         `json:"parent_id,omitempty"`
	Type       string          `json:"type"`
	Title      string          `json:"title"`
	Icon       string          `json:"icon"`
	ContentIDs []string        `json:"content_ids"`
	Children   []*PageTreeNode `json:"children"` // 总是返回数组让前端好处理
}

func (b *Block) TableName() string {
	return "blocks"
}
