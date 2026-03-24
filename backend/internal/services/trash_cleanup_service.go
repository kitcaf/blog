package services

/**
 * 回收站自动清理服务
 *
 * 功能：定时清理超过 30 天的回收站项目
 * 执行时间：每天凌晨 3 点
 * 清理策略：批量处理，每批 100 条
 */

import (
	"context"
	"log"
	"time"

	blockrepo "blog-backend/internal/repository/block"
)

const (
	trashRetentionPeriod  = 30 * 24 * time.Hour // 回收站保留期限：30 天
	trashCleanupBatchSize = 100                 // 每批处理数量：100 条
	trashCleanupHour      = 3                   // 执行时间：凌晨 3 点
)

// TrashCleanupService 定时清理超过 30 天的回收站根项。
// 它只处理 blocks 软删子树，不触碰 block_search_index：
// 搜索索引应在"进入回收站"时已经被删除。
type TrashCleanupService struct {
	blockRepo *blockrepo.BlockRepository // Block 数据仓库
	ctx       context.Context            // 上下文，用于控制服务生命周期
	cancel    context.CancelFunc         // 取消函数，用于停止服务
	location  *time.Location             // 时区信息
}

// NewTrashCleanupService 创建回收站清理服务实例
func NewTrashCleanupService(blockRepo *blockrepo.BlockRepository) *TrashCleanupService {
	ctx, cancel := context.WithCancel(context.Background())
	return &TrashCleanupService{
		blockRepo: blockRepo,
		ctx:       ctx,
		cancel:    cancel,
		location:  time.Local, // 使用本地时区
	}
}

// Start 启动回收站清理服务
// 服务启动后会立即执行一次清理，然后每天凌晨 3 点定时执行
func (s *TrashCleanupService) Start() {
	log.Println("Trash cleanup service started")
	go s.run()
}

// Stop 停止回收站清理服务
func (s *TrashCleanupService) Stop() {
	s.cancel()
}

// run 服务主循环
// 1. 启动时立即执行一次清理
// 2. 计算下次执行时间（凌晨 3 点）
// 3. 等待到达执行时间或收到停止信号
func (s *TrashCleanupService) run() {
	// 启动时立即执行一次清理
	s.cleanupExpiredTrash("startup")

	for {
		// 计算距离下次执行的等待时间
		waitDuration := time.Until(nextTrashCleanupRun(time.Now().In(s.location), s.location))
		timer := time.NewTimer(waitDuration)

		select {
		case <-s.ctx.Done():
			// 收到停止信号
			timer.Stop()
			log.Println("Trash cleanup service stopped")
			return
		case <-timer.C:
			// 到达执行时间，执行定时清理
			s.cleanupExpiredTrash("scheduled")
		}
	}
}

// cleanupExpiredTrash 清理过期的回收站项目
// 参数 reason: 清理原因（"startup" 或 "scheduled"）
//
// 清理流程：
// 1. 计算截止时间（当前时间 - 30 天）
// 2. 使用批量 SQL 查询并删除过期的回收站根项（每批 100 条）
// 3. 重复直到没有更多过期项
// 4. 重复直到没有更多过期项
func (s *TrashCleanupService) cleanupExpiredTrash(reason string) {
	// 计算截止时间：当前时间 - 30 天
	cutoff := time.Now().UTC().Add(-trashRetentionPeriod)
	totalDeletedRoots := 0
	totalDeletedRows := int64(0)

	for {
		// 批量删除过期的回收站根项及其所有软删子树
		batchResult, err := s.blockRepo.DeleteExpiredTrashRootsBatch(cutoff, trashCleanupBatchSize)
		if err != nil {
			log.Printf("Trash cleanup failed during %s batch delete: %v", reason, err)
			return
		}

		// 没有更多过期项，清理完成
		if batchResult.DeletedRootCount == 0 {
			if totalDeletedRoots > 0 {
				log.Printf("Trash cleanup finished (%s), deleted %d expired root items and %d rows", reason, totalDeletedRoots, totalDeletedRows)
			}
			return
		}

		totalDeletedRoots += int(batchResult.DeletedRootCount)
		totalDeletedRows += batchResult.DeletedRowCount

		// 如果本批数量不足或没有成功删除任何项，结束清理
		if batchResult.DeletedRootCount < trashCleanupBatchSize || batchResult.DeletedRowCount == 0 {
			if totalDeletedRoots > 0 {
				log.Printf("Trash cleanup finished (%s), deleted %d expired root items and %d rows", reason, totalDeletedRoots, totalDeletedRows)
			}
			return
		}
	}
}

// nextTrashCleanupRun 计算下次清理任务的执行时间
// 参数 now: 当前时间
// 参数 location: 时区信息
// 返回值: 下次执行时间（今天或明天的凌晨 3 点）
func nextTrashCleanupRun(now time.Time, location *time.Location) time.Time {
	// 构造今天凌晨 3 点的时间
	next := time.Date(now.Year(), now.Month(), now.Day(), trashCleanupHour, 0, 0, 0, location)

	// 如果今天的 3 点已经过了，则设置为明天的 3 点
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}
