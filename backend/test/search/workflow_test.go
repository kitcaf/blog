package search

import (
	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	"blog-backend/internal/services"
	"blog-backend/test/testutil"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFullWorkflow 测试完整工作流
func TestFullWorkflow(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	blockRepo := repository.NewBlockRepository(db)
	searchService := services.NewSearchService(db)

	// 1. 创建用户和 root
	userID, rootID := testutil.CreateTestUser(t, db)

	// 2. 创建已发布页面
	pageID := uuid.New()
	rootPath := "/" + rootID.String() + "/"
	pagePath := rootPath + pageID.String() + "/"
	now := time.Now()

	pageProps := map[string]interface{}{"title": "Go Programming", "icon": "📘"}
	pagePropsJSON, _ := json.Marshal(pageProps)

	page := &models.Block{
		ID:          pageID,
		ParentID:    &rootID,
		Path:        pagePath,
		Type:        "page",
		ContentIDs:  json.RawMessage("[]"),
		Properties:  pagePropsJSON,
		CreatedBy:   &userID,
		PublishedAt: &now,
	}
	require.NoError(t, blockRepo.Create(page))

	// 3. 创建内容块
	blockID := uuid.New()
	blockProps := map[string]interface{}{
		"content": []map[string]interface{}{
			{"text": "Go is a programming language"},
		},
	}
	blockPropsJSON, _ := json.Marshal(blockProps)

	block := &models.Block{
		ID:         blockID,
		ParentID:   &pageID,
		Path:       pagePath + blockID.String() + "/",
		Type:       "paragraph",
		ContentIDs: json.RawMessage("[]"),
		Properties: blockPropsJSON,
		CreatedBy:  &userID,
	}
	require.NoError(t, blockRepo.Create(block))

	// 4. 索引
	err := searchService.IndexBlock(ctx, blockID)
	require.NoError(t, err)

	// 5. 验证索引
	var index models.BlockSearchIndex
	err = db.Where("block_id = ?", blockID).First(&index).Error
	require.NoError(t, err)
	assert.Equal(t, pageID, index.PageID)
	assert.NotNil(t, index.PublishedAt)

	// 6. 搜索
	results, err := searchService.SearchPublishedPages(ctx, "programming")
	require.NoError(t, err)
	assert.Equal(t, 1, len(results))
	assert.Equal(t, "Go Programming", results[0].PageTitle)

	// 7. 撤回发布
	page.PublishedAt = nil
	db.Save(page)
	searchService.IndexBlock(ctx, blockID)

	// 8. 验证公开搜索不可见
	results, err = searchService.SearchPublishedPages(ctx, "programming")
	require.NoError(t, err)
	assert.Equal(t, 0, len(results))

	// 9. 验证私有搜索可见
	results, err = searchService.SearchPages(ctx, userID, "programming")
	require.NoError(t, err)
	assert.Equal(t, 1, len(results))

	// 10. 删除索引
	err = searchService.DeleteBlockIndexesByPageID(ctx, pageID, userID)
	require.NoError(t, err)

	// 11. 验证索引已删除
	var count int64
	db.Model(&models.BlockSearchIndex{}).Where("page_id = ?", pageID).Count(&count)
	assert.Equal(t, int64(0), count)
}
