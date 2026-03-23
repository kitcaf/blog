package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	pkgerrors "blog-backend/pkg/errors"

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

	// 页面更新时，异步重新索引整个页面
	if s.searchIndexer != nil && block.Type == "page" {
		go func(pageID uuid.UUID) {
			// 获取页面下的所有 Block 并重新索引
			if err := s.publishPageReindexTask(context.Background(), userID, pageID); err != nil {
				log.Printf("Failed to publish page reindex task for page %s: %v", pageID, err)
			}
		}(block.ID)
	}

	return nil
}

// publishPageReindexTask 发布页面重新索引任务
func (s *BlockService) publishPageReindexTask(ctx context.Context, userID, pageID uuid.UUID) error {
	// 获取页面信息
	page, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		return err
	}

	// 获取页面下的所有 Block
	blocks, err := s.blockRepo.FindByPath(userID, page.Path)
	if err != nil {
		return err
	}

	// 构建 BlockOrder 映射
	orderMap := make(map[uuid.UUID]int)
	for _, block := range blocks {
		var contentIDs []string
		if err := json.Unmarshal(block.ContentIDs, &contentIDs); err == nil {
			for idx, id := range contentIDs {
				if childID, parseErr := uuid.Parse(id); parseErr == nil {
					orderMap[childID] = idx
				}
			}
		}
	}

	// 构建索引数据
	indexData := make([]BlockIndexData, 0, len(blocks))
	for _, block := range blocks {
		if block.Type == "root" || block.Type == "folder" {
			continue
		}

		content, err := extractTextContent(block.Properties)
		if err != nil {
			continue
		}

		indexData = append(indexData, BlockIndexData{
			BlockID:         block.ID,
			PageID:          pageID,
			UserID:          userID,
			BlockType:       block.Type,
			BlockOrder:      orderMap[block.ID],
			Content:         content,
			SourceUpdatedAt: block.UpdatedAt,
			PublishedAt:     page.PublishedAt,
		})
	}

	// 发布索引任务
	return s.searchIndexer.PublishBatchIndexTask(ctx, indexData, nil)
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
// 1. 快速验证数据合法性（防止恶意数据）
// 2. 批量 UPSERT 更新/新增的块
// 3. 软删除指定的块
// 4. 收集所有受影响的父块 ID
// 5. 批量更新父块的 content_ids（基于实际子块查询）
// 6. 异步发布索引任务到 Redis Stream（传递完整数据，不阻塞用户操作）
func (s *BlockService) SyncBlocks(userID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	ctx := context.Background()

	// 1. 快速验证数据合法性
	if err := quickValidateBlocks(userID, updatedBlocks); err != nil {
		return err
	}

	// 2. 解析 PageID（所有 Block 必须属于同一个 Page）
	pageID, err := s.resolveSyncPageID(ctx, userID, updatedBlocks, deletedIDs)
	if err != nil {
		return err
	}

	// 3. 收集受影响的父节点
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
	}

	if len(deletedIDs) > 0 {
		for _, id := range deletedIDs {
			block, findErr := s.blockRepo.FindByID(userID, id)
			if findErr == nil && block.ParentID != nil {
				affectedParents[*block.ParentID] = true
			}
		}

		if err := s.blockRepo.SoftDelete(userID, deletedIDs); err != nil {
			return err
		}
	}

	// 4. 更新父节点的 content_ids
	if len(affectedParents) > 0 {
		parentIDs := make([]uuid.UUID, 0, len(affectedParents))
		for parentID := range affectedParents {
			parentIDs = append(parentIDs, parentID)
		}
		if err := s.blockRepo.RebuildContentIDs(userID, parentIDs); err != nil {
			return err
		}
	}

	// 5. 异步发布索引任务（传递完整数据）
	if s.searchIndexer != nil && pageID != uuid.Nil {
		go func() {
			if err := s.publishIndexTask(context.Background(), userID, pageID, updatedBlocks, deletedIDs); err != nil {
				log.Printf("Failed to publish index task: %v", err)
			}
		}()
	}

	// 6. 清除 Redis 缓存
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

// quickValidateBlocks 快速验证 Block 数据（防止恶意数据）
func quickValidateBlocks(userID uuid.UUID, blocks []models.Block) error {
	validTypes := map[string]bool{
		"root": true, "folder": true, "page": true,
		"paragraph": true, "heading": true, "code": true,
		"image": true, "list": true, "quote": true,
		"divider": true, "callout": true,
	}

	for _, block := range blocks {
		// 1. 验证 UUID 格式
		if block.ID == uuid.Nil {
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "invalid block id")
		}

		// 2. 验证 type
		if !validTypes[block.Type] {
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "invalid block type: "+block.Type)
		}

		// 3. 验证 path 长度（防止 DoS）
		if len(block.Path) > 1000 {
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "path too long")
		}

		// 4. 验证 properties 大小（防止 DoS）
		if len(block.Properties) > 1024*1024 { // 1MB
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "properties too large")
		}
	}

	return nil
}

// publishIndexTask 发布索引任务（传递完整数据）
func (s *BlockService) publishIndexTask(ctx context.Context, userID, pageID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	// 1. 获取 Page 信息（只查询一次）
	page, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		return err
	}

	// 2. 构建 BlockOrder 映射（只解析一次 ContentIDs）
	orderMap := make(map[uuid.UUID]int)
	var contentIDs []string
	if err := json.Unmarshal(page.ContentIDs, &contentIDs); err == nil {
		for idx, id := range contentIDs {
			if childID, parseErr := uuid.Parse(id); parseErr == nil {
				orderMap[childID] = idx
			}
		}
	}

	// 3. 构建索引数据（传递完整数据，避免 Worker 查询数据库）
	indexData := make([]BlockIndexData, 0, len(updatedBlocks))
	for _, block := range updatedBlocks {
		// 跳过不需要索引的类型
		if block.Type == "root" || block.Type == "folder" {
			continue
		}

		// 提取文本内容
		content, err := extractTextContent(block.Properties)
		if err != nil {
			log.Printf("Failed to extract content from block %s: %v", block.ID, err)
			continue
		}

		// 获取 BlockOrder
		blockOrder := orderMap[block.ID]

		indexData = append(indexData, BlockIndexData{
			BlockID:         block.ID,
			PageID:          pageID,
			UserID:          userID,
			BlockType:       block.Type,
			BlockOrder:      blockOrder,
			Content:         content,
			SourceUpdatedAt: block.UpdatedAt,
			PublishedAt:     page.PublishedAt,
		})
	}

	// 4. 发布到 Redis Stream
	return s.searchIndexer.PublishBatchIndexTask(ctx, indexData, deletedIDs)
}

func (s *BlockService) resolveSyncPageID(ctx context.Context, userID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) (uuid.UUID, error) {
	var pageID uuid.UUID

	checkPageID := func(candidate uuid.UUID) error {
		if candidate == uuid.Nil {
			return nil
		}
		if pageID == uuid.Nil {
			pageID = candidate
			return nil
		}
		if pageID != candidate {
			return fmt.Errorf("sync blocks must belong to a single page")
		}
		return nil
	}

	for i := range updatedBlocks {
		candidate, err := s.resolvePageIDFromBlock(ctx, &updatedBlocks[i])
		if err != nil {
			return uuid.Nil, err
		}
		if err := checkPageID(candidate); err != nil {
			return uuid.Nil, err
		}
	}

	for _, blockID := range deletedIDs {
		block, err := s.blockRepo.FindByID(userID, blockID)
		if err != nil {
			continue
		}
		candidate, err := s.resolvePageIDFromBlock(ctx, block)
		if err != nil {
			return uuid.Nil, err
		}
		if err := checkPageID(candidate); err != nil {
			return uuid.Nil, err
		}
	}

	return pageID, nil
}

func (s *BlockService) resolvePageIDFromBlock(ctx context.Context, block *models.Block) (uuid.UUID, error) {
	current := block
	visited := make(map[uuid.UUID]struct{})

	for current != nil {
		if _, exists := visited[current.ID]; exists {
			return uuid.Nil, fmt.Errorf("cyclic block parent chain detected")
		}
		visited[current.ID] = struct{}{}

		if current.Type == "page" {
			return current.ID, nil
		}
		if current.ParentID == nil {
			break
		}

		next, err := s.blockRepo.GetBlockByID(ctx, *current.ParentID)
		if err != nil {
			return uuid.Nil, err
		}
		current = next
	}

	return uuid.Nil, nil
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

// extractTextContent 从 properties JSONB 提取纯文本
// 支持 Tiptap 的 content 数组格式
func extractTextContent(properties json.RawMessage) (string, error) {
	var props map[string]interface{}
	if err := json.Unmarshal(properties, &props); err != nil {
		return "", err
	}

	var textParts []string

	if title, ok := props["title"].(string); ok && title != "" {
		textParts = append(textParts, title)
	}

	if content, ok := props["content"].([]interface{}); ok {
		for _, item := range content {
			if itemMap, ok := item.(map[string]interface{}); ok {
				if text, ok := itemMap["text"].(string); ok {
					textParts = append(textParts, text)
				}
			}
		}
	}

	return strings.Join(textParts, " "), nil
}
