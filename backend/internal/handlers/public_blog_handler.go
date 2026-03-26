package handlers

import (
	"blog-backend/internal/services"
	"blog-backend/pkg/errors"
	"blog-backend/pkg/response"
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	defaultPublicPostsPage  = 1
	defaultPublicPostsLimit = 20
	maxPublicPostsLimit     = 100
)

type PublicBlogHandler struct {
	service *services.BlogPublicService
}

func NewPublicBlogHandler(service *services.BlogPublicService) *PublicBlogHandler {
	return &PublicBlogHandler{service: service}
}

func (h *PublicBlogHandler) ListPosts(c *gin.Context) {
	page, limit, err := parsePublicPagination(c.Query("page"), c.Query("limit"))
	if err != nil {
		response.HandleError(c, err)
		return
	}

	result, err := h.service.ListPosts(c.Request.Context(), page, limit, c.Query("category"))
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, result)
}

func (h *PublicBlogHandler) GetPost(c *gin.Context) {
	slug := c.Param("slug")
	if slug == "" {
		response.HandleError(c, errors.New(errors.ErrMissingRequired, "slug is required"))
		return
	}

	postDetail, err := h.service.GetPostDetail(c.Request.Context(), slug)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, postDetail)
}

func (h *PublicBlogHandler) ListCategories(c *gin.Context) {
	categories, err := h.service.ListCategories(c.Request.Context())
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, categories)
}

func parsePublicPagination(pageRaw string, limitRaw string) (int, int, error) {
	page := defaultPublicPostsPage
	limit := defaultPublicPostsLimit

	if pageRaw != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, errors.New(errors.ErrInvalidInput, "page must be a positive integer")
		}
		page = parsedPage
	}

	if limitRaw != "" {
		parsedLimit, err := strconv.Atoi(limitRaw)
		if err != nil || parsedLimit < 1 || parsedLimit > maxPublicPostsLimit {
			return 0, 0, errors.New(errors.ErrInvalidInput, "limit must be between 1 and 100")
		}
		limit = parsedLimit
	}

	return page, limit, nil
}
