# 后端开发日志

## v0.0.2 (2024-03-07)

### 完成内容

**数据库重构**
- 新增 workspaces 表（多租户隔离）
- 新增 workspace_members 表（RBAC 权限）
- 新增 api_keys 表（Headless CMS）
- blocks 表增加 workspace_id 字段

**错误码系统**
- 统一错误码定义（HTTP + 业务错误码）
- 错误码文档
- 统一错误处理

**功能增强**
- 工作空间管理 CRUD
- 用户注册功能
- Workspace 权限中间件
- 数据隔离（所有查询带 workspace_id）

**文档**
- 错误码文档
- Docker Compose 配置
- 数据库连接测试脚本

## v0.0.1 (2024-03-06)

### 完成内容

**文档**
- 需求文档、技术栈文档、API 结构文档、数据库结构文档

**技术栈**
- Go + Gin + PostgreSQL (pgvector) + Redis + GORM + JWT

**数据库**
- blocks 表（物化路径 + 邻接表 + content_ids）
- users 表
- 软删除 + JSONB 属性

**代码结构**
- 完成 MVC 分层架构（models, repository, services, handlers）
- JWT 认证中间件
- 统一响应格式
- 日志系统

**功能**
- 用户登录认证
- 页面 CRUD
- Block 增量同步
- 公开访问接口
- Redis 缓存
- 健康检查
