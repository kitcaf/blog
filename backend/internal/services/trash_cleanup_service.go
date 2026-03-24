package services

import (
	"context"
	"log"
	"time"

	"blog-backend/internal/repository"
)

const (
	trashRetentionPeriod  = 30 * 24 * time.Hour
	trashCleanupBatchSize = 100
	trashCleanupHour      = 3
)

// TrashCleanupService 定时清理超过 30 天的回收站根项。
// 它只处理 blocks 软删子树，不触碰 block_search_index：
// 搜索索引应在“进入回收站”时已经被删除。
type TrashCleanupService struct {
	blockRepo *repository.BlockRepository
	ctx       context.Context
	cancel    context.CancelFunc
	location  *time.Location
}

func NewTrashCleanupService(blockRepo *repository.BlockRepository) *TrashCleanupService {
	ctx, cancel := context.WithCancel(context.Background())
	return &TrashCleanupService{
		blockRepo: blockRepo,
		ctx:       ctx,
		cancel:    cancel,
		location:  time.Local,
	}
}

func (s *TrashCleanupService) Start() {
	log.Println("Trash cleanup service started")
	go s.run()
}

func (s *TrashCleanupService) Stop() {
	s.cancel()
}

func (s *TrashCleanupService) run() {
	s.cleanupExpiredTrash("startup")

	for {
		waitDuration := time.Until(nextTrashCleanupRun(time.Now().In(s.location), s.location))
		timer := time.NewTimer(waitDuration)

		select {
		case <-s.ctx.Done():
			timer.Stop()
			log.Println("Trash cleanup service stopped")
			return
		case <-timer.C:
			s.cleanupExpiredTrash("scheduled")
		}
	}
}

func (s *TrashCleanupService) cleanupExpiredTrash(reason string) {
	cutoff := time.Now().UTC().Add(-trashRetentionPeriod)
	totalDeletedRoots := 0

	for {
		expiredRoots, err := s.blockRepo.ListExpiredTrashRoots(cutoff, trashCleanupBatchSize)
		if err != nil {
			log.Printf("Trash cleanup failed during %s scan: %v", reason, err)
			return
		}
		if len(expiredRoots) == 0 {
			if totalDeletedRoots > 0 {
				log.Printf("Trash cleanup finished (%s), deleted %d expired root items", reason, totalDeletedRoots)
			}
			return
		}

		deletedThisBatch := 0
		for _, root := range expiredRoots {
			if err := s.blockRepo.PermanentlyDeleteTrashRoot(root.CreatedBy, root.ID); err != nil {
				log.Printf("Trash cleanup failed for root %s: %v", root.ID, err)
				continue
			}
			deletedThisBatch++
			totalDeletedRoots++
		}

		if len(expiredRoots) < trashCleanupBatchSize || deletedThisBatch == 0 {
			if totalDeletedRoots > 0 {
				log.Printf("Trash cleanup finished (%s), deleted %d expired root items", reason, totalDeletedRoots)
			}
			return
		}
	}
}

func nextTrashCleanupRun(now time.Time, location *time.Location) time.Time {
	next := time.Date(now.Year(), now.Month(), now.Day(), trashCleanupHour, 0, 0, 0, location)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}
