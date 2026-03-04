<script setup lang="ts">
import SearchInput from '@/components/SearchInput.vue'
import { useSearch } from '@/composables/useSearch'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import { useDark, useToggle } from '@vueuse/core'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

/**
 * Minimalist Homepage
 * - Default: 2×3 grid of recent posts below the search bar
 * - Searching: inline filtered list replaces the grid
 */

const isDark = useDark()
const toggleDark = useToggle(isDark)
const router = useRouter()

const { query, isSearchFocused, handleSearch } = useSearch()

const onSearch = () => {
  if (query.value.trim()) handleSearch()
}

useKeyboardShortcut('/', () => {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement
  input?.focus()
})

const navLinks = [
  { path: '/blog', label: 'blog' },
  { path: '/project', label: 'project' },
  { path: '/me', label: 'me' }
]

// ── Data (replace with API calls later) ──────────────────────────────────
const allPosts = [
  { id: '1',  date: '10.24', title: 'agent的未来是什么',                                tags: ['AGENT', 'AI'],        cat: 'agent'   },
  { id: '2',  date: '09.12', title: 'Building a Custom Vue 3 Renderer',                 tags: ['VUE3', 'CANVAS'],     cat: 'Vue'     },
  { id: '3',  date: '08.05', title: 'Designing Idempotent APIs in Go',                  tags: ['GO', 'API'],          cat: 'Backend' },
  { id: '4',  date: '07.22', title: 'A Deep Dive into Layout Animations',               tags: ['ANIMATION', 'UX'],    cat: 'Vue'     },
  { id: '5',  date: '06.15', title: 'PostgreSQL Performance Tuning for Analytics',      tags: ['DB', 'SQL'],          cat: 'Backend' },
  { id: '6',  date: '05.30', title: 'Micro-frontends: The Good, The Bad, and The Ugly', tags: ['SCALE', 'TEAM'],      cat: 'Vue'     },
  { id: '7',  date: '04.12', title: 'Implementing a RAG System from Scratch',           tags: ['AI', 'LLM'],          cat: 'agent'   },
  { id: '8',  date: '03.08', title: 'My 2025 Setup: Hardware & Software',               tags: ['SETUP', 'TOOLS'],     cat: 'Life'    },
]

// 2 rows × 3 cols = 6 most recent posts
const recentPosts = allPosts.slice(0, 6)

// Live filter while typing
const filteredPosts = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allPosts
  return allPosts.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q)) ||
    p.cat.toLowerCase().includes(q)
  )
})

const isSearching = computed(() => !!(query.value || isSearchFocused.value))

const goTo = (id: string) => router.push(`/blog/${id}`)
</script>

<template>
  <div class="min-h-screen bg-[var(--color-bg)] font-sans flex flex-col items-center relative" style="padding-top: 28vh">

    <main class="w-full max-w-4xl px-8 flex flex-col items-center animate-in fade-in duration-1000">

      <!-- Search Input -->
      <div class="w-full mb-6" style="view-transition-name: search-input">
        <SearchInput v-model="query" @search="onSearch" variant="large" placeholder="Search or command..." />
      </div>

      <!-- Inline Navigation Links -->
      <nav
        class="w-full flex flex-wrap items-center justify-end gap-6 text-sm font-medium text-[var(--color-fg-light)]"
        style="view-transition-name: nav-links"
      >
        <router-link v-for="link in navLinks" :key="link.label" :to="link.path"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200">
          {{ link.label }}
        </router-link>

        <a href="https://github.com/your-username" target="_blank" rel="noopener noreferrer"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200 flex items-center"
          aria-label="GitHub">
          <svg viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor"
              d="M10.07 20.503a1 1 0 0 0-1.18-.983c-1.31.24-2.963.276-3.402-.958a5.7 5.7 0 0 0-1.837-2.415a1 1 0 0 1-.167-.11a1 1 0 0 0-.93-.645h-.005a1 1 0 0 0-1 .995c-.004.815.81 1.338 1.141 1.514a4.4 4.4 0 0 1 .924 1.36c.365 1.023 1.423 2.576 4.466 2.376l.003.098l.004.268a1 1 0 0 0 2 0l-.005-.318c-.005-.19-.012-.464-.012-1.182M20.737 5.377q.049-.187.09-.42a6.3 6.3 0 0 0-.408-3.293a1 1 0 0 0-.615-.58c-.356-.12-1.67-.357-4.184 1.25a13.9 13.9 0 0 0-6.354 0C6.762.75 5.455.966 5.102 1.079a1 1 0 0 0-.631.584a6.3 6.3 0 0 0-.404 3.357q.037.191.079.354a6.27 6.27 0 0 0-1.256 3.83a8 8 0 0 0 .043.921c.334 4.603 3.334 5.984 5.424 6.459a5 5 0 0 0-.118.4a1 1 0 0 0 1.942.479a1.7 1.7 0 0 1 .468-.878a1 1 0 0 0-.546-1.745c-3.454-.395-4.954-1.802-5.18-4.899a7 7 0 0 1-.033-.738a4.26 4.26 0 0 1 .92-2.713a3 3 0 0 1 .195-.231a1 1 0 0 0 .188-1.025a3.4 3.4 0 0 1-.155-.555a4.1 4.1 0 0 1 .079-1.616a7.5 7.5 0 0 1 2.415 1.18a1 1 0 0 0 .827.133a11.8 11.8 0 0 1 6.173.001a1 1 0 0 0 .83-.138a7.6 7.6 0 0 1 2.406-1.19a4 4 0 0 1 .087 1.578a3.2 3.2 0 0 1-.169.607a1 1 0 0 0 .188 1.025c.078.087.155.18.224.268A4.12 4.12 0 0 1 20 9.203a7 7 0 0 1-.038.777c-.22 3.056-1.725 4.464-5.195 4.86a1 1 0 0 0-.546 1.746a1.63 1.63 0 0 1 .466.908a3 3 0 0 1 .093.82v2.333c-.01.648-.01 1.133-.01 1.356a1 1 0 1 0 2 0c0-.217 0-.692.01-1.34v-2.35a5 5 0 0 0-.155-1.311a4 4 0 0 0-.116-.416a6.51 6.51 0 0 0 5.445-6.424A9 9 0 0 0 22 9.203a6.13 6.13 0 0 0-1.263-3.826" />
          </svg>
        </a>

        <button @click="toggleDark()"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200 flex items-center"
          aria-label="Toggle Dark Mode">
          <svg viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor"
              d="M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12m0-2a4 4 0 1 0 0-8a4 4 0 0 0 0 8M11 1h2v3h-2zm0 19h2v3h-2zM3.515 4.929l1.414-1.414L7.05 5.636L5.636 7.05zM16.95 18.364l1.414-1.414l2.121 2.121l-1.414 1.414zm2.121-14.85l1.414 1.415l-2.121 2.121l-1.414-1.414zM5.636 16.95l1.414 1.414l-2.121 2.121l-1.414-1.414zM23 11v2h-3v-2zM4 11v2H1v-2z" />
          </svg>
        </button>
      </nav>

      <!-- ── Content Area: grid (default) ↔ search results (typing) ─────── -->
      <div class="w-full mt-12">

        <Transition name="panel-fade" mode="out-in">

          <!-- Default: 2 × 3 Recent Posts Grid (no grid lines) -->
          <section v-if="!isSearching" key="grid">
            <div class="grid grid-cols-3 gap-6">
              <article
                v-for="post in recentPosts"
                :key="post.id"
                @click="goTo(post.id)"
                class="post-card group cursor-pointer flex flex-col gap-3 px-4 py-5 rounded-xl"
              >
                <!-- Date · Category -->
                <time class="text-[9px] uppercase tracking-[0.2em] text-[var(--color-fg-lighter)] tabular-nums">
                  {{ post.date }}&ensp;·&ensp;{{ post.cat }}
                </time>

                <!-- Title -->
                <h2 class="font-serif italic leading-snug text-[var(--color-fg-deep)] text-[0.95rem]
                            group-hover:text-[var(--color-fg-deeper)] transition-colors duration-300">
                  {{ post.title }}
                </h2>

                <!-- Tags -->
                <div class="flex flex-wrap gap-1.5 mt-auto pt-1">
                  <span
                    v-for="tag in post.tags" :key="tag"
                    class="text-[8.5px] px-1.5 py-px tracking-wider uppercase text-[var(--color-fg-lighter)]">
                    {{ tag }}
                  </span>
                </div>
              </article>
            </div>
          </section>

          <!-- Searching: live-filtered list -->
          <section v-else key="list">
            <div v-if="filteredPosts.length" class="space-y-0">
              <article
                v-for="post in filteredPosts"
                :key="post.id"
                @click="goTo(post.id)"
                class="group flex items-center py-5 px-2 cursor-pointer
                       border-b border-[var(--color-fg-lightest)]/50 last:border-0
                       hover:bg-[var(--color-fg-lightest)]/25 rounded-lg transition-colors duration-300"
              >
                <time class="w-14 shrink-0 text-xs text-[var(--color-fg-lighter)] tabular-nums font-light">
                  {{ post.date }}
                </time>
                <h2 class="flex-1 text-lg font-serif italic text-[var(--color-fg-deep)]
                            group-hover:text-[var(--color-fg-deeper)] group-hover:translate-x-0.5
                            transition-all duration-300">
                  {{ post.title }}
                </h2>
                <div class="flex gap-1.5 ml-4 opacity-50 group-hover:opacity-90 transition-opacity duration-300">
                  <span
                    v-for="tag in post.tags" :key="tag"
                    class="text-[9px] px-2 py-0.5 rounded-full border border-[var(--color-fg-lighter)]
                           text-[var(--color-fg-light)] uppercase tracking-tighter">
                    {{ tag }}
                  </span>
                </div>
              </article>
            </div>

            <!-- No results -->
            <p v-else class="py-16 text-center text-sm text-[var(--color-fg-lighter)] font-light italic">
              No articles found for "{{ query }}"
            </p>
          </section>

        </Transition>
      </div>

    </main>
  </div>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}

/* Grid card hover — no borders, just a whisper of background */
.post-card {
  transition: background-color 0.25s ease;
}
.post-card:hover {
  background-color: color-mix(in srgb, var(--color-fg-lightest) 50%, transparent);
}

/* Panel switch: grid ↔ list */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity  0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.panel-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
