<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSearch } from '@/composables/useSearch'

/**
 * Blog Index Page
 * Displays a categorized list of blog posts with a minimal header
 */

const { query } = useSearch()
const isLoading = ref(true)

const navLinks = [
  { path: '/blog', label: 'Blog' },
  { path: '/project', label: 'Project' },
  { path: '/me', label: 'Me' }
]

const categories = [
  { label: 'Timeline', active: true },
  { label: 'agent', active: false },
  { label: 'Vue', active: false },
  { label: 'Backend', active: false },
  { label: 'Life', active: false }
]

const posts = [
  { date: '10.24', title: 'agent的未来是什么', tags: ['REACT', 'RSC'] },
  { date: '09.12', title: 'Building a Custom Vue 3 Renderer', tags: ['VUE3', 'CANVAS'] },
  { date: '08.05', title: 'Designing Idempotent APIs in Go', tags: ['GO', 'API'] },
  { date: '07.22', title: 'A Deep Dive into Layout Animations', tags: ['ANIMATION', 'UX'] },
  { date: '06.15', title: 'PostgreSQL Performance Tuning for Analytics', tags: ['DB', 'SQL'] },
  { date: '05.30', title: 'Micro-frontends: The Good, The Bad, and The Ugly', tags: ['SCALE', 'TEAM'] },
  { date: '04.12', title: 'Implementing a RAG System from Scratch', tags: ['AI', 'LLM'] },
  { date: '03.08', title: 'My 2025 Setup: Hardware & Software', tags: ['SETUP', 'TOOLS'] }
]

onMounted(() => {
  // Use a small timeout to let the View Transition finish its main morphing
  // before we show the blog content, avoiding the "double refresh" look.
  setTimeout(() => {
    isLoading.value = false
  }, 150)
})
</script>

<template>
  <div
    class="min-h-screen bg-[var(--color-bg)] font-sans selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-fg)]">
    <div class="max-w-6xl mx-auto px-8 pt-16">

      <!-- Header Section: Search + Nav -->
      <header class="flex items-end justify-between mb-24">
        <div class="w-full max-w-xl group relative" style="view-transition-name: search-input">
          <span
            class="absolute -left-6 top-1/2 -translate-y-1/2 text-[var(--color-fg-light)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">›</span>
          <input v-model="query" type="text" placeholder="Search articles, projects, or Ask AI..."
            class="w-full bg-transparent text-xl md:text-2xl font-light text-[var(--color-fg-deep)] placeholder-[var(--color-fg-lighter)] focus:outline-none border-b border-transparent focus:border-[var(--color-fg-lightest)] transition-all duration-300 pb-2" />
        </div>

        <nav class="flex items-center gap-8 text-sm font-medium" style="view-transition-name: nav-links">
          <router-link v-for="link in navLinks" :key="link.label" :to="link.path" class="transition-colors duration-200"
            :class="link.path === '/blog' ? 'text-[var(--color-fg-deeper)] font-bold' : 'text-[var(--color-fg-light)] hover:text-[var(--color-fg-deeper)]'">
            {{ link.label }}
          </router-link>

          <div class="flex items-center gap-4 text-[var(--color-fg-light)] ml-2">
            <a href="#" class="hover:text-[var(--color-fg-deeper)] transition-colors"><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                stroke-linejoin="round">
                <path
                  d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22">
                </path>
              </svg></a>
            <a href="#" class="hover:text-[var(--color-fg-deeper)] transition-colors"><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                stroke-linejoin="round">
                <path
                  d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z">
                </path>
              </svg></a>
          </div>
        </nav>
      </header>

      <Transition name="content-fade">
        <div v-if="!isLoading" class="flex gap-24 items-start" style="view-transition-name: blog-content">
          <!-- Sidebar Navigation -->
          <aside class="w-48 shrink-0">
            <ul class="space-y-6">
              <li v-for="cat in categories" :key="cat.label">
                <a href="#" class="text-sm transition-all duration-300 flex items-center gap-3 group"
                  :class="cat.active ? 'text-[var(--color-fg-deeper)] font-bold' : 'text-[var(--color-fg-light)] hover:text-[var(--color-fg-deep)]'">
                  <span v-if="cat.active" class="w-1 h-1 rounded-full bg-[var(--color-fg-deeper)] animate-pulse"></span>
                  <span :class="{ 'translate-x-4 group-hover:translate-x-5 transition-transform': !cat.active }">{{
                    cat.label }}</span>
                </a>
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

            <div class="space-y-1">
              <article v-for="post in posts" :key="post.title"
                class="group flex items-center py-7 px-2 hover:bg-[var(--color-fg-lightest)]/30 rounded-xl transition-all duration-500 cursor-pointer border-b border-[var(--color-fg-lightest)]/40 last:border-0">
                <time class="w-20 text-sm text-[var(--color-fg-light)] tabular-nums font-light">{{ post.date }}</time>
                <h2
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
            </div>
          </main>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

/* Coordinated content entrance */
.content-fade-enter-active {
  transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
</style>
