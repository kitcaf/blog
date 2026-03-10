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

// GetTree 获取目录树（侧边栏）
// 数据库操作步骤：
// 1. 解析 parent_id 查询参数（可选）
// 2. 如果 parent_id 为 null：查询用户的 root block，返回其直接子节点
// 3. 如果 parent_id 有值：查询 parent_id = ? 的子节点
// 4. 只返回 type IN ('page', 'folder') 的容器类型节点
// 5. 排序规则：按父节点的 content_ids 字段顺序排序（拖拽排序的结果）
// 6. 应用用户隔离（created_by = userID）和软删除过滤（deleted_at IS NULL）
func (h *BlockHandler) GetTree(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：解析 parent_id 参数
	parentIDStr := c.Query("parent_id")
	var parentID *uuid.UUID

	if parentIDStr != "" && parentIDStr != "null" {
		parsed, err := uuid.Parse(parentIDStr)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "Invalid parent_id")
			return
		}
		parentID = &parsed
	} else {
		// 步骤2：parent_id 为 null 时，查询用户的 root block
		rootBlock, err := h.blockService.GetOrCreateRootBlock(userID)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, "Failed to get root block: "+err.Error())
			return
		}
		parentID = &rootBlock.ID
	}

	// 步骤3-6：查询子节点（repository 层会按 content_ids 顺序排序）
	children, err := h.blockService.GetChildren(userID, parentID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get tree: "+err.Error())
		return
	}

	response.Success(c, children)
}
