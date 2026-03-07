package handlers

import (
	"net/http"

	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PageHandler struct {
	blockService *services.BlockService
}

func NewPageHandler(blockService *services.BlockService) *PageHandler {
	return &PageHandler{blockService: blockService}
}

// GetAdminPages 获取管理端页面列表
func (h *PageHandler) GetAdminPages(c *gin.Context) {
	workspaceID := c.MustGet("workspace_id").(uuid.UUID)
	includeUnpublished := c.DefaultQuery("include_unpublished", "true") == "true"

	pages, err := h.blockService.GetPages(workspaceID, includeUnpublished)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get pages")
		return
	}

	response.Success(c, pages)
}

// GetPublicPages 获取公开页面列表
func (h *PageHandler) GetPublicPages(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid workspace ID")
		return
	}

	pages, err := h.blockService.GetPages(workspaceID, false)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get pages")
		return
	}

	response.Success(c, pages)
}

// GetPageBySlug 根据 slug 获取页面内容
func (h *PageHandler) GetPageBySlug(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid workspace ID")
		return
	}

	slug := c.Param("slug")

	page, blocks, err := h.blockService.GetPageBySlug(workspaceID, slug)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Page not found")
		return
	}

	response.Success(c, gin.H{
		"page":   page,
		"blocks": blocks,
	})
}

// CreatePage 创建页面
func (h *PageHandler) CreatePage(c *gin.Context) {
	workspaceID := c.MustGet("workspace_id").(uuid.UUID)
	userID := c.MustGet("user_id").(uuid.UUID)

	var block models.Block
	if err := c.ShouldBindJSON(&block); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	block.WorkspaceID = workspaceID
	block.CreatedBy = &userID
	block.LastEditedBy = &userID

	if err := h.blockService.CreatePage(&block); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to create page")
		return
	}

	response.Success(c, block)
}

// UpdatePage 更新页面
func (h *PageHandler) UpdatePage(c *gin.Context) {
	workspaceID := c.MustGet("workspace_id").(uuid.UUID)
	userID := c.MustGet("user_id").(uuid.UUID)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	var block models.Block
	if err := c.ShouldBindJSON(&block); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	block.ID = id
	block.WorkspaceID = workspaceID
	block.LastEditedBy = &userID

	if err := h.blockService.UpdatePage(&block); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update page")
		return
	}

	response.Success(c, block)
}

// DeletePage 删除页面
func (h *PageHandler) DeletePage(c *gin.Context) {
	workspaceID := c.MustGet("workspace_id").(uuid.UUID)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	if err := h.blockService.DeletePage(workspaceID, id); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to delete page")
		return
	}

	response.Success(c, gin.H{"message": "删除成功"})
}
