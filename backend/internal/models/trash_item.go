package models

import (
	"time"

	"github.com/google/uuid"
)

// TrashItem 回收站可见项，只暴露 folder/page 根节点。
type TrashItem struct {
	ID               uuid.UUID  `json:"id"`
	Type             string     `json:"type"`
	Title            string     `json:"title"`
	Icon             string     `json:"icon"`
	DeletedAt        time.Time  `json:"deleted_at"`
	DeletedBy        *uuid.UUID `json:"deleted_by,omitempty"`
	DeletedParentID  *uuid.UUID `json:"deleted_parent_id,omitempty"`
	DeletedOrder     *int       `json:"deleted_order,omitempty"`
	ChildFolderCount int64      `json:"child_folder_count"`
	ChildPageCount   int64      `json:"child_page_count"`
}
