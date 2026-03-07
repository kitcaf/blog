package services

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"blog-backend/internal/config"
	"blog-backend/internal/models"
	"blog-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo *repository.UserRepository
	cfg      *config.Config
	rdb      *redis.Client
}

func NewAuthService(userRepo *repository.UserRepository, cfg *config.Config, rdb *redis.Client) *AuthService {
	return &AuthService{
		userRepo: userRepo,
		cfg:      cfg,
		rdb:      rdb,
	}
}

// TokenPair 包含 Access Token 和 Refresh Token
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// Login 用户登录，返回双 Token
func (s *AuthService) Login(username, password string) (*TokenPair, *models.User, error) {
	user, err := s.userRepo.FindByUsername(username)
	if err != nil {
		return nil, nil, errors.New("invalid username or password")
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, errors.New("invalid username or password")
	}

	// 生成双 Token
	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, nil, err
	}

	return tokens, user, nil
}

// Register 用户注册
func (s *AuthService) Register(username, email, password string) (*models.User, error) {
	// 检查用户名是否已存在
	if _, err := s.userRepo.FindByUsername(username); err == nil {
		return nil, errors.New("username already exists")
	}

	// 检查邮箱是否已存在
	if _, err := s.userRepo.FindByEmail(email); err == nil {
		return nil, errors.New("email already exists")
	}

	// 哈希密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Username:     username,
		Email:        email,
		PasswordHash: string(hashedPassword),
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByID 根据 ID 获取用户
func (s *AuthService) GetUserByID(id uuid.UUID) (*models.User, error) {
	return s.userRepo.FindByID(id)
}

// RefreshAccessToken 使用 Refresh Token 刷新 Access Token
func (s *AuthService) RefreshAccessToken(refreshToken string) (*TokenPair, error) {
	// 从 Redis 获取 Refresh Token 信息
	ctx := context.Background()
	key := fmt.Sprintf("refresh_token:%s", refreshToken)

	data, err := s.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, errors.New("invalid or expired refresh token")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	// 解析 Refresh Token 数据
	var rt models.RefreshToken
	if err := json.Unmarshal([]byte(data), &rt); err != nil {
		return nil, fmt.Errorf("failed to parse refresh token: %w", err)
	}

	// 检查是否过期
	if time.Now().After(rt.ExpiresAt) {
		s.rdb.Del(ctx, key) // 删除过期的 token
		return nil, errors.New("refresh token expired")
	}

	// 获取用户信息
	user, err := s.userRepo.FindByID(rt.UserID)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// 生成新的双 Token
	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, err
	}

	// 删除旧的 Refresh Token
	s.rdb.Del(ctx, key)

	return tokens, nil
}

// RevokeRefreshToken 撤销 Refresh Token（用于登出）
func (s *AuthService) RevokeRefreshToken(refreshToken string) error {
	ctx := context.Background()
	key := fmt.Sprintf("refresh_token:%s", refreshToken)
	return s.rdb.Del(ctx, key).Err()
}

// generateTokenPair 生成 Access Token 和 Refresh Token
func (s *AuthService) generateTokenPair(user *models.User) (*TokenPair, error) {
	// 生成 Access Token（短期）
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	// 生成 Refresh Token（长期）
	refreshToken, err := s.generateRefreshToken(user)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

// generateAccessToken 生成 Access Token（JWT）
func (s *AuthService) generateAccessToken(user *models.User) (string, error) {
	expiresAt := time.Now().Add(time.Minute * time.Duration(s.cfg.JWT.AccessExpireMinutes))

	claims := jwt.MapClaims{
		"user_id":  user.ID.String(),
		"username": user.Username,
		"email":    user.Email,
		"exp":      expiresAt.Unix(),
		"iat":      time.Now().Unix(),
		"type":     "access", // 标记为 access token
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWT.Secret))
}

// generateRefreshToken 生成 Refresh Token（随机字符串）并存储到 Redis
func (s *AuthService) generateRefreshToken(user *models.User) (string, error) {
	// 生成随机 token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := base64.URLEncoding.EncodeToString(b)

	// 创建 Refresh Token 记录
	expiresAt := time.Now().Add(time.Hour * 24 * time.Duration(s.cfg.JWT.RefreshExpireDays))
	rt := models.RefreshToken{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}

	// 存储到 Redis
	ctx := context.Background()
	key := fmt.Sprintf("refresh_token:%s", token)
	data, err := json.Marshal(rt)
	if err != nil {
		return "", err
	}

	ttl := time.Until(expiresAt)
	if err := s.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		return "", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return token, nil
}

// HashPassword 哈希密码（工具方法）
func (s *AuthService) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}
