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

// GetBlocksByPageID 获取页面的所有 Block
func (s *BlockService) GetBlocksByPageID(workspaceID, pageID uuid.UUID) ([]models.Block, error) {
	page, err := s.blockRepo.FindByID(workspaceID, pageID)
	if err != nil {
		return nil, err
	}

	return s.blockRepo.FindByPath(workspaceID, page.Path)
}

// GetPageBySlug 根据 slug 获取页面及其内容
func (s *BlockService) GetPageBySlug(workspaceID uuid.UUID, slug string) (*models.Block, []models.Block, error) {
	// 尝试从缓存获取
	if s.rdb != nil {
		cacheKey := "page:blocks:" + workspaceID.String() + ":" + slug
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
	page, err := s.blockRepo.FindPageBySlug(workspaceID, slug)
	if err != nil {
		return nil, nil, err
	}

	blocks, err := s.blockRepo.FindByPath(workspaceID, page.Path)
	if err != nil {
		return nil, nil, err
	}

	// 缓存结果
	if s.rdb != nil {
		cacheKey := "page:blocks:" + workspaceID.String() + ":" + slug
		data, _ := json.Marshal(map[string]interface{}{
			"page":   page,
			"blocks": blocks,
		})
		s.rdb.Set(context.Background(), cacheKey, data, time.Hour)
	}

	return page, blocks, nil
}

// GetPages 获取页面列表
func (s *BlockService) GetPages(workspaceID uuid.UUID, includeUnpublished bool) ([]models.Block, error) {
	return s.blockRepo.FindPages(workspaceID, includeUnpublished)
}

// CreatePage 创建页面
func (s *BlockService) CreatePage(block *models.Block) error {
	return s.blockRepo.Create(block)
}

// UpdatePage 更新页面
func (s *BlockService) UpdatePage(block *models.Block) error {
	return s.blockRepo.Update(block)
}

// DeletePage 删除页面（软删除）
func (s *BlockService) DeletePage(workspaceID, pageID uuid.UUID) error {
	block, err := s.blockRepo.FindByID(workspaceID, pageID)
	if err != nil {
		return err
	}

	return s.blockRepo.SoftDeleteByPath(workspaceID, block.Path)
}

// SyncBlocks 增量同步 Block 数据
func (s *BlockService) SyncBlocks(workspaceID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	// 批量 UPSERT
	if len(updatedBlocks) > 0 {
		// 确保所有 Block 都属于正确的 workspace
		for i := range updatedBlocks {
			updatedBlocks[i].WorkspaceID = workspaceID
		}
		if err := s.blockRepo.Upsert(updatedBlocks); err != nil {
			return err
		}
	}

	// 软删除
	if len(deletedIDs) > 0 {
		if err := s.blockRepo.SoftDelete(workspaceID, deletedIDs); err != nil {
			return err
		}
	}

	// 清除相关缓存
	if s.rdb != nil {
		ctx := context.Background()
		for _, block := range updatedBlocks {
			if block.Type == "page" && block.Slug != nil {
				cacheKey := "page:blocks:" + workspaceID.String() + ":" + *block.Slug
				s.rdb.Del(ctx, cacheKey)
			}
		}
	}

	return nil
}
