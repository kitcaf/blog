package user

import (
	"blog-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindByUsername 根据用户名查找用户
func (r *UserRepository) FindByUsername(username string) (*models.User, error) {
	var currentUser models.User
	err := r.db.Where("username = ?", username).First(&currentUser).Error
	return &currentUser, err
}

// FindByEmail 根据邮箱查找用户
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var currentUser models.User
	err := r.db.Where("email = ?", email).First(&currentUser).Error
	return &currentUser, err
}

// FindByID 根据 ID 查找用户
func (r *UserRepository) FindByID(id uuid.UUID) (*models.User, error) {
	var currentUser models.User
	err := r.db.Where("id = ?", id).First(&currentUser).Error
	return &currentUser, err
}

// Create 创建新用户
func (r *UserRepository) Create(user *models.User) error {
	return r.db.Create(user).Error
}

// Update 更新用户信息
func (r *UserRepository) Update(user *models.User) error {
	return r.db.Save(user).Error
}
