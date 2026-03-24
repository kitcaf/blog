package block

import (
	"blog-backend/internal/models"
	"encoding/json"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// MoveBlock 处理区块移动和排序，更新 Materialized Path
func (r *BlockRepository) MoveBlock(userID, targetBlockID uuid.UUID, newParentID *uuid.UUID, newContentIDs []string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var targetBlock models.Block
		if err := tx.Where("id = ? AND created_by = ? AND deleted_at IS NULL", targetBlockID, userID).First(&targetBlock).Error; err != nil {
			return err
		}

		oldParentID := targetBlock.ParentID

		if oldParentID != nil && newParentID != nil && *oldParentID == *newParentID {
			newIDsJSON, err := json.Marshal(newContentIDs)
			if err != nil {
				return err
			}
			return tx.Model(&models.Block{}).
				Where("id = ? AND created_by = ? AND deleted_at IS NULL", *newParentID, userID).
				Update("content_ids", newIDsJSON).Error
		}

		if newParentID == nil {
			return nil
		}

		var oldParent, newParent models.Block
		if oldParentID != nil {
			if err := tx.Where("id = ? AND created_by = ?", *oldParentID, userID).First(&oldParent).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("id = ? AND created_by = ?", *newParentID, userID).First(&newParent).Error; err != nil {
			return err
		}

		oldPrefix := targetBlock.Path
		if oldParentID != nil {
			oldPrefix = oldParent.Path + targetBlockID.String() + "/"
		}
		newPrefix := newParent.Path + targetBlockID.String() + "/"

		if oldParentID != nil {
			updatedOldIDsJSON := removeIDFromJSON(oldParent.ContentIDs, targetBlockID)
			if err := tx.Model(&models.Block{}).
				Where("id = ? AND created_by = ?", *oldParentID, userID).
				Update("content_ids", updatedOldIDsJSON).Error; err != nil {
				return err
			}
		}

		newIDsJSON, err := json.Marshal(newContentIDs)
		if err != nil {
			return err
		}
		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ?", *newParentID, userID).
			Update("content_ids", newIDsJSON).Error; err != nil {
			return err
		}

		if err := tx.Model(&models.Block{}).
			Where("id = ? AND created_by = ?", targetBlockID, userID).
			Update("parent_id", *newParentID).Error; err != nil {
			return err
		}

		startIndex := len(oldPrefix) + 1
		return tx.Exec(`
			UPDATE blocks
			SET path = ? || SUBSTRING(path FROM ?)
			WHERE path LIKE ? AND created_by = ? AND deleted_at IS NULL
		`, newPrefix, startIndex, oldPrefix+"%", userID).Error
	})
}

// UpdateDescendantPaths 批量更新子孙节点的 path
func (r *BlockRepository) UpdateDescendantPaths(userID uuid.UUID, oldPath, newPath string) error {
	if oldPath == "" || newPath == "" || oldPath == newPath {
		return nil
	}

	startIndex := len(oldPath) + 1
	return r.db.Exec(`
		UPDATE blocks
		SET path = ? || SUBSTRING(path FROM ?)
		WHERE path LIKE ?
		  AND created_by = ?
		  AND deleted_at IS NULL
	`, newPath, startIndex, oldPath+"%", userID).Error
}

func removeIDFromJSON(raw json.RawMessage, idToRemove uuid.UUID) json.RawMessage {
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return raw
	}

	idStr := idToRemove.String()
	filtered := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != idStr {
			filtered = append(filtered, id)
		}
	}

	result, _ := json.Marshal(filtered)
	return result
}
