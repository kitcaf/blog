package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	// Redis Stream 名称
	StreamKeyBlockIndex = "stream:block:index"
	// Consumer Group 名称
	ConsumerGroupIndex = "indexer-group"
	// Consumer 名称
	ConsumerNameIndex = "indexer-1"

	indexActionUpsertBlock  = "upsert_block"
	indexActionDeleteBlock  = "delete_block"
	indexActionDeleteBlocks = "delete_blocks"
	indexActionDeletePage   = "delete_page"
	indexActionReindexPage  = "reindex_page"
)

const pendingRetryIdle = time.Minute

// IndexMessage 索引消息结构
type IndexMessage struct {
	Action   string      `json:"action"`
	BlockID  *uuid.UUID  `json:"block_id,omitempty"`
	BlockIDs []uuid.UUID `json:"block_ids,omitempty"`
	PageID   *uuid.UUID  `json:"page_id,omitempty"`
}

// SearchIndexer 搜索索引器（异步处理）
type SearchIndexer struct {
	rdb           *redis.Client
	searchService *SearchService
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewSearchIndexer 创建搜索索引器
func NewSearchIndexer(rdb *redis.Client, db *gorm.DB) *SearchIndexer {
	ctx, cancel := context.WithCancel(context.Background())
	return &SearchIndexer{
		rdb:           rdb,
		searchService: NewSearchService(db),
		ctx:           ctx,
		cancel:        cancel,
	}
}

// Start 启动索引器（后台 Worker）
func (si *SearchIndexer) Start() error {
	err := si.rdb.XGroupCreateMkStream(si.ctx, StreamKeyBlockIndex, ConsumerGroupIndex, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	log.Println("Search indexer started, listening to Redis Stream:", StreamKeyBlockIndex)
	go si.consumeLoop()
	return nil
}

// Stop 停止索引器
func (si *SearchIndexer) Stop() {
	log.Println("Stopping search indexer...")
	si.cancel()
}

func (si *SearchIndexer) PublishBlockUpsertTask(ctx context.Context, blockID uuid.UUID) error {
	return si.publishTask(ctx, IndexMessage{Action: indexActionUpsertBlock, BlockID: &blockID})
}

func (si *SearchIndexer) PublishBlockDeleteTask(ctx context.Context, blockID uuid.UUID) error {
	return si.publishTask(ctx, IndexMessage{Action: indexActionDeleteBlock, BlockID: &blockID})
}

func (si *SearchIndexer) PublishBlockBatchDeleteTask(ctx context.Context, blockIDs []uuid.UUID) error {
	if len(blockIDs) == 0 {
		return nil
	}
	return si.publishTask(ctx, IndexMessage{Action: indexActionDeleteBlocks, BlockIDs: blockIDs})
}

func (si *SearchIndexer) PublishPageDeleteTask(ctx context.Context, pageID uuid.UUID) error {
	return si.publishTask(ctx, IndexMessage{Action: indexActionDeletePage, PageID: &pageID})
}

func (si *SearchIndexer) PublishPageReindexTask(ctx context.Context, pageID uuid.UUID) error {
	return si.publishTask(ctx, IndexMessage{Action: indexActionReindexPage, PageID: &pageID})
}

func (si *SearchIndexer) publishTask(ctx context.Context, msg IndexMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal index message: %w", err)
	}

	_, err = si.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamKeyBlockIndex,
		Values: map[string]interface{}{"data": string(data)},
	}).Result()
	if err != nil {
		return fmt.Errorf("failed to publish index task: %w", err)
	}

	return nil
}

// consumeLoop 消费循环（阻塞）
func (si *SearchIndexer) consumeLoop() {
	for {
		select {
		case <-si.ctx.Done():
			log.Println("Search indexer stopped")
			return
		default:
			si.processMessages()
		}
	}
}

// processMessages 处理消息
func (si *SearchIndexer) processMessages() {
	if err := si.reclaimPendingMessages(); err != nil {
		log.Printf("Error reclaiming pending messages: %v", err)
	}

	streams, err := si.rdb.XReadGroup(si.ctx, &redis.XReadGroupArgs{
		Group:    ConsumerGroupIndex,
		Consumer: ConsumerNameIndex,
		Streams:  []string{StreamKeyBlockIndex, ">"},
		Count:    10,
		Block:    5 * time.Second,
		NoAck:    false,
	}).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("Error reading from stream: %v", err)
		}
		return
	}

	for _, stream := range streams {
		for _, message := range stream.Messages {
			si.handleMessage(message)
		}
	}
}

func (si *SearchIndexer) reclaimPendingMessages() error {
	pending, err := si.rdb.XPendingExt(si.ctx, &redis.XPendingExtArgs{
		Stream: StreamKeyBlockIndex,
		Group:  ConsumerGroupIndex,
		Start:  "-",
		End:    "+",
		Count:  20,
		Idle:   pendingRetryIdle,
	}).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	messageIDs := make([]string, 0, len(pending))
	for _, item := range pending {
		messageIDs = append(messageIDs, item.ID)
	}

	messages, err := si.rdb.XClaim(si.ctx, &redis.XClaimArgs{
		Stream:   StreamKeyBlockIndex,
		Group:    ConsumerGroupIndex,
		Consumer: ConsumerNameIndex,
		MinIdle:  pendingRetryIdle,
		Messages: messageIDs,
	}).Result()
	if err != nil && err != redis.Nil {
		return err
	}

	for _, message := range messages {
		si.handleMessage(message)
	}

	return nil
}

// handleMessage 处理单条消息
func (si *SearchIndexer) handleMessage(message redis.XMessage) {
	dataStr, ok := message.Values["data"].(string)
	if !ok {
		log.Printf("Invalid message format: %v", message.ID)
		si.ackMessage(message.ID)
		return
	}

	var msg IndexMessage
	if err := json.Unmarshal([]byte(dataStr), &msg); err != nil {
		log.Printf("Failed to unmarshal message %s: %v", message.ID, err)
		si.ackMessage(message.ID)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var err error
	switch msg.Action {
	case indexActionUpsertBlock:
		if msg.BlockID == nil {
			err = fmt.Errorf("missing block_id")
			break
		}
		err = si.searchService.IndexBlock(ctx, *msg.BlockID)
	case indexActionDeleteBlock:
		if msg.BlockID == nil {
			err = fmt.Errorf("missing block_id")
			break
		}
		err = si.searchService.DeleteBlockIndex(ctx, *msg.BlockID)
	case indexActionDeleteBlocks:
		err = si.searchService.BatchDeleteBlockIndexes(ctx, msg.BlockIDs)
	case indexActionDeletePage:
		if msg.PageID == nil {
			err = fmt.Errorf("missing page_id")
			break
		}
		err = si.searchService.DeleteBlockIndexesByPageID(ctx, *msg.PageID)
	case indexActionReindexPage:
		if msg.PageID == nil {
			err = fmt.Errorf("missing page_id")
			break
		}
		err = si.searchService.ReindexPage(ctx, *msg.PageID)
	default:
		log.Printf("Unknown action: %s", msg.Action)
		si.ackMessage(message.ID)
		return
	}

	if err != nil {
		log.Printf("Failed to process message %s (action=%s): %v", message.ID, msg.Action, err)
		return
	}

	// 成功处理，ACK 消息。
	// 失败消息会保留在 pending 列表，后续由 reclaimPendingMessages 重新认领。
	si.ackMessage(message.ID)
}

// ackMessage 确认消息
func (si *SearchIndexer) ackMessage(messageID string) {
	err := si.rdb.XAck(si.ctx, StreamKeyBlockIndex, ConsumerGroupIndex, messageID).Err()
	if err != nil {
		log.Printf("Failed to ACK message %s: %v", messageID, err)
	}
}
