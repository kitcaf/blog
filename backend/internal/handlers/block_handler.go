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
// 1. 解析请求体，获取需要更新 (updated_blocks) 和需要删除 (deleted_blocks) 列表
// 2. 【核心】利用 Postgres 原生的 UPSERT (ON CONFLICT DO UPDATE) 特性，仅针对内容相关字段做批量更新或插入，规避审计时间被覆盖
// 3. 利用原生的 IN(?) 语句执行批量式软删除 (UPDATE deleted_at)
// 4. 主动失效/清除对应的 Redis 缓存键
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
// 1. 【极致优化】利用 path 前缀索引和 type 过滤（root/folder/page），仅发一条单表 O(1) 数据库查询指令，捞出用户所有相关层级节点
// 2. 在 Go 的内存中建立指针哈希表，并以 O(N) 极低复杂度迅速完成父子节点的树级挂载与指针拼接
// 3. 按照各节点内置的 ContentIDs JSON 数组对其子节点进行就地排序，一次性抛出带有完整排序结构的渲染树
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
// 数据库操作步骤：
// 1. 开启事务 (Transaction) 保护一致性
// 2. 获取目标节点信息的当前状态（锁定其原始 parent_id 和 path）
// 3. 若为跨级，从原父节点的 content_ids (JSONB) 中移除自身记录，修改目标 node 的 parent_id 引用
// 4. 在新父节点中，直接复写全新的排列正确的 content_ids
// 5. 【极致优化】调用 Postgres 原生级 SQL 字符串拼接 SUBSTRING，级联一次性修正当前拖拽节点及其树下无穷子孙节点的所有 path 物化路径
// 6. 提交所有事务
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
