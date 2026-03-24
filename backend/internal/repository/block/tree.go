package block

import (
	"blog-backend/internal/models"
	"encoding/json"
	"sort"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const parentContentIDUpdateBatchSize = 200

type parentChildRow struct {
	ParentID uuid.UUID `gorm:"column:parent_id"`
	ID       uuid.UUID `gorm:"column:id"`
}

type parentContentIDUpdate struct {
	ParentID   uuid.UUID
	ContentIDs string
}

// FindChildren 查询某个节点的直接子节点（第一层，带用户隔离）
// 返回顺序：按照父节点的 content_ids 字段中的顺序排列
func (r *BlockRepository) FindChildren(userID uuid.UUID, parentID uuid.UUID) ([]models.Block, error) {
	blocks, err := r.findChildrenByCreatedAt(userID, parentID)
	if err != nil {
		return nil, err
	}

	var parent models.Block
	if err := r.db.Where("id = ? AND created_by = ?", parentID, userID).First(&parent).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return blocks, nil
		}
		return nil, err
	}

	contentIDs, err := parseContentIDs(parent.ContentIDs)
	if err != nil || len(contentIDs) == 0 {
		return blocks, nil
	}

	blockMap := make(map[string]models.Block, len(blocks))
	for _, block := range blocks {
		blockMap[block.ID.String()] = block
	}

	sortedBlocks := make([]models.Block, 0, len(blocks))
	for _, id := range contentIDs {
		if block, exists := blockMap[id]; exists {
			sortedBlocks = append(sortedBlocks, block)
			delete(blockMap, id)
		}
	}

	remainingBlocks := make([]models.Block, 0, len(blockMap))
	for _, block := range blockMap {
		remainingBlocks = append(remainingBlocks, block)
	}
	sort.Slice(remainingBlocks, func(i, j int) bool {
		return remainingBlocks[i].CreatedAt.Before(remainingBlocks[j].CreatedAt)
	})

	return append(sortedBlocks, remainingBlocks...), nil
}

func (r *BlockRepository) findChildrenByCreatedAt(userID uuid.UUID, parentID uuid.UUID) ([]models.Block, error) {
	var blocks []models.Block
	err := r.db.Where("deleted_at IS NULL AND created_by = ?", userID).
		Where("type IN ?", []string{"page", "folder"}).
		Where("parent_id = ?", parentID).
		Order("created_at ASC").
		Find(&blocks).Error
	if err != nil {
		return nil, err
	}
	return blocks, nil
}

// RebuildContentIDs 批量重建父块的 content_ids
// 根据实际的子块查询结果，重新构建父块的 content_ids 数组
func (r *BlockRepository) RebuildContentIDs(userID uuid.UUID, parentIDs []uuid.UUID) error {
	uniqueParentIDs := dedupeUUIDs(parentIDs)
	if len(uniqueParentIDs) == 0 {
		return nil
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		parentContentIDs := make(map[uuid.UUID][]string, len(uniqueParentIDs))
		for _, parentID := range uniqueParentIDs {
			parentContentIDs[parentID] = []string{}
		}

		var childRows []parentChildRow
		if err := tx.Model(&models.Block{}).
			Select("parent_id, id").
			Where("parent_id IN ? AND created_by = ? AND deleted_at IS NULL", uniqueParentIDs, userID).
			Order("parent_id ASC, created_at ASC").
			Scan(&childRows).Error; err != nil {
			return err
		}

		for _, childRow := range childRows {
			parentContentIDs[childRow.ParentID] = append(parentContentIDs[childRow.ParentID], childRow.ID.String())
		}

		return r.batchUpdateParentContentIDs(tx, userID, parentContentIDs)
	})
}

func (r *BlockRepository) batchUpdateParentContentIDs(tx *gorm.DB, userID uuid.UUID, parentContentIDs map[uuid.UUID][]string) error {
	if len(parentContentIDs) == 0 {
		return nil
	}

	updates := make([]parentContentIDUpdate, 0, len(parentContentIDs))
	for parentID, childIDs := range parentContentIDs {
		contentIDsJSON, err := json.Marshal(childIDs)
		if err != nil {
			return err
		}
		updates = append(updates, parentContentIDUpdate{
			ParentID:   parentID,
			ContentIDs: string(contentIDsJSON),
		})
	}

	sort.Slice(updates, func(i, j int) bool {
		return updates[i].ParentID.String() < updates[j].ParentID.String()
	})

	for start := 0; start < len(updates); start += parentContentIDUpdateBatchSize {
		end := start + parentContentIDUpdateBatchSize
		if end > len(updates) {
			end = len(updates)
		}

		var sqlBuilder strings.Builder
		sqlBuilder.WriteString(`
			UPDATE blocks AS parent
			SET content_ids = batch_updates.content_ids
			FROM (VALUES
		`)

		args := make([]interface{}, 0, (end-start)*2+1)
		for idx, update := range updates[start:end] {
			if idx > 0 {
				sqlBuilder.WriteString(",")
			}
			sqlBuilder.WriteString(" (?::uuid, ?::jsonb)")
			args = append(args, update.ParentID, update.ContentIDs)
		}

		sqlBuilder.WriteString(`
			) AS batch_updates(id, content_ids)
			WHERE parent.id = batch_updates.id
			  AND parent.created_by = ?
			  AND parent.deleted_at IS NULL
		`)
		args = append(args, userID)

		if err := tx.Exec(sqlBuilder.String(), args...).Error; err != nil {
			return err
		}
	}

	return nil
}

// GetSidebarTree 返回整棵树的结构
func (r *BlockRepository) GetSidebarTree(userID uuid.UUID, rootID uuid.UUID) ([]*models.PageTreeNode, error) {
	var blocks []models.Block

	err := r.db.Select("id", "parent_id", "type", "properties", "content_ids").
		Where("path LIKE ?", "/"+rootID.String()+"/%").
		Where("type IN ?", []string{"root", "folder", "page"}).
		Where("created_by = ? AND deleted_at IS NULL", userID).
		Find(&blocks).Error
	if err != nil {
		return nil, err
	}

	nodeMap := make(map[string]*models.PageTreeNode, len(blocks))
	for _, block := range blocks {
		var props struct {
			Title string `json:"title"`
			Icon  string `json:"icon"`
		}
		json.Unmarshal(block.Properties, &props)

		var contentIDs []string
		json.Unmarshal(block.ContentIDs, &contentIDs)
		if contentIDs == nil {
			contentIDs = []string{}
		}

		node := &models.PageTreeNode{
			ID:         block.ID.String(),
			Type:       block.Type,
			Title:      props.Title,
			Icon:       props.Icon,
			ContentIDs: contentIDs,
			Children:   make([]*models.PageTreeNode, 0),
		}
		if block.ParentID != nil {
			parentID := block.ParentID.String()
			node.ParentID = &parentID
		}

		nodeMap[node.ID] = node
	}

	var rootNodes []*models.PageTreeNode
	for _, node := range nodeMap {
		if node.ParentID == nil || *node.ParentID == "" {
			rootNodes = append(rootNodes, node)
			continue
		}

		if parent, exists := nodeMap[*node.ParentID]; exists {
			parent.Children = append(parent.Children, node)
			continue
		}

		rootNodes = append(rootNodes, node)
	}

	for _, node := range nodeMap {
		if len(node.Children) > 0 && len(node.ContentIDs) > 0 {
			node.Children = sortChildrenByContentIDs(node.Children, node.ContentIDs)
		}
	}

	finalNodes := make([]*models.PageTreeNode, 0, len(rootNodes))
	for _, node := range rootNodes {
		if node.Type == "root" {
			finalNodes = append(finalNodes, node.Children...)
			continue
		}
		finalNodes = append(finalNodes, node)
	}

	for _, node := range rootNodes {
		if node.Type == "root" && len(node.ContentIDs) > 0 {
			finalNodes = sortChildrenByContentIDs(finalNodes, node.ContentIDs)
			break
		}
	}

	if finalNodes == nil {
		finalNodes = []*models.PageTreeNode{}
	}

	return finalNodes, nil
}

func sortChildrenByContentIDs(children []*models.PageTreeNode, contentIDs []string) []*models.PageTreeNode {
	orderMap := make(map[string]int, len(contentIDs))
	for index, id := range contentIDs {
		orderMap[id] = index
	}

	sort.SliceStable(children, func(i, j int) bool {
		rankI, okI := orderMap[children[i].ID]
		if !okI {
			rankI = 999999
		}

		rankJ, okJ := orderMap[children[j].ID]
		if !okJ {
			rankJ = 999999
		}

		return rankI < rankJ
	})

	return children
}
