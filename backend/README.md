# Blog Backend

基于 Go + Gin + PostgreSQL + Redis 的博客后端服务。

## 技术栈

- Go 1.21+
- Gin Web Framework
- PostgreSQL 15+ (with pgvector)
- Redis 7+
- GORM
- JWT Authentication

## 项目结构

```
backend/
├── cmd/                    # 命令行工具
├── internal/              # 内部代码
│   ├── config/           # 配置管理
│   ├── database/         # 数据库连接
│   ├── handlers/         # HTTP 处理器
│   ├── middleware/       # 中间件
│   ├── models/           # 数据模型
│   ├── repository/       # 数据访问层
│   ├── router/           # 路由配置
│   └── services/         # 业务逻辑层
├── pkg/                   # 公共包
│   ├── logger/           # 日志
│   └── response/         # 响应格式
├── docs/                  # 文档
├── main.go               # 入口文件
├── go.mod                # 依赖管理
└── .env.example          # 环境变量示例
```

## 快速开始

### 1. 安装依赖

```bash
go mod download
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和 Redis 连接信息
```

### 3. 启动 PostgreSQL 和 Redis

```bash
# 使用 Docker Compose（推荐）
docker-compose up -d

# 或手动启动
```

### 4. 运行服务

```bash
go run main.go
```

服务将在 `http://localhost:8080` 启动。

## API 文档

详见 `docs/api-structure.md`

### 主要接口

- `POST /api/admin/auth/login` - 管理员登录
- `GET /api/admin/auth/me` - 获取当前用户信息
- `GET /api/admin/pages` - 获取页面列表
- `POST /api/admin/blocks/sync` - 同步 Block 数据
- `GET /api/public/pages` - 获取公开页面
- `GET /api/public/pages/:slug/blocks` - 获取页面内容

## 开发

### 热重载

```bash
# 安装 air
go install github.com/cosmtrek/air@latest

# 运行
air
```

### 数据库迁移

GORM 会自动迁移表结构。如需手动迁移：

```bash
# 创建迁移文件
migrate create -ext sql -dir migrations -seq init

# 执行迁移
migrate -path migrations -database "postgresql://..." up
```

## 部署

### Docker

```bash
docker build -t blog-backend .
docker run -p 8080:8080 --env-file .env blog-backend
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 8080 |
| GIN_MODE | 运行模式 | debug |
| DB_HOST | 数据库主机 | localhost |
| DB_PORT | 数据库端口 | 5432 |
| JWT_SECRET | JWT 密钥 | - |
| REDIS_HOST | Redis 主机 | localhost |

详见 `.env.example`
