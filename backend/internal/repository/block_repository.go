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

// FindByID 根据 ID 查找 Block（需要 workspace_id 进行数据隔离）
func (r *BlockRepository) FindByID(workspaceID, blockID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("id = ? AND workspace_id = ? AND deleted_at IS NULL", blockID, workspaceID).
		First(&block).Error
	return &block, err
}

// FindByPath 根据物化路径查找所有子孙 Block
func (r *BlockRepository) FindByPath(workspaceID uuid.UUID, path string) ([]models.Block, error) {
	var blocks []models.Block
	err := r.db.Where("workspace_id = ? AND path LIKE ? AND deleted_at IS NULL", workspaceID, path+"%").
		Order("path").
		Find(&blocks).Error
	return blocks, err
}

// FindPageBySlug 根据 slug 查找页面
func (r *BlockRepository) FindPageBySlug(workspaceID uuid.UUID, slug string) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("workspace_id = ? AND type = ? AND slug = ? AND deleted_at IS NULL", workspaceID, "page", slug).
		First(&block).Error
	return &block, err
}

// FindPages 查找所有页面
func (r *BlockRepository) FindPages(workspaceID uuid.UUID, includeUnpublished bool) ([]models.Block, error) {
	var blocks []models.Block
	query := r.db.Where("workspace_id = ? AND type = ? AND deleted_at IS NULL", workspaceID, "page")

	if !includeUnpublished {
		query = query.Where("published_at IS NOT NULL")
	}

	err := query.Find(&blocks).Error
	return blocks, err
}

// Create 创建新 Block
func (r *BlockRepository) Create(block *models.Block) error {
	return r.db.Create(block).Error
}

// Update 更新 Block
func (r *BlockRepository) Update(block *models.Block) error {
	return r.db.Save(block).Error
}

// Upsert 批量插入或更新 Block（增量同步核心）
func (r *BlockRepository) Upsert(blocks []models.Block) error {
	if len(blocks) == 0 {
		return nil
	}
	return r.db.Clauses(clause.OnConflict{
		UpdateAll: true,
	}).Create(&blocks).Error
}

// SoftDelete 软删除指定 ID 的 Block
func (r *BlockRepository) SoftDelete(workspaceID uuid.UUID, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	now := time.Now()
	return r.db.Model(&models.Block{}).
		Where("workspace_id = ? AND id IN ?", workspaceID, ids).
		Update("deleted_at", now).Error
}

// SoftDeleteByPath 软删除指定路径下的所有 Block（级联删除）
func (r *BlockRepository) SoftDeleteByPath(workspaceID uuid.UUID, path string) error {
	now := time.Now()
	return r.db.Model(&models.Block{}).
		Where("workspace_id = ? AND (path LIKE ? OR path = ?)", workspaceID, path+"%", path).
		Update("deleted_at", now).Error
}
