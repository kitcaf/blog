<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { articleCategories, articleMetas, TIMELINE_CATEGORY } from '@/data/articles'
import { siteConfig } from '@/config/site'
import { useSeo } from '@/utils/seo'

defineOptions({ name: 'Blog' })

/**
 * Blog Index Page
 * Features category-based filtering and navigation to detailed posts
 */

const router = useRouter()
const route = useRoute()
const activeCategory = ref(TIMELINE_CATEGORY)

const categories = computed(() => [
  { label: TIMELINE_CATEGORY },
  ...articleCategories.map((label) => ({ label }))
])

// Filtering logic
const filteredPosts = computed(() => {
  if (activeCategory.value === TIMELINE_CATEGORY) {
    return articleMetas
  }

  return articleMetas.filter((post) => post.category === activeCategory.value)
})

const setCategory = (label: string) => {
  activeCategory.value = label
}

const goToDetail = (slug: string) => {
  router.push(`/blog/${slug}`)
}

useSeo({
  title: computed(() => route.path === '/blog' ? `Blog - ${siteConfig.name}` : siteConfig.name),
  description: siteConfig.description,
  path: computed(() => route.path === '/blog' ? '/blog' : '/')
})

</script>

<template>
  <div class="flex gap-24 items-start">
    <!-- Sidebar Navigation -->
          <aside class="w-48 shrink-0">
            <ul class="space-y-6">
              <li v-for="cat in categories" :key="cat.label">
                <button @click="setCategory(cat.label)"
                  class="text-sm transition-all duration-300 flex items-center gap-3 group w-full text-left"
                  :class="activeCategory === cat.label ? 'text-[var(--color-fg-deeper)] font-bold' : 'text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)]'">
                  <span v-if="activeCategory === cat.label"
                    class="w-1 h-1 rounded-full bg-[var(--color-fg-deeper)] animate-pulse"></span>
                  <span
                    :class="{ 'translate-x-4 group-hover:translate-x-5 transition-transform': activeCategory !== cat.label }">{{
                      cat.label }}</span>
                </button>
              </li>
            </ul>
          </aside>

          <!-- Blog Post List -->
          <main class="flex-1 max-w-3xl">
            <div
              class="flex text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-lighter)] mb-8 border-b border-[var(--color-fg-lightest)] pb-4 px-2">
              <span class="w-20">Date</span>
              <span class="flex-1">Title</span>
              <span class="w-32 text-right">Tags</span>
            </div>

            <!-- Nested Transition for Category Switching -->
            <Transition name="list-switch" mode="out-in">
              <div :key="activeCategory" class="space-y-1">
                <article v-for="post in filteredPosts" :key="post.slug" @click="goToDetail(post.slug)"
                  class="group flex items-center py-7 px-2 hover:bg-[var(--color-fg-lightest)]/30 rounded-xl transition-all duration-500 cursor-pointer border-b border-[var(--color-fg-lightest)]/40 last:border-0">
                  <time class="w-20 text-sm text-[var(--color-fg-light)] tabular-nums font-light">{{ post.date }}</time>
                  <h2
                    class="flex-1 text-xl text-[var(--color-fg-deep)] group-hover:text-[var(--color-fg-deeper)] group-hover:translate-x-1 transition-all duration-500">
                    {{ post.title }}
                  </h2>
                  <div
                    class="w-40 flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity duration-500">
                    <span v-for="tag in post.tags" :key="tag"
                      class="text-[9px] px-2 py-0.5 rounded-full border border-[var(--color-fg-lighter)] text-[var(--color-fg-light)] uppercase tracking-tighter">
                      {{ tag }}
                    </span>
                  </div>
                </article>

                <div v-if="filteredPosts.length === 0"
                  class="py-20 text-center text-[var(--color-fg-light)] font-light">
                  No articles found in this category.
                </div>
              </div>
            </Transition>
          </main>
  </div>
</template>

<style scoped>
/* Category list switching animation */
.list-switch-enter-active,
.list-switch-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-switch-enter-from {
  opacity: 0;
  transform: translateY(20px);
  /* Come up from below */
}

.list-switch-leave-to {
  opacity: 0;
  transform: translateY(20px);
  /* Slide down to disappear */
}
</style>
