package handlers

import (
	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type BlogCategoryHandler struct {
	service *services.BlogCategoryService
}

type upsertBlogCategoryRequest struct {
	Name        string  `json:"name" binding:"required"`
	Slug        *string `json:"slug"`
	Description *string `json:"description"`
	SortOrder   int     `json:"sort_order"`
}

func NewBlogCategoryHandler(service *services.BlogCategoryService) *BlogCategoryHandler {
	return &BlogCategoryHandler{service: service}
}

func (h *BlogCategoryHandler) List(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	categories, err := h.service.ListCategories(userID)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.Success(c, categories)
}

func (h *BlogCategoryHandler) Create(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	var request upsertBlogCategoryRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	category, err := h.service.CreateCategory(
		userID,
		request.Name,
		request.Slug,
		request.Description,
		request.SortOrder,
	)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "分类创建成功", category)
}

func (h *BlogCategoryHandler) Update(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	categoryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid category ID")
		return
	}

	var request upsertBlogCategoryRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	category, err := h.service.UpdateCategory(
		userID,
		categoryID,
		request.Name,
		request.Slug,
		request.Description,
		request.SortOrder,
	)
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "分类更新成功", category)
}

func (h *BlogCategoryHandler) Delete(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	categoryID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid category ID")
		return
	}

	if err := h.service.DeleteCategory(userID, categoryID); err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "分类删除成功", gin.H{"id": categoryID})
}
