# API 文档

## 基础信息

- Base URL: `http://localhost:8080/api`
- 认证方式: Bearer Token (JWT)
- 响应格式: JSON

## 响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 错误响应
```json
{
  "code": 1001,
  "message": "用户名或密码错误"
}
```

## 公开接口

### 1. 获取已发布页面列表
```
GET /public/pages
```

**响应示例：**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "uuid",
      "type": "page",
      "slug": "my-first-post",
      "properties": {
        "title": "我的第一篇文章",
        "is_published": true
      },
      "published_at": "2026-03-09T10:00:00Z",
      "created_at": "2026-03-09T09:00:00Z"
    }
  ]
}
```

### 2. 根据 Slug 获取页面内容
```
GET /public/pages/:slug/blocks
```

**响应示例：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "page": {
      "id": "uuid",
      "type": "page",
      "slug": "my-first-post",
      "properties": {
        "title": "我的第一篇文章"
      }
    },
    "blocks": [
      {
        "id": "uuid",
        "type": "paragraph",
        "properties": {
          "content": [{"text": "Hello World"}]
        }
      }
    ]
  }
}
```

## 认证接口

### 1. 用户注册
```
POST /auth/register
```

**请求体：**
```json
{
  "username": "john",
  "email": "john@example.com",
  "password": "password123"
}
```

**响应示例：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com"
    }
  }
}
```

### 2. 用户登录
```
POST /auth/login
```

**请求体：**
```json
{
  "username": "john",
  "password": "password123"
}
```

**响应示例：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "random_string",
    "user": {
      "id": "uuid",
      "username": "john",
      "email": "john@example.com"
    }
  }
}
```

### 3. 刷新 Token
```
POST /auth/refresh
```

**请求体：**
```json
{
  "refresh_token": "random_string"
}
```

### 4. 获取当前用户信息
```
GET /auth/me
Authorization: Bearer {access_token}
```

### 5. 退出登录
```
POST /auth/logout
Authorization: Bearer {access_token}
```

**请求体：**
```json
{
  "refresh_token": "random_string"
}
```

## 管理端接口（需要认证）

### 页面管理

#### 1. 获取所有页面
```
GET /admin/pages?include_unpublished=true
Authorization: Bearer {access_token}
```

#### 2. 创建页面
```
POST /admin/pages
Authorization: Bearer {access_token}
```

**请求体：**
```json
{
  "id": "uuid",
  "type": "page",
  "parent_id": null,
  "path": "/uuid/",
  "slug": "my-post",
  "properties": {
    "title": "新文章",
    "is_published": false
  }
}
```

#### 3. 更新页面
```
PUT /admin/pages/:page_id
Authorization: Bearer {access_token}
```

#### 4. 删除页面
```
DELETE /admin/pages/:page_id
Authorization: Bearer {access_token}
```

### Block 管理

#### 1. 获取目录树
```
GET /admin/blocks?parent_id=uuid
Authorization: Bearer {access_token}
```

**说明：**
- 不传 `parent_id` 或传 `null` 时返回根节点
- 传具体 UUID 时返回该节点的直接子节点

#### 2. 获取页面的所有 Block
```
GET /admin/blocks/pages/:page_id
Authorization: Bearer {access_token}
```

#### 3. 批量同步 Block
```
POST /admin/blocks/sync
Authorization: Bearer {access_token}
```

**请求体：**
```json
{
  "updated_blocks": [
    {
      "id": "uuid",
      "type": "paragraph",
      "parent_id": "page_uuid",
      "path": "/page_uuid/uuid/",
      "properties": {
        "content": [{"text": "Updated content"}]
      }
    }
  ],
  "deleted_blocks": ["uuid1", "uuid2"]
}
```

## 错误码说明

### 用户可见错误 (1000-1999)

| 错误码 | 说明 |
|--------|------|
| 1001 | 用户名或密码错误 |
| 1002 | 未登录或登录已过期 |
| 1003 | 无权访问此资源 |
| 1101 | 输入内容不符合要求 |
| 1102 | 缺少必填项 |
| 1103 | 资源已存在 |
| 1201 | 请求的资源不存在 |
| 1202 | 页面不存在 |

### 内部错误 (5000-5999)
这些错误统一返回"系统繁忙，请稍后重试"

### 业务错误 (6000-6999)
内部使用，帮助定位具体业务问题
