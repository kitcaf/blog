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

	// 父级指针：顶层文章(Page)的 parent_id 为 NULL
	ParentID *uuid.UUID `gorm:"type:uuid;index:idx_blocks_parent_id" json:"parent_id,omitempty"`

	// 物化路径：格式 '/{page_id}/{parent_id}/{id}/'
	// 使用 `path LIKE '/page_id/%'` 即可 O(1) 捞出整篇文章所有嵌套区块
	Path string `gorm:"type:varchar(1000);not null;index:idx_blocks_path,type:btree,option:varchar_pattern_ops" json:"path"`

	// 区块类型：'page', 'paragraph', 'heading', 'imageBlock', 'codeBlock' 等
	Type string `gorm:"type:varchar(100);not null;index" json:"type"`

	// 子节点排序数组：拖拽排序时仅更新父节点的此字段
	ContentIDs json.RawMessage `gorm:"type:jsonb;default:'[]'::jsonb" json:"content_ids"`

	// 核心动态数据载体（无模式设计）
	/**
			比如：
			// Type: "folder"
			{
			  "title": "前端架构设计",   // 文件夹名称
			  "icon": "📁",            // emoji图标 或 iconfont class
			  "color": "blue",         // 文件夹颜色标识（可选）
			  "is_expanded": false     // 侧边栏是否默认展开（前端UI状态，可选存库）
			}
			  // Type: "page"
		{
		  "title": "2024年React性能优化指南",
		  "icon": "🚀",
		  "cover_url": "https://cdn.example.com/images/react-cover.png", // 顶部封面图
		  "description": "这是一篇关于 React 性能优化的深度好文...",     // 文章摘要 (用于SEO description或列表页预览)
		  "tags": ["React", "Performance", "Frontend"]                   // 文章标签
		}
	内容块 (Content Blocks) 的 Properties 预设：它们的数据结构必须严格契合 Tiptap (ProseMirror) 的 JSON 输出格式
		  // Type: "paragraph" 或 "heading"
	{
	  "level": 2, // 仅 heading 类型有此字段 (H1, H2, H3)
	  "textAlign": "left", // 对齐方式: left, center, right
	  "content": [         // Tiptap 原生的 content 数组
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
			**/
	Properties json.RawMessage `gorm:"type:jsonb;default:'{}'::jsonb" json:"properties"`

	// 路由别名（仅 Page 类型使用，必须全局唯一）
	// 格式：用户输入的有意义短语 + 短随机哈希（例如：my-first-post-a3f2）
	// 用于 SEO 友好的 URL：/blog/my-first-post-a3f2
	Slug *string `gorm:"type:varchar(255);uniqueIndex:idx_blocks_slug_unique" json:"slug,omitempty"`

	// 发布时间控制：NULL 表示草稿，非 NULL 表示已发布
	PublishedAt *time.Time `gorm:"type:timestamptz;index" json:"published_at,omitempty"`

	// 审计字段：记录追踪
	CreatedBy    *uuid.UUID `gorm:"type:uuid;index" json:"created_by,omitempty"`
	LastEditedBy *uuid.UUID `gorm:"type:uuid;index" json:"last_edited_by,omitempty"`

	// 时间戳与软删除
	CreatedAt time.Time  `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP;index" json:"created_at"`
	UpdatedAt time.Time  `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt *time.Time `gorm:"type:timestamptz;index" json:"deleted_at,omitempty"`
}

func (b *Block) TableName() string {
	return "blocks"
}
