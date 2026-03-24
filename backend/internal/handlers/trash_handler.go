package handlers

import (
	"errors"
	"net/http"

	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TrashHandler struct {
	blockService *services.BlockService
}

type BatchDeleteTrashRequest struct {
	IDs []uuid.UUID `json:"ids" binding:"required,min=1"`
}

func NewTrashHandler(blockService *services.BlockService) *TrashHandler {
	return &TrashHandler{blockService: blockService}
}

// ListTrash 获取当前用户回收站根项列表。
func (h *TrashHandler) ListTrash(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	items, err := h.blockService.GetTrashItems(userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get trash items")
		return
	}

	response.Success(c, items)
}

// RestoreTrashItem 恢复一个回收站根项。
func (h *TrashHandler) RestoreTrashItem(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid trash item ID")
		return
	}

	if err := h.blockService.RestoreTrashItem(userID, id); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			status = http.StatusNotFound
		case errors.Is(err, gorm.ErrInvalidData):
			status = http.StatusBadRequest
		}
		response.Error(c, status, "Failed to restore trash item: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "恢复成功"})
}

// DeleteTrashItem 永久删除一个回收站根项。
func (h *TrashHandler) DeleteTrashItem(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid trash item ID")
		return
	}

	if err := h.blockService.PermanentlyDeleteTrashItem(userID, id); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status = http.StatusNotFound
		}
		response.Error(c, status, "Failed to permanently delete trash item: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "永久删除成功"})
}

// BatchDeleteTrashItems 批量永久删除多个回收站根项。
func (h *TrashHandler) BatchDeleteTrashItems(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	var req BatchDeleteTrashRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	uniqueIDs := sanitizeUUIDs(req.IDs)
	if len(uniqueIDs) == 0 {
		response.Error(c, http.StatusBadRequest, "Invalid request: ids cannot be empty")
		return
	}

	if err := h.blockService.PermanentlyDeleteTrashItems(userID, uniqueIDs); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status = http.StatusNotFound
		}
		response.Error(c, status, "Failed to batch delete trash items: "+err.Error())
		return
	}

	response.Success(c, gin.H{
		"message":       "批量永久删除成功",
		"deleted_count": len(uniqueIDs),
	})
}

func sanitizeUUIDs(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return nil
	}

	seen := make(map[uuid.UUID]struct{}, len(ids))
	result := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}

	return result
}
