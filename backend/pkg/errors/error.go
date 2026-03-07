package errors

import (
	"fmt"
	"log"
)

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

	// 记录内部错误日志
	if code.IsInternalError() || code.IsBusinessError() {
		log.Printf("[ERROR] Code: %d, Detail: %s", code, internalDetail)
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
		log.Printf("[ERROR] Code: %d, Detail: %s", code, internalDetail)
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

	// 记录内部错误日志
	if code.IsInternalError() {
		log.Printf("[ERROR] Code: %d, Error: %v", code, err)
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
		log.Printf("[ERROR] Code: %d, Detail: %s, Error: %v", code, detail, err)
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

// LogError 记录错误日志（用于调试）
func (e *AppError) LogError() {
	if e.InternalDetail != "" {
		log.Printf("[AppError] Code: %d, UserMsg: %s, Detail: %s",
			e.Code, e.UserMessage, e.InternalDetail)
	} else {
		log.Printf("[AppError] Code: %d, UserMsg: %s", e.Code, e.UserMessage)
	}
}
