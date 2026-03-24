package block

import (
	"blog-backend/internal/models"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TrashDeleteResult struct {
	DeletedBlockIDs []uuid.UUID
}

type TrashRestoreResult struct {
	RootID          uuid.UUID
	RootType        string
	RootPath        string
	RestoredPageIDs []uuid.UUID
}

type TrashCleanupBatchResult struct {
	DeletedRootCount int64 `gorm:"column:deleted_root_count"`
	DeletedRowCount  int64 `gorm:"column:deleted_row_count"`
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

		result.RootID = root.ID
		result.RootType = root.Type
		result.RootPath = newRootPath

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

// PermanentlyDeleteTrashRoot 物理删除一个回收站根项及其当前归属的整棵软删子树。
func (r *BlockRepository) PermanentlyDeleteTrashRoot(userID, trashRootID uuid.UUID) error {
	return r.PermanentlyDeleteTrashRoots(userID, []uuid.UUID{trashRootID})
}

// PermanentlyDeleteTrashRoots 批量永久删除多个回收站根项。
func (r *BlockRepository) PermanentlyDeleteTrashRoots(userID uuid.UUID, trashRootIDs []uuid.UUID) error {
	uniqueIDs := dedupeUUIDs(trashRootIDs)
	if len(uniqueIDs) == 0 {
		return nil
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		var validRootIDs []uuid.UUID
		if err := tx.Model(&models.Block{}).
			Where("created_by = ? AND id IN ? AND deleted_at IS NOT NULL AND id = trash_root_id", userID, uniqueIDs).
			Pluck("id", &validRootIDs).Error; err != nil {
			return err
		}
		if len(validRootIDs) != len(uniqueIDs) {
			return gorm.ErrRecordNotFound
		}

		if err := tx.Where("created_by = ? AND trash_root_id IN ? AND deleted_at IS NOT NULL", userID, validRootIDs).
			Delete(&models.Block{}).Error; err != nil {
			return err
		}

		return nil
	})
}

// DeleteExpiredTrashRootsBatch 批量删除过期的回收站根项及其软删子树。
// 通过 FOR UPDATE SKIP LOCKED 避免多实例下重复选择相同根项。
func (r *BlockRepository) DeleteExpiredTrashRootsBatch(cutoff time.Time, limit int) (*TrashCleanupBatchResult, error) {
	if limit <= 0 {
		limit = 100
	}

	var result TrashCleanupBatchResult
	err := r.db.Raw(`
		WITH expired_roots AS (
			SELECT id
			FROM blocks
			WHERE deleted_at IS NOT NULL
			  AND deleted_at < ?
			  AND id = trash_root_id
			  AND type IN ('folder', 'page')
			ORDER BY deleted_at ASC
			LIMIT ?
			FOR UPDATE SKIP LOCKED
		),
		deleted_rows AS (
			DELETE FROM blocks
			WHERE trash_root_id IN (SELECT id FROM expired_roots)
			  AND deleted_at IS NOT NULL
			RETURNING 1
		)
		SELECT
			COALESCE((SELECT COUNT(*) FROM expired_roots), 0) AS deleted_root_count,
			COALESCE((SELECT COUNT(*) FROM deleted_rows), 0) AS deleted_row_count
	`, cutoff, limit).Scan(&result).Error
	if err != nil {
		return nil, err
	}

	return &result, nil
}
