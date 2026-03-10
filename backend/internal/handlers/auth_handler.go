package handlers

import (
	"net/http"

	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	authService  *services.AuthService
	blockService *services.BlockService
}

func NewAuthHandler(authService *services.AuthService, blockService *services.BlockService) *AuthHandler {
	return &AuthHandler{
		authService:  authService,
		blockService: blockService,
	}
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// Register 用户注册
// 数据库操作步骤：
// 1. 创建用户账号
// 2. 自动创建该用户的 root 类型 block（用于维护根目录的 content_ids）
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 步骤1：创建用户
	user, err := h.authService.Register(req.Username, req.Email, req.Password)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	// 步骤2：为新用户创建 root 类型 block
	if err := h.blockService.CreateRootBlock(user.ID); err != nil {
		// root block 创建失败不影响注册流程，记录日志即可
		// 用户首次使用时会自动创建
	}

	response.Success(c, gin.H{
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login 用户登录
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	tokens, user, err := h.authService.Login(req.Username, req.Password)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// RefreshToken 刷新 Access Token
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	tokens, err := h.authService.RefreshAccessToken(req.RefreshToken)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
	})
}

// Me 获取当前用户信息
func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	user, err := h.authService.GetUserByID(userID)
	if err != nil {
		response.Error(c, http.StatusNotFound, "User not found")
		return
	}

	response.Success(c, user)
}

// Logout 退出登录
func (h *AuthHandler) Logout(c *gin.Context) {
	// 从请求体获取 refresh token
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := c.ShouldBindJSON(&req); err == nil && req.RefreshToken != "" {
		// 撤销 refresh token
		_ = h.authService.RevokeRefreshToken(req.RefreshToken)
	}

	response.Success(c, gin.H{"message": "退出成功"})
}
