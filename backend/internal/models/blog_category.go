package models

import (
	"time"

	"github.com/google/uuid"
)

// BlogCategory 博客文章分类。
// 分类与用户隔离，避免未来多用户场景下的命名和 slug 冲突。
type BlogCategory struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`

	CreatedBy *uuid.UUID `gorm:"type:uuid;not null;index:idx_blog_categories_user_sort,priority:1;uniqueIndex:idx_blog_categories_user_name,priority:1;uniqueIndex:idx_blog_categories_user_slug,priority:1" json:"created_by,omitempty"`

	Name        string  `gorm:"type:varchar(100);not null;uniqueIndex:idx_blog_categories_user_name,priority:2" json:"name"`
	Slug        string  `gorm:"type:varchar(100);not null;uniqueIndex:idx_blog_categories_user_slug,priority:2" json:"slug"`
	Description *string `gorm:"type:text" json:"description,omitempty"`
	SortOrder   int     `gorm:"not null;default:0;index:idx_blog_categories_user_sort,priority:2" json:"sort_order"`

	CreatedAt time.Time `gorm:"type:timestamptz;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time `gorm:"type:timestamptz;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (BlogCategory) TableName() string {
	return "blog_categories"
}
