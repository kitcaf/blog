package response

import (
	"blog-backend/pkg/errors"

	"github.com/gin-gonic/gin"
)

// Response 统一响应结构
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Success 成功响应
func Success(c *gin.Context, data interface{}) {
	c.JSON(200, Response{
		Code:    200,
		Message: "success",
		Data:    data,
	})
}

// SuccessWithMessage 带自定义消息的成功响应
func SuccessWithMessage(c *gin.Context, message string, data interface{}) {
	c.JSON(200, Response{
		Code:    200,
		Message: message,
		Data:    data,
	})
}

// Error 简单错误响应（用于快速返回）
func Error(c *gin.Context, httpStatus int, message string) {
	c.JSON(httpStatus, Response{
		Code:    httpStatus,
		Message: message,
	})
}

// ErrorWithCode 使用业务错误码的错误响应
func ErrorWithCode(c *gin.Context, err *errors.AppError) {
	httpStatus := err.Code.GetHTTPStatus()

	// 记录错误日志（仅用于调试）
	err.LogError()

	c.JSON(httpStatus, Response{
		Code:    int(err.Code),
		Message: err.UserMessage, // 只返回用户友好的消息
	})
}

// HandleError 统一错误处理
// 这是推荐的错误处理方式
func HandleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	// 如果是 AppError，使用错误码响应
	if appErr, ok := err.(*errors.AppError); ok {
		ErrorWithCode(c, appErr)
		return
	}

	// 其他错误统一返回内部错误
	internalErr := errors.Wrap(errors.ErrInternalServer, err)
	ErrorWithCode(c, internalErr)
}

// BadRequest 400 错误
func BadRequest(c *gin.Context, message string) {
	c.JSON(400, Response{
		Code:    400,
		Message: message,
	})
}

// Unauthorized 401 错误
func Unauthorized(c *gin.Context, message string) {
	c.JSON(401, Response{
		Code:    401,
		Message: message,
	})
}

// Forbidden 403 错误
func Forbidden(c *gin.Context, message string) {
	c.JSON(403, Response{
		Code:    403,
		Message: message,
	})
}

// NotFound 404 错误
func NotFound(c *gin.Context, message string) {
	c.JSON(404, Response{
		Code:    404,
		Message: message,
	})
}

// InternalServerError 500 错误
func InternalServerError(c *gin.Context) {
	c.JSON(500, Response{
		Code:    500,
		Message: "系统繁忙，请稍后重试",
	})
}
