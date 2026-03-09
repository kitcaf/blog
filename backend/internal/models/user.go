package models

import (
	"time"

	"github.com/google/uuid"
)

// User 用户表：存储所有注册用户的基础账号信息
type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Username     string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"username"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"`
	AvatarURL    string    `gorm:"type:varchar(1024)" json:"avatar_url,omitempty"`
	CreatedAt    time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (u *User) TableName() string {
	return "users"
}

// Workspace 工作空间表（站点）：数据隔离的绝对物理边界
type Workspace struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string    `gorm:"type:varchar(255);not null" json:"name"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null;index" json:"owner_id"` // 移除外键，添加索引
	CreatedAt time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (w *Workspace) TableName() string {
	return "workspaces"
}

// WorkspaceMember 协作成员表：RBAC 权限控制
type WorkspaceMember struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_workspace_user;index" json:"workspace_id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_workspace_user;index" json:"user_id"`
	Role        string    `gorm:"type:varchar(50);not null;default:'viewer'" json:"role"` // owner, admin, editor, viewer
	CreatedAt   time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"created_at"`
}

func (wm *WorkspaceMember) TableName() string {
	return "workspace_members"
}

// APIKey API 密钥表：Headless CMS 的钥匙
type APIKey struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"` // 移除外键，添加索引
	KeyString   string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"key_string"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	CreatedAt   time.Time `gorm:"type:timestamptz;default:CURRENT_TIMESTAMP" json:"created_at"`
}

func (ak *APIKey) TableName() string {
	return "api_keys"
}
