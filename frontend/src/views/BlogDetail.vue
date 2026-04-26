<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { renderMarkdown } from '@blog/markdown-renderer'
import type { RenderedMarkdown } from '@blog/markdown-renderer'
import { getArticleBySlug, getArticleExcerpt } from '@/data/articles'
import { siteConfig } from '@/config/site'
import { useSeo } from '@/utils/seo'

/**
 * Blog Detail Page
 * Features View Transition API for smooth title movement from index page
 */

const route = useRoute()
const router = useRouter()
const emptyRenderedMarkdown: RenderedMarkdown = { html: '', toc: [] }

const post = computed(() => getArticleBySlug(route.params.slug))
const renderedMarkdown = shallowRef<RenderedMarkdown>(emptyRenderedMarkdown)
let renderRequestId = 0

const renderCurrentPostMarkdown = async () => {
  const requestId = renderRequestId + 1
  renderRequestId = requestId

  const currentPost = post.value
  const nextRenderedMarkdown = currentPost
    ? await renderMarkdown({ markdown: currentPost.contentMarkdown })
    : emptyRenderedMarkdown

  if (requestId === renderRequestId) {
    renderedMarkdown.value = nextRenderedMarkdown
  }
}

await renderCurrentPostMarkdown()

watch(
  () => post.value?.contentMarkdown,
  async () => {
    await renderCurrentPostMarkdown()
  }
)

const renderedContentHtml = computed(() => renderedMarkdown.value.html)
const tocItems = computed(() => renderedMarkdown.value.toc.filter((item) => item.depth <= 3))
const hasToc = computed(() => tocItems.value.length > 0)
const articleMetaDescription = computed(() => {
  return post.value ? getArticleExcerpt(post.value) : 'The requested article does not exist.'
})

const goBack = () => {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }

  router.push('/')
}

useSeo({
  title: computed(() => post.value?.title ?? `Post not found - ${siteConfig.name}`),
  description: articleMetaDescription,
  path: computed(() => post.value ? `/blog/${post.value.slug}` : route.path),
  type: 'article'
})
</script>

<template>
  <main v-if="post" class="w-full pb-24">
    <div class="lg:grid lg:grid-cols-[minmax(0,46rem)_14rem] lg:items-start lg:gap-16">
      <div class="min-w-0">
        <button @click="goBack"
          class="group mb-12 flex items-center gap-2 text-[var(--color-fg-light)] transition-colors hover:text-[var(--color-fg-deep)]">
          <span class="inline-block transition-transform group-hover:-translate-x-1">←</span>
          <span class="text-xs font-medium tracking-tight uppercase">Back to Timeline</span>
        </button>

        <div class="mb-6 flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-lighter)]">
          <time class="tabular-nums">{{ post.date }}</time>
          <span class="h-1 w-1 rounded-full bg-[var(--color-fg-lightest)]"></span>
          <span>By {{ post.author }}</span>
        </div>

        <h1 class="mb-8 text-4xl leading-tight font-serif text-[var(--color-fg-deeper)] md:text-5xl">
          {{ post.title }}
        </h1>

        <nav v-if="hasToc" class="mb-10 border-y border-[var(--color-fg-lightest)] py-4 lg:hidden" aria-label="Article contents">
          <details>
            <summary class="flex cursor-pointer list-none items-center justify-between text-xs font-medium tracking-[0.18em] text-[var(--color-fg-light)] uppercase">
              <span>Contents</span>
              <span aria-hidden="true">＋</span>
            </summary>
            <ol class="mt-4 space-y-2">
              <li v-for="item in tocItems" :key="item.id">
                <a
                  :href="`#${item.id}`"
                  class="block text-sm leading-6 text-[var(--color-fg)] transition-colors hover:text-[var(--color-fg-deeper)]"
                  :class="{ 'pl-4': item.depth === 3 }"
                >
                  {{ item.text }}
                </a>
              </li>
            </ol>
          </details>
        </nav>

        <article class="markdown-prose" v-html="renderedContentHtml"></article>
      </div>

      <aside v-if="hasToc" class="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto pt-24 lg:block" aria-label="Article contents">
        <p class="mb-4 text-[10px] font-medium tracking-[0.2em] text-[var(--color-fg-lighter)] uppercase">
          Contents
        </p>
        <ol class="space-y-2 border-l border-[var(--color-fg-lightest)] pl-4">
          <li v-for="item in tocItems" :key="item.id">
            <a
              :href="`#${item.id}`"
              class="block text-xs leading-5 text-[var(--color-fg-light)] transition-colors hover:text-[var(--color-fg-deep)]"
              :class="{ 'pl-3': item.depth === 3 }"
            >
              {{ item.text }}
            </a>
          </li>
        </ol>
      </aside>
    </div>
  </main>

  <main v-else class="max-w-3xl mx-auto pb-24 w-full">
    <button @click="goBack"
      class="flex items-center gap-2 text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)] transition-colors mb-12 group">
      <span class="group-hover:-translate-x-1 transition-transform inline-block">←</span>
      <span class="text-xs font-medium tracking-tight uppercase">Back to Timeline</span>
    </button>

    <h1 class="text-4xl md:text-5xl font-serif text-[var(--color-fg-deeper)] leading-tight mb-8">
      Article not found
    </h1>
    <p class="text-lg leading-relaxed text-[var(--color-fg)] font-light">
      This article does not exist in the local SSG article data.
    </p>
  </main>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

summary::-webkit-details-marker {
  display: none;
}
</style>
