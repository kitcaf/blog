package block

import (
	"blog-backend/internal/models"
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type publicPostSummaryRow struct {
	ID           uuid.UUID       `gorm:"column:id"`
	Title        string          `gorm:"column:title"`
	Slug         string          `gorm:"column:slug"`
	Description  *string         `gorm:"column:description"`
	CoverURL     *string         `gorm:"column:cover_url"`
	Tags         json.RawMessage `gorm:"column:tags"`
	PublishedAt  time.Time       `gorm:"column:published_at"`
	CategoryID   *uuid.UUID      `gorm:"column:category_id"`
	CategoryName *string         `gorm:"column:category_name"`
	CategorySlug *string         `gorm:"column:category_slug"`
	TotalCount   int64           `gorm:"column:total_count"`
}

// FindPagesInSubtree 查询某个目录子树下的全部 page 节点。
// 只返回 page 容器本身，不返回正文块，适合批量发布场景。
func (r *BlockRepository) FindPagesInSubtree(userID uuid.UUID, rootPath string) ([]models.Block, error) {
	var pages []models.Block
	err := r.db.
		Where("created_by = ? AND deleted_at IS NULL", userID).
		Where("type = ?", "page").
		Where("path LIKE ?", rootPath+"%").
		Order("path ASC").
		Find(&pages).Error
	return pages, err
}

// SlugExists 检查 slug 是否已被其他 page 使用。
func (r *BlockRepository) SlugExists(slug string, excludePageID *uuid.UUID) (bool, error) {
	query := r.db.Model(&models.Block{}).
		Where("type = ? AND slug = ? AND deleted_at IS NULL", "page", slug)

	if excludePageID != nil && *excludePageID != uuid.Nil {
		query = query.Where("id <> ?", *excludePageID)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

// ListPublicPostSummaries 查询公开文章列表。
func (r *BlockRepository) ListPublicPostSummaries(
	ctx context.Context,
	page int,
	limit int,
	categorySlug string,
) ([]models.PublicPostSummary, int64, error) {
	offset := (page - 1) * limit

	baseSQL := `
		SELECT
			b.id,
			COALESCE(b.properties->>'title', '') AS title,
			b.slug,
			NULLIF(b.properties->>'description', '') AS description,
			NULLIF(b.properties->>'cover_url', '') AS cover_url,
			COALESCE(b.properties->'tags', '[]'::jsonb) AS tags,
			b.published_at,
			c.id AS category_id,
			c.name AS category_name,
			c.slug AS category_slug,
			COUNT(*) OVER() AS total_count
		FROM blocks AS b
		LEFT JOIN blog_categories AS c
			ON c.id = b.category_id
		WHERE b.type = 'page'
		  AND b.deleted_at IS NULL
		  AND b.published_at IS NOT NULL
	`

	args := make([]interface{}, 0, 3)
	if categorySlug != "" {
		baseSQL += " AND c.slug = ?"
		args = append(args, categorySlug)
	}

	baseSQL += `
		ORDER BY b.published_at DESC, b.id DESC
		LIMIT ? OFFSET ?
	`
	args = append(args, limit, offset)

	var rows []publicPostSummaryRow
	if err := r.db.WithContext(ctx).Raw(baseSQL, args...).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	if len(rows) == 0 {
		return []models.PublicPostSummary{}, 0, nil
	}

	summaries := make([]models.PublicPostSummary, 0, len(rows))
	for _, row := range rows {
		var tags []string
		if len(row.Tags) > 0 {
			if err := json.Unmarshal(row.Tags, &tags); err != nil || tags == nil {
				tags = []string{}
			}
		}

		summary := models.PublicPostSummary{
			ID:          row.ID,
			Title:       row.Title,
			Slug:        row.Slug,
			Description: row.Description,
			CoverURL:    row.CoverURL,
			Tags:        tags,
			PublishedAt: row.PublishedAt,
		}

		if row.CategoryID != nil && row.CategoryName != nil && row.CategorySlug != nil {
			summary.Category = &models.PublicPostCategory{
				ID:   *row.CategoryID,
				Name: *row.CategoryName,
				Slug: *row.CategorySlug,
			}
		}

		summaries = append(summaries, summary)
	}

	return summaries, rows[0].TotalCount, nil
}
