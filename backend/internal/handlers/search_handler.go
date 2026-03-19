package handlers

import (
	"blog-backend/internal/services"
	"blog-backend/pkg/errors"
	"blog-backend/pkg/response"

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
// @Success 200 {object} response.Response{data=[]models.PageSearchResult}
// @Router /api/admin/search [get]
func (h *SearchHandler) SearchPages(c *gin.Context) {
	// 获取当前用户 ID
	userID, exists := c.Get("user_id")
	if !exists {
		response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "user not authenticated"))
		return
	}

	uid, ok := userID.(uuid.UUID)
	if !ok {
		response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid user ID format"))
		return
	}

	// 获取查询参数
	query := c.Query("q")

	// 执行搜索（返回所有匹配结果）
	results, err := h.searchService.SearchPages(c.Request.Context(), uid, query)
	if err != nil {
		response.HandleError(c, err)
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
// @Success 200 {object} response.Response{data=[]models.PageSearchResult}
// @Router /api/public/search [get]
func (h *SearchHandler) SearchPublicPages(c *gin.Context) {
	// 获取查询参数
	query := c.Query("q")

	// 执行搜索（返回所有匹配结果）
	results, err := h.searchService.SearchPublishedPages(c.Request.Context(), query)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, results)
}
