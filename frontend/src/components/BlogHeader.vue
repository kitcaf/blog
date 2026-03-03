<script setup lang="ts">
import { useSearch } from '@/composables/useSearch'

/**
 * Shared Header Component for Blog Index and Detail pages
 */

const { query } = useSearch()

const navLinks = [
  { path: '/blog', label: 'Blog' },
  { path: '/project', label: 'Project' },
  { path: '/me', label: 'Me' }
]
</script>

<template>
  <header class="flex items-end justify-between mb-24">
    <div class="w-full max-w-xl group relative" style="view-transition-name: search-input">
      <span
        class="absolute -left-6 top-1/2 -translate-y-1/2 text-[var(--color-fg-light)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">›</span>
      <input v-model="query" type="text" placeholder="Search 【ctrl + p】..."
        class="w-full bg-transparent text-xl md:text-2xl font-light text-[var(--color-fg-deep)] placeholder-[var(--color-fg-lighter)] focus:outline-none border-b border-transparent focus:border-[var(--color-fg-lightest)] transition-all duration-300 pb-2" />
    </div>

    <nav class="flex items-center gap-8 text-sm font-medium" style="view-transition-name: nav-links">
      <router-link v-for="link in navLinks" :key="link.label" :to="link.path" class="transition-colors duration-200"
        :class="$route.path.startsWith(link.path) ? 'text-[var(--color-fg-deeper)] font-bold' : 'text-[var(--color-fg-light)] hover:text-[var(--color-fg-deeper)]'">
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
</template>
