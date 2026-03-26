package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// BlogCategoryWithCount 分类信息及其关联文章数量。
type BlogCategoryWithCount struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description *string   `json:"description,omitempty"`
	SortOrder   int       `json:"sort_order"`
	PostCount   int64     `json:"post_count"`
}

// PublicPostCategory 公开文章接口中的分类信息。
type PublicPostCategory struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// PublicPostSummary 公开文章列表项。
type PublicPostSummary struct {
	ID          uuid.UUID           `json:"id"`
	Title       string              `json:"title"`
	Slug        string              `json:"slug"`
	Description *string             `json:"description,omitempty"`
	CoverURL    *string             `json:"cover_url,omitempty"`
	Tags        []string            `json:"tags"`
	Category    *PublicPostCategory `json:"category,omitempty"`
	PublishedAt time.Time           `json:"published_at"`
}

// PublicPostBlock 公开文章详情中的内容块。
// 公开端只暴露渲染所需字段，避免泄露内部组织结构。
type PublicPostBlock struct {
	ID         uuid.UUID       `json:"id"`
	Type       string          `json:"type"`
	Properties json.RawMessage `json:"properties"`
}

// PublicPostDetail 公开文章详情。
type PublicPostDetail struct {
	ID          uuid.UUID           `json:"id"`
	Title       string              `json:"title"`
	Slug        string              `json:"slug"`
	Description *string             `json:"description,omitempty"`
	CoverURL    *string             `json:"cover_url,omitempty"`
	Tags        []string            `json:"tags"`
	Category    *PublicPostCategory `json:"category,omitempty"`
	PublishedAt time.Time           `json:"published_at"`
	Blocks      []PublicPostBlock   `json:"blocks"`
}

// PublicPostsPage 公开文章列表分页结构。
type PublicPostsPage struct {
	Posts []PublicPostSummary `json:"posts"`
	Total int64               `json:"total"`
	Page  int                 `json:"page"`
	Limit int                 `json:"limit"`
}

// PublishPageResult 管理端单篇发布响应。
type PublishPageResult struct {
	PageID      uuid.UUID `json:"page_id"`
	Slug        string    `json:"slug"`
	PublishedAt time.Time `json:"published_at"`
	PreviewURL  string    `json:"preview_url"`
}

// PublishSubtreeResult 管理端批量发布响应。
type PublishSubtreeResult struct {
	RootID          uuid.UUID `json:"root_id"`
	PublishedCount  int       `json:"published_count"`
	SkippedCount    int       `json:"skipped_count"`
	EffectiveTagSet []string  `json:"effective_tags,omitempty"`
}
