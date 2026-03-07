package repository

import (
	"blog-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WorkspaceRepository struct {
	db *gorm.DB
}

func NewWorkspaceRepository(db *gorm.DB) *WorkspaceRepository {
	return &WorkspaceRepository{db: db}
}

// FindByID 根据 ID 查找工作空间
func (r *WorkspaceRepository) FindByID(id uuid.UUID) (*models.Workspace, error) {
	var workspace models.Workspace
	err := r.db.Preload("Owner").Where("id = ?", id).First(&workspace).Error
	return &workspace, err
}

// FindByOwnerID 查找用户拥有的所有工作空间
func (r *WorkspaceRepository) FindByOwnerID(ownerID uuid.UUID) ([]models.Workspace, error) {
	var workspaces []models.Workspace
	err := r.db.Where("owner_id = ?", ownerID).Find(&workspaces).Error
	return workspaces, err
}

// FindByUserID 查找用户参与的所有工作空间（包括作为成员的）
func (r *WorkspaceRepository) FindByUserID(userID uuid.UUID) ([]models.Workspace, error) {
	var workspaces []models.Workspace
	err := r.db.Joins("LEFT JOIN workspace_members ON workspaces.id = workspace_members.workspace_id").
		Where("workspaces.owner_id = ? OR workspace_members.user_id = ?", userID, userID).
		Distinct().
		Find(&workspaces).Error
	return workspaces, err
}

// Create 创建新工作空间
func (r *WorkspaceRepository) Create(workspace *models.Workspace) error {
	return r.db.Create(workspace).Error
}

// Update 更新工作空间
func (r *WorkspaceRepository) Update(workspace *models.Workspace) error {
	return r.db.Save(workspace).Error
}

// Delete 删除工作空间
func (r *WorkspaceRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.Workspace{}, "id = ?", id).Error
}

// CheckUserAccess 检查用户是否有权访问工作空间
func (r *WorkspaceRepository) CheckUserAccess(workspaceID, userID uuid.UUID) (bool, string, error) {
	var workspace models.Workspace
	if err := r.db.Where("id = ? AND owner_id = ?", workspaceID, userID).First(&workspace).Error; err == nil {
		return true, "owner", nil
	}

	var member models.WorkspaceMember
	if err := r.db.Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&member).Error; err == nil {
		return true, member.Role, nil
	}

	return false, "", nil
}

// AddMember 添加工作空间成员
func (r *WorkspaceRepository) AddMember(member *models.WorkspaceMember) error {
	return r.db.Create(member).Error
}
