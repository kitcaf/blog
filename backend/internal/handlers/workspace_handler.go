package handlers

import (
	"net/http"

	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WorkspaceHandler struct {
	workspaceService *services.WorkspaceService
}

func NewWorkspaceHandler(workspaceService *services.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{workspaceService: workspaceService}
}

// GetWorkspaces 获取用户的所有工作空间
func (h *WorkspaceHandler) GetWorkspaces(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	workspaces, err := h.workspaceService.GetWorkspacesByUserID(userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get workspaces")
		return
	}

	response.Success(c, workspaces)
}

// GetWorkspace 获取工作空间详情
func (h *WorkspaceHandler) GetWorkspace(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid workspace ID")
		return
	}

	workspace, err := h.workspaceService.GetWorkspaceByID(id)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Workspace not found")
		return
	}

	response.Success(c, workspace)
}

type CreateWorkspaceRequest struct {
	Name string `json:"name" binding:"required"`
}

// CreateWorkspace 创建新工作空间
func (h *WorkspaceHandler) CreateWorkspace(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	var req CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	workspace, err := h.workspaceService.CreateWorkspace(req.Name, userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to create workspace")
		return
	}

	response.Success(c, workspace)
}

// UpdateWorkspace 更新工作空间
func (h *WorkspaceHandler) UpdateWorkspace(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid workspace ID")
		return
	}

	var workspace models.Workspace
	if err := c.ShouldBindJSON(&workspace); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	workspace.ID = id
	if err := h.workspaceService.UpdateWorkspace(&workspace); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update workspace")
		return
	}

	response.Success(c, workspace)
}

// DeleteWorkspace 删除工作空间
func (h *WorkspaceHandler) DeleteWorkspace(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid workspace ID")
		return
	}

	userID := c.MustGet("user_id").(uuid.UUID)

	if err := h.workspaceService.DeleteWorkspace(id, userID); err != nil {
		response.Error(c, http.StatusForbidden, err.Error())
		return
	}

	response.Success(c, gin.H{"message": "删除成功"})
}
