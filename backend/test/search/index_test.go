package search

import (
	"blog-backend/internal/models"
	"blog-backend/internal/services"
	"blog-backend/test/testutil"
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestDeletePageRemovesIndexes 测试删除页面后索引被正确删除
func TestDeletePageRemovesIndexes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建页面和内容块
	page := testutil.CreateTestPage(t, db, userID, rootID, "Test Page", false)
	block := testutil.CreateTestBlock(t, db, userID, page, "Test content")

	// 索引内容块
	err := searchService.IndexBlock(ctx, block.ID)
	require.NoError(t, err)

	// 验证索引已创建
	var count int64
	db.Model(&models.BlockSearchIndex{}).Where("page_id = ?", page.ID).Count(&count)
	assert.Equal(t, int64(1), count)

	// 删除页面的索引
	err = searchService.DeleteBlockIndexesByPageID(ctx, page.ID, userID)
	require.NoError(t, err)

	// 验证索引已删除
	db.Model(&models.BlockSearchIndex{}).Where("page_id = ?", page.ID).Count(&count)
	assert.Equal(t, int64(0), count)
}

// TestPublishedAtFromPage 测试索引的 published_at 来自页面而非块
func TestPublishedAtFromPage(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建未发布的页面
	page := testutil.CreateTestPage(t, db, userID, rootID, "Unpublished Page", false)
	block := testutil.CreateTestBlock(t, db, userID, page, "Content")

	// 索引内容块
	err := searchService.IndexBlock(ctx, block.ID)
	require.NoError(t, err)

	// 验证索引的 published_at 为 nil
	var index models.BlockSearchIndex
	err = db.Where("block_id = ?", block.ID).First(&index).Error
	require.NoError(t, err)
	assert.Nil(t, index.PublishedAt)

	// 发布页面
	now := time.Now()
	page.PublishedAt = &now
	db.Save(page)

	// 重新索引
	err = searchService.IndexBlock(ctx, block.ID)
	require.NoError(t, err)

	// 验证索引的 published_at 已更新
	err = db.Where("block_id = ?", block.ID).First(&index).Error
	require.NoError(t, err)
	assert.NotNil(t, index.PublishedAt)
}

// TestBatchDeleteBlockIndexes 测试批量删除索引
func TestBatchDeleteBlockIndexes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建多个块
	page := testutil.CreateTestPage(t, db, userID, rootID, "Test Page", false)
	block1 := testutil.CreateTestBlock(t, db, userID, page, "Content 1")
	block2 := testutil.CreateTestBlock(t, db, userID, page, "Content 2")
	block3 := testutil.CreateTestBlock(t, db, userID, page, "Content 3")

	// 索引所有块
	searchService.IndexBlock(ctx, block1.ID)
	searchService.IndexBlock(ctx, block2.ID)
	searchService.IndexBlock(ctx, block3.ID)

	// 验证索引已创建
	var count int64
	db.Model(&models.BlockSearchIndex{}).Where("page_id = ?", page.ID).Count(&count)
	assert.Equal(t, int64(3), count)

	// 批量删除
	err := searchService.BatchDeleteBlockIndexes(ctx, []uuid.UUID{block1.ID, block2.ID})
	require.NoError(t, err)

	// 验证只剩一个索引
	db.Model(&models.BlockSearchIndex{}).Where("page_id = ?", page.ID).Count(&count)
	assert.Equal(t, int64(1), count)
}
