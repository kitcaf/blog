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

// BatchUpsertIndexes 批量更新/插入索引（传递完整数据，零数据库查询）
func (s *SearchService) BatchUpsertIndexes(ctx context.Context, indexData []BlockIndexData, deleteIDs []uuid.UUID) error {
	// 1. 先删除需要删除的索引
	if len(deleteIDs) > 0 {
		if err := s.searchRepo.BatchDeleteBlockIndexes(ctx, deleteIDs); err != nil {
			return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to batch delete indexes")
		}
	}

	// 2. 批量插入/更新索引
	if len(indexData) > 0 {
		for _, data := range indexData {
			index := &models.BlockSearchIndex{
				BlockID:         data.BlockID,
				PageID:          data.PageID,
				UserID:          data.UserID,
				BlockType:       data.BlockType,
				BlockOrder:      data.BlockOrder,
				Content:         data.Content,
				SourceUpdatedAt: data.SourceUpdatedAt,
				PublishedAt:     data.PublishedAt,
			}

			if err := s.searchRepo.UpsertBlockIndex(ctx, index); err != nil {
				return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to upsert index")
			}
		}
	}

	return nil
}

// BatchDeleteBlockIndexes 批量删除 Block 索引
// 直接用 Block IDs 删除，无需子查询
func (s *SearchService) BatchDeleteBlockIndexes(ctx context.Context, blockIDs []uuid.UUID) error {
	if len(blockIDs) == 0 {
		return nil
	}
	return s.searchRepo.BatchDeleteBlockIndexes(ctx, blockIDs)
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
