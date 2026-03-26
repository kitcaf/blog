package services

import (
	"context"
	"log"
	"strings"

	"github.com/google/uuid"
)

const (
	publicPostCachePrefix      = "public:post:"
	publicPostsListCachePrefix = "public:posts:"
	publicCategoriesCacheKey   = "public:categories"
	pageBlocksCachePrefix      = "page:blocks:"
)

// InvalidatePublishedContentCaches 清理公开文章详情、列表和分类缓存。
// 缓存清理是数据库提交后的最佳努力操作，失败时记录日志而不回滚业务状态。
func (s *BlockService) InvalidatePublishedContentCaches(slugs ...string) {
	if s.rdb == nil {
		return
	}

	ctx := context.Background()
	for _, slug := range slugs {
		trimmedSlug := strings.TrimSpace(slug)
		if trimmedSlug == "" {
			continue
		}

		if err := s.rdb.Del(ctx,
			pageBlocksCachePrefix+trimmedSlug,
			publicPostCachePrefix+trimmedSlug,
		).Err(); err != nil {
			log.Printf("failed to invalidate page caches for slug %s: %v", trimmedSlug, err)
		}
	}

	s.invalidatePublicPostsListCaches(ctx)
	s.invalidatePublicCategoriesCache(ctx)
}

// ReindexPublishedPage 触发单篇文章的发布态索引刷新。
func (s *BlockService) ReindexPublishedPage(userID, pageID uuid.UUID) {
	if s.searchIndexer == nil {
		return
	}

	go func() {
		if err := s.publishPageReindexTask(context.Background(), userID, pageID); err != nil {
			log.Printf("failed to reindex published page %s: %v", pageID, err)
		}
	}()
}

// ReindexPublishedSubtree 触发目录子树下所有页面的发布态索引刷新。
func (s *BlockService) ReindexPublishedSubtree(userID uuid.UUID, rootPath string) {
	if s.searchIndexer == nil || strings.TrimSpace(rootPath) == "" {
		return
	}

	go func() {
		if err := s.publishFolderSubtreeReindexTask(context.Background(), userID, rootPath); err != nil {
			log.Printf("failed to reindex published subtree %s: %v", rootPath, err)
		}
	}()
}

func (s *BlockService) invalidateKeysByPattern(ctx context.Context, pattern string) {
	if s.rdb == nil {
		return
	}

	var cursor uint64
	for {
		keys, nextCursor, err := s.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			log.Printf("failed to scan redis keys with pattern %s: %v", pattern, err)
			return
		}

		if len(keys) > 0 {
			if err := s.rdb.Del(ctx, keys...).Err(); err != nil {
				log.Printf("failed to delete redis keys with pattern %s: %v", pattern, err)
				return
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			return
		}
	}
}

func (s *BlockService) invalidatePublicPostsListCaches(ctx context.Context) {
	s.invalidateKeysByPattern(ctx, publicPostsListCachePrefix+"*")
}

func (s *BlockService) invalidatePublicCategoriesCache(ctx context.Context) {
	if s.rdb == nil {
		return
	}

	if err := s.rdb.Del(ctx, publicCategoriesCacheKey).Err(); err != nil {
		log.Printf("failed to delete public categories cache: %v", err)
	}
}
