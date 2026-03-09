package services

import (
	"context"
	"encoding/json"
	"time"

	"blog-backend/internal/models"
	"blog-backend/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type BlockService struct {
	blockRepo *repository.BlockRepository
	rdb       *redis.Client
}

func NewBlockService(blockRepo *repository.BlockRepository, rdb *redis.Client) *BlockService {
	return &BlockService{
		blockRepo: blockRepo,
		rdb:       rdb,
	}
}

// GetBlocksByPageID 获取页面的所有 Block（带用户隔离）
func (s *BlockService) GetBlocksByPageID(userID, pageID uuid.UUID) ([]models.Block, error) {
	page, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		return nil, err
	}

	return s.blockRepo.FindByPath(userID, page.Path)
}

// GetPageByID 获取单个页面详情（带用户隔离）
func (s *BlockService) GetPageByID(userID, pageID uuid.UUID) (*models.Block, error) {
	return s.blockRepo.FindByID(userID, pageID)
}

// GetPageBySlug 根据 slug 获取页面及其内容（公开接口）
func (s *BlockService) GetPageBySlug(slug string) (*models.Block, []models.Block, error) {
	// 尝试从缓存获取
	if s.rdb != nil {
		cacheKey := "page:blocks:" + slug
		cached, err := s.rdb.Get(context.Background(), cacheKey).Result()
		if err == nil {
			var result struct {
				Page   models.Block   `json:"page"`
				Blocks []models.Block `json:"blocks"`
			}
			if json.Unmarshal([]byte(cached), &result) == nil {
				return &result.Page, result.Blocks, nil
			}
		}
	}

	// 从数据库查询
	page, err := s.blockRepo.FindPageBySlug(slug)
	if err != nil {
		return nil, nil, err
	}

	// 获取页面的所有 blocks（使用页面创建者的 ID）
	blocks, err := s.blockRepo.FindByPath(*page.CreatedBy, page.Path)
	if err != nil {
		return nil, nil, err
	}

	// 缓存结果
	if s.rdb != nil {
		cacheKey := "page:blocks:" + slug
		data, _ := json.Marshal(map[string]interface{}{
			"page":   page,
			"blocks": blocks,
		})
		s.rdb.Set(context.Background(), cacheKey, data, time.Hour)
	}

	return page, blocks, nil
}

// GetPages 获取页面列表（带用户隔离）
func (s *BlockService) GetPages(userID uuid.UUID, includeUnpublished bool) ([]models.Block, error) {
	return s.blockRepo.FindPages(userID, includeUnpublished)
}

// GetPublicPages 获取所有已发布的页面（公开接口）
func (s *BlockService) GetPublicPages() ([]models.Block, error) {
	return s.blockRepo.FindPublicPages()
}

// CreatePage 创建页面
func (s *BlockService) CreatePage(block *models.Block) error {
	return s.blockRepo.Create(block)
}

// UpdatePage 更新页面（带用户隔离）
func (s *BlockService) UpdatePage(userID uuid.UUID, block *models.Block) error {
	return s.blockRepo.Update(userID, block)
}

// DeletePage 删除页面（软删除，带用户隔离）
func (s *BlockService) DeletePage(userID, pageID uuid.UUID) error {
	block, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		return err
	}

	return s.blockRepo.SoftDeleteByPath(userID, block.Path)
}

// SyncBlocks 增量同步 Block 数据（带用户隔离）
func (s *BlockService) SyncBlocks(userID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	// 批量 UPSERT
	if len(updatedBlocks) > 0 {
		if err := s.blockRepo.Upsert(userID, updatedBlocks); err != nil {
			return err
		}
	}

	// 软删除
	if len(deletedIDs) > 0 {
		if err := s.blockRepo.SoftDelete(userID, deletedIDs); err != nil {
			return err
		}
	}

	// 清除相关缓存
	if s.rdb != nil {
		ctx := context.Background()
		for _, block := range updatedBlocks {
			if block.Type == "page" && block.Slug != nil {
				cacheKey := "page:blocks:" + *block.Slug
				s.rdb.Del(ctx, cacheKey)
			}
		}
	}

	return nil
}

// GetChildren 获取某个节点的直接子节点（侧边栏使用，带用户隔离）
// parentID 为 nil 时返回根节点
func (s *BlockService) GetChildren(userID uuid.UUID, parentID *uuid.UUID) ([]models.Block, error) {
	return s.blockRepo.FindChildren(userID, parentID)
}
