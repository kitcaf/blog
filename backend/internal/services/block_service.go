package services

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"blog-backend/internal/models"
	"blog-backend/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type BlockService struct {
	blockRepo     *repository.BlockRepository
	rdb           *redis.Client
	searchIndexer *SearchIndexer
}

func NewBlockService(blockRepo *repository.BlockRepository, rdb *redis.Client) *BlockService {
	return &BlockService{
		blockRepo:     blockRepo,
		rdb:           rdb,
		searchIndexer: nil, // 将在 main.go 中通过 SetSearchIndexer 设置
	}
}

// SetSearchIndexer 设置搜索索引器（避免循环依赖）
func (s *BlockService) SetSearchIndexer(indexer *SearchIndexer) {
	s.searchIndexer = indexer
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

	page, err := s.blockRepo.FindPageBySlug(slug)
	if err != nil {
		return nil, nil, err
	}

	blocks, err := s.blockRepo.FindByPath(*page.CreatedBy, page.Path)
	if err != nil {
		return nil, nil, err
	}

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
	if err := s.blockRepo.Update(userID, block); err != nil {
		return err
	}

	if s.searchIndexer != nil && block.Type == "page" {
		go func(pageID uuid.UUID) {
			if err := s.searchIndexer.PublishPageReindexTask(context.Background(), pageID); err != nil {
				log.Printf("Failed to publish page reindex task for page %s: %v", pageID, err)
			}
		}(block.ID)
	}

	return nil
}

// DeletePage 删除页面（软删除当前节点，级联软删子节点，并从父节点 content_ids 移除）
func (s *BlockService) DeletePage(userID, pageID uuid.UUID) error {
	parentID, path, err := s.blockRepo.SoftDeleteAndReturnFields(userID, pageID)
	if err != nil {
		return err
	}

	if path == "" {
		return errors.New("Page not found or permission denied")
	}

	if err := s.blockRepo.SoftDeleteByPath(userID, path); err != nil {
		log.Printf("Failed to soft delete descendants: %v", err)
	}

	if parentID != nil {
		if err := s.blockRepo.RemoveContentID(userID, *parentID, pageID); err != nil {
			log.Printf("Failed to remove content ID from parent: %v", err)
		}
	}

	if s.searchIndexer != nil {
		go func(pageID uuid.UUID) {
			if err := s.searchIndexer.PublishPageDeleteTask(context.Background(), pageID); err != nil {
				log.Printf("Failed to publish page delete task for page %s: %v", pageID, err)
			}
		}(pageID)
	}

	return nil
}

func (s *BlockService) RemoveContentID(userID, parentID, childID uuid.UUID) error {
	return s.blockRepo.RemoveContentID(userID, parentID, childID)
}

func (s *BlockService) AppendContentID(userID, parentID, childID uuid.UUID) error {
	return s.blockRepo.AppendContentID(userID, parentID, childID)
}

// SyncBlocks 增量同步 Block 数据（带用户隔离）
// 核心逻辑：
// 1. 批量 UPSERT 更新/新增的块
// 2. 软删除指定的块
// 3. 收集所有受影响的父块 ID
// 4. 批量更新父块的 content_ids（基于实际子块查询）
// 5. 异步发布索引任务到 Redis Stream（不阻塞用户操作）
func (s *BlockService) SyncBlocks(userID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	ctx := context.Background()
	affectedParents := make(map[uuid.UUID]bool)

	if len(updatedBlocks) > 0 {
		for _, block := range updatedBlocks {
			if block.ParentID != nil {
				affectedParents[*block.ParentID] = true
			}
		}

		if err := s.blockRepo.Upsert(userID, updatedBlocks); err != nil {
			return err
		}

		if s.searchIndexer != nil {
			for _, block := range updatedBlocks {
				switch block.Type {
				case "root", "folder":
					continue
				case "page":
					go func(pageID uuid.UUID) {
						if err := s.searchIndexer.PublishPageReindexTask(context.Background(), pageID); err != nil {
							log.Printf("Failed to publish page reindex task for page %s: %v", pageID, err)
						}
					}(block.ID)
				default:
					go func(blockID uuid.UUID) {
						if err := s.searchIndexer.PublishBlockUpsertTask(context.Background(), blockID); err != nil {
							log.Printf("Failed to publish index task for block %s: %v", blockID, err)
						}
					}(block.ID)
				}
			}
		}
	}

	if len(deletedIDs) > 0 {
		for _, id := range deletedIDs {
			block, err := s.blockRepo.FindByID(userID, id)
			if err == nil && block.ParentID != nil {
				affectedParents[*block.ParentID] = true
			}
		}

		if err := s.blockRepo.SoftDelete(userID, deletedIDs); err != nil {
			return err
		}

		if s.searchIndexer != nil {
			go func(ids []uuid.UUID) {
				if err := s.searchIndexer.PublishBlockBatchDeleteTask(context.Background(), ids); err != nil {
					log.Printf("Failed to publish batch delete search index task: %v", err)
				}
			}(append([]uuid.UUID(nil), deletedIDs...))
		}
	}

	if len(affectedParents) > 0 {
		parentIDs := make([]uuid.UUID, 0, len(affectedParents))
		for parentID := range affectedParents {
			parentIDs = append(parentIDs, parentID)
		}

		if err := s.blockRepo.RebuildContentIDs(userID, parentIDs); err != nil {
			return err
		}
	}

	if s.rdb != nil {
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
func (s *BlockService) GetChildren(userID uuid.UUID, parentID *uuid.UUID) ([]models.Block, error) {
	return s.blockRepo.FindChildren(userID, *parentID)
}

// GetSidebarTree 获取完整侧边栏目录树
func (s *BlockService) GetSidebarTree(userID uuid.UUID) ([]*models.PageTreeNode, error) {
	rootBlock, err := s.GetOrCreateRootBlock(userID)
	if err != nil {
		return nil, err
	}

	return s.blockRepo.GetSidebarTree(userID, rootBlock.ID)
}

// GetOrCreateRootBlock 获取或创建用户的 root block
func (s *BlockService) GetOrCreateRootBlock(userID uuid.UUID) (*models.Block, error) {
	rootBlock, err := s.blockRepo.FindRootBlock(userID)
	if err == nil {
		return rootBlock, nil
	}

	return s.CreateRootBlockInternal(userID)
}

// CreateRootBlock 为用户创建 root block（注册时调用）
func (s *BlockService) CreateRootBlock(userID uuid.UUID) error {
	_, err := s.CreateRootBlockInternal(userID)
	return err
}

// CreateRootBlockInternal 内部方法：创建 root block
func (s *BlockService) CreateRootBlockInternal(userID uuid.UUID) (*models.Block, error) {
	rootID := uuid.New()
	path := "/" + rootID.String() + "/"
	rootBlock := &models.Block{
		ID:         rootID,
		ParentID:   nil,
		Path:       path,
		Type:       "root",
		ContentIDs: json.RawMessage("[]"),
		Properties: json.RawMessage("{}"),
		CreatedBy:  &userID,
	}

	if err := s.blockRepo.Create(rootBlock); err != nil {
		if existing, errFind := s.blockRepo.FindRootBlock(userID); errFind == nil {
			return existing, nil
		}
		return nil, err
	}

	return rootBlock, nil
}

// MoveBlock 移动和排序内容块
func (s *BlockService) MoveBlock(userID, blockID uuid.UUID, newParentID *uuid.UUID, newContentIDs []string) error {
	return s.blockRepo.MoveBlock(userID, blockID, newParentID, newContentIDs)
}

// UpdateDescendantPaths 递归更新所有子孙节点的 path
// 当移动一个节点时，需要更新其所有子孙节点的 path
func (s *BlockService) UpdateDescendantPaths(userID uuid.UUID, oldPath, newPath string) error {
	return s.blockRepo.UpdateDescendantPaths(userID, oldPath, newPath)
}
