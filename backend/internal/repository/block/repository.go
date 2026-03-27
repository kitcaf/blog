package block

import (
	"blog-backend/internal/models"
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BlockRepository struct {
	db *gorm.DB
}

func NewBlockRepository(db *gorm.DB) *BlockRepository {
	return &BlockRepository{db: db}
}

// FindByID 根据 ID 查找 Block（带用户隔离）
func (r *BlockRepository) FindByID(userID, blockID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("id = ? AND created_by = ? AND deleted_at IS NULL", blockID, userID).
		First(&block).Error
	return &block, err
}

// FindByPath 根据物化路径查找所有子孙 Block（带用户隔离）
func (r *BlockRepository) FindByPath(userID uuid.UUID, path string) ([]models.Block, error) {
	var blocks []models.Block
	err := r.db.Where("path LIKE ? AND created_by = ? AND deleted_at IS NULL", path+"%", userID).
		Order("path").
		Find(&blocks).Error
	return blocks, err
}

// FindPageBySlug 根据 slug 查找页面（公开接口，不需要用户隔离）
func (r *BlockRepository) FindPageBySlug(slug string) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("type = ? AND slug = ? AND deleted_at IS NULL AND published_at IS NOT NULL", "page", slug).
		First(&block).Error
	return &block, err
}

// FindPages 查找所有页面（带用户隔离）
func (r *BlockRepository) FindPages(userID uuid.UUID, includeUnpublished bool) ([]models.Block, error) {
	var blocks []models.Block
	query := r.db.Where("type = ? AND created_by = ? AND deleted_at IS NULL", "page", userID)

	if !includeUnpublished {
		query = query.Where("published_at IS NOT NULL")
	}

	err := query.Order("created_at DESC").Find(&blocks).Error
	return blocks, err
}

// FindPublicPages 查找所有已发布的页面（公开接口，不需要用户隔离）
func (r *BlockRepository) FindPublicPages() ([]models.Block, error) {
	var blocks []models.Block
	err := r.db.Where("type = ? AND deleted_at IS NULL AND published_at IS NOT NULL", "page").
		Order("published_at DESC").
		Find(&blocks).Error
	return blocks, err
}

// Create 创建新 Block
func (r *BlockRepository) Create(block *models.Block) error {
	return r.db.Create(block).Error
}

// Update 更新 Block（带用户隔离）
func (r *BlockRepository) Update(userID uuid.UUID, block *models.Block) error {
	var existing models.Block
	if err := r.db.Where("id = ? AND created_by = ? AND deleted_at IS NULL", block.ID, userID).First(&existing).Error; err != nil {
		return err
	}

	return r.db.Model(&models.Block{}).
		Where("id = ? AND created_by = ? AND deleted_at IS NULL", block.ID, userID).
		Updates(map[string]interface{}{
			"properties":     block.Properties,
			"content_ids":    block.ContentIDs,
			"path":           block.Path,
			"parent_id":      block.ParentID,
			"type":           block.Type,
			"slug":           block.Slug,
			"published_at":   block.PublishedAt,
			"category_id":    block.CategoryID,
			"last_edited_by": block.LastEditedBy,
		}).Error
}

// Upsert 批量插入或更新 Block（增量同步核心，带用户隔离）
func (r *BlockRepository) Upsert(userID uuid.UUID, blocks []models.Block) error {
	if len(blocks) == 0 {
		return nil
	}

	for index := range blocks {
		if blocks[index].CreatedBy == nil {
			blocks[index].CreatedBy = &userID
		}
		blocks[index].LastEditedBy = &userID
	}

	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"properties", "content_ids", "path", "parent_id", "type", "slug", "published_at", "last_edited_by", "updated_at"}),
		Where: clause.Where{
			Exprs: []clause.Expression{
				clause.Eq{Column: "blocks.created_by", Value: userID},
			},
		},
	}).Create(&blocks).Error
}

// SoftDelete 软删除指定 ID 的 Block（带用户隔离）
func (r *BlockRepository) SoftDelete(userID uuid.UUID, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}

	now := time.Now().UTC()
	return r.db.Model(&models.Block{}).
		Where("id IN ? AND created_by = ? AND deleted_at IS NULL", ids, userID).
		Update("deleted_at", now).Error
}

// AppendContentID 利用 Postgres 原生 jsonb 将指定元素追加到 content_ids 末尾。
func (r *BlockRepository) AppendContentID(userID, parentID, childID uuid.UUID) error {
	parentIDStr := parentID.String()
	childIDStr := childID.String()

	return r.db.Exec(`
		UPDATE blocks
		SET content_ids = COALESCE(content_ids, '[]'::jsonb) || ?::jsonb
		WHERE id = ? AND created_by = ? AND deleted_at IS NULL
	`, `["`+childIDStr+`"]`, parentIDStr, userID).Error
}

// FindRootBlock 查询用户的 root 类型 block
func (r *BlockRepository) FindRootBlock(userID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("type = ? AND created_by = ? AND deleted_at IS NULL", "root", userID).
		First(&block).Error
	return &block, err
}

// GetBlocksByIDs 批量获取 Block（内部使用，无用户隔离）
func (r *BlockRepository) GetBlocksByIDs(ctx context.Context, blockIDs []uuid.UUID) ([]*models.Block, error) {
	if len(blockIDs) == 0 {
		return []*models.Block{}, nil
	}

	var blocks []*models.Block
	err := r.db.WithContext(ctx).
		Where("id IN ? AND deleted_at IS NULL", blockIDs).
		Find(&blocks).Error
	return blocks, err
}

// GetRootBlockIDByUserID 获取用户根节点 ID。
// 兼容历史 search index 中把 root_id 写入 user_id 的情况。
func (r *BlockRepository) GetRootBlockIDByUserID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var root models.Block
	err := r.db.WithContext(ctx).
		Where("type = ? AND created_by = ? AND deleted_at IS NULL", "root", userID).
		First(&root).Error
	if err != nil {
		return uuid.Nil, err
	}

	return root.ID, nil
}
