package search

import (
	"blog-backend/internal/services"
	"blog-backend/test/testutil"
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSearchResultsSortedCorrectly 测试搜索结果按分数和更新时间排序
func TestSearchResultsSortedCorrectly(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建多个页面，确保有相同分数的情况
	page1 := testutil.CreateTestPage(t, db, userID, rootID, "Page 1", true)
	time.Sleep(10 * time.Millisecond)
	page2 := testutil.CreateTestPage(t, db, userID, rootID, "Page 2", true)
	time.Sleep(10 * time.Millisecond)
	page3 := testutil.CreateTestPage(t, db, userID, rootID, "Page 3", true)

	// 创建内容块（相同内容，相同分数）
	block1 := testutil.CreateTestBlock(t, db, userID, page1, "golang programming")
	block2 := testutil.CreateTestBlock(t, db, userID, page2, "golang programming")
	block3 := testutil.CreateTestBlock(t, db, userID, page3, "golang programming")

	// 索引所有块
	searchService.IndexBlock(ctx, block1.ID)
	searchService.IndexBlock(ctx, block2.ID)
	searchService.IndexBlock(ctx, block3.ID)

	// 搜索
	results, err := searchService.SearchPublishedPages(ctx, "golang")
	require.NoError(t, err)
	assert.Equal(t, 3, len(results))

	// 验证按更新时间降序排列（最新的在前）
	assert.Equal(t, page3.ID, results[0].PageID)
	assert.Equal(t, page2.ID, results[1].PageID)
	assert.Equal(t, page1.ID, results[2].PageID)
}

// TestMultiBlockMatchBonus 测试多块命中加分
func TestMultiBlockMatchBonus(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建两个页面
	page1 := testutil.CreateTestPage(t, db, userID, rootID, "Page 1", true)
	page2 := testutil.CreateTestPage(t, db, userID, rootID, "Page 2", true)

	// Page1 有多个匹配块
	block1_1 := testutil.CreateTestBlock(t, db, userID, page1, "golang is great")
	block1_2 := testutil.CreateTestBlock(t, db, userID, page1, "golang programming")
	block1_3 := testutil.CreateTestBlock(t, db, userID, page1, "golang tutorial")

	// Page2 只有一个匹配块
	block2_1 := testutil.CreateTestBlock(t, db, userID, page2, "golang is great")

	// 索引所有块
	searchService.IndexBlock(ctx, block1_1.ID)
	searchService.IndexBlock(ctx, block1_2.ID)
	searchService.IndexBlock(ctx, block1_3.ID)
	searchService.IndexBlock(ctx, block2_1.ID)

	// 搜索
	results, err := searchService.SearchPublishedPages(ctx, "golang")
	require.NoError(t, err)
	assert.Equal(t, 2, len(results))

	// Page1 应该排在前面（因为有多块命中加分）
	assert.Equal(t, page1.ID, results[0].PageID)
	assert.Equal(t, 3, results[0].MatchCount)
	assert.Greater(t, results[0].PageScore, results[1].PageScore)
}
