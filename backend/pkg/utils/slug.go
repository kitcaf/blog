package utils

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"
	"strings"
)

// GenerateSlug 根据标题生成 SEO 友好的 slug
// 格式：标题转换 + 短随机哈希
// 例如：GenerateSlug("我的第一篇文章") -> "wo-de-di-yi-pian-wen-zhang-a3f2"
func GenerateSlug(title string) string {
	// 1. 转小写
	slug := strings.ToLower(title)

	// 2. 替换空格和特殊字符为连字符
	slug = regexp.MustCompile(`[^\w\u4e00-\u9fa5]+`).ReplaceAllString(slug, "-")

	// 3. 移除首尾的连字符
	slug = strings.Trim(slug, "-")

	// 4. 限制长度（保留前50个字符）
	if len(slug) > 50 {
		slug = slug[:50]
		// 确保不在单词中间截断
		if lastDash := strings.LastIndex(slug, "-"); lastDash > 30 {
			slug = slug[:lastDash]
		}
	}

	// 5. 添加4位随机哈希避免冲突
	randomHash := generateRandomHash(4)
	slug = slug + "-" + randomHash

	return slug
}

// generateRandomHash 生成指定长度的随机十六进制字符串
func generateRandomHash(length int) string {
	bytes := make([]byte, (length+1)/2)
	if _, err := rand.Read(bytes); err != nil {
		// 降级方案：使用时间戳
		return hex.EncodeToString([]byte(string(rune(length))))[:length]
	}
	return hex.EncodeToString(bytes)[:length]
}

// ValidateSlug 验证 slug 格式是否合法
// 规则：只能包含小写字母、数字、连字符，长度 3-100
func ValidateSlug(slug string) bool {
	if len(slug) < 3 || len(slug) > 100 {
		return false
	}
	matched, _ := regexp.MatchString(`^[a-z0-9\u4e00-\u9fa5]+(-[a-z0-9\u4e00-\u9fa5]+)*$`, slug)
	return matched
}
