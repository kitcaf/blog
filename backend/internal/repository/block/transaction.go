package block

import (
	"blog-backend/internal/models"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

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

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return nil
	}

	seen := make(map[uuid.UUID]struct{}, len(ids))
	result := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}

	return result
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
	for index, id := range contentIDs {
		if id == childIDStr {
			order := index
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
