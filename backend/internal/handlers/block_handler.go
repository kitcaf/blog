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
	userID := c.MustGet("user_id").(uuid.UUID)

	pageID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	blocks, err := h.blockService.GetBlocksByPageID(userID, pageID)
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

// SyncBlocks 批量更新 Block 数据（RESTful PUT 方式）
// 数据库操作步骤：
// 1. 解析请求体（updated_blocks 和 deleted_blocks）
// 2. 批量 UPSERT updated_blocks（插入新记录或更新已存在记录）
//   - 更新字段：properties, content_ids, path, parent_id, type, slug, published_at, last_edited_by, updated_at
//   - 不更新字段：id, created_by, created_at
//
// 3. 批量软删除 deleted_blocks（设置 deleted_at 时间戳）
// 4. 清除相关缓存（如果使用 Redis）
func (h *BlockHandler) SyncBlocks(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：解析请求体
	var req SyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 步骤2-4：调用 service 层处理批量同步
	if err := h.blockService.SyncBlocks(userID, req.UpdatedBlocks, req.DeletedBlocks); err != nil {
		response.Error(c, http.StatusInternalServerError, "Sync failed: "+err.Error())
		return
	}

	response.Success(c, gin.H{
		"updated_count": len(req.UpdatedBlocks),
		"deleted_count": len(req.DeletedBlocks),
	})
}

// GetTree 获取完整目录树（侧边栏）
// 数据库操作步骤：
// 1. 去掉 parent_id 参数解析，直接拉取用户的这整棵树
func (h *BlockHandler) GetTree(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	trees, err := h.blockService.GetSidebarTree(userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get tree: "+err.Error())
		return
	}

	response.Success(c, trees)
}

// MoveRequest 定义树节点移动和排序的通用请求结构
type MoveRequest struct {
	NewParentID   *uuid.UUID `json:"new_parent_id"`
	NewContentIDs []string   `json:"new_content_ids"`
}

// MoveBlock 统一处理同级拖拽排序和跨级拖拽移动
func (h *BlockHandler) MoveBlock(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	blockID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid block ID")
		return
	}

	var req MoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	if err := h.blockService.MoveBlock(userID, blockID, req.NewParentID, req.NewContentIDs); err != nil {
		response.Error(c, http.StatusInternalServerError, "Move failed: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "移动成功"})
}
