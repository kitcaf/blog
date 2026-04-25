<script setup lang="ts">
import BlogHeader from '@/components/BlogHeader.vue'
</script>

<template>
  <div class="min-h-screen bg-[var(--color-bg)] font-sans selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-fg)] flex flex-col">
    <div class="max-w-6xl mx-auto px-8 pt-16 w-full flex-1 flex flex-col">
      <BlogHeader />
      
      <div class="relative flex-1 w-full flex flex-col">
        <div class="w-full">
          <router-view v-slot="{ Component }">
            <keep-alive include="Blog">
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
