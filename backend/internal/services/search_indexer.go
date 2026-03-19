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
)

// IndexMessage 索引消息结构
type IndexMessage struct {
	Action  string    `json:"action"`   // "upsert" 或 "delete"
	BlockID uuid.UUID `json:"block_id"` // Block ID
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
	// 创建 Consumer Group（如果不存在）
	err := si.rdb.XGroupCreateMkStream(si.ctx, StreamKeyBlockIndex, ConsumerGroupIndex, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	log.Println("✓ Search indexer started, listening to Redis Stream:", StreamKeyBlockIndex)

	// 启动消费循环
	go si.consumeLoop()

	return nil
}

// Stop 停止索引器
func (si *SearchIndexer) Stop() {
	log.Println("Stopping search indexer...")
	si.cancel()
}

// PublishIndexTask 发布索引任务到 Redis Stream
func (si *SearchIndexer) PublishIndexTask(ctx context.Context, action string, blockID uuid.UUID) error {
	msg := IndexMessage{
		Action:  action,
		BlockID: blockID,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal index message: %w", err)
	}

	// 发送到 Redis Stream
	_, err = si.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamKeyBlockIndex,
		Values: map[string]interface{}{
			"data": string(data),
		},
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
	// 从 Redis Stream 读取消息
	streams, err := si.rdb.XReadGroup(si.ctx, &redis.XReadGroupArgs{
		Group:    ConsumerGroupIndex,
		Consumer: ConsumerNameIndex,
		Streams:  []string{StreamKeyBlockIndex, ">"},
		Count:    10,              // 每次最多读取 10 条
		Block:    5 * time.Second, // 阻塞等待 5 秒
		NoAck:    false,           // 需要手动 ACK
	}).Result()

	if err != nil {
		if err != redis.Nil {
			log.Printf("Error reading from stream: %v", err)
		}
		return
	}

	// 处理每条消息
	for _, stream := range streams {
		for _, message := range stream.Messages {
			si.handleMessage(message)
		}
	}
}

// handleMessage 处理单条消息
func (si *SearchIndexer) handleMessage(message redis.XMessage) {
	// 解析消息
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

	// 执行索引操作
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	switch msg.Action {
	case "upsert":
		err = si.searchService.IndexBlock(ctx, msg.BlockID)
	case "delete":
		err = si.searchService.DeleteBlockIndex(ctx, msg.BlockID)
	default:
		log.Printf("Unknown action: %s", msg.Action)
		si.ackMessage(message.ID)
		return
	}

	if err != nil {
		log.Printf("Failed to process message %s (action=%s, block_id=%s): %v",
			message.ID, msg.Action, msg.BlockID, err)
		// 不 ACK，让消息重试（Redis Stream 会自动重新投递）
		return
	}

	// 成功处理，ACK 消息
	si.ackMessage(message.ID)
}

// ackMessage 确认消息
func (si *SearchIndexer) ackMessage(messageID string) {
	err := si.rdb.XAck(si.ctx, StreamKeyBlockIndex, ConsumerGroupIndex, messageID).Err()
	if err != nil {
		log.Printf("Failed to ACK message %s: %v", messageID, err)
	}
}
