package testutil

import (
	"blog-backend/internal/models"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// CreateTestUser 创建测试用户和 root block
func CreateTestUser(t *testing.T, db *gorm.DB) (userID, rootID uuid.UUID) {
	userID = uuid.New()
	rootID = uuid.New()
	path := "/" + rootID.String() + "/"

	root := &models.Block{
		ID:         rootID,
		Path:       path,
		Type:       "root",
		ContentIDs: json.RawMessage("[]"),
		Properties: json.RawMessage("{}"),
		CreatedBy:  &userID,
	}
	require.NoError(t, db.Create(root).Error)
	return
}

// CreateTestPage 创建测试页面
func CreateTestPage(t *testing.T, db *gorm.DB, userID, rootID uuid.UUID, title string, published bool) *models.Block {
	pageID := uuid.New()
	rootPath := "/" + rootID.String() + "/"
	pagePath := rootPath + pageID.String() + "/"

	props := map[string]interface{}{"title": title, "icon": "📄"}
	propsJSON, _ := json.Marshal(props)

	var publishedAt *time.Time
	if published {
		now := time.Now()
		publishedAt = &now
	}

	page := &models.Block{
		ID:          pageID,
		ParentID:    &rootID,
		Path:        pagePath,
		Type:        "page",
		ContentIDs:  json.RawMessage("[]"),
		Properties:  propsJSON,
		CreatedBy:   &userID,
		PublishedAt: publishedAt,
	}
	require.NoError(t, db.Create(page).Error)
	return page
}

// CreateTestBlock 创建测试内容块
func CreateTestBlock(t *testing.T, db *gorm.DB, userID uuid.UUID, page *models.Block, content string) *models.Block {
	blockID := uuid.New()
	blockPath := page.Path + blockID.String() + "/"

	props := map[string]interface{}{
		"content": []map[string]interface{}{{"text": content}},
	}
	propsJSON, _ := json.Marshal(props)

	block := &models.Block{
		ID:         blockID,
		ParentID:   &page.ID,
		Path:       blockPath,
		Type:       "paragraph",
		ContentIDs: json.RawMessage("[]"),
		Properties: propsJSON,
		CreatedBy:  &userID,
	}
	require.NoError(t, db.Create(block).Error)
	return block
}
