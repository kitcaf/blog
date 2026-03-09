package repository

import (
	"blog-backend/internal/models"
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
		Order("created_at DESC").
		Find(&blocks).Error
	return blocks, err
}

// Create 创建新 Block
func (r *BlockRepository) Create(block *models.Block) error {
	return r.db.Create(block).Error
}

// Update 更新 Block（带用户隔离）
func (r *BlockRepository) Update(userID uuid.UUID, block *models.Block) error {
	// 先检查是否有权限
	var existing models.Block
	if err := r.db.Where("id = ? AND created_by = ?", block.ID, userID).First(&existing).Error; err != nil {
		return err
	}

	return r.db.Save(block).Error
}

// Upsert 批量插入或更新 Block（增量同步核心，带用户隔离）
func (r *BlockRepository) Upsert(userID uuid.UUID, blocks []models.Block) error {
	if len(blocks) == 0 {
		return nil
	}

	// 确保所有 block 都属于当前用户
	for i := range blocks {
		if blocks[i].CreatedBy == nil {
			blocks[i].CreatedBy = &userID
		}
		blocks[i].LastEditedBy = &userID
	}

	// 只更新必要字段，避免更新 created_at
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"properties", "content_ids", "path", "parent_id", "type", "slug", "published_at", "last_edited_by", "updated_at"}),
	}).Create(&blocks).Error
}

// SoftDelete 软删除指定 ID 的 Block（带用户隔离）
func (r *BlockRepository) SoftDelete(userID uuid.UUID, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	now := time.Now()
	return r.db.Model(&models.Block{}).
		Where("id IN ? AND created_by = ?", ids, userID).
		Update("deleted_at", now).Error
}

// SoftDeleteByPath 软删除指定路径下的所有 Block（级联删除，带用户隔离）
func (r *BlockRepository) SoftDeleteByPath(userID uuid.UUID, path string) error {
	now := time.Now()
	return r.db.Model(&models.Block{}).
		Where("(path LIKE ? OR path = ?) AND created_by = ?", path+"%", path, userID).
		Update("deleted_at", now).Error
}

// FindChildren 查询某个节点的直接子节点（第一层，带用户隔离）
// parentID 为 nil 时查询根节点
func (r *BlockRepository) FindChildren(userID uuid.UUID, parentID *uuid.UUID) ([]models.Block, error) {
	var blocks []models.Block
	query := r.db.Where("deleted_at IS NULL AND created_by = ?", userID).
		Where("type IN ?", []string{"page", "folder"})

	if parentID == nil {
		// 查询根节点（parent_id IS NULL）
		query = query.Where("parent_id IS NULL")
	} else {
		// 查询指定父节点的子节点
		query = query.Where("parent_id = ?", *parentID)
	}

	err := query.Order("created_at ASC").Find(&blocks).Error
	return blocks, err
}
