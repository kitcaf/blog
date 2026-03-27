package services

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"blog-backend/internal/models"
	blockrepo "blog-backend/internal/repository/block"
	pkgerrors "blog-backend/pkg/errors"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type BlockService struct {
	blockRepo     *blockrepo.BlockRepository
	rdb           *redis.Client
	searchIndexer *SearchIndexer
}

const indexPublishChunkSize = 500

type indexPageContext struct {
	PageID      uuid.UUID
	Path        string
	PublishedAt *time.Time
}

func NewBlockService(blockRepo *blockrepo.BlockRepository, rdb *redis.Client) *BlockService {
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

// GetTrashItems 获取回收站根项列表。
func (s *BlockService) GetTrashItems(userID uuid.UUID) ([]models.TrashItem, error) {
	return s.blockRepo.ListTrashItems(userID)
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

	pageContext := &indexPageContext{
		PageID:      pageID,
		Path:        page.Path,
		PublishedAt: page.PublishedAt,
	}
	orderMap := buildBlockOrderMap(blocks)
	indexData := make([]BlockIndexData, 0, len(blocks))
	for _, block := range blocks {
		if block.Type == "root" || block.Type == "folder" {
			continue
		}

		entry, err := buildBlockIndexData(userID, block, pageContext, orderMap)
		if err != nil {
			continue
		}
		indexData = append(indexData, *entry)
	}

	return s.publishIndexDataInChunks(ctx, indexData)
}

// DeletePage 删除页面或文件夹（移动到回收站）。
// 只将当前 folder/page 作为回收站根项展示，正文块和级联子树跟随根项一起进入回收站。
func (s *BlockService) DeletePage(userID, pageID uuid.UUID) error {
	ctx := context.Background()

	deleteResult, err := s.blockRepo.MoveSubtreeToTrash(userID, userID, pageID)
	if err != nil {
		return err
	}

	// 异步批量删除搜索索引。进入回收站后，搜索中不再展示这些 block。
	if s.searchIndexer != nil {
		deletedBlockIDs := append([]uuid.UUID(nil), deleteResult.DeletedBlockIDs...)
		if len(deletedBlockIDs) > 0 {
			go func(blockIDs []uuid.UUID) {
				if err := s.searchIndexer.PublishBatchBlockDeleteTask(ctx, blockIDs); err != nil {
					log.Printf("Failed to publish batch block delete task: %v", err)
				}
			}(deletedBlockIDs)
		}
	}

	return nil
}

// RestoreTrashItem 恢复一个回收站根项。
// 默认优先恢复到原父节点；如果原父节点不可用，则恢复到用户 root 下。
func (s *BlockService) RestoreTrashItem(userID, trashRootID uuid.UUID) error {
	restoreResult, err := s.blockRepo.RestoreTrashRoot(userID, trashRootID)
	if err != nil {
		return err
	}

	if s.searchIndexer != nil && len(restoreResult.RestoredPageIDs) > 0 {
		go func(result *blockrepo.TrashRestoreResult) {
			switch result.RootType {
			case "page":
				if err := s.publishPageReindexTask(context.Background(), userID, result.RootID); err != nil {
					log.Printf("Failed to publish restore reindex task for page %s: %v", result.RootID, err)
				}
			case "folder":
				if err := s.publishFolderSubtreeReindexTask(context.Background(), userID, result.RootPath); err != nil {
					log.Printf("Failed to publish restore subtree reindex task for folder %s: %v", result.RootID, err)
				}
			}
		}(restoreResult)
	}

	return nil
}

// PermanentlyDeleteTrashItem 物理删除一个回收站根项及其归属的软删子树。
// 搜索索引已在进入回收站时清理，这里不再处理索引表。
func (s *BlockService) PermanentlyDeleteTrashItem(userID, trashRootID uuid.UUID) error {
	return s.blockRepo.PermanentlyDeleteTrashRoot(userID, trashRootID)
}

// PermanentlyDeleteTrashItems 批量永久删除多个回收站根项。
func (s *BlockService) PermanentlyDeleteTrashItems(userID uuid.UUID, trashRootIDs []uuid.UUID) error {
	return s.blockRepo.PermanentlyDeleteTrashRoots(userID, trashRootIDs)
}

func (s *BlockService) AppendContentID(userID, parentID, childID uuid.UUID) error {
	return s.blockRepo.AppendContentID(userID, parentID, childID)
}

// SyncBlocks 增量同步 Block 数据（带用户隔离）
// 核心逻辑：
// 1. 最小验证（防止 DoS 攻击）
// 2. 验证当前请求只包含同一篇文章的 block 变更
// 3. 信任前端提交的 page.content_ids 作为结构真相，并批量 UPSERT 更新/新增的块
// 4. 软删除指定的块
// 5. 异步发布索引任务到 Redis Stream（传递完整数据，不阻塞用户操作）
func (s *BlockService) SyncBlocks(userID, pageID uuid.UUID, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	ctx := context.Background()

	if len(updatedBlocks) == 0 && len(deletedIDs) == 0 {
		return nil
	}

	// 1. 最小验证（防止 DoS）
	if err := validateBlocksSize(updatedBlocks); err != nil {
		return err
	}

	// 2. 验证 Page 存在且属于用户
	page, err := s.blockRepo.FindByID(userID, pageID)
	if err != nil {
		return pkgerrors.New(pkgerrors.ErrPageNotFoundInternal, "page not found")
	}
	if page.Type != "page" {
		return pkgerrors.New(pkgerrors.ErrInvalidInput, "target is not a page")
	}

	preparedBlocks, indexPage, err := s.prepareSyncBlocks(page, updatedBlocks, deletedIDs)
	if err != nil {
		return err
	}

	// 3. 信任前端同步后的页面结构，直接持久化最新块数据
	if len(updatedBlocks) > 0 {
		if err := s.blockRepo.Upsert(userID, preparedBlocks); err != nil {
			return err
		}
	}

	// 4. 软删除指定块，不再为重建父节点 content_ids 做额外查询
	if len(deletedIDs) > 0 {
		if err := s.blockRepo.SoftDelete(userID, deletedIDs); err != nil {
			return err
		}
	}

	// 5. 异步发布索引任务（传递完整数据）
	if s.searchIndexer != nil {
		indexBlocks := append([]models.Block(nil), preparedBlocks...)
		go func(pageSnapshot *models.Block, blocks []models.Block, ids []uuid.UUID) {
			if err := s.publishIndexTask(context.Background(), userID, pageID, pageSnapshot, blocks, ids); err != nil {
				log.Printf("Failed to publish index task: %v", err)
			}
		}(indexPage, indexBlocks, append([]uuid.UUID(nil), deletedIDs...))
	}

	// 6. 清除 Redis 缓存
	if s.rdb != nil && page.Slug != nil {
		cacheKey := "page:blocks:" + *page.Slug
		s.rdb.Del(ctx, cacheKey)
	}

	return nil
}

// validateBlocksSize 最小验证（防止 DoS 攻击）
func validateBlocksSize(blocks []models.Block) error {
	const maxPropertySize = 1024 * 1024 // 1MB
	const maxPathLength = 1000

	for _, block := range blocks {
		if len(block.Properties) > maxPropertySize {
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "block properties too large")
		}
		if len(block.Path) > maxPathLength {
			return pkgerrors.New(pkgerrors.ErrInvalidInput, "block path too long")
		}
	}
	return nil
}

func (s *BlockService) prepareSyncBlocks(
	page *models.Block,
	updatedBlocks []models.Block,
	deletedIDs []uuid.UUID,
) ([]models.Block, *models.Block, error) {
	preparedBlocks := make([]models.Block, 0, len(updatedBlocks))
	pageSnapshot := *page
	hasPageUpdate := false

	for _, deletedID := range deletedIDs {
		if deletedID == uuid.Nil {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "deleted block id is required")
		}
		if deletedID == page.ID {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "page block cannot be deleted via SyncBlocks")
		}
	}

	for _, block := range updatedBlocks {
		if block.ID == uuid.Nil {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "block id is required")
		}

		if block.Type == "page" {
			if block.ID != page.ID {
				return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "SyncBlocks only accepts updates for the active page")
			}
			if !sameUUIDPointerValue(block.ParentID, page.ParentID) {
				return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "page parent_id cannot be changed via SyncBlocks")
			}
			if block.Path != "" && block.Path != page.Path {
				return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "page path cannot be changed via SyncBlocks")
			}

			block.ParentID = page.ParentID
			block.Path = page.Path
			block.Type = page.Type
			block.Slug = page.Slug
			block.PublishedAt = page.PublishedAt
			block.CategoryID = page.CategoryID
			block.CreatedBy = page.CreatedBy

			pageSnapshot.ContentIDs = block.ContentIDs
			if len(block.Properties) > 0 {
				pageSnapshot.Properties = block.Properties
			}
			hasPageUpdate = true
			preparedBlocks = append(preparedBlocks, block)
			continue
		}

		if block.Type == "root" || block.Type == "folder" {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "SyncBlocks only accepts page content blocks")
		}
		if block.ParentID == nil || *block.ParentID != page.ID {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "all synced content blocks must belong to the active page")
		}
		if block.Path == "" || !strings.HasPrefix(block.Path, page.Path) {
			return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "block path must stay within the active page subtree")
		}

		preparedBlocks = append(preparedBlocks, block)
	}

	if len(deletedIDs) > 0 && !hasPageUpdate {
		return nil, nil, pkgerrors.New(pkgerrors.ErrInvalidInput, "page structure update is required when deleting blocks")
	}

	return preparedBlocks, &pageSnapshot, nil
}

func sameUUIDPointerValue(left, right *uuid.UUID) bool {
	switch {
	case left == nil && right == nil:
		return true
	case left == nil || right == nil:
		return false
	default:
		return *left == *right
	}
}

// publishIndexTask 发布索引任务（传递完整数据）
func (s *BlockService) publishIndexTask(ctx context.Context, userID, pageID uuid.UUID, page *models.Block, updatedBlocks []models.Block, deletedIDs []uuid.UUID) error {
	// 1. 构建 BlockOrder 映射（只解析一次 ContentIDs）
	orderMap := make(map[uuid.UUID]int)
	var contentIDs []string
	if err := json.Unmarshal(page.ContentIDs, &contentIDs); err == nil {
		for idx, id := range contentIDs {
			if childID, parseErr := uuid.Parse(id); parseErr == nil {
				orderMap[childID] = idx
			}
		}
	}

	// 2. 构建索引数据（传递完整数据，避免 Worker 查询数据库）
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

	// 3. 发布到 Redis Stream
	return s.searchIndexer.PublishBatchIndexTask(ctx, indexData, deletedIDs)
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

func buildBlockOrderMap(blocks []models.Block) map[uuid.UUID]int {
	orderMap := make(map[uuid.UUID]int)
	for _, block := range blocks {
		var contentIDs []string
		if err := json.Unmarshal(block.ContentIDs, &contentIDs); err != nil {
			continue
		}
		for idx, id := range contentIDs {
			if childID, parseErr := uuid.Parse(id); parseErr == nil {
				orderMap[childID] = idx
			}
		}
	}
	return orderMap
}

func buildBlockIndexData(userID uuid.UUID, block models.Block, pageContext *indexPageContext, orderMap map[uuid.UUID]int) (*BlockIndexData, error) {
	content, err := extractTextContent(block.Properties)
	if err != nil {
		return nil, err
	}

	return &BlockIndexData{
		BlockID:         block.ID,
		PageID:          pageContext.PageID,
		UserID:          userID,
		BlockType:       block.Type,
		BlockOrder:      orderMap[block.ID],
		Content:         content,
		SourceUpdatedAt: block.UpdatedAt,
		PublishedAt:     pageContext.PublishedAt,
	}, nil
}

func (s *BlockService) publishIndexDataInChunks(ctx context.Context, indexData []BlockIndexData) error {
	if s.searchIndexer == nil || len(indexData) == 0 {
		return nil
	}

	for start := 0; start < len(indexData); start += indexPublishChunkSize {
		end := start + indexPublishChunkSize
		if end > len(indexData) {
			end = len(indexData)
		}
		if err := s.searchIndexer.PublishBatchIndexTask(ctx, indexData[start:end], nil); err != nil {
			return err
		}
	}

	return nil
}

func (s *BlockService) publishFolderSubtreeReindexTask(ctx context.Context, userID uuid.UUID, rootPath string) error {
	blocks, err := s.blockRepo.FindByPath(userID, rootPath)
	if err != nil {
		return err
	}
	if len(blocks) == 0 {
		return nil
	}

	orderMap := buildBlockOrderMap(blocks)
	indexData := make([]BlockIndexData, 0, len(blocks))
	var currentPage *indexPageContext

	for _, block := range blocks {
		switch block.Type {
		case "root", "folder":
			if currentPage != nil && !strings.HasPrefix(block.Path, currentPage.Path) {
				currentPage = nil
			}
			continue
		case "page":
			currentPage = &indexPageContext{
				PageID:      block.ID,
				Path:        block.Path,
				PublishedAt: block.PublishedAt,
			}
		default:
			if currentPage == nil || !strings.HasPrefix(block.Path, currentPage.Path) {
				continue
			}
		}

		entry, buildErr := buildBlockIndexData(userID, block, currentPage, orderMap)
		if buildErr != nil {
			continue
		}
		indexData = append(indexData, *entry)
	}

	return s.publishIndexDataInChunks(ctx, indexData)
}
