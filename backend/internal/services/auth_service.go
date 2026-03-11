package services

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"blog-backend/internal/config"
	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	"blog-backend/pkg/errors"

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
		return nil, nil, errors.New(errors.ErrInvalidCredentials, "user not found")
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, errors.New(errors.ErrInvalidCredentials, "password mismatch")
	}

	// 生成双 Token
	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, nil, errors.Wrap(errors.ErrInternalServer, err)
	}

	return tokens, user, nil
}

func (s *AuthService) Register(username, email, password string) (*models.User, error) {
	// 哈希密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.Wrap(errors.ErrInternalServer, err)
	}

	// 构造新用户
	user := &models.User{
		Username:     username,
		Email:        email,
		PasswordHash: string(hashedPassword),
	}

	// 利用数据库原生的 UNIQUE 约束，直接一把梭 INSERT
	if err := s.userRepo.Create(user); err != nil {
		errMsg := err.Error()
		// 根据 Postgres 等主流数据库的错误信息判定是否违反唯一索引
		if containsAny(errMsg, "users_username_key", "Duplicate entry", "username") && containsAny(errMsg, "unique", "Duplicate") {
			return nil, errors.New(errors.ErrUserAlreadyExists, "username: "+username)
		}
		if containsAny(errMsg, "users_email_key", "Duplicate entry", "email") && containsAny(errMsg, "unique", "Duplicate") {
			return nil, errors.New(errors.ErrEmailAlreadyExists, "email: "+email)
		}
		return nil, errors.Wrap(errors.ErrDatabaseInsert, err)
	}

	return user, nil
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if !strings.Contains(s, sub) {
			continue
		}
		return true
	}
	return false
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
		return nil, errors.New(errors.ErrInvalidToken, "refresh token not found in cache")
	}
	if err != nil {
		return nil, errors.Wrap(errors.ErrCacheGet, err)
	}

	// 解析 Refresh Token 数据
	var rt models.RefreshToken
	if err := json.Unmarshal([]byte(data), &rt); err != nil {
		return nil, errors.WrapWithDetail(errors.ErrInternalServer, err, "failed to parse refresh token")
	}

	// 检查是否过期
	if time.Now().After(rt.ExpiresAt) {
		s.rdb.Del(ctx, key) // 删除过期的 token
		return nil, errors.New(errors.ErrTokenExpired, "refresh token expired")
	}

	// 获取用户信息
	user, err := s.userRepo.FindByID(rt.UserID)
	if err != nil {
		return nil, errors.New(errors.ErrUserNotFound, "user id: "+rt.UserID.String())
	}

	// 生成新的双 Token
	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, errors.Wrap(errors.ErrInternalServer, err)
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
		return "", errors.Wrap(errors.ErrInternalServer, err)
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
		return "", errors.Wrap(errors.ErrInternalServer, err)
	}

	ttl := time.Until(expiresAt)
	if err := s.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		return "", errors.Wrap(errors.ErrCacheSet, err)
	}

	return token, nil
}

// HashPassword 哈希密码（工具方法）
func (s *AuthService) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}
