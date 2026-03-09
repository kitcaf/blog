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
