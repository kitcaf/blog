<script setup lang="ts">
import BlogHeader from '@/components/BlogHeader.vue'
import SearchResults from '@/components/SearchResults.vue'
import { useSearch } from '@/composables/useSearch'

const { query, isSearchFocused } = useSearch()
</script>

<template>
  <div class="min-h-screen bg-[var(--color-bg)] font-sans selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-fg)] flex flex-col">
    <div class="max-w-6xl mx-auto px-8 pt-16 w-full flex-1 flex flex-col">
      <BlogHeader />
      
      <div class="relative flex-1 flex flex-col overflow-hidden">
        <Transition name="fade-slide-up" mode="out-in">
          <SearchResults v-if="query || isSearchFocused" />
          <div v-else class="flex-1 w-full flex flex-col">
            <router-view v-slot="{ Component }">
              <keep-alive include="Blog">
                <component :is="Component" />
              </keep-alive>
            </router-view>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-up-enter-active,
.fade-slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-up-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.fade-slide-up-leave-to {
  opacity: 0;
  transform: translateY(30px);
}
</style>
