package database

import (
	"context"
	"fmt"
	"log"

	"blog-backend/internal/config"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis 连接 Redis 缓存服务器
// 如果连接失败，返回 nil（应用可以在无缓存模式下运行）
func ConnectRedis(cfg *config.Config) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.Redis.Host, cfg.Redis.Port),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})

	// 测试连接
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠ Warning: Failed to connect to Redis: %v (running without cache)", err)
		return nil
	}

	log.Println("✓ Redis connected successfully")
	return rdb
}
