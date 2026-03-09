package errors

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	// errorLogger 专门用于记录错误日志到文件
	errorLogger *log.Logger
)

// InitErrorLogger 初始化错误日志系统
// 应该在应用启动时调用一次
func InitErrorLogger(logDir string) error {
	// 确保日志目录存在
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	// 配置 lumberjack 日志轮转
	logFile := &lumberjack.Logger{
		Filename:   filepath.Join(logDir, "error.log"),
		MaxSize:    100,  // MB
		MaxBackups: 30,   // 保留最近 30 个备份
		MaxAge:     30,   // 保留 30 天
		Compress:   true, // 压缩旧日志
		LocalTime:  true, // 使用本地时间
	}

	// 创建多输出：同时输出到控制台和文件
	multiWriter := io.MultiWriter(os.Stderr, logFile)

	// 创建专用的错误日志记录器
	errorLogger = log.New(multiWriter, "[ERROR] ", log.LstdFlags|log.Lshortfile)

	return nil
}

// logError 内部方法：记录错误日志
func logError(format string, v ...interface{}) {
	if errorLogger != nil {
		errorLogger.Output(3, fmt.Sprintf(format, v...))
	} else {
		// 如果未初始化，降级到标准日志
		log.Printf("[ERROR] "+format, v...)
	}
}

// AppError 应用错误结构
type AppError struct {
	Code           ErrorCode `json:"code"`    // 内部错误码
	UserMessage    string    `json:"message"` // 返回给用户的消息
	InternalDetail string    `json:"-"`       // 内部详细信息（不返回给用户）
	Err            error     `json:"-"`       // 原始错误（不返回给用户）
}

// Error 实现 error 接口
func (e *AppError) Error() string {
	if e.InternalDetail != "" {
		return fmt.Sprintf("[%d] %s: %s", e.Code, e.Code.GetInternalMessage(), e.InternalDetail)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.Code.GetInternalMessage())
}

// New 创建新的应用错误
func New(code ErrorCode, internalDetail string) *AppError {
	err := &AppError{
		Code:           code,
		UserMessage:    code.GetUserMessage(),
		InternalDetail: internalDetail,
	}

	// 只记录内部错误和业务错误到文件
	if code.IsInternalError() || code.IsBusinessError() {
		logError("Code: %d (%s), Detail: %s", code, code.GetInternalMessage(), internalDetail)
	}

	return err
}

// NewWithUserMessage 创建带自定义用户消息的错误
func NewWithUserMessage(code ErrorCode, userMessage string, internalDetail string) *AppError {
	err := &AppError{
		Code:           code,
		UserMessage:    userMessage,
		InternalDetail: internalDetail,
	}

	if code.IsInternalError() || code.IsBusinessError() {
		logError("Code: %d (%s), UserMsg: %s, Detail: %s",
			code, code.GetInternalMessage(), userMessage, internalDetail)
	}

	return err
}

// Wrap 包装标准错误为应用错误
func Wrap(code ErrorCode, err error) *AppError {
	if err == nil {
		return nil
	}

	appErr := &AppError{
		Code:           code,
		UserMessage:    code.GetUserMessage(),
		InternalDetail: err.Error(),
		Err:            err,
	}

	// 只记录内部错误到文件
	if code.IsInternalError() {
		logError("Code: %d (%s), Error: %v", code, code.GetInternalMessage(), err)
	}

	return appErr
}

// WrapWithDetail 包装错误并添加详细信息
func WrapWithDetail(code ErrorCode, err error, detail string) *AppError {
	if err == nil {
		return nil
	}

	appErr := &AppError{
		Code:           code,
		UserMessage:    code.GetUserMessage(),
		InternalDetail: fmt.Sprintf("%s: %v", detail, err),
		Err:            err,
	}

	if code.IsInternalError() {
		logError("Code: %d (%s), Detail: %s, Error: %v",
			code, code.GetInternalMessage(), detail, err)
	}

	return appErr
}

// GetUserResponse 获取返回给用户的响应数据
func (e *AppError) GetUserResponse() map[string]interface{} {
	return map[string]interface{}{
		"code":    e.Code,
		"message": e.UserMessage,
	}
}

// LogError 记录错误日志（由 response 层调用）
func (e *AppError) LogError() {
	// 只记录内部错误和业务错误
	if !e.Code.IsInternalError() && !e.Code.IsBusinessError() {
		return
	}

	if e.InternalDetail != "" {
		logError("Code: %d (%s), UserMsg: %s, Detail: %s",
			e.Code, e.Code.GetInternalMessage(), e.UserMessage, e.InternalDetail)
	} else {
		logError("Code: %d (%s), UserMsg: %s",
			e.Code, e.Code.GetInternalMessage(), e.UserMessage)
	}
}
