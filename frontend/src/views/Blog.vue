<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'Blog' })

/**
 * Blog Index Page
 * Features category-based filtering and navigation to detailed posts
 */

const router = useRouter()
const isLoading = ref(true)
const activeCategory = ref('Timeline')

const categories = ref([
  { label: 'Timeline' },
  { label: 'agent' },
  { label: 'Vue' },
  { label: 'Backend' },
  { label: 'Life' }
])

const allPosts = [
  { id: '1', date: '10.24', title: 'agent的未来是什么', tags: ['AGENT', 'AI'], cat: 'agent' },
  { id: '2', date: '09.12', title: 'Building a Custom Vue 3 Renderer', tags: ['VUE3', 'CANVAS'], cat: 'Vue' },
  { id: '3', date: '08.05', title: 'Designing Idempotent APIs in Go', tags: ['GO', 'API'], cat: 'Backend' },
  { id: '4', date: '07.22', title: 'A Deep Dive into Layout Animations', tags: ['ANIMATION', 'UX'], cat: 'Vue' },
  { id: '5', date: '06.15', title: 'PostgreSQL Performance Tuning for Analytics', tags: ['DB', 'SQL'], cat: 'Backend' },
  { id: '6', date: '05.30', title: 'Micro-frontends: The Good, The Bad, and The Ugly', tags: ['SCALE', 'TEAM'], cat: 'Vue' },
  { id: '7', date: '04.12', title: 'Implementing a RAG System from Scratch', tags: ['AI', 'LLM'], cat: 'agent' },
  { id: '8', date: '03.08', title: 'My 2025 Setup: Hardware & Software', tags: ['SETUP', 'TOOLS'], cat: 'Life' },
  { id: '9', date: '03.08', title: 'My 2025 Setup: Hardware & Software', tags: ['SETUP', 'TOOLS'], cat: 'Life' },
  { id: '10', date: '03.08', title: 'My 2025 Setup: Hardware & Software', tags: ['SETUP', 'TOOLS'], cat: 'Life' },
  { id: '11', date: '03.08', title: 'My 2025 Setup: Hardware & Software', tags: ['SETUP', 'TOOLS'], cat: 'Life' },
]

// Filtering logic
const filteredPosts = computed(() => {
  if (activeCategory.value === 'Timeline') return allPosts
  return allPosts.filter(post => post.cat === activeCategory.value)
})

const setCategory = (label: string) => {
  activeCategory.value = label
}

const goToDetail = (id: string) => {
  router.push(`/blog/${id}`)
}

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 150)
})
</script>

<template>
  <Transition name="content-fade" appear>
        <div v-if="!isLoading" class="flex gap-24 items-start" style="view-transition-name: blog-content">
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
                <article v-for="post in filteredPosts" :key="post.id" @click="goToDetail(post.id)"
                  class="group flex items-center py-7 px-2 hover:bg-[var(--color-fg-lightest)]/30 rounded-xl transition-all duration-500 cursor-pointer border-b border-[var(--color-fg-lightest)]/40 last:border-0">
                  <time class="w-20 text-sm text-[var(--color-fg-light)] tabular-nums font-light">{{ post.date }}</time>
                  <h2 :style="{ 'view-transition-name': `post-title-${post.id}` }"
                    class="flex-1 text-xl font-serif italic text-[var(--color-fg-deep)] group-hover:text-[var(--color-fg-deeper)] group-hover:translate-x-1 transition-all duration-500">
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
                  class="py-20 text-center text-[var(--color-fg-light)] font-light italic">
                  No articles found in this category.
                </div>
              </div>
            </Transition>
          </main>
        </div>
  </Transition>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

/* Base content entrance */
.content-fade-enter-active {
  transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

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
