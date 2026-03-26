package services

import (
	"blog-backend/internal/dto"
	blockrepo "blog-backend/internal/repository/block"
	categoryrepo "blog-backend/internal/repository/blogcategory"
	"blog-backend/pkg/errors"
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	publicPostsCacheTTL = 5 * time.Minute
	publicPostCacheTTL  = 10 * time.Minute
)

type BlogPublicService struct {
	blockRepo    *blockrepo.BlockRepository
	categoryRepo *categoryrepo.Repository
	blockService *BlockService
	rdb          *redis.Client
}

func NewBlogPublicService(db *gorm.DB, rdb *redis.Client, blockService *BlockService) *BlogPublicService {
	return &BlogPublicService{
		blockRepo:    blockrepo.NewBlockRepository(db),
		categoryRepo: categoryrepo.NewRepository(db),
		blockService: blockService,
		rdb:          rdb,
	}
}

func (s *BlogPublicService) ListPosts(
	ctx context.Context,
	page int,
	limit int,
	categorySlug string,
) (*dto.PublicPostsPage, error) {
	cacheKey := buildPublicPostsCacheKey(page, limit, categorySlug)
	if cachedPage, cacheHit := s.getCachedPublicPostsPage(ctx, cacheKey); cacheHit {
		return cachedPage, nil
	}

	posts, total, err := s.blockRepo.ListPublicPostSummaries(ctx, page, limit, categorySlug)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	result := &dto.PublicPostsPage{
		Posts: posts,
		Total: total,
		Page:  page,
		Limit: limit,
	}

	s.setCachedJSON(ctx, cacheKey, result, publicPostsCacheTTL)
	return result, nil
}

func (s *BlogPublicService) GetPostDetail(ctx context.Context, slug string) (*dto.PublicPostDetail, error) {
	cacheKey := publicPostCachePrefix + slug
	if cachedDetail, cacheHit := s.getCachedPublicPostDetail(ctx, cacheKey); cacheHit {
		return cachedDetail, nil
	}

	page, blocks, err := s.blockService.GetPageBySlug(slug)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New(errors.ErrPageNotFoundInternal, "public post not found")
		}
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	var category *dto.PublicPostCategory
	if page.CategoryID != nil {
		blogCategory, categoryErr := s.categoryRepo.FindPublicByID(ctx, *page.CategoryID)
		if categoryErr == nil {
			category = &dto.PublicPostCategory{
				ID:   blogCategory.ID,
				Name: blogCategory.Name,
				Slug: blogCategory.Slug,
			}
		} else if categoryErr != gorm.ErrRecordNotFound {
			return nil, errors.Wrap(errors.ErrDatabaseQuery, categoryErr)
		}
	}

	detail, err := buildPublicPostDetail(page, blocks, category)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	s.setCachedJSON(ctx, cacheKey, detail, publicPostCacheTTL)
	return detail, nil
}

func (s *BlogPublicService) ListCategories(ctx context.Context) ([]dto.BlogCategoryWithCount, error) {
	if s.rdb != nil {
		var cachedCategories []dto.BlogCategoryWithCount
		if cacheHit := s.getCachedJSON(ctx, publicCategoriesCacheKey, &cachedCategories); cacheHit {
			return cachedCategories, nil
		}
	}

	categories, err := s.categoryRepo.ListPublicWithPostCount(ctx)
	if err != nil {
		return nil, errors.Wrap(errors.ErrDatabaseQuery, err)
	}

	s.setCachedJSON(ctx, publicCategoriesCacheKey, categories, publicPostsCacheTTL)
	return categories, nil
}

func buildPublicPostsCacheKey(page int, limit int, categorySlug string) string {
	return publicPostsListCachePrefix +
		"page:" + jsonInt(page) +
		":limit:" + jsonInt(limit) +
		":category:" + categorySlug
}

func jsonInt(value int) string {
	return strconv.Itoa(value)
}

func (s *BlogPublicService) getCachedPublicPostsPage(ctx context.Context, key string) (*dto.PublicPostsPage, bool) {
	var cachedPage dto.PublicPostsPage
	if !s.getCachedJSON(ctx, key, &cachedPage) {
		return nil, false
	}
	return &cachedPage, true
}

func (s *BlogPublicService) getCachedPublicPostDetail(ctx context.Context, key string) (*dto.PublicPostDetail, bool) {
	var cachedDetail dto.PublicPostDetail
	if !s.getCachedJSON(ctx, key, &cachedDetail) {
		return nil, false
	}
	return &cachedDetail, true
}

func (s *BlogPublicService) getCachedJSON(ctx context.Context, key string, destination interface{}) bool {
	if s.rdb == nil {
		return false
	}

	cachedValue, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("failed to get cached json for key %s: %v", key, err)
		}
		return false
	}

	if err := json.Unmarshal([]byte(cachedValue), destination); err != nil {
		log.Printf("failed to unmarshal cached json for key %s: %v", key, err)
		return false
	}

	return true
}

func (s *BlogPublicService) setCachedJSON(ctx context.Context, key string, payload interface{}, ttl time.Duration) {
	if s.rdb == nil {
		return
	}

	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		log.Printf("failed to marshal cache payload for key %s: %v", key, err)
		return
	}

	if err := s.rdb.Set(ctx, key, encodedPayload, ttl).Err(); err != nil {
		log.Printf("failed to set cache payload for key %s: %v", key, err)
		return
	}
}
