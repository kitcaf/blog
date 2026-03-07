# 后端开发日志

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

**待完成**
- 数据库迁移脚本
- 单元测试
- Docker 配置
