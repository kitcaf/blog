package blogcategory

import (
	"blog-backend/internal/dto"
	"blog-backend/internal/models"
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(category *models.BlogCategory) error {
	return r.db.Create(category).Error
}

func (r *Repository) FindByID(userID, categoryID uuid.UUID) (*models.BlogCategory, error) {
	var category models.BlogCategory
	err := r.db.Where("id = ? AND created_by = ?", categoryID, userID).First(&category).Error
	return &category, err
}

func (r *Repository) FindBySlug(userID uuid.UUID, slug string) (*models.BlogCategory, error) {
	var category models.BlogCategory
	err := r.db.Where("created_by = ? AND slug = ?", userID, slug).First(&category).Error
	return &category, err
}

func (r *Repository) FindPublicByID(ctx context.Context, categoryID uuid.UUID) (*models.BlogCategory, error) {
	var category models.BlogCategory
	err := r.db.WithContext(ctx).Where("id = ?", categoryID).First(&category).Error
	return &category, err
}

func (r *Repository) Update(userID uuid.UUID, category *models.BlogCategory) error {
	result := r.db.Model(&models.BlogCategory{}).
		Where("id = ? AND created_by = ?", category.ID, userID).
		Updates(map[string]interface{}{
			"name":        category.Name,
			"slug":        category.Slug,
			"description": category.Description,
			"sort_order":  category.SortOrder,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) Delete(userID, categoryID uuid.UUID) error {
	result := r.db.Where("id = ? AND created_by = ?", categoryID, userID).Delete(&models.BlogCategory{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) ListWithPostCount(userID uuid.UUID) ([]dto.BlogCategoryWithCount, error) {
	var categories []dto.BlogCategoryWithCount
	err := r.db.Raw(`
		SELECT
			c.id,
			c.name,
			c.slug,
			c.description,
			c.sort_order,
			COUNT(b.id) AS post_count
		FROM blog_categories AS c
		LEFT JOIN blocks AS b
			ON b.category_id = c.id
			AND b.type = 'page'
			AND b.created_by = c.created_by
			AND b.deleted_at IS NULL
			AND b.published_at IS NOT NULL
		WHERE c.created_by = ?
		GROUP BY c.id, c.name, c.slug, c.description, c.sort_order
		ORDER BY c.sort_order ASC, c.name ASC
	`, userID).Scan(&categories).Error
	return categories, err
}

func (r *Repository) ListPublicWithPostCount(ctx context.Context) ([]dto.BlogCategoryWithCount, error) {
	var categories []dto.BlogCategoryWithCount
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			c.id,
			c.name,
			c.slug,
			c.description,
			c.sort_order,
			COUNT(b.id) AS post_count
		FROM blog_categories AS c
		LEFT JOIN blocks AS b
			ON b.category_id = c.id
			AND b.type = 'page'
			AND b.deleted_at IS NULL
			AND b.published_at IS NOT NULL
		GROUP BY c.id, c.name, c.slug, c.description, c.sort_order
		HAVING COUNT(b.id) > 0
		ORDER BY c.sort_order ASC, c.name ASC
	`).Scan(&categories).Error
	return categories, err
}
