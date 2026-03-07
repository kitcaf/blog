package config

import (
	"log"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config 应用配置结构
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	JWT      JWTConfig
	CORS     CORSConfig
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port string // 服务端口，默认 8080
	Mode string // 运行模式：debug, release
}

// DatabaseConfig PostgreSQL 数据库配置
type DatabaseConfig struct {
	Host     string // 数据库主机地址
	Port     string // 数据库端口
	User     string // 数据库用户名
	Password string // 数据库密码
	DBName   string // 数据库名称
	SSLMode  string // SSL 模式：disable, require, verify-ca, verify-full
}

// RedisConfig Redis 缓存配置
type RedisConfig struct {
	Host     string // Redis 主机地址
	Port     string // Redis 端口
	Password string // Redis 密码（可选）
	DB       int    // Redis 数据库编号（0-15）
}

// JWTConfig JWT 认证配置
type JWTConfig struct {
	Secret              string // JWT 签名密钥（生产环境必须修改）
	AccessExpireMinutes int    // Access Token 过期时间（分钟）
	RefreshExpireDays   int    // Refresh Token 过期时间（天）
}

// CORSConfig 跨域配置
type CORSConfig struct {
	Origins []string // 允许的跨域源列表
}

// Load 加载配置文件和环境变量
func Load() *Config {
	// 尝试加载 .env 文件（开发环境）
	_ = godotenv.Load()

	// 自动读取环境变量
	viper.AutomaticEnv()

	cfg := &Config{
		Server: ServerConfig{
			Port: getEnv("PORT", "8080"),
			Mode: getEnv("GIN_MODE", "debug"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			DBName:   getEnv("DB_NAME", "blog_db"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			Secret:              getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
			AccessExpireMinutes: getEnvInt("JWT_ACCESS_EXPIRE_MINUTES", 30),
			RefreshExpireDays:   getEnvInt("JWT_REFRESH_EXPIRE_DAYS", 7),
		},
		CORS: CORSConfig{
			Origins: strings.Split(getEnv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174"), ","),
		},
	}

	log.Printf("✓ Config loaded: Server will run on port %s in %s mode", cfg.Server.Port, cfg.Server.Mode)
	return cfg
}

// getEnv 获取字符串类型的环境变量
func getEnv(key, defaultValue string) string {
	viper.SetDefault(key, defaultValue)
	return viper.GetString(key)
}

// getEnvInt 获取整数类型的环境变量
func getEnvInt(key string, defaultValue int) int {
	viper.SetDefault(key, defaultValue)
	return viper.GetInt(key)
}
