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
