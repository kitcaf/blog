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
		&models.BlogCategory{},
		&models.Block{},
		&models.BlockSearchIndex{},
	); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	applyPublishModuleCompatibilitySQL(db)

	// 创建自定义索引（GORM AutoMigrate 不支持的）
	createCustomIndexes(db)

	log.Println("✓ Database connected and migrated successfully")
	return db, nil
}

// applyPublishModuleCompatibilitySQL 兼容历史数据结构。
// 这一步只修正已经明确不再符合新发布语义的数据。
func applyPublishModuleCompatibilitySQL(db *gorm.DB) {
	db.Exec(`
		UPDATE blocks
		SET slug = NULL
		WHERE type = 'folder' AND slug IS NOT NULL
	`)

	db.Exec(`
		UPDATE blocks
		SET category_id = NULL
		WHERE type <> 'page' AND category_id IS NOT NULL
	`)
}

// createCustomIndexes 创建自定义索引
func createCustomIndexes(db *gorm.DB) {
	// ========== Blocks 表索引 ==========

	// 物化路径前缀索引（优化 LIKE '/prefix/%' 查询）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_path_pattern 
		ON blocks USING btree (path varchar_pattern_ops)
	`)

	// 旧索引曾经允许 folder 持有 slug，这与新的发布语义冲突。
	// 这里显式删除并重建，确保线上兼容升级时也能收敛到 page-only 规则。
	db.Exec(`DROP INDEX IF EXISTS idx_blocks_slug_unique`)

	// Slug 唯一索引（仅 page 类型、未删除且非 NULL 的 slug）
	db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_slug_unique
		ON blocks (slug) 
		WHERE slug IS NOT NULL
		  AND deleted_at IS NULL
		  AND type = 'page'
	`)

	// 删除基于历史 JSONB 发布字段的旧索引，统一只认 published_at。
	db.Exec(`DROP INDEX IF EXISTS idx_blocks_page_published`)

	// 已发布页面索引（优化博客前台列表 / 详情查询）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_page_published_at
		ON blocks (published_at DESC)
		WHERE type = 'page'
		  AND deleted_at IS NULL
		  AND published_at IS NOT NULL
	`)

	// 已发布分类页索引（优化公开分类筛选）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_page_category_published_at
		ON blocks (category_id, published_at DESC)
		WHERE type = 'page'
		  AND deleted_at IS NULL
		  AND published_at IS NOT NULL
		  AND category_id IS NOT NULL
	`)

	// 分类归属索引（优化管理端按分类过滤和统计）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_page_category_id
		ON blocks (category_id)
		WHERE type = 'page'
		  AND deleted_at IS NULL
		  AND category_id IS NOT NULL
	`)

	// 分类表索引（保持用户隔离下的稳定排序性能）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blog_categories_user_sort_name
		ON blog_categories (created_by, sort_order ASC, name ASC)
	`)

	// 回收站根项归属索引（优化回收站列表、恢复、永久删除）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_trash_root_active 
		ON blocks (trash_root_id)
		WHERE deleted_at IS NOT NULL AND trash_root_id IS NOT NULL
	`)

	// 回收站列表索引（按用户筛选已删除的根项）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_user_deleted_at 
		ON blocks (created_by, deleted_at DESC)
		WHERE deleted_at IS NOT NULL
	`)

	// 回收站过期清理索引（按根项 deleted_at 扫描过期数据）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_blocks_trash_cleanup_roots
		ON blocks (deleted_at ASC)
		WHERE deleted_at IS NOT NULL
		  AND id = trash_root_id
		  AND type IN ('folder', 'page')
	`)

	// ========== BlockSearchIndex 表索引 ==========

	// 全文搜索 GIN 索引
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_search_gin 
		ON block_search_index USING gin(search_vector)
	`)

	// 发布态部分索引（只索引已发布的内容）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_published 
		ON block_search_index (published_at) 
		WHERE published_at IS NOT NULL
	`)

	// 时间排序索引（降序）
	db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_source_updated_desc 
		ON block_search_index (source_updated_at DESC)
	`)

	log.Println("✓ Custom indexes created")
}
