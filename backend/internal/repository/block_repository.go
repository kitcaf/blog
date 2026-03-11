package repository

import (
	"blog-backend/internal/models"
	"encoding/json"
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

// 极致优化：使用 RETURNING 一把梭软删除并返回 parent_id (避免先查后写)
func (r *BlockRepository) SoftDeleteAndReturnParent(userID, blockID uuid.UUID) (*uuid.UUID, error) {
	var parentID *uuid.UUID
	
	// Postgres 特有的 RETURNING 语法
	err := r.db.Raw(`
		UPDATE blocks 
		SET deleted_at = NOW() 
		WHERE id = ? AND created_by = ? AND deleted_at IS NULL 
		RETURNING parent_id
	`, blockID, userID).Scan(&parentID).Error
	
	return parentID, err
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

// SoftDeleteByPath 软删除指定路径下的所有 Block（级联删除，带用户隔离）
func (r *BlockRepository) SoftDeleteByPath(userID uuid.UUID, path string) error {
	now := time.Now()
	return r.db.Model(&models.Block{}).
		Where("(path LIKE ? OR path = ?) AND created_by = ?", path+"%", path, userID).
		Update("deleted_at", now).Error
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
		if !ok1 { rankI = 999999 }
		rankJ, ok2 := orderMap[children[j].ID]
		if !ok2 { rankJ = 999999 }
		
		return rankI < rankJ
	})
	
	return children
}
