package repository

import (
	"blog-backend/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BlockRepository struct {
	db *gorm.DB
}

type TrashDeleteResult struct {
	DeletedBlockIDs []uuid.UUID
}

type TrashRestoreResult struct {
	RestoredPageIDs []uuid.UUID
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

// 极致优化：利用 Postgres 原生 jsonb 移除数组内的指定元素
func (r *BlockRepository) RemoveContentID(userID, parentID, childID uuid.UUID) error {
	parentIDStr := parentID.String()
	childIDStr := childID.String()
	// 注意这里 content_ids 类型必须是 jsonb
	return r.db.Exec(`
		UPDATE blocks
		SET content_ids = content_ids - ?
		WHERE id = ? AND created_by = ? AND deleted_at IS NULL
	`, childIDStr, parentIDStr, userID).Error
}

// 极致优化：利用 Postgres 原生 jsonb 追加数组内的指定元素
func (r *BlockRepository) AppendContentID(userID, parentID, childID uuid.UUID) error {
	parentIDStr := parentID.String()
	childIDStr := childID.String()

	// 如果 content_ids 还没初始化为数组或为空，可以直接通过 COALESCE 赋予初始值
	// PostgreSQL 提供 jsonb_insert 或 ||，利用 || 最简单拼接
	return r.db.Exec(`
		UPDATE blocks
		SET content_ids = COALESCE(content_ids, '[]'::jsonb) || ?::jsonb
		WHERE id = ? AND created_by = ? AND deleted_at IS NULL
	`, `["`+childIDStr+`"]`, parentIDStr, userID).Error
}

// MoveSubtreeToTrash 将 folder/page 根节点及其当前活动子树移动到回收站。
// 已经独立在回收站中的后代不会被重新吸收。
func (r *BlockRepository) MoveSubtreeToTrash(userID, actorID, blockID uuid.UUID) (*TrashDeleteResult, error) {
	result := &TrashDeleteResult{}

	err := r.db.Transaction(func(tx *gorm.DB) error {
		root, err := r.lockBlockByID(tx, userID, blockID, false)
		if err != nil {
			return err
		}
		if root.Type == "root" {
			return fmt.Errorf("%w: root block cannot be moved to trash", gorm.ErrInvalidData)
		}
		if root.Type != "folder" && root.Type != "page" {
			return fmt.Errorf("%w: only folder/page blocks can be moved to trash", gorm.ErrInvalidData)
		}

		now := time.Now().UTC()

		deletedOrder, err := r.lookupChildOrder(tx, userID, root.ParentID, root.ID)
		if err != nil {
			return err
		}

		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ? AND deleted_at IS NULL", root.ID, userID).
			Updates(map[string]interface{}{
				"deleted_at":        now,
				"trash_root_id":     root.ID,
				"deleted_parent_id": root.ParentID,
				"deleted_order":     deletedOrder,
				"deleted_by":        actorID,
			}).Error; err != nil {
			return err
		}
		result.DeletedBlockIDs = append(result.DeletedBlockIDs, root.ID)

		var descendantIDs []uuid.UUID
		if err := tx.Raw(`
			UPDATE blocks
			SET deleted_at = ?,
				trash_root_id = ?,
				deleted_parent_id = NULL,
				deleted_order = NULL,
				deleted_by = ?
			WHERE path LIKE ?
			  AND id <> ?
			  AND created_by = ?
			  AND deleted_at IS NULL
			RETURNING id
		`, now, root.ID, actorID, root.Path+"%", root.ID, userID).Scan(&descendantIDs).Error; err != nil {
			return err
		}
		result.DeletedBlockIDs = append(result.DeletedBlockIDs, descendantIDs...)

		if root.ParentID != nil {
			if err := r.removeChildFromParentTx(tx, userID, *root.ParentID, root.ID); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

// ListTrashItems 查询当前用户回收站的可见根项。
func (r *BlockRepository) ListTrashItems(userID uuid.UUID) ([]models.TrashItem, error) {
	var items []models.TrashItem
	err := r.db.Raw(`
		SELECT
			root.id,
			root.type,
			COALESCE(root.properties->>'title', '') AS title,
			COALESCE(root.properties->>'icon', '') AS icon,
			root.deleted_at,
			root.deleted_by,
			root.deleted_parent_id,
			root.deleted_order,
			COALESCE(stats.child_folder_count, 0) AS child_folder_count,
			COALESCE(stats.child_page_count, 0) AS child_page_count
		FROM blocks root
		LEFT JOIN (
			SELECT
				trash_root_id,
				COUNT(*) FILTER (WHERE type = 'folder' AND id <> trash_root_id) AS child_folder_count,
				COUNT(*) FILTER (WHERE type = 'page' AND id <> trash_root_id) AS child_page_count
			FROM blocks
			WHERE created_by = ?
			  AND deleted_at IS NOT NULL
			  AND trash_root_id IS NOT NULL
			GROUP BY trash_root_id
		) stats ON stats.trash_root_id = root.id
		WHERE root.created_by = ?
		  AND root.deleted_at IS NOT NULL
		  AND root.id = root.trash_root_id
		  AND root.type IN ('folder', 'page')
		ORDER BY root.deleted_at DESC
	`, userID, userID).Scan(&items).Error
	return items, err
}

// RestoreTrashRoot 恢复回收站根项。
// 默认优先恢复到原父节点；若原父节点不存在或仍在回收站，则恢复到用户 root 下。
func (r *BlockRepository) RestoreTrashRoot(userID, trashRootID uuid.UUID) (*TrashRestoreResult, error) {
	result := &TrashRestoreResult{}

	err := r.db.Transaction(func(tx *gorm.DB) error {
		root, err := r.lockBlockByID(tx, userID, trashRootID, true)
		if err != nil {
			return err
		}
		if root.DeletedAt == nil || root.TrashRootID == nil || *root.TrashRootID != root.ID {
			return gorm.ErrRecordNotFound
		}
		if root.Type != "folder" && root.Type != "page" {
			return fmt.Errorf("%w: only folder/page trash roots can be restored", gorm.ErrInvalidData)
		}

		targetParent, err := r.resolveRestoreParent(tx, userID, root)
		if err != nil {
			return err
		}

		if err := tx.Model(&models.Block{}).
			Where("created_by = ? AND trash_root_id = ? AND deleted_at IS NOT NULL AND type = ?", userID, root.ID, "page").
			Pluck("id", &result.RestoredPageIDs).Error; err != nil {
			return err
		}

		oldRootPath := root.Path
		newRootPath := targetParent.Path + root.ID.String() + "/"
		pathSuffixStart := len(oldRootPath) + 1

		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ? AND deleted_at IS NOT NULL", root.ID, userID).
			Updates(map[string]interface{}{
				"parent_id":         targetParent.ID,
				"path":              newRootPath,
				"deleted_at":        nil,
				"trash_root_id":     nil,
				"deleted_parent_id": nil,
				"deleted_order":     nil,
				"deleted_by":        nil,
			}).Error; err != nil {
			return err
		}

		if err := tx.Exec(`
			UPDATE blocks
			SET path = ? || SUBSTRING(path FROM ?),
				deleted_at = NULL,
				trash_root_id = NULL,
				deleted_parent_id = NULL,
				deleted_order = NULL,
				deleted_by = NULL
			WHERE created_by = ?
			  AND trash_root_id = ?
			  AND id <> ?
			  AND deleted_at IS NOT NULL
		`, newRootPath, pathSuffixStart, userID, root.ID, root.ID).Error; err != nil {
			return err
		}

		if err := r.insertChildIntoParentTx(tx, userID, targetParent.ID, root.ID, root.DeletedOrder); err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

// PermanentlyDeleteTrashRoot 物理删除一个回收站根项及其当前归属的整棵软删子树。
func (r *BlockRepository) PermanentlyDeleteTrashRoot(userID, trashRootID uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		root, err := r.lockBlockByID(tx, userID, trashRootID, true)
		if err != nil {
			return err
		}
		if root.DeletedAt == nil || root.TrashRootID == nil || *root.TrashRootID != root.ID {
			return gorm.ErrRecordNotFound
		}

		return tx.Where("created_by = ? AND trash_root_id = ? AND deleted_at IS NOT NULL", userID, root.ID).
			Delete(&models.Block{}).Error
	})
}

// FindChildren 查询某个节点的直接子节点（第一层，带用户隔离）
// 返回顺序：按照父节点的 content_ids 字段中的顺序排列
func (r *BlockRepository) FindChildren(userID uuid.UUID, parentID uuid.UUID) ([]models.Block, error) {
	var blocks []models.Block
	query := r.db.Where("deleted_at IS NULL AND created_by = ?", userID).
		Where("type IN ?", []string{"page", "folder"}).
		Where("parent_id = ?", parentID)

	err := query.Find(&blocks).Error
	if err != nil {
		return nil, err
	}

	// 查询父节点获取 content_ids
	var parent models.Block
	if err := r.db.Where("id = ? AND created_by = ?", parentID, userID).First(&parent).Error; err != nil {
		// 如果父节点不存在，按 created_at 排序返回
		query.Order("created_at ASC").Find(&blocks)
		return blocks, nil
	}

	// 解析父节点的 content_ids
	var contentIDs []string
	if err := json.Unmarshal(parent.ContentIDs, &contentIDs); err != nil || len(contentIDs) == 0 {
		// 如果 content_ids 为空或解析失败，按 created_at 排序
		query.Order("created_at ASC").Find(&blocks)
		return blocks, nil
	}

	// 按照 content_ids 的顺序排序 blocks
	blockMap := make(map[string]models.Block)
	for _, block := range blocks {
		blockMap[block.ID.String()] = block
	}

	sortedBlocks := make([]models.Block, 0, len(blocks))
	for _, id := range contentIDs {
		if block, exists := blockMap[id]; exists {
			sortedBlocks = append(sortedBlocks, block)
			delete(blockMap, id) // 标记已处理
		}
	}

	// 将不在 content_ids 中的 block 追加到末尾（按 created_at 排序）
	remainingBlocks := make([]models.Block, 0, len(blockMap))
	for _, block := range blockMap {
		remainingBlocks = append(remainingBlocks, block)
	}
	// 对剩余的 blocks 按 created_at 排序
	sort.Slice(remainingBlocks, func(i, j int) bool {
		return remainingBlocks[i].CreatedAt.Before(remainingBlocks[j].CreatedAt)
	})
	sortedBlocks = append(sortedBlocks, remainingBlocks...)

	return sortedBlocks, nil
}

// FindRootBlock 查询用户的 root 类型 block
func (r *BlockRepository) FindRootBlock(userID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := r.db.Where("type = ? AND created_by = ? AND deleted_at IS NULL", "root", userID).
		First(&block).Error
	return &block, err
}

// removeIDFromJSON 是一个辅助函数，用于从 json.RawMessage 中移除指定的 UUID
func removeIDFromJSON(raw json.RawMessage, idToRemove uuid.UUID) json.RawMessage {
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return raw
	}

	newIDs := make([]string, 0, len(ids))
	idStr := idToRemove.String()
	for _, id := range ids {
		if id != idStr {
			newIDs = append(newIDs, id)
		}
	}

	result, _ := json.Marshal(newIDs)
	return result
}

func parseContentIDs(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return []string{}, nil
	}

	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil, err
	}
	if ids == nil {
		return []string{}, nil
	}
	return ids, nil
}

func (r *BlockRepository) lockBlockByID(tx *gorm.DB, userID, blockID uuid.UUID, includeDeleted bool) (*models.Block, error) {
	var block models.Block
	query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND created_by = ?", blockID, userID)

	if !includeDeleted {
		query = query.Where("deleted_at IS NULL")
	}

	if err := query.First(&block).Error; err != nil {
		return nil, err
	}

	return &block, nil
}

func (r *BlockRepository) lockRootBlock(tx *gorm.DB, userID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("type = ? AND created_by = ? AND deleted_at IS NULL", "root", userID).
		First(&block).Error
	if err != nil {
		return nil, err
	}
	return &block, nil
}

func (r *BlockRepository) lookupChildOrder(tx *gorm.DB, userID uuid.UUID, parentID *uuid.UUID, childID uuid.UUID) (*int, error) {
	if parentID == nil {
		return nil, nil
	}

	parent, err := r.lockBlockByID(tx, userID, *parentID, false)
	if err != nil {
		return nil, err
	}

	contentIDs, err := parseContentIDs(parent.ContentIDs)
	if err != nil {
		return nil, err
	}

	childIDStr := childID.String()
	for idx, id := range contentIDs {
		if id == childIDStr {
			order := idx
			return &order, nil
		}
	}

	return nil, nil
}

func (r *BlockRepository) removeChildFromParentTx(tx *gorm.DB, userID, parentID, childID uuid.UUID) error {
	parent, err := r.lockBlockByID(tx, userID, parentID, false)
	if err != nil {
		return err
	}

	contentIDs, err := parseContentIDs(parent.ContentIDs)
	if err != nil {
		return err
	}

	childIDStr := childID.String()
	filtered := make([]string, 0, len(contentIDs))
	for _, id := range contentIDs {
		if id != childIDStr {
			filtered = append(filtered, id)
		}
	}

	contentIDsJSON, err := json.Marshal(filtered)
	if err != nil {
		return err
	}

	return tx.Model(&models.Block{}).
		Where("id = ? AND created_by = ?", parentID, userID).
		Update("content_ids", contentIDsJSON).Error
}

func (r *BlockRepository) insertChildIntoParentTx(tx *gorm.DB, userID, parentID, childID uuid.UUID, desiredOrder *int) error {
	parent, err := r.lockBlockByID(tx, userID, parentID, false)
	if err != nil {
		return err
	}

	contentIDs, err := parseContentIDs(parent.ContentIDs)
	if err != nil {
		return err
	}

	childIDStr := childID.String()
	filtered := make([]string, 0, len(contentIDs))
	for _, id := range contentIDs {
		if id != childIDStr {
			filtered = append(filtered, id)
		}
	}

	insertIndex := len(filtered)
	if desiredOrder != nil {
		switch {
		case *desiredOrder <= 0:
			insertIndex = 0
		case *desiredOrder < len(filtered):
			insertIndex = *desiredOrder
		}
	}

	filtered = append(filtered, "")
	copy(filtered[insertIndex+1:], filtered[insertIndex:])
	filtered[insertIndex] = childIDStr

	contentIDsJSON, err := json.Marshal(filtered)
	if err != nil {
		return err
	}

	return tx.Model(&models.Block{}).
		Where("id = ? AND created_by = ?", parentID, userID).
		Update("content_ids", contentIDsJSON).Error
}

func (r *BlockRepository) resolveRestoreParent(tx *gorm.DB, userID uuid.UUID, root *models.Block) (*models.Block, error) {
	if root.DeletedParentID != nil {
		parent, err := r.lockBlockByID(tx, userID, *root.DeletedParentID, false)
		if err == nil {
			if parent.Type != "root" && parent.Type != "folder" {
				return nil, fmt.Errorf("%w: restore parent must be root/folder", gorm.ErrInvalidData)
			}
			return parent, nil
		}
		if err != gorm.ErrRecordNotFound {
			return nil, err
		}
	}

	return r.lockRootBlock(tx, userID)
}

// MoveBlock 处理区块移动和排序，更新 Materialized Path
func (r *BlockRepository) MoveBlock(userID, targetBlockID uuid.UUID, newParentID *uuid.UUID, newContentIDs []string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. 获取目标节点当前状态
		var targetBlock models.Block
		if err := tx.Where("id = ? AND created_by = ? AND deleted_at IS NULL", targetBlockID, userID).First(&targetBlock).Error; err != nil {
			return err
		}

		oldParentID := targetBlock.ParentID

		// ================= 场景一：同级排序 =================
		// 原 parent_id == 请求传来的 new_parent_id 且 new_parent_id 不为空
		if oldParentID != nil && newParentID != nil && *oldParentID == *newParentID {
			// 直接覆盖父节点的 content_ids
			newIDsJSON, err := json.Marshal(newContentIDs)
			if err != nil {
				return err
			}
			return tx.Model(&models.Block{}).
				Where("id = ? AND created_by = ? AND deleted_at IS NULL", *newParentID, userID).
				Update("content_ids", newIDsJSON).Error
		}

		// ================= 场景二：跨级移动 =================

		// 如果 newParentID 为空，默认不允许移动到 root 之外
		if newParentID == nil {
			return nil
		}

		// 1. 获取新旧父节点
		var oldParent, newParent models.Block
		if oldParentID != nil {
			if err := tx.Where("id = ? AND created_by = ?", *oldParentID, userID).First(&oldParent).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("id = ? AND created_by = ?", *newParentID, userID).First(&newParent).Error; err != nil {
			return err
		}

		// 计算前缀
		var oldPrefix string
		if oldParentID != nil {
			oldPrefix = oldParent.Path + targetBlockID.String() + "/"
		} else {
			oldPrefix = targetBlock.Path // Fallback if no parent
		}
		newPrefix := newParent.Path + targetBlockID.String() + "/"

		// 2. 从旧父节点移除目标 block ID
		if oldParentID != nil {
			updatedOldIDsJSON := removeIDFromJSON(oldParent.ContentIDs, targetBlockID)
			if err := tx.Model(&models.Block{}).
				Where("id = ? AND created_by = ?", *oldParentID, userID).
				Update("content_ids", updatedOldIDsJSON).Error; err != nil {
				return err
			}
		}

		// 3. 将新排序数组写入新父节点
		newIDsJSON, err := json.Marshal(newContentIDs)
		if err != nil {
			return err
		}
		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ?", *newParentID, userID).
			Update("content_ids", newIDsJSON).Error; err != nil {
			return err
		}

		// 4. 更新自身的 ParentID
		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ?", targetBlockID, userID).
			Update("parent_id", *newParentID).Error; err != nil {
			return err
		}

		// 5. 级联更新所有后代的 Path
		// UPDATE blocks SET path = newPrefix || SUBSTRING(path FROM len(oldPrefix) + 1) WHERE path LIKE 'oldPrefix%'
		updatePathSQL := `
			UPDATE blocks 
			SET path = ? || SUBSTRING(path FROM ?) 
			WHERE path LIKE ? AND created_by = ? AND deleted_at IS NULL`

		startIndex := len(oldPrefix) + 1

		if err := tx.Exec(updatePathSQL, newPrefix, startIndex, oldPrefix+"%", userID).Error; err != nil {
			return err
		}

		return nil
	})
}

// UpdateDescendantPaths 批量更新子孙节点的 path
// 当移动节点时，需要更新所有子孙节点的 path
func (r *BlockRepository) UpdateDescendantPaths(userID uuid.UUID, oldPath, newPath string) error {
	// 查询所有子孙节点
	var descendants []models.Block
	err := r.db.Where("path LIKE ? AND created_by = ? AND deleted_at IS NULL", oldPath+"%", userID).
		Find(&descendants).Error
	if err != nil {
		return err
	}

	// 批量更新 path
	for _, desc := range descendants {
		// 替换 path 前缀
		newDescPath := strings.Replace(desc.Path, oldPath, newPath, 1)
		r.db.Model(&models.Block{}).
			Where("id = ?", desc.ID).
			Update("path", newDescPath)
	}

	return nil
}

// RebuildContentIDs 批量重建父块的 content_ids
// 根据实际的子块查询结果，重新构建父块的 content_ids 数组
func (r *BlockRepository) RebuildContentIDs(userID uuid.UUID, parentIDs []uuid.UUID) error {
	if len(parentIDs) == 0 {
		return nil
	}

	// 对每个父块，查询其子块并重建 content_ids
	for _, parentID := range parentIDs {
		var children []models.Block
		err := r.db.Select("id").
			Where("parent_id = ? AND created_by = ? AND deleted_at IS NULL", parentID, userID).
			Order("created_at ASC").
			Find(&children).Error

		if err != nil {
			return err
		}

		// 构建 content_ids 数组
		contentIDs := make([]string, len(children))
		for i, child := range children {
			contentIDs[i] = child.ID.String()
		}

		// 更新父块的 content_ids
		contentIDsJSON, err := json.Marshal(contentIDs)
		if err != nil {
			return err
		}

		err = r.db.Model(&models.Block{}).
			Where("id = ? AND created_by = ?", parentID, userID).
			Update("content_ids", contentIDsJSON).Error

		if err != nil {
			return err
		}
	}

	return nil
}

// GetSidebarTree 返回整棵树的结构
func (r *BlockRepository) GetSidebarTree(userID uuid.UUID, rootID uuid.UUID) ([]*models.PageTreeNode, error) {
	var blocks []models.Block

	// 1. O(1) 极速查询：利用 path 索引，且严格限制 type
	err := r.db.Select("id", "parent_id", "type", "properties", "content_ids").
		Where("path LIKE ?", "/"+rootID.String()+"/%").
		Where("type IN ?", []string{"root", "folder", "page"}). // 把 root 查出来作为起点
		Where("created_by = ? AND deleted_at IS NULL", userID).
		Find(&blocks).Error

	if err != nil {
		return nil, err
	}

	// 2. 准备哈希表，实现 O(N) 的极速树组装
	nodeMap := make(map[string]*models.PageTreeNode)

	// 第一遍遍历：初始化所有节点，并存入哈希表
	for _, b := range blocks {
		// 解析 properties 里的 title 和 icon
		var props struct {
			Title string `json:"title"`
			Icon  string `json:"icon"`
		}
		json.Unmarshal(b.Properties, &props)

		// 解析 content_ids
		var contentIDs []string
		json.Unmarshal(b.ContentIDs, &contentIDs)

		if contentIDs == nil {
			contentIDs = []string{}
		}

		node := &models.PageTreeNode{
			ID:         b.ID.String(),
			Type:       b.Type,
			Title:      props.Title,
			Icon:       props.Icon,
			ContentIDs: contentIDs,
			Children:   make([]*models.PageTreeNode, 0),
		}
		if b.ParentID != nil {
			pid := b.ParentID.String()
			node.ParentID = &pid
		}

		nodeMap[node.ID] = node
	}

	// 第二遍遍历：通过哈希表建立父子关系
	var rootNodes []*models.PageTreeNode
	for _, node := range nodeMap {
		if node.ParentID == nil || *node.ParentID == "" {
			// 如果是顶级节点 (或者隐藏的 root 节点)，放入根数组
			rootNodes = append(rootNodes, node)
		} else {
			// 找到它的父节点，把自己塞进父节点的 Children 数组里
			if parent, exists := nodeMap[*node.ParentID]; exists {
				parent.Children = append(parent.Children, node)
			} else {
				// 理论上不会出现，但如果真出现了就把他当作根节点处理
				rootNodes = append(rootNodes, node)
			}
		}
	}

	// 3. 根据 ContentIDs 对 Children 进行排序
	for _, node := range nodeMap {
		if len(node.Children) > 0 && len(node.ContentIDs) > 0 {
			node.Children = sortChildrenByContentIDs(node.Children, node.ContentIDs)
		}
	}

	// 过滤出真正的第一级节点(root的子节点)
	var finalNodes []*models.PageTreeNode
	for _, n := range rootNodes {
		if n.Type == "root" {
			finalNodes = append(finalNodes, n.Children...)
		} else {
			finalNodes = append(finalNodes, n)
		}
	}

	// 对第一级本身也进行排序，如果找到了 root 节点的话
	for _, n := range rootNodes {
		if n.Type == "root" && len(n.ContentIDs) > 0 {
			finalNodes = sortChildrenByContentIDs(finalNodes, n.ContentIDs)
			break
		}
	}

	if finalNodes == nil {
		finalNodes = []*models.PageTreeNode{}
	}

	return finalNodes, nil
}

// 辅助排序函数
func sortChildrenByContentIDs(children []*models.PageTreeNode, contentIDs []string) []*models.PageTreeNode {
	// 建立 ID 对应的排序权重映射
	orderMap := make(map[string]int)
	for i, id := range contentIDs {
		orderMap[id] = i
	}

	sort.SliceStable(children, func(i, j int) bool {
		// 如果在 content_ids 中找不到，放到最后
		rankI, ok1 := orderMap[children[i].ID]
		if !ok1 {
			rankI = 999999
		}
		rankJ, ok2 := orderMap[children[j].ID]
		if !ok2 {
			rankJ = 999999
		}

		return rankI < rankJ
	})

	return children
}

// GetBlockByID 根据 ID 获取 Block（内部使用，无用户隔离）
func (r *BlockRepository) GetBlockByID(ctx context.Context, blockID uuid.UUID) (*models.Block, error) {
	var block models.Block
	err := r.db.WithContext(ctx).
		Where("id = ? AND deleted_at IS NULL", blockID).
		First(&block).Error
	if err != nil {
		return nil, err
	}
	return &block, nil
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
