package handlers

import (
	"blog-backend/internal/services"
	"blog-backend/pkg/response"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SearchHandler struct {
	searchService *services.SearchService
}

func NewSearchHandler(searchService *services.SearchService) *SearchHandler {
	return &SearchHandler{
		searchService: searchService,
	}
}

// SearchPages 搜索页面（管理后台）
// @Summary 搜索页面
// @Tags Search
// @Accept json
// @Produce json
// @Param q query string true "搜索关键词"
// @Param limit query int false "返回数量限制" default(10)
// @Success 200 {object} response.Response{data=[]models.PageSearchResult}
// @Router /api/admin/search [get]
func (h *SearchHandler) SearchPages(c *gin.Context) {
	// 获取当前用户 ID
	userID, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "未授权")
		return
	}

	uid, ok := userID.(uuid.UUID)
	if !ok {
		response.Unauthorized(c, "未授权")
		return
	}

	// 获取查询参数
	query := c.Query("q")
	if query == "" {
		response.BadRequest(c, "搜索关键词不能为空")
		return
	}

	// 获取限制参数
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := parseLimit(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 50 {
			limit = parsedLimit
		}
	}

	// 执行搜索
	results, err := h.searchService.SearchPages(c.Request.Context(), uid, query, limit)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "搜索失败: "+err.Error())
		return
	}

	response.Success(c, results)
}

// SearchPublicPages 搜索已发布的页面（前台）
// @Summary 搜索已发布的页面
// @Tags Search
// @Accept json
// @Produce json
// @Param q query string true "搜索关键词"
// @Param limit query int false "返回数量限制" default(10)
// @Success 200 {object} response.Response{data=[]models.PageSearchResult}
// @Router /api/search [get]
func (h *SearchHandler) SearchPublicPages(c *gin.Context) {
	// 获取查询参数
	query := c.Query("q")
	if query == "" {
		response.BadRequest(c, "搜索关键词不能为空")
		return
	}

	// 获取限制参数
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := parseLimit(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 50 {
			limit = parsedLimit
		}
	}

	// 执行搜索
	results, err := h.searchService.SearchPublishedPages(c.Request.Context(), query, limit)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "搜索失败: "+err.Error())
		return
	}

	response.Success(c, results)
}

// parseLimit 解析 limit 参数
func parseLimit(limitStr string) (int, error) {
	var limit int
	if _, err := fmt.Sscanf(limitStr, "%d", &limit); err != nil {
		return 0, err
	}
	return limit, nil
}
