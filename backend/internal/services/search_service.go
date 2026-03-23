package services

import (
	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	"blog-backend/pkg/errors"
	"context"
	"encoding/json"
	goerrors "errors"
	"sort"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SearchService struct {
	searchRepo *repository.SearchRepository
	blockRepo  *repository.BlockRepository
}

func NewSearchService(db *gorm.DB) *SearchService {
	return &SearchService{
		searchRepo: repository.NewSearchRepository(db),
		blockRepo:  repository.NewBlockRepository(db),
	}
}

// IndexBlock 索引单个 Block
// 从 Block 提取内容并创建/更新索引
func (s *SearchService) IndexBlock(ctx context.Context, blockID uuid.UUID) error {
	block, err := s.blockRepo.GetBlockByID(ctx, blockID)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to get block")
	}

	if block.Type == "root" || block.Type == "folder" {
		return nil
	}

	pageID, userID, err := s.resolveIndexScope(ctx, block)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to resolve block search scope")
	}

	pageBlock, err := s.blockRepo.GetBlockByID(ctx, pageID)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to get page block")
	}

	content, err := extractTextContent(block.Properties)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchContentExtract, err, "failed to extract content")
	}

	blockOrder, err := s.getBlockOrder(ctx, block)
	if err != nil {
		blockOrder = 0
	}

	index := &models.BlockSearchIndex{
		BlockID:         blockID,
		PageID:          pageID,
		UserID:          userID,
		BlockType:       block.Type,
		BlockOrder:      blockOrder,
		Content:         content,
		SourceUpdatedAt: block.UpdatedAt,
		PublishedAt:     pageBlock.PublishedAt,
	}

	if err := s.searchRepo.UpsertBlockIndex(ctx, index); err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to upsert index")
	}

	return nil
}

// DeleteBlockIndex 删除单个 Block 索引
func (s *SearchService) DeleteBlockIndex(ctx context.Context, blockID uuid.UUID) error {
	return s.searchRepo.DeleteBlockIndex(ctx, blockID)
}

// BatchDeleteBlockIndexes 批量删除 Block 索引
func (s *SearchService) BatchDeleteBlockIndexes(ctx context.Context, blockIDs []uuid.UUID) error {
	return s.searchRepo.BatchDeleteBlockIndexes(ctx, blockIDs)
}

// DeleteBlockIndexesByPageID 删除某个 Page 下的所有索引
func (s *SearchService) DeleteBlockIndexesByPageID(ctx context.Context, pageID uuid.UUID) error {
	return s.searchRepo.DeleteBlockIndexesByPageID(ctx, pageID)
}

// ReindexPage 重建某个 Page 下的所有搜索索引
// 先删旧索引，再按当前主表状态重建，保证 published_at 与页面状态一致。
func (s *SearchService) ReindexPage(ctx context.Context, pageID uuid.UUID) error {
	page, err := s.blockRepo.GetBlockByID(ctx, pageID)
	if err != nil {
		if goerrors.Is(err, gorm.ErrRecordNotFound) {
			return s.searchRepo.DeleteBlockIndexesByPageID(ctx, pageID)
		}
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to get page")
	}

	ownerID := extractOwnerID(page)
	if ownerID == uuid.Nil {
		return errors.New(errors.ErrSearchIndexFailed, "page owner not found")
	}

	if err := s.searchRepo.DeleteBlockIndexesByPageID(ctx, pageID); err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to delete stale page indexes")
	}

	blocks, err := s.blockRepo.FindByPath(ownerID, page.Path)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to load page blocks")
	}

	for _, block := range blocks {
		if block.Type == "root" || block.Type == "folder" {
			continue
		}
		if err := s.IndexBlock(ctx, block.ID); err != nil {
			return err
		}
	}

	return nil
}

// SearchPages 搜索 Page（聚合结果）
func (s *SearchService) SearchPages(ctx context.Context, userID uuid.UUID, query string) ([]*models.PageSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []*models.PageSearchResult{}, nil
	}

	if len(query) > 200 {
		return nil, errors.New(errors.ErrSearchQueryTooLong, "search query exceeds 200 characters")
	}

	ownerIDs, err := s.getSearchOwnerIDs(ctx, userID)
	if err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to resolve search owner ids")
	}

	blocks := make([]*repository.BlockSearchResult, 0, 128)
	seenBlockIDs := make(map[uuid.UUID]struct{})
	for _, ownerID := range ownerIDs {
		matchedBlocks, searchErr := s.searchRepo.SearchBlocks(ctx, ownerID, query, 1000)
		if searchErr != nil {
			return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, searchErr, "failed to search blocks")
		}

		for _, block := range matchedBlocks {
			if _, exists := seenBlockIDs[block.BlockID]; exists {
				continue
			}
			seenBlockIDs[block.BlockID] = struct{}{}
			blocks = append(blocks, block)
		}
	}

	if len(blocks) == 0 {
		return []*models.PageSearchResult{}, nil
	}

	sort.Slice(blocks, func(i, j int) bool {
		if blocks[i].Rank == blocks[j].Rank {
			return blocks[i].SourceUpdatedAt.After(blocks[j].SourceUpdatedAt)
		}
		return blocks[i].Rank > blocks[j].Rank
	})

	pageMap := make(map[uuid.UUID]*pageAggregation)
	for _, block := range blocks {
		if _, exists := pageMap[block.PageID]; !exists {
			pageMap[block.PageID] = &pageAggregation{PageID: block.PageID, Blocks: []*repository.BlockSearchResult{}}
		}
		pageMap[block.PageID].Blocks = append(pageMap[block.PageID].Blocks, block)
	}

	pageResults := make([]*models.PageSearchResult, 0, len(pageMap))
	for _, agg := range pageMap {
		pageResults = append(pageResults, s.calculatePageScore(agg))
	}

	if err := s.enrichPageInfo(ctx, pageResults); err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to enrich page info")
	}

	sortPageResults(pageResults)
	return pageResults, nil
}

// SearchPublishedPages 搜索已发布的 Page（前台搜索）
func (s *SearchService) SearchPublishedPages(ctx context.Context, query string) ([]*models.PageSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []*models.PageSearchResult{}, nil
	}

	if len(query) > 200 {
		return nil, errors.New(errors.ErrSearchQueryTooLong, "search query exceeds 200 characters")
	}

	blocks, err := s.searchRepo.SearchPublishedBlocks(ctx, query, 1000)
	if err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to search published blocks")
	}

	if len(blocks) == 0 {
		return []*models.PageSearchResult{}, nil
	}

	pageMap := make(map[uuid.UUID]*pageAggregation)
	for _, block := range blocks {
		if _, exists := pageMap[block.PageID]; !exists {
			pageMap[block.PageID] = &pageAggregation{PageID: block.PageID, Blocks: []*repository.BlockSearchResult{}}
		}
		pageMap[block.PageID].Blocks = append(pageMap[block.PageID].Blocks, block)
	}

	pageResults := make([]*models.PageSearchResult, 0, len(pageMap))
	for _, agg := range pageMap {
		pageResults = append(pageResults, s.calculatePageScore(agg))
	}

	if err := s.enrichPageInfo(ctx, pageResults); err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to enrich page info")
	}

	sortPageResults(pageResults)
	return pageResults, nil
}

// ========== 内部辅助方法 ==========

type pageAggregation struct {
	PageID uuid.UUID
	Blocks []*repository.BlockSearchResult
}

// resolveIndexScope 为索引记录解析 page_id 和 user_id。
// page_id 取最近的 page 祖先，user_id 优先取块自身的创建者。
func (s *SearchService) resolveIndexScope(ctx context.Context, block *models.Block) (pageID, userID uuid.UUID, err error) {
	current := block
	visited := make(map[uuid.UUID]struct{})

	for current != nil {
		if _, exists := visited[current.ID]; exists {
			return uuid.Nil, uuid.Nil, errors.New(errors.ErrSearchIndexFailed, "cyclic block parent chain detected")
		}
		visited[current.ID] = struct{}{}

		if userID == uuid.Nil {
			userID = extractOwnerID(current)
		}
		if pageID == uuid.Nil && current.Type == "page" {
			pageID = current.ID
		}
		if pageID != uuid.Nil && userID != uuid.Nil {
			return pageID, userID, nil
		}
		if current.ParentID == nil {
			break
		}

		current, err = s.blockRepo.GetBlockByID(ctx, *current.ParentID)
		if err != nil {
			return uuid.Nil, uuid.Nil, err
		}
	}

	if pageID == uuid.Nil {
		return uuid.Nil, uuid.Nil, errors.New(errors.ErrSearchIndexFailed, "page ancestor not found")
	}
	if userID == uuid.Nil {
		return uuid.Nil, uuid.Nil, errors.New(errors.ErrSearchIndexFailed, "block owner not found")
	}

	return pageID, userID, nil
}

func extractOwnerID(block *models.Block) uuid.UUID {
	if block.CreatedBy != nil {
		return *block.CreatedBy
	}
	if block.LastEditedBy != nil {
		return *block.LastEditedBy
	}
	return uuid.Nil
}

func (s *SearchService) getSearchOwnerIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	ownerIDs := []uuid.UUID{userID}

	rootID, err := s.blockRepo.GetRootBlockIDByUserID(ctx, userID)
	if err != nil {
		if goerrors.Is(err, gorm.ErrRecordNotFound) {
			return ownerIDs, nil
		}
		return nil, err
	}

	if rootID != uuid.Nil && rootID != userID {
		ownerIDs = append(ownerIDs, rootID)
	}

	return ownerIDs, nil
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

// getBlockOrder 获取 Block 在父节点中的顺序
func (s *SearchService) getBlockOrder(ctx context.Context, block *models.Block) (int, error) {
	if block.ParentID == nil {
		return 0, nil
	}

	parent, err := s.blockRepo.GetBlockByID(ctx, *block.ParentID)
	if err != nil {
		return 0, err
	}

	var contentIDs []string
	if err := json.Unmarshal(parent.ContentIDs, &contentIDs); err != nil {
		return 0, err
	}

	for i, id := range contentIDs {
		if id == block.ID.String() {
			return i, nil
		}
	}

	return 0, nil
}

// calculatePageScore 计算 Page 的综合分数
func (s *SearchService) calculatePageScore(agg *pageAggregation) *models.PageSearchResult {
	if len(agg.Blocks) == 0 {
		return nil
	}

	representativeBlock := agg.Blocks[0]
	maxScore := representativeBlock.Rank

	bonusScore := 0.0
	matchCount := len(agg.Blocks)
	if matchCount >= 4 {
		bonusScore = 0.10
	} else if matchCount == 3 {
		bonusScore = 0.08
	} else if matchCount == 2 {
		bonusScore = 0.05
	}

	pageScore := maxScore*0.7 + bonusScore*0.3

	result := &models.PageSearchResult{
		PageID:     agg.PageID,
		MaxScore:   maxScore,
		MatchCount: matchCount,
		PageScore:  pageScore,
		RepresentativeBlock: &models.BlockMatch{
			BlockID:    representativeBlock.BlockID,
			BlockType:  representativeBlock.BlockType,
			BlockOrder: representativeBlock.BlockOrder,
			Content:    representativeBlock.Content,
			Score:      maxScore,
		},
	}

	topCount := 3
	if len(agg.Blocks) < topCount {
		topCount = len(agg.Blocks)
	}

	result.TopBlocks = make([]*models.BlockMatch, topCount)
	for i := 0; i < topCount; i++ {
		block := agg.Blocks[i]
		result.TopBlocks[i] = &models.BlockMatch{
			BlockID:    block.BlockID,
			BlockType:  block.BlockType,
			BlockOrder: block.BlockOrder,
			Content:    block.Content,
			Score:      block.Rank,
		}
	}

	return result
}

// sortPageResults 按 PageScore 降序排序
func sortPageResults(results []*models.PageSearchResult) {
	sort.Slice(results, func(i, j int) bool {
		if results[i].PageScore == results[j].PageScore {
			return results[i].UpdatedAt.After(results[j].UpdatedAt)
		}
		return results[i].PageScore > results[j].PageScore
	})
}

// enrichPageInfo 补充 Page 信息（从 blocks 表）
func (s *SearchService) enrichPageInfo(ctx context.Context, results []*models.PageSearchResult) error {
	if len(results) == 0 {
		return nil
	}

	pageIDs := make([]uuid.UUID, len(results))
	for i, result := range results {
		pageIDs[i] = result.PageID
	}

	pages, err := s.blockRepo.GetBlocksByIDs(ctx, pageIDs)
	if err != nil {
		return err
	}

	pageMap := make(map[uuid.UUID]*models.Block)
	for _, page := range pages {
		pageMap[page.ID] = page
	}

	for _, result := range results {
		if page, exists := pageMap[result.PageID]; exists {
			var props map[string]interface{}
			if err := json.Unmarshal(page.Properties, &props); err == nil {
				if title, ok := props["title"].(string); ok {
					result.PageTitle = title
				}
				if icon, ok := props["icon"].(string); ok {
					result.PageIcon = icon
				}
			}
			result.PagePath = page.Path
			result.UpdatedAt = page.UpdatedAt
		}
	}

	return nil
}
