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
      
      <div class="relative flex-1 w-full flex flex-col">
        <!-- 基础内容区域 (路由内容), 使用 CSS 控制透明度和位移而不是 v-if 以便精准保留 keep-alive 的 DOM 状态和内存缓存 -->
        <div 
          class="w-full transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          :class="(query || isSearchFocused) ? 'opacity-0 translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'"
        >
          <router-view v-slot="{ Component }">
            <keep-alive include="Blog">
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </div>

        <!-- 搜索结果覆盖区域 -->
        <Transition name="fade-slide-up">
          <div v-show="query || isSearchFocused" class="absolute inset-0 w-full z-20 bg-[var(--color-bg)] pb-24">
            <SearchResults />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-up-enter-active,
.fade-slide-up-leave-active {
  transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.fade-slide-up-enter-from,
.fade-slide-up-leave-to {
  opacity: 0;
  transform: translateY(30px);
}
</style>
