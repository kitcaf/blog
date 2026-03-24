package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"blog-backend/internal/config"
	"blog-backend/internal/database"
	blockrepo "blog-backend/internal/repository/block"
	"blog-backend/internal/router"
	"blog-backend/internal/services"
	"blog-backend/pkg/errors"
)

func main() {
	log.Println("Starting Blog Backend Server...")

	// 1. 加载配置
	cfg := config.Load()

	// 2. 初始化错误日志系统
	if err := errors.InitErrorLogger("logs"); err != nil {
		log.Fatalf("Failed to initialize error logger: %v", err)
	}
	log.Println("Error logger initialized (logs/error.log)")

	// 3. 连接 PostgreSQL 数据库
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// 4. 连接 Redis 缓存（可选）
	rdb := database.ConnectRedis(cfg)

	// 5. 启动搜索索引器（后台 Worker）
	var searchIndexer *services.SearchIndexer
	if rdb != nil {
		searchIndexer = services.NewSearchIndexer(rdb, db)
		if err := searchIndexer.Start(); err != nil {
			log.Printf("Failed to start search indexer: %v", err)
		}
	} else {
		log.Println("Redis not available, search indexer disabled")
	}

	// 6. 启动回收站自动清理任务
	trashCleanup := services.NewTrashCleanupService(blockrepo.NewBlockRepository(db))
	trashCleanup.Start()

	// 7. 初始化路由（传入 searchIndexer）
	r := router.Setup(cfg, db, rdb, searchIndexer)

	// 8. 优雅关闭处理
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Println("\n Shutting down gracefully...")
		if searchIndexer != nil {
			searchIndexer.Stop()
		}
		trashCleanup.Stop()
		os.Exit(0)
	}()

	// 9. 启动 HTTP 服务器
	addr := ":" + cfg.Server.Port
	log.Printf("🌐 Server starting on http://localhost%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
