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
	// 死信 Stream 名称
	StreamKeyBlockIndexDLQ = "stream:block:index:dlq"
	// Consumer Group 名称
	ConsumerGroupIndex = "indexer-group"
	// Consumer 名称
	ConsumerNameIndex = "indexer-1"

	indexActionBatchUpsert      = "batch_upsert"
	indexActionDeletePage       = "delete_page"         // 保留用于单个页面删除
	indexActionBatchDeleteBlock = "batch_delete_blocks" // 批量删除 Block 索引（推荐）
)

const (
	pendingRetryIdle = time.Minute
	maxIndexRetry    = 5
)

// BlockIndexData 单个 Block 的索引数据
type BlockIndexData struct {
	BlockID         uuid.UUID  `json:"block_id"`
	PageID          uuid.UUID  `json:"page_id"`
	UserID          uuid.UUID  `json:"user_id"`
	BlockType       string     `json:"block_type"`
	BlockOrder      int        `json:"block_order"`
	Content         string     `json:"content"`
	SourceUpdatedAt time.Time  `json:"source_updated_at"`
	PublishedAt     *time.Time `json:"published_at,omitempty"`
}

// IndexMessage 索引消息结构
type IndexMessage struct {
	Action    string           `json:"action"`
	IndexData []BlockIndexData `json:"index_data,omitempty"`
	DeleteIDs []uuid.UUID      `json:"delete_ids,omitempty"`
	PageID    *uuid.UUID       `json:"page_id,omitempty"`
	Retry     int              `json:"retry,omitempty"`
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

// PublishBatchIndexTask 发布批量索引任务（传递完整数据）
func (si *SearchIndexer) PublishBatchIndexTask(ctx context.Context, indexData []BlockIndexData, deleteIDs []uuid.UUID) error {
	if len(indexData) == 0 && len(deleteIDs) == 0 {
		return nil
	}
	return si.publishTask(ctx, IndexMessage{
		Action:    indexActionBatchUpsert,
		IndexData: indexData,
		DeleteIDs: deleteIDs,
	})
}

// PublishPageDeleteTask 发布页面删除任务
func (si *SearchIndexer) PublishPageDeleteTask(ctx context.Context, pageID uuid.UUID) error {
	return si.publishTask(ctx, IndexMessage{Action: indexActionDeletePage, PageID: &pageID})
}

// PublishBatchBlockDeleteTask 发布批量 Block 删除任务（推荐使用）
// 直接传递 Block IDs，避免重复查询
func (si *SearchIndexer) PublishBatchBlockDeleteTask(ctx context.Context, blockIDs []uuid.UUID) error {
	if len(blockIDs) == 0 {
		return nil
	}
	return si.publishTask(ctx, IndexMessage{
		Action:    indexActionBatchDeleteBlock,
		DeleteIDs: blockIDs,
	})
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
	case indexActionBatchUpsert:
		err = si.searchService.BatchUpsertIndexes(ctx, msg.IndexData, msg.DeleteIDs)
	case indexActionDeletePage:
		if msg.PageID == nil {
			err = fmt.Errorf("missing page_id")
			break
		}
		err = si.searchService.DeleteBlockIndexesByPageID(ctx, *msg.PageID)
	case indexActionBatchDeleteBlock:
		if len(msg.DeleteIDs) == 0 {
			err = fmt.Errorf("missing delete_ids")
			break
		}
		err = si.searchService.BatchDeleteBlockIndexes(ctx, msg.DeleteIDs)
	default:
		log.Printf("Unknown action: %s", msg.Action)
		si.ackMessage(message.ID)
		return
	}

	if err != nil {
		si.handleMessageFailure(message, msg, err)
		return
	}

	si.ackMessage(message.ID)
}

func (si *SearchIndexer) handleMessageFailure(message redis.XMessage, msg IndexMessage, processErr error) {
	log.Printf("Failed to process message %s (action=%s, retry=%d): %v", message.ID, msg.Action, msg.Retry, processErr)

	if msg.Retry >= maxIndexRetry {
		if err := si.publishDeadLetter(si.ctx, msg, processErr); err != nil {
			log.Printf("Failed to publish dead-letter message %s: %v", message.ID, err)
			return
		}
		si.ackMessage(message.ID)
		return
	}

	msg.Retry++
	if err := si.publishTask(si.ctx, msg); err != nil {
		log.Printf("Failed to republish message %s for retry: %v", message.ID, err)
		return
	}

	si.ackMessage(message.ID)
}

func (si *SearchIndexer) publishDeadLetter(ctx context.Context, msg IndexMessage, processErr error) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal dead-letter message: %w", err)
	}

	_, err = si.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamKeyBlockIndexDLQ,
		Values: map[string]interface{}{
			"data":  string(data),
			"error": processErr.Error(),
		},
	}).Result()
	if err != nil {
		return fmt.Errorf("failed to publish dead-letter message: %w", err)
	}

	return nil
}

// ackMessage 确认消息
func (si *SearchIndexer) ackMessage(messageID string) {
	err := si.rdb.XAck(si.ctx, StreamKeyBlockIndex, ConsumerGroupIndex, messageID).Err()
	if err != nil {
		log.Printf("Failed to ACK message %s: %v", messageID, err)
	}
}
