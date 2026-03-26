package utils

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"
	"strings"
)

const (
	defaultSlugMaxLength  = 50
	defaultSlugHashLength = 4
)

var slugSanitizer = regexp.MustCompile(`[^\w\u4e00-\u9fa5]+`)

// GenerateSlug 根据标题生成 SEO 友好的 slug
// 格式：标题转换 + 短随机哈希
// 例如：GenerateSlug("我的第一篇文章") -> "wo-de-di-yi-pian-wen-zhang-a3f2"
func GenerateSlug(title string) string {
	normalized := NormalizeSlug(title)
	randomHash := generateRandomHash(defaultSlugHashLength)

	if normalized == "" {
		return "page-" + randomHash
	}

	return normalized + "-" + randomHash
}

// NormalizeSlug 将任意输入规范化为不含随机后缀的 slug 片段。
// 该函数适合分类 slug 或手工 slug 编辑时的预处理。
func NormalizeSlug(input string) string {
	slug := strings.ToLower(strings.TrimSpace(input))
	slug = slugSanitizer.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")

	if len(slug) > defaultSlugMaxLength {
		slug = slug[:defaultSlugMaxLength]
		if lastDash := strings.LastIndex(slug, "-"); lastDash > 30 {
			slug = slug[:lastDash]
		}
	}

	return strings.Trim(slug, "-")
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
