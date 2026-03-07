package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func HealthCheck(db *gorm.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := gin.H{
			"status":    "ok",
			"timestamp": time.Now().Format(time.RFC3339),
		}

		// 检查数据库连接
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			status["database"] = "disconnected"
			status["status"] = "error"
		} else {
			status["database"] = "connected"
		}

		// 检查 Redis 连接
		if rdb != nil {
			ctx := context.Background()
			if err := rdb.Ping(ctx).Err(); err != nil {
				status["redis"] = "disconnected"
			} else {
				status["redis"] = "connected"
			}
		} else {
			status["redis"] = "not configured"
		}

		c.JSON(http.StatusOK, status)
	}
}

func Version(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"version":    "1.0.0",
		"build":      time.Now().Format("20060102"),
		"go_version": "1.21",
	})
}
