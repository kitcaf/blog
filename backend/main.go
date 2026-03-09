package main

import (
	"log"

	"blog-backend/internal/config"
	"blog-backend/internal/database"
	"blog-backend/internal/router"
)

func main() {
	log.Println("🚀 Starting Blog Backend Server...")

	// 1. 加载配置
	cfg := config.Load()

	// 2. 连接 PostgreSQL 数据库
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}

	// 3. 连接 Redis 缓存（可选）
	rdb := database.ConnectRedis(cfg)

	// 4. 初始化路由
	r := router.Setup(cfg, db, rdb)

	// 5. 启动 HTTP 服务器
	addr := ":" + cfg.Server.Port
	log.Printf("🌐 Server starting on http://localhost%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
