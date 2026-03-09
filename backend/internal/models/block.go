package models

import (
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
	ContentIDs []byte `gorm:"type:jsonb;default:'[]'::jsonb" json:"content_ids"`

	// 核心动态数据载体（无模式设计）
	// Page块存: {"title": "新文章", "slug": "my-post", "is_published": true}
	// 文本块存: {"content": [{"text": "Hello", "styles": {"bold": true}}]}
	Properties []byte `gorm:"type:jsonb;default:'{}'::jsonb" json:"properties"`

	// 路由别名（仅 Page 类型使用）
	Slug *string `gorm:"type:varchar(255);index:idx_blocks_page_slug" json:"slug,omitempty"`

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
