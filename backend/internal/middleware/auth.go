package middleware

import (
	"blog-backend/internal/config"
	"blog-backend/pkg/errors"
	"blog-backend/pkg/response"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AuthMiddleware JWT 认证中间件
func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "missing authorization header"))
			c.Abort()
			return
		}

		// 解析 Bearer Token
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid authorization header format"))
			c.Abort()
			return
		}

		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWT.Secret), nil
		})

		if err != nil || !token.Valid {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid or expired token"))
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid token claims"))
			c.Abort()
			return
		}

		// 提取用户信息
		userID, err := uuid.Parse(claims["user_id"].(string))
		if err != nil {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid user ID in token"))
			c.Abort()
			return
		}

		// 将用户信息存入上下文
		c.Set("user_id", userID)
		c.Set("username", claims["username"].(string))
		c.Set("email", claims["email"].(string))
		c.Next()
	}
}

// WorkspaceMiddleware 工作空间权限中间件
// 从 URL 参数或请求体中提取 workspace_id，并验证用户权限
func WorkspaceMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "user not authenticated"))
			c.Abort()
			return
		}

		// 从 URL 参数获取 workspace_id（路由中的 :id 参数）
		workspaceIDStr := c.Param("id")
		if workspaceIDStr == "" {
			// 尝试从查询参数获取
			workspaceIDStr = c.Query("workspace_id")
		}

		if workspaceIDStr == "" {
			response.ErrorWithCode(c, errors.New(errors.ErrMissingRequired, "missing workspace_id parameter"))
			c.Abort()
			return
		}

		workspaceID, err := uuid.Parse(workspaceIDStr)
		if err != nil {
			response.ErrorWithCode(c, errors.New(errors.ErrInvalidInput, "invalid workspace_id format"))
			c.Abort()
			return
		}

		// TODO: 检查用户是否有权访问该工作空间
		// 这里需要调用 WorkspaceService.CheckUserAccess
		// 暂时先放行，后续完善

		c.Set("workspace_id", workspaceID)
		c.Set("user_id", userID.(uuid.UUID))
		c.Next()
	}
}
