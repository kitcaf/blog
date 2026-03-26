package handlers

import (
	"blog-backend/internal/services"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PagePublishHandler struct {
	service *services.PagePublishService
}

type updatePageMetaRequest struct {
	Description OptionalValue[string]    `json:"description"`
	Tags        OptionalValue[[]string]  `json:"tags"`
	CategoryID  OptionalValue[uuid.UUID] `json:"category_id"`
	Slug        OptionalValue[string]    `json:"slug"`
}

type publishPageRequest struct {
	CategoryID OptionalValue[uuid.UUID] `json:"category_id"`
	Tags       OptionalValue[[]string]  `json:"tags"`
	Slug       OptionalValue[string]    `json:"slug"`
}

type publishSubtreeRequest struct {
	CategoryID OptionalValue[uuid.UUID] `json:"category_id"`
	Tags       OptionalValue[[]string]  `json:"tags"`
}

func NewPagePublishHandler(service *services.PagePublishService) *PagePublishHandler {
	return &PagePublishHandler{service: service}
}

func (h *PagePublishHandler) UpdateMeta(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	pageID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid page ID")
		return
	}

	var request updatePageMetaRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	updatedPage, err := h.service.UpdatePageMeta(userID, pageID, services.PageMetaPatch{
		DescriptionSet: request.Description.Set,
		Description:    request.Description.Value,
		TagsSet:        request.Tags.Set,
		Tags:           derefOptionalSlice(request.Tags.Value),
		CategorySet:    request.CategoryID.Set,
		CategoryID:     request.CategoryID.Value,
		SlugSet:        request.Slug.Set,
		Slug:           request.Slug.Value,
	})
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "页面属性更新成功", updatedPage)
}

func (h *PagePublishHandler) Publish(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	pageID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid page ID")
		return
	}

	var request publishPageRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	result, err := h.service.PublishPage(userID, pageID, services.PublishPageCommand{
		CategorySet: request.CategoryID.Set,
		CategoryID:  request.CategoryID.Value,
		TagsSet:     request.Tags.Set,
		Tags:        derefOptionalSlice(request.Tags.Value),
		SlugSet:     request.Slug.Set,
		Slug:        request.Slug.Value,
	})
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "发布成功", result)
}

func (h *PagePublishHandler) Unpublish(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	pageID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid page ID")
		return
	}

	if err := h.service.UnpublishPage(userID, pageID); err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "取消发布成功", gin.H{"page_id": pageID})
}

func (h *PagePublishHandler) PublishSubtree(c *gin.Context) {
	userID, ok := requireAuthenticatedUserID(c)
	if !ok {
		return
	}

	rootID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "Invalid page ID")
		return
	}

	var request publishSubtreeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	result, err := h.service.PublishSubtree(userID, rootID, services.PublishSubtreeCommand{
		CategorySet: request.CategoryID.Set,
		CategoryID:  request.CategoryID.Value,
		TagsSet:     request.Tags.Set,
		Tags:        derefOptionalSlice(request.Tags.Value),
	})
	if err != nil {
		response.HandleError(c, err)
		return
	}

	response.SuccessWithMessage(c, "批量发布成功", result)
}

func derefOptionalSlice[T any](value *[]T) []T {
	if value == nil {
		return nil
	}
	return *value
}
