package repository

import "testing"

func TestBuildPrefixTSQuery(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "chinese prefix query",
			query: "测试",
			want:  "测试:*",
		},
		{
			name:  "mixed language query",
			query: "React 性能",
			want:  "react:* & 性能:*",
		},
		{
			name:  "punctuation splits tokens",
			query: "foo-bar/baz",
			want:  "foo:* & bar:* & baz:*",
		},
		{
			name:  "ignores empty query",
			query: "  --  ",
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildPrefixTSQuery(tt.query); got != tt.want {
				t.Fatalf("buildPrefixTSQuery(%q) = %q, want %q", tt.query, got, tt.want)
			}
		})
	}
}
