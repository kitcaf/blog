<script setup lang="ts">
import SearchInput from '@/components/SearchInput.vue'
import { useSearch } from '@/composables/useSearch'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import { useDark, useToggle } from '@vueuse/core'

/**
 * Minimalist Homepage component
 * Features a large, centered search input with simple category links
 */

const isDark = useDark()
const toggleDark = useToggle(isDark)

const { query, handleSearch } = useSearch()

const onSearch = () => {
  if (query.value.trim()) {
    handleSearch()
  }
}

// Focus search input on shortcut
useKeyboardShortcut('/', () => {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement
  if (input) {
    input.focus()
  }
})

/**
 * Inline navigation links
 */
const navLinks = [
  { path: '/blog', label: 'blog' },
  { path: '/project', label: 'project' },
  { path: '/me', label: 'me' }
]
</script>

<template>
  <div class="min-h-screen bg-[var(--color-bg)] font-sans flex flex-col items-center justify-center relative">

    <!-- Main Centered Content -->
    <main class="w-full max-w-4xl px-8 flex flex-col items-center animate-in fade-in duration-1000">

      <!-- Search Input -->
      <div class="w-full mb-6" style="view-transition-name: search-input">
        <SearchInput v-model="query" @search="onSearch" placeholder="Search or command..." />
      </div>
      <!-- Inline Navigation Links -->
      <nav
        class="w-full flex flex-wrap items-center justify-end gap-6 text-sm font-medium text-[var(--color-fg-light)]"
        style="view-transition-name: nav-links">
        <router-link v-for="link in navLinks" :key="link.label" :to="link.path"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200">
          {{ link.label }}
        </router-link>

        <a href="https://github.com/your-username" target="_blank" rel="noopener noreferrer"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200 flex items-center"
          aria-label="GitHub">
          <svg viewBox='0 0 24 24' display='inline-block' height='1.2em' width='1.2em' vertical-align='text-bottom'
            xmlns='http://www.w3.org/2000/svg'>
            <path fill='currentColor'
              d='M10.07 20.503a1 1 0 0 0-1.18-.983c-1.31.24-2.963.276-3.402-.958a5.7 5.7 0 0 0-1.837-2.415a1 1 0 0 1-.167-.11a1 1 0 0 0-.93-.645h-.005a1 1 0 0 0-1 .995c-.004.815.81 1.338 1.141 1.514a4.4 4.4 0 0 1 .924 1.36c.365 1.023 1.423 2.576 4.466 2.376l.003.098l.004.268a1 1 0 0 0 2 0l-.005-.318c-.005-.19-.012-.464-.012-1.182M20.737 5.377q.049-.187.09-.42a6.3 6.3 0 0 0-.408-3.293a1 1 0 0 0-.615-.58c-.356-.12-1.67-.357-4.184 1.25a13.9 13.9 0 0 0-6.354 0C6.762.75 5.455.966 5.102 1.079a1 1 0 0 0-.631.584a6.3 6.3 0 0 0-.404 3.357q.037.191.079.354a6.27 6.27 0 0 0-1.256 3.83a8 8 0 0 0 .043.921c.334 4.603 3.334 5.984 5.424 6.459a5 5 0 0 0-.118.4a1 1 0 0 0 1.942.479a1.7 1.7 0 0 1 .468-.878a1 1 0 0 0-.546-1.745c-3.454-.395-4.954-1.802-5.18-4.899a7 7 0 0 1-.033-.738a4.26 4.26 0 0 1 .92-2.713a3 3 0 0 1 .195-.231a1 1 0 0 0 .188-1.025a3.4 3.4 0 0 1-.155-.555a4.1 4.1 0 0 1 .079-1.616a7.5 7.5 0 0 1 2.415 1.18a1 1 0 0 0 .827.133a11.8 11.8 0 0 1 6.173.001a1 1 0 0 0 .83-.138a7.6 7.6 0 0 1 2.406-1.19a4 4 0 0 1 .087 1.578a3.2 3.2 0 0 1-.169.607a1 1 0 0 0 .188 1.025c.078.087.155.18.224.268A4.12 4.12 0 0 1 20 9.203a7 7 0 0 1-.038.777c-.22 3.056-1.725 4.464-5.195 4.86a1 1 0 0 0-.546 1.746a1.63 1.63 0 0 1 .466.908a3 3 0 0 1 .093.82v2.333c-.01.648-.01 1.133-.01 1.356a1 1 0 1 0 2 0c0-.217 0-.692.01-1.34v-2.35a5 5 0 0 0-.155-1.311a4 4 0 0 0-.116-.416a6.51 6.51 0 0 0 5.445-6.424A9 9 0 0 0 22 9.203a6.13 6.13 0 0 0-1.263-3.826' />
          </svg>
        </a>

        <button @click="toggleDark()"
          class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200 flex items-center"
          aria-label="Toggle Dark Mode">
          <svg viewBox='0 0 24 24' display='inline-block' height='1.2em' width='1.2em' vertical-align='text-bottom'
            xmlns='http://www.w3.org/2000/svg'>
            <path fill='currentColor'
              d='M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12m0-2a4 4 0 1 0 0-8a4 4 0 0 0 0 8M11 1h2v3h-2zm0 19h2v3h-2zM3.515 4.929l1.414-1.414L7.05 5.636L5.636 7.05zM16.95 18.364l1.414-1.414l2.121 2.121l-1.414 1.414zm2.121-14.85l1.414 1.415l-2.121 2.121l-1.414-1.414zM5.636 16.95l1.414 1.414l-2.121 2.121l-1.414-1.414zM23 11v2h-3v-2zM4 11v2H1v-2z' />
          </svg>
        </button>
      </nav>

    </main>
  </div>
</template>

<style scoped>
/* No extra styles needed, Tailwind handles everything */
</style>
