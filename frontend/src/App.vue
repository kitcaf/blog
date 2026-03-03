<script setup lang="ts">
// App 根组件
</script>
<template>
  <div class="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg-deep)] transition-colors duration-300">
    <router-view v-slot="{ Component }">
      <keep-alive include="Blog">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>
<style scoped>
</style>
