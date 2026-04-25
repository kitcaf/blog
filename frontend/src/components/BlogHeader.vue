<script setup lang="ts">
import { useThemeToggle } from '@/composables/useThemeToggle'
import { useRoute } from 'vue-router'

/**
 * Shared Header Component for Blog Index and Detail pages
 */

const route = useRoute()
const { toggleTheme } = useThemeToggle()

const navLinks = [
  { path: '/', label: 'Blog' },
  { path: '/project', label: 'Project' },
  { path: '/me', label: 'Me' }
]

const isActiveLink = (path: string) => {
  if (path === '/') {
    return route.path === '/' || route.path.startsWith('/blog')
  }

  return route.path.startsWith(path)
}
</script>

<template>
  <header class="flex items-center justify-between mb-24">
    <router-link
      to="/"
      class="font-serif italic text-2xl text-[var(--color-fg-deeper)] transition-colors duration-200"
    >
      kitcaf
    </router-link>

    <nav class="flex items-center gap-8 text-sm font-medium" style="view-transition-name: nav-links">
      <router-link v-for="link in navLinks" :key="link.label" :to="link.path" class="transition-colors duration-200"
        :class="isActiveLink(link.path) ? 'text-[var(--color-fg-deeper)] font-bold' : 'text-[var(--color-fg-light)] hover:text-[var(--color-fg-deeper)]'">
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
        <button @click="toggleTheme" class="hover:text-[var(--color-fg-deeper)] transition-colors duration-200 flex items-center cursor-pointer"
          aria-label="Toggle Dark Mode">
          <svg viewBox='0 0 24 24' display='inline-block' height='1.2em' width='1.2em' vertical-align='text-bottom'
            xmlns='http://www.w3.org/2000/svg'>
            <path fill='currentColor'
              d='M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12m0-2a4 4 0 1 0 0-8a4 4 0 0 0 0 8M11 1h2v3h-2zm0 19h2v3h-2zM3.515 4.929l1.414-1.414L7.05 5.636L5.636 7.05zM16.95 18.364l1.414-1.414l2.121 2.121l-1.414 1.414zm2.121-14.85l1.414 1.415l-2.121 2.121l-1.414-1.414zM5.636 16.95l1.414 1.414l-2.121 2.121l-1.414-1.414zM23 11v2h-3v-2zM4 11v2H1v-2z' />
          </svg>
        </button>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.font-serif {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", "Cambria", serif;
}
</style>
