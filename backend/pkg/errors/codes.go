package errors

// ErrorCode 内部错误码类型（用于日志、监控、调试）
type ErrorCode int

const (
	// ============ 用户可见错误 (1000-1999) ============
	// 这些错误会直接返回给前端用户

	// 认证授权错误 (1000-1099)
	ErrInvalidCredentials ErrorCode = 1001 // 用户名或密码错误
	ErrUnauthorized       ErrorCode = 1002 // 未登录或登录已过期
	ErrAccessDenied       ErrorCode = 1003 // 无权访问此资源
	ErrAccountDisabled    ErrorCode = 1004 // 账号已被禁用

	// 请求参数错误 (1100-1199)
	ErrInvalidInput    ErrorCode = 1101 // 输入内容不符合要求
	ErrMissingRequired ErrorCode = 1102 // 缺少必填项
	ErrResourceExists  ErrorCode = 1103 // 资源已存在（如用户名、邮箱）

	// 资源不存在错误 (1200-1299)
	ErrResourceNotFound ErrorCode = 1201 // 请求的资源不存在
	ErrPageNotFound     ErrorCode = 1202 // 页面不存在

	// 操作限制错误 (1300-1399)
	ErrOperationFailed ErrorCode = 1301 // 操作失败，请稍后重试
	ErrTooManyRequests ErrorCode = 1302 // 操作过于频繁
	ErrQuotaExceeded   ErrorCode = 1303 // 超出配额限制
	ErrOperationDenied ErrorCode = 1304 // 不允许执行此操作

	// ============ 内部错误码 (5000-5999) ============
	// 这些错误不会直接暴露给用户，统一返回"系统错误"

	// 数据库错误 (5000-5099)
	ErrDatabaseConnection  ErrorCode = 5001 // 数据库连接失败
	ErrDatabaseQuery       ErrorCode = 5002 // 数据库查询错误
	ErrDatabaseInsert      ErrorCode = 5003 // 数据库插入失败
	ErrDatabaseUpdate      ErrorCode = 5004 // 数据库更新失败
	ErrDatabaseDelete      ErrorCode = 5005 // 数据库删除失败
	ErrDatabaseTransaction ErrorCode = 5006 // 数据库事务失败

	// 缓存错误 (5100-5199)
	ErrCacheConnection ErrorCode = 5101 // 缓存连接失败
	ErrCacheGet        ErrorCode = 5102 // 缓存读取失败
	ErrCacheSet        ErrorCode = 5103 // 缓存写入失败
	ErrCacheDelete     ErrorCode = 5104 // 缓存删除失败

	// 外部服务错误 (5200-5299)
	ErrExternalService ErrorCode = 5201 // 外部服务调用失败
	ErrEmailService    ErrorCode = 5202 // 邮件服务失败
	ErrStorageService  ErrorCode = 5203 // 存储服务失败

	// 系统内部错误 (5900-5999)
	ErrInternalServer ErrorCode = 5901 // 服务器内部错误
	ErrConfigError    ErrorCode = 5902 // 配置错误
	ErrUnknown        ErrorCode = 5999 // 未知错误

	// ============ 业务逻辑错误 (6000-6999) ============
	// 内部使用，帮助定位具体业务问题

	// 用户业务 (6000-6099)
	ErrUserNotFound       ErrorCode = 6001 // 用户不存在（内部）
	ErrUserAlreadyExists  ErrorCode = 6002 // 用户已存在（内部）
	ErrEmailAlreadyExists ErrorCode = 6003 // 邮箱已存在（内部）
	ErrInvalidToken       ErrorCode = 6004 // Token 无效（内部）
	ErrTokenExpired       ErrorCode = 6005 // Token 过期（内部）

	// 工作空间业务 (6100-6199) - 已删除
	// ErrWorkspaceNotFound     ErrorCode = 6101
	// ErrWorkspaceAccessDenied ErrorCode = 6102
	// ErrNotWorkspaceOwner     ErrorCode = 6103

	// 页面业务 (6200-6299)
	ErrPageNotFoundInternal ErrorCode = 6201 // 页面不存在（内部）
	ErrSlugAlreadyExists    ErrorCode = 6202 // Slug 已存在（内部）
	ErrInvalidSlugFormat    ErrorCode = 6203 // Slug 格式错误（内部）

	// Block 业务 (6300-6399)
	ErrBlockNotFound    ErrorCode = 6301 // Block 不存在（内部）
	ErrInvalidBlockType ErrorCode = 6302 // Block 类型无效（内部）
	ErrSyncFailed       ErrorCode = 6303 // 同步失败（内部）

	// 搜索业务 (6400-6499)
	ErrSearchQueryEmpty     ErrorCode = 6401 // 搜索关键词为空（内部）
	ErrSearchQueryTooLong   ErrorCode = 6402 // 搜索关键词过长（内部）
	ErrSearchIndexFailed    ErrorCode = 6403 // 索引创建失败（内部）
	ErrSearchQueryFailed    ErrorCode = 6404 // 搜索查询失败（内部）
	ErrSearchNoResults      ErrorCode = 6405 // 无搜索结果（内部）
	ErrSearchInvalidPath    ErrorCode = 6406 // 路径格式无效（内部）
	ErrSearchContentExtract ErrorCode = 6407 // 内容提取失败（内部）
)

// IsUserFacingError 判断是否为用户可见错误
func (e ErrorCode) IsUserFacingError() bool {
	return e >= 1000 && e < 2000
}

// IsInternalError 判断是否为内部错误
func (e ErrorCode) IsInternalError() bool {
	return e >= 5000 && e < 6000
}

// IsBusinessError 判断是否为业务逻辑错误
func (e ErrorCode) IsBusinessError() bool {
	return e >= 6000 && e < 7000
}

// GetUserMessage 获取用户友好的错误消息
func (e ErrorCode) GetUserMessage() string {
	// 用户可见错误：返回具体消息
	if e.IsUserFacingError() {
		if msg, ok := userFacingMessages[e]; ok {
			return msg
		}
	}

	// 内部错误和业务错误：统一返回通用消息
	if e.IsInternalError() {
		return "系统繁忙，请稍后重试"
	}

	if e.IsBusinessError() {
		// 根据业务错误类型返回通用消息
		return getBusinessErrorUserMessage(e)
	}

	return "操作失败，请稍后重试"
}

// GetInternalMessage 获取内部错误消息（用于日志）
func (e ErrorCode) GetInternalMessage() string {
	if msg, ok := internalMessages[e]; ok {
		return msg
	}
	return "Unknown error"
}

// GetHTTPStatus 获取 HTTP 状态码
func (e ErrorCode) GetHTTPStatus() int {
	switch {
	case e >= 1000 && e < 1100:
		return 401 // 认证授权错误
	case e >= 1100 && e < 1200:
		return 400 // 参数错误
	case e >= 1200 && e < 1300:
		return 404 // 资源不存在
	case e >= 1300 && e < 1400:
		return 403 // 操作限制
	case e >= 5000:
		return 500 // 内部错误
	case e >= 6000 && e < 6100:
		return 400 // 用户业务错误
	case e >= 6100 && e < 6200:
		return 403 // 工作空间业务错误（已删除，保留范围）
	case e >= 6200:
		return 404 // 页面/Block/搜索 业务错误
	default:
		return 500
	}
}

// userFacingMessages 用户可见的错误消息
var userFacingMessages = map[ErrorCode]string{
	// 认证授权
	ErrInvalidCredentials: "用户名或密码错误",
	ErrUnauthorized:       "请先登录",
	ErrAccessDenied:       "您没有权限访问此资源",
	ErrAccountDisabled:    "您的账号已被禁用，请联系管理员",

	// 请求参数
	ErrInvalidInput:    "输入内容不符合要求，请检查后重试",
	ErrMissingRequired: "请填写所有必填项",
	ErrResourceExists:  "该资源已存在",

	// 资源不存在
	ErrResourceNotFound: "请求的资源不存在",
	ErrPageNotFound:     "页面不存在或已被删除",

	// 操作限制
	ErrOperationFailed: "操作失败，请稍后重试",
	ErrTooManyRequests: "操作过于频繁，请稍后再试",
	ErrQuotaExceeded:   "已超出配额限制",
	ErrOperationDenied: "不允许执行此操作",
}

// internalMessages 内部错误消息（用于日志）
var internalMessages = map[ErrorCode]string{
	// 数据库
	ErrDatabaseConnection:  "Database connection failed",
	ErrDatabaseQuery:       "Database query error",
	ErrDatabaseInsert:      "Database insert failed",
	ErrDatabaseUpdate:      "Database update failed",
	ErrDatabaseDelete:      "Database delete failed",
	ErrDatabaseTransaction: "Database transaction failed",

	// 缓存
	ErrCacheConnection: "Cache connection failed",
	ErrCacheGet:        "Cache get failed",
	ErrCacheSet:        "Cache set failed",
	ErrCacheDelete:     "Cache delete failed",

	// 外部服务
	ErrExternalService: "External service call failed",
	ErrEmailService:    "Email service failed",
	ErrStorageService:  "Storage service failed",

	// 系统
	ErrInternalServer: "Internal server error",
	ErrConfigError:    "Configuration error",
	ErrUnknown:        "Unknown error",

	// 用户业务
	ErrUserNotFound:       "User not found",
	ErrUserAlreadyExists:  "User already exists",
	ErrEmailAlreadyExists: "Email already exists",
	ErrInvalidToken:       "Invalid token",
	ErrTokenExpired:       "Token expired",

	// 工作空间业务 - 已删除
	// ErrWorkspaceNotFound:     "Workspace not found",
	// ErrWorkspaceAccessDenied: "Workspace access denied",
	// ErrNotWorkspaceOwner:     "Not workspace owner",

	// 页面业务
	ErrPageNotFoundInternal: "Page not found",
	ErrSlugAlreadyExists:    "Slug already exists",
	ErrInvalidSlugFormat:    "Invalid slug format",

	// Block 业务
	ErrBlockNotFound:    "Block not found",
	ErrInvalidBlockType: "Invalid block type",
	ErrSyncFailed:       "Sync failed",

	// 搜索业务
	ErrSearchQueryEmpty:     "Search query is empty",
	ErrSearchQueryTooLong:   "Search query is too long",
	ErrSearchIndexFailed:    "Search index creation failed",
	ErrSearchQueryFailed:    "Search query failed",
	ErrSearchNoResults:      "No search results found",
	ErrSearchInvalidPath:    "Invalid path format",
	ErrSearchContentExtract: "Content extraction failed",
}

// getBusinessErrorUserMessage 根据业务错误返回用户友好消息
func getBusinessErrorUserMessage(code ErrorCode) string {
	switch {
	case code >= 6000 && code < 6100:
		// 用户相关业务错误
		switch code {
		case ErrUserNotFound, ErrInvalidToken, ErrTokenExpired:
			return "登录已过期，请重新登录"
		case ErrUserAlreadyExists, ErrEmailAlreadyExists:
			return "用户名或邮箱已被使用"
		default:
			return "用户信息错误"
		}
	case code >= 6100 && code < 6200:
		// 工作空间相关业务错误（已删除）
		return "操作失败"
	case code >= 6200 && code < 6300:
		// 页面相关业务错误
		return "页面不存在或已被删除"
	case code >= 6300 && code < 6400:
		// Block 相关业务错误
		return "内容不存在或已被删除"
	case code >= 6400 && code < 6500:
		// 搜索相关业务错误
		switch code {
		case ErrSearchQueryEmpty:
			return "请输入搜索关键词"
		case ErrSearchQueryTooLong:
			return "搜索关键词过长，请缩短后重试"
		case ErrSearchNoResults:
			return "未找到相关内容"
		default:
			return "搜索失败，请稍后重试"
		}
	default:
		return "操作失败，请稍后重试"
	}
}
