package handlers

import (
	"net/http"

	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type BlockHandler struct {
	blockService *services.BlockService
}

func NewBlockHandler(blockService *services.BlockService) *BlockHandler {
	return &BlockHandler{blockService: blockService}
}

// GetBlocks 获取页面的所有 Block
func (h *BlockHandler) GetBlocks(c *gin.Context) {
	pageID, err := uuid.Parse(c.Param("page_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	blocks, err := h.blockService.GetBlocksByPageID(pageID)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Page not found")
		return
	}

	response.Success(c, blocks)
}

type SyncRequest struct {
	UpdatedBlocks []models.Block `json:"updated_blocks"`
	DeletedBlocks []uuid.UUID    `json:"deleted_blocks"`
}

// SyncBlocks 增量同步 Block 数据
func (h *BlockHandler) SyncBlocks(c *gin.Context) {
	var req SyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	if err := h.blockService.SyncBlocks(req.UpdatedBlocks, req.DeletedBlocks); err != nil {
		response.Error(c, http.StatusInternalServerError, "Sync failed: "+err.Error())
		return
	}

	response.Success(c, gin.H{
		"updated_count": len(req.UpdatedBlocks),
		"deleted_count": len(req.DeletedBlocks),
	})
}

// GetChildren 获取某个节点的直接子节点（侧边栏目录树）
func (h *BlockHandler) GetChildren(c *gin.Context) {
	// 获取 parent_id 参数（可选）
	parentIDStr := c.Query("parent_id")
	var parentID *uuid.UUID

	if parentIDStr != "" && parentIDStr != "null" {
		parsed, err := uuid.Parse(parentIDStr)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "Invalid parent_id")
			return
		}
		parentID = &parsed
	}

	// 查询子节点
	children, err := h.blockService.GetChildren(parentID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get children: "+err.Error())
		return
	}

	response.Success(c, children)
}
