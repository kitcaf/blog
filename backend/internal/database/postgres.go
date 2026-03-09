package database

import (
	"blog-backend/internal/config"
	"blog-backend/internal/models"
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect 连接 PostgreSQL 数据库并执行自动迁移
func Connect(cfg *config.Config) (*gorm.DB, error) {
	// 构建 PostgreSQL 连接字符串
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.DBName,
		cfg.Database.SSLMode,
	)

	// 配置 GORM 日志级别
	logLevel := logger.Info
	if cfg.Server.Mode == "release" {
		logLevel = logger.Error
	}

	// 连接数据库
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// 启用 UUID 扩展
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"").Error; err != nil {
		log.Printf("Warning: Failed to create uuid-ossp extension: %v", err)
	}

	// 自动迁移表结构
	if err := db.AutoMigrate(
		&models.User{},
		&models.Block{},
	); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	// 创建自定义索引（GORM AutoMigrate 不支持的）
	createCustomIndexes(db)

	log.Println("✓ Database connected and migrated successfully")
	return db, nil
}

// createCustomIndexes 创建自定义索引
func createCustomIndexes(db *gorm.DB) {
	// 物化路径前缀索引（优化 LIKE '/prefix/%' 查询）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_path_pattern 
		ON blocks USING btree (path varchar_pattern_ops)
	`)

	// 已发布页面索引（优化博客前台查询）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_page_published 
		ON blocks ((properties->>'is_published')) 
		WHERE type = 'page'
	`)

	log.Println("✓ Custom indexes created")
}
