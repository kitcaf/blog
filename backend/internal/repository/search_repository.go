package repository

import (
	"blog-backend/internal/models"
	"context"
	"fmt"
	"time"

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
			$1, $2, $3, $4, $5,
			$6, to_tsvector('simple', $6), $7, $8,
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
		index.SourceUpdatedAt,
		index.PublishedAt,
	).Error
}

// DeleteBlockIndex 删除 Block 索引
func (r *SearchRepository) DeleteBlockIndex(ctx context.Context, blockID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Where("block_id = ?", blockID).
		Delete(&models.BlockSearchIndex{}).Error
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
	Rank            float64    `json:"rank"` // 搜索分数
}

// SearchBlocks 全文搜索 Block
// 返回匹配的 Block 列表（未聚合，包含分数）
func (r *SearchRepository) SearchBlocks(ctx context.Context, userID uuid.UUID, query string, limit int) ([]*BlockSearchResult, error) {
	var results []*BlockSearchResult

	// 使用 PostgreSQL 全文搜索
	// to_tsquery('simple', query) 将查询转换为 tsquery
	// search_vector @@ query 表示匹配
	// ts_rank(search_vector, query) 计算相关度分数
	sql := `
		SELECT 
			block_id, page_id, user_id, block_type, block_order,
			content, source_updated_at, published_at,
			ts_rank(search_vector, to_tsquery('simple', $1)) as rank
		FROM block_search_index
		WHERE 
			user_id = $2
			AND search_vector @@ to_tsquery('simple', $1)
		ORDER BY rank DESC, source_updated_at DESC
		LIMIT $3
	`

	err := r.db.WithContext(ctx).Raw(sql, query, userID, limit).Scan(&results).Error
	return results, err
}

// SearchPublishedBlocks 搜索已发布的 Block（前台搜索）
func (r *SearchRepository) SearchPublishedBlocks(ctx context.Context, query string, limit int) ([]*BlockSearchResult, error) {
	var results []*BlockSearchResult

	sql := `
		SELECT 
			block_id, page_id, user_id, block_type, block_order,
			content, source_updated_at, published_at,
			ts_rank(search_vector, to_tsquery('simple', $1)) as rank
		FROM block_search_index
		WHERE 
			published_at IS NOT NULL
			AND search_vector @@ to_tsquery('simple', $1)
		ORDER BY rank DESC, source_updated_at DESC
		LIMIT $2
	`

	err := r.db.WithContext(ctx).Raw(sql, query, limit).Scan(&results).Error
	return results, err
}

// GetBlockIndexByID 根据 BlockID 获取索引
func (r *SearchRepository) GetBlockIndexByID(ctx context.Context, blockID uuid.UUID) (*models.BlockSearchIndex, error) {
	var index models.BlockSearchIndex
	err := r.db.WithContext(ctx).
		Where("block_id = ?", blockID).
		First(&index).Error

	if err != nil {
		return nil, err
	}
	return &index, nil
}

// CountBlockIndexesByPage 统计某个 Page 下的索引数量
func (r *SearchRepository) CountBlockIndexesByPage(ctx context.Context, pageID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.BlockSearchIndex{}).
		Where("page_id = ?", pageID).
		Count(&count).Error
	return count, err
}

// GetBlockIndexesByPage 获取某个 Page 下的所有索引
func (r *SearchRepository) GetBlockIndexesByPage(ctx context.Context, pageID uuid.UUID) ([]*models.BlockSearchIndex, error) {
	var indexes []*models.BlockSearchIndex
	err := r.db.WithContext(ctx).
		Where("page_id = ?", pageID).
		Order("block_order ASC").
		Find(&indexes).Error
	return indexes, err
}

// UpdatePageInfoForBlocks 批量更新某个 Page 下所有 Block 的 Page 信息
// 用于 Page 标题、图标等信息变更时同步更新索引
// 注意：由于我们不冗余 Page 信息，这个方法暂时不需要
// 保留此方法以备将来需要更新其他 Page 级字段
func (r *SearchRepository) UpdatePageInfoForBlocks(ctx context.Context, pageID uuid.UUID, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).
		Model(&models.BlockSearchIndex{}).
		Where("page_id = ?", pageID).
		Updates(updates).Error
}

// RebuildIndex 重建索引（用于修复或升级）
// 从 blocks 表读取数据并重建 block_search_index 表
func (r *SearchRepository) RebuildIndex(ctx context.Context, userID *uuid.UUID) error {
	// 构建查询条件
	query := r.db.WithContext(ctx).Model(&models.Block{}).
		Where("type NOT IN ?", []string{"root", "folder"}) // 只索引内容块

	if userID != nil {
		// 如果指定了 userID，只重建该用户的索引
		// 通过 path 字段提取 workspace_id（path 的第二段）
		query = query.Where("split_part(path, '/', 2) = ?", userID.String())
	}

	// 获取需要索引的 Block
	var blocks []models.Block
	if err := query.Find(&blocks).Error; err != nil {
		return fmt.Errorf("failed to fetch blocks: %w", err)
	}

	// 批量插入索引
	for _, block := range blocks {
		// 提取 page_id（从 path 的第三段）
		// 提取 user_id（从 path 的第二段）
		// 提取纯文本内容（从 properties）
		// TODO: 实现内容提取逻辑

		// 暂时跳过，等待实现内容提取逻辑
		_ = block
	}

	return nil
}
