package main

import (
	"log"

	"blog-backend/internal/config"
	"blog-backend/internal/database"
	"blog-backend/internal/router"
	"blog-backend/pkg/logger"
)

func main() {
	log.Println("🚀 Starting Blog Backend Server...")

	// 1. 加载配置
	cfg := config.Load()

	// 2. 初始化日志系统
	logger.Init(cfg.Server.Mode)
	defer logger.Sync()

	// 3. 连接 PostgreSQL 数据库
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}

	// 4. 连接 Redis 缓存（可选）
	rdb := database.ConnectRedis(cfg)

	// 5. 初始化路由
	r := router.Setup(cfg, db, rdb)

	// 6. 启动 HTTP 服务器
	addr := ":" + cfg.Server.Port
	logger.Info("🌐 Server starting on http://localhost" + addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
