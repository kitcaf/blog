<script setup lang="ts">
import type { MarkdownTocItem } from '@blog/markdown-renderer'

defineProps<{
  items: MarkdownTocItem[]
}>()
</script>

<template>
  <aside class="article-toc" aria-label="Article contents">
    <p class="article-toc__title">Contents</p>
    <ol class="article-toc__list">
      <li v-for="item in items" :key="item.id">
        <a
          :href="`#${item.id}`"
          class="article-toc__link"
          :class="[
            `article-toc__link--depth-${item.depth}`,
            { 'article-toc__link--nested': item.depth > 2 }
          ]"
          :title="item.text"
        >
          {{ item.text }}
        </a>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.article-toc {
  --article-toc-right: clamp(1.25rem, 2vw, 3.5rem);
  --article-toc-top: clamp(7rem, 12vh, 10rem);
  --article-toc-width: clamp(11.5rem, 12vw, 15rem);

  position: fixed;
  top: var(--article-toc-top);
  right: var(--article-toc-right);
  display: none;
  width: var(--article-toc-width);
  max-height: calc(100vh - var(--article-toc-top) - 2rem);
  overflow-y: auto;
  padding-right: 0.25rem;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--color-fg-lightest) transparent;
  z-index: 10;
}

.article-toc__title {
  margin-bottom: 1rem;
  color: var(--color-fg-lighter);
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  line-height: 1.4;
  text-transform: uppercase;
}

.article-toc__list {
  border-left: 1px solid var(--color-fg-lightest);
  padding-left: 0.875rem;
}

.article-toc__link {
  display: -webkit-box;
  overflow: hidden;
  padding: 0.3rem 0;
  color: var(--color-fg-light);
  font-size: 0.75rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-decoration: none;
  transition: color 160ms ease;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-toc__link:hover {
  color: var(--color-fg-deep);
}

.article-toc__link--nested {
  padding-left: 0.75rem;
  font-size: 0.72rem;
}

.article-toc__link--depth-4 {
  padding-left: 1.35rem;
  color: var(--color-fg-lighter);
}

@media (min-width: 1536px) {
  .article-toc {
    display: block;
  }
}
</style>
