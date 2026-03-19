package services

import (
	"blog-backend/internal/models"
	"blog-backend/internal/repository"
	"blog-backend/pkg/errors"
	"context"
	"encoding/json"
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
	// 1. 获取 Block 数据
	block, err := s.blockRepo.GetBlockByID(ctx, blockID)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to get block")
	}

	// 2. 只索引内容块（跳过 root 和 folder）
	if block.Type == "root" || block.Type == "folder" {
		return nil
	}

	// 3. 提取 page_id 和 user_id（从 path）
	pageID, userID, err := extractIDsFromPath(block.Path)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchInvalidPath, err, "invalid block path")
	}

	// 4. 提取纯文本内容
	content, err := extractTextContent(block.Properties)
	if err != nil {
		return errors.WrapWithDetail(errors.ErrSearchContentExtract, err, "failed to extract content")
	}

	// 5. 计算 block_order（从 parent 的 content_ids 中获取位置）
	blockOrder, err := s.getBlockOrder(ctx, block)
	if err != nil {
		// 如果获取失败，使用默认值 0
		blockOrder = 0
	}

	// 6. 创建索引记录
	index := &models.BlockSearchIndex{
		BlockID:         blockID,
		PageID:          pageID,
		UserID:          userID,
		BlockType:       block.Type,
		BlockOrder:      blockOrder,
		Content:         content,
		SourceUpdatedAt: block.UpdatedAt,
		PublishedAt:     block.PublishedAt,
	}

	// 7. UPSERT 到数据库
	if err := s.searchRepo.UpsertBlockIndex(ctx, index); err != nil {
		return errors.WrapWithDetail(errors.ErrSearchIndexFailed, err, "failed to upsert index")
	}

	return nil
}

// DeleteBlockIndex 删除 Block 索引
func (s *SearchService) DeleteBlockIndex(ctx context.Context, blockID uuid.UUID) error {
	return s.searchRepo.DeleteBlockIndex(ctx, blockID)
}

// SearchPages 搜索 Page（聚合结果）
// 返回按 Page 聚合后的所有搜索结果
func (s *SearchService) SearchPages(ctx context.Context, userID uuid.UUID, query string) ([]*models.PageSearchResult, error) {
	// 1. 验证查询参数
	if strings.TrimSpace(query) == "" {
		return nil, errors.New(errors.ErrSearchQueryEmpty, "search query is empty")
	}

	if len(query) > 200 {
		return nil, errors.New(errors.ErrSearchQueryTooLong, "search query exceeds 200 characters")
	}

	// 2. 搜索匹配的 Block（返回所有匹配结果，最多 1000 条）
	blocks, err := s.searchRepo.SearchBlocks(ctx, userID, query, 1000)
	if err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to search blocks")
	}

	if len(blocks) == 0 {
		return []*models.PageSearchResult{}, nil
	}

	// 3. 按 Page 聚合
	pageMap := make(map[uuid.UUID]*pageAggregation)
	for _, block := range blocks {
		if _, exists := pageMap[block.PageID]; !exists {
			pageMap[block.PageID] = &pageAggregation{
				PageID: block.PageID,
				Blocks: []*repository.BlockSearchResult{},
			}
		}
		pageMap[block.PageID].Blocks = append(pageMap[block.PageID].Blocks, block)
	}

	// 4. 计算 Page 分数并排序
	var pageResults []*models.PageSearchResult
	for _, agg := range pageMap {
		result := s.calculatePageScore(agg)
		pageResults = append(pageResults, result)
	}

	// 5. 按 PageScore 排序
	sortPageResults(pageResults)

	// 6. 补充 Page 信息（JOIN blocks 表）
	if err := s.enrichPageInfo(ctx, pageResults); err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to enrich page info")
	}

	return pageResults, nil
}

// SearchPublishedPages 搜索已发布的 Page（前台搜索）
// 返回所有匹配的已发布页面
func (s *SearchService) SearchPublishedPages(ctx context.Context, query string) ([]*models.PageSearchResult, error) {
	// 1. 验证查询参数
	if strings.TrimSpace(query) == "" {
		return nil, errors.New(errors.ErrSearchQueryEmpty, "search query is empty")
	}

	if len(query) > 200 {
		return nil, errors.New(errors.ErrSearchQueryTooLong, "search query exceeds 200 characters")
	}

	// 2. 搜索匹配的已发布 Block（返回所有匹配结果，最多 1000 条）
	blocks, err := s.searchRepo.SearchPublishedBlocks(ctx, query, 1000)
	if err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to search published blocks")
	}

	if len(blocks) == 0 {
		return []*models.PageSearchResult{}, nil
	}

	// 3. 按 Page 聚合并计算分数
	pageMap := make(map[uuid.UUID]*pageAggregation)
	for _, block := range blocks {
		if _, exists := pageMap[block.PageID]; !exists {
			pageMap[block.PageID] = &pageAggregation{
				PageID: block.PageID,
				Blocks: []*repository.BlockSearchResult{},
			}
		}
		pageMap[block.PageID].Blocks = append(pageMap[block.PageID].Blocks, block)
	}

	var pageResults []*models.PageSearchResult
	for _, agg := range pageMap {
		result := s.calculatePageScore(agg)
		pageResults = append(pageResults, result)
	}

	sortPageResults(pageResults)

	if err := s.enrichPageInfo(ctx, pageResults); err != nil {
		return nil, errors.WrapWithDetail(errors.ErrSearchQueryFailed, err, "failed to enrich page info")
	}

	return pageResults, nil
}

// ========== 内部辅助方法 ==========

// pageAggregation Page 聚合的中间结构
type pageAggregation struct {
	PageID uuid.UUID
	Blocks []*repository.BlockSearchResult
}

// extractIDsFromPath 从 path 提取 page_id 和 user_id
// path 格式：/{user_id}/{page_id}/...
func extractIDsFromPath(path string) (pageID, userID uuid.UUID, err error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 {
		return uuid.Nil, uuid.Nil, errors.New(errors.ErrSearchInvalidPath, "path must have at least 2 segments")
	}

	userID, err = uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, uuid.Nil, errors.WrapWithDetail(errors.ErrSearchInvalidPath, err, "invalid user_id in path")
	}

	pageID, err = uuid.Parse(parts[1])
	if err != nil {
		return uuid.Nil, uuid.Nil, errors.WrapWithDetail(errors.ErrSearchInvalidPath, err, "invalid page_id in path")
	}

	return pageID, userID, nil
}

// extractTextContent 从 properties JSONB 提取纯文本
// 支持 Tiptap 的 content 数组格式
func extractTextContent(properties json.RawMessage) (string, error) {
	var props map[string]interface{}
	if err := json.Unmarshal(properties, &props); err != nil {
		return "", err
	}

	var textParts []string

	// 提取 title（如果有）
	if title, ok := props["title"].(string); ok && title != "" {
		textParts = append(textParts, title)
	}

	// 提取 content 数组中的文本
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

	// 获取父节点
	parent, err := s.blockRepo.GetBlockByID(ctx, *block.ParentID)
	if err != nil {
		return 0, err
	}

	// 解析 content_ids
	var contentIDs []string
	if err := json.Unmarshal(parent.ContentIDs, &contentIDs); err != nil {
		return 0, err
	}

	// 查找当前 Block 的位置
	for i, id := range contentIDs {
		if id == block.ID.String() {
			return i, nil
		}
	}

	return 0, nil
}

// calculatePageScore 计算 Page 的综合分数
// 公式：PageScore = MaxScore * 0.7 + BonusScore * 0.3
func (s *SearchService) calculatePageScore(agg *pageAggregation) *models.PageSearchResult {
	if len(agg.Blocks) == 0 {
		return nil
	}

	// 找出最高分 Block（第一个是最高分，因为已经按 rank 排序）
	representativeBlock := agg.Blocks[0]
	maxScore := representativeBlock.Rank

	// 计算多块命中加分
	bonusScore := 0.0
	matchCount := len(agg.Blocks)
	if matchCount >= 4 {
		bonusScore = 0.10
	} else if matchCount == 3 {
		bonusScore = 0.08
	} else if matchCount == 2 {
		bonusScore = 0.05
	}

	// 计算 Page 综合分数
	pageScore := maxScore*0.7 + bonusScore*0.3

	// 构建结果
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

	// 保留 Top 3 Block
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
	// 简单的冒泡排序（生产环境应使用 sort.Slice）
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[i].PageScore < results[j].PageScore {
				results[i], results[j] = results[j], results[i]
			}
		}
	}
}

// enrichPageInfo 补充 Page 信息（从 blocks 表）
func (s *SearchService) enrichPageInfo(ctx context.Context, results []*models.PageSearchResult) error {
	if len(results) == 0 {
		return nil
	}

	// 收集所有 page_id
	pageIDs := make([]uuid.UUID, len(results))
	for i, result := range results {
		pageIDs[i] = result.PageID
	}

	// 批量查询 Page 信息
	pages, err := s.blockRepo.GetBlocksByIDs(ctx, pageIDs)
	if err != nil {
		return err
	}

	// 构建 pageID -> Page 的映射
	pageMap := make(map[uuid.UUID]*models.Block)
	for _, page := range pages {
		pageMap[page.ID] = page
	}

	// 补充信息
	for _, result := range results {
		if page, exists := pageMap[result.PageID]; exists {
			// 提取 title 和 icon
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
