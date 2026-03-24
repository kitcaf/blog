package handlers

import (
	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/pkg/response"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
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
// 1. 验证或寻找父节点，若为顶层则绑定至用户所属的隐藏 root block 上
// 2. 结合父级的 Path 生成子级专属的物化路径 (Materialized Path)
// 3. 若为 page 即刻读取 properties 生成附有短哈希盐的防撞 slug
// 4. 将新的 block 作为完全独立行 INSERT 进数据库
// 5. 【极致优化】依赖 Postgres 的原生 jsonb 操作（|| 运算符），一条 SQL 将新 ID 全原子化、无并发锁竞争地追加至父节点 content_ids 末尾
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
	// 极致优化：使用 Postgres 原生 jsonb 追加，避免并发下的幽灵写入
	if err := h.blockService.AppendContentID(userID, *block.ParentID, block.ID); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update parent: "+err.Error())
		return
	}

	response.Success(c, block)
}

// UpdatePage 更新页面
// 数据库操作步骤：
// 1. 接收与解析目标 ID（UUID）及新传递进来的 JSON Body
// 2. 利用 JSONB 整体覆盖目标 block 的 properties 或其他纯文本标量字段（注意该接口并非拖拽的专有接口）
// 3. 检测如果是 page 且发生了标题变动，在 Go 端纯计算重新生成短哈希拼装 slug
// 4. 持久化所有的标量变动 (Save)
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

// DeletePage 删除页面和文件夹
// 数据库操作步骤：
// 1. 接收欲删除的页面 ID (UUID)
// 2. 【极致优化】巧妙结合 UPDATE 和 Postgres 的 RETURNING 特性去执行它的软删除操作。由于增加了约束条件，借此操作一次性零损耗完成了鉴权验证并带回它的 parent_id 以及完整的 path。
// 3. 读取上一原生步提取的 path 凭借 LIKE 查询法，发送一条单行纯 SQL 级联将一切相关的多层子孙全部置上软删标签。
// 4. 【极致优化】由于第一步获取到了 parent_id，利用 Postgres 原生 jsonb 减法 ( - 运算符 ) 将自己从老父级的 content_ids 排列中直接驱离，绝无内存读取后覆写的并发丢失事故。
func (h *PageHandler) DeletePage(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// 步骤1：验证 page ID
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid page ID")
		return
	}

	// 步骤2：执行删除逻辑，依赖于服务层的 RETURNING 机制实现极其高效的软状态清理和数组解绑
	if err := h.blockService.DeletePage(userID, id); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			status = http.StatusNotFound
		case errors.Is(err, gorm.ErrInvalidData):
			status = http.StatusBadRequest
		}
		response.Error(c, status, "Failed to delete page: "+err.Error())
		return
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
// (注：该方法为传统旧接口逻辑补充，主干同级与降维推荐走 BlockHandler 里的事务移动)
// 1. 解析需要拖拽的目标旧块与新附着父节点的 ID，计算新排列位置
// 2. 脱离原组织：凭借 JSON Unmarshal 从原父节点中内存层面移走 (待优化为原生并发版)
// 3. 计算投靠：重构自身的 parent_id 和基于新父级的 path 并发送 Update
// 4. 级联重写：基于全新的物化前缀发送子域模糊匹配执行一波大规模字串替换 SQL 迁移下级
// 5. 融于新家：根据 JSON 压盖新的 content_ids 给目标父系节点并落库
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
