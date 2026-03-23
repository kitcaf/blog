package repository

import (
	"blog-backend/internal/models"
	"context"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SearchRepository struct {
	db *gorm.DB
}

func NewSearchRepository(db *gorm.DB) *SearchRepository {
	return &SearchRepository{db: db}
}

// UpsertBlockIndex 插入或更新 Block 索引
// 使用 ON CONFLICT DO UPDATE 实现 UPSERT
func (r *SearchRepository) UpsertBlockIndex(ctx context.Context, index *models.BlockSearchIndex) error {
	// 使用原生 SQL 实现 UPSERT + 自动生成 search_vector
	sql := `
		INSERT INTO block_search_index (
			block_id, page_id, user_id, block_type, block_order,
			content, search_vector, source_updated_at, published_at,
			created_at, updated_at
		) VALUES (
			?, ?, ?, ?, ?,
			?, to_tsvector('simple', ?), ?, ?,
			NOW(), NOW()
		)
		ON CONFLICT (block_id) DO UPDATE SET
			page_id = EXCLUDED.page_id,
			user_id = EXCLUDED.user_id,
			block_type = EXCLUDED.block_type,
			block_order = EXCLUDED.block_order,
			content = EXCLUDED.content,
			search_vector = to_tsvector('simple', EXCLUDED.content),
			source_updated_at = EXCLUDED.source_updated_at,
			published_at = EXCLUDED.published_at,
			updated_at = NOW()
	`

	return r.db.WithContext(ctx).Exec(sql,
		index.BlockID,
		index.PageID,
		index.UserID,
		index.BlockType,
		index.BlockOrder,
		index.Content,
		index.Content,
		index.SourceUpdatedAt,
		index.PublishedAt,
	).Error
}

// BatchDeleteBlockIndexes 批量删除 Block 索引
func (r *SearchRepository) BatchDeleteBlockIndexes(ctx context.Context, blockIDs []uuid.UUID) error {
	if len(blockIDs) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).
		Where("block_id IN ?", blockIDs).
		Delete(&models.BlockSearchIndex{}).Error
}

// DeleteBlockIndexesByPageID 删除某个 Page 下的所有索引
func (r *SearchRepository) DeleteBlockIndexesByPageID(ctx context.Context, pageID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Where("page_id = ?", pageID).
		Delete(&models.BlockSearchIndex{}).Error
}

// BlockSearchResult 搜索结果（包含分数）
type BlockSearchResult struct {
	BlockID         uuid.UUID  `json:"block_id"`
	PageID          uuid.UUID  `json:"page_id"`
	UserID          uuid.UUID  `json:"user_id"`
	BlockType       string     `json:"block_type"`
	BlockOrder      int        `json:"block_order"`
	Content         string     `json:"content"`
	SourceUpdatedAt time.Time  `json:"source_updated_at"`
	PublishedAt     *time.Time `json:"published_at,omitempty"`
	Rank            float64    `json:"rank"`
}

// SearchBlocks 全文搜索 Block
// 返回匹配的 Block 列表（未聚合，包含分数）
func (r *SearchRepository) SearchBlocks(ctx context.Context, userID uuid.UUID, query string, limit int) ([]*BlockSearchResult, error) {
	var results []*BlockSearchResult

	query = strings.TrimSpace(query)
	if query == "" {
		return results, nil
	}

	tsQuery := buildPrefixTSQuery(query)
	if tsQuery == "" {
		return results, nil
	}

	sql := `
		WITH search_query AS (
			SELECT to_tsquery('simple', $1) AS ts_query
		)
		SELECT
			bsi.block_id,
			bsi.page_id,
			bsi.user_id,
			bsi.block_type,
			bsi.block_order,
			bsi.content,
			bsi.source_updated_at,
			bsi.published_at,
			ts_rank(bsi.search_vector, sq.ts_query) AS rank
		FROM block_search_index AS bsi
		CROSS JOIN search_query AS sq
		WHERE
			bsi.user_id = $2
			AND bsi.search_vector @@ sq.ts_query
		ORDER BY rank DESC, bsi.source_updated_at DESC
		LIMIT $3
	`

	err := r.db.WithContext(ctx).Raw(sql, tsQuery, userID, limit).Scan(&results).Error
	return results, err
}

// SearchPublishedBlocks 搜索已发布的 Block（前台搜索）
func (r *SearchRepository) SearchPublishedBlocks(ctx context.Context, query string, limit int) ([]*BlockSearchResult, error) {
	var results []*BlockSearchResult

	query = strings.TrimSpace(query)
	if query == "" {
		return results, nil
	}

	tsQuery := buildPrefixTSQuery(query)
	if tsQuery == "" {
		return results, nil
	}

	sql := `
		WITH search_query AS (
			SELECT to_tsquery('simple', $1) AS ts_query
		)
		SELECT
			bsi.block_id,
			bsi.page_id,
			bsi.user_id,
			bsi.block_type,
			bsi.block_order,
			bsi.content,
			bsi.source_updated_at,
			bsi.published_at,
			ts_rank(bsi.search_vector, sq.ts_query) AS rank
		FROM block_search_index AS bsi
		CROSS JOIN search_query AS sq
		WHERE
			bsi.published_at IS NOT NULL
			AND bsi.search_vector @@ sq.ts_query
		ORDER BY rank DESC, bsi.source_updated_at DESC
		LIMIT $2
	`

	err := r.db.WithContext(ctx).Raw(sql, tsQuery, limit).Scan(&results).Error
	return results, err
}

func buildPrefixTSQuery(query string) string {
	tokens := tokenizeSearchQuery(query)
	if len(tokens) == 0 {
		return ""
	}

	parts := make([]string, 0, len(tokens))
	for _, token := range tokens {
		parts = append(parts, token+":*")
	}

	return strings.Join(parts, " & ")
}

func tokenizeSearchQuery(query string) []string {
	var (
		tokens  []string
		current strings.Builder
	)

	flush := func() {
		if current.Len() == 0 {
			return
		}
		tokens = append(tokens, current.String())
		current.Reset()
	}

	for _, r := range strings.TrimSpace(query) {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			current.WriteRune(unicode.ToLower(r))
		default:
			flush()
		}
	}

	flush()
	return tokens
}
