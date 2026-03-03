<script setup lang="ts">
import { useSearch } from '@/composables/useSearch'

const { query } = useSearch()
</script>

<template>
  <div class="w-full flex-1 max-w-3xl mx-auto py-12">
    
    <div v-if="query" class="space-y-1">
      <!-- Mock results -->
      <article class="group flex items-center py-7 px-2 hover:bg-[var(--color-fg-lightest)]/30 rounded-xl transition-all duration-500 cursor-pointer border-b border-[var(--color-fg-lightest)]/40">
        <h2 class="flex-1 text-xl font-serif italic text-[var(--color-fg-deep)] group-hover:text-[var(--color-fg-deeper)] group-hover:translate-x-1 transition-all duration-500">
          Search result matching "{{ query }}"
        </h2>
        <div class="w-20 text-right opacity-60 group-hover:opacity-100 transition-opacity duration-500">
          <span class="text-[9px] px-2 py-0.5 rounded-full border border-[var(--color-fg-lighter)] text-[var(--color-fg-light)] uppercase tracking-tighter">
            MATCH
          </span>
        </div>
      </article>
      <article class="group flex items-center py-7 px-2 hover:bg-[var(--color-fg-lightest)]/30 rounded-xl transition-all duration-500 cursor-pointer border-b border-[var(--color-fg-lightest)]/40">
        <h2 class="flex-1 text-xl font-serif italic text-[var(--color-fg-deep)] group-hover:text-[var(--color-fg-deeper)] group-hover:translate-x-1 transition-all duration-500">
          Another related post
        </h2>
      </article>
    </div>
    
    <div v-else class="py-20 text-center text-[var(--color-fg-light)] font-light italic">
      Begin typing to search through all articles and projects.
    </div>
  </div>
</template>
