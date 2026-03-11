package services

import (
	"context"
	"encoding/json"
	"errors"
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

// DeletePage 删除页面（软删除当前节点，级联软删子节点，并从父节点 content_ids 移除）
func (s *BlockService) DeletePage(userID, pageID uuid.UUID) error {
	// 一条 SQL 同时完成更新与查询重要字段（RETURNING 特性）
	parentID, path, err := s.blockRepo.SoftDeleteAndReturnFields(userID, pageID)
	if err != nil {
		return err
	}
	
	// 没有符合条件的行被更新（不存在或无权限）
	if path == "" {
		return errors.New("Page not found or permission denied")
	}

	// 级联删除所有的子孙节点
	if err := s.blockRepo.SoftDeleteByPath(userID, path); err != nil {
		// 此处错误可仅打印日志，不应该阻塞流程
	}

	// 更新父节点数组
	if parentID != nil {
		if err := s.blockRepo.RemoveContentID(userID, *parentID, pageID); err != nil {
			return err
		}
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
func (s *BlockService) GetChildren(userID uuid.UUID, parentID *uuid.UUID) ([]models.Block, error) {
	return s.blockRepo.FindChildren(userID, *parentID)
}

// GetSidebarTree 获取完整侧边栏目录树
func (s *BlockService) GetSidebarTree(userID uuid.UUID) ([]*models.PageTreeNode, error) {
	// 1. 先获取根节点 ID
	rootBlock, err := s.GetOrCreateRootBlock(userID)
	if err != nil {
		return nil, err
	}

	// 2. 调用 repository 层的高效组装方法
	return s.blockRepo.GetSidebarTree(userID, rootBlock.ID)
}

// GetOrCreateRootBlock 获取或创建用户的 root block
func (s *BlockService) GetOrCreateRootBlock(userID uuid.UUID) (*models.Block, error) {
	// 先尝试查询
	rootBlock, err := s.blockRepo.FindRootBlock(userID)
	if err == nil {
		return rootBlock, nil
	}

	// 不存在则创建
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

	// In the repository layer we added Upsert, but here we can just do a Create.
	// If the unique index exists for (created_by, type), we can handle "duplicate key value" safely
	// using ON CONFLICT DO NOTHING and returning the actual record.
	// We will implement that in repository later if we want DB raw, but for now we just use create
	// with a duplicate check wrapper.
	if err := s.blockRepo.Create(rootBlock); err != nil {
		// Fallback: if there was a duplicate constraint, it means it was just created
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
