package models

import (
	"time"

	"github.com/google/uuid"
)

// RefreshToken Refresh Token 模型（存储在 Redis 中）
type RefreshToken struct {
	Token     string    `json:"token"`      // Refresh Token 字符串
	UserID    uuid.UUID `json:"user_id"`    // 用户 ID
	ExpiresAt time.Time `json:"expires_at"` // 过期时间
	CreatedAt time.Time `json:"created_at"` // 创建时间
}
