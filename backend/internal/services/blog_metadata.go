package services

import (
	"blog-backend/internal/models"
	"encoding/json"
	"strings"
)

const (
	pagePropertyTitleKey       = "title"
	pagePropertyDescriptionKey = "description"
	pagePropertyCoverURLKey    = "cover_url"
	pagePropertyTagsKey        = "tags"
)

func parsePropertiesMap(raw json.RawMessage) (map[string]interface{}, error) {
	if len(raw) == 0 {
		return map[string]interface{}{}, nil
	}

	var properties map[string]interface{}
	if err := json.Unmarshal(raw, &properties); err != nil {
		return nil, err
	}
	if properties == nil {
		return map[string]interface{}{}, nil
	}
	return properties, nil
}

func marshalPropertiesMap(properties map[string]interface{}) (json.RawMessage, error) {
	encoded, err := json.Marshal(properties)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func getPageTitle(properties map[string]interface{}) string {
	title, _ := properties[pagePropertyTitleKey].(string)
	return strings.TrimSpace(title)
}

func getOptionalStringProperty(properties map[string]interface{}, key string) *string {
	value, ok := properties[key].(string)
	if !ok {
		return nil
	}

	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	return &value
}

func getStringSliceProperty(properties map[string]interface{}, key string) []string {
	raw, exists := properties[key]
	if !exists {
		return []string{}
	}

	items, ok := raw.([]interface{})
	if !ok {
		return []string{}
	}

	tags := make([]string, 0, len(items))
	for _, item := range items {
		tag, ok := item.(string)
		if !ok {
			continue
		}
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		tags = append(tags, tag)
	}

	return normalizeTags(tags)
}

func setOptionalStringProperty(properties map[string]interface{}, key string, value *string) {
	if value == nil {
		delete(properties, key)
		return
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		delete(properties, key)
		return
	}

	properties[key] = trimmed
}

func setTagsProperty(properties map[string]interface{}, tags []string) {
	normalized := normalizeTags(tags)
	if len(normalized) == 0 {
		delete(properties, pagePropertyTagsKey)
		return
	}

	properties[pagePropertyTagsKey] = normalized
}

func normalizeTags(tags []string) []string {
	if len(tags) == 0 {
		return []string{}
	}

	seen := make(map[string]struct{}, len(tags))
	normalized := make([]string, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}

		lookupKey := strings.ToLower(trimmed)
		if _, exists := seen[lookupKey]; exists {
			continue
		}

		seen[lookupKey] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func buildPublicPostDetail(
	page *models.Block,
	allBlocks []models.Block,
	category *models.PublicPostCategory,
) (*models.PublicPostDetail, error) {
	properties, err := parsePropertiesMap(page.Properties)
	if err != nil {
		return nil, err
	}

	detail := &models.PublicPostDetail{
		ID:          page.ID,
		Title:       getPageTitle(properties),
		Slug:        derefString(page.Slug),
		Description: getOptionalStringProperty(properties, pagePropertyDescriptionKey),
		CoverURL:    getOptionalStringProperty(properties, pagePropertyCoverURLKey),
		Tags:        getStringSliceProperty(properties, pagePropertyTagsKey),
		Category:    category,
		PublishedAt: *page.PublishedAt,
		Blocks:      make([]models.PublicPostBlock, 0, len(allBlocks)),
	}

	for _, block := range allBlocks {
		if block.Type == "root" || block.Type == "folder" || block.Type == "page" {
			continue
		}

		properties := block.Properties
		if len(properties) == 0 {
			properties = json.RawMessage(`{}`)
		}

		detail.Blocks = append(detail.Blocks, models.PublicPostBlock{
			ID:         block.ID,
			Type:       block.Type,
			Properties: properties,
		})
	}

	return detail, nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
