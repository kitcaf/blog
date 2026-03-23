package search

import (
	"blog-backend/internal/services"
	"blog-backend/test/testutil"
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPublicSearchOnlyShowsPublished 测试公开搜索只显示已发布内容
func TestPublicSearchOnlyShowsPublished(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建已发布页面
	publishedPage := testutil.CreateTestPage(t, db, userID, rootID, "Published", true)
	publishedBlock := testutil.CreateTestBlock(t, db, userID, publishedPage, "searchable content")
	searchService.IndexBlock(ctx, publishedBlock.ID)

	// 创建未发布页面
	unpublishedPage := testutil.CreateTestPage(t, db, userID, rootID, "Unpublished", false)
	unpublishedBlock := testutil.CreateTestBlock(t, db, userID, unpublishedPage, "searchable content")
	searchService.IndexBlock(ctx, unpublishedBlock.ID)

	// 公开搜索
	results, err := searchService.SearchPublishedPages(ctx, "searchable")
	require.NoError(t, err)

	// 只应该返回已发布的页面
	assert.Equal(t, 1, len(results))
	assert.Equal(t, publishedPage.ID, results[0].PageID)
}

// TestUnpublishPageHidesFromPublicSearch 测试撤回发布后公开搜索不可见
func TestUnpublishPageHidesFromPublicSearch(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建已发布页面
	page := testutil.CreateTestPage(t, db, userID, rootID, "Test Page", true)
	block := testutil.CreateTestBlock(t, db, userID, page, "searchable content")
	searchService.IndexBlock(ctx, block.ID)

	// 验证可以搜索到
	results, err := searchService.SearchPublishedPages(ctx, "searchable")
	require.NoError(t, err)
	assert.Equal(t, 1, len(results))

	// 撤回发布
	page.PublishedAt = nil
	db.Save(page)
	searchService.IndexBlock(ctx, block.ID)

	// 验证搜索不到
	results, err = searchService.SearchPublishedPages(ctx, "searchable")
	require.NoError(t, err)
	assert.Equal(t, 0, len(results))
}

// TestEmptyQueryReturnsEmptyResults 测试空查询返回空结果
func TestEmptyQueryReturnsEmptyResults(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, _ := testutil.CreateTestUser(t, db)

	// 测试空字符串
	results, err := searchService.SearchPages(ctx, userID, "")
	require.NoError(t, err)
	assert.Equal(t, 0, len(results))

	// 测试只有空格
	results, err = searchService.SearchPages(ctx, userID, "   ")
	require.NoError(t, err)
	assert.Equal(t, 0, len(results))
}

// TestChineseSearch 测试中文搜索
func TestChineseSearch(t *testing.T) {
	db := testutil.SetupTestDB(t)
	defer testutil.CleanupTestDB(t, db)

	ctx := context.Background()
	searchService := services.NewSearchService(db)
	userID, rootID := testutil.CreateTestUser(t, db)

	// 创建中文页面
	page := testutil.CreateTestPage(t, db, userID, rootID, "Go语言教程", true)
	block := testutil.CreateTestBlock(t, db, userID, page, "Go语言是一种编程语言")
	searchService.IndexBlock(ctx, block.ID)

	// 测试中文搜索
	results, err := searchService.SearchPublishedPages(ctx, "编程语言")
	require.NoError(t, err)
	assert.Equal(t, 1, len(results))
}
