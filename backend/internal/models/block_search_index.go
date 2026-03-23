package models

import (
	"time"

	"github.com/google/uuid"
)

// BlockSearchIndex 检索索引表（blocks 表的影子表）
// 设计理念：
// 1. 极简设计：只保留检索必需的字段
// 2. 无冗余：Page 信息在查询时实时 JOIN
// 3. 无软删除：原表删除则直接 DELETE
// 4. 无状态字段：Embedding 异步生成，查询时降级处理
type BlockSearchIndex struct {
	// ============ 主键 ============
	BlockID uuid.UUID `gorm:"type:uuid;primaryKey" json:"block_id"`

	// ============ 核心关联字段 ============
	PageID uuid.UUID `gorm:"type:uuid;not null;index:idx_page_user,priority:1" json:"page_id"` // 所属文章 ID
	UserID uuid.UUID `gorm:"type:uuid;not null;index:idx_page_user,priority:2;index:idx_search_user" json:"user_id"` // 所属用户（权限过滤）

	// ============ Block 元信息 ============
	BlockType  string `gorm:"type:varchar(50);not null" json:"block_type"` // Block 类型（paragraph/heading/list/code）
	BlockOrder int    `gorm:"not null;default:0" json:"block_order"`       // 在页面中的顺序（用于排序展示）

	// ============ 检索内容 ============
	Content string `gorm:"type:text;not null" json:"content"` // 提取的纯文本

	// ============ 检索索引 ============
	// SearchVector 全文搜索向量（PostgreSQL tsvector）
	// 注意：GORM 不直接支持 tsvector 类型，需要使用 string 类型 + 自定义 SQL
	SearchVector string `gorm:"type:tsvector" json:"-"`

	// Embedding 语义向量（pgvector，暂不实现）
	// 注意：需要安装 pgvector 扩展和对应的 Go 库
	// Embedding []float32 `gorm:"type:vector(1536)" json:"-"`

	// ============ 同步字段 ============
	SourceUpdatedAt time.Time  `gorm:"type:timestamptz;not null;index:idx_source_updated" json:"source_updated_at"` // 来自 blocks.updated_at（用于排序）
	PublishedAt     *time.Time `gorm:"type:timestamptz;index:idx_published" json:"published_at,omitempty"`          // 来自 blocks.published_at（用于发布态过滤）

	// ============ 时间戳 ============
	CreatedAt time.Time `gorm:"type:timestamptz;not null;autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null;autoUpdateTime" json:"updated_at"`
}

func (BlockSearchIndex) TableName() string {
	return "block_search_index"
}

// PageSearchResult Page 搜索结果（聚合后的结果）
type PageSearchResult struct {
	PageID    uuid.UUID `json:"page_id"`
	PageTitle string    `json:"page_title"`
	PageIcon  string    `json:"page_icon"`
	PagePath  string    `json:"page_path"`

	// 匹配信息
	MaxScore   float64   `json:"max_score"`   // 最高分 Block 的分数
	MatchCount int       `json:"match_count"` // 匹配的 Block 数量
	PageScore  float64   `json:"page_score"`  // Page 综合分数
	UpdatedAt  time.Time `json:"updated_at"`  // 最后更新时间

	// 代表 Block（最高分的 Block）
	RepresentativeBlock *BlockMatch `json:"representative_block,omitempty"`

	// Top 3 匹配的 Block（用于预览）
	TopBlocks []*BlockMatch `json:"top_blocks,omitempty"`
}

// BlockMatch 匹配的 Block 信息
type BlockMatch struct {
	BlockID    uuid.UUID `json:"block_id"`
	BlockType  string    `json:"block_type"`
	BlockOrder int       `json:"block_order"`
	Content    string    `json:"content"`
	Score      float64   `json:"score"`
	Highlights []string  `json:"highlights,omitempty"` // 高亮的关键词
}

