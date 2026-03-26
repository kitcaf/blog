package handlers

import (
	"blog-backend/pkg/errors"
	"blog-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func requireAuthenticatedUserID(c *gin.Context) (uuid.UUID, bool) {
	rawUserID, exists := c.Get("user_id")
	if !exists {
		response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "user not authenticated"))
		return uuid.Nil, false
	}

	userID, ok := rawUserID.(uuid.UUID)
	if !ok {
		response.ErrorWithCode(c, errors.New(errors.ErrUnauthorized, "invalid user ID format"))
		return uuid.Nil, false
	}

	return userID, true
}
