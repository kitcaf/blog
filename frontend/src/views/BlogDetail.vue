<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getArticleBySlug } from '@/data/articles'
import { siteConfig } from '@/config/site'
import { useSeo } from '@/utils/seo'

/**
 * Blog Detail Page
 * Features View Transition API for smooth title movement from index page
 */

const route = useRoute()
const router = useRouter()

const post = computed(() => getArticleBySlug(route.params.slug))

const goBack = () => {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }

  router.push('/')
}

useSeo({
  title: computed(() => post.value?.seoTitle ?? `Post not found - ${siteConfig.name}`),
  description: computed(() => post.value?.seoDescription ?? 'The requested article does not exist.'),
  path: computed(() => post.value ? `/blog/${post.value.slug}` : route.path),
  type: 'article'
})
</script>

<template>
  <main v-if="post" class="max-w-3xl mx-auto pb-24 w-full">
        
        <!-- Back Button Area -->
        <button 
          @click="goBack"
          class="flex items-center gap-2 text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)] transition-colors mb-12 group"
        >
          <span class="group-hover:-translate-x-1 transition-transform inline-block">←</span>
          <span class="text-xs font-medium tracking-tight uppercase">Back to Timeline</span>
        </button>

        <!-- Meta Info - Grey-themed as per requirements -->
        <div class="flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-lighter)] mb-6">
          <time class="tabular-nums">{{ post.date }}</time>
          <span class="w-1 h-1 rounded-full bg-[var(--color-fg-lightest)]"></span>
          <span>By {{ post.author }}</span>
          <span v-if="post.readingTime" class="w-1 h-1 rounded-full bg-[var(--color-fg-lightest)]"></span>
          <span v-if="post.readingTime">{{ post.readingTime }} min read</span>
        </div>

        <!-- Blog Title with Transition Support -->
        <h1
          class="text-4xl md:text-5xl font-serif italic text-[var(--color-fg-deeper)] leading-tight mb-16"
        >
          {{ post.title }}
        </h1>

        <p class="text-xl leading-relaxed text-[var(--color-fg)] font-light mb-12">
          {{ post.description }}
        </p>

        <!-- Content Area -->
        <article class="prose prose-neutral dark:prose-invert max-w-none">
          <div class="text-[var(--color-fg-deep)] leading-relaxed font-light text-lg space-y-8" v-html="post.content"></div>
        </article>
  </main>

  <main v-else class="max-w-3xl mx-auto pb-24 w-full">
    <button
      @click="goBack"
      class="flex items-center gap-2 text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)] transition-colors mb-12 group"
    >
      <span class="group-hover:-translate-x-1 transition-transform inline-block">←</span>
      <span class="text-xs font-medium tracking-tight uppercase">Back to Timeline</span>
    </button>

    <h1 class="text-4xl md:text-5xl font-serif italic text-[var(--color-fg-deeper)] leading-tight mb-8">
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

/* Custom styles for rendered HTML content */
:deep(p) {
  margin-bottom: 2rem;
}
</style>
