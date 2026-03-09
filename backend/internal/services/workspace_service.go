package services

import (
	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	"blog-backend/pkg/errors"

	"github.com/google/uuid"
)

type WorkspaceService struct {
	workspaceRepo *repository.WorkspaceRepository
}

func NewWorkspaceService(workspaceRepo *repository.WorkspaceRepository) *WorkspaceService {
	return &WorkspaceService{
		workspaceRepo: workspaceRepo,
	}
}

// GetWorkspacesByUserID 获取用户的所有工作空间
func (s *WorkspaceService) GetWorkspacesByUserID(userID uuid.UUID) ([]models.Workspace, error) {
	return s.workspaceRepo.FindByUserID(userID)
}

// GetWorkspaceByID 获取工作空间详情
func (s *WorkspaceService) GetWorkspaceByID(id uuid.UUID) (*models.Workspace, error) {
	return s.workspaceRepo.FindByID(id)
}

// CreateWorkspace 创建新工作空间
func (s *WorkspaceService) CreateWorkspace(name string, ownerID uuid.UUID) (*models.Workspace, error) {
	workspace := &models.Workspace{
		Name:    name,
		OwnerID: ownerID,
	}

	if err := s.workspaceRepo.Create(workspace); err != nil {
		return nil, err
	}

	return workspace, nil
}

// UpdateWorkspace 更新工作空间
func (s *WorkspaceService) UpdateWorkspace(workspace *models.Workspace) error {
	return s.workspaceRepo.Update(workspace)
}

// DeleteWorkspace 删除工作空间
func (s *WorkspaceService) DeleteWorkspace(id, userID uuid.UUID) error {
	// 检查权限
	workspace, err := s.workspaceRepo.FindByID(id)
	if err != nil {
		return errors.Wrap(errors.ErrWorkspaceNotFound, err)
	}

	if workspace.OwnerID != userID {
		return errors.New(errors.ErrNotWorkspaceOwner, "user is not owner")
	}

	if err := s.workspaceRepo.Delete(id); err != nil {
		return errors.Wrap(errors.ErrDatabaseDelete, err)
	}

	return nil
}

// CheckUserAccess 检查用户是否有权访问工作空间
func (s *WorkspaceService) CheckUserAccess(workspaceID, userID uuid.UUID) (bool, string, error) {
	return s.workspaceRepo.CheckUserAccess(workspaceID, userID)
}
