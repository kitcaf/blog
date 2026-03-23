package testutil

import (
	"blog-backend/internal/config"
	"blog-backend/internal/models"
	"os"
	"path/filepath"
	"testing"

	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// SetupTestDB 初始化测试数据库
func SetupTestDB(t *testing.T) *gorm.DB {
	// 获取项目根目录（backend 目录）
	// 测试文件在 backend/test/xxx，需要回到 backend 目录
	rootDir, _ := filepath.Abs("../..")
	envTestPath := filepath.Join(rootDir, ".env.test")
	envPath := filepath.Join(rootDir, ".env")

	// 优先加载 .env.test，如果不存在则加载 .env
	if err := godotenv.Load(envTestPath); err != nil {
		// .env.test 不存在，尝试加载 .env
		if err := godotenv.Load(envPath); err != nil {
			t.Logf("Warning: Could not load .env.test or .env: %v", err)
		}
	}

	// 加载配置
	cfg := config.Load()

	// 使用测试数据库
	dsn := "host=" + cfg.Database.Host +
		" user=" + cfg.Database.User +
		" password=" + cfg.Database.Password +
		" dbname=" + cfg.Test.DBName +
		" port=" + cfg.Database.Port +
		" sslmode=" + cfg.Database.SSLMode +
		" TimeZone=Asia/Shanghai"

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)

	// 自动迁移
	err = db.AutoMigrate(&models.Block{}, &models.BlockSearchIndex{})
	require.NoError(t, err)

	// 创建 GIN 索引
	db.Exec("CREATE INDEX IF NOT EXISTS idx_search_vector ON block_search_index USING gin(search_vector)")

	return db
}

// CleanupTestDB 清理测试数据
func CleanupTestDB(t *testing.T, db *gorm.DB) {
	db.Exec("TRUNCATE TABLE block_search_index CASCADE")
	db.Exec("TRUNCATE TABLE blocks CASCADE")
}

// SetTestEnv 设置测试环境变量（可选，用于覆盖特定配置）
func SetTestEnv(key, value string) {
	os.Setenv(key, value)
}
