package handlers

import (
	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/pkg/response"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

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
	userID := c.MustGet("user_id").(uuid.UUID)
	includeUnpublished := c.DefaultQuery("include_unpublished", "true") == "true"

	pages, err := h.blockService.GetPages(userID, includeUnpublished)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get pages")
		return
	}

	response.Success(c, pages)
}

// GetPage 获取单个页面详情
func (h *PageHandler) GetPage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	page, err := h.blockService.GetPageByID(userID, id)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Page not found")
		return
	}

	response.Success(c, page)
}

// GetPublicPages 获取公开页面列表
func (h *PageHandler) GetPublicPages(c *gin.Context) {
	pages, err := h.blockService.GetPublicPages()
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to get pages")
		return
	}

	response.Success(c, pages)
}

// GetPageBySlug 根据 slug 获取页面内容
func (h *PageHandler) GetPageBySlug(c *gin.Context) {
	slug := c.Param("slug")

	page, blocks, err := h.blockService.GetPageBySlug(slug)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Page not found")
		return
	}

	response.Success(c, gin.H{
		"page":   page,
		"blocks": blocks,
	})
}

// CreatePage 创建页面或文件夹类型的block
// 数据库操作步骤：
// 1. 设置审计字段（created_by, last_edited_by）
// 2. 如果 parent_id 为 null，查询用户的 root block 并设置为父节点
// 3. 计算物化路径（path）：root 节点 /{root_id}/，子节点 {parent.path}{id}/
// 4. 为 page 类型自动生成 slug（标题 + 6位随机哈希）
// 5. 插入新 block 到数据库
// 6. 更新父节点的 content_ids 字段（将新 block 的 id 追加到父节点的 content_ids 数组）
func (h *PageHandler) CreatePage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	var block models.Block
	if err := c.ShouldBindJSON(&block); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 步骤1：设置审计字段
	block.CreatedBy = &userID
	block.LastEditedBy = &userID

	// 步骤2：如果 parent_id 为 null，使用用户的 root block
	var parent *models.Block
	if block.ParentID == nil {
		// 查询用户的 root block
		rootBlock, err := h.blockService.GetOrCreateRootBlock(userID)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, "Failed to get root block: "+err.Error())
			return
		}
		block.ParentID = &rootBlock.ID
		parent = rootBlock
	} else {
		// 查询指定的父节点
		var err error
		parent, err = h.blockService.GetPageByID(userID, *block.ParentID)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "Parent not found: "+err.Error())
			return
		}
	}

	// 步骤3：计算物化路径
	// path = {parent.path}{id}/
	block.Path = parent.Path + block.ID.String() + "/"

	// 步骤4：为 page | block 类型自动生成 slug
	if (block.Type == "page" || block.Type == "folder") && block.Slug == nil {
		// 从 properties 中提取 title
		var props map[string]interface{}
		if err := json.Unmarshal(block.Properties, &props); err == nil {
			if title, ok := props["title"].(string); ok && title != "" {
				// 生成 slug：标题 + 6位随机哈希
				slug := generateSlugFromTitle(title, 6)
				block.Slug = &slug
			}
		}
	}

	// 步骤5：插入新 block 到数据库
	if err := h.blockService.CreatePage(&block); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to create page: "+err.Error())
		return
	}

	// 步骤6：更新父节点的 content_ids 字段
	// 解析父节点的 content_ids
	var contentIDs []string
	if err := json.Unmarshal(parent.ContentIDs, &contentIDs); err != nil {
		contentIDs = []string{}
	}

	// 追加新 block 的 id
	contentIDs = append(contentIDs, block.ID.String())

	// 序列化回 JSON
	newContentIDs, err := json.Marshal(contentIDs)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update parent content_ids: "+err.Error())
		return
	}

	// 更新父节点
	parent.ContentIDs = newContentIDs
	if err := h.blockService.UpdatePage(userID, parent); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update parent: "+err.Error())
		return
	}

	response.Success(c, block)
}

// UpdatePage 更新页面
// 数据库操作步骤：
// 1. 验证 page ID 格式
// 2. 解析请求体中的 block 数据
// 3. 设置 last_edited_by 审计字段
// 4. 如果修改了 title，重新生成 slug（仅 page 类型）
// 5. 更新数据库中的 block 记录
func (h *PageHandler) UpdatePage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：验证 page ID
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	// 步骤2：解析请求体
	var block models.Block
	if err := c.ShouldBindJSON(&block); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	block.ID = id

	// 步骤3：设置审计字段
	block.LastEditedBy = &userID

	// 步骤4：如果是 page 类型且修改了 title，重新生成 slug
	if block.Type == "page" {
		var props map[string]interface{}
		if err := json.Unmarshal(block.Properties, &props); err == nil {
			if title, ok := props["title"].(string); ok && title != "" {
				// 如果 slug 为空或需要更新，重新生成
				if block.Slug == nil || *block.Slug == "" {
					slug := generateSlugFromTitle(title, 6)
					block.Slug = &slug
				}
			}
		}
	}

	// 步骤5：更新数据库
	if err := h.blockService.UpdatePage(userID, &block); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update page")
		return
	}

	response.Success(c, block)
}

// DeletePage 删除页面
// 数据库操作步骤：
// 1. 验证 page ID 格式
// 2. 查询要删除的 block（验证权限和存在性）
// 3. 软删除该 block 及其所有子孙节点（通过 path LIKE 匹配）
// 4. 从父节点的 content_ids 中移除该 block 的 id
func (h *PageHandler) DeletePage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：验证 page ID
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	// 步骤2：查询要删除的 block
	block, err := h.blockService.GetPageByID(userID, id)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Page not found")
		return
	}

	// 步骤3：软删除该 block 及其子孙节点
	if err := h.blockService.DeletePage(userID, id); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to delete page")
		return
	}

	// 步骤4：从父节点的 content_ids 中移除
	if block.ParentID != nil {
		parent, err := h.blockService.GetPageByID(userID, *block.ParentID)
		if err == nil {
			// 解析父节点的 content_ids
			var contentIDs []string
			if err := json.Unmarshal(parent.ContentIDs, &contentIDs); err == nil {
				// 移除被删除的 block id
				newContentIDs := []string{}
				for _, cid := range contentIDs {
					if cid != id.String() {
						newContentIDs = append(newContentIDs, cid)
					}
				}

				// 更新父节点
				if newContentIDsJSON, err := json.Marshal(newContentIDs); err == nil {
					parent.ContentIDs = newContentIDsJSON
					h.blockService.UpdatePage(userID, parent)
				}
			}
		}
	}

	response.Success(c, gin.H{"message": "删除成功"})
}

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数：Slug 生成
// ─────────────────────────────────────────────────────────────────────────────

var nonAlphanumericHanRegex = regexp.MustCompile(`[^\w\x{4e00}-\x{9fa5}]+`)

// generateSlugFromTitle 根据标题生成 slug
// 格式：标题转换 + 指定长度的随机哈希
func generateSlugFromTitle(title string, hashLength int) string {
	// 1. 转小写
	slug := strings.ToLower(title)

	// 2. 替换空格和特殊字符为连字符
	slug = nonAlphanumericHanRegex.ReplaceAllString(slug, "-")

	// 3. 移除首尾的连字符
	slug = strings.Trim(slug, "-")

	// 4. 限制长度（保留前50个字符）
	if len(slug) > 50 {
		slug = slug[:50]
		// 确保不在单词中间截断
		if lastDash := strings.LastIndex(slug, "-"); lastDash > 30 {
			slug = slug[:lastDash]
		}
	}

	// 5. 添加指定长度的随机哈希避免冲突
	randomHash := generateRandomHash(hashLength)
	if slug == "" {
		// 如果标题为空或全是特殊字符，使用 "page" 前缀
		slug = "page-" + randomHash
	} else {
		slug = slug + "-" + randomHash
	}

	return slug
}

// generateRandomHash 生成指定长度的随机十六进制字符串
func generateRandomHash(length int) string {
	bytes := make([]byte, (length+1)/2)
	if _, err := rand.Read(bytes); err != nil {
		// 降级方案：使用时间戳的哈希
		return fmt.Sprintf("%0*x", length, time.Now().UnixNano()%1000000)[:length]
	}
	return hex.EncodeToString(bytes)[:length]
}

// MovePage 移动页面或文件夹到新位置
// 数据库操作步骤：
// 1. 验证 block ID 和请求参数
// 2. 查询要移动的 block 和新父节点
// 3. 从旧父节点的 content_ids 中移除
// 4. 更新 block 的 parent_id 和 path（递归更新所有子孙节点的 path）
// 5. 将 block 添加到新父节点的 content_ids 中（按指定位置插入）
type MovePageRequest struct {
	NewParentID   *string  `json:"new_parent_id"`   // 新父节点 ID，null 表示移动到根目录
	NewContentIDs []string `json:"new_content_ids"` // 新父节点的完整 content_ids 顺序
}

func (h *PageHandler) MovePage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：验证 block ID
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid block ID")
		return
	}

	// 解析请求体
	var req MovePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// 步骤2：查询要移动的 block
	block, err := h.blockService.GetPageByID(userID, id)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Block not found")
		return
	}

	// 获取旧父节点
	var oldParent *models.Block
	if block.ParentID != nil {
		oldParent, err = h.blockService.GetPageByID(userID, *block.ParentID)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, "Old parent not found")
			return
		}
	}

	// 获取新父节点
	var newParent *models.Block
	var newParentID *uuid.UUID
	if req.NewParentID == nil || *req.NewParentID == "" {
		// 移动到根目录：使用用户的 root block
		rootBlock, err := h.blockService.GetOrCreateRootBlock(userID)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, "Failed to get root block: "+err.Error())
			return
		}
		newParent = rootBlock
		newParentID = &rootBlock.ID
	} else {
		// 移动到指定父节点
		parsedParentID, err := uuid.Parse(*req.NewParentID)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "Invalid new_parent_id")
			return
		}
		newParentID = &parsedParentID
		newParent, err = h.blockService.GetPageByID(userID, parsedParentID)
		if err != nil {
			response.Error(c, http.StatusNotFound, "New parent not found")
			return
		}
	}

	// 步骤3：从旧父节点的 content_ids 中移除
	if oldParent != nil {
		var oldContentIDs []string
		if err := json.Unmarshal(oldParent.ContentIDs, &oldContentIDs); err == nil {
			newOldContentIDs := []string{}
			for _, cid := range oldContentIDs {
				if cid != id.String() {
					newOldContentIDs = append(newOldContentIDs, cid)
				}
			}
			if oldContentIDsJSON, err := json.Marshal(newOldContentIDs); err == nil {
				oldParent.ContentIDs = oldContentIDsJSON
				h.blockService.UpdatePage(userID, oldParent)
			}
		}
	}

	// 步骤4：更新 block 的 parent_id 和 path
	oldPath := block.Path
	block.ParentID = newParentID
	block.Path = newParent.Path + block.ID.String() + "/"
	block.LastEditedBy = &userID

	if err := h.blockService.UpdatePage(userID, block); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update block")
		return
	}

	// 递归更新所有子孙节点的 path
	if err := h.blockService.UpdateDescendantPaths(userID, oldPath, block.Path); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update descendant paths")
		return
	}

	// 步骤5：更新新父节点的 content_ids
	if len(req.NewContentIDs) > 0 {
		// 使用前端提供的完整顺序
		if newContentIDsJSON, err := json.Marshal(req.NewContentIDs); err == nil {
			newParent.ContentIDs = newContentIDsJSON
			h.blockService.UpdatePage(userID, newParent)
		}
	} else {
		// 如果没有提供顺序，追加到末尾
		var newContentIDs []string
		if err := json.Unmarshal(newParent.ContentIDs, &newContentIDs); err == nil {
			// 确保不重复添加
			found := false
			for _, cid := range newContentIDs {
				if cid == id.String() {
					found = true
					break
				}
			}
			if !found {
				newContentIDs = append(newContentIDs, id.String())
			}
			if newContentIDsJSON, err := json.Marshal(newContentIDs); err == nil {
				newParent.ContentIDs = newContentIDsJSON
				h.blockService.UpdatePage(userID, newParent)
			}
		}
	}

	response.Success(c, block)
}
